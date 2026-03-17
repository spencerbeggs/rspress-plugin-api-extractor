# SnapshotService @effect/sql Migration Design

## Overview

Replace the `SnapshotManager` class (746 lines, direct `better-sqlite3`) with
a native `@effect/sql` implementation. `SnapshotService` becomes a proper
service in the Effect Layer stack accessed via `yield* SnapshotService`. Hash
functions move to `content-hash.ts`. `SqliteClient` lifecycle is managed by
the Layer. Schema-based row decoding provides typed query results.

### Goals

- Replace `SnapshotManager` class with `@effect/sql-sqlite-node` queries
- Make `SnapshotService` a proper Layer-stack service (not a parameter)
- Remove `snapshotManager` from `ResolvedBuildContext`
- Use `@effect/sql` Migrator for schema management
- Move hash functions to standalone `content-hash.ts`
- Delete `snapshot-manager.ts`

### Non-Goals

- Changing the DB schema (same table, same columns)
- Adding new query capabilities
- Changing the `FileSnapshot` type
- Migrating `SnapshotManager.parseFile` (it's a static utility used only
  in tests — can be removed or moved to test utils)

### Constraints

- `@effect/sql-sqlite-node` uses `better-sqlite3` internally — same native
  module, just Effect-managed
- `SqliteClient.layer` requires `Scope` — provided by `ManagedRuntime`
- Migrator uses `Migrator.fromRecord` (inline migrations, no filesystem)
- WAL mode enabled by default in `SqliteClient` (`disableWAL: false`)

## Decisions Record

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Migration system | `@effect/sql` Migrator with `fromRecord` | Future schema evolution without filesystem dependency |
| Hash functions | Standalone `content-hash.ts` | Pure functions unrelated to DB operations |
| Service access | Layer stack (`yield* SnapshotService`) | Idiomatic Effect pattern, same as FileSystem |
| DB lifecycle | `SqliteClient.layer` in Layer stack | Automatic open/close, no manual `acquireRelease` |
| Row decoding | `Schema`-based via `@effect/sql` | Typed query results, no `as` casts |
| WAL checkpoint on close | Custom `Scope.addFinalizer` before `SqliteClient` close | `SqliteClient` does NOT checkpoint on close — only calls `db.close()`. We add a finalizer that runs `pragma wal_checkpoint(TRUNCATE)` to clean up `.db-wal` and `.db-shm` files. |
| Signal handlers | Removed — `ManagedRuntime.dispose()` handles cleanup | The current `SnapshotManager` registers SIGINT/SIGTERM/uncaughtException handlers. These are removed since Effect's `Scope` finalization in `ManagedRuntime` handles graceful cleanup. |
| Upsert semantics | Preserve check-before-write | Use `INSERT ... ON CONFLICT DO UPDATE SET ... WHERE` with a change-detection condition to avoid unnecessary writes when data is identical. Preserves DB file stability (no git diffs when nothing changed). |

## SnapshotService Interface

### FileSnapshot Type

The `FileSnapshot` interface stays the same (already defined in
`services/SnapshotService.ts`):

```typescript
export interface FileSnapshot {
  readonly outputDir: string;
  readonly filePath: string;
  readonly publishedTime: string;
  readonly modifiedTime: string;
  readonly contentHash: string;
  readonly frontmatterHash: string;
  readonly buildTime: string;
}
```

### FileSnapshotRow Schema

Schema for decoding SQLite rows to `FileSnapshot`:

```typescript
import { Schema } from "effect";

export class FileSnapshotRow extends Schema.Class<FileSnapshotRow>("FileSnapshotRow")({
  output_dir: Schema.String,
  file_path: Schema.String,
  published_time: Schema.String,
  modified_time: Schema.String,
  content_hash: Schema.String,
  frontmatter_hash: Schema.String,
  build_time: Schema.String,
}) {}
```

A mapping function converts `FileSnapshotRow` → `FileSnapshot` (snake_case
to camelCase).

### Service Shape

```typescript
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
```

Changes from current interface:

- Added `getFilePaths` (used by `cleanupStale` internally, also exposed)
- Added `batchUpsert` (used by `writeMetadata` and `cleanupAndCommit`)
- Added `deleteSnapshot` (used by `cleanupAndCommit` for orphan removal)
- Removed `hashContent` and `hashFrontmatter` (moved to `content-hash.ts`)

## SnapshotServiceLive Implementation

### Layer Construction

