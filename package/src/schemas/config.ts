import { ApiItemKind } from "@microsoft/api-extractor-model";
import { Effect, Schema } from "effect";
import { ObservabilityConfig } from "./observability.js";
import { OpenGraphImageConfig } from "./opengraph.js";
import { PerformanceConfig } from "./performance.js";

/**
 * Opaque input type for config fields that accept a file path string,
 * an async loader function, or a URL.
 */
export const ModelInput = Schema.declare(
	(input): input is string | ((...args: Array<unknown>) => unknown) | URL =>
		typeof input === "string" || typeof input === "function" || input instanceof URL,
);

/**
 * Verbosity level for plugin build output.
 *
 * @public
 */
export const LogLevel = Schema.Literals(["none", "info", "verbose", "debug", "warn", "error"]);
/** @public */
export type LogLevel = typeof LogLevel.Type;

export const ExternalPackageSpec = Schema.Struct({
	name: Schema.String,
	version: Schema.String,
	tsconfig: Schema.optional(ModelInput),
	compilerOptions: Schema.optional(Schema.Unknown),
});
export type ExternalPackageSpec = typeof ExternalPackageSpec.Type;

export const AutoDetectDependencies = Schema.Struct({
	// `dependencies` defaults to true: a package's documented type surface is
	// usually written against its runtime dependencies (e.g. effect, @effect/*),
	// so those declarations must be in the VFS for Twoslash to resolve them.
	// Unresolvable specs (workspace-only / unpublished) are dropped during load.
	dependencies: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
	devDependencies: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
	peerDependencies: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
	autoDependencies: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
});
/**
 * Consumer-facing type uses Encoded (input shape with optional fields).
 * Schema.decode fills in defaults at runtime.
 */
export type AutoDetectDependencies = typeof AutoDetectDependencies.Encoded;

export const ErrorConfig = Schema.Struct({
	example: Schema.optional(Schema.Literals(["suppress", "show"])),
});
export type ErrorConfig = typeof ErrorConfig.Type;

export const LlmsPlugin = Schema.Struct({
	enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
	scopes: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
	apiTxt: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
	showCopyButton: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
	showViewOptions: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
	copyButtonText: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed("Copy Markdown"))),
	viewOptions: Schema.mutable(Schema.Array(Schema.Literals(["markdownLink", "chatgpt", "claude"]))).pipe(
		Schema.withDecodingDefault(Effect.succeed(["markdownLink", "chatgpt", "claude"])),
	),
});
/**
 * Consumer-facing type uses Encoded (input shape with optional fields).
 * Schema.decode fills in defaults at runtime.
 */
export type LlmsPlugin = typeof LlmsPlugin.Encoded;

const ApiItemKindSchema = Schema.declare((input): input is ApiItemKind => typeof input === "number");

/**
 * Configuration for a single documentation category (e.g. Classes, Functions).
 *
 * @public
 */
export const CategoryConfig = Schema.Struct({
	/** Human-readable plural display name shown in the sidebar. */
	displayName: Schema.String,
	/** Human-readable singular name used in page titles. */
	singularName: Schema.String,
	/** Folder name under the API base route (URL segment). */
	folderName: Schema.String,
	/** API item kinds included in this category. */
	itemKinds: Schema.optional(Schema.mutable(Schema.Array(ApiItemKindSchema))),
	/** TSDoc modifier tag that marks items for this category. */
	tsdocModifier: Schema.optional(Schema.String),
	/** Whether the sidebar section is collapsible. Defaults to `true`. */
	collapsible: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
	/** Whether the sidebar section starts collapsed. Defaults to `true`. */
	collapsed: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
	/** Heading levels shown in the overview. Defaults to `[2]`. */
	overviewHeaders: Schema.mutable(Schema.Array(Schema.Number)).pipe(Schema.withDecodingDefault(Effect.succeed([2]))),
});
/**
 * Consumer-facing type uses Encoded (input shape with optional fields).
 * Schema.decode fills in defaults at runtime.
 *
 * @public
 */
export type CategoryConfig = typeof CategoryConfig.Encoded;

