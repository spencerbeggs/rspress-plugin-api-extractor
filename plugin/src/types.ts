import type { PathLike } from "node:fs";
import type { ApiModel } from "@microsoft/api-extractor-model";
import { ApiItemKind } from "@microsoft/api-extractor-model";
import semver from "semver";
import type ts from "typescript";

/**
 * Compiler options relevant to type resolution.
 * Subset of TypeScript's CompilerOptions used by the type registry and Twoslash.
 */
export interface TypeResolutionCompilerOptions {
	target?: ts.ScriptTarget;
	module?: ts.ModuleKind;
	moduleResolution?: ts.ModuleResolutionKind;
	lib?: string[];
	types?: string[];
	typeRoots?: string[];
	strict?: boolean;
	skipLibCheck?: boolean;
	esModuleInterop?: boolean;
	allowSyntheticDefaultImports?: boolean;
	jsx?: ts.JsxEmit;
}

/**
 * TypeScript configuration fields for Twoslash and type resolution.
 * Used internally by the resolution functions.
 * @internal
 */
export interface TypeScriptConfig {
	tsconfig?: PathLike | (() => Promise<TypeResolutionCompilerOptions>);
	compilerOptions?: TypeResolutionCompilerOptions;
}

/**
 * Mixin type for TypeScript configuration fields.
 * Add these fields to any configuration interface that needs TypeScript options.
 */
export interface TypeScriptConfigFields {
	/**
	 * Path to tsconfig.json file OR an async function that returns compiler options.
	 *
	 * When a path is provided:
	 * - Supports relative paths (resolved from project root)
	 * - Supports extends chains in tsconfig.json
	 * - Uses TypeScript's built-in config parsing
	 *
	 * When a function is provided:
	 * - Called during plugin initialization
	 * - Should return resolved TypeResolutionCompilerOptions
	 * - Useful for dynamic configuration or custom loading logic
	 *
	 * @example Path string
	 * ```ts
	 * tsconfig: "tsconfig.json"
	 * ```
	 *
	 * @example Async function
	 * ```ts
	 * tsconfig: async () => {
	 *   const config = await loadExternalConfig();
	 *   return { target: config.target, lib: config.libs };
	 * }
	 * ```
	 */
	tsconfig?: PathLike | (() => Promise<TypeResolutionCompilerOptions>);

	/**
	 * Direct compiler options to merge on top of tsconfig values.
	 * When both tsconfig and compilerOptions are provided,
	 * compilerOptions take precedence.
	 *
	 * @example
	 * ```ts
	 * compilerOptions: {
	 *   target: 99,  // ESNext
	 *   lib: ["ESNext", "DOM"],
	 *   strict: false  // Lenient for docs
	 * }
	 * ```
	 */
	compilerOptions?: TypeResolutionCompilerOptions;
}

/**
 * Source code repository configuration
 */
export interface SourceConfig {
	/** Base repository URL (e.g., "https://github.com/owner/repo") */
	url: string;

	/**
	 * Git ref for source links (e.g., "blob/main", "tree/v1.2.3", "blob/develop")
	 * Defaults to "blob/main"
	 */
	ref?: string;
}

/**
 * Result from a model loader function
 */
export interface LoadedModel {
	/** The API model */
	model: ApiModel;

	/** Optional source config returned by the loader */
	source?: SourceConfig;
}

/**
 * Package.json structure (partial)
 */
export interface PackageJson {
	name?: string;
	version?: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	[key: string]: unknown;
}

/**
 * Configuration for external npm packages to include in Twoslash type system.
 * These packages will be fetched and cached using type-registry-effect.
 */
export interface ExternalPackageSpec {
	/** Package name (e.g., "zod", "@effect/schema") */
	name: string;
	/** Exact version or version range (e.g., "3.22.4", "^3.0.0", "latest") */
	version: string;

	/**
	 * Per-package tsconfig.json override for this external package.
	 * Can be a path to a tsconfig file OR a function that returns compiler options.
	 *
	 * When both tsconfig and compilerOptions are provided, compilerOptions
	 * are merged on top of the parsed tsconfig values.
	 *
	 * @example Path to tsconfig
	 * ```ts
	 * { name: "legacy-types", version: "1.0.0", tsconfig: "tsconfig.legacy.json" }
	 * ```
	 *
	 * @example Async function returning options
	 * ```ts
	 * { name: "legacy-types", version: "1.0.0", tsconfig: async () => ({ module: 1 }) }
	 * ```
	 */
	tsconfig?: PathLike | (() => Promise<TypeResolutionCompilerOptions>);

	/**
	 * Per-package compiler options override.
	 * Merged on top of tsconfig if both are provided.
	 *
	 * @example
	 * ```ts
	 * { name: "legacy-types", version: "1.0.0", compilerOptions: { module: 1 } }
	 * ```
	 */
	compilerOptions?: TypeResolutionCompilerOptions;
}

/**
 * Options for automatically detecting external packages from package.json.
 * Controls which dependency types are included when externalPackages is not explicitly specified.
 */
export interface AutoDetectDependenciesOptions {
	/** Include dependencies from package.json (defaults to false) */
	dependencies?: boolean;
	/** Include devDependencies from package.json (defaults to false) */
	devDependencies?: boolean;
	/** Include peerDependencies from package.json (defaults to true) */
	peerDependencies?: boolean;
	/**
	 * Include type utility packages (type-fest, ts-extras) from devDependencies.
	 * These are commonly used for type transformations (defaults to true)
	 */
	autoDependencies?: boolean;
}

/**
 * Configuration for a single category of API items
 */
export interface CategoryConfig {
	/** Display name shown in navigation - plural form (e.g., "Classes", "Errors") */
	displayName: string;

	/** Singular form of the type name for page titles (e.g., "Class", "Error") */
	singularName: string;

