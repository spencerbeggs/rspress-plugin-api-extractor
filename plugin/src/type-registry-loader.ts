import type { LogEvent, VirtualFileSystem, VirtualTypeScriptEnvironment } from "type-registry-effect";
import { TypeRegistry } from "type-registry-effect";
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
	constructor(
		private readonly cacheDir?: string,
		private readonly ttl?: number,
		private readonly logger?: DebugLogger,
	) {}

	/**
	 * Handle log events from TypeRegistry.
	 * Converts structured events to appropriate logger calls based on log level.
	 * @private
	 */
	private handleLogEvent(event: LogEvent): void {
		if (!this.logger) {
			return;
		}

		if (this.logger.isDebug()) {
			// In debug mode, emit structured JSON for LLM consumption
			this.logger.debug(JSON.stringify(event));
			return;
		}

		if (!this.logger.isVerbose()) {
			// In info mode, suppress all TypeRegistry events
			// (Plugin shows high-level summaries instead)
			return;
		}

		// Verbose mode: Human-friendly output
		switch (event.event) {
			case "package.version.resolved": {
				const {
					package: pkg,
					requested,
					resolved,
				} = event.data as {
					package: string;
					requested: string;
					resolved: string;
				};
				if (requested !== resolved) {
					this.logger.verbose(`   Resolved ${pkg}: ${requested} → ${resolved}`);
				}
				break;
			}

			case "cache.hit": {
				const {
					package: pkg,
					version,
					ageMinutes,
				} = event.data as {
					package: string;
					version: string;
					ageMinutes: number;
				};
				this.logger.verbose(`   ✓ ${pkg}@${version} (cached, ${ageMinutes}m old)`);
				break;
			}

			case "cache.miss": {
				const { package: pkg, version } = event.data as {
					package: string;
					version: string;
				};
				this.logger.verbose(`   Fetching ${pkg}@${version}...`);
				break;
			}

			case "cache.stale": {
				const {
					package: pkg,
					version,
					ageMinutes,
					ttlMinutes,
				} = event.data as {
					package: string;
					version: string;
					ageMinutes: number;
					ttlMinutes: number;
				};
				this.logger.verbose(`   Cache stale for ${pkg}@${version} (age: ${ageMinutes}m, TTL: ${ttlMinutes}m)`);
				break;
			}

			case "package.loaded": {
				const {
					package: pkg,
					version,
					files,
					source,
				} = event.data as {
					package: string;
					version: string;
					files: number;
					source: string;
				};
				const sourceLabel = source === "cache" ? "cached" : "downloaded";
				this.logger.verbose(`   ✓ Loaded ${pkg}@${version} (${files} files, ${sourceLabel})`);
				break;
			}

			case "package.load.failed": {
				const {
					package: pkg,
					version,
					error,
				} = event.data as {
					package: string;
					version: string;
					error: string;
				};
				this.logger.warn(`   ✗ Failed to load ${pkg}@${version}: ${error}`);
				break;
			}

			case "package.fetch.start": {
				const { package: pkg, version } = event.data as {
					package: string;
					version: string;
				};
				this.logger.verbose(`   Downloading ${pkg}@${version}...`);
				break;
			}

			case "packages.batch.start": {
				const { total } = event.data as {
					total: number;
				};
				this.logger.verbose(`📦 Loading ${total} external package(s)...`);
				break;
			}

			case "packages.batch.complete": {
				const { loaded, failed, totalFiles, durationMs } = event.data as {
					loaded: number;
					failed: number;
					totalFiles: number;
					durationMs: number;
				};
				const duration = durationMs >= 1000 ? `${(durationMs / 1000).toFixed(2)}s` : `${durationMs.toFixed(0)}ms`;
				if (failed > 0) {
					this.logger.verbose(
						`   Loaded ${loaded}/${loaded + failed} packages (${totalFiles} files, ${duration}) - ${failed} failed`,
					);
				} else {
					this.logger.verbose(`   Loaded ${loaded} packages (${totalFiles} files, ${duration})`);
				}
				break;
			}

			// Ignore unknown events
			default:
				break;
		}
	}

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
			const registry = await TypeRegistry.create({
				cacheDir: this.cacheDir,
				ttl: this.ttl,
				logLevel: "none",
				onLogEvent: (event: LogEvent) => this.handleLogEvent(event),
			});

			const compilerOpts = (options?.compilerOptions ?? DEFAULT_COMPILER_OPTIONS) as ts.CompilerOptions;
			// Create cache with empty packages - this still loads lib files from node_modules
			const tsCache = await registry.createTypeScriptCache([], compilerOpts);

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

		// Initialize TypeRegistry with event handler
		// Note: We set logLevel to "none" for Effect's internal logger since we handle
		// all logging through our custom event handler (onLogEvent)
		const registry = await TypeRegistry.create({
			cacheDir: this.cacheDir,
			ttl: this.ttl,
			logLevel: "none", // Suppress Effect's internal logger - we use onLogEvent instead
			onLogEvent: (event: LogEvent) => this.handleLogEvent(event),
		});

		const loaded: ExternalPackageSpec[] = [];
		const failed: Array<{ package: ExternalPackageSpec; error: string }> = [];
		const combinedVfs = new Map<string, string>();

		// Fetch all packages in parallel using Promise.allSettled
		const results = await Promise.allSettled(
			packages.map(async (pkg) => {
				// Resolve version range to exact version (jsDelivr /flat API requires exact versions)
				const resolvedVersion = await registry.resolveVersion(pkg.name, pkg.version);
				const resolvedPkg = { name: pkg.name, version: resolvedVersion };

				// Fetch and cache the package with resolved version
				await registry.fetchAndCache(resolvedPkg);

				// Get VFS for this package
				const packageVfs = await registry.getPackageVFS(resolvedPkg);

				return { resolvedPkg, packageVfs };
			}),
		);

		// Process results
		for (let i = 0; i < results.length; i++) {
			const result = results[i];
			const pkg = packages[i];

			if (result.status === "fulfilled") {
				const { resolvedPkg, packageVfs } = result.value;

				// Merge into combined VFS
				for (const [path, content] of packageVfs.entries()) {
					combinedVfs.set(path, content);
				}

				loaded.push(resolvedPkg);

				// Log in verbose mode only
				if (this.logger?.isVerbose()) {
					this.logger.verbose(`   ✓ ${resolvedPkg.name}@${resolvedPkg.version} (${packageVfs.size} files)`);
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
			// Cast to ts.CompilerOptions for compatibility with TypeRegistry's expected type
			const compilerOpts = (options.compilerOptions ?? DEFAULT_COMPILER_OPTIONS) as ts.CompilerOptions;
			tsCache = await registry.createTypeScriptCache(loaded, compilerOpts);
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
