import type { PathLike } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ApiEntryPoint, ApiModel, ApiPackage } from "@microsoft/api-extractor-model";
import type { Scope } from "effect";
import { Effect, Layer, Metric } from "effect";
import type { ShikiTransformer } from "shiki";
import { createHighlighter } from "shiki";
import type { VirtualFileSystem } from "type-registry-effect";
import { ApiExtractedPackage } from "../api-extracted-package.js";
import { CategoryResolver } from "../category-resolver.js";
import {
	extractAutoDetectedPackages,
	isVersionConfig,
	mergeLlmsPluginConfig,
	validateExternalPackages,
} from "../config-utils.js";
import { hashContent } from "../content-hash.js";
import type { ApiModelLoadError, TypeRegistryError } from "../errors.js";
import { ConfigValidationError } from "../errors.js";
import { HideCutLinesTransformer, MemberFormatTransformer } from "../hide-cut-transformer.js";
import type { LoadedModel, PackageJson, TypeResolutionCompilerOptions, TypeScriptConfig } from "../internal-types.js";
import type { ShikiThemeConfig } from "../markdown/shiki-utils.js";
import { DEFAULT_SHIKI_THEMES } from "../markdown/shiki-utils.js";
import { ApiModelLoader } from "../model-loader.js";
import { emit, wantsLevel } from "../observability/EventBus.js";
import type { ImportRef } from "../observability/events.js";
import { PluginEvent } from "../observability/events.js";
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

interface VfsEntryPayload {
	file: string;
	entryPoint: string;
	declCount: number;
	contentHash: string;
	content: string;
	/** True only when import statements were actually prepended to this entry. */
	hasImports: boolean;
	importRefs: readonly ImportRef[];
}

/**
 * Prepend import statements for external type references to the VFS declaration files.
 * Returns per-entry payloads for event emission (heavy content/importRefs gated on wantTrace).
 */