	/** Folder name for generated markdown files (e.g., "classes", "errors") */
	folderName: string;

	/**
	 * API Extractor item kinds that should be categorized here.
	 * If omitted, no default item kinds will map to this category.
	 */
	itemKinds?: ApiItemKind[];

	/**
	 * Custom TSDoc modifier tag (e.g., "error", "schema").
	 * Items with this @modifier tag will be categorized here,
	 * regardless of their itemKind.
	 */
	tsdocModifier?: string;

	/** Whether this category should be collapsible in nav (default: true) */
	collapsible?: boolean;

	/** Whether this category should be collapsed by default (default: true) */
	collapsed?: boolean;

	/** Header levels to show in overview pages (default: [2]) */
	overviewHeaders?: number[];
}

/**
 * Configuration for a single version's model
 */
export interface VersionConfig {
	/** Path to .api.json file OR async function that returns the model (and optionally source) */
	model: PathLike | (() => Promise<ApiModel | LoadedModel>);

	/**
	 * Path to package.json file OR async function that returns the parsed JSON.
	 * Used to load type packages for the type loader.
	 */
	packageJson?: PathLike | (() => Promise<PackageJson>);

	/**
	 * Category overrides specific to this version (optional).
	 * Merged with package-level categories.
	 */
	categories?: Record<string, CategoryConfig>;

	/**
	 * Version-specific source config override.
	 * If model loader returns source config, loader takes precedence.
	 */
	source?: SourceConfig;

	/**
	 * External npm packages to include in Twoslash type system for this version.
	 * Overrides package-level externalPackages configuration.
	 *
	 * If not specified, falls back to:
	 * 1. Package-level externalPackages configuration
	 * 2. Auto-detected packages from package.json based on autoDetectDependencies options
	 *
	 * @example
	 * ```ts
	 * externalPackages: [
	 *   { name: "zod", version: "3.22.4" },
	 *   { name: "@effect/schema", version: "0.68.0" }
	 * ]
	 * ```
	 */
	externalPackages?: ExternalPackageSpec[];

	/**
	 * Options for auto-detecting external packages from package.json for this version.
	 * Overrides package-level autoDetectDependencies configuration.
	 *
	 * @example
	 * ```ts
	 * autoDetectDependencies: { dependencies: true, peerDependencies: true }
	 * ```
	 */
	autoDetectDependencies?: AutoDetectDependenciesOptions;

	/**
	 * Override Open Graph image configuration for this version.
	 * If provided, overrides the API-level and global ogImage settings.
	 * If omitted, uses the API-level or global ogImage setting.
	 *
	 * Supports string (URL/path) or detailed metadata object.
	 * See ApiExtractorPluginOptions.ogImage for format details.
	 *
	 * @example "/images/plugin/v2/og-image.png"
	 * @example { url: "/images/v2/og.png", width: 1200, height: 630 }
	 */
	ogImage?: OpenGraphImageConfig;

	/**
	 * LLM plugin integration options for this version.
	 * Overrides package-level and global llmsPlugin configuration.
	 */
	llmsPlugin?: LlmsPluginOptions;

	/**
	 * Version-specific path to tsconfig.json OR async function returning compiler options.
	 * Overrides package-level and global tsconfig.
	 *
	 * @example Path string
	 * ```ts
	 * tsconfig: "tsconfig.v2.json"
	 * ```
	 *
	 * @example Async function
	 * ```ts
	 * tsconfig: async () => ({ target: 9 })  // ES2022 for this version
	 * ```
	 */
	tsconfig?: PathLike | (() => Promise<TypeResolutionCompilerOptions>);

	/**
	 * Version-specific compiler options override.
	 * Merged on top of tsconfig if both are provided.
	 *
	 * @example
	 * ```ts
	 * compilerOptions: { target: 9 }  // ES2022 for this version
	 * ```
	 */
	compilerOptions?: TypeResolutionCompilerOptions;
}

/**
 * Configuration for a single-package API documentation site.
 * Supports RSPress multiVersion and i18n features.
 *
 * Use this with the `api` field in `ApiExtractorPluginOptions` when documenting
 * a single package. The plugin derives `docsDir` and route paths automatically
 * from `baseRoute` and `apiFolder`.
 *
 * @example Basic single-package config
 * ```ts
 * api: {
 *   packageName: "@my-org/my-lib",
 *   model: "temp/my-lib.api.json",
 * }
 * ```
 *
 * @example With versioning (RSPress multiVersion)
 * ```ts
 * api: {
 *   packageName: "@my-org/my-lib",
 *   versions: {
 *     "1.0.0": "temp/v1/my-lib.api.json",
 *     "2.0.0": { model: "temp/v2/my-lib.api.json", source: { url: "https://github.com/org/repo", ref: "blob/v2" } },
 *   },
 * }
 * ```
 */
export interface SingleApiConfig {
	/** Package name for display and identification (e.g., "@my-org/my-lib") */
	packageName: string;

	/** Human-readable name for page titles (e.g., "My Library SDK"). If omitted, not included in titles. */
	name?: string;

	/**
	 * Base route path for the API documentation (e.g., "/my-lib").
	 * The plugin derives docsDir and full route from this value plus apiFolder.
	 */
	baseRoute?: string;

	/**
	 * Subfolder name for API documentation (defaults to "api").
	 * Set to null to output directly to the base route directory.
	 */
	apiFolder?: string | null;

	/**
	 * Path to .api.json file OR async function that returns the model.
	 * Optional when `versions` is provided; required otherwise.
	 */
	model?: PathLike | (() => Promise<ApiModel | LoadedModel>);

	/**
	 * Path to package.json file OR async function that returns the parsed JSON.
	 * Used to load type packages for the type loader.
	 */
	packageJson?: PathLike | (() => Promise<PackageJson>);

