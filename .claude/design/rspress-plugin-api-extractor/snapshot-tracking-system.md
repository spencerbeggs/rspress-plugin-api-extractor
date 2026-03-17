---
status: current
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-03-17
last-synced: 2026-03-17
completeness: 90
related:
  - rspress-plugin-api-extractor/build-architecture.md
  - rspress-plugin-api-extractor/page-generation-system.md
  - rspress-plugin-api-extractor/performance-observability.md
dependencies: []
---

# Snapshot Tracking System Design

**Status:** Production-ready (Effect-based)

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [Change Detection Algorithm](#change-detection-algorithm)
- [Timestamp Management](#timestamp-management)
- [Hash Calculation](#hash-calculation)
- [Disk Fallback Logic](#disk-fallback-logic)
- [Stale and Orphan Cleanup](#stale-and-orphan-cleanup)
- [Performance Considerations](#performance-considerations)

---

## Overview

The snapshot tracking system provides incremental build optimization for
the `rspress-plugin-api-extractor` by tracking file state across builds.
It detects which files are new, unchanged, or modified, skipping writes
for unchanged files to preserve RSPress's cache and avoid unnecessary
git changes.

### Key Features

- **Content-based change detection** using SHA-256 hashing
- **Timestamp preservation** for unchanged files (SEO-critical Open Graph
  meta tags)
- **Disk fallback** when snapshot database is missing (e.g., first clone)
- **Stale file cleanup** to remove files no longer in the API model
- **Orphan file cleanup** to remove untracked files from output directory
- **Effect service architecture** with `@effect/sql-sqlite-node` and
  managed migrations
- **Batch upserts** within transactions for write efficiency
- **Pre-loaded snapshot map** for O(1) lookup during build

---

## Architecture

### Effect Service Layer

The snapshot system uses Effect's service pattern with a clean separation
between interface and implementation:

**Service interface** (`services/SnapshotService.ts`):

```typescript
export class SnapshotService extends Context.Tag(
  "rspress-plugin-api-extractor/SnapshotService"
)<SnapshotService, SnapshotServiceShape>() {}
```

The `SnapshotServiceShape` defines methods:

- `hashContent(content)` -- SHA-256 content hashing
- `getSnapshot(outputDir, filePath)` -- single snapshot lookup
- `getAllForDirectory(outputDir)` -- pre-load all snapshots
- `getFilePaths(outputDir)` -- list tracked paths
- `upsert(snapshot)` -- insert or update single snapshot
- `batchUpsert(snapshots)` -- transactional batch update
- `deleteSnapshot(outputDir, filePath)` -- remove single snapshot
- `cleanupStale(outputDir, currentFiles)` -- remove stale entries

**Live implementation** (`layers/SnapshotServiceLive.ts`):

Uses `@effect/sql-sqlite-node` SqliteClient with managed lifecycle.
WAL checkpoint registered as scope finalizer for clean shutdown.

### Data Flow

```text
Plugin initialization (plugin.ts)
    |
    +-> Create SnapshotServiceLive(dbPath)
    |   +-> SqliteClient.layer({ filename: dbPath })
    |   +-> SqliteMigrator runs 001_create_snapshots
    |   +-> WAL checkpoint registered as scope finalizer
    |
    +-> Layer composed into EffectAppLayer
    +-> ManagedRuntime.make(EffectAppLayer)

Build execution (build-program.ts)
    |
    +-> yield* snapshotSvc.getAllForDirectory(resolvedOutputDir)
    |   -> Pre-loads ALL snapshots into Map for O(1) lookup
    |
    +-> Stream pipeline (build-stages.ts):
    |   +-> generateSinglePage: compare hashes against Map
    |   +-> writeSingleFile: skip write for unchanged, track metrics
    |
    +-> writeMetadata: snapshot-tracked writes for _meta.json
    |
    +-> cleanupAndCommit:
        +-> batchUpsert: changed snapshots in single transaction
        +-> cleanupStale: delete DB rows for files not in build
        +-> orphan cleanup: delete disk files not in generatedFiles
```

### File Locations

| File | Purpose |
| --- | --- |
| `services/SnapshotService.ts` | Effect Context.Tag and interface |
| `layers/SnapshotServiceLive.ts` | SQLite implementation via `@effect/sql` |
| `migrations/001_create_snapshots.ts` | Schema creation migration |
| `content-hash.ts` | SHA-256 hashing functions (pure, standalone) |
| `build-stages.ts` | Change detection in `generateSinglePage` |
| `build-program.ts` | Orchestrates snapshot loading and cleanup |

---

## Database Schema

### Migration: 001_create_snapshots

```sql
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
);

CREATE INDEX IF NOT EXISTS idx_output_dir
    ON file_snapshots(output_dir);
CREATE INDEX IF NOT EXISTS idx_file_path
    ON file_snapshots(file_path);
```

Migrations are managed by `@effect/sql` Migrator:

```typescript
const MigratorLive = SqliteMigrator.layer({
  loader: Migrator.fromRecord({
    "001_create_snapshots": migration001,
  }),
});
```

### WAL Lifecycle

The SQLite connection uses WAL mode (set automatically by
`@effect/sql-sqlite-node`). The `SnapshotServiceLive` registers a scope
finalizer to checkpoint the WAL on close:

```typescript
yield* Effect.addFinalizer(() =>
  sql`PRAGMA wal_checkpoint(TRUNCATE)`.pipe(Effect.ignore)
);
```

In production builds, the runtime is disposed in `afterBuild`, triggering
the checkpoint. In dev mode, the runtime stays alive for HMR rebuilds.

---

## Change Detection Algorithm

### Pre-Loading Snapshots

All snapshots for the output directory are loaded at build start:

```typescript
const allSnapshots = yield* snapshotSvc
  .getAllForDirectory(resolvedOutputDir).pipe(Effect.orDie);
const existingSnapshots = new Map(
  allSnapshots.map((s) => [s.filePath, s])
);
```

This reduces database round-trips from N (one per file) to 1.

### MDX File Change Detection

In `generateSinglePage` (build-stages.ts):

1. Generate page content via the appropriate page generator
2. Parse with `gray-matter` to separate frontmatter and body
3. Normalize markdown spacing (`normalizeMarkdownSpacing`)
4. Hash body: `hashContent(bodyContent)`
5. Hash frontmatter: `hashFrontmatter(frontmatterData)`
6. Look up snapshot: `existingSnapshots.get(relativePathWithExt)`

**Decision tree:**

| Snapshot exists? | Hashes match? | Result |
| --- | --- | --- |
| Yes | Yes | UNCHANGED -- preserve timestamps, skip write |
| Yes | No | MODIFIED -- preserve publishedTime, update modifiedTime |
| No | (disk fallback) | See [Disk Fallback Logic](#disk-fallback-logic) |

### _meta.json Change Detection

In `writeMetadata`, navigation metadata files use the same hash-based
detection with JSON normalization for disk fallback:

```typescript
const existingData = JSON.parse(existingContent);
const normalizedExisting = JSON.stringify(existingData, null, "\t");
if (normalizedExisting === content) { /* unchanged */ }
```

---

## Timestamp Management

### Open Graph Meta Tags

Each generated MDX file includes timestamps as Open Graph meta tags:

```yaml
head:
  - - meta
    - property: "article:published_time"
      content: "2024-01-15T12:00:00.000Z"
  - - meta
    - property: "article:modified_time"
      content: "2024-01-15T12:00:00.000Z"
```

### Preservation Rules

| Scenario | published_time | modified_time |
| --- | --- | --- |
| **New file** | Current build time | Current build time |
| **Unchanged** | From snapshot/disk | From snapshot/disk |
| **Modified** | From snapshot/disk | Current build time |

### _meta.json Fixed Timestamps

Navigation metadata files use a fixed timestamp
(`"2024-01-01T00:00:00.000Z"`) since they have no semantic publication
date.

---

## Hash Calculation

### Location: `content-hash.ts`

Two pure standalone functions:

**`normalizeContent(content)`** -- Prepare content for consistent hashing:

- Convert line endings to `\n`
- Trim leading/trailing whitespace
- Collapse triple+ blank lines to single blank line

**`hashContent(content)`** -- SHA-256 of normalized markdown body.

**`hashFrontmatter(frontmatter)`** -- SHA-256 of frontmatter excluding
timestamp-related fields (`publishedTime`, `modifiedTime`, `head`,
`article:published_time`, `article:modified_time`). Keys are sorted
alphabetically for deterministic output.

### Why Exclude Timestamps from Frontmatter Hash?

If timestamps were included in the hash, every build would produce a
different hash (because `modifiedTime` would be the current build time),
marking all files as modified on every build. Excluding timestamps breaks
this circular dependency.

---

## Disk Fallback Logic

When the snapshot database is missing (first clone, DB deleted, CI
environment), the system falls back to comparing generated content against
existing files on disk using `@effect/platform` FileSystem:

```typescript
const fileExists = yield* fileSystem.exists(absolutePath)
  .pipe(Effect.orElseSucceed(() => false));

if (fileExists) {
  const existingContent = yield* fileSystem
    .readFileString(absolutePath)
    .pipe(Effect.orElseSucceed(() => null));

  if (existingContent !== null) {
    const { data: existingFrontmatter, content: existingBody } =
      matter(existingContent);
    const normalizedExistingBody =
      normalizeMarkdownSpacing(existingBody);
    const existingContentHash = hashContent(normalizedExistingBody);
    const existingFrontmatterHash =
      hashFrontmatter(existingFrontmatter);

    if (existingContentHash === contentHash &&
        existingFrontmatterHash === frontmatterHash) {
      // Preserve timestamps from existing file
      publishedTime = existingFrontmatter[
        "article:published_time"] || buildTime;
      modifiedTime = existingFrontmatter[
        "article:modified_time"] || buildTime;
      isUnchanged = true;
    }
  }
}
```

This ensures:

- Running a build after a fresh clone does not modify unchanged files
- SEO timestamps are preserved across environments
- No spurious git changes after database loss

---

## Stale and Orphan Cleanup

### Stale File Cleanup

Files tracked in the snapshot database but not generated in the current
build are removed from both the database and disk:

```typescript
const staleFiles = yield* snapshotSvc
  .cleanupStale(resolvedOutputDir, generatedFiles);

yield* Effect.forEach(staleFiles, (staleFile) =>
  Effect.gen(function* () {
    yield* fileSystem.remove(
      path.join(resolvedOutputDir, staleFile)
    ).pipe(Effect.ignore);
  }),
  { concurrency: "unbounded" },
);
```

### Orphan File Cleanup

Files on disk that are not in the `generatedFiles` set are also cleaned
up. This handles files that exist on disk but have no snapshot entry
(e.g., manually created files, leftover from a previous build):

```typescript
const allFiles = yield* fileSystem
  .readDirectory(resolvedOutputDir, { recursive: true });

for (const entry of allFiles) {
  if (!relPath.endsWith(".mdx") &&
      !relPath.endsWith("_meta.json")) continue;
  if (!generatedFiles.has(normalizedRelPath)) {
    orphanedFiles.push(normalizedRelPath);
  }
}
```

### Batch Upsert

Only changed snapshots are committed, in a single transaction:

```typescript
const snapshotsToUpdate = fileResults
  .filter((r) => r.status !== "unchanged")
  .map((r) => r.snapshot);

yield* snapshotSvc.batchUpsert(snapshotsToUpdate);
```

The SQL uses conditional `ON CONFLICT ... DO UPDATE ... WHERE` to avoid
writing unchanged rows even within the batch.

---

## Performance Considerations

### Pre-loaded Snapshot Map

1 query loads all snapshots into a `Map` for O(1) per-file lookup.
For 339 files this is approximately 5ms total.

### Batch Transaction

Single transaction for all snapshot updates avoids per-file overhead.

### File Write Avoidance

Unchanged files are never written to disk, preserving RSPress cache and
file system timestamps.

### Build Metrics

File statistics tracked via Effect Metrics (counters):

- `files.total`, `files.new`, `files.modified`, `files.unchanged`

Read at build end by `logBuildSummary` in `ObservabilityLive.ts`.

---

## Related Documentation

- **Build Architecture:**
  `build-architecture.md` -- Plugin structure and service layer
- **Page Generation System:**
  `page-generation-system.md` -- Stream pipeline using snapshots
- **Performance Observability:**
  `performance-observability.md` -- Effect Metrics system
