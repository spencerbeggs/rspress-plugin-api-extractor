# SnapshotService @effect/sql Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development
> (if subagents available) or superpowers:executing-plans to implement this plan.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `SnapshotManager` class with a native `@effect/sql`
implementation, making `SnapshotService` a proper Layer-stack service accessed
via `yield* SnapshotService`.

**Architecture:** `SnapshotServiceLive` uses `@effect/sql-sqlite-node`
`SqliteClient` for queries and `SqliteMigrator` for schema management. Hash
functions move to standalone `content-hash.ts`. The service joins the Layer
stack — no more passing `snapshotManager` through parameters. `ConfigServiceLive`
drops its `acquireRelease` for the DB.

**Tech Stack:** @effect/sql, @effect/sql-sqlite-node, Effect (Layer, Schema),
Vitest, Biome

**Spec:** `docs/superpowers/specs/2026-03-17-snapshot-sql-migration-design.md`

**Note on intermediate commits:** Tasks 2-5 produce intermediate states where
typecheck fails (the old `SnapshotManager` consumers aren't updated until
Task 4-5, but the interface changes in Task 2). This is expected on the
`feat/effect-rewrite` branch — history is squashed on merge to `main`.
Commits at each task boundary are for progress tracking, not for push.

---

## File Structure

### New files

| File | Responsibility |
| ---- | -------------- |
| `plugin/src/content-hash.ts` | `hashContent()`, `hashFrontmatter()`, `normalizeContent()` — pure functions |
| `plugin/src/migrations/001_create_snapshots.ts` | Initial SQLite migration |
| `plugin/__test__/snapshot-service.test.ts` | Tests for `@effect/sql` implementation |
| `plugin/__test__/content-hash.test.ts` | Tests for hash functions |

### Modified files

| File | Change |
| ---- | ------ |
| `plugin/src/services/SnapshotService.ts` | Redesigned interface: add `batchUpsert`, `deleteSnapshot`, `getFilePaths`; remove `hashContent`, `hashFrontmatter` |
| `plugin/src/layers/SnapshotServiceLive.ts` | Full rewrite: `@effect/sql` queries, `SqliteMigrator`, WAL checkpoint finalizer |
| `plugin/src/build-stages.ts` | Replace `snapshotManager` parameter access with `yield* SnapshotService`; replace `SnapshotManager.hashContent` with `hashContent` import |
| `plugin/src/build-program.ts` | Replace `snapshotManager` access with `yield* SnapshotService` |
| `plugin/src/services/ConfigService.ts` | Remove `snapshotManager` from `ResolvedBuildContext` |
| `plugin/src/layers/ConfigServiceLive.ts` | Remove `acquireRelease` for SnapshotManager, remove `SnapshotManager` import |
| `plugin/src/plugin.ts` | Add `SnapshotServiceLive(dbPath)` to Layer stack |
| `plugin/__test__/utils/layers.ts` | Update mock: add `batchUpsert`, `deleteSnapshot`, `getFilePaths`; remove `hashContent`, `hashFrontmatter` |

### Deleted files

| File | Reason |
| ---- | ------ |
| `plugin/src/snapshot-manager.ts` | Replaced by `SnapshotServiceLive` |
| `plugin/src/snapshot-manager.test.ts` | Replaced by `snapshot-service.test.ts` + `content-hash.test.ts` |

---

## Chunk 1: Extract Hash Functions

### Task 1: Create `content-hash.ts` and migrate hash tests

**Files:**

- Create: `plugin/src/content-hash.ts`
- Create: `plugin/__test__/content-hash.test.ts`

- [ ] **Step 1: Create `content-hash.ts`**

Move `hashContent`, `hashFrontmatter`, and `normalizeContent` from
`plugin/src/snapshot-manager.ts` (lines 589-677) into a new file:

```typescript
import { createHash } from "node:crypto";

export function normalizeContent(content: string): string {
  return content
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .trim()
    .replaceAll(/\n{3,}/g, "\n\n");
}

export function hashContent(content: string): string {
  const normalized = normalizeContent(content);
  return createHash("sha256").update(normalized).digest("hex");
}

export function hashFrontmatter(frontmatter: Record<string, unknown>): string {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (
      key === "publishedTime" || key === "modifiedTime" ||
      key === "head" || key === "article:published_time" ||
      key === "article:modified_time"
    ) continue;
    filtered[key] = value;
  }
  const sorted = Object.keys(filtered).sort().reduce((acc, key) => {
    acc[key] = filtered[key];
    return acc;
  }, {} as Record<string, unknown>);
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}
```