	/**
	 * Map of version names to model configurations (for RSPress multiVersion support).
	 * Can be just a path/loader, or a full VersionConfig with categories and source.
	 * When provided, enables multi-version documentation generation.
	 */
	versions?: Record<string, PathLike | (() => Promise<ApiModel | LoadedModel>) | VersionConfig>;

	/**
	 * Shiki theme configuration for syntax highlighting in code blocks.
	 * Can be:
	 * - A theme name string (e.g., "github-dark", "css-variables")
	 * - A theme object with light/dark variants: { light: "github-light", dark: "github-dark" }
	 * - A custom theme object following Shiki's theme schema
	 *
	 * If not specified, uses RSPress default theme configuration.
	 */
	theme?: string | { light: string; dark: string } | Record<string, unknown>;

	/**
	 * Category configuration for this API (optional).
	 * Uses plugin defaults if not provided.
	 * Merged with plugin-level defaultCategories.
	 */
	categories?: Record<string, CategoryConfig>;

	/**
	 * Source code repository configuration.
	 * If model loader returns source config, loader takes precedence.
	 */
	source?: SourceConfig;

	/**
	 * External npm packages to include in Twoslash type system.
	 * These packages will be fetched and cached using type-registry-effect.
	 *
	 * If not specified, automatically detects packages from package.json
	 * based on autoDetectDependencies options.
	 */
	externalPackages?: ExternalPackageSpec[];

	/**
	 * Options for auto-detecting external packages from package.json.
	 * Defaults: { dependencies: false, devDependencies: false, peerDependencies: true, autoDependencies: true }
	 */
	autoDetectDependencies?: AutoDetectDependenciesOptions;

	/**
	 * Override Open Graph image configuration for this API.
	 * If provided, overrides the global ogImage setting for this API's pages.
	 * If omitted, uses the global ogImage setting.
	 *
	 * Supports string (URL/path) or detailed metadata object.
	 */
	ogImage?: OpenGraphImageConfig;

	/**
	 * LLM plugin integration options for this API.
	 * Overrides global llmsPlugin configuration.
	 */
	llmsPlugin?: LlmsPluginOptions;

	/**
	 * Path to tsconfig.json OR async function returning compiler options.
	 * Overrides global tsconfig.
	 */
	tsconfig?: PathLike | (() => Promise<TypeResolutionCompilerOptions>);

	/**
	 * Direct compiler options for Twoslash.
	 * Merged on top of tsconfig if both are provided.
	 */
	compilerOptions?: TypeResolutionCompilerOptions;
}

/**
 * Configuration for a single package in a multi-package API documentation portal.
 * Does not support versioning (each entry is a single version).
 *
 * Use this with the `apis` array field in `ApiExtractorPluginOptions` when
 * documenting multiple packages in a single site. The plugin derives `docsDir`
 * and route paths automatically from `baseRoute` and `apiFolder`.
 *
 * @example Multi-package portal
 * ```ts
 * apis: [
 *   { packageName: "@my-org/core", model: "temp/core.api.json", baseRoute: "/core" },
 *   { packageName: "@my-org/utils", model: "temp/utils.api.json", baseRoute: "/utils" },
 * ]
 * ```
 */
export interface MultiApiConfig {
	/** Package name for display and identification (e.g., "@my-org/core") */
	packageName: string;

	/** Human-readable name for page titles (e.g., "Core Library"). If omitted, not included in titles. */
	name?: string;

	/**
	 * Base route path for the package documentation (e.g., "/core").
	 * The plugin derives docsDir and full route from this value plus apiFolder.
	 */
	baseRoute?: string;

	/**
	 * Subfolder name for API documentation (defaults to "api").
	 * Set to null to output directly to the base route directory.
	 */
	apiFolder?: string | null;

	/**
	 * Path to .api.json file OR async function that returns the model.
	 * Required for multi-package configs (each entry must have its own model).
	 */
	model: PathLike | (() => Promise<ApiModel | LoadedModel>);

	/**
	 * Path to package.json file OR async function that returns the parsed JSON.
	 * Used to load type packages for the type loader.
	 */
	packageJson?: PathLike | (() => Promise<PackageJson>);

	/**
	 * Shiki theme configuration for syntax highlighting in code blocks.
	 * Can be:
	 * - A theme name string (e.g., "github-dark", "css-variables")
	 * - A theme object with light/dark variants: { light: "github-light", dark: "github-dark" }
	 * - A custom theme object following Shiki's theme schema
	 *
	 * If not specified, uses RSPress default theme configuration.
	 */
	theme?: string | { light: string; dark: string } | Record<string, unknown>;

	/**
	 * Category configuration for this API (optional).
	 * Uses plugin defaults if not provided.
	 * Merged with plugin-level defaultCategories.
	 */
	categories?: Record<string, CategoryConfig>;

	/**
	 * Source code repository configuration.
	 * If model loader returns source config, loader takes precedence.
	 */
	source?: SourceConfig;

	/**
	 * External npm packages to include in Twoslash type system.
	 * These packages will be fetched and cached using type-registry-effect.
	 *
	 * If not specified, automatically detects packages from package.json
	 * based on autoDetectDependencies options.
	 */
	externalPackages?: ExternalPackageSpec[];

	/**
	 * Options for auto-detecting external packages from package.json.
	 * Defaults: { dependencies: false, devDependencies: false, peerDependencies: true, autoDependencies: true }
	 */
	autoDetectDependencies?: AutoDetectDependenciesOptions;

	/**
	 * Override Open Graph image configuration for this API.
	 * If provided, overrides the global ogImage setting for this API's pages.
	 * If omitted, uses the global ogImage setting.
	 *
	 * Supports string (URL/path) or detailed metadata object.
	 */
	ogImage?: OpenGraphImageConfig;

