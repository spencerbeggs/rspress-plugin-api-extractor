import { Effect, Layer } from "effect";
import { PackageSpec, RegistryEvent, TypeRegistry, TypeRegistryObserver } from "type-registry-effect";
import { NodeLayer } from "type-registry-effect/node";
import { resolveExternalPackageVersions } from "../config-utils.js";
import { TypeRegistryError as PluginTypeRegistryError } from "../errors.js";
import { TypeRegistryService } from "../services/TypeRegistryService.js";

/**
 * Forward type-registry-effect's typed `RegistryEvent`s to the plugin's Effect
 * logger. Since v1 the library emits no logs of its own — observers are the only
 * diagnostic surface — so this restores the build output and routes it through
 * the plugin's configured log level/format (a single source, no duplication).
 *
 * The summary (`BatchComplete`) and failures are surfaced at info/warning;
 * per-package detail stays at debug so a normal build is quiet.
 */
const RegistryObserverLayer = Layer.succeed(TypeRegistryObserver, {
	emit: (event) =>
		RegistryEvent.$match(event, {
			VersionResolved: ({ package: pkg, requested, resolved }) =>
				Effect.logDebug(`Resolved ${pkg}: ${requested} -> ${resolved}`),
			VersionResolveFailed: ({ package: pkg, requested, reason }) =>
				Effect.logDebug(`Could not resolve ${pkg}@${requested}: ${reason}`),
			CacheHit: ({ package: pkg, version }) => Effect.logDebug(`Cache hit for ${pkg}@${version}`),
			CacheStale: ({ package: pkg, version }) => Effect.logDebug(`Cache stale for ${pkg}@${version}`),
			CacheMiss: ({ package: pkg, version }) => Effect.logDebug(`Cache miss for ${pkg}@${version}`),
			FetchStart: ({ package: pkg, version }) => Effect.logDebug(`Fetching ${pkg}@${version}`),
			// A single HTTP request returned non-2xx. This is low-level and usually
			// handled gracefully upstream (e.g. an unpublished/workspace package that
			// is then dropped), so it stays at debug. A package that actually fails to
			// load surfaces as PackageLoadFailed at warning.
			FetchFailed: ({ url, status, bodySnippet }) =>
				Effect.logDebug(`Fetch failed (HTTP ${status}): ${url}${bodySnippet ? ` — ${bodySnippet}` : ""}`),
			PackageLoaded: ({ package: pkg, version, files, source }) =>
				Effect.logDebug(`Loaded ${pkg}@${version} (${files} files, ${source})`),
			PackageLoadFailed: ({ package: pkg, version, kind, message }) =>
				Effect.logWarning(`Failed to load ${pkg}@${version} [${kind}]: ${message}`),
			BatchStart: ({ total }) => Effect.logDebug(`Loading types for ${total} external package(s)`),
			BatchComplete: ({ loaded, total, totalFiles, durationMs }) =>
				Effect.log(`Loaded ${loaded}/${total} external packages (${totalFiles} files, ${durationMs}ms)`),
		}),
});

/**
 * type-registry-effect runtime: the Node platform layer plus the observer that
 * forwards registry events to the plugin logger.
 *
 * `NodeLayer` provides CacheService, PackageFetcher, and TypeResolver with
 * Node.js platform implementations (FileSystem, HttpClient). Built-in metrics
 * (packagesLoaded, packagesFailed, cacheHits, etc.) are tracked by the library.
 */
const RegistryLayer = Layer.merge(NodeLayer, RegistryObserverLayer);

/**
 * TypeRegistryServiceLive: uses type-registry-effect Effect programs directly.
 */
export const TypeRegistryServiceLive = Layer.succeed(TypeRegistryService, {
	resolveVersions: (packages) =>
		resolveExternalPackageVersions(packages, (pkg) => TypeRegistry.resolveVersion(pkg.name, pkg.version)).pipe(
			Effect.provide(RegistryLayer),
		),

	loadPackages: (packages) =>
		Effect.gen(function* () {
			if (packages.length === 0) {
				return { vfs: new Map() };
			}

			const specs = packages.map((pkg) => new PackageSpec({ name: pkg.name, version: pkg.version }));

			const vfs = yield* TypeRegistry.getVFS(specs, { autoFetch: true }).pipe(
				Effect.catchAll((error) =>
					Effect.fail(
						new PluginTypeRegistryError({
							packageName: packages.map((p) => p.name).join(", "),
							version: packages.map((p) => p.version).join(", "),
							reason: error.message ?? String(error),
						}),
					),
				),
			);

			return { vfs };
		}).pipe(Effect.provide(RegistryLayer)),
});
