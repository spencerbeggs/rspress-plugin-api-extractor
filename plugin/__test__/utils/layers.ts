import { Effect, Layer, Option, Ref } from "effect";
import { deriveOutputPaths, normalizeBaseRoute } from "../../src/path-derivation.js";
import { CrossLinkerService } from "../../src/services/CrossLinkerService.js";
import { PathDerivationService } from "../../src/services/PathDerivationService.js";
import { ShikiService } from "../../src/services/ShikiService.js";
import type { FileSnapshot } from "../../src/services/SnapshotService.js";
import { SnapshotService } from "../../src/services/SnapshotService.js";
import { TypeRegistryService } from "../../src/services/TypeRegistryService.js";

/**
 * Mock SnapshotService with in-memory Map storage.
 */
export const MockSnapshotServiceLayer = Layer.effect(
	SnapshotService,
	Effect.gen(function* () {
		const store = yield* Ref.make(new Map<string, FileSnapshot>());
		return {
			getSnapshot: (outputDir: string, filePath: string) =>
				Ref.get(store).pipe(Effect.map((m) => Option.fromNullable(m.get(`${outputDir}::${filePath}`)))),
			getAllForDirectory: (outputDir: string) =>
				Ref.get(store).pipe(Effect.map((m) => [...m.values()].filter((s) => s.outputDir === outputDir))),
			getFilePaths: (outputDir: string) =>
				Ref.get(store).pipe(
					Effect.map((m) => [...m.values()].filter((s) => s.outputDir === outputDir).map((s) => s.filePath)),
				),
			upsert: (snapshot: FileSnapshot) =>
				Ref.update(store, (m) => {
					const next = new Map(m);
					next.set(`${snapshot.outputDir}::${snapshot.filePath}`, snapshot);
					return next;
				}).pipe(Effect.as(true)),
			batchUpsert: (snapshots: ReadonlyArray<FileSnapshot>) =>
				Ref.update(store, (m) => {
					const next = new Map(m);
					for (const snapshot of snapshots) {
						next.set(`${snapshot.outputDir}::${snapshot.filePath}`, snapshot);
					}
					return next;
				}).pipe(Effect.as(snapshots.length)),
			deleteSnapshot: (outputDir: string, filePath: string) =>
				Ref.update(store, (m) => {
					const next = new Map(m);
					next.delete(`${outputDir}::${filePath}`);
					return next;
				}),
			cleanupStale: (_outputDir: string, _currentFiles: ReadonlySet<string>) =>
				Effect.succeed([] as ReadonlyArray<string>),
		};
	}),
);

/**
 * Mock PathDerivationService using the real pure functions.
 */
export const MockPathDerivationServiceLayer = Layer.succeed(PathDerivationService, {
	derivePaths: (input) => Effect.succeed(deriveOutputPaths(input)),
	normalizeBaseRoute: (route) => Effect.succeed(normalizeBaseRoute(route)),
});

/**
 * Mock TypeRegistryService returning empty VFS and cache.
 */
export const MockTypeRegistryServiceLayer = Layer.succeed(TypeRegistryService, {
	loadPackages: (_packages) => Effect.succeed({ vfs: new Map() }),
	createTypeScriptCache: (_packages, _compilerOptions) => Effect.succeed(new Map()),
});

/**
 * Mock CrossLinkerService with no-op registration.
 */
export const MockCrossLinkerServiceLayer = Layer.succeed(CrossLinkerService, {
	registerItems: (_data, _scope) => Effect.void,
	generateInlineCodeLinks: (text) => Effect.succeed(text),
	getCrossLinkData: Effect.succeed({ routes: new Map(), kinds: new Map() }),
});

/**
 * Mock ShikiService returning placeholder HTML.
 */
export const MockShikiServiceLayer = Layer.succeed(ShikiService, {
	highlightCode: (code, _lang, _transformers, _meta) => Effect.succeed(`<pre><code>${code}</code></pre>`),
	getCrossLinkerTransformer: Effect.succeed({ name: "mock-cross-linker" }),
});