	/**
	 * LLM plugin integration options for this API.
	 * Overrides global llmsPlugin configuration.
	 */
	llmsPlugin?: LlmsPluginOptions;

	/**
	 * Path to tsconfig.json OR async function returning compiler options.
	 *
	 * @remarks
	 * In multi-API mode, the Twoslash TypeScript environment is shared across
	 * all APIs. Only the first API entry's tsconfig is used. If you need
	 * different compiler options per package, use separate site configurations.
	 */
	tsconfig?: PathLike | (() => Promise<TypeResolutionCompilerOptions>);

	/**
	 * Direct compiler options for Twoslash.
	 * Merged on top of tsconfig if both are provided.
	 *
	 * @remarks
	 * Same shared-environment limitation as `tsconfig` — only the first API
	 * entry's compilerOptions are used in multi-API mode.
	 */
	compilerOptions?: TypeResolutionCompilerOptions;
}

/**
 * Detailed Open Graph image metadata for documentation pages.
 *
 * This interface represents the fully-resolved metadata for an Open Graph image,
 * containing all properties that will be rendered as `og:image` meta tags in
 * the page's frontmatter.
 *
 * @remarks
 * All URL properties should be absolute URLs. The `OpenGraphResolver` class
 * handles converting relative paths to absolute URLs during resolution.
 *
 * @see {@link OpenGraphImageConfig} for the input configuration format
 * @see {@link https://ogp.me/#structured | Open Graph Protocol - Structured Properties}
 *
 * @example
 * ```typescript
 * const imageMetadata: OpenGraphImageMetadata = {
 *   url: "https://example.com/images/og-api.png",
 *   type: "image/png",
 *   width: 1200,
 *   height: 630,
 *   alt: "MyPackage API Documentation"
 * };
 * ```
 */
export interface OpenGraphImageMetadata {
	/**
	 * Absolute URL of the Open Graph image.
	 * Maps to the `og:image` meta tag.
	 *
	 * @example "https://example.com/images/og-api.png"
	 */
	url: string;

	/**
	 * Secure (HTTPS) URL for the image, if different from `url`.
	 * Maps to the `og:image:secure_url` meta tag.
	 *
	 * @remarks
	 * Only set this if the secure URL differs from the main URL.
	 * Must be an absolute HTTPS URL.
	 */
	secureUrl?: string;

	/**
	 * MIME type of the image.
	 * Maps to the `og:image:type` meta tag.
	 *
	 * @example "image/png", "image/jpeg", "image/webp"
	 */
	type?: string;

	/**
	 * Width of the image in pixels.
	 * Maps to the `og:image:width` meta tag.
	 *
	 * @remarks
	 * Recommended dimensions for Open Graph images are 1200x630 pixels.
	 */
	width?: number;

	/**
	 * Height of the image in pixels.
	 * Maps to the `og:image:height` meta tag.
	 */
	height?: number;

	/**
	 * Alternative text description for the image.
	 * Maps to the `og:image:alt` meta tag.
	 *
	 * @remarks
	 * Provides accessibility support and context when the image cannot be displayed.
	 * If not provided, the `OpenGraphResolver` will generate a default description
	 * based on the package and API names.
	 */
	alt?: string;
}

/**
 * Configuration format for Open Graph images.
 *
 * Supports two formats for flexibility:
 * - **String format**: A URL or path that will be resolved and optionally enhanced
 *   with auto-detected dimensions for local files
 * - **Object format**: Detailed metadata with explicit properties
 *
 * @remarks
 * String paths starting with `/` are treated as relative to the site root and
 * will be prepended with the `siteUrl`. For local files, the plugin will attempt
 * to auto-detect image dimensions and MIME type.
 *
 * @example String format with relative path
 * ```typescript
 * const config: OpenGraphImageConfig = "/images/og-api.png";
 * ```
 *
 * @example String format with absolute URL
 * ```typescript
 * const config: OpenGraphImageConfig = "https://cdn.example.com/og-api.png";
 * ```
 *
 * @example Object format with explicit properties
 * ```typescript
 * const config: OpenGraphImageConfig = {
 *   url: "/images/og-api.png",
 *   width: 1200,
 *   height: 630,
 *   alt: "Custom API documentation image"
 * };
 * ```
 */
export type OpenGraphImageConfig = string | OpenGraphImageMetadata;

/**
 * Complete Open Graph metadata for an API documentation page.
 *
 * This interface represents all the Open Graph and article metadata that will
 * be rendered in a page's frontmatter `head` array. It combines standard
 * Open Graph properties with article-specific metadata for rich social sharing.
 *
 * @remarks
 * The metadata is rendered as meta tags in the following format:
 * - `og:url` - Canonical page URL
 * - `og:type` - Content type (typically "article")
 * - `og:description` - Page description
 * - `og:image*` - Image properties (if `ogImage` is provided)
 * - `article:published_time` - First publication timestamp
 * - `article:modified_time` - Last modification timestamp
 * - `article:section` - Content section/category
 * - `article:tag` - Content tags (multiple tags supported)
 *
 * @see {@link https://ogp.me/ | Open Graph Protocol}
 * @see {@link https://ogp.me/ns/article | Article Object Type}
 *
 * @example
 * ```typescript
 * const metadata: OpenGraphMetadata = {
 *   siteUrl: "https://example.com",
 *   pageRoute: "/api/classes/MyClass",
 *   description: "MyClass provides state management utilities",
 *   publishedTime: "2024-01-15T10:00:00Z",
 *   modifiedTime: "2024-01-20T15:30:00Z",
 *   section: "Classes",
 *   tags: ["TypeScript", "API", "my-package"],
 *   ogImage: { url: "https://example.com/og.png", width: 1200, height: 630 },
 *   ogType: "article"
 * };
 * ```
 */
