import fs from "node:fs";
import path from "node:path";
import { imageSizeFromFile } from "image-size/fromFile";
import type { OpenGraphImageConfig, OpenGraphImageMetadata, OpenGraphMetadata } from "./schemas/index.js";

/**
 * MIME type mappings for common image formats.
 * Used to determine the `og:image:type` meta tag value.
 */
const IMAGE_MIME_TYPES: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	webp: "image/webp",
	svg: "image/svg+xml",
};

/**
 * Resolves Open Graph image configurations into fully-qualified metadata.
 *
 * This class handles the conversion of flexible OG image configuration formats
 * (strings or metadata objects) into complete `OpenGraphImageMetadata` objects
 * with resolved URLs and auto-detected dimensions for local images.
 *
 * @remarks
 * The resolver supports two input formats:
 * - **String format**: A URL or path that will be resolved and optionally enhanced
 *   with auto-detected dimensions if pointing to a local file.
 * - **Object format**: Detailed metadata with explicit properties that will be
 *   validated and URL-resolved.
 *
 * @example Basic usage with a relative path
 * ```typescript
 * const resolver = new OpenGraphResolver({
 *   siteUrl: "https://example.com",
 *   docsRoot: "/path/to/docs"
 * });
 *
 * const metadata = await resolver.resolve(
 *   "/images/og-api.png",
 *   "my-package",
 *   "MyClass"
 * );
 * // Result: { url: "https://example.com/images/og-api.png", width: 1200, height: 630, ... }
 * ```
 *
 * @example Using detailed configuration
 * ```typescript
 * const metadata = await resolver.resolve(
 *   {
 *     url: "/images/og.png",
 *     alt: "Custom alt text",
 *     width: 1200,
 *     height: 630
 *   },
 *   "my-package"
 * );
 * ```
 */
export class OpenGraphResolver {
	private readonly siteUrl: string;
	private readonly docsRoot?: string;

	/**
	 * Creates a new OpenGraphResolver instance.
	 *
	 * @param options - Configuration options for the resolver
	 * @param options.siteUrl - Base URL for the website (e.g., "https://example.com").
	 *   Used to construct absolute URLs from relative paths.
	 * @param options.docsRoot - Optional root directory for documentation files.
	 *   When provided, enables auto-detection of image dimensions for local files
	 *   by looking in the `public` subdirectory.
	 */
	constructor(options: { siteUrl: string; docsRoot?: string }) {
		this.siteUrl = options.siteUrl;
		if (options.docsRoot != null) {
			this.docsRoot = options.docsRoot;
		}
	}

	/**
	 * Resolves an Open Graph image configuration into complete metadata.
	 *
	 * Handles both string URLs/paths and detailed metadata objects, converting them
	 * into fully-qualified `OpenGraphImageMetadata` with absolute URLs.
	 *
	 * @param config - The OG image configuration to resolve. Can be:
	 *   - A string URL (absolute or relative path starting with `/`)
	 *   - An `OpenGraphImageMetadata` object with explicit properties
	 *   - `undefined` to indicate no OG image
	 * @param packageName - The package name for generating default alt text
	 * @param apiName - Optional API name for more descriptive alt text
	 * @returns Resolved metadata with absolute URLs, or `undefined` if:
	 *   - `config` is `undefined`
	 *   - The URL format is invalid
	 *
	 * @example Resolve a relative path
	 * ```typescript
	 * const metadata = await resolver.resolve("/images/og.png", "my-lib");
	 * // Returns: { url: "https://example.com/images/og.png", alt: "my-lib API Documentation", ... }
	 * ```
	 *
	 * @example Resolve an absolute URL
	 * ```typescript
	 * const metadata = await resolver.resolve("https://cdn.example.com/og.png", "my-lib");
	 * // Returns: { url: "https://cdn.example.com/og.png", alt: "my-lib API Documentation" }
	 * ```
	 */
	public async resolve(
		config: OpenGraphImageConfig | undefined,
		packageName: string,
		apiName?: string,
	): Promise<OpenGraphImageMetadata | undefined> {
		if (!config) {
			return undefined;
		}

		if (typeof config === "object") {
			return this.resolveFromMetadata(config, packageName, apiName);
		}

		return this.resolveFromString(config, packageName, apiName);
	}

