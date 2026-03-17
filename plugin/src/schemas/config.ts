import { ApiItemKind } from "@microsoft/api-extractor-model";
import { Schema } from "effect";
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

export const LogLevel = Schema.Literal("none", "info", "verbose", "debug", "warn", "error");
export type LogLevel = Schema.Schema.Type<typeof LogLevel>;

export const ExternalPackageSpec = Schema.mutable(
	Schema.Struct({
		name: Schema.String,
		version: Schema.String,
		tsconfig: Schema.optional(ModelInput),
		compilerOptions: Schema.optional(Schema.Unknown),
	}),
);
export type ExternalPackageSpec = Schema.Schema.Type<typeof ExternalPackageSpec>;

export const AutoDetectDependencies = Schema.mutable(
	Schema.Struct({
		dependencies: Schema.optionalWith(Schema.Boolean, { default: () => false }),
		devDependencies: Schema.optionalWith(Schema.Boolean, { default: () => false }),
		peerDependencies: Schema.optionalWith(Schema.Boolean, { default: () => true }),
		autoDependencies: Schema.optionalWith(Schema.Boolean, { default: () => true }),
	}),
);
/**
 * Consumer-facing type uses Encoded (input shape with optional fields).
 * Schema.decode fills in defaults at runtime.
 */
export type AutoDetectDependencies = Schema.Schema.Encoded<typeof AutoDetectDependencies>;

export const ErrorConfig = Schema.mutable(
	Schema.Struct({
		example: Schema.optional(Schema.Literal("suppress", "show")),
	}),
);
export type ErrorConfig = Schema.Schema.Type<typeof ErrorConfig>;

export const LlmsPlugin = Schema.mutable(
	Schema.Struct({
		enabled: Schema.optionalWith(Schema.Boolean, { default: () => false }),
		showCopyButton: Schema.optionalWith(Schema.Boolean, { default: () => true }),
		showViewOptions: Schema.optionalWith(Schema.Boolean, { default: () => true }),
		copyButtonText: Schema.optionalWith(Schema.String, { default: () => "Copy Markdown" }),
		viewOptions: Schema.optionalWith(
			Schema.mutable(Schema.Array(Schema.Literal("markdownLink", "chatgpt", "claude"))),
			{
				default: () => ["markdownLink", "chatgpt", "claude"] as const,
			},
		),
	}),
);
/**
 * Consumer-facing type uses Encoded (input shape with optional fields).
 * Schema.decode fills in defaults at runtime.
 */
export type LlmsPlugin = Schema.Schema.Encoded<typeof LlmsPlugin>;

const ApiItemKindSchema = Schema.declare((input): input is ApiItemKind => typeof input === "number");

export const CategoryConfig = Schema.mutable(
	Schema.Struct({
		displayName: Schema.String,
		singularName: Schema.String,
		folderName: Schema.String,
		itemKinds: Schema.optional(Schema.mutable(Schema.Array(ApiItemKindSchema))),
		tsdocModifier: Schema.optional(Schema.String),
		collapsible: Schema.optionalWith(Schema.Boolean, { default: () => true }),
		collapsed: Schema.optionalWith(Schema.Boolean, { default: () => true }),
		overviewHeaders: Schema.optionalWith(Schema.mutable(Schema.Array(Schema.Number)), { default: () => [2] }),
	}),
);
/**
 * Consumer-facing type uses Encoded (input shape with optional fields).
 * Schema.decode fills in defaults at runtime.
 */
export type CategoryConfig = Schema.Schema.Encoded<typeof CategoryConfig>;

export const SourceConfig = Schema.mutable(
	Schema.Struct({
		url: Schema.String,
		ref: Schema.optional(Schema.String),
	}),
);
export type SourceConfig = Schema.Schema.Type<typeof SourceConfig>;

