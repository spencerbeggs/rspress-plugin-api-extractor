# Stream Pipeline Design

## Overview

Refactor the 920-line `generateApiDocs` function into testable units,
fix the cross-linker race conditions, then convert to an Effect Stream
pipeline. Two phases: extract first, Stream second.

### Goals

- Break `generateApiDocs` into 5 focused functions in `build-stages.ts`
- Fix both cross-linker singleton race conditions in multi-API mode
- Convert orchestration to Effect Stream with bounded concurrency
- Enable backpressure (write stage slows generation if needed)
- Delete `utils.ts` (last `parallelLimit` consumer removed)

### Non-Goals

- Migrating page generators (ClassPageGenerator, etc.) to Effect
- Changing the remark plugin architecture
- Full Effect.log adoption in plugin.ts (deferred to natural follow-up)
- Restructuring beforeBuild phases outside generateApiDocs (~400 lines
  of Shiki init, VFS loading, config resolution stay in plugin.ts)

## Decisions Record

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Approach | Extract then Stream (two phases) | Safe refactor first, Stream builds on clean boundaries |
| Cross-linker fix | During extraction (Phase A) | Touching the same code anyway |
| Function granularity | 5 medium functions | Maps to 5 Stream stages, ~150-200 lines each |
| File location | Single `build-stages.ts` | Related functions together, shrinks plugin.ts by ~600 lines |
| Snapshot writes | Batch after stream drains (not per-item) | SQLite WAL supports one writer; batch avoids contention |

## Key Data Types

Types defined in `build-stages.ts`, used as contracts between stages.

### WorkItem

```text
interface WorkItem {
  item: ApiItem               // API Extractor model item
  categoryKey: string         // e.g., "classes", "functions"
  categoryConfig: CategoryConfig
  namespaceMember?: NamespaceMember  // for namespace member items
}
```

### GeneratedPageResult

```text
interface GeneratedPageResult {
  workItem: WorkItem
  content: string              // full MDX content with frontmatter
  bodyContent: string          // markdown body (no frontmatter)
  frontmatter: Record<string, unknown>
  contentHash: string          // SHA-256 of body
  frontmatterHash: string      // SHA-256 of non-timestamp frontmatter
  routePath: string            // e.g., "/api/classes/MyClass"
  relativePathWithExt: string  // e.g., "classes/MyClass.mdx"
  publishedTime: string        // resolved from snapshot or buildTime
  modifiedTime: string         // resolved from snapshot or buildTime
  isUnchanged: boolean         // hash comparison result
}
```

Note: `publishedTime`, `modifiedTime`, and `isUnchanged` are resolved
during page generation because timestamps are embedded in frontmatter.
The generation stage receives `existingSnapshots` (a pre-loaded Map)
for hash comparison. This is a read-only lookup, not a DB query per
item.

### FileWriteResult

```text
interface FileWriteResult {
  relativePathWithExt: string
  absolutePath: string
  status: "new" | "modified" | "unchanged"
  snapshot: FileSnapshot       // for batch upsert
  categoryKey: string
  label: string                // for _meta.json entries
  routePath: string
}
```

## Phase A: Extract and Fix

### Extracted Functions

Five functions extracted from `generateApiDocs` into
`plugin/src/build-stages.ts`.

#### 1. `prepareWorkItems()`

Takes the parsed API model, category config, and package metadata.
Returns a flat array of work items plus cross-link data for all items.
Handles namespace member expansion (items inside namespaces become
separate work items with qualified names).

```text
Input:  apiPackage, categories, packageJson, source config
Output: { workItems: WorkItem[], crossLinkData: CrossLinkData }
```

Cross-link data includes route mappings and kind mappings for both
the shikiCrossLinker and markdownCrossLinker singletons.

#### 2. `generatePages()`

First parallel stage. Generates page content for each work item. Calls
the appropriate page generator (ClassPageGenerator, etc.), builds
frontmatter with timestamps, hashes content and frontmatter.

Receives `existingSnapshots: Map<string, FileSnapshot>` (pre-loaded
from the snapshot DB before the parallel stage starts) for timestamp
resolution. This is a read-only lookup — no DB I/O during generation.

