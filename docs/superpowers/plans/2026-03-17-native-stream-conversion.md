# Native Stream Conversion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development
> (if subagents available) or superpowers:executing-plans to implement this plan.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `buildPipelineForApi` from a `parallelLimit` wrapper to a true
Effect Stream pipeline where each work item flows through generate → write →
fold individually, then delete `utils.ts`.

**Architecture:** Extract the per-item callbacks from `generatePages()` and
`writeFiles()` into standalone `generateSinglePage()` and `writeSingleFile()`
functions. Rewrite `buildPipelineForApi()` as a `Stream.fromIterable` →
`Stream.mapEffect` pipeline. Migrate `plugin.ts:generateApiDocs` to call
`buildPipelineForApi` instead of `generatePages`/`writeFiles` directly. Then
remove the old batch functions and delete `parallelLimit`/`utils.ts`.

**Spec deviation:** The spec's Phase B shows `Stream.filter(result =>
!result.isUnchanged)` but this plan intentionally does NOT filter unchanged
files. Unchanged files must flow through the entire pipeline to appear in
the fold output — they are needed for `generatedFiles` (stale cleanup),
`fileContextMap` (remark error attribution), and `_meta.json` navigation.
The write stage is a no-op for unchanged files instead.

**Tech Stack:** Effect (Stream, Effect, Metric), Vitest, Biome

**Spec:** Follows from `docs/superpowers/specs/2026-03-17-stream-pipeline-design.md`
(Phase B pipeline shape)

---

## File Structure

### Modified files

| File | Change |
| ---- | ------ |
| `plugin/src/build-stages.ts` | Extract `generateSinglePage()` and `writeSingleFile()` from callback bodies. Rewrite `buildPipelineForApi()` as true Stream. Remove `generatePages()` and `writeFiles()` after migration. Remove `parallelLimit` import. |
| `plugin/src/plugin.ts` | Migrate `generateApiDocs` to call `buildPipelineForApi` instead of `generatePages`/`writeFiles` directly. Remove those imports. |
| `plugin/__test__/build-stages.test.ts` | Replace `generatePages`/`writeFiles` unit tests with `generateSinglePage`/`writeSingleFile` tests. Update Stream integration test. |

### Deleted files

| File | Reason |
| ---- | ------ |
| `plugin/src/utils.ts` | Last `parallelLimit` consumer removed |
| `plugin/src/utils.test.ts` | Tests for deleted `parallelLimit` |

---

## Chunk 1: Extract per-item functions

### Task 1: Extract `generateSinglePage()`

**Files:**

- Modify: `plugin/src/build-stages.ts`
- Test: `plugin/__test__/build-stages.test.ts`

Extract the callback body from `generatePages()` (lines 278-519 in
`build-stages.ts`) into a standalone exported async function. This is the
per-item logic: create page generator, call `.generate()`, parse frontmatter,
hash content, resolve timestamps from snapshot.

- [ ] **Step 1: Write the test**

Add to `plugin/__test__/build-stages.test.ts`:

```typescript
import { generateSinglePage, prepareWorkItems, type GenerateSinglePageContext } from "../src/build-stages.js";