export interface OpenGraphMetadata {
	/**
	 * Base URL for the website.
	 * Combined with `pageRoute` to form the canonical `og:url`.
	 *
	 * @example "https://example.com"
	 */
	siteUrl: string;

	/**
	 * Route path for this page.
	 * Combined with `siteUrl` to form the canonical `og:url`.
	 *
	 * @example "/api/classes/MyClass"
	 */
	pageRoute: string;

	/**
	 * Page description for the `og:description` meta tag.
	 * Typically derived from the TSDoc summary of the API item.
	 */
	description: string;

	/**
	 * ISO 8601 timestamp when the page was first created.
	 * Maps to the `article:published_time` meta tag.
	 *
	 * @remarks
	 * This timestamp is preserved across builds unless the page content changes.
	 * Managed by the `SnapshotManager` for consistency.
	 *
	 * @example "2024-01-15T10:30:00.000Z"
	 */
	publishedTime: string;

	/**
	 * ISO 8601 timestamp when the page was last modified.
	 * Maps to the `article:modified_time` meta tag.
	 *
	 * @remarks
	 * Updated when page content or frontmatter changes (excluding timestamps).
	 * Managed by the `SnapshotManager` for consistency.
	 *
	 * @example "2024-01-20T15:45:00.000Z"
	 */
	modifiedTime: string;

	/**
	 * Category display name for the `article:section` meta tag.
	 * Represents the API category (e.g., "Classes", "Functions", "Interfaces").
	 */
	section: string;

	/**
	 * Tags for the page, rendered as multiple `article:tag` meta tags.
	 * Typically includes "TypeScript", "API", and the package name.
	 */
	tags: string[];

	/**
	 * Resolved Open Graph image metadata.
	 * If provided, generates `og:image` and related meta tags.
	 */
	ogImage?: OpenGraphImageMetadata;

	/**
	 * Open Graph content type for the `og:type` meta tag.
	 * For API documentation pages, this is typically "article".
	 *
	 * @default "article"
	 */
	ogType: string;
}

/**
 * Error handling configuration
 */
export interface ErrorConfig {
	/**
	 * How to handle TypeScript errors in @example blocks.
	 * - "suppress": Add @noErrors directive to suppress all TypeScript errors
	 * - "show": Show TypeScript errors (examples must be type-safe)
	 * @default "suppress"
	 */
	example?: "suppress" | "show";
}

/**
 * LLM plugin integration options.
 * Controls the display of LLM-friendly buttons on API documentation pages.
 * Requires @rspress/plugin-llms to be installed and configured.
 */
export interface LlmsPluginOptions {
	/**
	 * Enable LLM plugin integration.
	 * When true, adds LLM copy and view buttons to API documentation pages.
	 * @default false
	 */
	enabled?: boolean;

	/**
	 * Show the "Copy Markdown" button.
	 * @default true
	 */
	showCopyButton?: boolean;

	/**
	 * Show the "Open" dropdown with view options.
	 * @default true
	 */
	showViewOptions?: boolean;

	/**
	 * Custom text for the copy button.
	 * @default "Copy Markdown"
	 */
	copyButtonText?: string;

	/**
	 * Which options to show in the view dropdown.
	 * Available options:
	 * - "markdownLink": Copy markdown link to clipboard
	 * - "chatgpt": Open in ChatGPT
	 * - "claude": Open in Claude
	 * @default ["markdownLink", "chatgpt", "claude"]
	 */
	viewOptions?: Array<"markdownLink" | "chatgpt" | "claude">;
}

/**
 * Log level determines the verbosity of plugin output.
 *
 * - **none**: Complete silence (no output)
 * - **info**: High-level operations and results (default)
 * - **verbose**: Detailed progress including per-category stats and file operations
 * - **debug**: Internal details including timing breakdown and performance metrics
 */
export type LogLevel = "none" | "info" | "verbose" | "debug";

/**
 * Plugin options for rspress-plugin-api-extractor.
 *
 * Uses a discriminated config shape: provide either `api` (single package)
 * or `apis` (multi-package portal), but not both.
 *
 * @example Single-package site
 * ```ts
 * apiExtractorPlugin({
 *   api: {
 *     packageName: "@my-org/my-lib",
 *     model: "temp/my-lib.api.json",
 *   },
 * })
 * ```
 *
 * @example Multi-package portal
 * ```ts
 * apiExtractorPlugin({
 *   apis: [
 *     { packageName: "@my-org/core", model: "temp/core.api.json" },
 *     { packageName: "@my-org/utils", model: "temp/utils.api.json" },
 *   ],
 * })
 * ```
 */
export interface ApiExtractorPluginOptions {
	/**
	 * Single-package API configuration.
	 * Use this for sites documenting one package (supports RSPress multiVersion and i18n).
	 * Mutually exclusive with `apis`.
	 */
	api?: SingleApiConfig;

	/**
	 * Multi-package API configurations.
	 * Use this for portal sites documenting multiple packages (no versioning per package).
	 * Mutually exclusive with `api`.
	 */
	apis?: MultiApiConfig[];

	/**
	 * Base URL for your website (used for og:url generation).
	 * Required for Open Graph metadata generation.
	 * Applies to all APIs unless overridden.
	 *
	 * @example "https://spencerbeggs.com"
	 */
	siteUrl?: string;

	/**
	 * Default Open Graph image configuration.
	 * Used as fallback og:image for all API pages.
	 * Can be overridden per-API or per-version.
	 *
	 * Supports two formats:
	 * 1. Simple string (URL or path):
	 *    - Absolute URL: "https://example.com/og-api.png" (used as-is)
	 *    - Relative path: "/images/og-api.png" (prepended with siteUrl, auto-detect dimensions/type)
	 *
	 * 2. Detailed metadata object:
	 *    - url: Image URL (required)
	 *    - width, height: Dimensions in pixels (optional)
	 *    - type: MIME type like "image/png" (optional)
	 *    - alt: Alt text description (optional)
	 *    - secureUrl: HTTPS URL if different from url (optional)
	 *
	 * @example "/images/og-api.png"
	 * @example { url: "/images/og-api.png", width: 1200, height: 630, alt: "API Documentation" }
	 */
	ogImage?: OpenGraphImageConfig;

