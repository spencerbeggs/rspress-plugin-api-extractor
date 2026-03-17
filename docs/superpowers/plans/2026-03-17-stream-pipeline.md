# Stream Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development
> (if subagents available) or superpowers:executing-plans to implement this plan.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the 920-line `generateApiDocs` function into 5 testable
functions in `build-stages.ts`, fix cross-linker race conditions in multi-API
mode, then convert orchestration to an Effect Stream pipeline.

**Architecture:** Two phases. Phase A extracts functions and fixes cross-linker
bugs (pure refactor — no behavior change). Phase B converts the thin
orchestrator to an Effect Stream with bounded concurrency, backpressure, and
fiber-scoped log annotations. `parallelLimit` from `utils.ts` is eliminated.

**Tech Stack:** Effect (Stream, Effect, Metric, Layer), Vitest, Biome,
gray-matter, @microsoft/api-extractor-model

**Spec:** `docs/superpowers/specs/2026-03-17-stream-pipeline-design.md`

---

## File Structure

### New files

| File | Responsibility |
| ---- | -------------- |
| `plugin/src/build-stages.ts` | 5 extracted functions + data types (`WorkItem`, `GeneratedPageResult`, `FileWriteResult`) |
| `plugin/__test__/build-stages.test.ts` | Unit tests for the 5 extracted functions and Stream pipeline integration |

### Modified files

| File | Change |
| ---- | ------ |
| `plugin/src/plugin.ts` | `generateApiDocs` replaced by thin orchestrator (~100 lines). Multi-API loop uses 3-phase cross-linker fix. Phase B: Stream pipeline via `effectRuntime.runPromise`. |
| `plugin/src/markdown/cross-linker.ts` | `initialize()` becomes `addRoutes()` — accumulates instead of clearing. New `clear()` method for build reset. |
| `plugin/src/shiki-transformer.ts` | No changes needed — `ShikiCrossLinker` already stores routes per-scope via `reinitialize()`. Noted here for clarity. |

### Deleted files

| File | Reason |
| ---- | ------ |
| `plugin/src/utils.ts` | Last `parallelLimit` consumer removed in Phase B |

---

## Chunk 1: Data Types and `prepareWorkItems()` (Phase A)

### Task 1: Create data types in `build-stages.ts`

**Files:**

- Create: `plugin/src/build-stages.ts`
- Test: `plugin/__test__/build-stages.test.ts`

- [ ] **Step 1: Write the test for data type imports**

Create `plugin/__test__/build-stages.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type {
  FileWriteResult,
  GeneratedPageResult,
  WorkItem,
} from "../src/build-stages.js";

describe("build-stages types", () => {
  it("WorkItem has required fields", () => {
    const item = {} as WorkItem;
    // TypeScript compile check - these fields must exist
    void item.item;
    void item.categoryKey;
    void item.categoryConfig;
    void item.namespaceMember;
    expect(true).toBe(true);
  });

  it("GeneratedPageResult has required fields", () => {
    const result = {} as GeneratedPageResult;
    void result.workItem;
    void result.content;
    void result.bodyContent;
    void result.frontmatter;
    void result.contentHash;
    void result.frontmatterHash;
    void result.routePath;
    void result.relativePathWithExt;
    void result.publishedTime;
    void result.modifiedTime;
    void result.isUnchanged;
    expect(true).toBe(true);
  });

  it("FileWriteResult has required fields", () => {
    const result = {} as FileWriteResult;
    void result.relativePathWithExt;
    void result.absolutePath;
    void result.status;
    void result.snapshot;
    void result.categoryKey;
    void result.label;
    void result.routePath;
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: FAIL — cannot resolve `../src/build-stages.js`.

- [ ] **Step 3: Create `build-stages.ts` with types**

Create `plugin/src/build-stages.ts`:

```typescript
import type { ApiItem } from "@microsoft/api-extractor-model";
import type { NamespaceMember } from "./loader.js";
import type { CategoryConfig, SourceConfig } from "./types.js";

/**
 * A single item to process through the generation pipeline.
 * Flattened from categories + namespace members.
 */
export interface WorkItem {
  readonly item: ApiItem;
  readonly categoryKey: string;
  readonly categoryConfig: CategoryConfig;
  readonly namespaceMember?: NamespaceMember;
}

/**
 * Result of generating a single page (before file write decision).
 */
export interface GeneratedPageResult {
  readonly workItem: WorkItem;
  readonly content: string;
  readonly bodyContent: string;
  readonly frontmatter: Record<string, unknown>;
  readonly contentHash: string;
  readonly frontmatterHash: string;
  readonly routePath: string;
  readonly relativePathWithExt: string;
  readonly publishedTime: string;
  readonly modifiedTime: string;
  readonly isUnchanged: boolean;
}

/**
 * Cross-link data collected during work item preparation.
 */
export interface CrossLinkData {
  readonly routes: Map<string, string>;
  readonly kinds: Map<string, string>;
}

/**
 * Snapshot data for batch upsert.
 */
export interface FileSnapshot {
  readonly outputDir: string;
  readonly filePath: string;
  readonly publishedTime: string;
  readonly modifiedTime: string;
  readonly contentHash: string;
  readonly frontmatterHash: string;
  readonly buildTime: string;
}

/**
 * Result of a file write decision.
 */