	/**
	 * Resolves a metadata object configuration into complete OG image metadata.
	 *
	 * Validates and resolves URLs in the provided metadata object, ensuring all
	 * URLs are absolute and properly formatted.
	 *
	 * @param metadata - The metadata object containing OG image properties
	 * @param packageName - Package name for default alt text generation
	 * @param apiName - Optional API name for more descriptive alt text
	 * @returns Resolved metadata with absolute URLs, or `undefined` if URL is invalid
	 */
	private async resolveFromMetadata(
		metadata: OpenGraphImageMetadata,
		packageName: string,
		apiName?: string,
	): Promise<OpenGraphImageMetadata | undefined> {
		const { url, secureUrl, type, width, height, alt } = metadata;

		// Resolve the main URL
		const resolvedUrl = this.resolveUrl(url);
		if (!resolvedUrl) {
			console.warn(`[og-resolver] Invalid ogImage URL format: "${url}"`);
			return undefined;
		}

		// Resolve secure URL if provided
		let resolvedSecureUrl: string | undefined;
		if (secureUrl) {
			if (secureUrl.startsWith("https://")) {
				resolvedSecureUrl = secureUrl;
			} else {
				console.warn(`[og-resolver] ogImage secureUrl must be an absolute HTTPS URL: "${secureUrl}"`);
			}
		}

		return {
			url: resolvedUrl,
			secureUrl: resolvedSecureUrl,
			type,
			width,
			height,
			alt: alt ?? this.generateAltText(packageName, apiName),
		};
	}

	/**
	 * Resolves a string URL/path into complete OG image metadata.
	 *
	 * For relative paths pointing to local files, this method will attempt to:
	 * 1. Locate the file in the docs `public` directory
	 * 2. Read the image dimensions using `image-size`
	 * 3. Determine the MIME type from the file extension
	 *
	 * @param imageUrl - The image URL or path to resolve
	 * @param packageName - Package name for alt text generation
	 * @param apiName - Optional API name for more descriptive alt text
	 * @returns Resolved metadata with auto-detected dimensions for local files,
	 *   or `undefined` if the URL format is invalid
	 */
	private async resolveFromString(
		imageUrl: string,
		packageName: string,
		apiName?: string,
	): Promise<OpenGraphImageMetadata | undefined> {
		// Resolve URL
		const resolvedUrl = this.resolveUrl(imageUrl);
		if (!resolvedUrl) {
			console.warn(
				`[og-resolver] Invalid ogImage format: "${imageUrl}" (must be absolute URL or path starting with /)`,
			);
			return undefined;
		}

		// Try to find and analyze local image
		const localPath = this.findLocalImage(imageUrl);
		const dimensions = localPath ? await this.readImageDimensions(localPath) : undefined;

		return {
			url: resolvedUrl,
			type: dimensions?.type,
			width: dimensions?.width,
			height: dimensions?.height,
			alt: this.generateAltText(packageName, apiName),
		};
	}

	/**
	 * Resolves a URL string to an absolute URL.
	 *
	 * @param url - The URL to resolve (absolute URL or relative path)
	 * @returns The absolute URL, or `undefined` if the format is invalid
	 */
	private resolveUrl(url: string): string | undefined {
		if (url.startsWith("http://") || url.startsWith("https://")) {
			return url;
		}

		if (url.startsWith("/")) {
			return `${this.siteUrl}${url}`;
		}

		return undefined;
	}

