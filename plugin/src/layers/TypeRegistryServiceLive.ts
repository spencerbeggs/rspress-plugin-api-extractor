import { Effect, Layer } from "effect";
import { PackageSpec, TypeRegistry } from "type-registry-effect";
import { NodeLayer, createTypeScriptCache } from "type-registry-effect/node";
import type ts from "typescript";
import { TypeRegistryError as PluginTypeRegistryError } from "../errors.js";
import { TypeRegistryService } from "../services/TypeRegistryService.js";

/**
 * TypeRegistryServiceLive: uses type-registry-effect Effect programs directly.
 *
 * The NodeLayer from type-registry-effect provides CacheService, PackageFetcher,
 * and TypeResolver with Node.js platform implementations (FileSystem, HttpClient).
 *
 * Built-in metrics (packagesLoaded, packagesFailed, cacheHits, etc.) are
 * automatically tracked by the upstream library.
 */
export const TypeRegistryServiceLive = Layer.succeed(TypeRegistryService, {
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
		}).pipe(Effect.provide(NodeLayer)),

	createTypeScriptCache: (packages, compilerOptions: object) =>
		Effect.tryPromise({
			try: () => {
				const specs = packages.map((pkg) => new PackageSpec({ name: pkg.name, version: pkg.version }));
				return createTypeScriptCache(specs, compilerOptions as unknown as ts.CompilerOptions);
			},
			catch: (error) =>
				new PluginTypeRegistryError({
					packageName: packages.map((p) => p.name).join(", "),
					version: "",
					reason: error instanceof Error ? error.message : String(error),
				}),
		}),
});
