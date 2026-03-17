# Native Effect Pipeline Design

## Overview

Convert all build-stage functions and the `generateApiDocs` orchestrator from
`async`/`Promise` to native `Effect.Effect` programs. Replace `fs.promises.*`
with `@effect/platform` `FileSystem`. Move orchestration to `build-program.ts`.
Eliminate all `Effect.runSync(Metric.increment(...))` anti-patterns.

### Goals

- Every function in `build-stages.ts` returns `Effect.Effect` (not `Promise`)
- File I/O uses `@effect/platform` `FileSystem` for cross-platform correctness
- Metrics use natural `yield* Metric.increment(...)` (not `Effect.runSync`)
- `generateApiDocs` moves to `build-program.ts` as a composable Effect program
- Stream pipeline calls Effect functions directly (no `Effect.promise` wrappers)
- `plugin.ts` becomes pure RSPress wiring (~250 lines)

### Non-Goals

- Migrating page generators to Effect (they stay as async classes, wrapped
  in `Effect.promise`)
- Migrating `SnapshotManager` to `@effect/sql` (stays as sync class, wrapped
  in `Effect.sync`)
- Changing the public plugin API
- Restructuring `ConfigServiceLive` (already migrated)

### Constraints

- Page generators have `async generate()` methods — wrap with
  `Effect.promise(() => generator.generate(...))`
- `SnapshotManager` has sync methods — wrap with `Effect.sync(() => sm.method())`
- `@effect/platform` `FileSystem` service must be in the layer stack
- `@effect/platform-node` provides `NodeFileSystem.layer` for production;
  tests can use real layers or mocks
- `node:path` continues to be used for path manipulation (pure, sync,
  cross-platform via Node.js). `@effect/platform` `Path` is not needed.

## Decisions Record

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Page generators | Wrapped in `Effect.promise` | Complex async classes, not worth converting in this scope |
| SnapshotManager | Wrapped in `Effect.sync` | Sync better-sqlite3 methods, `@effect/sql` migration is separate |
| File I/O | `@effect/platform` FileSystem | Cross-platform path handling, mockable in tests |
| Orchestrator location | New `build-program.ts` | Separates pipeline orchestration from stage implementations; `build-stages.ts` is already 1,093 lines |
| Error handling | `PageGenerationError` in error channel | Individual page failures logged and skipped, don't abort build |
| `PlatformError` handling | Absorbed internally, not in public error channels | FileSystem errors are caught per-call: existence checks use `fileSystem.exists` (returns boolean), read failures treated as "file missing", write failures wrapped in domain errors or propagated. Public function error types stay domain-specific (`PageGenerationError`, `never`), not `PlatformError`. |

## Conversion Patterns

### Pattern 1: Metric Increment

```typescript
// BEFORE
Effect.runSync(Metric.increment(BuildMetrics.filesTotal));

// AFTER
yield* Metric.increment(BuildMetrics.filesTotal);
```

### Pattern 2: File I/O

```typescript
// BEFORE
import fs from "node:fs";
await fs.promises.writeFile(path, content, "utf-8");
await fs.promises.mkdir(dir, { recursive: true });
const exists = await fs.promises.access(path).then(() => true).catch(() => false);
const content = await fs.promises.readFile(path, "utf-8");
await fs.promises.unlink(path);
await fs.promises.rmdir(dir);
const entries = await fs.promises.readdir(dir, { recursive: true });

// AFTER
import { FileSystem } from "@effect/platform";
const fileSystem = yield* FileSystem.FileSystem;
yield* fileSystem.writeFileString(path, content);
yield* fileSystem.makeDirectory(dir, { recursive: true });
const exists = yield* fileSystem.exists(path);
const content = yield* fileSystem.readFileString(path);
yield* fileSystem.remove(path);
yield* fileSystem.remove(dir, { recursive: true });
const entries = yield* fileSystem.readDirectory(dir);
```

Note: `readDirectory` in `@effect/platform` is not recursive by default.
For recursive directory listing, use `readDirectory` with
`{ recursive: true }` option (check API), or implement a recursive walk.

### Pattern 3: SnapshotManager

```typescript
// BEFORE
snapshotManager.upsertSnapshot({ ... });
const snapshots = snapshotManager.getSnapshotsForOutputDir(dir);

// AFTER
yield* Effect.sync(() => snapshotManager.upsertSnapshot({ ... }));
const snapshots = yield* Effect.sync(() => snapshotManager.getSnapshotsForOutputDir(dir));
```

