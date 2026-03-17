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
	readonly getSnapshot: (
		outputDir: string,
		filePath: string,
	) => Effect.Effect<Option.Option<FileSnapshot>, SnapshotDbError>;

	readonly upsert: (snapshot: FileSnapshot) => Effect.Effect<boolean, SnapshotDbError>;

	readonly getAllForDirectory: (outputDir: string) => Effect.Effect<ReadonlyArray<FileSnapshot>, SnapshotDbError>;

	readonly cleanupStale: (
		outputDir: string,
		currentFiles: ReadonlySet<string>,
	) => Effect.Effect<ReadonlyArray<string>, SnapshotDbError>;

	readonly hashContent: (content: string) => string;

	readonly hashFrontmatter: (frontmatter: Record<string, unknown>) => string;
}

export class SnapshotService extends Context.Tag("rspress-plugin-api-extractor/SnapshotService")<
	SnapshotService,
	SnapshotServiceShape
>() {}
