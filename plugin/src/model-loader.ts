import type { PathLike } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import type { ApiModel, ApiPackage } from "@microsoft/api-extractor-model";
import { ApiModel as ApiModelClass } from "@microsoft/api-extractor-model";
import type {
	AutoDetectDependenciesOptions,
	CategoryConfig,
	ExternalPackageSpec,
	LlmsPluginOptions,
	LoadedModel,
	OpenGraphImageConfig,
	PackageJson,
	SourceConfig,
	VersionConfig,
} from "./types.js";
import { isLoadedModel, isVersionConfig } from "./types.js";

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
		const apiModel = new ApiModelClass();

		// Resolve the path and ensure it exists
		const resolvedPath = path.resolve(modelPath.toString());
		if (!fs.existsSync(resolvedPath)) {
			throw new Error(`API model file not found: ${resolvedPath}`);
		}

		// Load the package
		return apiModel.loadPackage(resolvedPath);
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
					const packages = (model as ApiModelClass).packages;
					if (packages.length === 0) {
						throw new Error("API model returned by function contains no packages");
					}
					return {
						apiPackage: packages[0],
						source: result.source,
					};
				}
				throw new Error("API model loader function must return an ApiModel");
			}

			// Result is plain ApiModel
			if (result && typeof result === "object" && "packages" in result) {
				const packages = (result as ApiModelClass).packages;
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
		autoDetectDependencies?: AutoDetectDependenciesOptions;
		ogImage?: OpenGraphImageConfig;
		llmsPlugin?: LlmsPluginOptions;
	}> {
		if (isVersionConfig(versionValue)) {
			// Full VersionConfig with model, categories, source, packageJson, externalPackages, autoDetectDependencies, ogImage, and llmsPlugin
			const { apiPackage, source: loaderSource } = await ApiModelLoader.loadApiModel(versionValue.model);
			const packageJson = versionValue.packageJson
				? await ApiModelLoader.loadPackageJson(versionValue.packageJson)
				: undefined;
			return {
				apiPackage,
				packageJson,
				categories: versionValue.categories,
				// Loader source takes precedence over config source
				source: loaderSource || versionValue.source,
				externalPackages: versionValue.externalPackages,
				autoDetectDependencies: versionValue.autoDetectDependencies,
				ogImage: versionValue.ogImage,
				llmsPlugin: versionValue.llmsPlugin,
			};
		}

		// Simple path or function
		const { apiPackage, source } = await ApiModelLoader.loadApiModel(versionValue);
		return { apiPackage, source };
	}
}
