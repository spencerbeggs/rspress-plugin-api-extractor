/* v8 ignore start -- RSPress plugin adapter, requires RSPress runtime */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeFileSystem } from "@effect/platform-node";
import type { RspressPlugin, UserConfig } from "@rspress/core";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import type { GenerateApiDocsResult } from "./build-program.js";
import { generateApiDocs } from "./build-program.js";
import { mergeLlmsPluginConfig } from "./config-utils.js";
import { ConfigServiceLive } from "./layers/ConfigServiceLive.js";
import { PluginLoggerLayer, logBuildSummary } from "./layers/ObservabilityLive.js";
import { PathDerivationServiceLive } from "./layers/PathDerivationServiceLive.js";
import { SnapshotServiceLive } from "./layers/SnapshotServiceLive.js";
import { TypeRegistryServiceLive } from "./layers/TypeRegistryServiceLive.js";
import type { ShikiThemeConfig } from "./markdown/shiki-utils.js";
import { DEFAULT_SHIKI_THEMES } from "./markdown/shiki-utils.js";
import { deriveOutputPaths, normalizeBaseRoute, unscopedName } from "./path-derivation.js";
import { remarkApiCodeblocks } from "./remark-api-codeblocks.js";
import { remarkWithApi } from "./remark-with-api.js";
import type { LogLevel } from "./schemas/index.js";
import { PluginOptions } from "./schemas/index.js";
import { ConfigService } from "./services/ConfigService.js";
import { ShikiCrossLinker } from "./shiki-transformer.js";
import { TwoslashManager } from "./twoslash-transformer.js";
import { VfsRegistry } from "./vfs-registry.js";

/**
 * Normalize theme configuration from user input to a consistent format.
 */