describe("generateSinglePage", () => {
  it("generates a page result with valid hashes", async () => {
    const modelPath = path.join(
      import.meta.dirname,
      "../src/__fixtures__/example-module/example-module.api.json",
    );
    const { apiPackage } = await ApiModelLoader.loadApiModel(modelPath);
    const resolver = new CategoryResolver();
    const categories = resolver.mergeCategories(DEFAULT_CATEGORIES, undefined);
    const { workItems } = prepareWorkItems({
      apiPackage, categories,
      baseRoute: "/example-module", packageName: "example-module",
    });

    const ctx: GenerateSinglePageContext = {
      existingSnapshots: new Map(),
      baseRoute: "/example-module",
      packageName: "example-module",
      apiScope: "example-module",
      buildTime: new Date().toISOString(),
      resolvedOutputDir: "/tmp/nonexistent-dir",
    };

    const result = await generateSinglePage(workItems[0], ctx);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.frontmatterHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.relativePathWithExt).toMatch(/\.mdx$/);
    expect(result.bodyContent.length).toBeGreaterThan(0);
  });

  it("returns null for unsupported item kinds", async () => {
    const fakeItem = { displayName: "Test", kind: 999 } as any;
    const workItem = {
      item: fakeItem,
      categoryKey: "classes",
      categoryConfig: { folderName: "class", displayName: "Classes", singularName: "Class" } as any,
    };

    const ctx: GenerateSinglePageContext = {
      existingSnapshots: new Map(),
      baseRoute: "/test",
      packageName: "test",
      apiScope: "test",
      buildTime: new Date().toISOString(),
      resolvedOutputDir: "/tmp/nonexistent-dir",
    };

    const result = await generateSinglePage(workItem, ctx);
    expect(result).toBeNull();
  });

  it("marks unchanged when snapshot hashes match", async () => {
    const modelPath = path.join(
      import.meta.dirname,
      "../src/__fixtures__/example-module/example-module.api.json",
    );
    const { apiPackage } = await ApiModelLoader.loadApiModel(modelPath);
    const resolver = new CategoryResolver();
    const categories = resolver.mergeCategories(DEFAULT_CATEGORIES, undefined);
    const { workItems } = prepareWorkItems({
      apiPackage, categories,
      baseRoute: "/example-module", packageName: "example-module",
    });

    const buildTime = new Date().toISOString();
    const ctx: GenerateSinglePageContext = {
      existingSnapshots: new Map(),
      baseRoute: "/example-module",
      packageName: "example-module",
      apiScope: "example-module",
      buildTime,
      resolvedOutputDir: "/tmp/nonexistent-dir",
    };

    // First pass
    const first = await generateSinglePage(workItems[0], ctx);
    if (!first) throw new Error("Expected result");

    // Build snapshot with matching hashes
    const snapshots = new Map();
    snapshots.set(first.relativePathWithExt, {
      outputDir: "/tmp/nonexistent-dir",
      filePath: first.relativePathWithExt,
      publishedTime: "2025-01-01T00:00:00.000Z",
      modifiedTime: "2025-01-01T00:00:00.000Z",
      contentHash: first.contentHash,
      frontmatterHash: first.frontmatterHash,
      buildTime,
    });

    // Second pass with snapshot
    const second = await generateSinglePage(workItems[0], {
      ...ctx,
      existingSnapshots: snapshots,
    });
    expect(second).not.toBeNull();
    expect(second!.isUnchanged).toBe(true);
    expect(second!.publishedTime).toBe("2025-01-01T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: FAIL — `generateSinglePage` is not exported.

- [ ] **Step 3: Implement `generateSinglePage()`**

Extract the callback body from `generatePages()` (lines 278-519) into:

```typescript
/**
 * Shared context for generateSinglePage — fields that are the same
 * for every item in a single API build.
 */
export interface GenerateSinglePageContext {
  readonly existingSnapshots: Map<string, import("./snapshot-manager.js").FileSnapshot>;
  readonly baseRoute: string;
  readonly packageName: string;
  readonly apiScope: string;
  readonly apiName?: string;
  readonly source?: import("./types.js").SourceConfig;
  readonly buildTime: string;
  readonly resolvedOutputDir: string;
  readonly suppressExampleErrors?: boolean;
  readonly llmsPlugin?: import("./types.js").LlmsPluginOptions;
}

/**
 * Generate a single page from a work item. Returns null for unsupported kinds.
 */
export async function generateSinglePage(
  workItem: WorkItem,
  ctx: GenerateSinglePageContext,
): Promise<GeneratedPageResult | null> {
  // ... move the callback body here verbatim
}
```

The function body is the exact callback from `parallelLimit` in `generatePages`
(lines 278-519), with `input.*` references replaced by `ctx.*`.

- [ ] **Step 4: Update `generatePages()` to call `generateSinglePage()`**

Replace the `parallelLimit` callback body with a call to `generateSinglePage`:

```typescript
export async function generatePages(input: GeneratePagesInput): Promise<(GeneratedPageResult | null)[]> {
  const { workItems, pageConcurrency, ...ctx } = input;
  return parallelLimit(
    workItems as WorkItem[],
    pageConcurrency,
    (workItem) => generateSinglePage(workItem, ctx),
  );
}
```

This keeps `generatePages()` working identically for any callers but delegates
to the new function.

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: All tests pass (old `generatePages` tests + new `generateSinglePage` tests).

- [ ] **Step 6: Run all tests**

Run: `pnpm run test`

Expected: All 660 tests pass. This is a pure refactor.

- [ ] **Step 7: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

- [ ] **Step 8: Commit**

```bash
git add plugin/src/build-stages.ts plugin/__test__/build-stages.test.ts
git commit -m "refactor: extract generateSinglePage from generatePages callback"
```

---

### Task 2: Extract `writeSingleFile()`

**Files:**

- Modify: `plugin/src/build-stages.ts`
- Test: `plugin/__test__/build-stages.test.ts`

Extract the callback body from `writeFiles()` (lines 555-664 in
`build-stages.ts`) into a standalone exported async function.

- [ ] **Step 1: Write the test**

Add to `plugin/__test__/build-stages.test.ts`:

```typescript
import { writeSingleFile, type WriteSingleFileContext } from "../src/build-stages.js";

describe("writeSingleFile", () => {
  it("writes a changed file to disk and returns status new", async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "write-single-"));

    const page: GeneratedPageResult = {
      workItem: { item: { displayName: "Foo" } as any, categoryKey: "classes", categoryConfig: { folderName: "class", displayName: "Classes", singularName: "Class" } as any },
      content: "---\ntitle: Foo\n---\n# Foo\n",
      bodyContent: "# Foo\n",
      frontmatter: { title: "Foo" },
      contentHash: "abc123",
      frontmatterHash: "def456",
      routePath: "/example-module/class/foo",
      relativePathWithExt: "class/foo.mdx",
      publishedTime: "2025-01-01T00:00:00.000Z",
      modifiedTime: "2025-01-01T00:00:00.000Z",
      isUnchanged: false,
    };

    const ctx: WriteSingleFileContext = {
      resolvedOutputDir: tmpDir,
      buildTime: new Date().toISOString(),
    };

    const result = await writeSingleFile(page, ctx);
    expect(result.status).toBe("new");
    expect(result.snapshot.contentHash).toBe("abc123");
    expect(result.snapshot.frontmatterHash).toBe("def456");
    expect(result.snapshot.filePath).toBe("class/foo.mdx");
    expect(result.label).toBe("Foo");
    expect(result.categoryKey).toBe("classes");

    const exists = await fs.promises.access(result.absolutePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    await fs.promises.rm(tmpDir, { recursive: true });
  });

  it("skips write for unchanged files", async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "write-single-"));

    const page: GeneratedPageResult = {
      workItem: { item: { displayName: "Bar" } as any, categoryKey: "classes", categoryConfig: { folderName: "class", displayName: "Classes", singularName: "Class" } as any },
      content: "---\ntitle: Bar\n---\n# Bar\n",
      bodyContent: "# Bar\n",
      frontmatter: { title: "Bar" },
      contentHash: "abc",
      frontmatterHash: "def",
      routePath: "/example-module/class/bar",
      relativePathWithExt: "class/bar.mdx",
      publishedTime: "2025-01-01T00:00:00.000Z",
      modifiedTime: "2025-01-01T00:00:00.000Z",
      isUnchanged: true,
    };

    const ctx: WriteSingleFileContext = {
      resolvedOutputDir: tmpDir,
      buildTime: new Date().toISOString(),
    };

    const result = await writeSingleFile(page, ctx);
    expect(result.status).toBe("unchanged");

    // File should NOT exist on disk
    const exists = await fs.promises.access(result.absolutePath).then(() => true).catch(() => false);
    expect(exists).toBe(false);

    await fs.promises.rm(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: FAIL — `writeSingleFile` is not exported.

- [ ] **Step 3: Implement `writeSingleFile()`**

Extract the callback body from `writeFiles()` (lines 555-664) into:

```typescript
/**
 * Shared context for writeSingleFile — fields that are the same
 * for every item in a single API build.
 */
export interface WriteSingleFileContext {
  readonly resolvedOutputDir: string;
  readonly buildTime: string;
  readonly ogResolver?: import("./og-resolver.js").OpenGraphResolver | null;
  readonly siteUrl?: string;
  readonly ogImage?: import("./types.js").OpenGraphImageConfig;
  readonly packageName?: string;
  readonly apiName?: string;
}

/**
 * Write a single generated page to disk. No-op for unchanged pages.
 */
export async function writeSingleFile(
  result: GeneratedPageResult,
  ctx: WriteSingleFileContext,
): Promise<FileWriteResult> {
  // ... move the callback body here verbatim
}
```

- [ ] **Step 4: Update `writeFiles()` to call `writeSingleFile()`**

```typescript
export async function writeFiles(input: WriteFilesInput): Promise<FileWriteResult[]> {
  const { pages, resolvedOutputDir, buildTime, pageConcurrency,
    ogResolver, siteUrl, ogImage, packageName, apiName } = input;
  const validPages = pages.filter((p): p is GeneratedPageResult => p !== null);
  const ctx: WriteSingleFileContext = { resolvedOutputDir, buildTime, ogResolver, siteUrl, ogImage, packageName, apiName };
  return parallelLimit(validPages, pageConcurrency, (page) => writeSingleFile(page, ctx));
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: All tests pass (old + new).

- [ ] **Step 6: Run all tests**

Run: `pnpm run test`

Expected: All 660 tests pass.

- [ ] **Step 7: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

- [ ] **Step 8: Commit**

```bash
git add plugin/src/build-stages.ts plugin/__test__/build-stages.test.ts
git commit -m "refactor: extract writeSingleFile from writeFiles callback"
```

---

## Chunk 2: Rewrite `buildPipelineForApi` as true Stream

### Task 3: Rewrite `buildPipelineForApi()` using Stream

**Files:**

- Modify: `plugin/src/build-stages.ts`
- Test: `plugin/__test__/build-stages.test.ts`

Replace the `Effect.promise` wrapper with a real `Stream.fromIterable` →
`Stream.mapEffect` → `Stream.runFold` pipeline.

- [ ] **Step 1: Write the test**

Add to `plugin/__test__/build-stages.test.ts`:

```typescript
describe("Stream pipeline (native)", () => {
  it("streams items through generate → write → fold", async () => {
    const modelPath = path.join(
      import.meta.dirname,
      "../src/__fixtures__/example-module/example-module.api.json",
    );
    const { apiPackage } = await ApiModelLoader.loadApiModel(modelPath);
    const resolver = new CategoryResolver();
    const categories = resolver.mergeCategories(DEFAULT_CATEGORIES, undefined);
    const { workItems } = prepareWorkItems({
      apiPackage, categories,
      baseRoute: "/example-module", packageName: "example-module",
    });

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "native-stream-"));

    const program = buildPipelineForApi({
      workItems,
      baseRoute: "/example-module",
      packageName: "example-module",
      apiScope: "example-module",
      buildTime: new Date().toISOString(),
      resolvedOutputDir: tmpDir,
      pageConcurrency: 2,
      existingSnapshots: new Map(),
    });

    const results = await Effect.runPromise(program);

    // All items processed
    expect(results.length).toBe(workItems.length);

    // All files are new on first run
    const written = results.filter(r => r.status !== "unchanged");
    expect(written.length).toBeGreaterThan(0);

    // Unchanged count is zero
    const unchanged = results.filter(r => r.status === "unchanged");
    expect(unchanged.length).toBe(0);

    // Files exist on disk
    for (const r of written) {
      const exists = await fs.promises.access(r.absolutePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    }

    await fs.promises.rm(tmpDir, { recursive: true });
  });

  it("includes unchanged files in results when snapshots match", async () => {
    const modelPath = path.join(
      import.meta.dirname,
      "../src/__fixtures__/example-module/example-module.api.json",
    );
    const { apiPackage } = await ApiModelLoader.loadApiModel(modelPath);
    const resolver = new CategoryResolver();
    const categories = resolver.mergeCategories(DEFAULT_CATEGORIES, undefined);
    const { workItems } = prepareWorkItems({
      apiPackage, categories,
      baseRoute: "/example-module", packageName: "example-module",
    });

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "native-stream-2-"));
    const buildTime = new Date().toISOString();

    // First run: all new
    const firstResults = await Effect.runPromise(buildPipelineForApi({
      workItems,
      baseRoute: "/example-module",
      packageName: "example-module",
      apiScope: "example-module",
      buildTime,
      resolvedOutputDir: tmpDir,
      pageConcurrency: 2,
      existingSnapshots: new Map(),
    }));

    // Build snapshot map from first results
    const snapshots = new Map();
    for (const r of firstResults) {
      snapshots.set(r.snapshot.filePath, r.snapshot);
    }

    // Second run: all unchanged (snapshots match)
    const secondResults = await Effect.runPromise(buildPipelineForApi({
      workItems,
      baseRoute: "/example-module",
      packageName: "example-module",
      apiScope: "example-module",
      buildTime,
      resolvedOutputDir: tmpDir,
      pageConcurrency: 2,
      existingSnapshots: snapshots,
    }));

    // ALL items must still appear in results (not filtered out)
    expect(secondResults.length).toBe(workItems.length);

    // All should be unchanged
    const unchanged = secondResults.filter(r => r.status === "unchanged");
    expect(unchanged.length).toBe(workItems.length);

    await fs.promises.rm(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to see current behavior**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: The existing Stream test passes (it uses the old `Effect.promise`
wrapper). The new tests should also pass once implemented.

- [ ] **Step 3: Rewrite `buildPipelineForApi()`**

Replace the `Effect.promise` implementation (and remove the `void Stream;`
placeholder line) with:

```typescript
export function buildPipelineForApi(input: BuildPipelineInput): Effect.Effect<FileWriteResult[]> {
  const generateCtx: GenerateSinglePageContext = {
    existingSnapshots: input.existingSnapshots,
    baseRoute: input.baseRoute,
    packageName: input.packageName,
    apiScope: input.apiScope,
    apiName: input.apiName,
    source: input.source,
    buildTime: input.buildTime,
    resolvedOutputDir: input.resolvedOutputDir,
    suppressExampleErrors: input.suppressExampleErrors,
    llmsPlugin: input.llmsPlugin,
  };

  const writeCtx: WriteSingleFileContext = {
    resolvedOutputDir: input.resolvedOutputDir,
    buildTime: input.buildTime,
    ogResolver: input.ogResolver,
    siteUrl: input.siteUrl,
    ogImage: input.ogImage,
    packageName: input.packageName,
    apiName: input.apiName,
  };

  return Stream.fromIterable(input.workItems).pipe(
    // Stage 1: Generate page content + hashes + timestamps
    Stream.mapEffect(
      (workItem) => Effect.promise(() => generateSinglePage(workItem, generateCtx)),
      { concurrency: input.pageConcurrency },
    ),
    // Filter nulls (unsupported item kinds only)
    Stream.filter((result): result is GeneratedPageResult => result !== null),
    // Stage 2: Write file to disk (no-op for unchanged)
    Stream.mapEffect(
      (result) => Effect.promise(() => writeSingleFile(result, writeCtx)),
      { concurrency: input.pageConcurrency },
    ),
    // Fold: accumulate ALL results
    Stream.runFold([] as FileWriteResult[], (acc, result) => [...acc, result]),
  );
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: All tests pass, including new native stream tests.

- [ ] **Step 5: Run all tests**

Run: `pnpm run test`

Expected: All 660 tests pass.

- [ ] **Step 6: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

- [ ] **Step 7: Commit**

```bash
git add plugin/src/build-stages.ts plugin/__test__/build-stages.test.ts
git commit -m "feat: rewrite buildPipelineForApi as native Effect Stream"
```

---

## Chunk 3: Migrate `plugin.ts` to `buildPipelineForApi`

### Task 4: Replace `generatePages`/`writeFiles` calls in `generateApiDocs`

**Files:**

- Modify: `plugin/src/plugin.ts`

`plugin/src/plugin.ts:generateApiDocs` (lines 211-239) calls `generatePages()`
and `writeFiles()` directly. Before we can delete those batch functions, we must
migrate `generateApiDocs` to use `buildPipelineForApi` instead.

- [ ] **Step 1: Replace `generatePages` + `writeFiles` calls with `buildPipelineForApi`**

In `plugin/src/plugin.ts`, replace lines 207-225 (the `generatePages` and
`writeFiles` calls) with a single call to `buildPipelineForApi` run via
`Effect.runPromise`:

```typescript
import { buildPipelineForApi } from "./build-stages.js";

// Phase 2+3: Generate pages and write files via Stream pipeline
console.log(
  `📝 Generating ${workItems.length} pages across ${Object.keys(categories).length} categories in parallel`,
);
const fileResults = await Effect.runPromise(
  buildPipelineForApi({
    workItems,
    baseRoute,
    packageName,
    apiScope,
    apiName,
    source,
    buildTime,
    resolvedOutputDir,
    pageConcurrency,
    existingSnapshots,
    suppressExampleErrors,
    llmsPlugin,
    ogResolver,
    siteUrl,
    ogImage,
  }),
);
console.log(`✅ Generated ${fileResults.filter(r => r.status !== "unchanged").length} files`);
```

Remove `generatePages` and `writeFiles` from the import statement.

- [ ] **Step 2: Run all tests**

Run: `pnpm run test`

Expected: All 660 tests pass. `generateApiDocs` now uses the Stream pipeline.

- [ ] **Step 3: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

- [ ] **Step 4: Verify `generatePages`/`writeFiles` are no longer imported in `plugin.ts`**

```bash
grep -n "generatePages\|writeFiles" plugin/src/plugin.ts
```

Expected: No matches.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/plugin.ts
git commit -m "refactor: migrate generateApiDocs to use buildPipelineForApi"
```

---

## Chunk 4: Remove batch functions, `parallelLimit`, and `utils.ts`

### Task 5: Remove batch functions and delete `utils.ts`

**Files:**

- Modify: `plugin/src/build-stages.ts`
- Modify: `plugin/__test__/build-stages.test.ts`
- Delete: `plugin/src/utils.ts`
- Delete: `plugin/src/utils.test.ts`

Now that `plugin.ts` uses `buildPipelineForApi` (Task 4) and the Stream
pipeline uses `generateSinglePage`/`writeSingleFile` directly (Task 3), the
old batch wrappers (`generatePages`, `writeFiles`) and `parallelLimit` are no
longer needed.

- [ ] **Step 1: Verify no external callers of `generatePages` or `writeFiles`**

Run:

```bash
grep -rn "generatePages\|writeFiles" plugin/src/ --include="*.ts" | grep -v build-stages | grep -v "__test__" | grep -v "\.test\."
```

Expected: No matches. `plugin.ts` was migrated in Task 4, so only
`build-stages.ts` and tests reference these functions now.

Note: `plugin/src/services/PageGeneratorService.ts` has a `generatePages`
property name in its Effect service interface — this is a different function
and is a false positive in the grep. Ignore it.

- [ ] **Step 2: Remove `generatePages` and `writeFiles` from `build-stages.ts`**

Delete the `generatePages` function, `GeneratePagesInput` interface,
`writeFiles` function, and `WriteFilesInput` interface from
`plugin/src/build-stages.ts`.

Remove the `import { parallelLimit } from "./utils.js"` line.

- [ ] **Step 3: Update tests — remove old `generatePages`/`writeFiles` tests**

In `plugin/__test__/build-stages.test.ts`:

- Remove the `describe("generatePages", ...)` block (replaced by
  `describe("generateSinglePage", ...)`)
- Remove the `describe("writeFiles", ...)` block (replaced by
  `describe("writeSingleFile", ...)`)
- Remove imports of `generatePages` and `writeFiles`
- The old `describe("Stream pipeline", ...)` test can be removed too (replaced
  by `describe("Stream pipeline (native)", ...)`)

- [ ] **Step 4: Delete `utils.ts` and `utils.test.ts`**

```bash
git rm plugin/src/utils.ts plugin/src/utils.test.ts
```

- [ ] **Step 5: Run all tests**

Run: `pnpm run test`

Expected: Test count decreases (removed `utils.test.ts` tests and old batch
function tests), but all remaining tests pass.

- [ ] **Step 6: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

Expected: No errors. No dead imports.

- [ ] **Step 7: Verify `utils.ts` is deleted**

```bash
ls plugin/src/utils.ts 2>/dev/null && echo "FAIL" || echo "OK: deleted"
```

- [ ] **Step 8: Commit**

```bash
git add plugin/src/build-stages.ts plugin/__test__/build-stages.test.ts
git rm plugin/src/utils.ts plugin/src/utils.test.ts
git commit -m "refactor: remove batch wrappers and delete utils.ts"
```

---

## Chunk 5: Verification

### Task 6: Full regression verification

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

- [ ] **Step 4: Verify `utils.ts` is gone**

```bash
ls plugin/src/utils.ts 2>/dev/null && echo "FAIL" || echo "OK: deleted"
```

- [ ] **Step 5: Verify no `parallelLimit` references remain**

```bash
grep -rn "parallelLimit" plugin/src/ --include="*.ts" && echo "FAIL" || echo "OK: no references"
```

- [ ] **Step 6: Verify Stream is used in `buildPipelineForApi`**

```bash
grep "Stream.fromIterable\|Stream.mapEffect\|Stream.runFold" plugin/src/build-stages.ts
```

Expected: All three Stream operations present.
