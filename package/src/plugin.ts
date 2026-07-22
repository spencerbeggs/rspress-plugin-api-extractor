/* v8 ignore start -- RSPress plugin adapter, requires RSPress runtime */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeFileSystem } from "@effect/platform-node";
import type { RspressPlugin, UserConfig } from "@rspress/core";
import { Effect, Layer, ManagedRuntime, Metric, Ref, Schema } from "effect";
import type { GenerateApiDocsResult } from "./build-program.js";
import { generateApiDocs } from "./build-program.js";
import { setBuildStagesEventEmitter } from "./build-stages.js";
import { fromDir, fromParentDir } from "./config-helpers.js";
import { mergeLlmsPluginConfig } from "./config-utils.js";
import { BuildMetrics } from "./layers/build-metrics.js";
import { ConfigServiceLive } from "./layers/ConfigServiceLive.js";
import { buildEventBus, logBuildSummary, makeSummaryLoggerLayer } from "./layers/ObservabilityLive.js";
import { PathDerivationServiceLive } from "./layers/PathDerivationServiceLive.js";
import { SnapshotServiceLive } from "./layers/SnapshotServiceLive.js";
import { TypeRegistryServiceLive } from "./layers/TypeRegistryServiceLive.js";
import { setLoaderEventEmitter } from "./loader.js";
import type { ShikiThemeConfig } from "./markdown/shiki-utils.js";
import { DEFAULT_SHIKI_THEMES, setShikiUtilsEventEmitter } from "./markdown/shiki-utils.js";
import { setModelLoaderEventEmitter } from "./model-loader.js";
import { emit, makeRuntimeEmitter } from "./observability/EventBus.js";
import { PluginEvent } from "./observability/events.js";
import type { ProgressPhase } from "./observability/heartbeat.js";
import { runHeartbeat } from "./observability/heartbeat.js";
import { writeIssuesJson } from "./observability/sinks/issues-sink.js";
import { setOgResolverEventEmitter } from "./og-resolver.js";
import { deriveOutputPaths, normalizeBaseRoute, unscopedName } from "./path-derivation.js";
import { setPrettierEventEmitter } from "./prettier-formatter.js";
import { remarkApiCodeblocks, setRemarkApiCodeblocksEventEmitter } from "./remark-api-codeblocks.js";
import { remarkWithApi, setRemarkWithApiEventEmitter } from "./remark-with-api.js";
import { PluginOptions } from "./schemas/index.js";
import { resolveObservability } from "./schemas/observability.js";
import { ConfigService } from "./services/ConfigService.js";
import { ShikiCrossLinker } from "./shiki-transformer.js";
import { TwoslashManager, setEventEmitter } from "./twoslash-transformer.js";
import { VfsRegistry } from "./vfs-registry.js";

/**
 * Best-effort read of the consuming site's `package.json` `name`, used to tag
 * the `.api-docs/build/issues.json` artifact. Falls back to "unknown" when the file
 * is missing or unreadable — never throws.
 */