	/**
	 * Global default categories (optional).
	 * If not provided, uses built-in defaults.
	 * Per-API and per-version categories are merged with these.
	 */
	defaultCategories?: Record<string, CategoryConfig>;

	/**
	 * Error handling configuration (optional).
	 */
	errors?: ErrorConfig;

	/**
	 * Global LLM plugin integration options.
	 * Can be overridden per-API or per-version.
	 * Requires @rspress/plugin-llms to be installed and configured.
	 *
	 * Set to `true` to enable with default options, or provide a configuration object.
	 * Set to `false` or omit to disable.
	 *
	 * @example
	 * // Enable with defaults
	 * llmsPlugin: true
	 *
	 * @example
	 * // Enable with custom options
	 * llmsPlugin: {
	 *   enabled: true,
	 *   showCopyButton: true,
	 *   showViewOptions: true,
	 *   copyButtonText: "Copy API Docs",
	 *   viewOptions: ["chatgpt", "claude"]
	 * }
	 */
	llmsPlugin?: boolean | LlmsPluginOptions;

	/**
	 * Log level for plugin output (optional).
	 *
	 * Controls the verbosity of console output during the build process:
	 * - **"none"**: Complete silence (no output)
	 * - **"info"**: High-level operations and results (default)
	 * - **"verbose"**: Detailed progress including per-category stats and file operations
	 * - **"debug"**: Internal details including timing breakdown and performance metrics
	 *
	 * @default "info"
	 *
	 * @example
	 * ```ts
	 * // Quiet mode for CI
	 * logLevel: "none"
	 *
	 * // Default mode (shows high-level progress)
	 * logLevel: "info"
	 *
	 * // Detailed mode (shows file-level operations)
	 * logLevel: "verbose"
	 *
	 * // Debug mode (shows internal timing and metrics)
	 * logLevel: "debug"
	 * ```
	 */
	logLevel?: LogLevel;

	/**
	 * Performance monitoring configuration (optional).
	 *
	 * Controls performance thresholds and monitoring behavior for the build process.
	 * Allows customization of what is considered "slow" to accommodate different site sizes.
	 *
	 * @example
	 * ```ts
	 * // Default configuration (for small to medium sites)
	 * performance: {
	 *   showInsights: true,
	 *   trackDetailedMetrics: false
	 * }
	 *
	 * // Custom thresholds for large sites
	 * performance: {
	 *   thresholds: {
	 *     slowCodeBlock: 200,       // More lenient for complex examples
	 *     slowPageGeneration: 1000, // Large API surfaces
	 *     slowApiLoad: 2000         // Very large API models
	 *   },
	 *   showInsights: true
	 * }
	 * ```
	 */
	performance?: PerformanceConfig;

	/**
	 * @deprecated No longer used. File-based debug logging has been removed.
	 * This option is retained for backward compatibility and will be removed in a future release.
	 */
	logFile?: string;
}

/**
 * Performance threshold configuration.
 * Defines what duration is considered "slow" for different operations.
 */
export interface PerformanceThresholds {
	/**
	 * Threshold for slow code block rendering (ms).
	 * @default 100
	 */
	slowCodeBlock?: number;

	/**
	 * Threshold for slow page generation (ms).
	 * @default 500
	 */
	slowPageGeneration?: number;

	/**
	 * Threshold for slow API model loading (ms).
	 * @default 1000
	 */
	slowApiLoad?: number;

	/**
	 * Threshold for slow file I/O operations (ms).
	 * @default 50
	 */
	slowFileOperation?: number;

	/**
	 * Threshold for slow HTTP requests (ms).
	 * @default 2000
	 */
	slowHttpRequest?: number;

	/**
	 * Threshold for slow database operations (ms).
	 * @default 100
	 */
	slowDbOperation?: number;
}

/**
 * Performance monitoring configuration.
 */
export interface PerformanceConfig {
	/**
	 * Performance thresholds for slow operation warnings.
	 * Custom thresholds override defaults for specific site requirements.
	 */
	thresholds?: PerformanceThresholds;

	/**
	 * Whether to include performance insights in reports.
	 * Insights provide analysis of bottlenecks and optimization suggestions.
	 *
	 * @default true
	 */
	showInsights?: boolean;

	/**
	 * Whether to track detailed per-operation metrics.
	 * When enabled, tracks individual file operations, HTTP requests, etc.
	 * Automatically enabled in debug mode regardless of this setting.
	 *
	 * @default false
	 */
	trackDetailedMetrics?: boolean;
}

/**
 * Built-in default categories
 */
export const DEFAULT_CATEGORIES: Record<string, CategoryConfig> = {
	classes: {
		displayName: "Classes",
		singularName: "Class",
		folderName: "class",
		itemKinds: [ApiItemKind.Class],
		collapsible: true,
		collapsed: true,
		overviewHeaders: [2],
	},
	interfaces: {
		displayName: "Interfaces",
		singularName: "Interface",
		folderName: "interface",
		itemKinds: [ApiItemKind.Interface],
		collapsible: true,
		collapsed: true,
		overviewHeaders: [2],
	},
	functions: {
		displayName: "Functions",
		singularName: "Function",
		folderName: "function",
		itemKinds: [ApiItemKind.Function],
		collapsible: true,
		collapsed: true,
		overviewHeaders: [2],
	},
	types: {
		displayName: "Types",
		singularName: "Type",
		folderName: "type",
		itemKinds: [ApiItemKind.TypeAlias],
		collapsible: true,
		collapsed: true,
		overviewHeaders: [2],
	},
	enums: {
		displayName: "Enums",
		singularName: "Enum",
		folderName: "enum",
		itemKinds: [ApiItemKind.Enum],
		collapsible: true,
		collapsed: true,
		overviewHeaders: [2],
	},
	variables: {
		displayName: "Variables",
		singularName: "Variable",
		folderName: "variable",
		itemKinds: [ApiItemKind.Variable],
		collapsible: true,
		collapsed: true,
		overviewHeaders: [2],
	},
	namespaces: {
		displayName: "Namespaces",
		singularName: "Namespace",
		folderName: "namespace",
		itemKinds: [ApiItemKind.Namespace],
		collapsible: true,
		collapsed: true,
		overviewHeaders: [2],
	},
};

