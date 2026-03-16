import type { VirtualFileSystem } from "type-registry-effect";
import { PackageSpec } from "type-registry-effect";
import type { VirtualTypeScriptEnvironment } from "type-registry-effect/node";
import { createTypeScriptCache, fetchAndCache, getVFS, resolveVersion } from "type-registry-effect/node";
import type ts from "typescript";
import type { DebugLogger } from "./debug-logger.js";
import type { ExternalPackageSpec, TypeResolutionCompilerOptions } from "./types.js";
import { DEFAULT_COMPILER_OPTIONS } from "./typescript-config.js";

/**
 * Options for loading external package types
 */
export interface TypeRegistryLoaderOptions {
	/**
	 * External packages to fetch and cache.
	 */
	packages: ExternalPackageSpec[];

	/**
	 * Optional cache directory path.
	 * Defaults to $XDG_CACHE_HOME/type-registry-effect or ~/.cache/type-registry-effect
	 */
	cacheDir?: string;

	/**
	 * Cache time-to-live in milliseconds.
	 * @default 7 days (604800000 ms)
	 */
	ttl?: number;

	/**
	 * Enable verbose logging.
	 * @default false
	 */
	verbose?: boolean;
}

/**
 * Result from loading external package types
 */
export interface TypeRegistryLoaderResult {
	/**
	 * Virtual file system containing all type definitions.
	 * Maps file paths (with node_modules/ prefix) to file content.
	 */
	vfs: VirtualFileSystem;

	/**
	 * List of packages that were successfully loaded.
	 */
	loaded: ExternalPackageSpec[];

	/**
	 * List of packages that failed to load with error messages.
	 */
	failed: Array<{ package: ExternalPackageSpec; error: string }>;

	/**
	 * TypeScript virtual environment cache for use with Twoslash or other TypeScript tools.
	 * This cache can be passed to transformerTwoslash({ cache }) to enable TypeScript language service reuse.
	 */
	tsCache?: Map<string, VirtualTypeScriptEnvironment>;
}

/**
 * Loader for external package TypeScript type definitions.
 * Uses type-registry-effect to fetch and cache type definitions from npm packages.
 */
export class TypeRegistryLoader {
	/**
	 * @param _cacheDir - Reserved for future use; the Promise API uses platform defaults.
	 * @param ttl - Cache TTL in milliseconds passed to fetchAndCache.
	 * @param logger - Optional debug logger.
	 */
	constructor(
		readonly _cacheDir?: string,
		private readonly ttl?: number,
		private readonly logger?: DebugLogger,
	) {}

