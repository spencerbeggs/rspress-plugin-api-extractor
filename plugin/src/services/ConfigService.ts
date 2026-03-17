/* v8 ignore start -- service interface + Context.Tag, no testable logic */
import type { ApiPackage } from "@microsoft/api-extractor-model";
import type { Effect, Scope } from "effect";
import { Context } from "effect";
import type { Highlighter, ShikiTransformer } from "shiki";
import type { VirtualTypeScriptEnvironment } from "type-registry-effect/node";
import type { ApiModelLoadError, ConfigValidationError, TypeRegistryError } from "../errors.js";
import type { PackageJson, TypeResolutionCompilerOptions } from "../internal-types.js";
import type { ShikiThemeConfig } from "../markdown/shiki-utils.js";
import type { OpenGraphResolver } from "../og-resolver.js";
import type { CategoryConfig, LlmsPlugin, LogLevel, OpenGraphImageConfig, SourceConfig } from "../schemas/index.js";
import type { ShikiCrossLinker } from "../shiki-transformer.js";
/**
 * Subset of RSPress config needed by ConfigService.
 * Extracted from the UserConfig in beforeBuild/config hooks.
 */
export interface RspressConfigSubset {
	readonly multiVersion?: { default: string; versions: string[] };
	readonly locales?: ReadonlyArray<{ lang: string }>;
	readonly lang?: string;
	readonly root?: string;
}

/**
 * Fully resolved config for a single API. Produced after model loading,
 * category merging, path derivation, and package resolution.
 * Plain interface (not Schema) because it contains ApiPackage.
 */
export interface ResolvedApiConfig {
	readonly apiPackage: ApiPackage;
	readonly packageName: string;
	readonly apiName?: string;
	readonly outputDir: string;
	readonly baseRoute: string;
	readonly categories: Record<string, CategoryConfig>;
	readonly source?: SourceConfig;
	readonly packageJson?: PackageJson;
	readonly llmsPlugin?: LlmsPlugin;
	readonly siteUrl?: string;
	readonly ogImage?: OpenGraphImageConfig;
	readonly docsDir?: string;
	readonly docsRoot?: string;
	readonly theme?: ShikiThemeConfig;
}

/**
 * Everything needed to run the doc generation pipeline.
 * Produced by ConfigService.resolve().
 */
export interface ResolvedBuildContext {
	readonly apiConfigs: ReadonlyArray<ResolvedApiConfig>;
	readonly combinedVfs: ReadonlyMap<string, string>;
	readonly highlighter: Highlighter;
	readonly tsEnvCache: ReadonlyMap<string, VirtualTypeScriptEnvironment>;
	readonly resolvedCompilerOptions: TypeResolutionCompilerOptions;
	readonly ogResolver: OpenGraphResolver | null;
	readonly shikiCrossLinker: ShikiCrossLinker;
	readonly hideCutTransformer: ShikiTransformer;
	readonly hideCutLinesTransformer: ShikiTransformer;
	readonly twoslashTransformer: ShikiTransformer | undefined;
	readonly pageConcurrency: number;
	readonly logLevel: LogLevel;
	readonly suppressExampleErrors: boolean;
}

/**
 * ConfigService resolves plugin options + RSPress config into a fully
 * prepared build context with loaded models, type system, and resources.
 */
export interface ConfigServiceShape {
	readonly resolve: (
		rspressConfig: RspressConfigSubset,
	) => Effect.Effect<ResolvedBuildContext, ConfigValidationError | ApiModelLoadError | TypeRegistryError, Scope.Scope>;
}

export class ConfigService extends Context.Tag("rspress-plugin-api-extractor/ConfigService")<
	ConfigService,
	ConfigServiceShape
>() {}