### Pattern 4: Page Generator

```typescript
// BEFORE (async)
const page = await generator.generate(item, baseRoute, ...);

// AFTER (Effect)
const page = yield* Effect.promise(() => generator.generate(item, baseRoute, ...));
```

### Pattern 5: Stream Pipeline

```typescript
// BEFORE
Stream.mapEffect((workItem) => Effect.promise(() => generateSinglePage(workItem, ctx)), {
  concurrency: pageConcurrency,
})

// AFTER (generateSinglePage returns Effect directly)
Stream.mapEffect((workItem) => generateSinglePage(workItem, ctx), {
  concurrency: pageConcurrency,
})
```

## File Changes

### New: `plugin/src/build-program.ts` (~150 lines)

The `generateApiDocs` Effect program:

```typescript
import { FileSystem } from "@effect/platform";

export function generateApiDocs(
  apiConfig: ResolvedApiConfig & { suppressExampleErrors?: boolean },
  buildContext: ResolvedBuildContext,
  fileContextMap: Map<string, { api?: string; version?: string; file: string }>,
): Effect.Effect<CrossLinkData, PageGenerationError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;

    // Load existing snapshots (sync)
    const existingSnapshots = yield* Effect.sync(() => {
      const map = new Map();
      for (const s of snapshotManager.getSnapshotsForOutputDir(resolvedOutputDir)) {
        map.set(s.filePath, s);
      }
      return map;
    });

    // Create output directory
    yield* fileSystem.makeDirectory(resolvedOutputDir, { recursive: true });

    // Prepare work items (sync, pure)
    const { workItems, crossLinkData } = prepareWorkItems({ ... });

    // Initialize cross-linkers (sync side effects)
    markdownCrossLinker.initialize(...);
    shikiCrossLinker.reinitialize(...);
    TwoslashManager.addTypeRoutes(...);

    // Register VFS
    if (highlighter) VfsRegistry.register(...);

    // Stream pipeline
    yield* Effect.logInfo(`Generating ${workItems.length} pages`);
    const fileResults = yield* buildPipelineForApi({ ... });

    // Track files + context
    const generatedFiles = new Set<string>();
    for (const r of fileResults) {
      generatedFiles.add(r.relativePathWithExt);
      fileContextMap.set(r.absolutePath, { ... });
    }

    // Write metadata
    yield* writeMetadata({ ... });

    // Cleanup
    yield* cleanupAndCommit({ ... });

    yield* Effect.logInfo(`Generated ${changedCount} files for ${packageName}`);
    return crossLinkData;
  });
}
```

### Rewrite: `plugin/src/build-stages.ts`

Every function signature changes from `async function → Promise<T>` to
`function → Effect.Effect<T, E, FileSystem.FileSystem>`.

#### `generateSinglePage`

```typescript
// BEFORE
export async function generateSinglePage(
  workItem: WorkItem,
  ctx: GenerateSinglePageContext,
): Promise<GeneratedPageResult | null>

// AFTER
export function generateSinglePage(
  workItem: WorkItem,
  ctx: GenerateSinglePageContext,
): Effect.Effect<GeneratedPageResult | null, never, FileSystem.FileSystem>
```

Internal changes:

- `await generator.generate(...)` → `yield* Effect.promise(() => generator.generate(...))`
- `Effect.runSync(Metric.increment(...))` → `yield* Metric.increment(...)`
- `await fs.promises.access(path).then(() => true).catch(() => false)` → `yield* fileSystem.exists(path)`
- `await fs.promises.readFile(path, "utf-8")` → `yield* fileSystem.readFileString(path).pipe(Effect.orElseSucceed(() => null))` (disk fallback: treat read failure as "file missing")

**PlatformError handling:** The disk fallback reads existing files to
extract timestamps. Read failures are treated as "file doesn't exist"
via `Effect.orElseSucceed`. All `PlatformError` is absorbed — the
function's error channel stays `never`.

#### `writeSingleFile`

```typescript
// BEFORE
export async function writeSingleFile(
  result: GeneratedPageResult,
  ctx: WriteSingleFileContext,
): Promise<FileWriteResult>

// AFTER
export function writeSingleFile(
  result: GeneratedPageResult,
  ctx: WriteSingleFileContext,
): Effect.Effect<FileWriteResult, never, FileSystem.FileSystem>
```

