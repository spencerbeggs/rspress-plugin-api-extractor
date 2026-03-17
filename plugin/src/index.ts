/* v8 ignore start -- re-export barrel, no testable logic */
export type { LoadedModel } from "./internal-types.js";
export { ApiExtractorPlugin } from "./plugin.js";
export { DEFAULT_CATEGORIES } from "./schemas/config.js";
export type {
	CategoryConfig,
	LogLevel,
	MultiApiConfig,
	OpenGraphImageConfig,
	OpenGraphImageMetadata,
	OpenGraphMetadata,
	PluginOptions as ApiExtractorPluginOptions,
	SingleApiConfig,
	SourceConfig,
	VersionConfig,
} from "./schemas/index.js";
