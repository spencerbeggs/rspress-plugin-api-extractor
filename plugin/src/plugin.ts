import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ApiEntryPoint, ApiPackage } from "@microsoft/api-extractor-model";
import type { RspressPlugin, UserConfig } from "@rspress/core";
import { Effect, Layer, ManagedRuntime, Metric } from "effect";
import type { Highlighter, ShikiTransformer } from "shiki";
import { createHighlighter } from "shiki";
import type { VirtualFileSystem } from "type-registry-effect";
import type { VirtualTypeScriptEnvironment } from "type-registry-effect/node";
import { ApiExtractedPackage } from "./api-extracted-package.js";
import type { CrossLinkData } from "./build-stages.js";
import { buildPipelineForApi, cleanupAndCommit, prepareWorkItems, writeMetadata } from "./build-stages.js";
import { CategoryResolver } from "./category-resolver.js";
import { validatePluginOptions } from "./config-validation.js";
import { HideCutLinesTransformer, MemberFormatTransformer } from "./hide-cut-transformer.js";
import { BuildMetrics, PluginLoggerLayer, logBuildSummary } from "./layers/ObservabilityLive.js";
import { PathDerivationServiceLive } from "./layers/PathDerivationServiceLive.js";
import { TypeRegistryServiceLive } from "./layers/TypeRegistryServiceLive.js";
import { ApiParser } from "./loader.js";
import { markdownCrossLinker } from "./markdown/index.js";
import type { ShikiThemeConfig } from "./markdown/shiki-utils.js";
import { ApiModelLoader } from "./model-loader.js";
import { OpenGraphResolver } from "./og-resolver.js";
import { deriveOutputPaths, normalizeBaseRoute, unscopedName } from "./path-derivation.js";
import { remarkApiCodeblocks } from "./remark-api-codeblocks.js";
import { remarkWithApi } from "./remark-with-api.js";
import { TypeRegistryService } from "./services/TypeRegistryService.js";
import { ShikiCrossLinker } from "./shiki-transformer.js";
import { SnapshotManager } from "./snapshot-manager.js";
import { TwoslashManager } from "./twoslash-transformer.js";
import { TypeReferenceExtractor } from "./type-reference-extractor.js";
import type {
	ApiExtractorPluginOptions,
	CategoryConfig,
	ExternalPackageSpec,
	LlmsPluginOptions,
	LogLevel,
	MultiApiConfig,
	OpenGraphImageConfig,
	PackageJson,
	SingleApiConfig,
	SourceConfig,
	TypeResolutionCompilerOptions,
	VersionConfig,
} from "./types.js";
import {
	DEFAULT_CATEGORIES,
	extractAutoDetectedPackages,
	isVersionConfig,
	mergeLlmsPluginConfig,
	validateExternalPackages,
} from "./types.js";
import { resolveTypeScriptConfig } from "./typescript-config.js";

import { VfsRegistry } from "./vfs-registry.js";

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);

/**
 * Default Shiki theme configuration
 */
const DEFAULT_SHIKI_THEMES: ShikiThemeConfig = {
	light: "github-light-default",
	dark: "github-dark-default",
};

/**
 * Normalize theme configuration from user input to a consistent format.
 * Accepts:
 * - undefined: uses default themes (github-light/github-dark)
 * - string: uses the same theme for both light and dark
 * - { light, dark }: uses specified themes for each mode
 * - Custom object: treated as a single theme for both modes
 *
 * Theme values can be:
 * - Built-in theme names (e.g., "github-light", "nord", "dracula")
 * - Paths to theme JSON files
 * - Custom theme objects following Shiki's theme schema
 */
function normalizeThemeConfig(
	theme: string | { light: string; dark: string } | Record<string, unknown> | undefined,
): ShikiThemeConfig {
	if (!theme) {
		return { ...DEFAULT_SHIKI_THEMES };
	}

	if (typeof theme === "string") {
		// Single theme name - use for both light and dark
		return { light: theme, dark: theme };
	}

	if ("light" in theme && "dark" in theme && typeof theme.light === "string" && typeof theme.dark === "string") {
		// Explicit light/dark configuration
		return { light: theme.light, dark: theme.dark };
	}

	// Custom theme object - use for both modes
	return { light: theme, dark: theme };
}

/**
 * Generate markdown documentation for a single API.
 *
 * Orchestrates the 5 build stages:
 * 1. prepareWorkItems — categorize items, build cross-link data, flatten work items
 * 2. generatePages — generate page content, hash, resolve timestamps
 * 3. writeFiles — write changed files to disk
 * 4. writeMetadata — write root _meta.json, main index, category _meta.json files
 * 5. cleanupAndCommit — batch upsert snapshots, delete stale/orphan files
 *
 * Returns the CrossLinkData for this API so callers can merge cross-link data
 * across multiple APIs.
 */