Internal changes:

- `await fs.promises.mkdir(...)` → `yield* fileSystem.makeDirectory(..., { recursive: true })`
- `await fs.promises.writeFile(...)` → `yield* fileSystem.writeFileString(...)`
- `await fs.promises.access(...)` → `yield* fileSystem.exists(...)`
- `Effect.runSync(Metric.increment(...))` → `yield* Metric.increment(...)`
- `await ogResolver.resolve(...)` → `yield* Effect.promise(() => ogResolver.resolve(...))`
- `await import("./og-resolver.js")` and `await import("./markdown/helpers.js")` →
  static imports at top of file (no more dynamic imports)

**PlatformError handling:** Write failures propagate naturally (fatal for
that file). Existence checks use `fileSystem.exists` (returns boolean).
All `PlatformError` is absorbed — error channel stays `never`.

#### `writeMetadata`

```typescript
// BEFORE
export async function writeMetadata(input: WriteMetadataInput): Promise<void>

// AFTER
export function writeMetadata(
  input: WriteMetadataInput,
): Effect.Effect<void, never, FileSystem.FileSystem>
```

Internal changes:

- All `fs.promises.access/readFile/writeFile/mkdir` → `FileSystem` methods
  (`exists`, `readFileString`, `writeFileString`, `makeDirectory`)
- All `Effect.runSync(Metric.increment(...))` → `yield* Metric.increment(...)`
- `await Promise.all(...)` → `yield* Effect.forEach(..., { concurrency: "unbounded" })`
- `JSON.parse(existingContent)` → `yield* Effect.try(() => JSON.parse(existingContent))`
- `console.log(...)` status messages → `yield* Effect.logDebug(...)`

**PlatformError handling:** File existence checks use `fileSystem.exists`.
Read failures in JSON comparison treated as "file changed" via
`Effect.orElseSucceed`. Write failures propagate (fatal for that metadata
file). All `PlatformError` absorbed — error channel stays `never`.

#### `cleanupAndCommit`

```typescript
// BEFORE
export async function cleanupAndCommit(input: CleanupAndCommitInput): Promise<void>

// AFTER
export function cleanupAndCommit(
  input: CleanupAndCommitInput,
): Effect.Effect<void, never, FileSystem.FileSystem>
```

Internal changes:

- `snapshotManager.batchUpsertSnapshots(...)` → `yield* Effect.sync(() => ...)`
- `snapshotManager.cleanupStaleFiles(...)` → `yield* Effect.sync(() => ...)`
- `snapshotManager.deleteSnapshot(...)` → `yield* Effect.sync(() => ...)`
- `await fs.promises.unlink(path)` → `yield* fileSystem.remove(path).pipe(Effect.ignore)`
- `await fs.promises.readdir(dir, { recursive: true })` → implement recursive
  walk using `fileSystem.readDirectory(dir)` (non-recursive) + manual recursion.
  `@effect/platform` `readDirectory` does not support `{ recursive: true }`.
- `await fs.promises.readdir(dir)` (empty-dir check) → `yield* fileSystem.readDirectory(dir)` (non-recursive, correct)
- `await fs.promises.rmdir(dir)` → `yield* fileSystem.remove(dir).pipe(Effect.ignore)`
- `await Promise.all(...)` → `yield* Effect.forEach(..., { concurrency: "unbounded" })`
- `console.log(...)` stale/orphan/empty-dir messages → `yield* Effect.logDebug(...)`
- `JSON.parse(...)` in metadata comparison → `yield* Effect.try(() => JSON.parse(...))`

**PlatformError handling:** File deletion in cleanup ignores errors via
`Effect.ignore` (file may already be deleted). Directory removal ignores
errors (may be non-empty or already gone). All `PlatformError` absorbed.

#### `buildPipelineForApi`

```typescript
// BEFORE
export function buildPipelineForApi(
  input: BuildPipelineInput,
): Effect.Effect<FileWriteResult[]>

// AFTER
export function buildPipelineForApi(
  input: BuildPipelineInput,
): Effect.Effect<FileWriteResult[], never, FileSystem.FileSystem>
```

Internal changes:

