import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Effect, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SnapshotServiceLive } from "../../src/layers/SnapshotServiceLive.js";
import { SnapshotService } from "../../src/services/SnapshotService.js";

describe("SnapshotServiceLive", () => {
	let tmpDir: string;
	let dbPath: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-test-"));
		dbPath = path.join(tmpDir, "test-snapshot.db");
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("upserts and retrieves a snapshot", async () => {
		const layer = SnapshotServiceLive(dbPath);
		const program = Effect.gen(function* () {
			const service = yield* SnapshotService;

			yield* service.upsert({
				outputDir: "docs/api",
				filePath: "class/MyClass.mdx",
				publishedTime: "2026-01-01T00:00:00Z",
				modifiedTime: "2026-01-01T00:00:00Z",
				contentHash: "abc",
				frontmatterHash: "def",
				buildTime: "2026-01-01T00:00:00Z",
			});

			const result = yield* service.getSnapshot("docs/api", "class/MyClass.mdx");
			expect(Option.isSome(result)).toBe(true);
			if (Option.isSome(result)) {
				expect(result.value.contentHash).toBe("abc");
			}
		});

		await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(layer))));
	});

	it("returns None for missing snapshots", async () => {
		const layer = SnapshotServiceLive(dbPath);
		const program = Effect.gen(function* () {
			const service = yield* SnapshotService;
			const result = yield* service.getSnapshot("docs/api", "nonexistent.mdx");
			expect(Option.isNone(result)).toBe(true);
		});

		await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(layer))));
	});

	it("cleans up DB on scope close (no WAL files left)", async () => {
		const layer = SnapshotServiceLive(dbPath);
		const program = Effect.gen(function* () {
			const service = yield* SnapshotService;
			yield* service.upsert({
				outputDir: "docs",
				filePath: "test.mdx",
				publishedTime: "2026-01-01T00:00:00Z",
				modifiedTime: "2026-01-01T00:00:00Z",
				contentHash: "abc",
				frontmatterHash: "def",
				buildTime: "2026-01-01T00:00:00Z",
			});
		});

		await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(layer))));

		// After scope closes, WAL files should be cleaned up
		expect(fs.existsSync(dbPath)).toBe(true); // DB file exists
		expect(fs.existsSync(`${dbPath}-wal`)).toBe(false); // WAL cleaned up
		expect(fs.existsSync(`${dbPath}-shm`)).toBe(false); // SHM cleaned up
	});
});
