import fs from "node:fs";
import path from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import type { RspressPlugin, UserConfig } from "@rspress/core";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import type { CrossLinkData } from "./build-stages.js";
import { buildPipelineForApi, cleanupAndCommit, prepareWorkItems, writeMetadata } from "./build-stages.js";
import { ConfigServiceLive } from "./layers/ConfigServiceLive.js";
import { PluginLoggerLayer, logBuildSummary } from "./layers/ObservabilityLive.js";
import { PathDerivationServiceLive } from "./layers/PathDerivationServiceLive.js";
import { TypeRegistryServiceLive } from "./layers/TypeRegistryServiceLive.js";
import { ApiParser } from "./loader.js";
import { markdownCrossLinker } from "./markdown/index.js";
import type { ShikiThemeConfig } from "./markdown/shiki-utils.js";
import { DEFAULT_SHIKI_THEMES } from "./markdown/shiki-utils.js";
import { deriveOutputPaths, normalizeBaseRoute, unscopedName } from "./path-derivation.js";
import { remarkApiCodeblocks } from "./remark-api-codeblocks.js";
import { remarkWithApi } from "./remark-with-api.js";
import type { LogLevel } from "./schemas/index.js";
import { PluginOptions } from "./schemas/index.js";
import type { ResolvedApiConfig, ResolvedBuildContext } from "./services/ConfigService.js";
import { ConfigService } from "./services/ConfigService.js";
import { ShikiCrossLinker } from "./shiki-transformer.js";
import { TwoslashManager } from "./twoslash-transformer.js";

import type { VfsConfig } from "./vfs-registry.js";
import { VfsRegistry } from "./vfs-registry.js";

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
	apiConfig: ResolvedApiConfig & { suppressExampleErrors?: boolean },
	buildContext: ResolvedBuildContext,
	fileContextMap: Map<string, { api?: string; version?: string; file: string }>,
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
		llmsPlugin,
		siteUrl,
		ogImage,
	} = apiConfig;
	const suppressExampleErrors = apiConfig.suppressExampleErrors ?? true;

	const {
		snapshotManager,
		shikiCrossLinker,
		highlighter,
		hideCutTransformer,
		hideCutLinesTransformer,
		twoslashTransformer,
		ogResolver,
		pageConcurrency,
	} = buildContext;

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
		const vfsConfig: VfsConfig = {
			vfs: new Map(),
			highlighter,
			crossLinker: shikiCrossLinker,
			packageName,
			apiScope,
		};
		if (twoslashTransformer != null) vfsConfig.twoslashTransformer = twoslashTransformer;
		if (hideCutTransformer != null) vfsConfig.hideCutTransformer = hideCutTransformer;
		if (hideCutLinesTransformer != null) vfsConfig.hideCutLinesTransformer = hideCutLinesTransformer;
		if (apiConfig.theme != null) vfsConfig.theme = apiConfig.theme;
		VfsRegistry.register(apiScope, vfsConfig);
	}

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
			...(apiName != null ? { apiName } : {}),
			...(source != null ? { source } : {}),
			buildTime,
			resolvedOutputDir,
			pageConcurrency,
			existingSnapshots,
			...(suppressExampleErrors != null ? { suppressExampleErrors } : {}),
			...(llmsPlugin != null ? { llmsPlugin } : {}),
			...(ogResolver !== undefined ? { ogResolver } : {}),
			...(siteUrl != null ? { siteUrl } : {}),
			...(ogImage != null ? { ogImage } : {}),
		}).pipe(Effect.provide(NodeFileSystem.layer)),
	);
	console.log(`✅ Generated ${fileResults.filter((r) => r.status !== "unchanged").length} pages`);

	// Track generated files and file context
	const generatedFiles = new Set<string>();
	for (const r of fileResults) {
		generatedFiles.add(r.relativePathWithExt);
		const ctx: { api?: string; version?: string; file: string } = {
			file: r.relativePathWithExt,
		};
		if (apiName != null) ctx.api = apiName;
		if (packageJson?.version != null) ctx.version = packageJson.version;
		fileContextMap.set(r.absolutePath, ctx);
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
		...(apiName != null ? { apiName } : {}),
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
export function ApiExtractorPlugin(rawOptions: PluginOptions): RspressPlugin {
	// Validate and decode options at factory time — catches structural issues via ParseError
	const options = Schema.decodeUnknownSync(PluginOptions)(rawOptions);
	// Create instances once at plugin initialization and reuse across all builds
	const shikiCrossLinker = new ShikiCrossLinker();

	// Create logger and stats collectors at plugin level (shared across hooks)
	// Support LOG_LEVEL environment variable as override (useful for CI/debugging)
	const envLogLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
	const logLevel = envLogLevel || options.logLevel || "info";
	// Phase 1: Minimal Effect runtime with available services
	// LogLevel "none" is not supported by PluginLoggerLayer, fall back to "info"
	const effectLogLevel = logLevel === "none" ? "info" : logLevel;
	const BaseLayer = Layer.mergeAll(
		PathDerivationServiceLive,
		PluginLoggerLayer(effectLogLevel),
		TypeRegistryServiceLive,
		NodeFileSystem.layer,
	);
	const EffectAppLayer = Layer.provideMerge(ConfigServiceLive(options, shikiCrossLinker), BaseLayer);
	const effectRuntime = ManagedRuntime.make(EffectAppLayer);

	// File context map (reset in beforeBuild for each build)
	const fileContextMap = new Map<string, { api?: string; version?: string; file: string }>();

	// Verbose check helper
	const isVerbose = logLevel === "verbose" || logLevel === "debug";

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
			fileContextMap.clear();

			if (isVerbose) {
				console.log("🚀 RSPress API Extractor Plugin");
			}

			try {
				// Extract RSPress config values for ConfigService
				const rspressMultiVersion = (_config as { multiVersion?: { default: string; versions: string[] } })
					.multiVersion;
				const rspressLocales = (_config as { locales?: Array<{ lang: string }> }).locales?.map((l) => ({
					lang: l.lang,
				}));
				const rspressLang = (_config as { lang?: string }).lang;

				const rspressConfigSubset = {
					...(rspressMultiVersion != null ? { multiVersion: rspressMultiVersion } : {}),
					...(rspressLocales != null ? { locales: rspressLocales } : {}),
					...(rspressLang != null ? { lang: rspressLang } : {}),
					...(docsRoot != null ? { root: docsRoot } : {}),
				};

				// Resolve full build context via ConfigService
				const buildContext = await effectRuntime.runPromise(
					Effect.gen(function* () {
						const configSvc = yield* ConfigService;
						return yield* configSvc.resolve(rspressConfigSubset);
					}).pipe(Effect.scoped),
				);

				// Generate API documentation
				console.log("📝 Generating API documentation...");
				const pageGenStart = performance.now();

				await Effect.runPromise(
					Effect.forEach(
						buildContext.apiConfigs,
						(apiConfig) =>
							Effect.promise(async () => {
								const configStart = performance.now();
								await generateApiDocs(
									{ ...apiConfig, suppressExampleErrors: buildContext.suppressExampleErrors },
									buildContext,
									fileContextMap,
								);
								if (isVerbose) {
									console.log(
										`⏱  Generating docs for ${apiConfig.packageName}: ${(performance.now() - configStart).toFixed(0)}ms`,
									);
								}
							}),
						{ concurrency: 2 },
					),
				);

				const pageGenMs = performance.now() - pageGenStart;
				console.log(`📝 Page generation completed in ${pageGenMs.toFixed(0)}ms`);

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