	/**
	 * Attempts to find a local image file in the docs public directory.
	 *
	 * @param imagePath - The relative image path (starting with `/`)
	 * @returns The absolute file path if found, or `undefined` if not found
	 *   or if `docsRoot` is not configured
	 */
	private findLocalImage(imagePath: string): string | undefined {
		if (!this.docsRoot || !imagePath.startsWith("/")) {
			return undefined;
		}

		const publicPath = path.join(this.docsRoot, "public", imagePath);
		if (fs.existsSync(publicPath)) {
			return publicPath;
		}

		return undefined;
	}

	/**
	 * Reads image dimensions and type from a local file.
	 *
	 * @param filePath - Absolute path to the image file
	 * @returns Object containing width, height, and MIME type if successful,
	 *   or `undefined` if the file cannot be read or analyzed
	 */
	private async readImageDimensions(
		filePath: string,
	): Promise<{ width?: number; height?: number; type?: string } | undefined> {
		try {
			const dimensions = await imageSizeFromFile(filePath);

			let mimeType: string | undefined;
			if (dimensions.type) {
				mimeType = IMAGE_MIME_TYPES[dimensions.type.toLowerCase()];
			}

			return {
				width: dimensions.width,
				height: dimensions.height,
				...(mimeType != null ? { type: mimeType } : {}),
			};
		} catch (error) {
			console.warn(`[og-resolver] Failed to read image dimensions from ${filePath}:`, (error as Error).message);
			return undefined;
		}
	}

	/**
	 * Generates descriptive alt text for the OG image.
	 *
	 * @param packageName - The package name
	 * @param apiName - Optional API name for more specific text
	 * @returns Generated alt text string
	 */
	private generateAltText(packageName: string, apiName?: string): string {
		if (apiName) {
			return `${apiName} - ${packageName} API Documentation`;
		}
		return `${packageName} API Documentation`;
	}

	/**
	 * Creates complete Open Graph metadata for an API documentation page.
	 *
	 * This static factory method builds a complete `OpenGraphMetadata` object
	 * suitable for inclusion in page frontmatter, combining resolved image
	 * metadata with article-specific information.
	 *
	 * @param options - Configuration for the OG metadata
	 * @param options.siteUrl - Base URL for the website
	 * @param options.pageRoute - Route path for this page (e.g., "/api/classes/foo")
	 * @param options.description - Page description for `og:description`
	 * @param options.publishedTime - ISO 8601 timestamp when page was first created
	 * @param options.modifiedTime - ISO 8601 timestamp when page was last modified
	 * @param options.section - Category display name (e.g., "Classes", "Functions")
	 * @param options.packageName - Package name for tags
	 * @param options.ogImage - Optional resolved OG image metadata
	 * @returns Complete Open Graph metadata object
	 *
	 * @example
	 * ```typescript
	 * const ogMetadata = OpenGraphResolver.createPageMetadata({
	 *   siteUrl: "https://example.com",
	 *   pageRoute: "/api/classes/MyClass",
	 *   description: "MyClass provides...",
	 *   publishedTime: "2024-01-15T10:00:00Z",
	 *   modifiedTime: "2024-01-20T15:30:00Z",
	 *   section: "Classes",
	 *   packageName: "my-library",
	 *   ogImage: resolvedImageMetadata
	 * });
	 * ```
	 */
	public static createPageMetadata(options: {
		siteUrl: string;
		pageRoute: string;
		description: string;
		publishedTime: string;
		modifiedTime: string;
		section: string;
		packageName: string;
		ogImage?: OpenGraphImageMetadata;
	}): OpenGraphMetadata {
		return {
			siteUrl: options.siteUrl,
			pageRoute: options.pageRoute,
			description: options.description,
			publishedTime: options.publishedTime,
			modifiedTime: options.modifiedTime,
			section: options.section,
			tags: ["TypeScript", "API", options.packageName],
			...(options.ogImage != null ? { ogImage: options.ogImage } : {}),
			ogType: "article",
		};
	}
}