	/**
	 * Load external package types.
	 * Fetches and caches TypeScript type definitions from npm packages.
	 *
	 * @param packages - External packages to fetch
	 * @param options - Optional loader options
	 * @param options.createTsCache - If true, creates a TypeScript virtual environment cache
	 * @param options.compilerOptions - TypeScript compiler options for the cache (defaults to DEFAULT_COMPILER_OPTIONS)
	 * @returns Promise resolving to VFS and load status
	 *
	 * @example
	 * ```typescript
	 * const loader = new TypeRegistryLoader();
	 * const result = await loader.load([
	 *   { name: "zod", version: "3.22.4" },
	 *   { name: "@effect/schema", version: "0.68.0" }
	 * ]);
	 *
	 * console.log(`Loaded ${result.loaded.length} packages`);
	 * if (result.failed.length > 0) {
	 *   console.warn("Failed to load:", result.failed);
	 * }
	 *
	 * // Merge with existing VFS
	 * const combinedVfs = new Map([...existingVfs, ...result.vfs]);
	 * ```
	 */
	public async load(
		packages: ExternalPackageSpec[],
		options?: {
			createTsCache?: boolean;
			compilerOptions?: TypeResolutionCompilerOptions;
		},
	): Promise<TypeRegistryLoaderResult> {
		// If no packages and no cache requested, return early
		if ((!packages || packages.length === 0) && !options?.createTsCache) {
			return {
				vfs: new Map(),
				loaded: [],
				failed: [],
			};
		}

		// Handle case where only TypeScript cache is needed (no external packages)
		// This loads TypeScript lib files (lib.esnext.d.ts, lib.dom.d.ts, etc.)
		if (!packages || packages.length === 0) {
			const compilerOpts = (options?.compilerOptions ?? DEFAULT_COMPILER_OPTIONS) as ts.CompilerOptions;
			// Create cache with empty packages - this still loads lib files from node_modules
			const tsCache = await createTypeScriptCache([], compilerOpts);

			if (this.logger?.isVerbose()) {
				this.logger.verbose("✅ Created TypeScript environment cache with lib files (no external packages)");
			}

			return {
				vfs: new Map(),
				loaded: [],
				failed: [],
				tsCache,
			};
		}

		const startTime = performance.now();

		// Emit batch start event
		if (this.logger?.isVerbose()) {
			this.logger.verbose(`📦 Loading types for ${packages.length} external package(s)...`);
		}

		const loaded: ExternalPackageSpec[] = [];
		const failed: Array<{ package: ExternalPackageSpec; error: string }> = [];

		// Fetch all packages in parallel using Promise.allSettled
		const fetchOpts = this.ttl !== undefined ? { ttl: this.ttl } : undefined;
		const results = await Promise.allSettled(
			packages.map(async (pkg) => {
				// Resolve version range to exact version (jsDelivr /flat API requires exact versions)
				const resolvedVersionStr = await resolveVersion(pkg.name, pkg.version);
				const resolvedPkg = { name: pkg.name, version: resolvedVersionStr };
				const pkgSpec = new PackageSpec({ name: pkg.name, version: resolvedVersionStr });

				// Fetch and cache the package with resolved version
				await fetchAndCache(pkgSpec, fetchOpts);

				return { resolvedPkg, pkgSpec };
			}),
		);

		// Collect resolved PackageSpec instances for VFS generation
		const resolvedSpecs: PackageSpec[] = [];

		// Process results
		for (let i = 0; i < results.length; i++) {
			const result = results[i];
			const pkg = packages[i];

			if (result.status === "fulfilled") {
				const { resolvedPkg, pkgSpec } = result.value;
				resolvedSpecs.push(pkgSpec);
				loaded.push(resolvedPkg);

				// Log in verbose mode only
				if (this.logger?.isVerbose()) {
					this.logger.verbose(`   ✓ ${resolvedPkg.name}@${resolvedPkg.version}`);
				}
			} else {
				const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason);
				failed.push({ package: pkg, error: errorMessage });

				// Always warn on failures (unless logger is silent)
				if (this.logger) {
					this.logger.warn(`   ✗ ${pkg.name}@${pkg.version}: ${errorMessage}`);
				}
			}
		}

		// Get combined VFS for all successfully loaded packages
		let combinedVfs: VirtualFileSystem = new Map();
		if (resolvedSpecs.length > 0) {
			combinedVfs = await getVFS(resolvedSpecs);
		}

		// Calculate duration
		const durationMs = performance.now() - startTime;

		// Emit batch complete event in verbose mode
		if (this.logger?.isVerbose()) {
			const duration = durationMs >= 1000 ? `${(durationMs / 1000).toFixed(2)}s` : `${durationMs.toFixed(0)}ms`;
			if (failed.length > 0) {
				this.logger.verbose(
					`   Completed: ${loaded.length}/${packages.length} packages loaded (${combinedVfs.size} files, ${duration}) - ${failed.length} failed`,
				);
			} else {
				this.logger.verbose(`   Completed: ${loaded.length} packages loaded (${combinedVfs.size} files, ${duration})`);
			}
		}

		// Create TypeScript cache if requested
		let tsCache: Map<string, VirtualTypeScriptEnvironment> | undefined;
		if (options?.createTsCache && loaded.length > 0) {
			const cacheTimer = this.logger?.startTimer("Creating TypeScript environment cache");
			// Use provided compiler options or fall back to defaults
			// Cast to ts.CompilerOptions for compatibility with the expected type
			const compilerOpts = (options.compilerOptions ?? DEFAULT_COMPILER_OPTIONS) as ts.CompilerOptions;
			tsCache = await createTypeScriptCache(resolvedSpecs, compilerOpts);
			cacheTimer?.end();

			if (this.logger?.isVerbose()) {
				this.logger.verbose(`   ✓ Created TypeScript environment cache with ${loaded.length} package(s)`);
			}
		}

		return {
			vfs: combinedVfs,
			loaded,
			failed,
			tsCache,
		};
	}

	/**
	 * Check if any packages are configured for loading.
	 * Useful for early-exit optimization.
	 *
	 * @param packages - External package specifications (may be undefined)
	 * @returns True if packages need to be loaded
	 */
	public static hasPackages(packages?: ExternalPackageSpec[]): boolean {
		return Boolean(packages && packages.length > 0);
	}
}