- `Effect.promise(() => generateSinglePage(...))` → `generateSinglePage(...)`
- `Effect.promise(() => writeSingleFile(...))` → `writeSingleFile(...)`
- The `FileSystem.FileSystem` requirement propagates through `Stream.mapEffect`

#### `prepareWorkItems`

No changes — it's synchronous and pure. No file I/O or metrics.

#### `normalizeMarkdownSpacing`

No changes — pure string transformation.

### Modify: `plugin/src/plugin.ts`

1. Remove `generateApiDocs` function (moved to `build-program.ts`)
2. Import `generateApiDocs` from `"./build-program.js"`
3. Remove imports only used by old `generateApiDocs`: `markdownCrossLinker`,
   `ApiParser`, `prepareWorkItems`, `buildPipelineForApi`, `writeMetadata`,
   `cleanupAndCommit`, `ShikiCrossLinker`, `TwoslashManager`, `VfsRegistry`
   (type), etc. — check which are still used by `config()` hook
4. Add `NodeFileSystem.layer` to `BaseLayer`

### Modify: Layer Composition

```typescript
import { NodeFileSystem } from "@effect/platform-node";

const BaseLayer = Layer.mergeAll(
  PathDerivationServiceLive,
  PluginLoggerLayer(effectLogLevel),
  TypeRegistryServiceLive,
  NodeFileSystem.layer,  // NEW
);
const EffectAppLayer = Layer.provideMerge(
  ConfigServiceLive(options, shikiCrossLinker),
  BaseLayer,
);
```

`NodeFileSystem.layer` provides `FileSystem.FileSystem` to all Effect
programs in the runtime.

## Error Handling

### Page Generation Failures

Individual page generation failures are caught in the Stream pipeline:

```typescript
Stream.mapEffect((workItem) =>
  generateSinglePage(workItem, ctx).pipe(
    Effect.catchAll((err) =>
      Effect.gen(function* () {
        yield* Effect.logWarning(`Failed to generate page: ${err.message}`);
        return null;
      }),
    ),
  ),
  { concurrency: pageConcurrency },
)
```

Failed pages return `null` and are filtered out. The build continues.

### File I/O Errors

`@effect/platform` `FileSystem` methods fail with `PlatformError`. These
are caught at the appropriate level:

- File existence checks: `fileSystem.exists(path)` returns `boolean`
  (no error for missing files)
- Write failures: propagate as `PlatformError` (fatal for that page)
- Read failures in snapshot comparison: caught and treated as "file
  doesn't exist" (new file)

### Cleanup Errors

Stale file deletion and orphan cleanup errors are individually caught
(same as current behavior — `catch { /* ignore */ }`):

```typescript
yield* fileSystem.remove(fullPath).pipe(Effect.ignore);
```

## Testing

### Existing Tests

All existing tests in `build-stages.test.ts` update to:

1. Provide `FileSystem` layer: `NodeFileSystem.layer`
2. Run with `Effect.runPromise` instead of direct `await`
3. Provide `Effect.scoped` where FileSystem requires it

### Test Pattern

```typescript
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer } from "effect";

it("generates a page result", async () => {
  const program = generateSinglePage(workItem, ctx);
  const result = await Effect.runPromise(
    program.pipe(Effect.provide(NodeFileSystem.layer)),
  );
  expect(result).not.toBeNull();
});
```

### New Tests for `build-program.ts`

Integration test that runs the full `generateApiDocs` program with
the fixture model:

```typescript
it("generates docs for fixture model", async () => {
  const program = generateApiDocs(apiConfig, buildContext, fileContextMap);
  const crossLinkData = await Effect.runPromise(
    program.pipe(Effect.provide(NodeFileSystem.layer)),
  );
  expect(crossLinkData.routes.size).toBeGreaterThan(0);
});
```

## Migration Order

1. Add `NodeFileSystem.layer` to `BaseLayer` in plugin.ts
2. Convert `generateSinglePage` to Effect (with FileSystem)
3. Convert `writeSingleFile` to Effect (with FileSystem)
4. Update `buildPipelineForApi` to remove `Effect.promise` wrappers
5. Convert `writeMetadata` to Effect (with FileSystem)
6. Convert `cleanupAndCommit` to Effect (with FileSystem)
7. Create `build-program.ts` with `generateApiDocs` as Effect
8. Update `plugin.ts` — import from `build-program.ts`, remove old function
9. Update all tests
10. Remove `import fs from "node:fs"` from `build-stages.ts`