function normalizeThemeConfig(
	theme: string | { light: string; dark: string } | Record<string, unknown> | undefined,
): ShikiThemeConfig {
	if (!theme) {
		return { ...DEFAULT_SHIKI_THEMES };
	}
	if (typeof theme === "string") {
		return { light: theme, dark: theme };
	}
	if ("light" in theme && "dark" in theme && typeof theme.light === "string" && typeof theme.dark === "string") {
		return { light: theme.light, dark: theme.dark };
	}
	return { light: theme, dark: theme };
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
	const dbPath = path.resolve(process.cwd(), "api-docs-snapshot.db");
	const BaseLayer = Layer.mergeAll(
		PathDerivationServiceLive,
		PluginLoggerLayer(logLevel),
		TypeRegistryServiceLive,
		NodeFileSystem.layer,
		SnapshotServiceLive(dbPath),
	);
	const EffectAppLayer = Layer.provideMerge(ConfigServiceLive(options, shikiCrossLinker), BaseLayer);
	const effectRuntime = ManagedRuntime.make(EffectAppLayer);

	// File context map (shared across hooks)
	const fileContextMap = new Map<string, { api?: string; version?: string; file: string }>();

	// Verbose check helper
	const isVerbose = logLevel === "verbose" || logLevel === "debug";

	// Capture RSPress root directory for OG image auto-detection
	let docsRoot: string | undefined;

	// Track first build to avoid repeating summary on HMR rebuilds
	let isFirstBuild = true;

	// LLMs post-processing state
	let rspressLlmsEnabled = false;
	let rspressOutDir = "dist";
	const buildResults: GenerateApiDocsResult[] = [];
	const resolvedLlmsPlugin = mergeLlmsPluginConfig(options.llmsPlugin);
	const packageRoutes = new Map<string, string>();

	return {
		name: "rspress-plugin-api-docs",

		// beforeBuild is intentionally empty — doc generation happens in config()
		// which runs BEFORE RSPress route scanning, ensuring generated files exist
		// on disk when routes are built (fixes cold-start issues in dev mode).
		async beforeBuild(_config: UserConfig, _isProd: boolean): Promise<void> {},

		// Use afterBuild hook to log statistics
		async afterBuild(_config: UserConfig, isProd: boolean): Promise<void> {
			// Only emit detailed summary on first build (skip on HMR rebuilds to reduce noise)
			if (isFirstBuild) {
				// Log build summary via Effect metrics
				await effectRuntime.runPromise(logBuildSummary);

				// Post-process LLMs files when RSPress llms plugin and our llmsPlugin are both enabled
				if (rspressLlmsEnabled && resolvedLlmsPlugin.enabled) {
					const { processLlmsFiles } = await import("./llms-program.js");
					await effectRuntime.runPromise(
						processLlmsFiles({
							outDir: path.resolve(process.cwd(), rspressOutDir),
							buildResults,
							llmsPlugin: resolvedLlmsPlugin,
							packageRoutes,
						}),
					);
				}

				// Mark first build as complete
				isFirstBuild = false;
			}

			// Only dispose the runtime in production builds.
			// In dev mode, the runtime must stay alive for HMR rebuilds —
			// disposing it would destroy the SnapshotService layer (DB connection)
			// and subsequent builds would fail.
			if (isProd) {
				await effectRuntime.dispose();
			}
		},

		// config() hook: runs BEFORE route scanning.
		// We generate API docs here so files exist when RSPress builds its route table.
		async config(_config: UserConfig): Promise<UserConfig> {
			const buildStartTime = performance.now();

			// Capture docs root for OG image auto-detection (resolve to absolute path)
			if (_config.root) {
				docsRoot = path.isAbsolute(_config.root) ? _config.root : path.resolve(process.cwd(), _config.root);
			}

			// Read RSPress config values for path derivation
			const rspressRoot = docsRoot || process.cwd();
			const rspressLocales = (_config as { locales?: Array<{ lang: string }> }).locales?.map((l) => l.lang) ?? [];
			const rspressLang = (_config as { lang?: string }).lang;
			const rspressMultiVersion = (_config as { multiVersion?: { default: string; versions: string[] } }).multiVersion;

			// Capture RSPress LLMs config for afterBuild processing
			rspressLlmsEnabled = Boolean((_config as { llms?: boolean | object }).llms);
			rspressOutDir = _config.outDir ?? "dist";

			// Pre-create output directories so RSPress's auto-nav-sidebar doesn't fail
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

			// === Generate API documentation ===
			// This runs in config() (before route scanning) so generated files
			// are on disk when RSPress builds its route table.
			VfsRegistry.clear();
			fileContextMap.clear();

			if (isVerbose) {
				console.log("🚀 RSPress API Extractor Plugin");
			}

			try {
				const rspressConfigSubset = {
					...(rspressMultiVersion != null ? { multiVersion: rspressMultiVersion } : {}),
					...(rspressLocales.length > 0 ? { locales: rspressLocales.map((lang) => ({ lang })) } : {}),
					...(rspressLang != null ? { lang: rspressLang } : {}),
					...(docsRoot != null ? { root: docsRoot } : {}),
				};

				await effectRuntime.runPromise(
					Effect.gen(function* () {
						const configSvc = yield* ConfigService;
						const buildContext = yield* configSvc.resolve(rspressConfigSubset);

						yield* Effect.logInfo("Generating API documentation...");

						// Clear previous build results (for HMR rebuilds)
						buildResults.length = 0;

						yield* Effect.forEach(
							buildContext.apiConfigs,
							(apiConfig) =>
								generateApiDocs(
									{ ...apiConfig, suppressExampleErrors: buildContext.suppressExampleErrors },
									buildContext,
									fileContextMap,
								).pipe(
									Effect.tap((result) => {
										buildResults.push(result);
										return Effect.void;
									}),
									Effect.tap(() =>
										isVerbose ? Effect.logDebug(`Generating docs for ${apiConfig.packageName}`) : Effect.void,
									),
								),
							{ concurrency: 2 },
						);
					}).pipe(Effect.scoped),
				);

				if (logLevel !== "none") {
					const totalTime = ((performance.now() - buildStartTime) / 1000).toFixed(2);
					console.log(`✅ API documentation complete (${totalTime}s)`);
				}
			} catch (error) {
				console.error(
					`❌ Error generating API documentation: ${error instanceof Error ? error.message : String(error)}`,
				);
				throw error;
			}

			// === RSPress configuration modifications ===
			const updatedConfig = { ..._config };

			// Ensure runtime components are included for proper module resolution
			if (!updatedConfig.builderConfig) {
				updatedConfig.builderConfig = {};
			}
			if (!updatedConfig.builderConfig.source) {
				updatedConfig.builderConfig.source = {};
			}

			// Replace RSPress's LlmsViewOptions with our custom version via resolve.alias.
			// This lets us extend the default dropdown with package-level actions.
			if (rspressLlmsEnabled && resolvedLlmsPlugin.enabled && resolvedLlmsPlugin.scopes) {
				if (!updatedConfig.builderConfig.resolve) {
					updatedConfig.builderConfig.resolve = {};
				}
				const pluginDir = path.dirname(fileURLToPath(import.meta.url));
				const customLlmsViewOptions = path.resolve(
					pluginDir,
					"../../src/runtime/components/ApiLlmsViewOptions/index.tsx",
				);
				// Use createRequire to resolve from the bundled plugin's location,
				// which has @rspress/core in its node_modules tree
				const pluginRequire = createRequire(import.meta.url);
				const rspressCoreDir = path.dirname(pluginRequire.resolve("@rspress/core/package.json"));
				const originalLlmsViewOptions = path.join(rspressCoreDir, "dist/theme/components/Llms/LlmsViewOptions.js");
				const existingAlias = (updatedConfig.builderConfig.resolve as Record<string, unknown>).alias;
				updatedConfig.builderConfig.resolve.alias = {
					...(typeof existingAlias === "object" && existingAlias !== null ? existingAlias : {}),
					[originalLlmsViewOptions]: customLlmsViewOptions,
				};
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

			const firstApiTheme = options.api?.theme ?? options.apis?.[0]?.theme;
			const remarkTheme = normalizeThemeConfig(firstApiTheme);

			updatedConfig.markdown.remarkPlugins.push([
				remarkWithApi,
				{
					shikiCrossLinker,
					getTransformer: () => TwoslashManager.getInstance().getTransformer(),
					theme: remarkTheme,
				},
			]);

			updatedConfig.markdown.remarkPlugins.push([remarkApiCodeblocks]);

			// Inject API scope metadata into themeConfig for the runtime UI component
			// (e.g., per-scope llms.txt links). Only when both RSPress llms plugin and our scopes are enabled.
			if (rspressLlmsEnabled && resolvedLlmsPlugin.enabled && resolvedLlmsPlugin.scopes) {
				// Populate the packageRoutes map (hoisted to plugin level for afterBuild use).
				// Maps packageName -> package-level route (without apiFolder).
				// e.g., "kitchensink" -> "/kitchensink" (not "/kitchensink/api")
				packageRoutes.clear();
				if (options.api) {
					packageRoutes.set(options.api.packageName, normalizeBaseRoute(options.api.baseRoute ?? "/"));
				} else if (options.apis) {
					for (const api of options.apis) {
						packageRoutes.set(
							api.packageName,
							normalizeBaseRoute(api.baseRoute ?? `/${unscopedName(api.packageName)}`),
						);
					}
				}

				const scopes = buildResults.map((result) => ({
					name: result.apiName ?? result.packageName,
					packageName: result.packageName,
					// packageRoute is the broader scope for UI matching (e.g., "/kitchensink")
					packageRoute: packageRoutes.get(result.packageName) ?? result.baseRoute,
					// baseRoute is the API-specific route (e.g., "/kitchensink/api")
					baseRoute: result.baseRoute,
					version: null, // TODO: populate from DerivedPath when version support is wired
					locale: null, // TODO: populate from DerivedPath when locale support is wired
					llmsTxt: `${packageRoutes.get(result.packageName) ?? result.baseRoute}/llms.txt`,
					llmsFullTxt: `${packageRoutes.get(result.packageName) ?? result.baseRoute}/llms-full.txt`,
					llmsDocsTxt: `${packageRoutes.get(result.packageName) ?? result.baseRoute}/llms-docs.txt`,
					llmsApiTxt: resolvedLlmsPlugin.apiTxt
						? `${packageRoutes.get(result.packageName) ?? result.baseRoute}/llms-api.txt`
						: null,
				}));

				if (!updatedConfig.themeConfig) {
					updatedConfig.themeConfig = {};
				}
				(updatedConfig.themeConfig as Record<string, unknown>).apiExtractorScopes = scopes;

				// Register the scope-aware LLM actions component as a global UI component.
				// Resolve the absolute path from this file's location. In the bundled
				// plugin (dist/index.js), import.meta.url points to the dist file, so
				// ../src/runtime/ navigates to the source runtime directory.
				if (!updatedConfig.globalUIComponents) {
					updatedConfig.globalUIComponents = [];
				}
				const llmsComponentPluginDir = path.dirname(fileURLToPath(import.meta.url));
				const llmsComponentPath = path.resolve(
					llmsComponentPluginDir,
					"../../src/runtime/components/ApiLlmsPackageActions/index.tsx",
				);
				updatedConfig.globalUIComponents.push(llmsComponentPath);
			}

			return updatedConfig;
		},
	};
}
