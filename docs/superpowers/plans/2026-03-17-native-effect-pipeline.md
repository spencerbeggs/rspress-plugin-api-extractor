# Native Effect Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development
> (if subagents available) or superpowers:executing-plans to implement this plan.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert all build-stage functions from `async`/`Promise` to native
`Effect.Effect` with `@effect/platform` FileSystem, move orchestration to
`build-program.ts`, and eliminate all `Effect.runSync(Metric.increment(...))`
anti-patterns.

**Architecture:** Each function in `build-stages.ts` converts from
`async → Promise<T>` to `() → Effect.Effect<T, never, FileSystem.FileSystem>`.
File I/O uses `@effect/platform` `FileSystem` service. Metrics use natural
`yield* Metric.increment(...)`. A new `build-program.ts` contains the
`generateApiDocs` orchestrator as a composable Effect program. `plugin.ts`
becomes pure RSPress wiring.

**Tech Stack:** Effect (Effect, Stream, Metric), @effect/platform (FileSystem),
@effect/platform-node (NodeFileSystem), Vitest, Biome

**Spec:** `docs/superpowers/specs/2026-03-17-native-effect-pipeline-design.md`

---

## File Structure

### New files

| File | Responsibility |
| ---- | -------------- |
| `plugin/src/build-program.ts` | `generateApiDocs` as Effect program — orchestrates stages |
| `plugin/__test__/build-program.integration.test.ts` | Integration test for full `generateApiDocs` Effect |

### Modified files

| File | Change |
| ---- | ------ |
| `plugin/src/build-stages.ts` | All functions → `Effect.Effect`. `fs.promises.*` → `FileSystem`. Metrics → `yield*`. Remove `import fs from "node:fs"`. |
| `plugin/src/plugin.ts` | Remove `generateApiDocs`, import from `build-program.js`. Add `NodeFileSystem.layer` to BaseLayer. |
| `plugin/__test__/build-stages.test.ts` | Tests provide `NodeFileSystem.layer`, run with `Effect.runPromise`. |

---

## Chunk 1: Add FileSystem Layer

### Task 1: Add `NodeFileSystem.layer` to the runtime

**Files:**

- Modify: `plugin/src/plugin.ts`

- [ ] **Step 1: Add NodeFileSystem.layer to BaseLayer**

In `plugin/src/plugin.ts`, find the `BaseLayer` construction (around line 232).
Add `NodeFileSystem.layer`:

```typescript
import { NodeFileSystem } from "@effect/platform-node";

const BaseLayer = Layer.mergeAll(
  PathDerivationServiceLive,
  PluginLoggerLayer(effectLogLevel),
  TypeRegistryServiceLive,
  NodeFileSystem.layer,  // NEW
);
```

- [ ] **Step 2: Run all tests**

Run: `pnpm run test`

Expected: All 676 tests pass. Adding the layer doesn't change behavior.

- [ ] **Step 3: Lint, typecheck, commit**

```bash
git add plugin/src/plugin.ts
git commit -m "feat: add NodeFileSystem.layer to Effect runtime"
```

---

## Chunk 2: Convert Per-Item Functions

### Task 2: Convert `generateSinglePage` to Effect

**Files:**

- Modify: `plugin/src/build-stages.ts`
- Modify: `plugin/__test__/build-stages.test.ts`

Convert the function from `async → Promise` to `→ Effect.Effect`.

- [ ] **Step 1: Change function signature**

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

Add import:

```typescript
import { FileSystem } from "@effect/platform";
```

- [ ] **Step 2: Convert function body to Effect.gen**

Wrap the body in `Effect.gen(function* () { ... })`. Convert:

- `await generator.generate(...)` → `yield* Effect.promise(() => generator.generate(...))`
- `Effect.runSync(Metric.increment(BuildMetrics.pagesGenerated))` → `yield* Metric.increment(BuildMetrics.pagesGenerated)`
- `await fs.promises.access(path).then(() => true).catch(() => false)` → `yield* fileSystem.exists(path)`
- `await fs.promises.readFile(path, "utf-8")` → `yield* fileSystem.readFileString(path).pipe(Effect.orElseSucceed(() => null as string | null))`

