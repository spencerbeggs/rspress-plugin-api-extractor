import type { CategoryConfig, SourceConfig } from "./types.js";

/**
 * Resolver for category and source configurations with proper precedence handling.
 * Encapsulates the logic for merging category configs and resolving source configs.
 */
export class CategoryResolver {
	/**
	 * Deep merge two category config objects
	 * Later config overrides earlier config
	 */
	private mergeTwoCategories(
		base: Record<string, CategoryConfig>,
		override: Record<string, CategoryConfig>,
	): Record<string, CategoryConfig> {
		const result: Record<string, CategoryConfig> = { ...base };

		for (const [key, config] of Object.entries(override)) {
			if (result[key]) {
				// Merge the configs - override takes precedence
				result[key] = {
					...result[key],
					...config,
					// Merge arrays properly
					itemKinds: config.itemKinds ?? result[key].itemKinds,
					overviewHeaders: config.overviewHeaders ?? result[key].overviewHeaders,
				};
			} else {
				// New category
				result[key] = config;
			}
		}

		return result;
	}

	/**
	 * Merge category configs with proper precedence
	 * Later configs override earlier ones
	 */
	public mergeCategories(
		...configs: Array<Record<string, CategoryConfig> | undefined>
	): Record<string, CategoryConfig> {
		let result: Record<string, CategoryConfig> = {};

		for (const config of configs) {
			if (config) {
				result = this.mergeTwoCategories(result, config);
			}
		}

		return result;
	}

	/**
	 * Resolve final category config for a specific API/version
	 * Precedence: built-in defaults < plugin defaults < package categories < version categories
	 */
	public resolveCategoryConfig(
		pluginDefaults: Record<string, CategoryConfig>,
		packageCategories?: Record<string, CategoryConfig>,
		versionCategories?: Record<string, CategoryConfig>,
	): Record<string, CategoryConfig> {
		return this.mergeCategories(pluginDefaults, packageCategories, versionCategories);
	}

	/**
	 * Resolve final source config for a specific API/version
	 * Precedence: package source < version source < loader source (highest)
	 * Loader source is passed in as versionSource since it's already been extracted
	 */
	public resolveSourceConfig(packageSource?: SourceConfig, versionSource?: SourceConfig): SourceConfig | undefined {
		// Version source (or loader source) takes precedence
		if (versionSource) {
			return versionSource;
		}
		// Fall back to package source
		if (packageSource) {
			return packageSource;
		}
		// No source config
		return undefined;
	}
}