```typescript
import { SqliteClient } from "@effect/sql-sqlite-node";
import { SqliteMigrator } from "@effect/sql-sqlite-node";
import * as SqlClient from "@effect/sql/SqlClient";
import { Migrator } from "@effect/sql";

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

  // WAL checkpoint finalizer — SqliteClient only calls db.close() on
  // disposal, it does NOT checkpoint. We add a finalizer that runs
  // PRAGMA wal_checkpoint(TRUNCATE) to clean up .db-wal and .db-shm files.
  const ServiceImpl = Layer.scoped(
    SnapshotService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      // Register WAL checkpoint finalizer (runs before SqliteClient closes)
      yield* Effect.addFinalizer(() =>
        sql`PRAGMA wal_checkpoint(TRUNCATE)`.pipe(Effect.ignore),
      );

      // ... return service implementation using sql`...`
    }),
  );

  return Layer.provide(ServiceImpl, Layer.merge(SqlLive, MigratorLive));
};
```

The `SqliteMigrator.layer` runs migrations on startup. It requires
`FileSystem`, `Path`, and `CommandExecutor` from `@effect/platform` in
its type signature (even though `Migrator.fromRecord` doesn't use the
filesystem). These are satisfied by providing `NodeContext.layer` from
`@effect/platform-node`:

```typescript
import { NodeContext } from "@effect/platform-node";

const MigratorLive = Layer.provide(
  SqliteMigrator.layer({
    loader: Migrator.fromRecord({
      "001_create_snapshots": createSnapshotsTable,
    }),
  }),
  Layer.merge(SqlLive, NodeContext.layer),
);
```

`NodeContext.layer` provides `FileSystem`, `Path`, `CommandExecutor`,
and `Terminal` — all `@effect/platform` Node.js implementations.

### Query Implementations

```typescript
getSnapshot: (outputDir, filePath) =>
  sql`SELECT * FROM file_snapshots
      WHERE output_dir = ${outputDir} AND file_path = ${filePath}`
    .pipe(
      Effect.map(rows => rows.length > 0
        ? Option.some(toFileSnapshot(rows[0]))
        : Option.none()
      ),
      Effect.mapError(toSnapshotDbError),
    ),

getAllForDirectory: (outputDir) =>
  sql`SELECT * FROM file_snapshots WHERE output_dir = ${outputDir}`
    .pipe(
      Effect.map(rows => rows.map(toFileSnapshot)),
      Effect.mapError(toSnapshotDbError),
    ),

batchUpsert: (snapshots) =>
  sql.withTransaction(
    Effect.forEach(snapshots, (s) =>
      sql`INSERT INTO file_snapshots
          (output_dir, file_path, published_time, modified_time,
           content_hash, frontmatter_hash, build_time)
          VALUES (${s.outputDir}, ${s.filePath}, ${s.publishedTime},
                  ${s.modifiedTime}, ${s.contentHash}, ${s.frontmatterHash},
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
             OR frontmatter_hash != ${s.frontmatterHash}`
    , { concurrency: 1 }),
  ).pipe(
    Effect.map(() => snapshots.length),
    Effect.mapError(toSnapshotDbError),
  ),
```

### Row Mapping

```typescript
function toFileSnapshot(row: Record<string, unknown>): FileSnapshot {
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
```

Or use the `FileSnapshotRow` schema for decoded results.

## Migration

### `001_create_snapshots`

```typescript
const createSnapshotsTable = Effect.gen(function* () {
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
  yield* sql`CREATE INDEX IF NOT EXISTS idx_output_dir
             ON file_snapshots(output_dir)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_file_path
             ON file_snapshots(file_path)`;
});
```

The Migrator tracks which migrations have run in a `_effect_migrations`
table. On subsequent runs, migration 001 is skipped.

## Content Hash Module

### `src/content-hash.ts`

```typescript
import { createHash } from "node:crypto";

export function hashContent(content: string): string {
  const normalized = normalizeContent(content);
  return createHash("sha256").update(normalized).digest("hex");
}

export function hashFrontmatter(
  frontmatter: Record<string, unknown>,
): string {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key === "publishedTime" || key === "modifiedTime" ||
        key === "head" || key === "article:published_time" ||
        key === "article:modified_time") continue;
    filtered[key] = value;
  }
  const sorted = Object.keys(filtered).sort().reduce((acc, key) => {
    acc[key] = filtered[key];
    return acc;
  }, {} as Record<string, unknown>);
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

export function normalizeContent(content: string): string {
  return content
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .trim()
    .replaceAll(/\n{3,}/g, "\n\n");
}
```

Moved verbatim from `SnapshotManager` static methods.

## Build Pipeline Integration

### ResolvedBuildContext Change

Remove `snapshotManager: SnapshotManager` from `ResolvedBuildContext` in
`services/ConfigService.ts`. The `SnapshotService` is accessed from the
Effect context instead.

### ConfigServiceLive Change

Remove the `acquireRelease` for `SnapshotManager` from `resolve()`. The
DB lifecycle is handled by `SnapshotServiceLive`'s `SqliteClient.layer`.
ConfigServiceLive no longer imports `SnapshotManager`.

### Build-Stages Changes

Every function that currently receives `snapshotManager` via parameter
or `buildContext` changes to access `SnapshotService` from Effect context:

```typescript
// BEFORE (in writeMetadata, cleanupAndCommit, etc.)
yield* Effect.sync(() => snapshotManager.upsertSnapshot({...}));
yield* Effect.sync(() => snapshotManager.batchUpsertSnapshots(snapshots));
yield* Effect.sync(() => snapshotManager.cleanupStaleFiles(dir, files));
yield* Effect.sync(() => snapshotManager.deleteSnapshot(dir, path));

// AFTER
const snapshots = yield* SnapshotService;
yield* snapshots.upsert({...});
yield* snapshots.batchUpsert(snapshotArray);
yield* snapshots.cleanupStale(dir, files);
yield* snapshots.deleteSnapshot(dir, path);
```

The `Effect.sync` wrappers are gone — the service methods already return
`Effect`.

`SnapshotManager.hashContent` and `SnapshotManager.hashFrontmatter`
become imports from `content-hash.ts`:

```typescript
// BEFORE
import { SnapshotManager } from "./snapshot-manager.js";
const hash = SnapshotManager.hashContent(body);

// AFTER
import { hashContent } from "./content-hash.js";
const hash = hashContent(body);
```

### Build-Program Changes

`build-program.ts:generateApiDocs` currently loads snapshots via:

```typescript
const existingSnapshots = yield* Effect.sync(() => {
  const map = new Map();
  for (const s of snapshotManager.getSnapshotsForOutputDir(dir)) {
    map.set(s.filePath, s);
  }
  return map;
});
```

This becomes:

```typescript
const snapshotSvc = yield* SnapshotService;
const allSnapshots = yield* snapshotSvc.getAllForDirectory(resolvedOutputDir);
const existingSnapshots = new Map(
  allSnapshots.map(s => [s.filePath, s]),
);
```

### R Channel Propagation

Functions gain `SnapshotService` in their `R` channel:

```typescript
// writeMetadata
Effect.Effect<void, never, FileSystem.FileSystem | SnapshotService>

// cleanupAndCommit
Effect.Effect<void, never, FileSystem.FileSystem | SnapshotService>

// generateApiDocs (build-program)
Effect.Effect<CrossLinkData, never, FileSystem.FileSystem | SnapshotService>
```

The `buildPipelineForApi` R channel does NOT include `SnapshotService`
since the per-item stream functions don't touch the DB (snapshot
operations happen in `writeMetadata` and `cleanupAndCommit`, which run
after the stream).