Also resolves OG image metadata per-page via `ogResolver.resolve()`.

```text
Input:  WorkItem[], existingSnapshots, pageConcurrency, shikiHighlighter,
        formatters, ogResolver, buildTime
Output: GeneratedPageResult[]
```

#### 3. `writeFiles()`

Second parallel stage. For each `GeneratedPageResult`, writes the file
to disk if `isUnchanged === false`. Increments file metrics. Returns
results for metadata and snapshot batch upsert.

```text
Input:  GeneratedPageResult[], outputDir
Output: FileWriteResult[]
```

#### 4. `writeMetadata()`

Aggregates `FileWriteResult[]` by category to build `_meta.json`
entries. Writes `_meta.json` for each category folder and the main API
index page. Each `_meta.json` write has its own snapshot tracking (hash
comparison, timestamp preservation, JSON normalization).

```text
Input:  FileWriteResult[], categories, outputDir, routeBase,
        snapshotManager, apiName, packageJson
Output: void (side effect: file writes + snapshot updates)
```

#### 5. `cleanupAndCommit()`

Batch-upserts all snapshot records from the build. Detects stale files
(in DB but not generated this build) and deletes them from disk.
Performs filesystem-based orphan detection for files with no DB record.
Removes empty directories.

Does NOT close the snapshot manager — the caller manages its lifecycle
(it's shared across all API configs via `acquireRelease`).

```text
Input:  FileWriteResult[], snapshotManager, outputDir, generatedFiles set
Output: void (side effect: batch upsert, stale deletion, orphan cleanup)
```

### Cross-Linker Fix

Two singleton cross-linkers are affected in multi-API mode:

- **shikiCrossLinker** — `ShikiCrossLinker` instance, used by Shiki
  transformers for code block type links. Currently `reinitialize()`
  replaces all routes per API.

- **markdownCrossLinker** — Module-level singleton imported directly by
  every page generator. Currently `initialize()` replaces all routes
  per API.

Both must accumulate routes across APIs, not replace per-API.

**Fix strategy:** Make both cross-linkers accumulative.

1. `prepareWorkItems()` returns `CrossLinkData` (routes + kinds) for
   each API
2. The `beforeBuild` caller collects `CrossLinkData` from ALL APIs
   before starting page generation
3. Merge all route maps and kind maps into a single combined set
4. Initialize both cross-linkers ONCE with the merged data
5. `VfsRegistry.register()` is called per-API (it's keyed by scope,
   so no conflict)

This moves cross-linker initialization from inside
`generateApiDocs` to the caller, after all `prepareWorkItems()` calls
complete but before any `generatePages()` calls start.

### Thin Orchestrator

After extraction, `generateApiDocs` becomes ~100 lines:

```text
function generateApiDocs(config):
  { workItems, crossLinkData } = prepareWorkItems(config)
  pages = await generatePages(workItems, existingSnapshots, ...)
  writeResults = await writeFiles(pages, outputDir)
  await writeMetadata(writeResults, categories, snapshotManager, ...)
  await cleanupAndCommit(writeResults, snapshotManager, outputDir)
  return crossLinkData
```

### Snapshot Manager Lifecycle

The snapshot manager is created in `beforeBuild` (via
`SnapshotServiceLive` with `acquireRelease`) and shared across all API
configs. Each `generateApiDocs` call receives it as a parameter. The
snapshot DB stays open for the entire build; `acquireRelease` guarantees
WAL checkpoint + close in `afterBuild` via `effectRuntime.dispose()`.

Individual functions interact with snapshots as:

- `generatePages()` — reads `existingSnapshots` Map (pre-loaded, no DB)
- `writeMetadata()` — queries + upserts for `_meta.json` files
- `cleanupAndCommit()` — batch upsert + stale cleanup queries

## Phase B: Stream Pipeline

Convert the thin orchestrator to an Effect Stream pipeline.

### Pipeline Shape

```text
Stream.fromIterable(workItems)
    |
    v
Stream.mapEffect(generatePage, {     // page content + hash + timestamps
  concurrency: pageConcurrency
})
    |
    v
Stream.filter(result => !result.isUnchanged)  // skip unchanged
    |
    v
Stream.mapEffect(writeFile, {         // disk write only
  concurrency: pageConcurrency
})
    |
    v
Stream.runFold(accumulator)           // collect FileWriteResult[]
    |
    v
writeMetadata(accumulated)            // sequential
cleanupAndCommit(accumulated)         // sequential: BATCH snapshot upsert
```

### Snapshot Write Strategy

Snapshot upserts are batched, not per-item. The `runFold` accumulator
collects all `FileWriteResult` records. After the stream drains,
`cleanupAndCommit()` batch-upserts all records in a single SQLite
transaction. This matches the current behavior and avoids SQLite write
contention in the concurrent pipeline.

### What Changes from Phase A

- `parallelLimit(items, N, fn)` becomes
  `Stream.mapEffect(fn, { concurrency: N })`
- The two sequential `parallelLimit` blocks merge into a single
  streaming pipeline with a filter between them
- Backpressure is automatic — if disk writes are slower than page
  generation, generation pauses
- `Effect.annotateLogs` on each item provides fiber-scoped context
- Unchanged files are filtered before the write stage (current code
  skips writes inside the write callback; Stream filters explicitly)

### beforeBuild Orchestration

The outer `parallelLimit(apiConfigs, 2, ...)` loop converts to:

```text
// Phase 1: Prepare all APIs (collect cross-link data)
allCrossLinkData = await Effect.forEach(apiConfigs, prepareWorkItems,
  { concurrency: "unbounded" })

// Phase 2: Initialize cross-linkers with merged data
initializeCrossLinkers(merge(allCrossLinkData))

// Phase 3: Generate and write for each API
Effect.forEach(apiConfigs, (config) =>
  buildPipelineForApi(config).pipe(
    Effect.annotateLogs("api", config.apiName)
  ),
  { concurrency: 2 }
)
```

The three-phase structure ensures cross-link data from all APIs is
available before any page generation starts.

### Memory Improvement

Current: accumulates all `GeneratedPageResult[]` (full MDX content)
before starting writes. With 300+ pages this is significant.

Stream: each page flows through generation → filter → write → fold.
Only the fold accumulator grows, and it holds `FileWriteResult` (paths
and status, not content). Content is written and released per-item.

### utils.ts Deletion

Phase B removes the last consumer of `parallelLimit`. `utils.ts` is
deleted.

## Testing

### Phase A Tests

All 643 existing tests pass unchanged (pure refactor). New unit tests
in `plugin/__test__/build-stages.test.ts`:

- `prepareWorkItems()` — fixture API model produces correct work item
  count (items + namespace members), cross-link data has entries for
  all exported items
- `generatePages()` — work items with mock Shiki produce pages with
  non-empty content and valid SHA-256 hashes
- `writeFiles()` — pages with `isUnchanged: false` produce file writes,
  pages with `isUnchanged: true` produce no writes, metrics increment
  correctly

Uses existing mock layers from `__test__/utils/layers.ts`.

### Phase B Tests

- Pipeline integration — fixture model through full Stream pipeline with
  mock layers, assert correct file write count and metric values
- Annotation propagation — `Effect.annotateLogs("api", name)` flows
  through pipeline stages, visible in captured log output

## File Changes

### Phase A

| Action | File | Details |
| ------ | ---- | ------- |
| Create | `plugin/src/build-stages.ts` | 5 extracted functions + types (~700 lines) |
| Modify | `plugin/src/plugin.ts` | Thin orchestrator, cross-linker fix (~600 lines removed) |
| Create | `plugin/__test__/build-stages.test.ts` | Unit tests for extracted functions |

### Phase B

| Action | File | Details |
| ------ | ---- | ------- |
| Modify | `plugin/src/build-stages.ts` | Adapt functions as Stream callbacks |
| Modify | `plugin/src/plugin.ts` | Stream pipeline via effectRuntime.runPromise, 3-phase beforeBuild |
| Modify | `plugin/__test__/build-stages.test.ts` | Add Stream integration tests |
| Delete | `plugin/src/utils.ts` | Last parallelLimit consumer removed |
