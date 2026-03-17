/* v8 ignore start -- service interface + Context.Tag, no testable logic */
import type { Effect, Option } from "effect";
import { Context } from "effect";
import type { SnapshotDbError } from "../errors.js";

export interface FileSnapshot {
	readonly outputDir: string;
	readonly filePath: string;
	readonly publishedTime: string;
	readonly modifiedTime: string;
	readonly contentHash: string;
	readonly frontmatterHash: string;
	readonly buildTime: string;
}

export interface SnapshotServiceShape {
	readonly hashContent: (content: string) => string;

	readonly getSnapshot: (
		outputDir: string,
		filePath: string,
	) => Effect.Effect<Option.Option<FileSnapshot>, SnapshotDbError>;

	readonly getAllForDirectory: (outputDir: string) => Effect.Effect<ReadonlyArray<FileSnapshot>, SnapshotDbError>;

	readonly getFilePaths: (outputDir: string) => Effect.Effect<ReadonlyArray<string>, SnapshotDbError>;

	readonly upsert: (snapshot: FileSnapshot) => Effect.Effect<boolean, SnapshotDbError>;

	readonly batchUpsert: (snapshots: ReadonlyArray<FileSnapshot>) => Effect.Effect<number, SnapshotDbError>;

	readonly deleteSnapshot: (outputDir: string, filePath: string) => Effect.Effect<void, SnapshotDbError>;

	readonly cleanupStale: (
		outputDir: string,
		currentFiles: ReadonlySet<string>,
	) => Effect.Effect<ReadonlyArray<string>, SnapshotDbError>;
}

export class SnapshotService extends Context.Tag("rspress-plugin-api-extractor/SnapshotService")<
	SnapshotService,
	SnapshotServiceShape
>() {}