### Layer Stack

```typescript
const BaseLayer = Layer.mergeAll(
  PathDerivationServiceLive,
  PluginLoggerLayer(effectLogLevel),
  TypeRegistryServiceLive,
  NodeFileSystem.layer,
  SnapshotServiceLive(dbPath),  // NEW — replaces acquireRelease in ConfigServiceLive
);
```

The `dbPath` is `path.resolve(process.cwd(), "api-docs-snapshot.db")` —
same as current. It moves from `ConfigServiceLive.resolve()` to the
Layer stack construction in `plugin.ts`.

## Testing

### New Tests (`__test__/snapshot-service.test.ts`)

Test the `@effect/sql` implementation with real SQLite (temp DB):

- `getSnapshot` returns `None` for missing, `Some` for existing
- `upsert` inserts new, returns true; no-change returns false
- `batchUpsert` inserts multiple in transaction
- `getAllForDirectory` returns all for dir
- `cleanupStale` removes stale, returns paths
- `deleteSnapshot` removes specific entry

### Mock Layer Update (`__test__/utils/layers.ts`)

Update `MockSnapshotServiceLayer` to match new interface (add
`batchUpsert`, `deleteSnapshot`, `getFilePaths`; remove `hashContent`,
`hashFrontmatter`).

### Content Hash Tests (`__test__/content-hash.test.ts`)

Move existing hash tests from `snapshot-manager.test.ts` to new file.

## Deleted Files

| File | Reason |
| ---- | ------ |
| `src/snapshot-manager.ts` | Replaced by SnapshotServiceLive |
| `src/snapshot-manager.test.ts` | Replaced by snapshot-service.test.ts + content-hash.test.ts |

Also remove `better-sqlite3` and `@types/better-sqlite3` from
`plugin/package.json` direct dependencies (they come through
`@effect/sql-sqlite-node` transitively).