Add `const fileSystem = yield* FileSystem.FileSystem;` at the top of the gen.

The disk fallback logic (checking if file exists, reading it, comparing
hashes) uses `fileSystem.exists` and `fileSystem.readFileString` with
`Effect.orElseSucceed` for graceful handling of missing files.

- [ ] **Step 3: Update tests**

In `plugin/__test__/build-stages.test.ts`, update `generateSinglePage` tests
to provide `NodeFileSystem.layer` and use `Effect.runPromise`:

```typescript
import { NodeFileSystem } from "@effect/platform-node";

// BEFORE
const result = await generateSinglePage(workItems[0], ctx);

// AFTER
const result = await Effect.runPromise(
  generateSinglePage(workItems[0], ctx).pipe(
    Effect.provide(NodeFileSystem.layer),
  ),
);
```

Update all 3 `generateSinglePage` tests.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: All tests pass.

- [ ] **Step 5: Run all tests, lint, typecheck**

Run: `pnpm run test && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

- [ ] **Step 6: Commit**

```bash
git add plugin/src/build-stages.ts plugin/__test__/build-stages.test.ts
git commit -m "refactor: convert generateSinglePage to native Effect with FileSystem"
```

---

### Task 3: Convert `writeSingleFile` to Effect

**Files:**

- Modify: `plugin/src/build-stages.ts`
- Modify: `plugin/__test__/build-stages.test.ts`

- [ ] **Step 1: Change function signature**

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

- [ ] **Step 2: Convert function body**

- `await fs.promises.access(...)` → `yield* fileSystem.exists(...)`
- `await fs.promises.mkdir(...)` → `yield* fileSystem.makeDirectory(..., { recursive: true }).pipe(Effect.orDie)`
- `await fs.promises.writeFile(...)` → `yield* fileSystem.writeFileString(...).pipe(Effect.orDie)`
- `Effect.runSync(Metric.increment(...))` → `yield* Metric.increment(...)`
- `await ogResolver.resolve(...)` → `yield* Effect.promise(() => ogResolver.resolve(...))`
- `await import("./og-resolver.js")` → static import at file top
- `await import("./markdown/helpers.js")` → static import at file top

**PlatformError handling:** `fileSystem.exists` returns `boolean` (no error).
Write operations (`writeFileString`, `makeDirectory`) use `Effect.orDie` —
write failures are fatal defects (disk full, permissions), not recoverable
application errors. This keeps the error channel as `never`.

- [ ] **Step 3: Update tests**

Update `writeSingleFile` tests to provide `NodeFileSystem.layer`.

- [ ] **Step 4: Run tests, lint, typecheck, commit**

```bash
git add plugin/src/build-stages.ts plugin/__test__/build-stages.test.ts
git commit -m "refactor: convert writeSingleFile to native Effect with FileSystem"
```

---

### Task 4: Update `buildPipelineForApi` to remove `Effect.promise` wrappers

**Files:**

- Modify: `plugin/src/build-stages.ts`
- Modify: `plugin/__test__/build-stages.test.ts`

Now that `generateSinglePage` and `writeSingleFile` return `Effect.Effect`
directly, remove the `Effect.promise` wrappers in the Stream.

- [ ] **Step 1: Update Stream pipeline**

```typescript
// BEFORE
Stream.mapEffect((workItem) => Effect.promise(() => generateSinglePage(workItem, generateCtx)), {
  concurrency: input.pageConcurrency,
})

// AFTER
Stream.mapEffect((workItem) => generateSinglePage(workItem, generateCtx), {
  concurrency: input.pageConcurrency,
})
```

Same for `writeSingleFile`.

- [ ] **Step 2: Update function signature**

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

The `FileSystem.FileSystem` requirement propagates through `Stream.mapEffect`.

- [ ] **Step 3: Update tests**

Update the `Stream pipeline (native)` tests to provide `NodeFileSystem.layer`.

- [ ] **Step 4: Run tests, lint, typecheck, commit**

```bash
git add plugin/src/build-stages.ts plugin/__test__/build-stages.test.ts
git commit -m "refactor: remove Effect.promise wrappers from Stream pipeline"
```

---

## Chunk 3: Convert Post-Stream Functions

### Task 5: Convert `writeMetadata` to Effect

**Files:**

- Modify: `plugin/src/build-stages.ts`
- Modify: `plugin/__test__/build-stages.test.ts`

- [ ] **Step 1: Change function signature**

```typescript
// BEFORE
export async function writeMetadata(input: WriteMetadataInput): Promise<void>

