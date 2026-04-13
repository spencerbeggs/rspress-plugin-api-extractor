# Multi-Entry Point Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the plugin's doc generation pipeline to process all entry points from a merged API model, deduplicating re-exports and handling name collisions with entry-point-scoped URL segments.

**Architecture:** A new `resolveEntryPoints()` pure function deduplicates re-exported items and detects name collisions across entry points. `prepareWorkItems()` consumes the resolved items instead of reading `entryPoints[0]` directly. Page generators receive `availableFrom` metadata for display. Navigation labels include entry point qualifiers only for colliding items.

**Tech Stack:** TypeScript, `@microsoft/api-extractor-model` (ApiPackage, ApiEntryPoint, ApiItem), Effect-TS (Stream pipeline), Vitest

---

## File Map

| Action | File | Responsibility |
| --- | --- | --- |
| Create | `plugin/src/multi-entry-resolver.ts` | Pure function: deduplicate re-exports, detect collisions |
| Create | `plugin/__test__/multi-entry-resolver.test.ts` | Unit tests for resolver |
| Modify | `plugin/src/loader.ts:52-106` | Accept `ResolvedEntryItem[]` instead of `ApiPackage` |
| Modify | `plugin/src/loader.ts:115-139` | Accept `ResolvedEntryItem[]` for namespace extraction |
| Modify | `plugin/src/build-stages.ts:39-44` | Add `availableFrom` and `entryPointSegment` to `WorkItem` |
| Modify | `plugin/src/build-stages.ts:75-80` | Add `availableFrom` to `PrepareWorkItemsInput` |
| Modify | `plugin/src/build-stages.ts:112-207` | Use resolver in `prepareWorkItems()` |
| Modify | `plugin/src/build-stages.ts:246-450` | Pass `availableFrom` through `generateSinglePage()` |
| Modify | `plugin/src/build-stages.ts:831-860` | Use label qualifier for colliding items in metadata |
| Modify | `plugin/src/build-program.ts:72-86` | Call resolver, pass resolved items |
| Modify | `plugin/src/markdown/helpers.ts` | Add `generateAvailableFrom()` helper |
| Modify | `plugin/src/markdown/page-generators/*.ts` | Add `availableFrom` parameter, render "Available from" line |

---

### Task 1: Create the MultiEntryResolver

**Files:**