/**
 * Type guard to check if version value is a full VersionConfig
 */
export function isVersionConfig(
	value: PathLike | (() => Promise<ApiModel | LoadedModel>) | VersionConfig,
): value is VersionConfig {
	return typeof value === "object" && value !== null && "model" in value;
}

/**
 * Type guard to check if loader result includes source config
 */
export function isLoadedModel(result: ApiModel | LoadedModel): result is LoadedModel {
	return typeof result === "object" && result !== null && "model" in result;
}

/**
 * Normalize llmsPlugin config to always be an LlmsPluginOptions object
 */
export function normalizeLlmsPluginConfig(config: boolean | LlmsPluginOptions | undefined): LlmsPluginOptions {
	if (config === true) {
		return { enabled: true };
	}
	if (config === false || config === undefined) {
		return { enabled: false };
	}
	return { enabled: true, ...config };
}

/**
 * Merge LLM plugin configurations with precedence: version > API > global
 * Returns merged config with sensible defaults
 */
export function mergeLlmsPluginConfig(
	globalConfig?: boolean | LlmsPluginOptions,
	apiConfig?: LlmsPluginOptions,
	versionConfig?: LlmsPluginOptions,
): LlmsPluginOptions {
	const normalized = normalizeLlmsPluginConfig(globalConfig);
	const merged = {
		...normalized,
		...apiConfig,
		...versionConfig,
	};

	// Apply defaults if enabled
	if (merged.enabled) {
		return {
			enabled: true,
			showCopyButton: merged.showCopyButton ?? true,
			showViewOptions: merged.showViewOptions ?? true,
			copyButtonText: merged.copyButtonText ?? "Copy Markdown",
			viewOptions: merged.viewOptions ?? ["markdownLink", "chatgpt", "claude"],
		};
	}

	return { enabled: false };
}

/**
 * Common type utility packages to automatically load from devDependencies.
 * These packages provide type transformations and utilities commonly used in TypeScript projects.
 */
const TYPE_UTILITY_PACKAGES = ["type-fest", "ts-extras"] as const;

/**
 * Extract peerDependencies from PackageJson and convert to ExternalPackageSpec array.
 * This allows automatic loading of peer dependency types for documentation examples.
 *
 * @param packageJson - The parsed package.json object
 * @returns Array of external package specs from peerDependencies, or empty array if none
 *
 * @example
 * ```ts
 * const pkg = { name: "my-lib", peerDependencies: { "zod": "^3.22.4" } };
 * const external = extractPeerDependencies(pkg);
 * // Returns: [{ name: "zod", version: "^3.22.4" }]
 * ```
 */
export function extractPeerDependencies(packageJson: PackageJson | undefined): ExternalPackageSpec[] {
	if (!packageJson?.peerDependencies) {
		return [];
	}

	return Object.entries(packageJson.peerDependencies).map(([name, version]) => ({
		name,
		version,
	}));
}

/**
 * Extract type utility packages (type-fest, ts-extras) from devDependencies.
 * These packages are commonly used for type transformations and should be available in documentation examples.
 *
 * @param packageJson - The parsed package.json object
 * @returns Array of external package specs for type utilities found in devDependencies
 *
 * @example
 * ```ts
 * const pkg = { devDependencies: { "type-fest": "^4.0.0", "ts-extras": "^0.12.0" } };
 * const external = extractTypeUtilities(pkg);
 * // Returns: [{ name: "type-fest", version: "^4.0.0" }, { name: "ts-extras", version: "^0.12.0" }]
 * ```
 */
export function extractTypeUtilities(packageJson: PackageJson | undefined): ExternalPackageSpec[] {
	if (!packageJson?.devDependencies) {
		return [];
	}

	const utilities: ExternalPackageSpec[] = [];

	for (const utilityName of TYPE_UTILITY_PACKAGES) {
		const version = packageJson.devDependencies[utilityName];
		if (version) {
			utilities.push({ name: utilityName, version });
		}
	}

	return utilities;
}

/**
 * Extract all automatically-detected external packages from package.json.
 * Controlled by AutoDetectDependenciesOptions to determine which dependency types to include.
 *
 * @param packageJson - The parsed package.json object
 * @param options - Options controlling which dependency types to include
 * @returns Array of all external package specs to load for documentation
 *
 * @example
 * ```ts
 * const pkg = {
 *   dependencies: { "effect": "^3.0.0" },
 *   peerDependencies: { "zod": "^3.22.4" },
 *   devDependencies: { "type-fest": "^4.0.0" }
 * };
 *
 * // Default: only peerDependencies + type utilities
 * extractAutoDetectedPackages(pkg);
 * // Returns: [{ name: "zod", version: "^3.22.4" }, { name: "type-fest", version: "^4.0.0" }]
 *
 * // Include all dependency types
 * extractAutoDetectedPackages(pkg, { dependencies: true, peerDependencies: true, autoDependencies: true });
 * // Returns: [{ name: "effect", ... }, { name: "zod", ... }, { name: "type-fest", ... }]
 * ```
 */
