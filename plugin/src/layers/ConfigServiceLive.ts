import type { PathLike } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ApiEntryPoint, ApiModel, ApiPackage } from "@microsoft/api-extractor-model";
import type { Scope } from "effect";
import { Effect, Layer, Metric } from "effect";
import type { ShikiTransformer } from "shiki";
import { createHighlighter } from "shiki";
import type { VirtualFileSystem } from "type-registry-effect";
import type { VirtualTypeScriptEnvironment } from "type-registry-effect/node";
import { ApiExtractedPackage } from "../api-extracted-package.js";
import { CategoryResolver } from "../category-resolver.js";
import {
	extractAutoDetectedPackages,
	isVersionConfig,
	mergeLlmsPluginConfig,
	validateExternalPackages,
} from "../config-utils.js";
import type { ApiModelLoadError, TypeRegistryError } from "../errors.js";
import { ConfigValidationError } from "../errors.js";
import { HideCutLinesTransformer, MemberFormatTransformer } from "../hide-cut-transformer.js";
import type { LoadedModel, PackageJson, TypeResolutionCompilerOptions, TypeScriptConfig } from "../internal-types.js";
import type { ShikiThemeConfig } from "../markdown/shiki-utils.js";
import { DEFAULT_SHIKI_THEMES } from "../markdown/shiki-utils.js";
import { ApiModelLoader } from "../model-loader.js";
import { OpenGraphResolver } from "../og-resolver.js";
import type {
	ExternalPackageSpec,
	MultiApiConfig,
	PluginOptions,
	SingleApiConfig,
	VersionConfig,
} from "../schemas/index.js";
import { DEFAULT_CATEGORIES } from "../schemas/index.js";
import type { ResolvedApiConfig, ResolvedBuildContext, RspressConfigSubset } from "../services/ConfigService.js";
import { ConfigService } from "../services/ConfigService.js";
import { PathDerivationService } from "../services/PathDerivationService.js";
import { TypeRegistryService } from "../services/TypeRegistryService.js";
import type { ShikiCrossLinker } from "../shiki-transformer.js";
import { SnapshotManager } from "../snapshot-manager.js";
import { TwoslashManager } from "../twoslash-transformer.js";
import { TypeReferenceExtractor } from "../type-reference-extractor.js";
import { resolveTypeScriptConfig } from "../typescript-config.js";
import { BuildMetrics } from "./ObservabilityLive.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RspressMultiVersion {
	default: string;
	versions: string[];
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
 * Prepend import statements for external type references to the VFS declaration files.
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

/**
 * Validate plugin options and return an Effect that fails with ConfigValidationError.
 */
function validateOptions(
	options: PluginOptions,
	rspressConfig: { multiVersion?: RspressMultiVersion },
): Effect.Effect<void, ConfigValidationError> {
	return Effect.gen(function* () {
		const { api, apis } = options;
		const { multiVersion } = rspressConfig;

		if (api && apis) {
			return yield* new ConfigValidationError({
				field: "api/apis",
				reason:
					"Cannot provide both 'api' and 'apis'. Use 'api' for single-package sites or 'apis' for multi-package portals.",
			});
		}
		if (!api && !apis) {
			return yield* new ConfigValidationError({
				field: "api/apis",
				reason: "Must provide either 'api' or 'apis'.",
			});
		}

		if (apis) {
			if (apis.length === 0) {
				return yield* new ConfigValidationError({
					field: "apis",
					reason: "'apis' must contain at least one API configuration.",
				});
			}
			if (multiVersion) {
				return yield* new ConfigValidationError({
					field: "apis",
					reason:
						"multiVersion is not supported with 'apis' (multi-API mode). Use 'api' (single-API mode) for versioned documentation.",
				});
			}
			return;
		}

		if (api) {
			if (multiVersion) {
				if (!api.versions) {
					return yield* new ConfigValidationError({
						field: "api.versions",
						reason: "'versions' is required when multiVersion is active.",
					});
				}

				const pluginKeys = new Set(Object.keys(api.versions));
				const rspressKeys = new Set(multiVersion.versions);

				if (pluginKeys.size !== rspressKeys.size || ![...pluginKeys].every((k) => rspressKeys.has(k))) {
					return yield* new ConfigValidationError({
						field: "api.versions",
						reason: `api.versions keys [${[...pluginKeys].join(", ")}] must exactly match multiVersion.versions [${[...rspressKeys].join(", ")}].`,
					});
				}
			} else {
				if (api.versions) {
					yield* Effect.logWarning(
						"api.versions is provided but RSPress multiVersion is not configured. Versions will be ignored.",
					);
				}
				if (!api.model) {
					return yield* new ConfigValidationError({
						field: "api.model",
						reason: "'model' is required when multiVersion is not active.",
					});
				}
			}
		}
	});
}