- Create: `plugin/src/multi-entry-resolver.ts`
- Create: `plugin/__test__/multi-entry-resolver.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { ApiModel } from "@microsoft/api-extractor-model";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveEntryPoints } from "../src/multi-entry-resolver.js";

function loadKitchensinkModel(): InstanceType<typeof ApiModel> {
 const modelPath = resolve(
  import.meta.dirname,
  "../../sites/basic/lib/models/kitchensink/kitchensink.api.json",
 );
 const model = new ApiModel();
 model.loadPackage(modelPath);
 return model;
}

describe("resolveEntryPoints", () => {
 it("returns all items from a single-entry model with definingEntryPoint 'default'", () => {
  const model = loadKitchensinkModel();
  const apiPackage = model.packages[0];

  // Create a single-entry package by only looking at the first entry point
  // We test multi-entry with the full model below
  const resolved = resolveEntryPoints(apiPackage);

  // Every resolved item should exist
  expect(resolved.length).toBeGreaterThan(0);

  // Items unique to the main entry should have definingEntryPoint "default"
  const logLevel = resolved.find(
   (r) => r.item.displayName === "LogLevel" && r.definingEntryPoint === "default",
  );
  expect(logLevel).toBeDefined();
 });

 it("deduplicates re-exported items across entry points", () => {
  const model = loadKitchensinkModel();
  const apiPackage = model.packages[0];
  const resolved = resolveEntryPoints(apiPackage);

  // Logger is defined in main and re-exported in testing
  const loggerItems = resolved.filter((r) => r.item.displayName === "Logger" && r.item.kind === "Class");
  expect(loggerItems).toHaveLength(1);
  expect(loggerItems[0].definingEntryPoint).toBe("default");
  expect(loggerItems[0].availableFrom).toContain("default");
  expect(loggerItems[0].availableFrom).toContain("testing");
 });

 it("includes unique items from secondary entry points", () => {
  const model = loadKitchensinkModel();
  const apiPackage = model.packages[0];
  const resolved = resolveEntryPoints(apiPackage);

  // MockLogger is only in the testing entry
  const mockLogger = resolved.find((r) => r.item.displayName === "MockLogger");
  expect(mockLogger).toBeDefined();
  expect(mockLogger!.definingEntryPoint).toBe("testing");
  expect(mockLogger!.availableFrom).toEqual(["testing"]);
 });

 it("sets hasCollision false when no display name collisions exist", () => {
  const model = loadKitchensinkModel();
  const apiPackage = model.packages[0];
  const resolved = resolveEntryPoints(apiPackage);

  // No items in kitchensink should have collisions (re-exports are deduped, not collisions)
  const collisions = resolved.filter((r) => r.hasCollision);
  expect(collisions).toHaveLength(0);
 });

 it("returns items from all entry points with correct availableFrom", () => {
  const model = loadKitchensinkModel();
  const apiPackage = model.packages[0];
  const resolved = resolveEntryPoints(apiPackage);

  // TestRunner should be unique to testing
  const testRunner = resolved.find((r) => r.item.displayName === "TestRunner");
  expect(testRunner).toBeDefined();
  expect(testRunner!.definingEntryPoint).toBe("testing");
  expect(testRunner!.availableFrom).toEqual(["testing"]);

  // AsyncTask is re-exported from testing
  const asyncTask = resolved.filter((r) => r.item.displayName === "AsyncTask");
  expect(asyncTask).toHaveLength(1);
  expect(asyncTask[0].availableFrom).toContain("default");
  expect(asyncTask[0].availableFrom).toContain("testing");
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run plugin/__test__/multi-entry-resolver.test.ts
```

Expected: FAIL — `Cannot find module '../src/multi-entry-resolver.js'`

- [ ] **Step 3: Write the resolver implementation**

Create `plugin/src/multi-entry-resolver.ts`:

