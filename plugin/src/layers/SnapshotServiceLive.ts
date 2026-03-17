import { NodeContext } from "@effect/platform-node";
import { Migrator } from "@effect/sql";
import * as SqlClient from "@effect/sql/SqlClient";
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node";
import { Effect, Layer, Option } from "effect";
import { SnapshotDbError } from "../errors.js";
import migration001 from "../migrations/001_create_snapshots.js";
import type { FileSnapshot } from "../services/SnapshotService.js";
import { SnapshotService } from "../services/SnapshotService.js";

function toFileSnapshot(row: { readonly [column: string]: unknown }): FileSnapshot {
	return {
		outputDir: row.output_dir as string,
		filePath: row.file_path as string,
		publishedTime: row.published_time as string,
		modifiedTime: row.modified_time as string,
		contentHash: row.content_hash as string,
		frontmatterHash: row.frontmatter_hash as string,
		buildTime: row.build_time as string,
	};
}

function toSnapshotDbError(error: unknown): SnapshotDbError {
	return new SnapshotDbError({
		operation: "query",
		dbPath: "snapshot-db",
		reason: error instanceof Error ? error.message : String(error),
	});
}

export const SnapshotServiceLive = (dbPath: string) => {
	const SqlLive = SqliteClient.layer({ filename: dbPath });

	const MigratorLive = SqliteMigrator.layer({
		loader: Migrator.fromRecord({
			"001_create_snapshots": migration001,
		}),
	}).pipe(Layer.provide(Layer.merge(SqlLive, NodeContext.layer)));

	const ServiceImpl = Layer.scoped(
		SnapshotService,
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;

			// WAL checkpoint on scope close
			yield* Effect.addFinalizer(() => sql`PRAGMA wal_checkpoint(TRUNCATE)`.pipe(Effect.ignore));

			return {
				getSnapshot: (outputDir, filePath) =>
					sql`SELECT * FROM file_snapshots WHERE output_dir = ${outputDir} AND file_path = ${filePath}`.pipe(
						Effect.map((rows) => (rows.length > 0 ? Option.some(toFileSnapshot(rows[0])) : Option.none())),
						Effect.mapError(toSnapshotDbError),
					),

				getAllForDirectory: (outputDir) =>
					sql`SELECT * FROM file_snapshots WHERE output_dir = ${outputDir}`.pipe(
						Effect.map((rows) => rows.map(toFileSnapshot)),
						Effect.mapError(toSnapshotDbError),
					),

				getFilePaths: (outputDir) =>
					sql`SELECT file_path FROM file_snapshots WHERE output_dir = ${outputDir}`.pipe(
						Effect.map((rows) => rows.map((r) => r.file_path as string)),
						Effect.mapError(toSnapshotDbError),
					),

				upsert: (snapshot) =>
					sql`INSERT INTO file_snapshots
						(output_dir, file_path, published_time, modified_time,
						 content_hash, frontmatter_hash, build_time)
						VALUES (${snapshot.outputDir}, ${snapshot.filePath},
								${snapshot.publishedTime}, ${snapshot.modifiedTime},
								${snapshot.contentHash}, ${snapshot.frontmatterHash},
								${snapshot.buildTime})
						ON CONFLICT(output_dir, file_path) DO UPDATE SET
							published_time = ${snapshot.publishedTime},
							modified_time = ${snapshot.modifiedTime},
							content_hash = ${snapshot.contentHash},
							frontmatter_hash = ${snapshot.frontmatterHash},
							build_time = ${snapshot.buildTime}
						WHERE published_time != ${snapshot.publishedTime}
						   OR modified_time != ${snapshot.modifiedTime}
						   OR content_hash != ${snapshot.contentHash}
						   OR frontmatter_hash != ${snapshot.frontmatterHash}`.pipe(
						Effect.as(true),
						Effect.mapError(toSnapshotDbError),
					),

				batchUpsert: (snapshots) =>
					(snapshots.length === 0
						? Effect.succeed(0)
						: sql
								.withTransaction(
									Effect.forEach(
										snapshots,
										(s) =>
											sql`INSERT INTO file_snapshots
												(output_dir, file_path, published_time, modified_time,
												 content_hash, frontmatter_hash, build_time)
												VALUES (${s.outputDir}, ${s.filePath},
														${s.publishedTime}, ${s.modifiedTime},
														${s.contentHash}, ${s.frontmatterHash},
														${s.buildTime})
												ON CONFLICT(output_dir, file_path) DO UPDATE SET
													published_time = ${s.publishedTime},
													modified_time = ${s.modifiedTime},
													content_hash = ${s.contentHash},
													frontmatter_hash = ${s.frontmatterHash},
													build_time = ${s.buildTime}
												WHERE published_time != ${s.publishedTime}
												   OR modified_time != ${s.modifiedTime}
												   OR content_hash != ${s.contentHash}
												   OR frontmatter_hash != ${s.frontmatterHash}`,
										{ concurrency: 1 },
									),
								)
								.pipe(Effect.map(() => snapshots.length))
					).pipe(Effect.mapError(toSnapshotDbError)),

				deleteSnapshot: (outputDir, filePath) =>
					sql`DELETE FROM file_snapshots WHERE output_dir = ${outputDir} AND file_path = ${filePath}`.pipe(
						Effect.asVoid,
						Effect.mapError(toSnapshotDbError),
					),

				cleanupStale: (outputDir, currentFiles) =>
					Effect.gen(function* () {
						const rows = yield* sql`SELECT file_path FROM file_snapshots WHERE output_dir = ${outputDir}`;
						const staleFiles: string[] = [];
						for (const row of rows) {
							const fp = row.file_path as string;
							if (!currentFiles.has(fp)) {
								yield* sql`DELETE FROM file_snapshots WHERE output_dir = ${outputDir} AND file_path = ${fp}`;
								staleFiles.push(fp);
							}
						}
						return staleFiles;
					}).pipe(Effect.mapError(toSnapshotDbError)),
			};
		}),
	);

	return Layer.provide(ServiceImpl, Layer.merge(SqlLive, MigratorLive));
};