// ---------------------------------------------------------------------------
// Layer factory
// ---------------------------------------------------------------------------

/**
 * Create ConfigServiceLive from plugin options.
 * Resolves plugin options + RSPress config into a fully prepared build context
 * with loaded models, type system, and resources.
 */
export function ConfigServiceLive(
	options: PluginOptions,
	shikiCrossLinker: ShikiCrossLinker,
): Layer.Layer<ConfigService, never, TypeRegistryService | PathDerivationService> {
	return Layer.effect(
		ConfigService,
		Effect.gen(function* () {
			// Capture services from the layer context
			const typeRegistry = yield* TypeRegistryService;
			const pathService = yield* PathDerivationService;

			return {
				resolve: (rspressConfig: RspressConfigSubset) =>
					Effect.gen(function* () {
						const loadStart = performance.now();

						// --- 1. Validate options ---
						yield* validateOptions(options, {
							multiVersion: rspressConfig.multiVersion
								? {
										default: rspressConfig.multiVersion.default,
										versions: [...rspressConfig.multiVersion.versions],
									}
								: undefined,
						});

						// --- 2. Derive RSPress context ---
						const rspressMultiVersion = rspressConfig.multiVersion;
						const rspressLocales = rspressConfig.locales?.map((l) => l.lang) ?? [];
						const rspressLang = rspressConfig.lang;
						const docsRoot = rspressConfig.root;
						const rspressRoot = docsRoot || process.cwd();

						// --- 3. Category resolution ---
						const categoryResolver = new CategoryResolver();
						const pluginDefaults = categoryResolver.mergeCategories(DEFAULT_CATEGORIES, options.defaultCategories);

						// --- 4. Collect configs from models ---
						const apiConfigs: ResolvedApiConfig[] = [];
						const combinedVfs = new Map<string, string>();
						const allExternalPackages: ExternalPackageSpec[] = [];

						let firstApiTsconfig: SingleApiConfig["tsconfig"] | MultiApiConfig["tsconfig"];
						let firstApiCompilerOptions: SingleApiConfig["compilerOptions"] | MultiApiConfig["compilerOptions"];

						/**
						 * Helper to process a single API model (shared by single and multi modes).
						 */
						const processSimpleApi = (
							api: SingleApiConfig | MultiApiConfig,
							model: NonNullable<SingleApiConfig["model"]> | MultiApiConfig["model"],
							outputDir: string,
							fullRoute: string,
						) =>
							Effect.promise(async () => {
								const { apiPackage, source: loaderSource } = await ApiModelLoader.loadApiModel(
									model as PathLike | (() => Promise<ApiModel | LoadedModel>),
								);
								const resolvedCategories = categoryResolver.resolveCategoryConfig(pluginDefaults, api.categories);
								const resolvedSource = categoryResolver.resolveSourceConfig(api.source, loaderSource);
								const resolvedLlms = mergeLlmsPluginConfig(options.llmsPlugin, api.llmsPlugin);

								// Load package.json
								const packageJson = api.packageJson
									? await ApiModelLoader.loadPackageJson(api.packageJson as PathLike | (() => Promise<PackageJson>))
									: undefined;

								// Validate that explicit externalPackages don't conflict with peerDependencies
								validateExternalPackages(api.externalPackages, packageJson);

								// Collect external packages
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
										...(api.name != null ? { apiName: api.name } : {}),
										outputDir,
										baseRoute: fullRoute,
										categories: resolvedCategories,
										...(resolvedSource != null ? { source: resolvedSource } : {}),
										...(packageJson != null ? { packageJson } : {}),
										...(resolvedLlms != null ? { llmsPlugin: resolvedLlms } : {}),
										...(options.siteUrl != null ? { siteUrl: options.siteUrl } : {}),
										...(resolvedOgImage != null ? { ogImage: resolvedOgImage } : {}),
										docsDir: path.dirname(outputDir),
										...(docsRoot != null ? { docsRoot } : {}),
										...(resolvedTheme != null ? { theme: resolvedTheme } : {}),
									} satisfies ResolvedApiConfig,
								};
							});

						if (options.api) {
							// === Single-API mode ===
							const api = options.api;
							const baseRoute = yield* pathService.normalizeBaseRoute(api.baseRoute ?? "/");

							// Capture tsconfig for later resolution
							firstApiTsconfig = api.tsconfig;
							firstApiCompilerOptions = api.compilerOptions;

							if (rspressMultiVersion && api.versions) {
								// Versioned single-API mode
								const versionResults = yield* Effect.forEach(
									Object.entries(api.versions),
									([version, versionValue]) =>
										Effect.gen(function* () {
											// Derive versioned output paths
											const versionDerivedPaths = yield* pathService.derivePaths({
												mode: "single",
												docsRoot: rspressRoot,
												baseRoute,
												apiFolder: api.apiFolder ?? "api",
												locales: rspressLocales,
												defaultLang: rspressLang,
												versions: [version],
												defaultVersion: rspressMultiVersion?.default,
											});
											const versionDp = versionDerivedPaths[0];
											if (!versionDp) {
												return {
													vfs: new Map<string, string>(),
													externalPackages: [] as ExternalPackageSpec[],
													config: null as ResolvedApiConfig | null,
												};
											}

											return yield* Effect.promise(async () => {
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

												// Load package.json (version config takes precedence)
												const packageJson =
													versionPackageJson ||
													(api.packageJson
														? await ApiModelLoader.loadPackageJson(
																api.packageJson as PathLike | (() => Promise<PackageJson>),
															)
														: undefined);

												// Validate external packages
												validateExternalPackages(versionExternalPackages || api.externalPackages, packageJson);

												// Collect external packages (version > package > auto-detected)
												const autoDetectOptions = versionAutoDetectDependencies || api.autoDetectDependencies;
												const externalPackages =
													versionExternalPackages ||
													api.externalPackages ||
													extractAutoDetectedPackages(packageJson, autoDetectOptions);

												if (externalPackages && externalPackages.length > 0) {
													Effect.runSync(
														Metric.incrementBy(BuildMetrics.externalPackagesTotal, externalPackages.length),
													);
												}

												// Generate VFS
												const pkg = ApiExtractedPackage.fromPackage(apiPackage, api.packageName);
												const vfs = pkg.generateVfs();
												prependImportsToVfs(vfs, apiPackage, api.packageName);

												// Resolve ogImage with cascading: version > API > global
												const resolvedOgImage = versionOgImage ?? api.ogImage ?? options.ogImage;
												const resolvedTheme = normalizeThemeConfig(api.theme);

												const outputDir = versionDp.outputDir;
												const fullRoute = versionDp.routeBase;

												return {
													vfs,
													externalPackages: externalPackages || [],
													config: {
														apiPackage,
														packageName: `${api.packageName} (${version})`,
														...(api.name != null ? { apiName: api.name } : {}),
														outputDir,
														baseRoute: fullRoute,
														categories: resolvedCategories,
														...(resolvedSource != null ? { source: resolvedSource } : {}),
														...(packageJson != null ? { packageJson } : {}),
														...(resolvedLlms != null ? { llmsPlugin: resolvedLlms } : {}),
														...(options.siteUrl != null ? { siteUrl: options.siteUrl } : {}),
														...(resolvedOgImage != null ? { ogImage: resolvedOgImage } : {}),
														docsDir: path.dirname(outputDir),
														...(docsRoot != null ? { docsRoot } : {}),
														...(resolvedTheme != null ? { theme: resolvedTheme } : {}),
													} satisfies ResolvedApiConfig,
												};
											});
										}),
									{ concurrency: "unbounded" },
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
							} else if (api.model) {
								// Non-versioned single-API mode
								const derivedPaths = yield* pathService.derivePaths({
									mode: "single",
									docsRoot: rspressRoot,
									baseRoute,
									apiFolder: api.apiFolder ?? "api",
									locales: rspressLocales,
									defaultLang: rspressLang,
									versions: [],
									defaultVersion: undefined,
								});

								const dp = derivedPaths[0];
								if (dp) {
									const result = yield* processSimpleApi(api, api.model, dp.outputDir, dp.routeBase);
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
							const apisWithTsconfig = options.apis.filter((a) => a.tsconfig);
							if (apisWithTsconfig.length > 0) {
								firstApiTsconfig = apisWithTsconfig[0].tsconfig;
								const uniqueTsconfigs = new Set(apisWithTsconfig.map((a) => String(a.tsconfig)));
								if (uniqueTsconfigs.size > 1) {
									yield* Effect.logWarning(
										`Multiple APIs specify different tsconfig values: ${[...uniqueTsconfigs].join(", ")}. ` +
											`Using '${String(firstApiTsconfig)}' for TypeScript resolution. ` +
											`Per-API tsconfig resolution will be supported in a future release.`,
									);
								}
							}
							const apisWithCompilerOptions = options.apis.filter((a) => a.compilerOptions);
							if (apisWithCompilerOptions.length > 0) {
								firstApiCompilerOptions = apisWithCompilerOptions[0].compilerOptions;
							}

							const multiResults = yield* Effect.forEach(
								options.apis,
								(api) =>
									Effect.gen(function* () {
										const apiBaseRoute = yield* pathService.normalizeBaseRoute(
											api.baseRoute ?? `/${unscopedName(api.packageName)}`,
										);
										const derivedPaths = yield* pathService.derivePaths({
											mode: "multi",
											docsRoot: rspressRoot,
											baseRoute: apiBaseRoute,
											apiFolder: api.apiFolder ?? "api",
											locales: rspressLocales,
											defaultLang: rspressLang,
											versions: [],
											defaultVersion: undefined,
										});

										const dp = derivedPaths[0];
										if (!dp) return [];

										const result = yield* processSimpleApi(api, api.model, dp.outputDir, dp.routeBase);
										return [result];
									}),
								{ concurrency: "unbounded" },
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
						yield* Effect.logDebug(`Loading API models: ${loadMs.toFixed(0)}ms`);

						// --- 5. Resolve TypeScript compiler options ---
						const projectRoot = process.cwd();
						let globalTsConfig: TypeScriptConfig | undefined;
						if (firstApiTsconfig || firstApiCompilerOptions) {
							globalTsConfig = {};
							if (firstApiTsconfig != null) {
								globalTsConfig.tsconfig = firstApiTsconfig as PathLike | (() => Promise<TypeResolutionCompilerOptions>);
							}
							if (firstApiCompilerOptions != null) {
								globalTsConfig.compilerOptions = firstApiCompilerOptions as TypeResolutionCompilerOptions;
							}
						}
						const resolvedCompilerOptions: TypeResolutionCompilerOptions = yield* Effect.promise(() =>
							resolveTypeScriptConfig(projectRoot, globalTsConfig),
						);

						yield* Effect.logDebug(
							`Resolved TypeScript config: target=${resolvedCompilerOptions.target}, ` +
								`module=${resolvedCompilerOptions.module}, lib=[${resolvedCompilerOptions.lib?.join(", ")}]`,
						);

						// --- 6. External type loading (recoverable) ---
						let tsEnvCache = new Map<string, VirtualTypeScriptEnvironment>();

						const typeLoadResult = yield* Effect.either(
							Effect.gen(function* () {
								if (allExternalPackages.length > 0) {
									const typesStart = performance.now();
									const result = yield* typeRegistry.loadPackages(allExternalPackages);
									const cache = yield* typeRegistry.createTypeScriptCache(allExternalPackages, resolvedCompilerOptions);

									// Merge external package VFS into combined VFS
									for (const [filePath, content] of result.vfs.entries()) {
										combinedVfs.set(filePath, content);
									}

									yield* Effect.logDebug(
										`Loading external package types: ${(performance.now() - typesStart).toFixed(0)}ms`,
									);
									return cache;
								}

								// No external packages - still create TypeScript cache for lib files
								return yield* typeRegistry.createTypeScriptCache([], resolvedCompilerOptions);
							}),
						);

						if (typeLoadResult._tag === "Right") {
							tsEnvCache = typeLoadResult.right;
						} else {
							yield* Effect.logWarning(
								`Failed to load external types: ${typeLoadResult.left.message}. Continuing with empty VFS.`,
							);
							// Still create TypeScript cache for lib files
							const fallbackCache = yield* Effect.either(
								typeRegistry.createTypeScriptCache([], resolvedCompilerOptions),
							);
							if (fallbackCache._tag === "Right") {
								tsEnvCache = fallbackCache.right;
							}
						}

						// --- 7. Twoslash init ---
						const twoslashStartMs = performance.now();
						TwoslashManager.getInstance().initialize(
							combinedVfs,
							undefined,
							undefined,
							tsEnvCache,
							resolvedCompilerOptions,
						);
						yield* Effect.logDebug(`Initializing Twoslash: ${(performance.now() - twoslashStartMs).toFixed(0)}ms`);

						// --- 8. Shiki highlighter ---
						const shikiStartMs = performance.now();
						const themeSet = new Set<string>();
						const customThemes: Array<Record<string, unknown>> = [];

						for (const config of apiConfigs) {
							const theme = config.theme ?? {
								light: DEFAULT_SHIKI_THEMES.light,
								dark: DEFAULT_SHIKI_THEMES.dark,
							};

							if (typeof theme.light === "string") {
								themeSet.add(theme.light);
							} else if (typeof theme.light === "object") {
								customThemes.push(theme.light as Record<string, unknown>);
							}

							if (typeof theme.dark === "string") {
								themeSet.add(theme.dark);
							} else if (typeof theme.dark === "object") {
								customThemes.push(theme.dark as Record<string, unknown>);
							}
						}

						// Ensure defaults are always loaded
						if (typeof DEFAULT_SHIKI_THEMES.light === "string") {
							themeSet.add(DEFAULT_SHIKI_THEMES.light);
						}
						if (typeof DEFAULT_SHIKI_THEMES.dark === "string") {
							themeSet.add(DEFAULT_SHIKI_THEMES.dark);
						}

						const themes: Array<string | Record<string, unknown>> = [...themeSet, ...customThemes];
						const langs = ["typescript", "javascript", "json", "bash", "sh"];
						const highlighter = yield* Effect.promise(() => createHighlighter({ themes, langs }));
						yield* Effect.logDebug(
							`Initializing Shiki highlighter: ${(performance.now() - shikiStartMs).toFixed(0)}ms`,
						);

						// --- 9. Snapshot DB (scoped resource) ---
						const dbPath = path.resolve(process.cwd(), "api-docs-snapshot.db");
						const snapshotManager = yield* Effect.acquireRelease(
							Effect.sync(() => new SnapshotManager(dbPath)),
							(sm) => Effect.sync(() => sm.close()),
						);

						// --- 10. OG resolver ---
						const ogResolver = options.siteUrl
							? new OpenGraphResolver({
									siteUrl: options.siteUrl,
									...(docsRoot != null ? { docsRoot } : {}),
								})
							: null;

						// --- 11. Transformers ---
						const hideCutTransformer: ShikiTransformer = MemberFormatTransformer;
						const hideCutLinesTransformer: ShikiTransformer = HideCutLinesTransformer;
						const twoslashTransformer: ShikiTransformer | undefined =
							TwoslashManager.getInstance().getTransformer() ?? undefined;

						// --- 12. Assemble context ---
						const logLevel = options.logLevel ?? "info";
						const suppressExampleErrors = options.errors?.example !== "show";

						return {
							apiConfigs,
							combinedVfs,
							highlighter,
							tsEnvCache,
							resolvedCompilerOptions,
							ogResolver,
							snapshotManager,
							shikiCrossLinker,
							hideCutTransformer,
							hideCutLinesTransformer,
							twoslashTransformer,
							pageConcurrency: os.cpus().length,
							logLevel: logLevel === "none" ? "info" : logLevel,
							suppressExampleErrors,
						} satisfies ResolvedBuildContext;
					}) as Effect.Effect<
						ResolvedBuildContext,
						ConfigValidationError | ApiModelLoadError | TypeRegistryError,
						Scope.Scope
					>,
			};
		}),
	);
}

/**
 * Strip npm scope from a package name.
 */
function unscopedName(packageName: string): string {
	return packageName.startsWith("@") ? (packageName.split("/")[1] ?? packageName) : packageName;
}