```typescript
import type { ApiItem, ApiPackage } from "@microsoft/api-extractor-model";

/**
 * A resolved API item with entry point metadata for deduplication
 * and collision detection.
 */
export interface ResolvedEntryItem {
 /** The API item from the model */
 readonly item: ApiItem;
 /** Which entry point defines this item (canonical owner) */
 readonly definingEntryPoint: string;
 /** All entry points that export this item (includes re-exports) */
 readonly availableFrom: string[];
 /** Whether this display name collides with a different item from another entry point */
 readonly hasCollision: boolean;
}

/**
 * Derive an entry point name from its display name in the API model.
 *
 * - Empty string (main entry "." in package.json) maps to "default"
 * - Named entries (e.g., "testing") keep their name
 */
function getEntryPointName(displayName: string): string {
 return displayName === "" ? "default" : displayName;
}

/**
 * Create a stable identity key for an API item based on its display name and kind.
 * Used to detect re-exports across entry points.
 */
function itemKey(item: ApiItem): string {
 return `${item.displayName}::${item.kind}`;
}

/**
 * Resolve all entry points from an API package into a flat list of
 * deduplicated items with collision metadata.
 *
 * - Re-exported items (same displayName + kind across entries) are
 *   deduplicated to a single entry with availableFrom listing all
 *   entry points. The defining entry point prefers "default".
 * - Genuinely different items with the same displayName + kind get
 *   hasCollision: true and separate entries.
 *
 * @param apiPackage - The merged API package with 1+ entry points
 * @returns Flat array of resolved items
 */
export function resolveEntryPoints(apiPackage: ApiPackage): ResolvedEntryItem[] {
 // Step 1: Collect all items grouped by key, tracking which entry points export them
 const itemsByKey = new Map<
  string,
  Array<{
   item: ApiItem;
   entryPointName: string;
  }>
 >();

 for (const entryPoint of apiPackage.entryPoints) {
  const epName = getEntryPointName(entryPoint.displayName);
  for (const member of entryPoint.members) {
   const key = itemKey(member);
   const existing = itemsByKey.get(key) || [];
   existing.push({ item: member, entryPointName: epName });
   itemsByKey.set(key, existing);
  }
 }

 // Step 2: For each key, determine if items are re-exports or collisions
 const results: ResolvedEntryItem[] = [];
 // Track displayName occurrences for collision detection
 const displayNameEntries = new Map<string, string[]>();

 for (const [, entries] of itemsByKey) {
  if (entries.length === 1) {
   // Single entry point exports this item — no dedup or collision
   const { item, entryPointName } = entries[0];
   results.push({
    item,
    definingEntryPoint: entryPointName,
    availableFrom: [entryPointName],
    hasCollision: false,
   });
   // Track for collision detection
   const existing = displayNameEntries.get(item.displayName) || [];
   existing.push(entryPointName);
   displayNameEntries.set(item.displayName, existing);
  } else {
   // Multiple entry points export items with the same key (displayName + kind)
   // These are re-exports: deduplicate to one item, preferring "default"
   const definingEntry = entries.find((e) => e.entryPointName === "default") || entries[0];
   const allEntryPoints = entries.map((e) => e.entryPointName);

   results.push({
    item: definingEntry.item,
    definingEntryPoint: definingEntry.entryPointName,
    availableFrom: allEntryPoints,
    hasCollision: false,
   });
   // Track for collision detection (only one entry since deduped)
   const existing = displayNameEntries.get(definingEntry.item.displayName) || [];
   existing.push(definingEntry.entryPointName);
   displayNameEntries.set(definingEntry.item.displayName, existing);
  }
 }

 // Step 3: Detect collisions — same displayName but different keys (different kind)
 // This happens when e.g., entry A has a class "Config" and entry B has an interface "Config"
 for (const result of results) {
  const allEntriesForName = displayNameEntries.get(result.item.displayName) || [];
  if (allEntriesForName.length > 1) {
   // Multiple resolved items share this displayName — collision
   (result as { hasCollision: boolean }).hasCollision = true;
  }
 }

 return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run plugin/__test__/multi-entry-resolver.test.ts
```

Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/src/multi-entry-resolver.ts plugin/__test__/multi-entry-resolver.test.ts
git commit -m "feat(plugin): add MultiEntryResolver for multi-entry point deduplication

Pure function that resolves all entry points from a merged API model,
deduplicates re-exported items, and detects name collisions.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 2: Update loader.ts to accept ResolvedEntryItem[]

**Files:**

- Modify: `plugin/src/loader.ts:52-106` (`categorizeApiItems`)
- Modify: `plugin/src/loader.ts:115-139` (`extractNamespaceMembers`)

- [ ] **Step 1: Add overload signatures to categorizeApiItems**

In `plugin/src/loader.ts`, add an import for `ResolvedEntryItem` and
modify `categorizeApiItems` to accept either `ApiPackage` (backward
compat) or `ResolvedEntryItem[]`:

At the top of the file, add the import:

```typescript
import type { ResolvedEntryItem } from "./multi-entry-resolver.js";
```

Replace the `categorizeApiItems` method (lines 52-106) with:

