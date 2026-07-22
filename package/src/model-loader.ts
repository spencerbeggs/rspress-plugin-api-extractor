import type { PathLike } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import type { ApiModel, ApiPackage } from "@microsoft/api-extractor-model";
import { loadApiModel } from "api-extractor-llms";
import { isLoadedModel, isVersionConfig } from "./config-utils.js";
import type { LoadedModel, PackageJson } from "./internal-types.js";
import { PluginEvent } from "./observability/events.js";
import type {
	AutoDetectDependencies,
	CategoryConfig,
	ExternalPackageSpec,
	LlmsPlugin,
	OpenGraphImageConfig,
	SourceConfig,
	VersionConfig,
} from "./schemas/index.js";

/**
 * Module-level emitter seam. `loadFromPath` is called from inside an
 * `Effect.promise(async () => {...})` body in `ConfigServiceLive.ts`, so a
 * load failure cannot `yield* emit(...)` — it mirrors the sync-island pattern
 * used by `twoslash-transformer.ts` (`setEventEmitter`) and `loader.ts`
 * (`setLoaderEventEmitter`, a DIFFERENT module — the ApiParser/TSDoc statics,
 * not this one). Default is a no-op; wired in plugin.ts via
 * `setModelLoaderEventEmitter(emitSync, buildId)` right after the runtime
 * emitter is created.
 */
let emitEvent: (event: PluginEvent) => void = () => {};
let currentBuildId = "";

/**
 * Inject the runtime-bound emitter into the model-loader module.
 * Call this right after `makeRuntimeEmitter` in plugin.ts.
 */
export function setModelLoaderEventEmitter(fn: (event: PluginEvent) => void, buildId = ""): void {
	emitEvent = fn;
	currentBuildId = buildId;
}

/**
 * Utility class for loading API models from various sources
 */
export class ApiModelLoader {
	/**
	 * Private constructor to prevent instantiation
	 */
	private constructor() {
		// This class should only be used for its static methods
	}

	/**
	 * Load an API model from a path (string, URL, or Buffer)
	 */
	private static async loadFromPath(modelPath: PathLike): Promise<ApiPackage> {
		// The plugin owns its not-found error contract independently of the
		// library: resolve + existence-check here so the message stays stable
		// even if api-extractor-llms changes its internal wording, then
		// delegate the actual model parse.
		const resolvedPath = path.resolve(modelPath.toString());
		try {
			if (!fs.existsSync(resolvedPath)) {
				throw new Error(`API model file not found: ${resolvedPath}`);
			}
			return await loadApiModel(resolvedPath);
		} catch (error) {
			// Emit a typed ModelLoadFailed event via the sync-island seam, then
			// rethrow unchanged — this is the load boundary, so the not-found and
			// parse-failure contracts must never be swallowed here. The emit is
			// guarded so a throwing event sink cannot replace the real load error.
			try {
				emitEvent(
					PluginEvent.ModelLoadFailed({
						ctx: { buildId: currentBuildId },
						level: "error",
						modelPath: resolvedPath,
						reason: error instanceof Error ? error.message : String(error),
					}),
				);
			} catch {
				// event-delivery failure must not mask the original load error
			}
			throw error;
		}
	}

	/**
	 * Load package.json from a path (string, URL, or Buffer)
	 */
	private static async loadPackageJsonFromPath(pkgPath: PathLike): Promise<PackageJson> {
		// Resolve the path and ensure it exists
		const resolvedPath = path.resolve(pkgPath.toString());
		if (!fs.existsSync(resolvedPath)) {
			throw new Error(`Package.json file not found: ${resolvedPath}`);
		}

		// Read and parse the JSON file
		const content = fs.readFileSync(resolvedPath, "utf-8");
		try {
			return JSON.parse(content) as PackageJson;
		} catch (error) {
			throw new Error(`Failed to parse package.json at ${resolvedPath}: ${(error as Error).message}`);
		}
	}

	/**
	 * Load package.json from PathLike or async function
	 */
	public static async loadPackageJson(
		loader: PathLike | (() => Promise<PackageJson>),
	): Promise<PackageJson | undefined> {
		if (typeof loader === "function") {
			// Loader is an async function
			return await loader();
		}

		// Loader is a path
		return await ApiModelLoader.loadPackageJsonFromPath(loader);
	}

