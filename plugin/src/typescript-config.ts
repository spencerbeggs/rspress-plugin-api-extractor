import type { TypeResolutionCompilerOptions, TypeScriptConfig } from "./internal-types.js";
import { TsConfigParseError, parseTsConfig } from "./tsconfig-parser.js";

/**
 * Default TypeScript compiler options for Twoslash and type resolution.
 *
 * These defaults are optimized for documentation:
 * - Modern ES targets (ESNext)
 * - Bundler module resolution for broad compatibility
 * - Lenient settings (non-strict) since docs often show simplified examples
 * - Skip lib checks for faster processing
 *
 * @remarks
 * Numeric values correspond to TypeScript enums:
 * - target: 99 = ESNext
 * - module: 99 = ESNext
 * - moduleResolution: 100 = Bundler
 */
export const DEFAULT_COMPILER_OPTIONS: TypeResolutionCompilerOptions = {
	target: 99, // ESNext
	module: 99, // ESNext
	moduleResolution: 100, // Bundler
	lib: ["ESNext", "DOM"],
	strict: false, // Lenient for documentation examples
	skipLibCheck: true, // Faster processing
	esModuleInterop: true,
	allowSyntheticDefaultImports: true,
};

/**
 * Merge two TypeResolutionCompilerOptions objects.
 * Properties from `override` take precedence over `base`.
 *
 * @param base - Base compiler options
 * @param override - Options to merge on top (takes precedence)
 * @returns Merged options
 *
 * @example
 * ```ts
 * const base = { target: 99, lib: ["ESNext"] };
 * const override = { lib: ["ESNext", "DOM"], strict: true };
 * const merged = mergeCompilerOptions(base, override);
 * // Result: { target: 99, lib: ["ESNext", "DOM"], strict: true }
 * ```
 */
export function mergeCompilerOptions(
	base: TypeResolutionCompilerOptions,
	override: TypeResolutionCompilerOptions | undefined,
): TypeResolutionCompilerOptions {
	if (!override) {
		return { ...base };
	}

	const merged: TypeResolutionCompilerOptions = { ...base };

	// Only merge defined properties from override
	if (override.target !== undefined) {
		merged.target = override.target;
	}
	if (override.module !== undefined) {
		merged.module = override.module;
	}
	if (override.moduleResolution !== undefined) {
		merged.moduleResolution = override.moduleResolution;
	}
	if (override.lib !== undefined) {
		merged.lib = override.lib; // Replace entire lib array
	}
	if (override.strict !== undefined) {
		merged.strict = override.strict;
	}
	if (override.skipLibCheck !== undefined) {
		merged.skipLibCheck = override.skipLibCheck;
	}
	if (override.esModuleInterop !== undefined) {
		merged.esModuleInterop = override.esModuleInterop;
	}
	if (override.allowSyntheticDefaultImports !== undefined) {
		merged.allowSyntheticDefaultImports = override.allowSyntheticDefaultImports;
	}
	if (override.jsx !== undefined) {
		merged.jsx = override.jsx;
	}
	if (override.types !== undefined) {
		merged.types = override.types; // Replace entire types array
	}

	return merged;
}

/**
 * Resolve a single TypeScriptConfig to compiler options (sync version).
 * Only handles path-based tsconfig - use resolveTypeScriptConfigSingleAsync for function-based.
 *
 * Follows the priority cascade:
 * 1. Parse tsconfig.json if specified (path only, not function)
 * 2. Merge compilerOptions on top
 *
 * @param config - TypeScript config with optional tsconfig path and/or compilerOptions
 * @param projectRoot - Project root for resolving relative tsconfig paths
 * @returns Resolved compiler options (not merged with defaults)
 *
 * @example
 * ```ts
 * // Just tsconfig
 * resolveTypeScriptConfigSingle({ tsconfig: "tsconfig.json" }, "/project");
 *
 * // Just compilerOptions
 * resolveTypeScriptConfigSingle({ compilerOptions: { target: 99 } }, "/project");
 *
 * // Both (compilerOptions override tsconfig)
 * resolveTypeScriptConfigSingle({
 *   tsconfig: "tsconfig.json",
 *   compilerOptions: { strict: false }
 * }, "/project");
 * ```
 */
export function resolveTypeScriptConfigSingle(
	config: TypeScriptConfig | undefined,
	projectRoot: string,
): TypeResolutionCompilerOptions {
	if (!config) {
		return {};
	}

	let options: TypeResolutionCompilerOptions = {};

	// 1. Parse tsconfig if specified (path only, skip functions)
	if (config.tsconfig && typeof config.tsconfig !== "function") {
		const tsconfigPath = String(config.tsconfig);
		try {
			options = parseTsConfig(tsconfigPath, projectRoot);
		} catch (error) {
			if (error instanceof TsConfigParseError) {
				// Re-throw with clear context
				throw error;
			}
			throw new TsConfigParseError(tsconfigPath, error instanceof Error ? error.message : String(error), error);
		}
	}

	// 2. Merge compilerOptions on top
	if (config.compilerOptions) {
		options = mergeCompilerOptions(options, config.compilerOptions);
	}

	return options;
}