```typescript
 /**
  * Extract all API items from a package and categorize them based on configuration.
  * Accepts either an ApiPackage (legacy, uses first entry point) or
  * pre-resolved ResolvedEntryItem[] (multi-entry aware).
  */
 public static categorizeApiItems(
  source: ApiPackage | ResolvedEntryItem[],
  categories: Record<string, CategoryConfig>,
 ): Record<string, ApiItem[]> {
  // Initialize empty arrays for each category
  const items: Record<string, ApiItem[]> = {};
  for (const categoryKey of Object.keys(categories)) {
   items[categoryKey] = [];
  }

  // Extract the list of items to categorize
  let members: ApiItem[];
  if (Array.isArray(source)) {
   // ResolvedEntryItem[] — use the resolved items directly
   members = source.map((r) => r.item);
  } else {
   // ApiPackage — legacy path, use first entry point
   const entryPoint = source.entryPoints[0];
   if (!entryPoint) {
    return items;
   }
   members = [...entryPoint.members];
  }

  // Sort categories: those with tsdocModifier first (higher priority)
  const sortedCategories = Object.entries(categories).sort((a, b) => {
   const [, configA] = a;
   const [, configB] = b;
   // Categories with tsdocModifier come first
   if (configA.tsdocModifier && !configB.tsdocModifier) return -1;
   if (!configA.tsdocModifier && configB.tsdocModifier) return 1;
   return 0;
  });

  // Categorize each member
  for (const member of members) {
   let categorized = false;

   // Check each category's rules (sorted by priority)
   for (const [categoryKey, config] of sortedCategories) {
    // First check TSDoc modifier (takes precedence)
    if (config.tsdocModifier && ApiParser.hasModifierTag(member, config.tsdocModifier)) {
     items[categoryKey].push(member);
     categorized = true;
     break;
    }

    // Then check item kind
    if (config.itemKinds?.includes(member.kind)) {
     items[categoryKey].push(member);
     categorized = true;
     break;
    }
   }

   // Log warning if item wasn't categorized
   if (!categorized) {
    console.warn(`⚠️  API item "${member.displayName}" (kind: ${member.kind}) not categorized`);
   }
  }

  return items;
 }
```

- [ ] **Step 2: Update extractNamespaceMembers similarly**

Replace the `extractNamespaceMembers` method (lines 115-139) with:

```typescript
 /**
  * Extract all members from namespaces.
  * Accepts either an ApiPackage (legacy, uses first entry point) or
  * pre-resolved ResolvedEntryItem[] (multi-entry aware).
  */
 public static extractNamespaceMembers(source: ApiPackage | ResolvedEntryItem[]): NamespaceMember[] {
  const members: NamespaceMember[] = [];

  let topLevelItems: ApiItem[];
  if (Array.isArray(source)) {
   topLevelItems = source.map((r) => r.item);
  } else {
   const entryPoint = source.entryPoints[0];
   if (!entryPoint) {
    return members;
   }
   topLevelItems = [...entryPoint.members];
  }

  // Find all namespaces
  for (const item of topLevelItems) {
   if (item.kind === ApiItemKind.Namespace) {
    const namespace = item as ApiNamespace;
    for (const member of namespace.members) {
     members.push({
      item: member,
      namespace,
      qualifiedName: `${namespace.displayName}.${member.displayName}`,
     });
    }
   }
  }

  return members;
 }
```

- [ ] **Step 3: Run existing tests to verify backward compatibility**

```bash
pnpm vitest run plugin/
```

Expected: All existing tests PASS (the ApiPackage path is unchanged)

- [ ] **Step 4: Commit**