function prependImportsToVfs(
	vfs: VirtualFileSystem,
	apiPackage: ApiPackage,
	packageName: string,
	wantTrace: boolean,
): VfsEntryPayload[] {
	const extractor = new TypeReferenceExtractor(apiPackage, packageName);
	const payloads: VfsEntryPayload[] = [];
	for (const entryPoint of apiPackage.entryPoints) {
		const entryEp = entryPoint as ApiEntryPoint;
		const imports = extractor.extractImportsForEntryPoint(entryEp);
		const importStatements = TypeReferenceExtractor.formatImports(imports);
		const entryName = entryEp.displayName || "";
		const fileName = entryName ? `${entryName}.d.ts` : "index.d.ts";
		const file = `node_modules/${packageName}/${fileName}`;

		const hasImports = importStatements.length > 0;
		if (hasImports) {
			const existing = vfs.get(file);
			if (existing) {
				vfs.set(file, `${importStatements.join("\n")}\n\n${existing}`);
			}
		}

		const content = vfs.get(file) ?? "";
		const declCount = entryEp.members.length;
		const contentHash = hashContent(content);
		const importRefs: readonly ImportRef[] =
			wantTrace && hasImports
				? imports.map((i) => ({ from: i.packageName, symbols: [...i.symbols] as readonly string[] }))
				: [];
		payloads.push({
			file,
			entryPoint: entryName,
			declCount,
			contentHash,
			content: wantTrace ? content : "",
			hasImports,
			importRefs,
		});
	}
	return payloads;
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
					yield* emit(
						PluginEvent.ConfigCascadeWarning({
							ctx: { buildId: "" },
							level: "warn",
							field: "versions",
							chosen: "(none — multiVersion not configured)",
							ignored: ["api.versions"],
						}),
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

						// Gate heavy VFS payloads behind trace level
						const wantTrace = yield* wantsLevel("trace");

						// --- 1. Validate options ---
						yield* validateOptions(options, {
							...(rspressConfig.multiVersion
								? {
										multiVersion: {
											default: rspressConfig.multiVersion.default,
											versions: [...rspressConfig.multiVersion.versions],
										},
									}
								: {}),
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
							wantTrace: boolean,
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
								const vfsPayloads = prependImportsToVfs(vfs, apiPackage, api.packageName, wantTrace);

								// Resolve ogImage with cascading: API > global
								const resolvedOgImage = api.ogImage ?? options.ogImage;

								// Normalize theme configuration
								const resolvedTheme = normalizeThemeConfig(api.theme);

								return {
									vfs,
									vfsPayloads,
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
													vfsPayloads: [] as VfsEntryPayload[],
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
												const vfsPayloads = prependImportsToVfs(vfs, apiPackage, api.packageName, wantTrace);

												// Resolve ogImage with cascading: version > API > global
												const resolvedOgImage = versionOgImage ?? api.ogImage ?? options.ogImage;
												const resolvedTheme = normalizeThemeConfig(api.theme);

												const outputDir = versionDp.outputDir;
												const fullRoute = versionDp.routeBase;

												return {
													vfs,
													vfsPayloads,
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
									for (const payload of result.vfsPayloads) {
										yield* emit(
											PluginEvent.VfsGenerated({
												ctx: {
													buildId: "",
													packageName: api.packageName,
													...(payload.entryPoint ? { entryPoint: payload.entryPoint } : {}),
												},
												level: "debug",
												file: payload.file,
												declCount: payload.declCount,
												contentHash: payload.contentHash,
												...(wantTrace && payload.content ? { content: payload.content } : {}),
											}),
										);
										if (payload.hasImports) {
											yield* emit(
												PluginEvent.ImportsPrepended({
													ctx: {
														buildId: "",
														packageName: api.packageName,
														...(payload.entryPoint ? { entryPoint: payload.entryPoint } : {}),
													},
													level: "debug",
													file: payload.file,
													imports: wantTrace ? payload.importRefs : [],
												}),
											);
										}
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
									const result = yield* processSimpleApi(api, api.model, dp.outputDir, dp.routeBase, wantTrace);
									for (const [filepath, content] of result.vfs.entries()) {
										combinedVfs.set(filepath, content);
									}
									if (result.externalPackages.length > 0) {
										allExternalPackages.push(...result.externalPackages);
									}
									apiConfigs.push(result.config);
									for (const payload of result.vfsPayloads) {
										yield* emit(
											PluginEvent.VfsGenerated({
												ctx: {
													buildId: "",
													packageName: api.packageName,
													...(payload.entryPoint ? { entryPoint: payload.entryPoint } : {}),
												},
												level: "debug",
												file: payload.file,
												declCount: payload.declCount,
												contentHash: payload.contentHash,
												...(wantTrace && payload.content ? { content: payload.content } : {}),
											}),
										);
										if (payload.hasImports) {
											yield* emit(
												PluginEvent.ImportsPrepended({
													ctx: {
														buildId: "",
														packageName: api.packageName,
														...(payload.entryPoint ? { entryPoint: payload.entryPoint } : {}),
													},
													level: "debug",
													file: payload.file,
													imports: wantTrace ? payload.importRefs : [],
												}),
											);
										}
									}
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
									const chosen = String(firstApiTsconfig);
									const ignored = [...uniqueTsconfigs].filter((t) => t !== chosen);
									yield* emit(
										PluginEvent.ConfigCascadeWarning({
											ctx: { buildId: "" },
											level: "warn",
											field: "tsconfig",
											chosen,
											ignored,
										}),
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

										const result = yield* processSimpleApi(api, api.model, dp.outputDir, dp.routeBase, wantTrace);
										for (const payload of result.vfsPayloads) {
											yield* emit(
												PluginEvent.VfsGenerated({
													ctx: {
														buildId: "",
														packageName: api.packageName,
														...(payload.entryPoint ? { entryPoint: payload.entryPoint } : {}),
													},
													level: "debug",
													file: payload.file,
													declCount: payload.declCount,
													contentHash: payload.contentHash,
													...(wantTrace && payload.content ? { content: payload.content } : {}),
												}),
											);
											if (payload.hasImports) {
												yield* emit(
													PluginEvent.ImportsPrepended({
														ctx: {
															buildId: "",
															packageName: api.packageName,
															...(payload.entryPoint ? { entryPoint: payload.entryPoint } : {}),
														},
														level: "debug",
														file: payload.file,
														imports: wantTrace ? payload.importRefs : [],
													}),
												);
											}
										}
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
						yield* emit(
							PluginEvent.ModelLoaded({
								ctx: { buildId: "" },
								level: "debug",
								entryPoints: apiConfigs.length,
								itemCount: apiConfigs.reduce(
									(sum, cfg) => sum + cfg.apiPackage.entryPoints.reduce((s, ep) => s + ep.members.length, 0),
									0,
								),
								durationMs: Math.round(loadMs),
							}),
						);

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

						yield* emit(
							PluginEvent.TsCacheCreated({
								ctx: { buildId: "" },
								level: "debug",
								compilerOptions: `target=${resolvedCompilerOptions.target}, module=${resolvedCompilerOptions.module}, lib=[${resolvedCompilerOptions.lib?.join(", ") ?? ""}]`,
								durationMs: 0,
							}),
						);

						// --- 6. External type loading (recoverable) ---
						// Twoslash builds its own per-block TypeScript environment from the
						// combined VFS, so we only need to fetch the external declarations and
						// merge them in here — no separate TypeScript-cache pre-build.
						//
						// First-party packages (the ones being documented) are served from their
						// generated virtual VFS, which is authoritative — their published version
						// may not exist (an optimistic next version) and, if it did, fetching it
						// would clobber the api.json-derived declarations. Exclude them.
						const documentedPackageNames = new Set(apiConfigs.map((config) => config.packageName));
						const externalPackagesToLoad = allExternalPackages.filter((pkg) => !documentedPackageNames.has(pkg.name));

						const typeLoadResult = yield* Effect.either(
							Effect.gen(function* () {
								if (externalPackagesToLoad.length > 0) {
									// Resolve version specs (ranges / npm tags) to exact published
									// versions and drop unpublished / workspace-only packages: the CDN
									// backing loadPackages requires exact versions and 404s on ranges
									// or unpublished packages.
									const resolvedPackages = yield* typeRegistry.resolveVersions(externalPackagesToLoad);
									const droppedCount = externalPackagesToLoad.length - resolvedPackages.length;
									if (droppedCount > 0) {
										yield* emit(
											PluginEvent.ExternalPackageSkipped({
												ctx: { buildId: "" },
												level: "debug",
												reason: `${droppedCount} unresolvable package(s) (unpublished or workspace-only)`,
											}),
										);
									}

									if (resolvedPackages.length > 0) {
										const result = yield* typeRegistry.loadPackages(resolvedPackages);

										// Merge external package VFS into combined VFS
										for (const [filePath, content] of result.vfs.entries()) {
											combinedVfs.set(filePath, content);
										}

										yield* emit(
											PluginEvent.VfsMerged({
												ctx: { buildId: "" },
												level: "debug",
												totalFiles: result.vfs.size,
												packages: resolvedPackages.map((p) => p.name),
											}),
										);
									}
								}
							}),
						);

						if (typeLoadResult._tag === "Left") {
							yield* emit(
								PluginEvent.ConfigCascadeWarning({
									ctx: { buildId: "" },
									level: "warn",
									field: "externalTypes",
									chosen: "empty VFS",
									ignored: [typeLoadResult.left.message ?? String(typeLoadResult.left)],
								}),
							);
						}

						// --- 7. Twoslash init ---
						const twoslashStartMs = performance.now();
						TwoslashManager.getInstance().initialize(
							combinedVfs,
							undefined,
							undefined,
							undefined,
							resolvedCompilerOptions,
						);
						yield* emit(
							PluginEvent.TwoslashInitialized({
								ctx: { buildId: "" },
								level: "debug",
								durationMs: Math.round(performance.now() - twoslashStartMs),
								vfsFileCount: combinedVfs.size,
							}),
						);

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
						yield* emit(
							PluginEvent.PhaseCompleted({
								ctx: { buildId: "" },
								level: "debug",
								phase: "shikiInit",
								durationMs: Math.round(performance.now() - shikiStartMs),
							}),
						);

						// --- 9. OG resolver ---
						const ogResolver = options.siteUrl
							? new OpenGraphResolver({
									siteUrl: options.siteUrl,
									...(docsRoot != null ? { docsRoot } : {}),
								})
							: null;

						// --- 10. Transformers ---
						const hideCutTransformer: ShikiTransformer = MemberFormatTransformer;
						const hideCutLinesTransformer: ShikiTransformer = HideCutLinesTransformer;
						const twoslashTransformer: ShikiTransformer | undefined =
							TwoslashManager.getInstance().getTransformer() ?? undefined;

						// --- 11. Assemble context ---
						const logLevel = options.logLevel ?? "info";
						const suppressExampleErrors = options.errors?.example !== "show";

						return {
							apiConfigs,
							combinedVfs,
							highlighter,
							resolvedCompilerOptions,
							ogResolver,
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