// AFTER
export function writeMetadata(
  input: WriteMetadataInput,
): Effect.Effect<void, never, FileSystem.FileSystem>
```

- [ ] **Step 2: Convert function body**

This is a large function (~250 lines, 3 sections). Convert section by section:

**Root `_meta.json` section:**

- `await fs.promises.access(...)` → `yield* fileSystem.exists(...)`
- `await fs.promises.readFile(...)` → `yield* fileSystem.readFileString(...).pipe(Effect.orElseSucceed(() => null as string | null))`
- `await fs.promises.writeFile(...)` → `yield* fileSystem.writeFileString(...).pipe(Effect.orDie)`
- `Effect.runSync(Metric.increment(...))` → `yield* Metric.increment(...)`
- `console.log(...)` → `yield* Effect.logDebug(...)`
- `JSON.parse(...)` → `yield* Effect.try(() => JSON.parse(...)).pipe(Effect.orElseSucceed(() => null))`
- `snapshotManager.upsertSnapshot(...)` → `yield* Effect.sync(() => snapshotManager.upsertSnapshot(...))`

**PlatformError handling:** Same as `writeSingleFile` — reads use
`Effect.orElseSucceed`, writes use `Effect.orDie`. Error channel stays `never`.

**Main index page section:**

- Same patterns as above.

**Category `_meta.json` section:**

- `await Promise.all(...)` → `yield* Effect.forEach(..., { concurrency: "unbounded" })`
- `snapshotManager.batchUpsertSnapshots(...)` → `yield* Effect.sync(() => ...)`
- All other patterns same as above.

- [ ] **Step 3: Update tests**

Update `writeMetadata` tests to provide `NodeFileSystem.layer`.

- [ ] **Step 4: Run tests, lint, typecheck, commit**

```bash
git add plugin/src/build-stages.ts plugin/__test__/build-stages.test.ts
git commit -m "refactor: convert writeMetadata to native Effect with FileSystem"
```

---

### Task 6: Convert `cleanupAndCommit` to Effect

**Files:**

- Modify: `plugin/src/build-stages.ts`
- Modify: `plugin/__test__/build-stages.test.ts`

- [ ] **Step 1: Change function signature**

```typescript
// BEFORE
export async function cleanupAndCommit(input: CleanupAndCommitInput): Promise<void>

// AFTER
export function cleanupAndCommit(
  input: CleanupAndCommitInput,
): Effect.Effect<void, never, FileSystem.FileSystem>
```

- [ ] **Step 2: Convert function body**

- `snapshotManager.batchUpsertSnapshots(...)` → `yield* Effect.sync(() => ...)`
- `snapshotManager.cleanupStaleFiles(...)` → `yield* Effect.sync(() => ...)`
- `snapshotManager.deleteSnapshot(...)` → `yield* Effect.sync(() => ...)`
- `await fs.promises.unlink(path)` → `yield* fileSystem.remove(path).pipe(Effect.ignore)`
- `await fs.promises.readdir(dir, { recursive: true })` → `yield* fileSystem.readDirectory(dir, { recursive: true })`
- `await fs.promises.readdir(dir)` (empty-dir check) → `yield* fileSystem.readDirectory(dir)`
- `await fs.promises.rmdir(dir)` → `yield* fileSystem.remove(dir).pipe(Effect.ignore)`
- `await Promise.all(...)` → `yield* Effect.forEach(..., { concurrency: "unbounded" })`
- `console.log(...)` → `yield* Effect.logDebug(...)`

- [ ] **Step 3: Update tests**

Update `cleanupAndCommit` tests to provide `NodeFileSystem.layer`.

- [ ] **Step 4: Remove `import fs from "node:fs"` from build-stages.ts**

After this task, no function in `build-stages.ts` uses `fs.promises.*`
directly. Remove the `import fs from "node:fs"` line.

- [ ] **Step 5: Run tests, lint, typecheck, commit**

```bash
git add plugin/src/build-stages.ts plugin/__test__/build-stages.test.ts
git commit -m "refactor: convert cleanupAndCommit to native Effect, remove fs import"
```

---

## Chunk 4: Create `build-program.ts` and Wire Into Plugin

### Task 7: Create `build-program.ts` with `generateApiDocs` Effect

**Files:**

- Create: `plugin/src/build-program.ts`
- Create: `plugin/__test__/build-program.integration.test.ts`

Move `generateApiDocs` from `plugin/src/plugin.ts` (lines 75-214) into a new
file as a native Effect program.

- [ ] **Step 1: Write the integration test**

Create `plugin/__test__/build-program.integration.test.ts`:

```typescript
import { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateApiDocs } from "../src/build-program.js";
import { ApiModelLoader } from "../src/model-loader.js";
import { CategoryResolver } from "../src/category-resolver.js";
import { DEFAULT_CATEGORIES } from "../src/schemas/index.js";
import { SnapshotManager } from "../src/snapshot-manager.js";
import { ShikiCrossLinker } from "../src/shiki-transformer.js";
import type { ResolvedApiConfig, ResolvedBuildContext } from "../src/services/ConfigService.js";
import { createHighlighter } from "shiki";

