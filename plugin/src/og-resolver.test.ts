import fs from "node:fs";
import path from "node:path";
import { imageSizeFromFile } from "image-size/fromFile";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenGraphResolver } from "./og-resolver.js";
import type { OpenGraphImageMetadata } from "./schemas/index.js";

// Mock dependencies
vi.mock("node:fs");
vi.mock("image-size/fromFile");

describe("OpenGraphResolver", () => {
	let resolver: OpenGraphResolver;
	const siteUrl = "https://example.com";
	const docsRoot = "/path/to/docs";

	beforeEach(() => {
		vi.clearAllMocks();
		resolver = new OpenGraphResolver({ siteUrl, docsRoot });
	});

	describe("constructor", () => {
		it("should create instance with siteUrl only", () => {
			const simpleResolver = new OpenGraphResolver({ siteUrl });

			expect(simpleResolver).toBeDefined();
		});

		it("should create instance with siteUrl and docsRoot", () => {
			const fullResolver = new OpenGraphResolver({ siteUrl, docsRoot });

			expect(fullResolver).toBeDefined();
		});
	});

	describe("resolve", () => {
		it("should return undefined for undefined config", async () => {
			const result = await resolver.resolve(undefined, "my-package");

			expect(result).toBeUndefined();
		});

		it("should handle string config", async () => {
			const result = await resolver.resolve("https://cdn.example.com/og.png", "my-package");

			expect(result).toEqual({
				url: "https://cdn.example.com/og.png",
				alt: "my-package API Documentation",
			});
		});

		it("should handle metadata object config", async () => {
			const config: OpenGraphImageMetadata = {
				url: "https://cdn.example.com/og.png",
				width: 1200,
				height: 630,
			};

			const result = await resolver.resolve(config, "my-package");

			expect(result).toEqual({
				url: "https://cdn.example.com/og.png",
				width: 1200,
				height: 630,
				alt: "my-package API Documentation",
			});
		});

		it("should pass through apiName for detailed alt text", async () => {
			const result = await resolver.resolve("https://cdn.example.com/og.png", "my-package", "MyClass");

			expect(result?.alt).toBe("MyClass - my-package API Documentation");
		});
	});

	describe("resolveFromMetadata", () => {
		it("should resolve valid absolute URL", async () => {
			const metadata: OpenGraphImageMetadata = {
				url: "https://cdn.example.com/og.png",
				width: 1200,
				height: 630,
			};

			const result = await resolver.resolve(metadata, "my-lib");

			expect(result).toEqual({
				url: "https://cdn.example.com/og.png",
				width: 1200,
				height: 630,
				alt: "my-lib API Documentation",
			});
		});

		it("should resolve valid relative path", async () => {
			const metadata: OpenGraphImageMetadata = {
				url: "/images/og.png",
				type: "image/png",
			};

			const result = await resolver.resolve(metadata, "my-lib");

			expect(result).toEqual({
				url: "https://example.com/images/og.png",
				type: "image/png",
				alt: "my-lib API Documentation",
			});
		});

		it("should return undefined for invalid URL format", async () => {
			const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const metadata: OpenGraphImageMetadata = {
				url: "invalid-url",
			};

			const result = await resolver.resolve(metadata, "my-lib");

			expect(result).toBeUndefined();
			expect(consoleWarnSpy).toHaveBeenCalledWith('[og-resolver] Invalid ogImage URL format: "invalid-url"');

			consoleWarnSpy.mockRestore();
		});

		it("should use custom alt text when provided", async () => {
			const metadata: OpenGraphImageMetadata = {
				url: "https://cdn.example.com/og.png",
				alt: "Custom alt text",
			};

			const result = await resolver.resolve(metadata, "my-lib");

			expect(result?.alt).toBe("Custom alt text");
		});

		it("should resolve secureUrl when it's a valid https URL", async () => {
			const metadata: OpenGraphImageMetadata = {
				url: "http://cdn.example.com/og.png",
				secureUrl: "https://cdn.example.com/og.png",
			};

			const result = await resolver.resolve(metadata, "my-lib");

			expect(result?.secureUrl).toBe("https://cdn.example.com/og.png");
		});

		it("should warn and ignore invalid secureUrl", async () => {
			const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const metadata: OpenGraphImageMetadata = {
				url: "https://cdn.example.com/og.png",
				secureUrl: "http://cdn.example.com/og.png", // Not https
			};

			const result = await resolver.resolve(metadata, "my-lib");

			expect(result?.secureUrl).toBeUndefined();
			expect(consoleWarnSpy).toHaveBeenCalledWith(
				'[og-resolver] ogImage secureUrl must be an absolute HTTPS URL: "http://cdn.example.com/og.png"',
			);

			consoleWarnSpy.mockRestore();
		});

		it("should preserve type, width, and height from metadata", async () => {
			const metadata: OpenGraphImageMetadata = {
				url: "https://cdn.example.com/og.png",
				type: "image/png",
				width: 1200,
				height: 630,
			};

			const result = await resolver.resolve(metadata, "my-lib");

			expect(result).toMatchObject({
				type: "image/png",
				width: 1200,
				height: 630,
			});
		});
	});

	describe("resolveFromString", () => {
		it("should resolve absolute http URL", async () => {
			const result = await resolver.resolve("http://cdn.example.com/og.png", "my-lib");

			expect(result).toEqual({
				url: "http://cdn.example.com/og.png",
				alt: "my-lib API Documentation",
			});
		});

		it("should resolve absolute https URL", async () => {
			const result = await resolver.resolve("https://cdn.example.com/og.png", "my-lib");

			expect(result).toEqual({
				url: "https://cdn.example.com/og.png",
				alt: "my-lib API Documentation",
			});
		});

		it("should resolve relative path with siteUrl", async () => {
			const result = await resolver.resolve("/images/og.png", "my-lib");

			expect(result?.url).toBe("https://example.com/images/og.png");
		});

		it("should return undefined for invalid format", async () => {
			const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			const result = await resolver.resolve("invalid-path", "my-lib");

			expect(result).toBeUndefined();
			expect(consoleWarnSpy).toHaveBeenCalledWith(
				'[og-resolver] Invalid ogImage format: "invalid-path" (must be absolute URL or path starting with /)',
			);

			consoleWarnSpy.mockRestore();
		});

		it("should auto-detect dimensions for local file", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(imageSizeFromFile).mockResolvedValue({
				width: 1200,
				height: 630,
				type: "png",
			});

			const result = await resolver.resolve("/images/og.png", "my-lib");

			expect(result).toMatchObject({
				url: "https://example.com/images/og.png",
				type: "image/png",
				width: 1200,
				height: 630,
			});

			expect(fs.existsSync).toHaveBeenCalledWith(path.join(docsRoot, "public", "/images/og.png"));
		});

		it("should not attempt dimension detection without docsRoot", async () => {
			const noDocsResolver = new OpenGraphResolver({ siteUrl });

			const result = await noDocsResolver.resolve("/images/og.png", "my-lib");

			expect(result).toMatchObject({
				url: "https://example.com/images/og.png",
			});
			expect(result?.width).toBeUndefined();
			expect(result?.height).toBeUndefined();
			expect(fs.existsSync).not.toHaveBeenCalled();
		});

		it("should handle missing local file gracefully", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);

			const result = await resolver.resolve("/images/missing.png", "my-lib");

			expect(result).toMatchObject({
				url: "https://example.com/images/missing.png",
			});
			expect(result?.width).toBeUndefined();
			expect(result?.height).toBeUndefined();
		});

		it("should handle dimension read errors gracefully", async () => {
			const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(imageSizeFromFile).mockRejectedValue(new Error("Invalid image file"));

			const result = await resolver.resolve("/images/corrupt.png", "my-lib");

			expect(result).toMatchObject({
				url: "https://example.com/images/corrupt.png",
			});
			expect(result?.width).toBeUndefined();
			expect(consoleWarnSpy).toHaveBeenCalledWith(
				expect.stringContaining("[og-resolver] Failed to read image dimensions"),
				"Invalid image file",
			);

			consoleWarnSpy.mockRestore();
		});

		it("should generate alt text with apiName", async () => {
			const result = await resolver.resolve("https://cdn.example.com/og.png", "my-lib", "MyClass");

			expect(result?.alt).toBe("MyClass - my-lib API Documentation");
		});

		it("should generate alt text without apiName", async () => {
			const result = await resolver.resolve("https://cdn.example.com/og.png", "my-lib");

			expect(result?.alt).toBe("my-lib API Documentation");
		});
	});

	describe("MIME type detection", () => {
		it("should detect JPEG MIME type", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(imageSizeFromFile).mockResolvedValue({
				width: 1200,
				height: 630,
				type: "jpg",
			});

			const result = await resolver.resolve("/images/og.jpg", "my-lib");

			expect(result?.type).toBe("image/jpeg");
		});

		it("should detect PNG MIME type", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(imageSizeFromFile).mockResolvedValue({
				width: 1200,
				height: 630,
				type: "png",
			});

			const result = await resolver.resolve("/images/og.png", "my-lib");

			expect(result?.type).toBe("image/png");
		});

		it("should detect WebP MIME type", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(imageSizeFromFile).mockResolvedValue({
				width: 1200,
				height: 630,
				type: "webp",
			});

			const result = await resolver.resolve("/images/og.webp", "my-lib");

			expect(result?.type).toBe("image/webp");
		});

		it("should detect SVG MIME type", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(imageSizeFromFile).mockResolvedValue({
				width: 1200,
				height: 630,
				type: "svg",
			});

			const result = await resolver.resolve("/images/og.svg", "my-lib");

			expect(result?.type).toBe("image/svg+xml");
		});

		it("should handle unknown image type", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(imageSizeFromFile).mockResolvedValue({
				width: 1200,
				height: 630,
				// No type field
			});

			const result = await resolver.resolve("/images/og.unknown", "my-lib");

			expect(result?.type).toBeUndefined();
		});

		it("should handle case-insensitive type matching", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(imageSizeFromFile).mockResolvedValue({
				width: 1200,
				height: 630,
				type: "JPEG",
			});

			const result = await resolver.resolve("/images/og.jpeg", "my-lib");

			expect(result?.type).toBe("image/jpeg");
		});
	});

	describe("createPageMetadata", () => {
		it("should create complete metadata object", () => {
			const ogImage: OpenGraphImageMetadata = {
				url: "https://example.com/images/og.png",
				width: 1200,
				height: 630,
				type: "image/png",
				alt: "Custom alt",
			};

			const result = OpenGraphResolver.createPageMetadata({
				siteUrl: "https://example.com",
				pageRoute: "/api/classes/MyClass",
				description: "MyClass provides...",
				publishedTime: "2024-01-15T10:00:00Z",
				modifiedTime: "2024-01-20T15:30:00Z",
				section: "Classes",
				packageName: "my-library",
				ogImage,
			});

			expect(result).toEqual({
				siteUrl: "https://example.com",
				pageRoute: "/api/classes/MyClass",
				description: "MyClass provides...",
				publishedTime: "2024-01-15T10:00:00Z",
				modifiedTime: "2024-01-20T15:30:00Z",
				section: "Classes",
				tags: ["TypeScript", "API", "my-library"],
				ogImage,
				ogType: "article",
			});
		});

		it("should work without ogImage", () => {
			const result = OpenGraphResolver.createPageMetadata({
				siteUrl: "https://example.com",
				pageRoute: "/api/functions/myFunction",
				description: "myFunction provides...",
				publishedTime: "2024-01-15T10:00:00Z",
				modifiedTime: "2024-01-20T15:30:00Z",
				section: "Functions",
				packageName: "my-library",
			});

			expect(result.ogImage).toBeUndefined();
			expect(result.ogType).toBe("article");
		});

		it("should always set ogType to article", () => {
			const result = OpenGraphResolver.createPageMetadata({
				siteUrl: "https://example.com",
				pageRoute: "/api/types/MyType",
				description: "MyType description",
				publishedTime: "2024-01-15T10:00:00Z",
				modifiedTime: "2024-01-20T15:30:00Z",
				section: "Types",
				packageName: "my-library",
			});

			expect(result.ogType).toBe("article");
		});

		it("should include package name in tags", () => {
			const result = OpenGraphResolver.createPageMetadata({
				siteUrl: "https://example.com",
				pageRoute: "/api/interfaces/IConfig",
				description: "IConfig description",
				publishedTime: "2024-01-15T10:00:00Z",
				modifiedTime: "2024-01-20T15:30:00Z",
				section: "Interfaces",
				packageName: "custom-package",
			});

			expect(result.tags).toEqual(["TypeScript", "API", "custom-package"]);
		});
	});

	describe("edge cases", () => {
		it("should handle empty package name", async () => {
			const result = await resolver.resolve("https://cdn.example.com/og.png", "");

			expect(result?.alt).toBe(" API Documentation");
		});

		it("should handle special characters in package name", async () => {
			const result = await resolver.resolve("https://cdn.example.com/og.png", "@scope/my-package");

			expect(result?.alt).toBe("@scope/my-package API Documentation");
		});

		it("should handle nested image paths", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(imageSizeFromFile).mockResolvedValue({
				width: 1200,
				height: 630,
				type: "png",
			});

			const result = await resolver.resolve("/images/packages/my-lib/og.png", "my-lib");

			expect(result?.url).toBe("https://example.com/images/packages/my-lib/og.png");
			expect(fs.existsSync).toHaveBeenCalledWith(path.join(docsRoot, "public", "/images/packages/my-lib/og.png"));
		});

		it("should handle URLs with query parameters", async () => {
			const result = await resolver.resolve("https://cdn.example.com/og.png?v=123", "my-lib");

			expect(result?.url).toBe("https://cdn.example.com/og.png?v=123");
		});

		it("should handle URLs with fragments", async () => {
			const result = await resolver.resolve("https://cdn.example.com/og.png#section", "my-lib");

			expect(result?.url).toBe("https://cdn.example.com/og.png#section");
		});

		it("should handle relative paths starting with multiple slashes", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);

			const result = await resolver.resolve("//images/og.png", "my-lib");

			// Treated as relative path starting with /
			expect(result?.url).toBe("https://example.com//images/og.png");
		});

		it("should handle siteUrl with trailing slash", async () => {
			const resolverWithSlash = new OpenGraphResolver({ siteUrl: "https://example.com/" });

			const result = await resolverWithSlash.resolve("/images/og.png", "my-lib");

			expect(result?.url).toBe("https://example.com//images/og.png");
		});
	});
});
