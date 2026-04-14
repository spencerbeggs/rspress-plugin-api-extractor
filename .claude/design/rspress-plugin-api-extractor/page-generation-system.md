---
status: current
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-04-09
last-synced: 2026-04-09
completeness: 85
related:
  - rspress-plugin-api-extractor/build-architecture.md
  - rspress-plugin-api-extractor/snapshot-tracking-system.md
  - rspress-plugin-api-extractor/cross-linking-architecture.md
  - rspress-plugin-api-extractor/component-development.md
  - rspress-plugin-api-extractor/multi-entry-point-support.md
dependencies: []
---

# Page Generation System

**Status:** Production-ready (Effect Stream pipeline)

## Table of Contents

- [Overview](#overview)
- [Stream Pipeline Architecture](#stream-pipeline-architecture)
- [Build Stages](#build-stages)
- [Page Generators](#page-generators)
- [Metadata Generation](#metadata-generation)
- [Integration Points](#integration-points)

## Overview

The page generation system transforms Microsoft API Extractor models
into markdown/MDX files for RSPress. It uses a Stream-based pipeline
in `build-stages.ts` composed of Effect programs, with specialized
class-based generators for each API item category.

**Key Features:**

- **Effect Stream pipeline** for concurrent page generation and writing
- **5-stage build process** orchestrated by `build-program.ts`
- **Multi-entry point resolution** via `MultiEntryResolver` for
  deduplication and collision detection
- **Class-based generators** for each API category (class, interface,
  function, type alias, enum, variable, namespace)
- **Snapshot-tracked writes** for incremental builds
- **Cross-linking** via ShikiCrossLinker and MarkdownCrossLinker
- **Effect Metrics** for build statistics

## Stream Pipeline Architecture

### Pipeline Definition (build-stages.ts)

The core pipeline is defined in `buildPipelineForApi`:

```typescript
return Stream.fromIterable(input.workItems).pipe(
  // Stage 1: Generate page content + hashes + timestamps
  Stream.mapEffect(
    (workItem) => generateSinglePage(workItem, generateCtx),
    { concurrency: input.pageConcurrency },
  ),
  // Filter nulls (unsupported item kinds)
  Stream.filter(
    (result): result is GeneratedPageResult => result !== null,
  ),
  // Stage 2: Write file to disk (no-op for unchanged)
  Stream.mapEffect(
    (result) => writeSingleFile(result, writeCtx),
    { concurrency: input.pageConcurrency },
  ),
  // Fold: accumulate all results
  Stream.runFold(
    [] as FileWriteResult[],
    (acc, result) => [...acc, result],
  ),
);
```

**Concurrency:** Controlled by `pageConcurrency` (from
`PerformanceConfig`, defaults vary by environment).

### Data Types

```typescript
interface WorkItem {
  item: ApiItem;
  categoryKey: string;
  categoryConfig: CategoryConfig;
  namespaceMember?: NamespaceMember;
  /** Entry points this item is available from */
  availableFrom?: string[];
  /** Entry point URL segment, set only when displayName collides */
  entryPointSegment?: string;
}

interface GeneratedPageResult {
  workItem: WorkItem;
  content: string;
  bodyContent: string;
  frontmatter: Record<string, unknown>;
  contentHash: string;
  frontmatterHash: string;
  routePath: string;
  relativePathWithExt: string;
  publishedTime: string;
  modifiedTime: string;
  isUnchanged: boolean;
}

interface FileWriteResult {
  relativePathWithExt: string;
  absolutePath: string;
  status: "new" | "modified" | "unchanged";
  snapshot: FileSnapshot;
  categoryKey: string;
  label: string;
  routePath: string;
}
```

## Build Stages

### Stage 0: prepareWorkItems (sync, pure)

**Location:** `build-stages.ts` `prepareWorkItems()`

Runs before the Stream pipeline. Produces:

1. **Multi-entry resolution** -- `resolveEntryPoints()` from
   `multi-entry-resolver.ts` deduplicates re-exports across entry
   points and detects name collisions (same displayName, different
   kind). Each item receives `availableFrom` and collision metadata.
2. **Categorized items** -- API items grouped by category key via
   `ApiParser.categorizeApiItems()`, which accepts
   `ResolvedEntryItem[]` (multi-entry) or `ApiPackage` (legacy)
3. **Cross-link routes** -- Map of type name to route path; routes
   include an extra entry-point segment for colliding items
4. **Cross-link kinds** -- Map of type name to API item kind
5. **Namespace member extraction** with collision detection
6. **Flat WorkItem array** -- Each item carries `availableFrom` and
   optionally `entryPointSegment` (set only for collisions)

### Stage 1: generateSinglePage (Effect)

**Location:** `build-stages.ts` `generateSinglePage()`

For each WorkItem:

1. Dispatch to the appropriate page generator based on `item.kind`
2. Parse generated content with `gray-matter`
3. Normalize markdown spacing
4. Hash content and frontmatter via `content-hash.ts`
5. Compare hashes against pre-loaded snapshot map
6. If no snapshot exists, fall back to disk comparison
7. Determine timestamps (new/modified/unchanged)
8. Return `GeneratedPageResult`

### Stage 2: writeSingleFile (Effect)

**Location:** `build-stages.ts` `writeSingleFile()`

For each GeneratedPageResult:

1. If unchanged, increment metrics and return immediately (no disk write)
2. Resolve Open Graph metadata (if `ogResolver` configured)
3. Regenerate frontmatter with OG metadata
4. Create directory if needed (`FileSystem.makeDirectory`)
5. Write file (`FileSystem.writeFileString`)
6. Increment file metrics (new/modified)
7. Return `FileWriteResult` with snapshot data

### Stage 3: writeMetadata (Effect)

**Location:** `build-stages.ts` `writeMetadata()`

Writes three groups of metadata after the Stream pipeline:

1. **Root `_meta.json`** -- Category folder entries with
   collapsible/collapsed settings
2. **Main index page** (`index.mdx`) -- API landing page (skipped if
   already exists)
3. **Category `_meta.json` files** -- Sorted navigation entries per
   category folder

All writes use snapshot tracking for incremental builds.

### Stage 4: cleanupAndCommit (Effect)

**Location:** `build-stages.ts` `cleanupAndCommit()`

1. **Batch upsert** -- All changed snapshots in a single transaction
2. **Stale cleanup** -- Delete DB rows and disk files for items no
   longer in the API model
3. **Orphan cleanup** -- Delete disk files not tracked in
   `generatedFiles` set

## Page Generators

### Generator Classes

Each generator produces `{ routePath: string; content: string }`:

| Generator | Location | Handles |
| --- | --- | --- |
| `ClassPageGenerator` | `markdown/class-page.ts` | `ApiClass` |
| `InterfacePageGenerator` | `markdown/interface-page.ts` | `ApiInterface` |
| `FunctionPageGenerator` | `markdown/function-page.ts` | `ApiFunction` |
| `TypeAliasPageGenerator` | `markdown/type-alias-page.ts` | `ApiTypeAlias` |
| `EnumPageGenerator` | `markdown/enum-page.ts` | `ApiEnum` |
| `VariablePageGenerator` | `markdown/variable-page.ts` | `ApiVariable` |
| `NamespacePageGenerator` | `markdown/namespace-page.ts` | `ApiNamespace` |
| `MainIndexPageGenerator` | `markdown/main-index-page.ts` | Index page |

### Generator Interface

All generators follow the same pattern:

```typescript
class XxxPageGenerator {
  async generate(
    item: ApiXxx,
    baseRoute: string,
    packageName: string,
    singularName: string,
    apiScope: string,
    apiName?: string,
    source?: SourceConfig,
    suppressExampleErrors?: boolean,
    llmsPlugin?: LlmsPlugin,
    availableFrom?: string[],
  ): Promise<{ routePath: string; content: string }>
}
```

The `availableFrom` parameter is passed from `WorkItem.availableFrom`.
When the item is exported from multiple entry points, the generator
calls `generateAvailableFrom()` to emit an "Available from" line
listing all entry point import paths.

The generators are called via `Effect.promise()` in `generateSinglePage`
since they use async operations (Shiki highlighting, Prettier formatting)
that are not yet Effect-native.

### Page Structure

Generated MDX files follow this structure:

```markdown
---
title: "ItemName | Category | API | PackageName"
description: "Brief summary"
head:
  - - meta
    - property: "article:published_time"
      content: "2026-01-15T12:00:00.000Z"
  - - meta
    - property: "article:modified_time"
      content: "2026-01-17T10:30:00.000Z"
---

import { SignatureBlock, ParametersTable }
  from "rspress-plugin-api-extractor/runtime";

# ItemName

Available from: `package-name`, `package-name/testing`

Summary text.

## Signature

<SignatureBlock>
...signature code block...
</SignatureBlock>

## Members / Parameters / Values
...
```

The "Available from" line appears only when the item is exported from
more than one entry point.

### Helper Functions

**Location:** `markdown/helpers.ts`

- `generateAvailableFrom()` -- Renders "Available from" line for
  multi-entry items (returns empty string for single-entry)
- `generateFrontmatter()` -- YAML frontmatter with OG tags
- `prepareExampleCode()` -- Adds imports and `// @noErrors` for Twoslash
- `stripTwoslashDirectives()` -- Removes directives for copy button
- `sanitizeId()` -- URL-safe HTML IDs
- `escapeYamlString()` -- YAML special character escaping
- `escapeMdxGenerics()` -- Wraps `<T>` in backticks for MDX

### MemberFormatTransformer

**Location:** `hide-cut-transformer.ts`

Formats member signature blocks by hiding the class/interface wrapper:

```typescript
// Input (3-line structure):
class Foo {
  memberSignature(): void;
}

// Output (after transformer):
memberSignature(): void;
```

Hides line 0 (class opening) and last line (closing brace), removes
left padding from line 1.

## Metadata Generation

### _meta.json Structure

**Root `_meta.json`:**

```json
[
  {
    "type": "dir",
    "name": "class",
    "label": "Classes",
    "collapsible": true,
    "collapsed": true,
    "overviewHeaders": [2]
  }
]
```

**Category `_meta.json`:**

```json
[
  { "type": "file", "name": "myclass", "label": "MyClass" },
  { "type": "file", "name": "otherclass", "label": "OtherClass" }
]
```

Entries are sorted alphabetically by label. When an item has
`entryPointSegment` set (name collision across entry points), the label
includes the qualifier: `"MyClass (testing)"`.

## Integration Points

### Cross-Linking

Cross-linkers are initialized in `build-program.ts` with data from
`prepareWorkItems`:

```typescript
markdownCrossLinker.initialize(categorizedItems, baseRoute, categories);
shikiCrossLinker.reinitialize(routes, kinds, apiScope);
TwoslashManager.addTypeRoutes(routes);
```

### VFS Registry

Each API registers its VFS config for the remark plugin:

```typescript
VfsRegistry.register(apiScope, {
  vfs: new Map(),
  highlighter,
  crossLinker: shikiCrossLinker,
  packageName,
  apiScope,
  twoslashTransformer,
  hideCutTransformer,
  hideCutLinesTransformer,
  theme,
});
```

### Remark Plugins

Two remark plugins process code blocks in the RSPress build phase:

- `remarkWithApi` -- User-authored `with-api` code blocks
- `remarkApiCodeblocks` -- Generated API doc code blocks

Both use the VfsRegistry to access the highlighter and transformers.

## Related Documentation

- **Build Architecture:**
  `build-architecture.md` -- Plugin structure and service layer
- **Multi-Entry Point Support:**
  `multi-entry-point-support.md` -- Entry point resolution,
  deduplication, collision detection, and VFS generation
- **Snapshot Tracking System:**
  `snapshot-tracking-system.md` -- Incremental build tracking
- **Cross-Linking Architecture:**
  `cross-linking-architecture.md` -- Type reference linking
- **Component Development:**
  `component-development.md` -- Runtime components used in generated pages
- **SSG-Compatible Components:**
  `ssg-compatible-components.md` -- Dual-mode components
- **LLMs Integration:**
  `llms-integration.md` -- LLMs file generation and UI