describe("generateApiDocs (Effect program)", () => {
  it("generates docs for fixture model", async () => {
    const modelPath = path.join(
      import.meta.dirname,
      "../src/__fixtures__/example-module/example-module.api.json",
    );
    const { apiPackage } = await ApiModelLoader.loadApiModel(modelPath);
    const resolver = new CategoryResolver();
    const categories = resolver.mergeCategories(DEFAULT_CATEGORIES, undefined);

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "build-program-"));
    const dbPath = path.join(tmpDir, "test.db");
    const snapshotManager = new SnapshotManager(dbPath);
    const highlighter = await createHighlighter({
      themes: ["github-light-default", "github-dark-default"],
      langs: ["typescript"],
    });

    const apiConfig: ResolvedApiConfig & { suppressExampleErrors?: boolean } = {
      apiPackage,
      packageName: "example-module",
      outputDir: tmpDir,
      baseRoute: "/example-module",
      categories,
      suppressExampleErrors: true,
    };

    const buildContext = {
      apiConfigs: [apiConfig],
      combinedVfs: new Map(),
      highlighter,
      tsEnvCache: new Map(),
      resolvedCompilerOptions: {},
      ogResolver: null,
      snapshotManager,
      shikiCrossLinker: new ShikiCrossLinker(),
      hideCutTransformer: { name: "mock-hide-cut" },
      hideCutLinesTransformer: { name: "mock-hide-cut-lines" },
      twoslashTransformer: undefined,
      pageConcurrency: 2,
      logLevel: "info" as const,
      suppressExampleErrors: true,
    } as ResolvedBuildContext;

    const fileContextMap = new Map();

    const program = generateApiDocs(apiConfig, buildContext, fileContextMap);
    const crossLinkData = await Effect.runPromise(
      program.pipe(Effect.provide(NodeFileSystem.layer)),
    );

    expect(crossLinkData.routes.size).toBeGreaterThan(0);
    expect(fileContextMap.size).toBeGreaterThan(0);

    snapshotManager.close();
    await fs.promises.rm(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/build-program.integration.test.ts`

Expected: FAIL — `generateApiDocs` not exported from `build-program.js`.

- [ ] **Step 3: Create `build-program.ts`**

Move `generateApiDocs` from `plugin/src/plugin.ts` (lines 75-214) to
`plugin/src/build-program.ts`. Convert from `async function` to Effect:

```typescript
import { FileSystem } from "@effect/platform";
import path from "node:path";
import { Effect } from "effect";
import type { CrossLinkData } from "./build-stages.js";
import { buildPipelineForApi, cleanupAndCommit, prepareWorkItems, writeMetadata } from "./build-stages.js";
import { ApiParser } from "./loader.js";
import { markdownCrossLinker } from "./markdown/index.js";
import type { ResolvedApiConfig, ResolvedBuildContext } from "./services/ConfigService.js";
import { TwoslashManager } from "./twoslash-transformer.js";
import type { VfsConfig } from "./vfs-registry.js";
import { VfsRegistry } from "./vfs-registry.js";

export function generateApiDocs(
  apiConfig: ResolvedApiConfig & { suppressExampleErrors?: boolean },
  buildContext: ResolvedBuildContext,
  fileContextMap: Map<string, { api?: string; version?: string; file: string }>,
): Effect.Effect<CrossLinkData, never, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;

    const { apiPackage, packageName, apiName, outputDir, baseRoute,
      categories, source, packageJson, llmsPlugin, siteUrl, ogImage } = apiConfig;
    const suppressExampleErrors = apiConfig.suppressExampleErrors ?? true;

    const { snapshotManager, shikiCrossLinker, highlighter,
      hideCutTransformer, hideCutLinesTransformer, twoslashTransformer,
      ogResolver, pageConcurrency } = buildContext;

    const resolvedOutputDir = path.resolve(process.cwd(), outputDir);
    const buildTime = new Date().toISOString();

    // Load existing snapshots (sync)
    const existingSnapshots = yield* Effect.sync(() => {
      const map = new Map<string, import("./snapshot-manager.js").FileSnapshot>();
      for (const s of snapshotManager.getSnapshotsForOutputDir(resolvedOutputDir)) {
        map.set(s.filePath, s);
      }
      return map;
    });

    // Create output directory
    yield* fileSystem.makeDirectory(resolvedOutputDir, { recursive: true });

    // Prepare work items (sync, pure)
    const { workItems, crossLinkData } = prepareWorkItems({
      apiPackage, categories, baseRoute, packageName,
    });

    // Initialize cross-linkers
    markdownCrossLinker.initialize(
      ApiParser.categorizeApiItems(apiPackage, categories),
      baseRoute,
      categories,
    );
    const apiScope = baseRoute.replace(/^\//, "").split("/")[0] || packageName;
    shikiCrossLinker.reinitialize(crossLinkData.routes, crossLinkData.kinds, apiScope);
    TwoslashManager.addTypeRoutes(crossLinkData.routes);

    // Register VFS config
    if (highlighter) {
      const vfsConfig: VfsConfig = {
        vfs: new Map(),
        highlighter,
        crossLinker: shikiCrossLinker,
        packageName,
        apiScope,
      };
      if (twoslashTransformer != null) vfsConfig.twoslashTransformer = twoslashTransformer;
      if (hideCutTransformer != null) vfsConfig.hideCutTransformer = hideCutTransformer;
      if (hideCutLinesTransformer != null) vfsConfig.hideCutLinesTransformer = hideCutLinesTransformer;
      if (apiConfig.theme != null) vfsConfig.theme = apiConfig.theme;
      VfsRegistry.register(apiScope, vfsConfig);
    }

    // Stream pipeline
    yield* Effect.logInfo(`Generating ${workItems.length} pages across ${Object.keys(categories).length} categories`);

    const fileResults = yield* buildPipelineForApi({
      workItems, baseRoute, packageName, apiScope,
      ...(apiName != null ? { apiName } : {}),
      ...(source != null ? { source } : {}),
      buildTime, resolvedOutputDir, pageConcurrency, existingSnapshots,
      ...(suppressExampleErrors != null ? { suppressExampleErrors } : {}),
      ...(llmsPlugin != null ? { llmsPlugin } : {}),
      ...(ogResolver !== undefined ? { ogResolver } : {}),
      ...(siteUrl != null ? { siteUrl } : {}),
      ...(ogImage != null ? { ogImage } : {}),
    });

    // Track files + context
    const generatedFiles = new Set<string>();
    for (const r of fileResults) {
      generatedFiles.add(r.relativePathWithExt);
      const ctx: { api?: string; version?: string; file: string } = {
        file: r.relativePathWithExt,
      };
      if (apiName != null) ctx.api = apiName;
      if (packageJson?.version != null) ctx.version = packageJson.version;
      fileContextMap.set(r.absolutePath, ctx);
    }

    // Write metadata
    yield* writeMetadata({
      fileResults, categories, resolvedOutputDir, snapshotManager,
      existingSnapshots, buildTime, baseRoute, packageName,
      ...(apiName != null ? { apiName } : {}),
      generatedFiles,
    });

    // Cleanup
    yield* cleanupAndCommit({
      fileResults, snapshotManager, resolvedOutputDir, generatedFiles,
    });

    const changedCount = fileResults.filter(r => r.status !== "unchanged").length;
    yield* Effect.logInfo(`Generated ${changedCount} API documentation files for ${packageName}`);

    return crossLinkData;
  });
}
```

- [ ] **Step 4: Run test**

Run: `pnpm vitest run plugin/__test__/build-program.integration.test.ts`

Expected: PASS.

- [ ] **Step 5: Run all tests, lint, typecheck**

Run: `pnpm run test && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

- [ ] **Step 6: Commit**

```bash
git add plugin/src/build-program.ts plugin/__test__/build-program.integration.test.ts
git commit -m "feat: create build-program.ts with generateApiDocs as Effect program"
```

---

### Task 8: Wire `build-program.ts` into `plugin.ts`

**Files:**

- Modify: `plugin/src/plugin.ts`

- [ ] **Step 1: Replace `generateApiDocs` with import from `build-program.js`**

Remove the `generateApiDocs` function definition (lines 75-214) from
`plugin/src/plugin.ts`. Add import:

```typescript
import { generateApiDocs } from "./build-program.js";
```

- [ ] **Step 2: Remove dead imports**

After removing `generateApiDocs`, these imports become unused:

- `buildPipelineForApi`, `cleanupAndCommit`, `prepareWorkItems`, `writeMetadata` from `"./build-stages.js"`
- `type CrossLinkData` from `"./build-stages.js"`
- `ApiParser` from `"./loader.js"`
- `markdownCrossLinker` from `"./markdown/index.js"`
- `type VfsConfig` from `"./vfs-registry.js"` (moved to build-program.ts)

**Keep (still used in plugin.ts):**

- `VfsRegistry` — used in `beforeBuild` (`VfsRegistry.clear()`)
- `TwoslashManager` — used in `config()` hook
- `ShikiCrossLinker` — created at factory scope

**Also remove:**

- `import fs from "node:fs"` — no longer used after `generateApiDocs` moves out
  (fs.mkdirSync in config hook uses the sync `fs` module — **CHECK** if this
  import is still needed. If `config()` uses `fs.mkdirSync`, keep it.)

Remove only the truly unused imports. Run lint to catch any missed.

- [ ] **Step 3: Run all tests**

Run: `pnpm run test`

Expected: All tests pass. Same behavior, different file location.

- [ ] **Step 4: Lint, typecheck, commit**

```bash
git add plugin/src/plugin.ts
git commit -m "refactor: move generateApiDocs to build-program.ts, shrink plugin.ts"
```

---

## Chunk 5: Verification

### Task 9: Full regression verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `pnpm run test`

Expected: All tests pass.

- [ ] **Step 2: Run typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

Expected: No type errors.

- [ ] **Step 3: Run lint**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint`

Expected: No lint errors.

- [ ] **Step 4: Verify no `Effect.runSync(Metric` in build-stages.ts**

```bash
grep "Effect.runSync" plugin/src/build-stages.ts && echo "FAIL" || echo "OK: no Effect.runSync"
```

Expected: No matches.

- [ ] **Step 5: Verify no `import fs from "node:fs"` in build-stages.ts**

```bash
grep "import fs from" plugin/src/build-stages.ts && echo "FAIL" || echo "OK: no fs import"
```

Expected: No matches.

- [ ] **Step 6: Verify `build-program.ts` exists**

```bash
ls plugin/src/build-program.ts && echo "OK"
```

- [ ] **Step 7: Verify `generateApiDocs` is NOT in plugin.ts**

```bash
grep "function generateApiDocs" plugin/src/plugin.ts && echo "FAIL" || echo "OK: moved to build-program.ts"
```

- [ ] **Step 8: Verify plugin.ts line count**

```bash
wc -l plugin/src/plugin.ts
```

Expected: ~300 lines (down from 455 — `generateApiDocs` function removed).

- [ ] **Step 9: Verify FileSystem usage in build-stages.ts**

```bash
grep "FileSystem.FileSystem" plugin/src/build-stages.ts | head -5
```

Expected: Multiple matches (each function's Effect type includes it).
