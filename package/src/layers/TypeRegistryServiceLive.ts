import { NodeFileSystem, NodeHttpClient } from "@effect/platform-node";
import { Cache } from "@effected/store";
import { AppDirs, Xdg } from "@effected/xdg";
import { Duration, Effect, Layer, Path } from "effect";
import { PackageFetcher, PackageSpec, RegistryObserver, TypeCache, TypeRegistry } from "type-registry-effect";
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
const RegistryObserverLayer = Layer.succeed(RegistryObserver, {
	emit: (event) => {
		switch (event._tag) {
			case "VersionResolved":
				return emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "", packageName: event.package },
						level: "debug",
						kind: "VersionResolved",
						detail: `${event.requested} -> ${event.resolved}`,
					}),
				);
			case "VersionResolveFailed":
				return emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "", packageName: event.package },
						level: "debug",
						kind: "VersionResolveFailed",
						detail: `${event.requested}: ${event.kind}`,
					}),
				);
			case "CacheHit":
			case "CacheMiss":
			case "FetchStart":
				return emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "", packageName: event.package, version: event.version },
						level: "debug",
						kind: event._tag,
						detail: "",
					}),
				);
			case "CacheStale":
				return emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "", packageName: event.package, version: event.version },
						level: "debug",
						kind: "CacheStale",
						detail: "",
					}),
				);
			// A single HTTP request returned non-2xx. This is low-level and usually
			// handled gracefully upstream (e.g. an unpublished/workspace package that
			// is then dropped), so it stays at debug. A package that actually fails to
			// load surfaces as PackageLoadFailed at warning.
			case "FetchFailed":
				return emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "" },
						level: "debug",
						kind: "FetchFailed",
						detail: `HTTP ${event.status}: ${event.url}${event.bodySnippet ? ` — ${event.bodySnippet}` : ""}`,
					}),
				);
			case "PackageLoaded":
				return emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "", packageName: event.package, version: event.version },
						level: "debug",
						kind: "PackageLoaded",
						detail: `${event.files} files, ${event.source}`,
					}),
				);
			case "PackageLoadFailed":
				return emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "", packageName: event.package, version: event.version },
						level: "warn",
						kind: "PackageLoadFailed",
						detail: `[${event.kind}] ${event.error instanceof Error ? event.error.message : String(event.error)}`,
					}),
				);
			case "BatchStart":
				return emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "" },
						level: "debug",
						kind: "BatchStart",
						detail: `${event.total} package(s)`,
					}),
				);
			case "BatchComplete":
				return emit(
					PluginEvent.TypeRegistryEvent({
						ctx: { buildId: "" },
						level: "info",
						kind: "BatchComplete",
						detail: `${event.loaded}/${event.total} packages, ${event.totalFiles} files, ${Math.round(
							Duration.toMillis(event.duration),
						)}ms`,
					}),
				);
		}
	},
});

/**
 * type-registry-effect v2 composes at the edge: the library ships no platform
 * layer of its own, so the plugin wires FileSystem/Path, the XDG directories,
 * the sqlite metadata Cache and the HTTP client here.
 *
 * All layers are bound to module-level consts (never rebuilt per call) per the
 * v4 layer memoization discipline.
 */
const PlatformLive = Layer.mergeAll(NodeFileSystem.layer, Path.layer);

/** XDG app directories under the library's shared namespace (cache is shared across consumers). */
const AppDirsLive = AppDirs.layer({ namespace: "type-registry-effect" }).pipe(
	Layer.provide(Layer.mergeAll(Xdg.layer, PlatformLive)),
);

/** Metadata plane: a sqlite-backed `@effected/store` Cache rooted in the XDG cache dir. */
const MetadataCacheLive = Layer.unwrap(
	Effect.gen(function* () {
		const appDirs = yield* AppDirs;
		const path = yield* Path.Path;
		const cacheDir = yield* appDirs.ensureCache;
		return Cache.layerSqlite({ filename: path.join(cacheDir, "metadata.sqlite") });
	}),
).pipe(Layer.provide(Layer.mergeAll(AppDirsLive, PlatformLive)));

/**
 * The full registry runtime: TypeRegistry over an XDG-rooted TypeCache and the
 * jsDelivr PackageFetcher, with the observer that forwards registry events to
 * the plugin's EventBus (found ambiently via serviceOption at emit time).
 */
const RegistryLayer = TypeRegistry.layer.pipe(
	Layer.provideMerge(Layer.mergeAll(TypeCache.layerXdg(), PackageFetcher.layer)),
	Layer.provideMerge(RegistryObserverLayer),
	Layer.provide(Layer.mergeAll(MetadataCacheLive, AppDirsLive, PlatformLive, NodeHttpClient.layerUndici)),
);

/**
 * TypeRegistryServiceLive: uses type-registry-effect Effect programs directly.
 */
export const TypeRegistryServiceLive = Layer.succeed(TypeRegistryService, {
	resolveVersions: (packages) =>
		Effect.gen(function* () {
			const registry = yield* TypeRegistry;
			return yield* resolveExternalPackageVersions(packages, (pkg) => registry.resolveVersion(pkg.name, pkg.version));
		}).pipe(
			Effect.provide(RegistryLayer),
			// Registry infrastructure failure (e.g. no HOME for XDG, cache DB unwritable):
			// pass the specs through unresolved so the failure surfaces on loadPackages
			// with a meaningful error instead of being silently swallowed here.
			Effect.catch(() => Effect.succeed([...packages])),
		),

	// The empty-input guard sits OUTSIDE the provided effect: Effect.provide
	// acquires RegistryLayer before the generator runs, so guarding inside
	// would still build (and possibly fail on) the XDG/sqlite/http stack for
	// a call that has nothing to load.
	loadPackages: (packages) =>
		packages.length === 0
			? Effect.succeed({ vfs: new Map<string, string>() })
			: Effect.gen(function* () {
					const specs = packages.map((pkg) => new PackageSpec({ name: pkg.name, version: pkg.version }));
					const registry = yield* TypeRegistry;
					return { vfs: yield* registry.getVfs(specs, { autoFetch: true }) };
				}).pipe(
					Effect.provide(RegistryLayer),
					Effect.catch((error) =>
						Effect.fail(
							new PluginTypeRegistryError({
								packageName: packages.map((p) => p.name).join(", "),
								version: packages.map((p) => p.version).join(", "),
								reason: error instanceof Error ? (error.message ?? String(error)) : String(error),
							}),
						),
					),
				),
});
