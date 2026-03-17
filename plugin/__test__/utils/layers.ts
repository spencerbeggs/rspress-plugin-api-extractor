import { createHash } from "node:crypto";
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
			upsert: (snapshot: FileSnapshot) =>
				Ref.update(store, (m) => {
					const next = new Map(m);
					next.set(`${snapshot.outputDir}::${snapshot.filePath}`, snapshot);
					return next;
				}).pipe(Effect.as(true)),
			getAllForDirectory: (outputDir: string) =>
				Ref.get(store).pipe(Effect.map((m) => [...m.values()].filter((s) => s.outputDir === outputDir))),
			cleanupStale: (_outputDir: string, _currentFiles: ReadonlySet<string>) =>
				Effect.succeed([] as ReadonlyArray<string>),
			hashContent: (content: string) => createHash("sha256").update(content).digest("hex"),
			hashFrontmatter: (frontmatter: Record<string, unknown>) => {
				const filtered: Record<string, unknown> = {};
				for (const [key, value] of Object.entries(frontmatter)) {
					if (key !== "head" && key !== "publishedTime" && key !== "modifiedTime") {
						filtered[key] = value;
					}
				}
				const sorted = JSON.stringify(
					Object.keys(filtered)
						.sort()
						.reduce(
							(acc, key) => {
								acc[key] = filtered[key];
								return acc;
							},
							{} as Record<string, unknown>,
						),
				);
				return createHash("sha256").update(sorted).digest("hex");
			},
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