- [ ] **Step 2: Create `content-hash.test.ts`**

Extract the hash tests from `plugin/src/snapshot-manager.test.ts` (the
`hashContent` and `hashFrontmatter` describe blocks). Update imports to
use `content-hash.js` instead of `snapshot-manager.js`.

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run plugin/__test__/content-hash.test.ts`

Expected: All hash tests pass.

- [ ] **Step 4: Lint, typecheck, commit**

```bash
git add src/content-hash.ts ../__test__/content-hash.test.ts
git commit -m "feat: extract hash functions to content-hash.ts"
```

---

## Chunk 2: Redesign SnapshotService Interface

### Task 2: Update SnapshotService interface and mock layer

**Files:**

- Modify: `plugin/src/services/SnapshotService.ts`
- Modify: `plugin/__test__/utils/layers.ts`

- [ ] **Step 1: Rewrite SnapshotService interface**

Replace `plugin/src/services/SnapshotService.ts`:

```typescript
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

  readonly getAllForDirectory: (
    outputDir: string,
  ) => Effect.Effect<ReadonlyArray<FileSnapshot>, SnapshotDbError>;

  readonly getFilePaths: (
    outputDir: string,
  ) => Effect.Effect<ReadonlyArray<string>, SnapshotDbError>;

  readonly upsert: (
    snapshot: FileSnapshot,
  ) => Effect.Effect<boolean, SnapshotDbError>;

  readonly batchUpsert: (
    snapshots: ReadonlyArray<FileSnapshot>,
  ) => Effect.Effect<number, SnapshotDbError>;

  readonly deleteSnapshot: (
    outputDir: string,
    filePath: string,
  ) => Effect.Effect<void, SnapshotDbError>;

  readonly cleanupStale: (
    outputDir: string,
    currentFiles: ReadonlySet<string>,
  ) => Effect.Effect<ReadonlyArray<string>, SnapshotDbError>;
}

