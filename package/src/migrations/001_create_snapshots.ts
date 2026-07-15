import * as SqlClient from "@effect/sql/SqlClient";
import { Effect } from "effect";

const migration = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	yield* sql`
		CREATE TABLE IF NOT EXISTS file_snapshots (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			output_dir TEXT NOT NULL,
			file_path TEXT NOT NULL,
			published_time TEXT NOT NULL,
			modified_time TEXT NOT NULL,
			content_hash TEXT NOT NULL,
			frontmatter_hash TEXT NOT NULL,
			build_time TEXT NOT NULL,
			UNIQUE(output_dir, file_path)
		)
	`;
	yield* sql`CREATE INDEX IF NOT EXISTS idx_output_dir ON file_snapshots(output_dir)`;
	yield* sql`CREATE INDEX IF NOT EXISTS idx_file_path ON file_snapshots(file_path)`;
});

export default migration;