/**
 * Source repository link configuration for an API.
 *
 * @public
 */
export const SourceConfig = Schema.Struct({
	/** Base URL of the source repository (e.g. `"https://github.com/org/repo/blob/main/src"`). */
	url: Schema.String,
	/** Optional git ref (branch, tag, or commit SHA) appended to source links. */
	ref: Schema.optional(Schema.String),
});
/** @public */
export type SourceConfig = typeof SourceConfig.Type;

export const ThemeConfig = Schema.Union([
	Schema.String,
	Schema.Struct({ light: Schema.String, dark: Schema.String }),
	Schema.Record(Schema.String, Schema.Unknown),
]);
export type ThemeConfig = typeof ThemeConfig.Type;

/**
 * Built-in default category definitions covering Classes, Interfaces, Functions,
 * Types, Enums, Variables, and Namespaces.
 *
 * @public
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

// ---------------------------------------------------------------------------
// Composite config schemas
// ---------------------------------------------------------------------------

/** Reusable categories record (internal helper) */
const CategoriesRecord = Schema.Record(Schema.String, CategoryConfig);

/**
 * Configuration for a single version of an API within a multi-version setup.
 *
 * @public
 */
export const VersionConfig = Schema.Struct({
	/** Path or loader for the `.api.json` model file for this version. */
	model: ModelInput,
	/** Path or loader for the `package.json` for this version. */
	packageJson: Schema.optional(ModelInput),
	/** Category overrides for this version. */
	categories: Schema.optional(CategoriesRecord),
	/** Source repository link configuration for this version. */
	source: Schema.optional(SourceConfig),
	/** External npm packages whose types should be loaded for Twoslash. */
	externalPackages: Schema.optional(Schema.mutable(Schema.Array(ExternalPackageSpec))),
	/** Auto-detect external packages from `package.json` dependency fields. */
	autoDetectDependencies: Schema.optional(AutoDetectDependencies),
	/** Open Graph image configuration for this version. */
	ogImage: Schema.optional(OpenGraphImageConfig),
	/** LLMs integration options for this version. */
	llmsPlugin: Schema.optional(LlmsPlugin),
	/** Path to a `tsconfig.json` for this version. */
	tsconfig: Schema.optional(ModelInput),
	/** TypeScript compiler options for Twoslash. */
	compilerOptions: Schema.optional(Schema.Unknown),
});
/** @public */
export type VersionConfig = typeof VersionConfig.Type;

/** Union for the versions record value: can be a path/function OR a full VersionConfig */
const VersionValue = Schema.Union([ModelInput, VersionConfig]);

/**
 * Configuration for a single-package API documentation site (the `api:` option).
 *
 * @public
 */
export const SingleApiConfig = Schema.Struct({
	/** npm package name of the documented package. */
	packageName: Schema.String,
	/** Optional display name shown in the sidebar and page titles. */
	name: Schema.optional(Schema.String),
	/** Base URL route for API pages (defaults to `/api`). */
	baseRoute: Schema.optional(Schema.String),
	/** Subfolder name under `baseRoute` for API pages, or `null` to omit. */
	apiFolder: Schema.optional(Schema.Union([Schema.String, Schema.Null])),
	/** Path or loader for the `.api.json` model file. */
	model: Schema.optional(ModelInput),
	/** Path or loader for the `package.json`. */
	packageJson: Schema.optional(ModelInput),
	/** Versioned models keyed by version label. */
	versions: Schema.optional(Schema.Record(Schema.String, VersionValue)),
	/** Shiki syntax-highlighting theme. */
	theme: Schema.optional(ThemeConfig),
	/** Category definitions (defaults to {@link DEFAULT_CATEGORIES}). */
	categories: Schema.optional(CategoriesRecord),
	/** Source repository link configuration. */
	source: Schema.optional(SourceConfig),
	/** External npm packages whose types should be loaded for Twoslash. */
	externalPackages: Schema.optional(Schema.mutable(Schema.Array(ExternalPackageSpec))),
	/** Auto-detect external packages from `package.json` dependency fields. */
	autoDetectDependencies: Schema.optional(AutoDetectDependencies),
	/** Open Graph image configuration. */
	ogImage: Schema.optional(OpenGraphImageConfig),
	/** LLMs integration options. */
	llmsPlugin: Schema.optional(LlmsPlugin),
	/** Path to a `tsconfig.json` for Twoslash. */
	tsconfig: Schema.optional(ModelInput),
	/** TypeScript compiler options for Twoslash. */
	compilerOptions: Schema.optional(Schema.Unknown),
});
/** @public */
export type SingleApiConfig = typeof SingleApiConfig.Type;