/**
 * Resolve a single TypeScriptConfig to compiler options (async version).
 * Handles both path-based and function-based tsconfig.
 *
 * Follows the priority cascade:
 * 1. Load tsconfig (from path or function)
 * 2. Merge compilerOptions on top
 *
 * @param config - TypeScript config with optional tsconfig path/function and/or compilerOptions
 * @param projectRoot - Project root for resolving relative tsconfig paths
 * @returns Promise resolving to compiler options (not merged with defaults)
 *
 * @example
 * ```ts
 * // Path-based tsconfig
 * await resolveTypeScriptConfigSingleAsync({ tsconfig: "tsconfig.json" }, "/project");
 *
 * // Function-based tsconfig
 * await resolveTypeScriptConfigSingleAsync({
 *   tsconfig: async () => ({ target: 99, lib: ["ESNext"] })
 * }, "/project");
 *
 * // Both (compilerOptions override tsconfig)
 * await resolveTypeScriptConfigSingleAsync({
 *   tsconfig: async () => ({ target: 99 }),
 *   compilerOptions: { strict: false }
 * }, "/project");
 * ```
 */
export async function resolveTypeScriptConfigSingleAsync(
	config: TypeScriptConfig | undefined,
	projectRoot: string,
): Promise<TypeResolutionCompilerOptions> {
	if (!config) {
		return {};
	}

	let options: TypeResolutionCompilerOptions = {};

	// 1. Load tsconfig (from path or function)
	if (config.tsconfig) {
		if (typeof config.tsconfig === "function") {
			// Async function - call it to get options
			options = await config.tsconfig();
		} else {
			// Path - parse the tsconfig file
			const tsconfigPath = String(config.tsconfig);
			try {
				options = parseTsConfig(tsconfigPath, projectRoot);
			} catch (error) {
				if (error instanceof TsConfigParseError) {
					throw error;
				}
				throw new TsConfigParseError(tsconfigPath, error instanceof Error ? error.message : String(error), error);
			}
		}
	}

	// 2. Merge compilerOptions on top
	if (config.compilerOptions) {
		options = mergeCompilerOptions(options, config.compilerOptions);
	}

	return options;
}

/**
 * Resolve TypeScript compiler options from a cascade of configurations (async).
 *
 * Resolution order (later levels override earlier):
 * 1. DEFAULT_COMPILER_OPTIONS (sensible defaults)
 * 2. Global plugin config
 * 3. API-level config
 * 4. Version-level config
 * 5. Per-package override (for external packages)
 *
 * At each level, if a TypeScriptConfig has both `tsconfig` and `compilerOptions`,
 * the tsconfig is loaded first, then compilerOptions are merged on top.
 *
 * @param projectRoot - Project root directory for resolving relative paths
 * @param global - Global plugin TypeScript configuration
 * @param api - API-level TypeScript configuration
 * @param version - Version-level TypeScript configuration
 * @param packageOverride - Per-package TypeScript configuration override
 * @returns Promise resolving to fully resolved compiler options
 *
 * @example
 * ```ts
 * // Simple global config
 * const options = await resolveTypeScriptConfig("/project", {
 *   tsconfig: "tsconfig.json"
 * });
 *
 * // With async tsconfig loader
 * const options = await resolveTypeScriptConfig("/project", {
 *   tsconfig: async () => ({ target: 99, lib: ["ESNext"] })
 * });
 *
 * // With API override
 * const options = await resolveTypeScriptConfig(
 *   "/project",
 *   { tsconfig: "tsconfig.json" },
 *   { compilerOptions: { strict: false } }
 * );
 *
 * // Full cascade
 * const options = await resolveTypeScriptConfig(
 *   "/project",
 *   { tsconfig: "tsconfig.json" },           // global
 *   { compilerOptions: { strict: false } },  // API
 *   { compilerOptions: { target: 9 } },      // version
 *   { compilerOptions: { module: 1 } }       // package override
 * );
 * ```
 */
export async function resolveTypeScriptConfig(
	projectRoot: string,
	global?: TypeScriptConfig,
	api?: TypeScriptConfig,
	version?: TypeScriptConfig,
	packageOverride?: TypeScriptConfig,
): Promise<TypeResolutionCompilerOptions> {
	// 1. Start with defaults
	let options = { ...DEFAULT_COMPILER_OPTIONS };

	// 2. Apply global config
	const globalOptions = await resolveTypeScriptConfigSingleAsync(global, projectRoot);
	options = mergeCompilerOptions(options, globalOptions);

	// 3. Apply API-level config
	const apiOptions = await resolveTypeScriptConfigSingleAsync(api, projectRoot);
	options = mergeCompilerOptions(options, apiOptions);

	// 4. Apply version-level config
	const versionOptions = await resolveTypeScriptConfigSingleAsync(version, projectRoot);
	options = mergeCompilerOptions(options, versionOptions);

	// 5. Apply per-package override
	const packageOptions = await resolveTypeScriptConfigSingleAsync(packageOverride, projectRoot);
	options = mergeCompilerOptions(options, packageOptions);

	return options;
}

/**
 * Check if a TypeScriptConfig has any configuration.
 *
 * @param config - TypeScript config to check
 * @returns True if config has tsconfig or compilerOptions
 */
export function hasTypeScriptConfig(config?: TypeScriptConfig): boolean {
	if (!config) {
		return false;
	}
	return Boolean(config.tsconfig || config.compilerOptions);
}
