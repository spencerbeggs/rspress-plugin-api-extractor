import { Effect, Layer } from "effect";
import { PackageSpec, RegistryEvent, TypeRegistry, TypeRegistryObserver } from "type-registry-effect";
import { NodeLayer } from "type-registry-effect/node";
import { resolveExternalPackageVersions } from "../config-utils.js";
import { TypeRegistryError as PluginTypeRegistryError } from "../errors.js";
import { emit } from "../observability/EventBus.js";
import { PluginEvent } from "../observability/events.js";
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
				emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "", packageName: pkg },
						level: "debug",
						kind: "VersionResolved",
						detail: `${requested} -> ${resolved}`,
					}),
				),
			VersionResolveFailed: ({ package: pkg, requested, reason }) =>
				emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "", packageName: pkg },
						level: "debug",
						kind: "VersionResolveFailed",
						detail: `${requested}: ${reason}`,
					}),
				),
			CacheHit: ({ package: pkg, version }) =>
				emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "", packageName: pkg, version },
						level: "debug",
						kind: "CacheHit",
						detail: "",
					}),
				),
			CacheStale: ({ package: pkg, version }) =>
				emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "", packageName: pkg, version },
						level: "debug",
						kind: "CacheStale",
						detail: "",
					}),
				),
			CacheMiss: ({ package: pkg, version }) =>
				emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "", packageName: pkg, version },
						level: "debug",
						kind: "CacheMiss",
						detail: "",
					}),
				),
			FetchStart: ({ package: pkg, version }) =>
				emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "", packageName: pkg, version },
						level: "debug",
						kind: "FetchStart",
						detail: "",
					}),
				),
			// A single HTTP request returned non-2xx. This is low-level and usually
			// handled gracefully upstream (e.g. an unpublished/workspace package that
			// is then dropped), so it stays at debug. A package that actually fails to
			// load surfaces as PackageLoadFailed at warning.
			FetchFailed: ({ url, status, bodySnippet }) =>
				emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "" },
						level: "debug",
						kind: "FetchFailed",
						detail: `HTTP ${status}: ${url}${bodySnippet ? ` — ${bodySnippet}` : ""}`,
					}),
				),
			PackageLoaded: ({ package: pkg, version, files, source }) =>
				emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "", packageName: pkg, version },
						level: "debug",
						kind: "PackageLoaded",
						detail: `${files} files, ${source}`,
					}),
				),
			PackageLoadFailed: ({ package: pkg, version, kind, message }) =>
				emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "", packageName: pkg, version },
						level: "warn",
						kind: "PackageLoadFailed",
						detail: `[${kind}] ${message}`,
					}),
				),
			BatchStart: ({ total }) =>
				emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "" },
						level: "debug",
						kind: "BatchStart",
						detail: `${total} package(s)`,
					}),
				),
			BatchComplete: ({ loaded, total, totalFiles, durationMs }) =>
				emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "" },
						level: "info",
						kind: "BatchComplete",
						detail: `${loaded}/${total} packages, ${totalFiles} files, ${durationMs}ms`,
					}),
				),
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