export function extractAutoDetectedPackages(
	packageJson: PackageJson | undefined,
	options: AutoDetectDependenciesOptions = {},
): ExternalPackageSpec[] {
	const { dependencies = false, devDependencies = false, peerDependencies = true, autoDependencies = true } = options;

	const packages: ExternalPackageSpec[] = [];

	// Add dependencies
	if (dependencies && packageJson?.dependencies) {
		packages.push(...Object.entries(packageJson.dependencies).map(([name, version]) => ({ name, version })));
	}

	// Add devDependencies (excluding type utilities which are handled separately)
	if (devDependencies && packageJson?.devDependencies) {
		packages.push(
			...Object.entries(packageJson.devDependencies)
				.filter(
					([name]) =>
						!autoDependencies || !TYPE_UTILITY_PACKAGES.includes(name as (typeof TYPE_UTILITY_PACKAGES)[number]),
				)
				.map(([name, version]) => ({ name, version })),
		);
	}

	// Add peerDependencies
	if (peerDependencies) {
		packages.push(...extractPeerDependencies(packageJson));
	}

	// Add type utilities from devDependencies
	if (autoDependencies) {
		packages.push(...extractTypeUtilities(packageJson));
	}

	// Resolve version conflicts by picking the highest version
	return resolvePackageVersionConflicts(packages);
}

/**
 * Deduplicate external packages by name, resolving to the highest version when conflicts exist.
 * Uses semver.maxSatisfying to pick the highest version from duplicates.
 *
 * @param packages - Array of external package specs (may contain duplicates)
 * @returns Deduplicated array with highest versions
 *
 * @example
 * ```ts
 * const packages = [
 *   { name: "zod", version: "^3.22.4" },
 *   { name: "zod", version: "^3.23.0" },
 *   { name: "effect", version: "^3.0.0" }
 * ];
 * const resolved = resolvePackageVersionConflicts(packages);
 * // Returns: [{ name: "zod", version: "^3.23.0" }, { name: "effect", version: "^3.0.0" }]
 * ```
 */
export function resolvePackageVersionConflicts(packages: ExternalPackageSpec[]): ExternalPackageSpec[] {
	const packageMap = new Map<string, string[]>();

	// Group versions by package name
	for (const pkg of packages) {
		const versions = packageMap.get(pkg.name) || [];
		versions.push(pkg.version);
		packageMap.set(pkg.name, versions);
	}

	// Resolve to highest version for each package
	const resolved: ExternalPackageSpec[] = [];
	for (const [name, versions] of packageMap) {
		// If only one version, use it
		if (versions.length === 1) {
			resolved.push({ name, version: versions[0] });
			continue;
		}

		// Use semver to find the highest satisfying version
		// maxSatisfying requires a range and list of versions
		// We'll use the broadest range that satisfies all version specs
		const highestVersion = findHighestVersion(versions);
		resolved.push({ name, version: highestVersion });
	}

	return resolved;
}

/**
 * Find the highest version from a list of version specifiers using semver.
 * Handles version ranges (^, ~, >, <, etc.) and exact versions.
 *
 * @param versions - Array of version strings (can be ranges or exact versions)
 * @returns The highest version specifier
 *
 * @example
 * ```ts
 * findHighestVersion(["^3.22.4", "^3.23.0", "3.22.5"])
 * // Returns: "^3.23.0"
 * ```
 */
function findHighestVersion(versions: string[]): string {
	// Parse all versions to get their minimum satisfying versions
	const parsedVersions: Array<{ original: string; version: string }> = [];

	for (const version of versions) {
		// Try to extract the base version from the range
		const cleaned = semver.minVersion(version);
		if (cleaned) {
			parsedVersions.push({ original: version, version: cleaned.version });
		} else if (semver.valid(version)) {
			// It's already a valid version
			parsedVersions.push({ original: version, version });
		}
	}

	// If we couldn't parse any versions, return the last one as fallback
	if (parsedVersions.length === 0) {
		return versions[versions.length - 1];
	}

	// Sort by version using semver comparison
	parsedVersions.sort((a, b) => semver.rcompare(a.version, b.version));

	// Return the original version string with the highest version
	return parsedVersions[0].original;
}

/**
 * Validate that manually specified externalPackages don't conflict with peerDependencies.
 * Throws an error if a package appears in both with different versions.
 *
 * @param externalPackages - Manually specified external packages
 * @param packageJson - The parsed package.json object
 * @throws Error if versions conflict
 *
 * @example
 * ```ts
 * const external = [{ name: "zod", version: "3.22.4" }];
 * const pkg = { peerDependencies: { "zod": "^3.22.4" } };
 * validateExternalPackages(external, pkg);
 * // Throws if versions conflict
 * ```
 */
export function validateExternalPackages(
	externalPackages: ExternalPackageSpec[] | undefined,
	packageJson: PackageJson | undefined,
): void {
	if (!externalPackages || !packageJson?.peerDependencies) {
		return;
	}

	const conflicts: Array<{ name: string; external: string; peer: string }> = [];

	for (const pkg of externalPackages) {
		const peerVersion = packageJson.peerDependencies[pkg.name];
		if (peerVersion && peerVersion !== pkg.version) {
			conflicts.push({
				name: pkg.name,
				external: pkg.version,
				peer: peerVersion,
			});
		}
	}

	if (conflicts.length > 0) {
		const details = conflicts
			.map((c) => `  - ${c.name}: externalPackages="${c.external}" vs peerDependencies="${c.peer}"`)
			.join("\n");
		throw new Error(
			`Version conflict detected between externalPackages and peerDependencies:\n${details}\n\n` +
				`Remove conflicting entries from externalPackages to use peerDependencies versions automatically.`,
		);
	}
}