export class SnapshotService extends Context.Tag(
  "rspress-plugin-api-extractor/SnapshotService",
)<SnapshotService, SnapshotServiceShape>() {}
```

- [ ] **Step 2: Update mock layer**

Update `plugin/__test__/utils/layers.ts` — add `batchUpsert`,
`deleteSnapshot`, `getFilePaths`; remove `hashContent`, `hashFrontmatter`:

```typescript
export const MockSnapshotServiceLayer = Layer.effect(
  SnapshotService,
  Effect.gen(function* () {
    const store = yield* Ref.make(new Map<string, FileSnapshot>());
    return {
      getSnapshot: (outputDir: string, filePath: string) =>
        Ref.get(store).pipe(
          Effect.map((m) => Option.fromNullable(m.get(`${outputDir}::${filePath}`))),
        ),
      upsert: (snapshot: FileSnapshot) =>
        Ref.update(store, (m) => {
          const next = new Map(m);
          next.set(`${snapshot.outputDir}::${snapshot.filePath}`, snapshot);
          return next;
        }).pipe(Effect.as(true)),
      batchUpsert: (snapshots: ReadonlyArray<FileSnapshot>) =>
        Effect.forEach(snapshots, (s) =>
          Ref.update(store, (m) => {
            const next = new Map(m);
            next.set(`${s.outputDir}::${s.filePath}`, s);
            return next;
          }),
        ).pipe(Effect.as(snapshots.length)),
      getAllForDirectory: (outputDir: string) =>
        Ref.get(store).pipe(
          Effect.map((m) => [...m.values()].filter((s) => s.outputDir === outputDir)),
        ),
      getFilePaths: (outputDir: string) =>
        Ref.get(store).pipe(
          Effect.map((m) =>
            [...m.values()]
              .filter((s) => s.outputDir === outputDir)
              .map((s) => s.filePath),
          ),
        ),
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
```

Remove the `createHash` import (no longer needed in mock).

- [ ] **Step 3: Lint, typecheck, commit**

Note: typecheck will show errors in `SnapshotServiceLive.ts` and
`build-stages.ts` since they still use the old interface. That's expected.

```bash
git add src/services/SnapshotService.ts ../__test__/utils/layers.ts
git commit -m "feat: redesign SnapshotService interface, update mock layer"
```

---

## Chunk 3: Implement SnapshotServiceLive with @effect/sql

### Task 3: Create migration and rewrite SnapshotServiceLive

**Files:**

- Create: `plugin/src/migrations/001_create_snapshots.ts`
- Rewrite: `plugin/src/layers/SnapshotServiceLive.ts`
- Create: `plugin/__test__/snapshot-service.test.ts`

- [ ] **Step 1: Create migration file**

Create `plugin/src/migrations/001_create_snapshots.ts`:

```typescript
import * as SqlClient from "@effect/sql/SqlClient";
import { Effect } from "effect";

export default Effect.gen(function* () {
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
```

- [ ] **Step 2: Rewrite SnapshotServiceLive**

Rewrite `plugin/src/layers/SnapshotServiceLive.ts` with `@effect/sql`:

```typescript
import { NodeContext } from "@effect/platform-node";
import * as SqlClient from "@effect/sql/SqlClient";
import { Migrator } from "@effect/sql";
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node";
import { Effect, Layer, Option } from "effect";
import { SnapshotDbError } from "../errors.js";
import type { FileSnapshot } from "../services/SnapshotService.js";
import { SnapshotService } from "../services/SnapshotService.js";
import createSnapshotsTable from "../migrations/001_create_snapshots.js";

function toFileSnapshot(row: any): FileSnapshot {
  return {
    outputDir: row.output_dir,
    filePath: row.file_path,
    publishedTime: row.published_time,
    modifiedTime: row.modified_time,
    contentHash: row.content_hash,
    frontmatterHash: row.frontmatter_hash,
    buildTime: row.build_time,
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

  const MigratorLive = Layer.provide(
    SqliteMigrator.layer({
      loader: Migrator.fromRecord({
        "001_create_snapshots": createSnapshotsTable,
      }),
    }),
    Layer.merge(SqlLive, NodeContext.layer),
  );

  const ServiceImpl = Layer.scoped(
    SnapshotService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      // WAL checkpoint finalizer (runs before SqliteClient closes)
      yield* Effect.addFinalizer(() =>
        sql`PRAGMA wal_checkpoint(TRUNCATE)`.pipe(Effect.ignore),
      );

      return {
        getSnapshot: (outputDir, filePath) =>
          sql`SELECT * FROM file_snapshots
              WHERE output_dir = ${outputDir} AND file_path = ${filePath}`.pipe(
            Effect.map((rows) =>
              rows.length > 0 ? Option.some(toFileSnapshot(rows[0])) : Option.none(),
            ),
            Effect.mapError(toSnapshotDbError),
          ),

        getAllForDirectory: (outputDir) =>
          sql`SELECT * FROM file_snapshots
              WHERE output_dir = ${outputDir}`.pipe(
            Effect.map((rows) => rows.map(toFileSnapshot)),
            Effect.mapError(toSnapshotDbError),
          ),

        getFilePaths: (outputDir) =>
          sql`SELECT file_path FROM file_snapshots
              WHERE output_dir = ${outputDir}`.pipe(
            Effect.map((rows) => rows.map((r: any) => r.file_path as string)),
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
            // Note: always returns true. The ON CONFLICT WHERE clause prevents
            // unnecessary DB writes, but detecting whether a row was actually
            // modified would require checking sqlite3_changes() which @effect/sql
            // doesn't expose. No caller inspects the return value currently.
            Effect.as(true),
            Effect.mapError(toSnapshotDbError),
          ),

        batchUpsert: (snapshots) =>
          (snapshots.length === 0
            ? Effect.succeed(0)
            : sql.withTransaction(
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
              ).pipe(Effect.map(() => snapshots.length))
          ).pipe(Effect.mapError(toSnapshotDbError)),

        deleteSnapshot: (outputDir, filePath) =>
          sql`DELETE FROM file_snapshots
              WHERE output_dir = ${outputDir} AND file_path = ${filePath}`.pipe(
            Effect.asVoid,
            Effect.mapError(toSnapshotDbError),
          ),

        cleanupStale: (outputDir, currentFiles) =>
          Effect.gen(function* () {
            const rows = yield* sql`SELECT file_path FROM file_snapshots
                                    WHERE output_dir = ${outputDir}`;
            const staleFiles: string[] = [];
            for (const row of rows) {
              const fp = (row as any).file_path as string;
              if (!currentFiles.has(fp)) {
                yield* sql`DELETE FROM file_snapshots
                           WHERE output_dir = ${outputDir} AND file_path = ${fp}`;
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
```

- [ ] **Step 3: Write tests**

Create `plugin/__test__/snapshot-service.test.ts`:

```typescript
import { NodeContext } from "@effect/platform-node";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect, Layer, Option } from "effect";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SnapshotServiceLive } from "../src/layers/SnapshotServiceLive.js";
import type { FileSnapshot } from "../src/services/SnapshotService.js";
import { SnapshotService } from "../src/services/SnapshotService.js";

describe("SnapshotServiceLive", () => {
  const makeTestLayer = (dbPath: string) => SnapshotServiceLive(dbPath);

  it("upsert inserts new snapshot, getSnapshot retrieves it", async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "snap-"));
    const dbPath = path.join(tmpDir, "test.db");

    const program = Effect.gen(function* () {
      const svc = yield* SnapshotService;
      const snapshot: FileSnapshot = {
        outputDir: "/docs/api",
        filePath: "class/foo.mdx",
        publishedTime: "2025-01-01T00:00:00.000Z",
        modifiedTime: "2025-01-01T00:00:00.000Z",
        contentHash: "abc123",
        frontmatterHash: "def456",
        buildTime: "2025-01-01T00:00:00.000Z",
      };

      yield* svc.upsert(snapshot);
      const result = yield* svc.getSnapshot("/docs/api", "class/foo.mdx");
      return result;
    }).pipe(Effect.scoped);

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(makeTestLayer(dbPath))),
    );

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.contentHash).toBe("abc123");
    }

    await fs.promises.rm(tmpDir, { recursive: true });
  });

  it("getSnapshot returns None for missing", async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "snap-"));
    const dbPath = path.join(tmpDir, "test.db");

    const program = Effect.gen(function* () {
      const svc = yield* SnapshotService;
      return yield* svc.getSnapshot("/docs/api", "nonexistent.mdx");
    }).pipe(Effect.scoped);

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(makeTestLayer(dbPath))),
    );

    expect(Option.isNone(result)).toBe(true);
    await fs.promises.rm(tmpDir, { recursive: true });
  });

  it("batchUpsert inserts multiple in transaction", async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "snap-"));
    const dbPath = path.join(tmpDir, "test.db");

    const program = Effect.gen(function* () {
      const svc = yield* SnapshotService;
      const buildTime = "2025-01-01T00:00:00.000Z";
      const snapshots: FileSnapshot[] = [
        { outputDir: "/docs", filePath: "a.mdx", publishedTime: buildTime, modifiedTime: buildTime, contentHash: "h1", frontmatterHash: "f1", buildTime },
        { outputDir: "/docs", filePath: "b.mdx", publishedTime: buildTime, modifiedTime: buildTime, contentHash: "h2", frontmatterHash: "f2", buildTime },
      ];
      const count = yield* svc.batchUpsert(snapshots);
      const all = yield* svc.getAllForDirectory("/docs");
      return { count, all };
    }).pipe(Effect.scoped);

    const { count, all } = await Effect.runPromise(
      program.pipe(Effect.provide(makeTestLayer(dbPath))),
    );

    expect(count).toBe(2);
    expect(all).toHaveLength(2);
    await fs.promises.rm(tmpDir, { recursive: true });
  });

  it("cleanupStale removes files not in currentFiles set", async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "snap-"));
    const dbPath = path.join(tmpDir, "test.db");

    const program = Effect.gen(function* () {
      const svc = yield* SnapshotService;
      const buildTime = "2025-01-01T00:00:00.000Z";
      yield* svc.upsert({ outputDir: "/docs", filePath: "keep.mdx", publishedTime: buildTime, modifiedTime: buildTime, contentHash: "h1", frontmatterHash: "f1", buildTime });
      yield* svc.upsert({ outputDir: "/docs", filePath: "stale.mdx", publishedTime: buildTime, modifiedTime: buildTime, contentHash: "h2", frontmatterHash: "f2", buildTime });

      const stale = yield* svc.cleanupStale("/docs", new Set(["keep.mdx"]));
      const remaining = yield* svc.getAllForDirectory("/docs");
      return { stale, remaining };
    }).pipe(Effect.scoped);

    const { stale, remaining } = await Effect.runPromise(
      program.pipe(Effect.provide(makeTestLayer(dbPath))),
    );

    expect(stale).toEqual(["stale.mdx"]);
    expect(remaining).toHaveLength(1);
    await fs.promises.rm(tmpDir, { recursive: true });
  });

  it("deleteSnapshot removes specific entry", async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "snap-"));
    const dbPath = path.join(tmpDir, "test.db");

    const program = Effect.gen(function* () {
      const svc = yield* SnapshotService;
      const buildTime = "2025-01-01T00:00:00.000Z";
      yield* svc.upsert({ outputDir: "/docs", filePath: "target.mdx", publishedTime: buildTime, modifiedTime: buildTime, contentHash: "h", frontmatterHash: "f", buildTime });

      yield* svc.deleteSnapshot("/docs", "target.mdx");
      return yield* svc.getSnapshot("/docs", "target.mdx");
    }).pipe(Effect.scoped);

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(makeTestLayer(dbPath))),
    );

    expect(Option.isNone(result)).toBe(true);
    await fs.promises.rm(tmpDir, { recursive: true });
  });

  it("getFilePaths returns all file paths for directory", async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "snap-"));
    const dbPath = path.join(tmpDir, "test.db");

    const program = Effect.gen(function* () {
      const svc = yield* SnapshotService;
      const buildTime = "2025-01-01T00:00:00.000Z";
      yield* svc.batchUpsert([
        { outputDir: "/docs", filePath: "a.mdx", publishedTime: buildTime, modifiedTime: buildTime, contentHash: "h1", frontmatterHash: "f1", buildTime },
        { outputDir: "/docs", filePath: "b.mdx", publishedTime: buildTime, modifiedTime: buildTime, contentHash: "h2", frontmatterHash: "f2", buildTime },
      ]);
      return yield* svc.getFilePaths("/docs");
    }).pipe(Effect.scoped);

    const paths = await Effect.runPromise(
      program.pipe(Effect.provide(makeTestLayer(dbPath))),
    );

    expect(paths).toHaveLength(2);
    expect(paths).toContain("a.mdx");
    expect(paths).toContain("b.mdx");
    await fs.promises.rm(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run plugin/__test__/snapshot-service.test.ts`

Expected: All 6 tests pass.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
git add src/migrations/ src/layers/SnapshotServiceLive.ts ../__test__/snapshot-service.test.ts
git commit -m "feat: implement SnapshotServiceLive with @effect/sql-sqlite-node"
```

---

## Chunk 4: Wire SnapshotService Into Pipeline

### Task 4: Update build-stages.ts to use SnapshotService

**Files:**

- Modify: `plugin/src/build-stages.ts`
- Modify: `plugin/__test__/build-stages.test.ts`

Replace all `snapshotManager` parameter access with `yield* SnapshotService`.
Replace all `SnapshotManager.hashContent/hashFrontmatter` with imports from
`content-hash.ts`.

- [ ] **Step 1: Update imports**

In `plugin/src/build-stages.ts`:

```typescript
// REMOVE
import { SnapshotManager } from "./snapshot-manager.js";

// ADD
import { hashContent, hashFrontmatter } from "./content-hash.js";
import { SnapshotService } from "./services/SnapshotService.js";
```

- [ ] **Step 2: Update `writeMetadata`**

The `WriteMetadataInput` interface has `snapshotManager` and
`existingSnapshots` fields. Change:

- Remove `snapshotManager` from `WriteMetadataInput`
- Add `SnapshotService` to the Effect's `R` channel
- Replace `snapshotManager.upsertSnapshot(...)` →
  `yield* snapshots.upsert({...})`
- Replace `Effect.sync(() => snapshotManager.batchUpsertSnapshots(...))`
  → `yield* snapshots.batchUpsert([...])`
- Replace `SnapshotManager.hashContent(...)` → `hashContent(...)`

The function signature becomes:

```typescript
export function writeMetadata(
  input: WriteMetadataInput,
): Effect.Effect<void, never, FileSystem.FileSystem | SnapshotService>
```

- [ ] **Step 3: Update `cleanupAndCommit`**

Remove `snapshotManager` from `CleanupAndCommitInput`. Add
`SnapshotService` to `R`. Replace all `Effect.sync(()=>snapshotManager.*)`:

```typescript
// BEFORE
yield* Effect.sync(() => snapshotManager.batchUpsertSnapshots(snapshotsToUpdate));
yield* Effect.sync(() => snapshotManager.cleanupStaleFiles(dir, files));
yield* Effect.sync(() => snapshotManager.deleteSnapshot(dir, path));

// AFTER
const snapshots = yield* SnapshotService;
yield* snapshots.batchUpsert(snapshotsToUpdate);
const staleFiles = yield* snapshots.cleanupStale(dir, files);
yield* snapshots.deleteSnapshot(dir, path);
```

- [ ] **Step 4: Update `generateSinglePage` and hash references**

Replace ALL `SnapshotManager.hashContent(...)` → `hashContent(...)` and
`SnapshotManager.hashFrontmatter(...)` → `hashFrontmatter(...)` throughout
`build-stages.ts`. This includes occurrences in:

- `generateSinglePage` (lines 458-459, 483-484)
- `writeMetadata` root `_meta.json` section (line 741)
- `writeMetadata` category `_meta.json` section (line 869)

Also update all inline `import("./snapshot-manager.js").FileSnapshot` type
references to use `import("./services/SnapshotService.js").FileSnapshot`
or a top-level import. These appear in:

- `GenerateSinglePageContext.existingSnapshots` (line 237)
- `WriteMetadataInput.existingSnapshots` (line 671)
- `CleanupAndCommitInput` filter type (line 944)
- `BuildPipelineInput.existingSnapshots` (line 1063)

The `existingSnapshots` Map pattern stays — it's a pre-loaded read-only
lookup, not a DB call.

- [ ] **Step 5: Update tests**

Tests that call `writeMetadata` or `cleanupAndCommit` need to provide
`SnapshotService` (either via `SnapshotServiceLive` with temp DB or
`MockSnapshotServiceLayer`). Update provide chains.

- [ ] **Step 6: Run all tests, lint, typecheck**

Run: `pnpm run test`

- [ ] **Step 7: Commit**

```bash
git add src/build-stages.ts ../__test__/build-stages.test.ts
git commit -m "refactor: replace snapshotManager with SnapshotService in build-stages"
```

---

### Task 5: Update build-program.ts and ConfigService

**Files:**

- Modify: `plugin/src/build-program.ts`
- Modify: `plugin/src/services/ConfigService.ts`
- Modify: `plugin/src/layers/ConfigServiceLive.ts`

- [ ] **Step 1: Update build-program.ts**

Replace `snapshotManager` access with `yield* SnapshotService`:

```typescript
// BEFORE
const existingSnapshots = yield* Effect.sync(() => {
  const map = new Map();
  for (const s of snapshotManager.getSnapshotsForOutputDir(dir)) {
    map.set(s.filePath, s);
  }
  return map;
});

// AFTER
const snapshotSvc = yield* SnapshotService;
const allSnapshots = yield* snapshotSvc.getAllForDirectory(resolvedOutputDir);
const existingSnapshots = new Map(allSnapshots.map(s => [s.filePath, s]));
```

Remove `snapshotManager` destructuring from `buildContext`. Add
`SnapshotService` to the function's `R` channel:

```typescript
export function generateApiDocs(
  apiConfig: ...,
  buildContext: ResolvedBuildContext,
  fileContextMap: ...,
): Effect.Effect<CrossLinkData, never, FileSystem.FileSystem | SnapshotService>
```

- [ ] **Step 2: Remove `snapshotManager` from `ResolvedBuildContext`**

In `plugin/src/services/ConfigService.ts`, remove the field:

```typescript
// REMOVE
readonly snapshotManager: SnapshotManager;
```

Remove the `SnapshotManager` import.

- [ ] **Step 3: Remove `acquireRelease` from ConfigServiceLive**

In `plugin/src/layers/ConfigServiceLive.ts`, remove:

- The `acquireRelease` block for `SnapshotManager`
- The `import { SnapshotManager } from "../snapshot-manager.js"` line
- The `snapshotManager` field from the returned context

- [ ] **Step 4: Run tests, lint, typecheck, commit**

```bash
git add src/build-program.ts src/services/ConfigService.ts src/layers/ConfigServiceLive.ts
git commit -m "refactor: wire SnapshotService into build-program, remove from ConfigService"
```

---

### Task 6: Add SnapshotServiceLive to Layer stack

**Files:**

- Modify: `plugin/src/plugin.ts`

- [ ] **Step 1: Add SnapshotServiceLive to BaseLayer**

```typescript
import { SnapshotServiceLive } from "./layers/SnapshotServiceLive.js";

const dbPath = path.resolve(process.cwd(), "api-docs-snapshot.db");
const BaseLayer = Layer.mergeAll(
  PathDerivationServiceLive,
  PluginLoggerLayer(effectLogLevel),
  TypeRegistryServiceLive,
  NodeFileSystem.layer,
  SnapshotServiceLive(dbPath),  // NEW
);
```

- [ ] **Step 2: Run all tests, lint, typecheck**

Run: `pnpm run test`

- [ ] **Step 3: Commit**

```bash
git add src/plugin.ts
git commit -m "feat: add SnapshotServiceLive to Effect Layer stack"
```

---

## Chunk 5: Delete Old Files

### Task 7: Delete snapshot-manager.ts and old tests

**Files:**

- Delete: `plugin/src/snapshot-manager.ts`
- Delete: `plugin/src/snapshot-manager.test.ts`
- Modify: `plugin/package.json` (remove `better-sqlite3` direct dependency)

- [ ] **Step 1: Verify no remaining imports**

```bash
grep -rn "snapshot-manager" src/ --include="*.ts" | grep -v ".test."
```

Expected: No matches (all consumers now use `SnapshotService` or
`content-hash`).

- [ ] **Step 2: Delete files**

```bash
git rm src/snapshot-manager.ts src/snapshot-manager.test.ts
```

- [ ] **Step 3: Remove `better-sqlite3` direct dependency**

`better-sqlite3` is still needed transitively (via
`@effect/sql-sqlite-node`). Remove the direct dependency:

```bash
pnpm remove better-sqlite3 @types/better-sqlite3
```

Verify it's still available transitively:

```bash
ls node_modules/better-sqlite3/package.json
```

- [ ] **Step 4: Run all tests, lint, typecheck**

Run: `pnpm run test`

- [ ] **Step 5: Build**

Run: `pnpm run build`

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -u . package.json ../pnpm-lock.yaml
git commit -m "refactor: delete snapshot-manager.ts, remove better-sqlite3 direct dep"
```

---

## Chunk 6: Verification

### Task 8: Full regression verification

- [ ] **Step 1: Run all tests**

Run: `pnpm run test`

- [ ] **Step 2: Typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

- [ ] **Step 3: Lint**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint`

- [ ] **Step 4: Build**

Run: `pnpm run build`

- [ ] **Step 5: Verify snapshot-manager.ts is deleted**

```bash
ls src/snapshot-manager.ts 2>/dev/null && echo "FAIL" || echo "OK"
```

- [ ] **Step 6: Verify no SnapshotManager imports remain**

```bash
grep -rn "SnapshotManager\|snapshot-manager" src/ --include="*.ts" && echo "FAIL" || echo "OK"
```

- [ ] **Step 7: Verify SnapshotService is in the Layer stack**

```bash
grep "SnapshotServiceLive" src/plugin.ts
```

- [ ] **Step 8: Verify content-hash.ts exists**

```bash
ls src/content-hash.ts && echo "OK"
```

- [ ] **Step 9: Verify @effect/sql queries in SnapshotServiceLive**

```bash
grep "sql\`" src/layers/SnapshotServiceLive.ts | head -5
```

Expected: Tagged template SQL queries present.
