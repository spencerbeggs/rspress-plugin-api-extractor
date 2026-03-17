// Export types
export type { LoadedModel } from "./internal-types.js";
export { ApiExtractorPlugin } from "./plugin.js";
// Backward-compatible alias (deprecated)
export type {
	CategoryConfig,
	LogLevel,
	MultiApiConfig,
	OpenGraphImageConfig,
	OpenGraphImageMetadata,
	OpenGraphMetadata,
	PluginOptions,
	PluginOptions as ApiExtractorPluginOptions,
	SingleApiConfig,
	SourceConfig,
	VersionConfig,
} from "./schemas/index.js";
export { DEFAULT_CATEGORIES } from "./schemas/index.js";