/**
 * Configuration for one package in a multi-API portal (each element of the `apis:` array).
 *
 * @public
 */
export const MultiApiConfig = Schema.Struct({
	/** npm package name of the documented package. */
	packageName: Schema.String,
	/** Optional display name shown in the sidebar and page titles. */
	name: Schema.optional(Schema.String),
	/** Base URL route for this package's API pages. */
	baseRoute: Schema.optional(Schema.String),
	/** Subfolder name under `baseRoute` for API pages, or `null` to omit. */
	apiFolder: Schema.optional(Schema.Union([Schema.String, Schema.Null])),
	/** Path or loader for the `.api.json` model file (required). */
	model: ModelInput,
	/** Path or loader for the `package.json`. */
	packageJson: Schema.optional(ModelInput),
	/** Shiki syntax-highlighting theme. */
	theme: Schema.optional(ThemeConfig),
	/** Category definitions (defaults to {@link DEFAULT_CATEGORIES}). */
	categories: Schema.optional(CategoriesRecord),
	/** Source repository link configuration. */
	source: Schema.optional(SourceConfig),
	/** External npm packages whose types should be loaded for Twoslash. */
	externalPackages: Schema.optional(Schema.mutable(Schema.Array(ExternalPackageSpec))),
	/** Auto-detect external packages from `package.json` dependency fields. */
	autoDetectDependencies: Schema.optional(AutoDetectDependencies),
	/** Open Graph image configuration. */
	ogImage: Schema.optional(OpenGraphImageConfig),
	/** LLMs integration options. */
	llmsPlugin: Schema.optional(LlmsPlugin),
	/** Path to a `tsconfig.json` for Twoslash. */
	tsconfig: Schema.optional(ModelInput),
	/** TypeScript compiler options for Twoslash. */
	compilerOptions: Schema.optional(Schema.Unknown),
});
/** @public */
export type MultiApiConfig = typeof MultiApiConfig.Type;

/**
 * Top-level options passed to {@link ApiExtractorPlugin}.
 *
 * @public
 */
export const PluginOptions = Schema.Struct({
	/** Single-API configuration (mutually exclusive with `apis`). */
	api: Schema.optional(SingleApiConfig),
	/** Multi-API portal configuration (mutually exclusive with `api`). */
	apis: Schema.optional(Schema.mutable(Schema.Array(MultiApiConfig))),
	/** Canonical site URL used for Open Graph absolute URLs. */
	siteUrl: Schema.optional(Schema.String),
	/** Global Open Graph image configuration (overridden per-API). */
	ogImage: Schema.optional(OpenGraphImageConfig),
	/** Override the default category definitions for all APIs. */
	defaultCategories: Schema.optional(CategoriesRecord),
	/** Error display options for code examples. */
	errors: Schema.optional(ErrorConfig),
	/** LLMs integration options, or `false` to disable. */
	llmsPlugin: Schema.optional(Schema.Union([Schema.Boolean, LlmsPlugin])),
	/** Verbosity level for plugin build output. @deprecated Use `observability.logLevel`. */
	logLevel: Schema.optional(LogLevel),
	/** Performance tuning options. @deprecated Use `observability.thresholds`. */
	performance: Schema.optional(PerformanceConfig),
	/** Unified observability configuration (logLevel, trace artifact, thresholds). */
	observability: Schema.optional(ObservabilityConfig),
});
/** @public */
export type PluginOptions = typeof PluginOptions.Type;