async function generateApiDocs(
	config: {
		apiPackage: ApiPackage;
		packageName: string;
		apiName?: string;
		outputDir: string;
		baseRoute: string;
		categories: Record<string, CategoryConfig>;
		source?: SourceConfig;
		packageJson?: PackageJson;
		suppressExampleErrors?: boolean;
		llmsPlugin?: LlmsPluginOptions;
		siteUrl?: string;
		ogImage?: OpenGraphImageConfig;
		docsDir?: string;
		docsRoot?: string;
		theme?: ShikiThemeConfig;
	},
	shikiCrossLinker: ShikiCrossLinker,
	snapshotManager: SnapshotManager,
	ogResolver: OpenGraphResolver | null,
	fileContextMap: Map<string, { api?: string; version?: string; file: string }>,
	highlighter?: Highlighter,
	hideCutTransformer?: ShikiTransformer,
	hideCutLinesTransformer?: ShikiTransformer,
	twoslashTransformer?: ShikiTransformer,
): Promise<CrossLinkData> {
	const {
		apiPackage,
		packageName,
		apiName,
		outputDir,
		baseRoute,
		categories,
		source,
		packageJson,
		suppressExampleErrors = true,
		llmsPlugin,
		siteUrl,
		ogImage,
	} = config;

	const resolvedOutputDir = path.resolve(process.cwd(), outputDir);
	const buildTime = new Date().toISOString();

	// Load existing snapshots from database for this outputDir
	const existingSnapshots = new Map<string, import("./snapshot-manager.js").FileSnapshot>();
	for (const snapshot of snapshotManager.getSnapshotsForOutputDir(resolvedOutputDir)) {
		existingSnapshots.set(snapshot.filePath, snapshot);
	}

	// Create the output directory if it doesn't exist
	await fs.promises.mkdir(resolvedOutputDir, { recursive: true });

	// Phase 1: Prepare work items and cross-link data
	const { workItems, crossLinkData } = prepareWorkItems({
		apiPackage,
		categories,
		baseRoute,
		packageName,
	});

	// Initialize cross-linkers with the prepared data
	markdownCrossLinker.initialize(ApiParser.categorizeApiItems(apiPackage, categories), baseRoute, categories);
	// API scope is derived from baseRoute to match file path inference in remark plugins
	// e.g., baseRoute "/example-module" -> scope "example-module"
	// When baseRoute is "/" (single-API mode), fall back to packageName to ensure a non-empty scope
	const apiScope = baseRoute.replace(/^\//, "").split("/")[0] || packageName;
	shikiCrossLinker.reinitialize(crossLinkData.routes, crossLinkData.kinds, apiScope);
	TwoslashManager.addTypeRoutes(crossLinkData.routes);

	// Register VFS config for the remark plugin
	if (highlighter) {
		VfsRegistry.register(apiScope, {
			vfs: new Map(),
			highlighter,
			twoslashTransformer,
			crossLinker: shikiCrossLinker,
			hideCutTransformer,
			hideCutLinesTransformer,
			packageName,
			apiScope,
			theme: config.theme,
		});
	}

	// Calculate concurrency
	const cpuCores = os.cpus().length;
	const pageConcurrency = Math.max(cpuCores > 4 ? cpuCores - 1 : cpuCores, 2);

	// Phase 2+3: Generate pages and write files via Stream pipeline
	console.log(
		`📝 Generating ${workItems.length} pages across ${Object.keys(categories).length} categories in parallel`,
	);
	const fileResults = await Effect.runPromise(
		buildPipelineForApi({
			workItems,
			baseRoute,
			packageName,
			apiScope,
			apiName,
			source,
			buildTime,
			resolvedOutputDir,
			pageConcurrency,
			existingSnapshots,
			suppressExampleErrors,
			llmsPlugin,
			ogResolver,
			siteUrl,
			ogImage,
		}),
	);
	console.log(`✅ Generated ${fileResults.filter((r) => r.status !== "unchanged").length} pages`);

	// Track generated files and file context
	const generatedFiles = new Set<string>();
	for (const r of fileResults) {
		generatedFiles.add(r.relativePathWithExt);
		fileContextMap.set(r.absolutePath, {
			api: apiName,
			version: packageJson?.version,
			file: r.relativePathWithExt,
		});
	}

	// Phase 4: Write metadata (root _meta.json, main index, category _meta.json)
	await writeMetadata({
		fileResults,
		categories,
		resolvedOutputDir,
		snapshotManager,
		existingSnapshots,
		buildTime,
		baseRoute,
		packageName,
		apiName,
		generatedFiles,
	});

	// Phase 5: Cleanup and commit snapshots
	await cleanupAndCommit({
		fileResults,
		snapshotManager,
		resolvedOutputDir,
		generatedFiles,
	});

	const changedCount = fileResults.filter((r) => r.status !== "unchanged").length;
	console.log(`✅ Generated ${changedCount} API documentation files for ${packageName}`);

	return crossLinkData;
}

/**
 * RSPress plugin for generating API documentation from API Extractor model files
 */
export function ApiExtractorPlugin(options: ApiExtractorPluginOptions): RspressPlugin {
	// Create instances once at plugin initialization and reuse across all builds
	const shikiCrossLinker = new ShikiCrossLinker();
	// Use the singleton transformers for signature formatting
	// - MemberFormatTransformer: for member signatures (hides wrapper lines + cut + imports)
	// - HideCutLinesTransformer: for full signatures (hides only cut + imports)
	const hideCutTransformer = MemberFormatTransformer;
	const hideCutLinesTransformer = HideCutLinesTransformer;

	// Create logger and stats collectors at plugin level (shared across hooks)
	// Support LOG_LEVEL environment variable as override (useful for CI/debugging)
	const envLogLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
	const logLevel = envLogLevel || options.logLevel || "info";
	// Phase 1: Minimal Effect runtime with available services
	// LogLevel "none" is not supported by PluginLoggerLayer, fall back to "info"
	const effectLogLevel = logLevel === "none" ? "info" : logLevel;
	const EffectAppLayer = Layer.mergeAll(
		PathDerivationServiceLive,
		PluginLoggerLayer(effectLogLevel),
		TypeRegistryServiceLive,
	);
	const effectRuntime = ManagedRuntime.make(EffectAppLayer);

	// File context map (reset in beforeBuild for each build)
	const fileContextMap = new Map<string, { api?: string; version?: string; file: string }>();

	// Verbose check helper
	const isVerbose = logLevel === "verbose" || logLevel === "debug";

	// Shiki highlighter (initialized once in beforeBuild)
	let shikiHighlighter: Highlighter | undefined;

	// Combined VFS for all APIs (populated in beforeBuild, accessed by remark plugins)
	let combinedVfs: Map<string, string> | undefined;

	// Capture RSPress root directory for OG image auto-detection
	let docsRoot: string | undefined;

	// Build start time for duration tracking
	let buildStartTime: number = 0;

	// Track first build to avoid repeating summary on HMR rebuilds
	let isFirstBuild = true;

	return {
		name: "rspress-plugin-api-docs",

		// Styles are now imported directly in components via SCSS

		// Use beforeBuild hook to generate markdown files before the build starts
		async beforeBuild(_config: UserConfig, _isProd: boolean): Promise<void> {
			buildStartTime = performance.now();

			// Clear VFS registry from previous builds to avoid stale configs
			VfsRegistry.clear();

			if (isVerbose) {
				console.log("🚀 RSPress API Extractor Plugin");
			}

			// Clear file context map for this build
			fileContextMap.clear();

			// Read RSPress config for multiVersion and locales
			const rspressMultiVersion = (_config as { multiVersion?: { default: string; versions: string[] } }).multiVersion;
			const rspressLocales = (_config as { locales?: Array<{ lang: string }> }).locales?.map((l) => l.lang) ?? [];
			const rspressLang = (_config as { lang?: string }).lang;
			const rspressRoot = docsRoot || process.cwd();

			// Initialize snapshot manager
			const dbPath = path.resolve(process.cwd(), "api-docs-snapshot.db");
			const snapshotManager = new SnapshotManager(dbPath);

			// Initialize OG resolver if siteUrl is configured
			const ogResolver = options.siteUrl ? new OpenGraphResolver({ siteUrl: options.siteUrl, docsRoot }) : null;

			// Collect virtual file systems for all APIs to enable Twoslash
			combinedVfs = new Map<string, string>();

			// First, collect all API data and VFS before generating docs
			const apiConfigs: Array<{
				apiPackage: ApiPackage;
				packageName: string;
				apiName?: string;
				outputDir: string;
				baseRoute: string;
				categories: Record<string, CategoryConfig>;
				source?: SourceConfig;
				packageJson?: PackageJson;
				llmsPlugin?: LlmsPluginOptions;
				siteUrl?: string;
				ogImage?: OpenGraphImageConfig;
				docsDir?: string;
				docsRoot?: string;
				theme?: ShikiThemeConfig;
			}> = [];

			// Collect all external packages to load
			const allExternalPackages: ExternalPackageSpec[] = [];

			// Track the first API-level tsconfig/compilerOptions for TypeScript config resolution
			let firstApiTsconfig: SingleApiConfig["tsconfig"] | MultiApiConfig["tsconfig"];
			let firstApiCompilerOptions: SingleApiConfig["compilerOptions"] | MultiApiConfig["compilerOptions"];

			try {
				const categoryResolver = new CategoryResolver();
				const pluginDefaults = categoryResolver.mergeCategories(DEFAULT_CATEGORIES, options.defaultCategories);

				const loadStart = performance.now();

				/** Helper to process a single API model (shared by single and multi modes) */
				const processSimpleApi = async (
					api: SingleApiConfig | MultiApiConfig,
					model: NonNullable<SingleApiConfig["model"]> | MultiApiConfig["model"],
					outputDir: string,
					fullRoute: string,
				) => {
					const { apiPackage, source: loaderSource } = await ApiModelLoader.loadApiModel(model);
					const resolvedCategories = categoryResolver.resolveCategoryConfig(pluginDefaults, api.categories);
					const resolvedSource = categoryResolver.resolveSourceConfig(api.source, loaderSource);
					const resolvedLlms = mergeLlmsPluginConfig(options.llmsPlugin, api.llmsPlugin);

					// Load package.json
					const packageJson = api.packageJson ? await ApiModelLoader.loadPackageJson(api.packageJson) : undefined;

					// Validate that explicit externalPackages don't conflict with peerDependencies
					validateExternalPackages(api.externalPackages, packageJson);

					// Collect external packages (explicit config takes precedence, then auto-detected from package.json)
					const externalPackages =
						api.externalPackages || extractAutoDetectedPackages(packageJson, api.autoDetectDependencies);

					// Track external packages
					if (externalPackages && externalPackages.length > 0) {
						Effect.runSync(Metric.incrementBy(BuildMetrics.externalPackagesTotal, externalPackages.length));
					}

					// Generate virtual file system from API model for Twoslash
					const pkg = ApiExtractedPackage.fromPackage(apiPackage, api.packageName);
					const vfs = pkg.generateVfs();
					prependImportsToVfs(vfs, apiPackage, api.packageName);

					// Resolve ogImage with cascading: API > global
					const resolvedOgImage = api.ogImage ?? options.ogImage;

					// Normalize theme configuration
					const resolvedTheme = normalizeThemeConfig(api.theme);

					return {
						vfs,
						externalPackages: externalPackages || [],
						config: {
							apiPackage,
							packageName: api.packageName,
							apiName: api.name,
							outputDir,
							baseRoute: fullRoute,
							categories: resolvedCategories,
							source: resolvedSource,
							packageJson,
							llmsPlugin: resolvedLlms,
							siteUrl: options.siteUrl,
							ogImage: resolvedOgImage,
							docsDir: path.dirname(outputDir),
							docsRoot,
							theme: resolvedTheme,
						},
					};
				};

				if (options.api) {
					// === Single-API mode ===
					const api = options.api;
					const baseRoute = normalizeBaseRoute(api.baseRoute ?? "/");

					// Capture tsconfig for later resolution
					firstApiTsconfig = api.tsconfig;
					firstApiCompilerOptions = api.compilerOptions;

					if (rspressMultiVersion && api.versions) {
						// Versioned single-API mode
						const versionResults = await Promise.all(
							Object.entries(api.versions).map(async ([version, versionValue]) => {
								// Normalize version value to VersionConfig
								const versionConfig: VersionConfig = isVersionConfig(versionValue)
									? versionValue
									: { model: versionValue };

								const {
									apiPackage,
									packageJson: versionPackageJson,
									categories: versionCategories,
									source: versionSource,
									externalPackages: versionExternalPackages,
									autoDetectDependencies: versionAutoDetectDependencies,
									llmsPlugin: versionLlms,
									ogImage: versionOgImage,
								} = await ApiModelLoader.loadVersionModel(versionConfig);

								Effect.runSync(Metric.increment(BuildMetrics.apiVersionsLoaded));
								const resolvedCategories = categoryResolver.resolveCategoryConfig(
									pluginDefaults,
									api.categories,
									versionCategories,
								);
								const resolvedSource = categoryResolver.resolveSourceConfig(api.source, versionSource);
								const resolvedLlms = mergeLlmsPluginConfig(options.llmsPlugin, api.llmsPlugin, versionLlms);

								// Load package.json (version config takes precedence, then package-level config)
								const packageJson =
									versionPackageJson ||
									(api.packageJson ? await ApiModelLoader.loadPackageJson(api.packageJson) : undefined);

								// Validate that explicit externalPackages don't conflict with peerDependencies
								validateExternalPackages(versionExternalPackages || api.externalPackages, packageJson);

								// Collect external packages (version > package > auto-detected)
								const autoDetectOptions = versionAutoDetectDependencies || api.autoDetectDependencies;
								const externalPackages =
									versionExternalPackages ||
									api.externalPackages ||
									extractAutoDetectedPackages(packageJson, autoDetectOptions);

								// Track external packages
								if (externalPackages && externalPackages.length > 0) {
									Effect.runSync(Metric.incrementBy(BuildMetrics.externalPackagesTotal, externalPackages.length));
								}

								// Generate virtual file system from API model for Twoslash
								const pkg = ApiExtractedPackage.fromPackage(apiPackage, api.packageName);
								const vfs = pkg.generateVfs();
								prependImportsToVfs(vfs, apiPackage, api.packageName);

								// Use deriveOutputPaths for versioned paths (supports i18n + versioned cross-product)
								const versionDerivedPaths = deriveOutputPaths({
									mode: "single",
									docsRoot: rspressRoot,
									baseRoute,
									apiFolder: api.apiFolder ?? "api",
									locales: rspressLocales,
									defaultLang: rspressLang,
									versions: [version],
									defaultVersion: rspressMultiVersion?.default,
								});
								// Use the first derived path for this version (non-i18n case)
								// When i18n is active, we'd need to iterate all locale variants
								const versionDp = versionDerivedPaths[0];
								if (!versionDp) {
									return {
										vfs: new Map<string, string>(),
										externalPackages: [] as Array<{ name: string; version: string }>,
										config: null,
									};
								}
								const outputDir = versionDp.outputDir;
								const fullRoute = versionDp.routeBase;

								// Resolve ogImage with cascading: version > API > global
								const resolvedOgImage = versionOgImage ?? api.ogImage ?? options.ogImage;

								// Normalize theme configuration (versioned APIs use package-level theme)
								const resolvedTheme = normalizeThemeConfig(api.theme);

								return {
									vfs,
									externalPackages: externalPackages || [],
									config: {
										apiPackage,
										packageName: `${api.packageName} (${version})`,
										apiName: api.name,
										outputDir,
										baseRoute: fullRoute,
										categories: resolvedCategories,
										source: resolvedSource,
										packageJson,
										llmsPlugin: resolvedLlms,
										siteUrl: options.siteUrl,
										ogImage: resolvedOgImage,
										docsDir: path.dirname(outputDir),
										docsRoot,
										theme: resolvedTheme,
									},
								};
							}),
						);

						// Flatten and merge version results
						for (const result of versionResults) {
							for (const [filepath, content] of result.vfs.entries()) {
								combinedVfs.set(filepath, content);
							}
							if (result.externalPackages.length > 0) {
								allExternalPackages.push(...result.externalPackages);
							}
							if (result.config) {
								apiConfigs.push(result.config);
							}
						}
					} else {
						// Non-versioned single-API mode
						const derivedPaths = deriveOutputPaths({
							mode: "single",
							docsRoot: rspressRoot,
							baseRoute,
							apiFolder: api.apiFolder ?? "api",
							locales: rspressLocales,
							defaultLang: rspressLang,
							versions: [],
							defaultVersion: undefined,
						});

						// For single non-versioned, use the first derived path
						const dp = derivedPaths[0];
						if (dp && api.model) {
							const result = await processSimpleApi(api, api.model, dp.outputDir, dp.routeBase);
							for (const [filepath, content] of result.vfs.entries()) {
								combinedVfs.set(filepath, content);
							}
							if (result.externalPackages.length > 0) {
								allExternalPackages.push(...result.externalPackages);
							}
							apiConfigs.push(result.config);
						}
					}
				} else if (options.apis) {
					// === Multi-API mode ===
					// Deterministically select tsconfig: first API with tsconfig wins
					// Warn if multiple APIs specify different tsconfigs
					const apisWithTsconfig = options.apis.filter((a) => a.tsconfig);
					if (apisWithTsconfig.length > 0) {
						firstApiTsconfig = apisWithTsconfig[0].tsconfig;
						const uniqueTsconfigs = new Set(apisWithTsconfig.map((a) => String(a.tsconfig)));
						if (uniqueTsconfigs.size > 1) {
							console.warn(
								`⚠️  Multiple APIs specify different tsconfig values: ${[...uniqueTsconfigs].join(", ")}. ` +
									`Using '${String(firstApiTsconfig)}' for TypeScript resolution. ` +
									`Per-API tsconfig resolution will be supported in a future release.`,
							);
						}
					}
					const apisWithCompilerOptions = options.apis.filter((a) => a.compilerOptions);
					if (apisWithCompilerOptions.length > 0) {
						firstApiCompilerOptions = apisWithCompilerOptions[0].compilerOptions;
					}

					const multiResults = await Promise.all(
						options.apis.map(async (api) => {
							const baseRoute = normalizeBaseRoute(api.baseRoute ?? `/${unscopedName(api.packageName)}`);

							const derivedPaths = deriveOutputPaths({
								mode: "multi",
								docsRoot: rspressRoot,
								baseRoute,
								apiFolder: api.apiFolder ?? "api",
								locales: rspressLocales,
								defaultLang: rspressLang,
								versions: [],
								defaultVersion: undefined,
							});

							const dp = derivedPaths[0];
							if (!dp) return [];

							const result = await processSimpleApi(api, api.model, dp.outputDir, dp.routeBase);
							return [result];
						}),
					);

					// Flatten and merge results
					for (const results of multiResults) {
						for (const result of results) {
							for (const [filepath, content] of result.vfs.entries()) {
								combinedVfs.set(filepath, content);
							}
							if (result.externalPackages.length > 0) {
								allExternalPackages.push(...result.externalPackages);
							}
							apiConfigs.push(result.config);
						}
					}
				}

				const loadMs = performance.now() - loadStart;
				if (isVerbose) {
					console.log(`⏱  Loading API models: ${loadMs.toFixed(0)}ms`);
				}

				// Resolve TypeScript compiler options from configuration cascade
				// Uses project root (cwd) for resolving tsconfig.json paths
				const projectRoot = process.cwd();
				// Construct TypeScriptConfig from API-level fields (tsconfig/compilerOptions now live on api/apis)
				const globalTsConfig =
					firstApiTsconfig || firstApiCompilerOptions
						? { tsconfig: firstApiTsconfig, compilerOptions: firstApiCompilerOptions }
						: undefined;
				const resolvedCompilerOptions: TypeResolutionCompilerOptions = await resolveTypeScriptConfig(
					projectRoot,
					globalTsConfig,
				);

				console.log(
					`📝 Resolved TypeScript config: target=${resolvedCompilerOptions.target}, ` +
						`module=${resolvedCompilerOptions.module}, lib=[${resolvedCompilerOptions.lib?.join(", ")}]`,
				);

				// Load external package types and create TypeScript environment cache
				// Note: We ALWAYS create the TypeScript cache to ensure lib files are loaded,
				// even if there are no external packages to fetch
				let tsEnvCache: Map<string, VirtualTypeScriptEnvironment> | undefined;

				if (allExternalPackages.length > 0) {
					const typesStart = performance.now();

					const loadProgram = Effect.gen(function* () {
						const registry = yield* TypeRegistryService;
						const result = yield* registry.loadPackages(allExternalPackages);

						// Create TypeScript cache with loaded packages
						const cache = yield* registry.createTypeScriptCache(allExternalPackages, resolvedCompilerOptions);
						return { vfs: result.vfs, cache };
					});

					const { vfs: externalVfs, cache } = await effectRuntime.runPromise(loadProgram);

					// Merge external package VFS into combined VFS
					if (combinedVfs) {
						for (const [filePath, content] of externalVfs.entries()) {
							combinedVfs.set(filePath, content);
						}
					}

					tsEnvCache = cache;
					console.log(`✅ Loaded types for ${allExternalPackages.length} package(s)`);

					if (isVerbose) {
						console.log(`⏱  Loading external package types: ${(performance.now() - typesStart).toFixed(0)}ms`);
					}
				} else {
					// No external packages, but still create TypeScript cache to load lib files
					// This ensures built-in types like Array, Promise, etc. are available in Twoslash
					const cacheProgram = Effect.gen(function* () {
						const registry = yield* TypeRegistryService;
						return yield* registry.createTypeScriptCache([], resolvedCompilerOptions);
					});
					tsEnvCache = await effectRuntime.runPromise(cacheProgram);
					console.log("✅ Created TypeScript environment cache with lib files (no external packages)");
				}

				// Initialize Twoslash BEFORE generating API docs
				// VFS now includes both package's own types and external dependencies
				const twoslashStartMs = performance.now();
				TwoslashManager.getInstance().initialize(
					combinedVfs,
					undefined,
					undefined,
					tsEnvCache,
					resolvedCompilerOptions,
				);
				if (isVerbose) {
					console.log(`⏱  Initializing Twoslash: ${(performance.now() - twoslashStartMs).toFixed(0)}ms`);
				}

				// Pre-initialize Shiki highlighter for better performance
				const shikiStartMs = performance.now();

				// Collect all unique themes from API configs
				// Uses Set for string themes and array for custom theme objects
				const themeSet = new Set<string>();
				const customThemes: Array<Record<string, unknown>> = [];

				for (const config of apiConfigs) {
					const theme = config.theme ?? { light: DEFAULT_SHIKI_THEMES.light, dark: DEFAULT_SHIKI_THEMES.dark };

					// Add light theme
					if (typeof theme.light === "string") {
						themeSet.add(theme.light);
					} else if (typeof theme.light === "object") {
						customThemes.push(theme.light as Record<string, unknown>);
					}

					// Add dark theme
					if (typeof theme.dark === "string") {
						themeSet.add(theme.dark);
					} else if (typeof theme.dark === "object") {
						customThemes.push(theme.dark as Record<string, unknown>);
					}
				}

				// Ensure defaults are always loaded (used by remark-with-api for files outside API docs)
				if (typeof DEFAULT_SHIKI_THEMES.light === "string") {
					themeSet.add(DEFAULT_SHIKI_THEMES.light);
				}
				if (typeof DEFAULT_SHIKI_THEMES.dark === "string") {
					themeSet.add(DEFAULT_SHIKI_THEMES.dark);
				}

				// Combine string theme names and custom theme objects
				const themes: Array<string | Record<string, unknown>> = [...themeSet, ...customThemes];

				const langs = ["typescript", "javascript", "json", "bash", "sh"];
				shikiHighlighter = await createHighlighter({
					themes,
					langs,
				});
				if (isVerbose) {
					console.log(`⏱  Initializing Shiki highlighter: ${(performance.now() - shikiStartMs).toFixed(0)}ms`);
				}

				// Generate API documentation with VFS mode for faster rendering
				// Use bounded parallelism (limit 2) to avoid SQLite contention while improving performance
				console.log("📝 Generating API documentation...");
				const pageGenStart = performance.now();
				await Effect.runPromise(
					Effect.forEach(
						apiConfigs,
						(config) =>
							Effect.promise(async () => {
								const configStart = performance.now();

								await generateApiDocs(
									{
										...config,
										suppressExampleErrors: options.errors?.example !== "show",
									},
									shikiCrossLinker,
									snapshotManager,
									ogResolver,
									fileContextMap,
									shikiHighlighter,
									hideCutTransformer,
									hideCutLinesTransformer,
									TwoslashManager.getInstance().getTransformer() ?? undefined,
								);

								if (isVerbose) {
									console.log(
										`⏱  Generating docs for ${config.packageName}: ${(performance.now() - configStart).toFixed(0)}ms`,
									);
								}
							}),
						{ concurrency: 2 },
					),
				);
				const pageGenMs = performance.now() - pageGenStart;
				console.log(`📝 Page generation completed in ${pageGenMs.toFixed(0)}ms`);

				// Close snapshot manager connection
				snapshotManager.close();
				console.log("💾 Closed snapshot database");

				const totalTime = ((performance.now() - buildStartTime) / 1000).toFixed(2);
				console.log(`✅ API documentation complete (${totalTime}s)`);
			} catch (error) {
				console.error(
					`❌ Error generating API documentation: ${error instanceof Error ? error.message : String(error)}`,
				);
				throw error;
			}
		},

		// Use afterBuild hook to log statistics
		async afterBuild(): Promise<void> {
			// Only emit detailed summary on first build (skip on HMR rebuilds to reduce noise)
			if (isFirstBuild) {
				// Log build summary via Effect metrics
				await effectRuntime.runPromise(logBuildSummary);

				// Mark first build as complete
				isFirstBuild = false;
			}

			// Dispose Effect runtime (guaranteed cleanup of all scoped resources)
			await effectRuntime.dispose();
		},

		// Use config hook to modify RSPress configuration
		config(_config: UserConfig): UserConfig {
			// Validate plugin options against RSPress config
			validatePluginOptions(options, _config as { multiVersion?: { default: string; versions: string[] } });

			// Capture docs root for OG image auto-detection (resolve to absolute path)
			if (_config.root) {
				docsRoot = path.isAbsolute(_config.root) ? _config.root : path.resolve(process.cwd(), _config.root);
			}

			// Read RSPress config values for path derivation
			const rspressRoot = docsRoot || process.cwd();
			const rspressLocales = (_config as { locales?: Array<{ lang: string }> }).locales?.map((l) => l.lang) ?? [];
			const rspressLang = (_config as { lang?: string }).lang;
			const rspressMultiVersion = (_config as { multiVersion?: { default: string; versions: string[] } }).multiVersion;

			// Pre-create output directories so RSPress's auto-nav-sidebar doesn't fail
			// This runs before beforeBuild, so directories must exist for _meta.json processing
			if (options.api) {
				const api = options.api;
				const baseRoute = normalizeBaseRoute(api.baseRoute ?? "/");
				const versions = rspressMultiVersion?.versions ?? [];
				const derivedPaths = deriveOutputPaths({
					mode: "single",
					docsRoot: rspressRoot,
					baseRoute,
					apiFolder: api.apiFolder ?? "api",
					locales: rspressLocales,
					defaultLang: rspressLang,
					versions,
					defaultVersion: rspressMultiVersion?.default,
				});
				for (const dp of derivedPaths) {
					fs.mkdirSync(dp.outputDir, { recursive: true });
				}
			} else if (options.apis) {
				for (const api of options.apis) {
					const baseRoute = normalizeBaseRoute(api.baseRoute ?? `/${unscopedName(api.packageName)}`);
					const derivedPaths = deriveOutputPaths({
						mode: "multi",
						docsRoot: rspressRoot,
						baseRoute,
						apiFolder: api.apiFolder ?? "api",
						locales: rspressLocales,
						defaultLang: rspressLang,
						versions: [],
						defaultVersion: undefined,
					});
					for (const dp of derivedPaths) {
						fs.mkdirSync(dp.outputDir, { recursive: true });
					}
				}
			}

			// Inject Shiki transformer for cross-linking type references in code blocks
			const updatedConfig = { ..._config };

			// Ensure runtime components are included for proper module resolution
			// This allows RSPress to bundle the runtime components in all environments
			if (!updatedConfig.builderConfig) {
				updatedConfig.builderConfig = {};
			}
			if (!updatedConfig.builderConfig.source) {
				updatedConfig.builderConfig.source = {};
			}
			const existingInclude = updatedConfig.builderConfig.source.include || [];
			if (!existingInclude.includes("rspress-plugin-api-extractor/runtime")) {
				updatedConfig.builderConfig.source.include = [...existingInclude, "rspress-plugin-api-extractor/runtime"];
			}

			if (!updatedConfig.markdown) {
				updatedConfig.markdown = {};
			}

			// Add remark plugin for user-authored `with-api` code blocks
			if (!updatedConfig.markdown.remarkPlugins) {
				updatedConfig.markdown.remarkPlugins = [];
			}

			// Extract theme from the first API config for user-authored markdown files
			// (remarkWithApi runs globally, so we use the first API's theme as default)
			const firstApiTheme = options.api?.theme ?? options.apis?.[0]?.theme;
			const remarkTheme = normalizeThemeConfig(firstApiTheme);

			// This enables users to write ```typescript with-api blocks in their markdown
			// with full Twoslash support and cross-linking
			updatedConfig.markdown.remarkPlugins.push([
				remarkWithApi,
				{
					shikiCrossLinker,
					getTransformer: () => TwoslashManager.getInstance().getTransformer(),
					theme: remarkTheme,
				},
			]);

			// Add remark plugin for on-demand API code block rendering (dev mode)
			// This transforms raw code fences with api-signature/api-example metadata
			// into rendered HAST components during MDX compilation
			updatedConfig.markdown.remarkPlugins.push([remarkApiCodeblocks]);

			// Note: Deferred rendering architecture:
			// - Generated API docs output raw code fences with metadata (api-signature, api-example, etc.)
			// - The remarkApiCodeblocks plugin transforms them during MDX compilation (both dev and prod)
			// - This keeps MDX files clean and defers expensive Shiki/Twoslash processing to compile time
			// - User-authored `with-api` code blocks are processed by remarkWithApi plugin

			return updatedConfig;
		},
	};
}

/**
 * Prepend import statements for external type references to the VFS declaration files.
 *
 * This separates concerns: `ApiExtractedPackage` generates pure declarations,
 * while this helper adds import statements for external type references at the plugin layer.
 */
function prependImportsToVfs(vfs: VirtualFileSystem, apiPackage: ApiPackage, packageName: string): void {
	const extractor = new TypeReferenceExtractor(apiPackage, packageName);
	for (const entryPoint of apiPackage.entryPoints) {
		const imports = extractor.extractImportsForEntryPoint(entryPoint as ApiEntryPoint);
		const importStatements = TypeReferenceExtractor.formatImports(imports);
		if (importStatements.length === 0) continue;

		const entryName = (entryPoint as ApiEntryPoint).displayName || "";
		const fileName = entryName ? `${entryName}.d.ts` : "index.d.ts";
		const key = `node_modules/${packageName}/${fileName}`;
		const existing = vfs.get(key);
		if (existing) {
			vfs.set(key, `${importStatements.join("\n")}\n\n${existing}`);
		}
	}
}
