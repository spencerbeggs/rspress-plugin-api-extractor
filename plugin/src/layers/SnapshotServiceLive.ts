import { Effect, Layer, Option } from "effect";
import { SnapshotService } from "../services/SnapshotService.js";
import { SnapshotManager } from "../snapshot-manager.js";

/**
 * Phase 1 wrapper: delegates to existing SnapshotManager.
 * Uses Layer.scoped + acquireRelease to guarantee DB cleanup.
 */
export const SnapshotServiceLive = (dbPath: string) =>
	Layer.scoped(
		SnapshotService,
		Effect.acquireRelease(
			Effect.sync(() => new SnapshotManager(dbPath)),
			(manager) => Effect.sync(() => manager.close()),
		).pipe(
			Effect.map((manager) => ({
				getSnapshot: (outputDir: string, filePath: string) =>
					Effect.sync(() => {
						const result = manager.getSnapshot(outputDir, filePath);
						return result ? Option.some(result) : Option.none();
					}),
				upsert: (snapshot: Parameters<typeof manager.upsertSnapshot>[0]) =>
					Effect.sync(() => manager.upsertSnapshot(snapshot)),
				getAllForDirectory: (outputDir: string) => Effect.sync(() => manager.getSnapshotsForOutputDir(outputDir)),
				cleanupStale: (outputDir: string, currentFiles: ReadonlySet<string>) =>
					Effect.sync(() => manager.cleanupStaleFiles(outputDir, currentFiles as Set<string>)),
				hashContent: (content: string) => SnapshotManager.hashContent(content),
				hashFrontmatter: (frontmatter: Record<string, unknown>) => SnapshotManager.hashFrontmatter(frontmatter),
			})),
		),
	);