export interface FileWriteResult {
  readonly relativePathWithExt: string;
  readonly absolutePath: string;
  readonly status: "new" | "modified" | "unchanged";
  readonly snapshot: FileSnapshot;
  readonly categoryKey: string;
  readonly label: string;
  readonly routePath: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: PASS — all 3 type tests pass.

- [ ] **Step 5: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add plugin/src/build-stages.ts plugin/__test__/build-stages.test.ts
git commit -m "feat: add data types for build-stages extraction"
```

---

### Task 2: Extract `prepareWorkItems()`

**Files:**

- Modify: `plugin/src/build-stages.ts`
- Test: `plugin/__test__/build-stages.test.ts`

This function extracts the logic at `plugin/src/plugin.ts:264-304` —
categorizing API items, extracting namespace members, building cross-link data,
and flattening into a `WorkItem[]`.

- [ ] **Step 1: Write the test**

Add to `plugin/__test__/build-stages.test.ts`:

```typescript
import { ApiModelLoader } from "../src/model-loader.js";
import { CategoryResolver } from "../src/category-resolver.js";
import { DEFAULT_CATEGORIES } from "../src/types.js";
import { prepareWorkItems } from "../src/build-stages.js";
import path from "node:path";

describe("prepareWorkItems", () => {
  it("returns work items and cross-link data from fixture API model", async () => {
    const modelPath = path.join(
      import.meta.dirname,
      "../src/__fixtures__/example-module/example-module.api.json",
    );
    const { apiPackage } = await ApiModelLoader.loadApiModel(modelPath);
    const resolver = new CategoryResolver();
    const categories = resolver.mergeCategories(DEFAULT_CATEGORIES, undefined);

    const result = prepareWorkItems({
      apiPackage,
      categories,
      baseRoute: "/example-module",
      packageName: "example-module",
    });

    // Should have work items for all categorized items
    expect(result.workItems.length).toBeGreaterThan(0);
    // Each work item should have required fields
    for (const wi of result.workItems) {
      expect(wi.item).toBeDefined();
      expect(wi.categoryKey).toBeTruthy();
      expect(wi.categoryConfig).toBeDefined();
    }
    // Cross-link data should have routes for exported items
    expect(result.crossLinkData.routes.size).toBeGreaterThan(0);
    expect(result.crossLinkData.kinds.size).toBeGreaterThan(0);
  });

  it("returns empty arrays for empty API model", async () => {
    const modelPath = path.join(
      import.meta.dirname,
      "../src/__fixtures__/example-module/example-module.api.json",
    );
    const { apiPackage } = await ApiModelLoader.loadApiModel(modelPath);
    const resolver = new CategoryResolver();
    // Empty categories — nothing matches
    const categories = resolver.mergeCategories({}, undefined);

    const result = prepareWorkItems({
      apiPackage,
      categories,
      baseRoute: "/test",
      packageName: "test",
    });

    expect(result.workItems).toHaveLength(0);
    expect(result.crossLinkData.routes.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: FAIL — `prepareWorkItems` is not exported from `build-stages.js`.

- [ ] **Step 3: Implement `prepareWorkItems()`**

Add to `plugin/src/build-stages.ts`:

```typescript
import type { ApiPackage } from "@microsoft/api-extractor-model";
import { ApiParser } from "./loader.js";

/**
 * Input for prepareWorkItems.
 */
export interface PrepareWorkItemsInput {
  readonly apiPackage: ApiPackage;
  readonly categories: Record<string, CategoryConfig>;
  readonly baseRoute: string;
  readonly packageName: string;
}

/**
 * Output from prepareWorkItems.
 */
export interface PrepareWorkItemsResult {
  readonly workItems: WorkItem[];
  readonly crossLinkData: CrossLinkData;
}

/**
 * Categorize API items, extract namespace members, and build cross-link data.
 * Returns a flat array of work items and merged cross-link route/kind maps.
 *
 * Extracted from plugin.ts:264-504.
 */
export function prepareWorkItems(input: PrepareWorkItemsInput): PrepareWorkItemsResult {
  const { apiPackage, categories, baseRoute, packageName } = input;

  // Categorize API items
  const items = ApiParser.categorizeApiItems(apiPackage, categories);

  // Build cross-link routes and kinds
  const routes = new Map<string, string>();
  const kinds = new Map<string, string>();

  for (const [categoryKey, categoryConfig] of Object.entries(categories)) {
    const categoryItems = items[categoryKey] || [];
    for (const item of categoryItems) {
      const itemRoute = `${baseRoute}/${categoryConfig.folderName}/${item.displayName.toLowerCase()}`;
      routes.set(item.displayName, itemRoute);
      kinds.set(item.displayName, item.kind);
    }
  }

  // Extract namespace members and add their routes
  const namespaceMembers = ApiParser.extractNamespaceMembers(apiPackage);

  // Track unqualified names to detect collisions across namespaces
  const unqualifiedNameCounts = new Map<string, number>();
  for (const nsMember of namespaceMembers) {
    const name = nsMember.item.displayName;
    unqualifiedNameCounts.set(name, (unqualifiedNameCounts.get(name) || 0) + 1);
  }

  for (const nsMember of namespaceMembers) {
    const categoryEntry = Object.entries(categories).find(([, config]) =>
      config.itemKinds?.includes(nsMember.item.kind),
    );
    if (!categoryEntry) continue;
    const [, categoryConfig] = categoryEntry;

    const qualifiedRoute = `${baseRoute}/${categoryConfig.folderName}/${nsMember.qualifiedName.toLowerCase()}`;

    routes.set(nsMember.qualifiedName, qualifiedRoute);
    kinds.set(nsMember.qualifiedName, nsMember.item.kind);

    const displayName = nsMember.item.displayName;
    const isPascalCase = /^[A-Z]/.test(displayName);
    if (isPascalCase && (unqualifiedNameCounts.get(displayName) || 0) <= 1 && !routes.has(displayName)) {
      routes.set(displayName, qualifiedRoute);
      kinds.set(displayName, nsMember.item.kind);
    }
  }

  // Flatten all items into work items
  const workItems: WorkItem[] = [];
  for (const [categoryKey, categoryConfig] of Object.entries(categories)) {
    const categoryItems = items[categoryKey] || [];
    for (const item of categoryItems) {
      workItems.push({ item, categoryKey, categoryConfig });
    }
  }

  // Add namespace members as work items
  for (const nsMember of namespaceMembers) {
    const categoryEntry = Object.entries(categories).find(([, config]) =>
      config.itemKinds?.includes(nsMember.item.kind),
    );
    if (categoryEntry) {
      const [categoryKey, categoryConfig] = categoryEntry;
      workItems.push({
        item: nsMember.item,
        categoryKey,
        categoryConfig,
        namespaceMember: nsMember,
      });
    }
  }

  return {
    workItems,
    crossLinkData: { routes, kinds },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: PASS.

- [ ] **Step 5: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

- [ ] **Step 6: Commit**

```bash
git add plugin/src/build-stages.ts plugin/__test__/build-stages.test.ts
git commit -m "feat: extract prepareWorkItems from generateApiDocs"
```

---

## Chunk 2: Extract `generatePages()` and `writeFiles()`

### Task 3: Extract `generatePages()`

**Files:**

- Modify: `plugin/src/build-stages.ts`
- Test: `plugin/__test__/build-stages.test.ts`

This function extracts the logic at `plugin/src/plugin.ts:510-766` — the
`parallelLimit` call that generates page content for each work item, parses
frontmatter, hashes content, and resolves timestamps from snapshots.

- [ ] **Step 1: Write the test**

Add to `plugin/__test__/build-stages.test.ts`:

```typescript
import { generatePages } from "../src/build-stages.js";

describe("generatePages", () => {
  it("generates page results with valid hashes for fixture model", async () => {
    const modelPath = path.join(
      import.meta.dirname,
      "../src/__fixtures__/example-module/example-module.api.json",
    );
    const { apiPackage } = await ApiModelLoader.loadApiModel(modelPath);
    const resolver = new CategoryResolver();
    const categories = resolver.mergeCategories(DEFAULT_CATEGORIES, undefined);
    const { workItems } = prepareWorkItems({
      apiPackage,
      categories,
      baseRoute: "/example-module",
      packageName: "example-module",
    });

    // Take first 3 items to keep test fast
    const subset = workItems.slice(0, 3);
    const results = await generatePages({
      workItems: subset,
      existingSnapshots: new Map(),
      baseRoute: "/example-module",
      packageName: "example-module",
      apiScope: "example-module",
      buildTime: new Date().toISOString(),
      resolvedOutputDir: "/tmp/test-output",
      pageConcurrency: 2,
    });

    expect(results.length).toBe(subset.length);
    for (const r of results) {
      if (r === null) continue;
      expect(r.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(r.frontmatterHash).toMatch(/^[a-f0-9]{64}$/);
      expect(r.relativePathWithExt).toMatch(/\.mdx$/);
      expect(r.bodyContent.length).toBeGreaterThan(0);
    }
  });

  it("marks unchanged pages when snapshot hashes match", async () => {
    const modelPath = path.join(
      import.meta.dirname,
      "../src/__fixtures__/example-module/example-module.api.json",
    );
    const { apiPackage } = await ApiModelLoader.loadApiModel(modelPath);
    const resolver = new CategoryResolver();
    const categories = resolver.mergeCategories(DEFAULT_CATEGORIES, undefined);
    const { workItems } = prepareWorkItems({
      apiPackage,
      categories,
      baseRoute: "/example-module",
      packageName: "example-module",
    });

    const buildTime = new Date().toISOString();
    const subset = workItems.slice(0, 1);

    // First pass: generate to get hashes
    const firstResults = await generatePages({
      workItems: subset,
      existingSnapshots: new Map(),
      baseRoute: "/example-module",
      packageName: "example-module",
      apiScope: "example-module",
      buildTime,
      resolvedOutputDir: "/tmp/test-output",
      pageConcurrency: 1,
    });

    const firstResult = firstResults[0];
    if (!firstResult) throw new Error("Expected result");

    // Build fake snapshot with matching hashes
    const snapshots = new Map();
    snapshots.set(firstResult.relativePathWithExt, {
      outputDir: "/tmp/test-output",
      filePath: firstResult.relativePathWithExt,
      publishedTime: "2025-01-01T00:00:00.000Z",
      modifiedTime: "2025-01-01T00:00:00.000Z",
      contentHash: firstResult.contentHash,
      frontmatterHash: firstResult.frontmatterHash,
      buildTime,
    });

    // Second pass: should detect unchanged
    const secondResults = await generatePages({
      workItems: subset,
      existingSnapshots: snapshots,
      baseRoute: "/example-module",
      packageName: "example-module",
      apiScope: "example-module",
      buildTime,
      resolvedOutputDir: "/tmp/test-output",
      pageConcurrency: 1,
    });

    const secondResult = secondResults[0];
    expect(secondResult).not.toBeNull();
    expect(secondResult!.isUnchanged).toBe(true);
    // Timestamps preserved from snapshot
    expect(secondResult!.publishedTime).toBe("2025-01-01T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: FAIL — `generatePages` is not exported.

- [ ] **Step 3: Implement `generatePages()`**

Extract the logic from `plugin/src/plugin.ts:510-766` into
`plugin/src/build-stages.ts`. This function:

1. Takes `WorkItem[]` and `existingSnapshots` Map
2. For each item, calls the appropriate page generator based on `item.kind`
3. Parses frontmatter via `matter()`, normalizes markdown spacing
4. Hashes content and frontmatter via `SnapshotManager.hashContent/hashFrontmatter`
5. Compares against existing snapshots for timestamp resolution
6. Returns `(GeneratedPageResult | null)[]`

The function signature:

```typescript
export interface GeneratePagesInput {
  readonly workItems: readonly WorkItem[];
  readonly existingSnapshots: Map<string, import("./snapshot-manager.js").FileSnapshot>;
  readonly baseRoute: string;
  readonly packageName: string;
  readonly apiScope: string;
  readonly apiName?: string;
  readonly source?: SourceConfig;
  readonly buildTime: string;
  readonly resolvedOutputDir: string;
  readonly pageConcurrency: number;
  readonly suppressExampleErrors?: boolean;
  readonly llmsPlugin?: import("./types.js").LlmsPluginOptions;
}

export async function generatePages(
  input: GeneratePagesInput,
): Promise<(GeneratedPageResult | null)[]>
```

**Critical detail:** The page generation switch/case block
(`plugin/src/plugin.ts:517-661`) must be copied verbatim — it creates the
correct page generator instance for each `ApiItemKind` and adjusts the route
path. The snapshot comparison logic (`plugin/src/plugin.ts:697-763`) includes a
disk fallback for files without snapshots — this must be preserved but skipped
during tests (tests pass a non-existent `resolvedOutputDir`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: PASS.

- [ ] **Step 5: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

- [ ] **Step 6: Commit**

```bash
git add plugin/src/build-stages.ts plugin/__test__/build-stages.test.ts
git commit -m "feat: extract generatePages from generateApiDocs"
```

---

### Task 4: Extract `writeFiles()`

**Files:**

- Modify: `plugin/src/build-stages.ts`
- Test: `plugin/__test__/build-stages.test.ts`

This function extracts the logic at `plugin/src/plugin.ts:777-881` — writing
changed files to disk, resolving OG metadata, and collecting results for
metadata/snapshot batch operations.

- [ ] **Step 1: Write the test**

Add to `plugin/__test__/build-stages.test.ts`:

```typescript
import { writeFiles } from "../src/build-stages.js";
import fs from "node:fs";
import os from "node:os";

describe("writeFiles", () => {
  it("writes changed files and skips unchanged files", async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "build-stages-"));

    const changedPage: GeneratedPageResult = {
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

    const unchangedPage: GeneratedPageResult = {
      ...changedPage,
      relativePathWithExt: "class/bar.mdx",
      routePath: "/example-module/class/bar",
      isUnchanged: true,
    };

    const results = await writeFiles({
      pages: [changedPage, unchangedPage],
      resolvedOutputDir: tmpDir,
      baseRoute: "/example-module",
      buildTime: new Date().toISOString(),
      pageConcurrency: 2,
    });

    expect(results).toHaveLength(2);

    // Changed file should be written
    const changedResult = results.find(r => r.relativePathWithExt === "class/foo.mdx");
    expect(changedResult?.status).toBe("new");

    // Unchanged file should not be written
    const unchangedResult = results.find(r => r.relativePathWithExt === "class/bar.mdx");
    expect(unchangedResult?.status).toBe("unchanged");

    // Verify file exists on disk
    const filePath = path.join(tmpDir, "class/foo.mdx");
    const exists = await fs.promises.access(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    // Cleanup
    await fs.promises.rm(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: FAIL — `writeFiles` is not exported.

- [ ] **Step 3: Implement `writeFiles()`**

Add to `plugin/src/build-stages.ts`. The function:

1. Takes `GeneratedPageResult[]` and `resolvedOutputDir`
2. For each page: if `isUnchanged`, skip write and return `status: "unchanged"`
3. For changed pages: mkdir, write file, determine status (new vs modified)
4. Increment Effect metrics for each file
5. Return `FileWriteResult[]`

```typescript
export interface WriteFilesInput {
  readonly pages: readonly (GeneratedPageResult | null)[];
  readonly resolvedOutputDir: string;
  readonly baseRoute: string;
  readonly buildTime: string;
  readonly pageConcurrency: number;
  readonly ogResolver?: import("./og-resolver.js").OpenGraphResolver | null;
  readonly siteUrl?: string;
  readonly ogImage?: import("./types.js").OpenGraphImageConfig;
  readonly packageName?: string;
  readonly apiName?: string;
}

export async function writeFiles(input: WriteFilesInput): Promise<FileWriteResult[]>
```

**Important:** OG metadata resolution (`plugin/src/plugin.ts:829-856`)
is part of the write phase. If `ogResolver` and `siteUrl` are provided,
regenerate frontmatter with OG tags before writing. Otherwise, use
`matter.stringify(bodyContent, frontmatterData)` directly.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: PASS.

- [ ] **Step 5: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

- [ ] **Step 6: Commit**

```bash
git add plugin/src/build-stages.ts plugin/__test__/build-stages.test.ts
git commit -m "feat: extract writeFiles from generateApiDocs"
```

---

## Chunk 3: Extract `writeMetadata()` and `cleanupAndCommit()`

### Task 5: Extract `writeMetadata()`

**Files:**

- Modify: `plugin/src/build-stages.ts`
- Test: `plugin/__test__/build-stages.test.ts`

This function extracts three blocks of metadata logic from `generateApiDocs`:

1. **Root API `_meta.json`** (`plugin/src/plugin.ts:330-436`): Builds category
   folder entries (`type: "dir"`) with collapsible/collapsed settings. Writes
   with full snapshot tracking (hash comparison, disk fallback, timestamp
   preservation).

2. **Main index page** (`plugin/src/plugin.ts:438-459`): Generates the API
   landing page via `MainIndexPageGenerator` with category counts. Uses
   `writeFile()` with `skipIfExists: true`. Tracks in `generatedFiles`.

3. **Category `_meta.json` files** (`plugin/src/plugin.ts:883-1046`):
   Aggregates `FileWriteResult[]` by category, builds sorted `_meta.json`
   arrays, writes with snapshot tracking.

- [ ] **Step 1: Write the test**

Add to `plugin/__test__/build-stages.test.ts`:

```typescript
import { writeMetadata } from "../src/build-stages.js";
import { SnapshotManager } from "../src/snapshot-manager.js";

describe("writeMetadata", () => {
  it("writes _meta.json files for categories with items", async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "meta-test-"));
    const dbPath = path.join(tmpDir, "test.db");
    const snapshotManager = new SnapshotManager(dbPath);

    const results: FileWriteResult[] = [
      {
        relativePathWithExt: "class/foo.mdx",
        absolutePath: path.join(tmpDir, "class/foo.mdx"),
        status: "new",
        snapshot: { outputDir: tmpDir, filePath: "class/foo.mdx", publishedTime: "", modifiedTime: "", contentHash: "a", frontmatterHash: "b", buildTime: "" },
        categoryKey: "classes",
        label: "Foo",
        routePath: "/api/class/foo",
      },
      {
        relativePathWithExt: "class/bar.mdx",
        absolutePath: path.join(tmpDir, "class/bar.mdx"),
        status: "new",
        snapshot: { outputDir: tmpDir, filePath: "class/bar.mdx", publishedTime: "", modifiedTime: "", contentHash: "c", frontmatterHash: "d", buildTime: "" },
        categoryKey: "classes",
        label: "Bar",
        routePath: "/api/class/bar",
      },
    ];

    const categories = {
      classes: { folderName: "class", displayName: "Classes", singularName: "Class", collapsible: true, collapsed: true, overviewHeaders: [2] },
    } as Record<string, CategoryConfig>;

    await writeMetadata({
      fileResults: results,
      categories,
      resolvedOutputDir: tmpDir,
      snapshotManager,
      existingSnapshots: new Map(),
      buildTime: new Date().toISOString(),
    });

    // Category _meta.json should exist
    const metaPath = path.join(tmpDir, "class/_meta.json");
    const metaContent = JSON.parse(await fs.promises.readFile(metaPath, "utf-8"));
    expect(metaContent).toHaveLength(2);
    // Should be sorted alphabetically
    expect(metaContent[0].label).toBe("Bar");
    expect(metaContent[1].label).toBe("Foo");

    // Root API _meta.json should exist with category dir entries
    const rootMetaPath = path.join(tmpDir, "_meta.json");
    const rootMeta = JSON.parse(await fs.promises.readFile(rootMetaPath, "utf-8"));
    expect(rootMeta).toHaveLength(1);
    expect(rootMeta[0].type).toBe("dir");
    expect(rootMeta[0].name).toBe("class");
    expect(rootMeta[0].label).toBe("Classes");

    snapshotManager.close();
    await fs.promises.rm(tmpDir, { recursive: true });
  });

  it("generates main index page with category counts", async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "index-test-"));
    const dbPath = path.join(tmpDir, "test.db");
    const snapshotManager = new SnapshotManager(dbPath);

    const results: FileWriteResult[] = [
      {
        relativePathWithExt: "class/foo.mdx",
        absolutePath: path.join(tmpDir, "class/foo.mdx"),
        status: "new",
        snapshot: { outputDir: tmpDir, filePath: "class/foo.mdx", publishedTime: "", modifiedTime: "", contentHash: "a", frontmatterHash: "b", buildTime: "" },
        categoryKey: "classes",
        label: "Foo",
        routePath: "/api/class/foo",
      },
    ];

    const categories = {
      classes: { folderName: "class", displayName: "Classes", singularName: "Class", collapsible: true, collapsed: true, overviewHeaders: [2] },
    } as Record<string, CategoryConfig>;

    await writeMetadata({
      fileResults: results,
      categories,
      resolvedOutputDir: tmpDir,
      snapshotManager,
      existingSnapshots: new Map(),
      buildTime: new Date().toISOString(),
      baseRoute: "/api",
      packageName: "test-package",
    });

    // Main index page should exist
    const indexPath = path.join(tmpDir, "index.mdx");
    const indexExists = await fs.promises.access(indexPath).then(() => true).catch(() => false);
    expect(indexExists).toBe(true);

    snapshotManager.close();
    await fs.promises.rm(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: FAIL — `writeMetadata` is not exported.

- [ ] **Step 3: Implement `writeMetadata()`**

Combines three blocks extracted from `generateApiDocs`:

1. **Root `_meta.json`** (from `plugin/src/plugin.ts:330-436`): Build
   `apiMetaEntries` array with `type: "dir"` entries for each non-empty
   category. Write with full snapshot tracking (hash + disk fallback).
2. **Main index page** (from `plugin/src/plugin.ts:438-459`): Call
   `MainIndexPageGenerator.generate()` with category counts, write via
   `writeFile()` with `skipIfExists: true`, add `"index.mdx"` to
   `generatedFiles`.
3. **Category `_meta.json`** (from `plugin/src/plugin.ts:883-1046`): Aggregate
   `FileWriteResult[]` by categoryKey, sort alphabetically, build `_meta.json`
   arrays, write with snapshot tracking.

The function signature adds `baseRoute` and `packageName` (needed by
`MainIndexPageGenerator`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/build-stages.ts plugin/__test__/build-stages.test.ts
git commit -m "feat: extract writeMetadata from generateApiDocs"
```

---

### Task 6: Extract `cleanupAndCommit()`

**Files:**

- Modify: `plugin/src/build-stages.ts`
- Test: `plugin/__test__/build-stages.test.ts`

This function extracts the logic at `plugin/src/plugin.ts:942-1119` — batch
upsert snapshots, detect and delete stale files, detect and delete orphaned
files, remove empty directories.

- [ ] **Step 1: Write the test**

Add to `plugin/__test__/build-stages.test.ts`:

```typescript
import { cleanupAndCommit } from "../src/build-stages.js";

describe("cleanupAndCommit", () => {
  it("batch upserts snapshots for written files", async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "cleanup-test-"));
    const dbPath = path.join(tmpDir, "test.db");
    const snapshotManager = new SnapshotManager(dbPath);

    const buildTime = new Date().toISOString();
    const results: FileWriteResult[] = [
      {
        relativePathWithExt: "class/foo.mdx",
        absolutePath: path.join(tmpDir, "class/foo.mdx"),
        status: "new",
        snapshot: { outputDir: tmpDir, filePath: "class/foo.mdx", publishedTime: buildTime, modifiedTime: buildTime, contentHash: "abc", frontmatterHash: "def", buildTime },
        categoryKey: "classes",
        label: "Foo",
        routePath: "/api/class/foo",
      },
    ];

    await cleanupAndCommit({
      fileResults: results,
      snapshotManager,
      resolvedOutputDir: tmpDir,
      generatedFiles: new Set(["class/foo.mdx"]),
    });

    // Verify snapshot was upserted
    const snapshots = snapshotManager.getSnapshotsForOutputDir(tmpDir);
    expect(snapshots.length).toBe(1);
    expect(snapshots[0].filePath).toBe("class/foo.mdx");

    snapshotManager.close();
    await fs.promises.rm(tmpDir, { recursive: true });
  });

  it("deletes orphaned files not in generatedFiles set", async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "orphan-test-"));
    const dbPath = path.join(tmpDir, "test.db");
    const snapshotManager = new SnapshotManager(dbPath);

    // Create an orphaned file on disk
    const orphanDir = path.join(tmpDir, "class");
    await fs.promises.mkdir(orphanDir, { recursive: true });
    await fs.promises.writeFile(path.join(orphanDir, "orphan.mdx"), "old content");

    await cleanupAndCommit({
      fileResults: [],
      snapshotManager,
      resolvedOutputDir: tmpDir,
      generatedFiles: new Set(), // empty — orphan.mdx is not generated
    });

    // Orphaned file should be deleted
    const exists = await fs.promises.access(path.join(orphanDir, "orphan.mdx")).then(() => true).catch(() => false);
    expect(exists).toBe(false);

    snapshotManager.close();
    await fs.promises.rm(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: FAIL — `cleanupAndCommit` is not exported.

- [ ] **Step 3: Implement `cleanupAndCommit()`**

Extract from `plugin/src/plugin.ts:942-1119`. The function receives ALL
`FileWriteResult[]` (including unchanged) and filters internally:

1. Batch-upserts snapshots for **written files only** (status !== "unchanged")
2. Uses the `generatedFiles` set (built from ALL results) for stale detection
3. Calls `snapshotManager.cleanupStaleFiles()` to remove DB-tracked files not
   in this build
4. Reads output directory to find orphaned files (on disk but not in
   `generatedFiles` set)
5. Deletes orphans from disk and DB
6. Removes empty subdirectories

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: PASS.

- [ ] **Step 5: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

- [ ] **Step 6: Run all existing tests to verify no regression**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=test`

Expected: All 643+ existing tests pass. The extracted functions are not yet
wired into `plugin.ts` — they exist alongside the original code.

- [ ] **Step 7: Commit**

```bash
git add plugin/src/build-stages.ts plugin/__test__/build-stages.test.ts
git commit -m "feat: extract cleanupAndCommit from generateApiDocs"
```

---

## Chunk 4: Cross-Linker Fix and Wiring

### Task 7: Make `MarkdownCrossLinker` accumulative

**Files:**

- Modify: `plugin/src/markdown/cross-linker.ts`
- Test: `plugin/__test__/build-stages.test.ts`

Currently, `markdownCrossLinker.initialize()` calls `this.apiItemRoutes.clear()`
at `plugin/src/markdown/cross-linker.ts:62`. In multi-API mode, the second API
call wipes the first API's routes. Fix: rename to `addRoutes()` (accumulate)
and add a separate `clear()` for build reset.

- [ ] **Step 1: Write the test**

Add to `plugin/__test__/build-stages.test.ts`:

```typescript
import { MarkdownCrossLinker } from "../src/markdown/cross-linker.js";

describe("MarkdownCrossLinker accumulation", () => {
  it("addRoutes accumulates routes across multiple calls", () => {
    const linker = new MarkdownCrossLinker();

    // Simulate API 1
    const data1 = linker.addRoutes(
      { classes: [{ displayName: "Foo", kind: "Class" }] } as any,
      "/api1",
      { classes: { folderName: "class" } } as any,
    );

    // Simulate API 2
    const data2 = linker.addRoutes(
      { classes: [{ displayName: "Bar", kind: "Class" }] } as any,
      "/api2",
      { classes: { folderName: "class" } } as any,
    );

    // Both routes should be present
    expect(data2.routes.has("Foo")).toBe(true);
    expect(data2.routes.has("Bar")).toBe(true);
    expect(data2.routes.get("Foo")).toBe("/api1/class/foo");
    expect(data2.routes.get("Bar")).toBe("/api2/class/bar");
  });

  it("clear removes all accumulated routes", () => {
    const linker = new MarkdownCrossLinker();
    linker.addRoutes(
      { classes: [{ displayName: "Foo", kind: "Class" }] } as any,
      "/api1",
      { classes: { folderName: "class" } } as any,
    );

    linker.clear();

    // addCrossLinks should not find any routes
    const result = linker.addCrossLinks("Returns a Foo instance");
    expect(result).toBe("Returns a Foo instance"); // No link added
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: FAIL — `addRoutes` and `clear` do not exist on `MarkdownCrossLinker`.

- [ ] **Step 3: Modify `MarkdownCrossLinker`**

In `plugin/src/markdown/cross-linker.ts`:

1. Rename `initialize()` to `addRoutes()` — remove the `this.apiItemRoutes.clear()` call at line 62
2. Add a new `clear()` method that calls `this.apiItemRoutes.clear()`
3. Keep `initialize()` as a deprecated alias that calls `clear()` then `addRoutes()` for backward compat during the transition

```typescript
/**
 * Clear all accumulated routes. Call at the start of each build.
 */
public clear(): void {
  this.apiItemRoutes.clear();
}

/**
 * Add routes for API items. Accumulates across multiple calls.
 * Call clear() first if starting a fresh build.
 */
public addRoutes(
  items: Record<string, ApiItem[]>,
  baseRoute: string,
  categories: Record<string, { folderName: string }>,
): { routes: Map<string, string>; kinds: Map<string, string> } {
  // Same logic as old initialize(), minus the clear()
  const apiItemKinds = new Map<string, string>();
  // ... (copy existing loop logic)
  return { routes: this.apiItemRoutes, kinds: apiItemKinds };
}

/**
 * @deprecated Use clear() + addRoutes() instead.
 */
public initialize(
  items: Record<string, ApiItem[]>,
  baseRoute: string,
  categories: Record<string, { folderName: string }>,
): { routes: Map<string, string>; kinds: Map<string, string> } {
  this.clear();
  return this.addRoutes(items, baseRoute, categories);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: PASS.

- [ ] **Step 5: Verify all existing tests still pass**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=test`

Expected: All tests pass. Existing code still calls `initialize()` which now
delegates to `clear()` + `addRoutes()` — behavior unchanged.

- [ ] **Step 6: Commit**

```bash
git add plugin/src/markdown/cross-linker.ts plugin/__test__/build-stages.test.ts
git commit -m "fix: make MarkdownCrossLinker accumulative for multi-API mode"
```

---

### Task 8: Wire extracted functions into `generateApiDocs`

**Files:**

- Modify: `plugin/src/plugin.ts`

Replace the 920-line body of `generateApiDocs` with calls to the 5 extracted
functions. Use the 3-phase cross-linker fix from the spec.

- [ ] **Step 1: Rewrite `generateApiDocs` as thin orchestrator**

Replace `plugin/src/plugin.ts:203-1122` with:

```typescript
async function generateApiDocs(
  config: { /* same signature */ },
  shikiCrossLinker: ShikiCrossLinker,
  snapshotManager: SnapshotManager,
  ogResolver: OpenGraphResolver | null,
  fileContextMap: Map<string, { api?: string; version?: string; file: string }>,
  highlighter?: Highlighter,
  hideCutTransformer?: ShikiTransformer,
  hideCutLinesTransformer?: ShikiTransformer,
  twoslashTransformer?: ShikiTransformer,
): Promise<CrossLinkData> {
  const { apiPackage, packageName, apiName, outputDir, baseRoute, categories,
    source, packageJson, suppressExampleErrors, llmsPlugin, siteUrl, ogImage } = config;

  const resolvedOutputDir = path.resolve(process.cwd(), outputDir);
  const buildTime = new Date().toISOString();

  // Load existing snapshots
  const existingSnapshots = new Map<string, import("./snapshot-manager.js").FileSnapshot>();
  for (const snapshot of snapshotManager.getSnapshotsForOutputDir(resolvedOutputDir)) {
    existingSnapshots.set(snapshot.filePath, snapshot);
  }

  await fs.promises.mkdir(resolvedOutputDir, { recursive: true });

  // Phase 1: Prepare work items + cross-link data
  const { workItems, crossLinkData } = prepareWorkItems({
    apiPackage, categories, baseRoute, packageName,
  });

  // Cross-linker initialization happens in the CALLER (3-phase fix)
  // Register VFS config
  const apiScope = baseRoute.replace(/^\//, "").split("/")[0] || packageName;
  if (highlighter) {
    VfsRegistry.register(apiScope, {
      vfs: new Map(),
      highlighter,
      twoslashTransformer,
      crossLinker: shikiCrossLinker,
      hideCutTransformer,
      hideCutLinesTransformer,
      packageName,
      apiScope,
      theme: config.theme,
    });
  }

  const cpuCores = os.cpus().length;
  const pageConcurrency = Math.max(cpuCores > 4 ? cpuCores - 1 : cpuCores, 2);

  // Phase 2: Generate pages
  const pageResults = await generatePages({
    workItems, existingSnapshots, baseRoute, packageName, apiScope,
    apiName, source, buildTime, resolvedOutputDir, pageConcurrency,
    suppressExampleErrors: suppressExampleErrors !== false,
    llmsPlugin,
  });

  // Phase 3: Write files
  const fileResults = await writeFiles({
    pages: pageResults, resolvedOutputDir, baseRoute, buildTime,
    pageConcurrency, ogResolver, siteUrl, ogImage, packageName, apiName,
  });

  // Phase 4: Write metadata
  const generatedFiles = new Set<string>();
  for (const r of fileResults) generatedFiles.add(r.relativePathWithExt);

  // Track file context for remark plugin
  for (const r of fileResults) {
    fileContextMap.set(r.absolutePath, {
      api: apiName, version: packageJson?.version, file: r.relativePathWithExt,
    });
  }

  await writeMetadata({
    fileResults, categories, resolvedOutputDir, snapshotManager,
    existingSnapshots, buildTime, baseRoute, packageName,
  });

  // Phase 5: Cleanup (receives ALL results — filters internally for upserts)
  await cleanupAndCommit({
    fileResults,
    snapshotManager, resolvedOutputDir, generatedFiles,
  });

  return crossLinkData;
}
```

**Critical change:** `generateApiDocs` now **returns** `CrossLinkData`.

- [ ] **Step 2: Update the multi-API loop (3-phase cross-linker fix)**

In `plugin/src/plugin.ts`, the loop at line 1639 changes to:

```typescript
// Phase 1: Prepare all APIs (collect cross-link data)
const allPrepResults = await Promise.all(
  apiConfigs.map(async (config) => {
    const { workItems, crossLinkData } = prepareWorkItems({
      apiPackage: config.apiPackage,
      categories: config.categories,
      baseRoute: config.baseRoute,
      packageName: config.packageName,
    });
    return { config, workItems, crossLinkData };
  }),
);

// Phase 2: Initialize cross-linkers with MERGED data from ALL APIs
markdownCrossLinker.clear();
for (const { crossLinkData, config } of allPrepResults) {
  markdownCrossLinker.addRoutes(/* from crossLinkData */);
  const apiScope = config.baseRoute.replace(/^\//, "").split("/")[0] || config.packageName;
  shikiCrossLinker.reinitialize(crossLinkData.routes, crossLinkData.kinds, apiScope);
  TwoslashManager.addTypeRoutes(crossLinkData.routes);
}

// Phase 3: Generate and write for each API
await parallelLimit(allPrepResults, 2, async ({ config }) => {
  await generateApiDocs(config, shikiCrossLinker, snapshotManager, ...);
});
```

- [ ] **Step 3: Run all tests**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=test`

Expected: All tests pass. This is a pure refactor — same behavior, different
code structure.

- [ ] **Step 4: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

- [ ] **Step 5: Commit**

```bash
git add plugin/src/plugin.ts plugin/src/build-stages.ts
git commit -m "refactor: wire build-stages into generateApiDocs, fix cross-linker race"
```

---

## Chunk 5: Stream Pipeline (Phase B)

### Task 9: Convert to Effect Stream pipeline

**Files:**

- Modify: `plugin/src/build-stages.ts`
- Modify: `plugin/src/plugin.ts`
- Test: `plugin/__test__/build-stages.test.ts`

Convert the `parallelLimit`-based orchestration to an Effect Stream.

- [ ] **Step 1: Write the Stream integration test**

Add to `plugin/__test__/build-stages.test.ts`:

```typescript
import { Effect, Stream, Layer } from "effect";
import { buildPipelineForApi, prepareWorkItems, type BuildPipelineInput } from "../src/build-stages.js";

describe("Stream pipeline", () => {
  it("processes work items through generation → write → fold", async () => {
    const modelPath = path.join(
      import.meta.dirname,
      "../src/__fixtures__/example-module/example-module.api.json",
    );
    const { apiPackage } = await ApiModelLoader.loadApiModel(modelPath);
    const resolver = new CategoryResolver();
    const categories = resolver.mergeCategories(DEFAULT_CATEGORIES, undefined);
    const { workItems } = prepareWorkItems({
      apiPackage,
      categories,
      baseRoute: "/example-module",
      packageName: "example-module",
    });

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "stream-test-"));

    const input: BuildPipelineInput = {
      workItems,
      baseRoute: "/example-module",
      packageName: "example-module",
      apiScope: "example-module",
      buildTime: new Date().toISOString(),
      resolvedOutputDir: tmpDir,
      pageConcurrency: 2,
      existingSnapshots: new Map(),
    };

    const program = buildPipelineForApi(input);
    const results = await Effect.runPromise(program);

    // Should have processed all work items
    expect(results.length).toBeGreaterThan(0);

    // At least some files should be written (all are new on first run)
    const written = results.filter(r => r.status !== "unchanged");
    expect(written.length).toBeGreaterThan(0);

    await fs.promises.rm(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: FAIL — `buildPipelineForApi` is not exported.

- [ ] **Step 3: Implement `buildPipelineForApi()`**

Add to `plugin/src/build-stages.ts`:

```typescript
import { Effect, Stream } from "effect";

export interface BuildPipelineInput {
  // Pre-computed work items from prepareWorkItems() — avoids redundant call
  readonly workItems: readonly WorkItem[];
  readonly baseRoute: string;
  readonly packageName: string;
  readonly apiScope: string;
  readonly apiName?: string;
  readonly source?: SourceConfig;
  readonly buildTime: string;
  readonly resolvedOutputDir: string;
  readonly pageConcurrency: number;
  readonly existingSnapshots: Map<string, import("./snapshot-manager.js").FileSnapshot>;
  readonly suppressExampleErrors?: boolean;
  readonly llmsPlugin?: import("./types.js").LlmsPluginOptions;
  readonly ogResolver?: import("./og-resolver.js").OpenGraphResolver | null;
  readonly siteUrl?: string;
  readonly ogImage?: import("./types.js").OpenGraphImageConfig;
}

/**
 * Effect Stream pipeline: workItems → generate → write (no-op for unchanged) → fold
 *
 * IMPORTANT: Unchanged files are NOT filtered out. They flow through the write
 * stage as no-ops (no disk I/O) and appear in the fold output with
 * status: "unchanged". This is required because ALL generated files must be
 * tracked for:
 * - generatedFiles set (stale/orphan cleanup)
 * - fileContextMap (remark plugin Twoslash error attribution)
 * - _meta.json navigation entries
 */
export function buildPipelineForApi(
  input: BuildPipelineInput,
): Effect.Effect<FileWriteResult[]> {
  return Stream.fromIterable(input.workItems).pipe(
    // Stage 1: Generate page content + hashes + timestamps
    Stream.mapEffect(
      (workItem) => Effect.promise(() => generateSinglePage(workItem, input)),
      { concurrency: input.pageConcurrency },
    ),
    // Filter nulls (unsupported item kinds only)
    Stream.filter((result): result is GeneratedPageResult => result !== null),
    // Stage 2: Write files to disk (no-op for unchanged — skips write, returns status)
    Stream.mapEffect(
      (result) => Effect.promise(() => writeSingleFile(result, input)),
      { concurrency: input.pageConcurrency },
    ),
    // Fold: accumulate ALL results (unchanged + written)
    Stream.runFold([] as FileWriteResult[], (acc, result) => [...acc, result]),
  );
}
```

Where `generateSinglePage()` and `writeSingleFile()` are private helpers that
handle one item each (extracted from the loop bodies of `generatePages()` and
`writeFiles()`). `writeSingleFile()` checks `result.isUnchanged` and returns
early with `status: "unchanged"` without writing to disk.

**Important:** The fold accumulates ALL `FileWriteResult[]` (both written and
unchanged). Content is written to disk and released per-item — only the
lightweight `FileWriteResult` (paths, status, snapshot data) stays in memory.
This is critical: unchanged files must appear in the output for metadata
generation, stale file cleanup, and remark plugin context tracking.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run plugin/__test__/build-stages.test.ts`

Expected: PASS.

- [ ] **Step 5: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

- [ ] **Step 6: Commit**

```bash
git add plugin/src/build-stages.ts plugin/__test__/build-stages.test.ts
git commit -m "feat: implement Effect Stream pipeline for page generation"
```

---

### Task 10: Wire Stream pipeline into `plugin.ts` and delete `utils.ts`

**Files:**

- Modify: `plugin/src/plugin.ts`
- Delete: `plugin/src/utils.ts`

- [ ] **Step 1: Replace `parallelLimit` calls with Stream pipeline**

In `plugin/src/plugin.ts`:

1. Replace the `generateApiDocs` body to use `buildPipelineForApi()` via
   `effectRuntime.runPromise()`
2. Replace the outer multi-API `parallelLimit(apiConfigs, 2, ...)` loop at
   line 1639 with `Effect.forEach` with `{ concurrency: 2 }`
3. Remove the `import { parallelLimit } from "./utils.js"` at line 77

The outer loop becomes:

```typescript
// Phase 1: Prepare all APIs (collect cross-link data)
const allPrepResults = await Promise.all(
  apiConfigs.map(async (config) => {
    const { workItems, crossLinkData } = prepareWorkItems({
      apiPackage: config.apiPackage,
      categories: config.categories,
      baseRoute: config.baseRoute,
      packageName: config.packageName,
    });
    return { config, workItems, crossLinkData };
  }),
);

// Phase 2: Initialize cross-linkers with MERGED data from ALL APIs
markdownCrossLinker.clear();
for (const { crossLinkData, config } of allPrepResults) {
  markdownCrossLinker.addRoutes(/* items, baseRoute, categories */);
  const apiScope = config.baseRoute.replace(/^\//, "").split("/")[0] || config.packageName;
  shikiCrossLinker.reinitialize(crossLinkData.routes, crossLinkData.kinds, apiScope);
  TwoslashManager.addTypeRoutes(crossLinkData.routes);
}

// Phase 3: Generate and write for each API (bounded concurrency)
// Note: VfsRegistry.register() is called inside buildPipelineForApi
// before the Stream starts — it requires the highlighter and transformers.
const generateProgram = Effect.forEach(
  allPrepResults,
  ({ config, workItems }) =>
    buildPipelineForApi({
      workItems,
      // ... baseRoute, packageName, apiScope, buildTime, etc.
    }).pipe(
      Effect.annotateLogs("api", config.packageName),
    ),
  { concurrency: 2 },
);

await effectRuntime.runPromise(generateProgram);
```

- [ ] **Step 2: Delete `plugin/src/utils.ts`**

Run: `git rm plugin/src/utils.ts`

Also delete `plugin/src/utils.test.ts` if it exists (tests for `parallelLimit`
are no longer needed).

- [ ] **Step 3: Run all tests**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=test`

Expected: All tests pass. Any test that imported `parallelLimit` from
`utils.ts` will fail — these need to be removed or updated.

- [ ] **Step 4: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

Expected: No errors. No dead imports.

- [ ] **Step 5: Run build to verify end-to-end**

Run: `pnpm run build`

Expected: Build succeeds. The plugin generates the same documentation output
as before.

- [ ] **Step 6: Commit**

```bash
git add plugin/src/plugin.ts plugin/src/build-stages.ts plugin/__test__/build-stages.test.ts
git rm plugin/src/utils.ts
git commit -m "refactor: replace parallelLimit with Effect Stream pipeline, delete utils.ts"
```

---

## Chunk 6: Verification

### Task 11: Full regression verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=test`

Expected: All tests pass.

- [ ] **Step 2: Run typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

Expected: No type errors.

- [ ] **Step 3: Run lint**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint`

Expected: No lint errors.

- [ ] **Step 4: Verify `utils.ts` is deleted**

Run: `ls plugin/src/utils.ts 2>/dev/null && echo "FAIL: utils.ts still exists" || echo "OK: utils.ts deleted"`

Expected: "OK: utils.ts deleted"

- [ ] **Step 5: Verify `plugin.ts` is significantly shorter**

Run: `wc -l plugin/src/plugin.ts`

Expected: ~1200 lines (down from ~1827). The ~600 lines of `generateApiDocs`
body moved to `build-stages.ts`.

- [ ] **Step 6: Verify `build-stages.ts` exists with extracted functions**

Run: `grep -c "^export " plugin/src/build-stages.ts`

Expected: At least 6 exports (5 functions + types).