	/**
	 * Load an API model from PathLike or async function
	 */
	public static async loadApiModel(loader: PathLike | (() => Promise<ApiModel | LoadedModel>)): Promise<{
		apiPackage: ApiPackage;
		source?: SourceConfig;
	}> {
		if (typeof loader === "function") {
			// Loader is an async function
			const result = await loader();

			// Check if result includes source config
			if (isLoadedModel(result)) {
				// Result is LoadedModel with model and optional source
				const model = result.model;
				if (model && typeof model === "object" && "packages" in model) {
					const packages = (model as ApiModel).packages;
					if (packages.length === 0) {
						throw new Error("API model returned by function contains no packages");
					}
					const loadedResult: { apiPackage: ApiPackage; source?: SourceConfig } = {
						apiPackage: packages[0],
					};
					if (result.source != null) {
						loadedResult.source = result.source;
					}
					return loadedResult;
				}
				throw new Error("API model loader function must return an ApiModel");
			}

			// Result is plain ApiModel
			if (result && typeof result === "object" && "packages" in result) {
				const packages = (result as ApiModel).packages;
				if (packages.length === 0) {
					throw new Error("API model returned by function contains no packages");
				}
				return { apiPackage: packages[0] };
			}
			throw new Error("API model loader function must return an ApiModel or LoadedModel");
		}

		// Loader is a path
		const apiPackage = await ApiModelLoader.loadFromPath(loader);
		return { apiPackage };
	}

	/**
	 * Resolve and load a version config
	 */
	public static async loadVersionModel(
		versionValue: PathLike | (() => Promise<ApiModel | LoadedModel>) | VersionConfig,
	): Promise<{
		apiPackage: ApiPackage;
		packageJson?: PackageJson;
		categories?: Record<string, CategoryConfig>;
		source?: SourceConfig;
		externalPackages?: ExternalPackageSpec[];
		autoDetectDependencies?: AutoDetectDependencies;
		ogImage?: OpenGraphImageConfig;
		llmsPlugin?: LlmsPlugin;
	}> {
		if (isVersionConfig(versionValue)) {
			// Full VersionConfig with model, categories, source, packageJson, externalPackages, autoDetectDependencies, ogImage, and llmsPlugin
			const { apiPackage, source: loaderSource } = await ApiModelLoader.loadApiModel(
				versionValue.model as PathLike | (() => Promise<ApiModel | LoadedModel>),
			);
			const packageJson = versionValue.packageJson
				? await ApiModelLoader.loadPackageJson(versionValue.packageJson as PathLike | (() => Promise<PackageJson>))
				: undefined;
			const versionResult: {
				apiPackage: ApiPackage;
				packageJson?: PackageJson;
				categories?: Record<string, CategoryConfig>;
				source?: SourceConfig;
				externalPackages?: ExternalPackageSpec[];
				autoDetectDependencies?: AutoDetectDependencies;
				ogImage?: OpenGraphImageConfig;
				llmsPlugin?: LlmsPlugin;
			} = { apiPackage };
			if (packageJson != null) versionResult.packageJson = packageJson;
			if (versionValue.categories != null) versionResult.categories = versionValue.categories;
			const resolvedSource = loaderSource || versionValue.source;
			if (resolvedSource != null) versionResult.source = resolvedSource;
			if (versionValue.externalPackages != null) versionResult.externalPackages = versionValue.externalPackages;
			if (versionValue.autoDetectDependencies != null)
				versionResult.autoDetectDependencies = versionValue.autoDetectDependencies;
			if (versionValue.ogImage != null) versionResult.ogImage = versionValue.ogImage;
			if (versionValue.llmsPlugin != null) versionResult.llmsPlugin = versionValue.llmsPlugin;
			return versionResult;
		}

		// Simple path or function
		const { apiPackage, source } = await ApiModelLoader.loadApiModel(versionValue);
		const simpleResult: { apiPackage: ApiPackage; source?: SourceConfig } = { apiPackage };
		if (source != null) simpleResult.source = source;
		return simpleResult;
	}
}