export const ThemeConfig = Schema.Union(
	Schema.String,
	Schema.mutable(Schema.Struct({ light: Schema.String, dark: Schema.String })),
	Schema.mutable(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
);
export type ThemeConfig = Schema.Schema.Type<typeof ThemeConfig>;

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

// ---------------------------------------------------------------------------
// Composite config schemas
// ---------------------------------------------------------------------------

/** Reusable categories record (internal helper) */
const CategoriesRecord = Schema.mutable(Schema.Record({ key: Schema.String, value: CategoryConfig }));

export const VersionConfig = Schema.mutable(
	Schema.Struct({
		model: ModelInput,
		packageJson: Schema.optional(ModelInput),
		categories: Schema.optional(CategoriesRecord),
		source: Schema.optional(SourceConfig),
		externalPackages: Schema.optional(Schema.mutable(Schema.Array(ExternalPackageSpec))),
		autoDetectDependencies: Schema.optional(AutoDetectDependencies),
		ogImage: Schema.optional(OpenGraphImageConfig),
		llmsPlugin: Schema.optional(LlmsPlugin),
		tsconfig: Schema.optional(ModelInput),
		compilerOptions: Schema.optional(Schema.Unknown),
	}),
);
export type VersionConfig = Schema.Schema.Type<typeof VersionConfig>;

/** Union for the versions record value: can be a path/function OR a full VersionConfig */
const VersionValue = Schema.Union(ModelInput, VersionConfig);

export const SingleApiConfig = Schema.mutable(
	Schema.Struct({
		packageName: Schema.String,
		name: Schema.optional(Schema.String),
		baseRoute: Schema.optional(Schema.String),
		apiFolder: Schema.optional(Schema.Union(Schema.String, Schema.Null)),
		model: Schema.optional(ModelInput),
		packageJson: Schema.optional(ModelInput),
		versions: Schema.optional(
			Schema.mutable(
				Schema.Record({
					key: Schema.String,
					value: VersionValue,
				}),
			),
		),
		theme: Schema.optional(ThemeConfig),
		categories: Schema.optional(CategoriesRecord),
		source: Schema.optional(SourceConfig),
		externalPackages: Schema.optional(Schema.mutable(Schema.Array(ExternalPackageSpec))),
		autoDetectDependencies: Schema.optional(AutoDetectDependencies),
		ogImage: Schema.optional(OpenGraphImageConfig),
		llmsPlugin: Schema.optional(LlmsPlugin),
		tsconfig: Schema.optional(ModelInput),
		compilerOptions: Schema.optional(Schema.Unknown),
	}),
);
export type SingleApiConfig = Schema.Schema.Type<typeof SingleApiConfig>;

export const MultiApiConfig = Schema.mutable(
	Schema.Struct({
		packageName: Schema.String,
		name: Schema.optional(Schema.String),
		baseRoute: Schema.optional(Schema.String),
		apiFolder: Schema.optional(Schema.Union(Schema.String, Schema.Null)),
		model: ModelInput,
		packageJson: Schema.optional(ModelInput),
		theme: Schema.optional(ThemeConfig),
		categories: Schema.optional(CategoriesRecord),
		source: Schema.optional(SourceConfig),
		externalPackages: Schema.optional(Schema.mutable(Schema.Array(ExternalPackageSpec))),
		autoDetectDependencies: Schema.optional(AutoDetectDependencies),
		ogImage: Schema.optional(OpenGraphImageConfig),
		llmsPlugin: Schema.optional(LlmsPlugin),
		tsconfig: Schema.optional(ModelInput),
		compilerOptions: Schema.optional(Schema.Unknown),
	}),
);
export type MultiApiConfig = Schema.Schema.Type<typeof MultiApiConfig>;

export const PluginOptions = Schema.mutable(
	Schema.Struct({
		api: Schema.optional(SingleApiConfig),
		apis: Schema.optional(Schema.mutable(Schema.Array(MultiApiConfig))),
		siteUrl: Schema.optional(Schema.String),
		ogImage: Schema.optional(OpenGraphImageConfig),
		defaultCategories: Schema.optional(CategoriesRecord),
		errors: Schema.optional(ErrorConfig),
		llmsPlugin: Schema.optional(Schema.Union(Schema.Boolean, LlmsPlugin)),
		logLevel: Schema.optional(LogLevel),
		performance: Schema.optional(PerformanceConfig),
	}),
);
export type PluginOptions = Schema.Schema.Type<typeof PluginOptions>;