```bash
git add plugin/src/loader.ts
git commit -m "refactor(plugin): update loader to accept ResolvedEntryItem[]

categorizeApiItems and extractNamespaceMembers now accept either
ApiPackage (backward compatible) or ResolvedEntryItem[] for
multi-entry aware processing.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 3: Update WorkItem and prepareWorkItems

**Files:**

- Modify: `plugin/src/build-stages.ts:39-44` (WorkItem interface)
- Modify: `plugin/src/build-stages.ts:112-207` (prepareWorkItems function)

- [ ] **Step 1: Add import and update WorkItem interface**

In `plugin/src/build-stages.ts`, add the import at the top (after
existing imports):

```typescript
import { resolveEntryPoints } from "./multi-entry-resolver.js";
import type { ResolvedEntryItem } from "./multi-entry-resolver.js";
```

Update the `WorkItem` interface (lines 39-44):

```typescript
export interface WorkItem {
 readonly item: ApiItem;
 readonly categoryKey: string;
 readonly categoryConfig: CategoryConfig;
 readonly namespaceMember?: NamespaceMember;
 /** Entry points this item is available from (e.g., ["default", "testing"]) */
 readonly availableFrom?: string[];
 /** Entry point URL segment, set only when displayName collides across entry points */
 readonly entryPointSegment?: string;
}
```

- [ ] **Step 2: Update prepareWorkItems to use the resolver**

Replace the `prepareWorkItems` function (lines 112-207) with:

```typescript
/**
 * Prepare the flat list of WorkItems to process and the cross-link data maps.
 *
 * This function:
 * 1. Resolves entry points (deduplication + collision detection)
 * 2. Categorizes resolved items
 * 3. Builds cross-link routes and kinds maps
 * 4. Extracts namespace members and adds their routes (with collision detection)
 * 5. Flattens all items into a single WorkItem[]
 */