function readSitePackageName(): string {
	try {
		const pkgJsonPath = path.resolve(process.cwd(), "package.json");
		const parsed: unknown = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
		if (parsed && typeof parsed === "object" && "name" in parsed && typeof parsed.name === "string") {
			return parsed.name;
		}
		return "unknown";
	} catch {
		return "unknown";
	}
}

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
function ApiExtractorPluginImpl(rawOptions: PluginOptions): RspressPlugin {
	// Validate and decode options at factory time — catches structural issues via ParseError
	const options = Schema.decodeUnknownSync(PluginOptions)(rawOptions);
	// Create instances once at plugin initialization and reuse across all builds
	const shikiCrossLinker = new ShikiCrossLinker();

	// Resolve unified observability config (logLevel, trace, thresholds).
	const envLogLevel = process.env.LOG_LEVEL?.toLowerCase();
	const buildId = `${process.pid}-${performance.now().toString(36)}`;
	const { resolved: obs, deprecations } = resolveObservability({
		...(options.observability ? { observability: options.observability } : {}),
		...(options.logLevel ? { logLevel: options.logLevel } : {}),
		...(options.performance
			? {
					performance: {
						...(options.performance.thresholds !== undefined ? { thresholds: options.performance.thresholds } : {}),
					},
				}
			: {}),
		...(envLogLevel ? { envLogLevel } : {}),
		cwd: process.cwd(),
		buildId,
	});
	const { layer: eventBusLayer, trace: traceSink, issues: issuesSink } = buildEventBus(obs);

	const dbPath = path.resolve(process.cwd(), ".api-docs", "snapshot", "api-docs.db");
	// SQLite opens the file eagerly at layer construction, so the snapshot
	// directory must exist first (cwd always does; `.api-docs/snapshot` may not).
	fs.mkdirSync(path.dirname(dbPath), { recursive: true });
	const BaseLayer = Layer.mergeAll(
		PathDerivationServiceLive,
		eventBusLayer,
		TypeRegistryServiceLive,
		NodeFileSystem.layer,
		SnapshotServiceLive(dbPath),
		makeSummaryLoggerLayer(obs.logLevel),
	);
	const EffectAppLayer = Layer.provideMerge(
		ConfigServiceLive(options, shikiCrossLinker, buildId, obs.thresholds),
		BaseLayer,
	);
	const effectRuntime = ManagedRuntime.make(EffectAppLayer);
	const emitSync = makeRuntimeEmitter(effectRuntime);
	setEventEmitter(emitSync, buildId);
	setLoaderEventEmitter(emitSync, buildId);
	setShikiUtilsEventEmitter(emitSync, buildId);
	setPrettierEventEmitter(emitSync, buildId);
	setOgResolverEventEmitter(emitSync, buildId);
	setRemarkWithApiEventEmitter(emitSync, buildId, obs.thresholds.slowCodeBlock);
	setRemarkApiCodeblocksEventEmitter(emitSync, buildId);
	setBuildStagesEventEmitter(emitSync, buildId);
	setModelLoaderEventEmitter(emitSync, buildId);

	// File context map (shared across hooks)
	const fileContextMap = new Map<string, { api?: string; version?: string; file: string }>();

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
				await effectRuntime.runPromise(logBuildSummary(obs.thresholds.slowCodeBlock));

				// Write .api-docs/build/issues.json (bundler-compatible schema) on prod builds only
				if (isProd) {
					await effectRuntime.runPromise(
						writeIssuesJson(issuesSink.snapshot(), {
							cwd: process.cwd(),
							packageName: readSitePackageName(),
							generatedAt: new Date().toISOString(),
						}),
					);
				}

				// Post-process LLMs files when RSPress llms plugin and our llmsPlugin are both enabled
				if (rspressLlmsEnabled && resolvedLlmsPlugin.enabled) {
					const { processLlmsFiles } = await import("./llms-program.js");
					await effectRuntime.runPromise(
						processLlmsFiles({
							outDir: path.resolve(process.cwd(), rspressOutDir),
							buildResults,
							llmsPlugin: resolvedLlmsPlugin,
							packageRoutes,
							buildId,
						}),
					);
				}

				// Mark first build as complete
				isFirstBuild = false;
			}

			if (traceSink) traceSink.flush();

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
		async config(_config: UserConfig, _utils: unknown, isProd: boolean): Promise<UserConfig> {
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

			for (const dep of deprecations) {
				emitSync(
					PluginEvent.DeprecatedConfigUsed({
						ctx: { buildId },
						level: "warn",
						key: dep.key,
						replacement: dep.replacement,
					}),
				);
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
						const apiCount = options.api ? 1 : (options.apis?.length ?? 0);
						yield* emit(PluginEvent.BuildStarted({ ctx: { buildId }, level: "info", mode: "prod", apiCount }));

						const phaseRef = yield* Ref.make<ProgressPhase>("resolve");
						if (isProd && obs.progressIntervalMs !== null) {
							yield* Effect.forkScoped(
								runHeartbeat({
									phaseRef,
									intervalMs: obs.progressIntervalMs,
									startTime: buildStartTime,
									apisTotal: apiCount,
									buildId,
								}),
							);
						}

						const configSvc = yield* ConfigService;
						const buildContext = yield* configSvc.resolve(rspressConfigSubset);

						// Clear previous build results (for HMR rebuilds)
						buildResults.length = 0;

						yield* Ref.set(phaseRef, "generate");

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
										return Metric.update(BuildMetrics.apisCompleted, 1);
									}),
								),
							{ concurrency: 2 },
						);

						yield* Ref.set(phaseRef, "done");

						const totalMs = performance.now() - buildStartTime;
						yield* emit(
							PluginEvent.BuildCompleted({ ctx: { buildId }, level: "info", durationMs: totalMs, totals: {} }),
						);
					}).pipe(Effect.scoped),
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				emitSync(PluginEvent.BuildFailed({ ctx: { buildId }, level: "error", phase: "generate", error: message }));
				if (traceSink) traceSink.flush();

				// Best-effort: write .api-docs/build/issues.json on the fatal path too, since
				// afterBuild (where this normally happens) never runs when config()
				// throws. Collision/model-load errors emitted above (RouteCollisionDetected,
				// ModelLoadFailed) would otherwise never reach disk. Never mask the
				// original build failure with a write failure.
				if (isProd) {
					try {
						await effectRuntime.runPromise(
							writeIssuesJson(issuesSink.snapshot(), {
								cwd: process.cwd(),
								packageName: readSitePackageName(),
								generatedAt: new Date().toISOString(),
							}),
						);
					} catch {
						// ignore — never mask the build failure
					}
				}

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
				// The runtime is emitted bundleless next to `index.js` (mirroring the
				// `src/runtime` tree), so each component has its own published `.js`
				// file. This zero-level resolve is layout-invariant across the dev
				// (`dist/dev`) and published (flat root) layouts. RSPress compiles the
				// referenced file, resolving `import.meta.env.SSG_MD` per build.
				const customLlmsViewOptions = path.resolve(pluginDir, "runtime/components/ApiLlmsViewOptions/index.js");
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
				// The runtime is emitted bundleless next to `index.js`, so this
				// zero-level resolve to the component's published `.js` is layout-
				// invariant across the dev and published package shapes. RSPress
				// compiles it, resolving `import.meta.env.SSG_MD` per build.
				if (!updatedConfig.globalUIComponents) {
					updatedConfig.globalUIComponents = [];
				}
				const llmsComponentPluginDir = path.dirname(fileURLToPath(import.meta.url));
				const llmsComponentPath = path.resolve(
					llmsComponentPluginDir,
					"runtime/components/ApiLlmsPackageActions/index.js",
				);
				updatedConfig.globalUIComponents.push(llmsComponentPath);
			}

			return updatedConfig;
		},
	};
}

/**
 * RSPress plugin for generating API documentation from API Extractor model
 * files. Config helpers are available under `ApiExtractorPlugin.api` (single
 * package → one config for the `api:` option) and `ApiExtractorPlugin.apis`
 * (parent directory → array for the `apis:` option).
 *
 * @public
 */
export const ApiExtractorPlugin = Object.assign(ApiExtractorPluginImpl, {
	api: { fromDir },
	apis: { fromDir: fromParentDir },
});