export function prepareWorkItems(input: PrepareWorkItemsInput): PrepareWorkItemsResult {
 const { apiPackage, categories, baseRoute } = input;

 // 1. Resolve entry points: deduplicate re-exports, detect collisions
 const resolvedItems = resolveEntryPoints(apiPackage);

 // Build a lookup from item to its resolved metadata
 const resolvedByDisplayNameKind = new Map<string, ResolvedEntryItem>();
 for (const r of resolvedItems) {
  resolvedByDisplayNameKind.set(`${r.item.displayName}::${r.item.kind}`, r);
 }

 // 2. Categorize resolved items
 const items = ApiParser.categorizeApiItems(resolvedItems, categories);

 // 3. Build cross-link routes and kinds maps directly
 const routes = new Map<string, string>();
 const kinds = new Map<string, string>();

 for (const [categoryKey, categoryConfig] of Object.entries(categories)) {
  const categoryItems = items[categoryKey] || [];
  for (const item of categoryItems) {
   const resolved = resolvedByDisplayNameKind.get(`${item.displayName}::${item.kind}`);
   const segment = resolved?.hasCollision ? resolved.definingEntryPoint : undefined;
   const itemRoute = segment
    ? `${baseRoute}/${categoryConfig.folderName}/${segment}/${item.displayName.toLowerCase()}`
    : `${baseRoute}/${categoryConfig.folderName}/${item.displayName.toLowerCase()}`;
   routes.set(item.displayName, itemRoute);
   kinds.set(item.displayName, item.kind);

   // For classes and interfaces, also add routes for their members
   if (item.kind === "Class" || item.kind === "Interface") {
    const itemWithMembers = item as ApiClass | ApiInterface;
    for (const member of itemWithMembers.members) {
     const memberName = member.displayName;
     const memberId = sanitizeId(memberName);
     const fullMemberName = `${item.displayName}.${memberName}`;
     const memberRoute = `${itemRoute}#${memberId}`;
     routes.set(fullMemberName, memberRoute);
     kinds.set(fullMemberName, member.kind);
    }
   }
  }
 }

 // 4. Extract namespace members and add their routes with collision detection
 const namespaceMembers = ApiParser.extractNamespaceMembers(resolvedItems);

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

  // Always add qualified name (e.g., "Formatters.FormatOptions")
  routes.set(nsMember.qualifiedName, qualifiedRoute);
  kinds.set(nsMember.qualifiedName, nsMember.item.kind);

  // Add unqualified PascalCase name if no collision and not already present
  const displayName = nsMember.item.displayName;
  const isPascalCase = /^[A-Z]/.test(displayName);
  if (isPascalCase && (unqualifiedNameCounts.get(displayName) || 0) <= 1 && !routes.has(displayName)) {
   routes.set(displayName, qualifiedRoute);
   kinds.set(displayName, nsMember.item.kind);
  }
 }

 // 5. Flatten all items into a single WorkItem[]
 const workItems: WorkItem[] = [];

 for (const [categoryKey, categoryConfig] of Object.entries(categories)) {
  const categoryItems = items[categoryKey] || [];
  for (const item of categoryItems) {
   const resolved = resolvedByDisplayNameKind.get(`${item.displayName}::${item.kind}`);
   workItems.push({
    item,
    categoryKey,
    categoryConfig,
    availableFrom: resolved?.availableFrom,
    entryPointSegment: resolved?.hasCollision ? resolved.definingEntryPoint : undefined,
   });
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

- [ ] **Step 3: Update the markdownCrossLinker.initialize call in build-program.ts**

In `plugin/src/build-program.ts`, update the import and the call at
line 80 to pass resolved items:

Add import:

```typescript
import { resolveEntryPoints } from "./multi-entry-resolver.js";
```

Replace line 80:

```typescript
markdownCrossLinker.initialize(ApiParser.categorizeApiItems(apiPackage, categories), baseRoute, categories);
```

With:

```typescript
const resolvedItems = resolveEntryPoints(apiPackage);
markdownCrossLinker.initialize(ApiParser.categorizeApiItems(resolvedItems, categories), baseRoute, categories);
```

- [ ] **Step 4: Run all tests**

```bash
pnpm vitest run plugin/
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/src/build-stages.ts plugin/src/build-program.ts
git commit -m "feat(plugin): update prepareWorkItems for multi-entry resolution

WorkItem now carries availableFrom and entryPointSegment fields.
prepareWorkItems uses resolveEntryPoints to deduplicate re-exports
and detect collisions. Route computation inserts entry point segment
only for colliding items.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 4: Add "Available from" display in page generators

**Files:**

- Modify: `plugin/src/markdown/helpers.ts`
- Modify: `plugin/src/build-stages.ts:246-450` (generateSinglePage)
- Modify: `plugin/src/markdown/page-generators/class-page.ts`
- Modify: `plugin/src/markdown/page-generators/interface-page.ts`
- Modify: `plugin/src/markdown/page-generators/function-page.ts`
- Modify: `plugin/src/markdown/page-generators/type-alias-page.ts`
- Modify: `plugin/src/markdown/page-generators/enum-page.ts`
- Modify: `plugin/src/markdown/page-generators/variable-page.ts`
- Modify: `plugin/src/markdown/page-generators/namespace-page.ts`

- [ ] **Step 1: Add the helper function in helpers.ts**

In `plugin/src/markdown/helpers.ts`, add:

```typescript
/**
 * Generate an "Available from" line for items exported from multiple entry points.
 * Returns empty string if only one entry point or none provided.
 *
 * @param packageName - The package name (e.g., "kitchensink")
 * @param availableFrom - Entry point names (e.g., ["default", "testing"])
 * @returns Markdown line or empty string
 */
export function generateAvailableFrom(packageName: string, availableFrom?: string[]): string {
 if (!availableFrom || availableFrom.length <= 1) {
  return "";
 }
 const paths = availableFrom
  .map((ep) => (ep === "default" ? `\`${packageName}\`` : `\`${packageName}/${ep}\``))
  .join(", ");
 return `Available from: ${paths}\n\n`;
}
```

- [ ] **Step 2: Add availableFrom to each page generator's generate() signature**

For each page generator (`class-page.ts`, `interface-page.ts`,
`function-page.ts`, `type-alias-page.ts`, `enum-page.ts`,
`variable-page.ts`, `namespace-page.ts`), add `availableFrom?: string[]`
as the last parameter of the `generate()` method, and insert the
"Available from" line after the summary in the generated content.

The pattern for each generator is the same. After the line that generates
the summary text and before the signature section, add:

```typescript
import { generateAvailableFrom } from "../helpers.js";

// ... inside generate(), after summary line:
content += generateAvailableFrom(packageName, availableFrom);
```

Each generator already has a `packageName` parameter. The
`availableFrom` parameter is added at the end of the parameter list.

- [ ] **Step 3: Update generateSinglePage to pass availableFrom**

In `plugin/src/build-stages.ts`, update each `generator.generate()` call
in the switch statement to pass `workItem.availableFrom` as the last
argument. For example, the class case (lines 271-283) becomes:

```typescript
page = yield* Effect.promise(() =>
 generator.generate(
  item as ApiClass,
  baseRoute,
  packageName,
  categoryConfig.singularName,
  apiScope,
  apiName,
  source,
  suppressExampleErrors,
  llmsPlugin,
  workItem.availableFrom,
 ),
);
```

Apply the same change to all 7 generator calls in the switch statement.

- [ ] **Step 4: Run all tests**

```bash
pnpm vitest run plugin/
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/src/markdown/helpers.ts plugin/src/markdown/page-generators/ plugin/src/build-stages.ts
git commit -m "feat(plugin): add 'Available from' display for multi-entry items

Page generators now accept availableFrom parameter and render an
'Available from' line when an item is exported from multiple entry
points.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 5: Update navigation labels for colliding items

**Files:**

- Modify: `plugin/src/build-stages.ts:831-860` (category `_meta.json` generation)

- [ ] **Step 1: Update the label generation in writeMetadata**

In `plugin/src/build-stages.ts`, in the category `_meta.json` section
(around line 835), the code builds entries from `fileResults`. Update
it to use a qualified label when the work item has a collision.

The `FileWriteResult` currently has a `label` field. We need to update
`writeSingleFile` to set the label with the entry point qualifier when
there is a collision. In `writeSingleFile` (around line 600), the label
is set from the item's `displayName`. Change it to:

```typescript
const label = workItem.entryPointSegment
 ? `${workItem.item.displayName} (${workItem.entryPointSegment})`
 : workItem.item.displayName;
```

Find where `label` is assigned in `writeSingleFile` and update it.
The rest of the metadata generation already uses `result.label` from
`FileWriteResult`, so the qualified label flows through automatically.

- [ ] **Step 2: Run all tests**

```bash
pnpm vitest run plugin/
```

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add plugin/src/build-stages.ts
git commit -m "feat(plugin): qualify navigation labels for colliding items

Items with display name collisions across entry points get labels
like 'Config (default)' and 'Config (testing)' in _meta.json.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 6: Integration verification

**Files:**

- None (verification only)

- [ ] **Step 1: Build all modules and the basic site**

```bash
pnpm run build
```

Expected: Build succeeds. The kitchensink module produces a merged
model with 2 entry points. The plugin processes both entry points.

- [ ] **Step 2: Verify pages generated for testing entry items**

Check that `MockLogger`, `TestRunner`, `createMockResult`, and
`TestHook` pages were generated in the basic site output:

```bash
find sites/basic -name "mocklogger.mdx" -o -name "testrunner.mdx" -o -name "createmockresult.mdx" -o -name "testhook.mdx" | sort
```

Expected: All 4 files found in the appropriate category directories.

- [ ] **Step 3: Verify re-exported items are deduplicated**

Check that `Logger` only has one page (not two):

```bash
find sites/basic -name "logger.mdx" | wc -l
```

Expected: 1

- [ ] **Step 4: Verify "Available from" in re-exported item**

```bash
grep -l "Available from:" sites/basic/docs/api/class/logger.mdx
```

Expected: The file matches, containing the "Available from" line.

- [ ] **Step 5: Verify no collisions exist (flat URLs)**

```bash
find sites/basic/docs/api -type d -name "default" -o -type d -name "testing"
```

Expected: No results (no entry point segment directories since
kitchensink has no collisions).

- [ ] **Step 6: Run full test suite**

```bash
pnpm run test
```

Expected: All tests PASS.

- [ ] **Step 7: Commit any generated output changes if needed**

If site model files changed due to the build, commit them separately:

```bash
git add -A sites/
git commit -m "chore: update site outputs after multi-entry support

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```
