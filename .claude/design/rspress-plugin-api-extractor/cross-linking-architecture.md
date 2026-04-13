---
status: current
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-04-13
last-synced: 2026-04-13
completeness: 90
related:
  - rspress-plugin-api-extractor/page-generation-system.md
  - rspress-plugin-api-extractor/build-architecture.md
  - rspress-plugin-api-extractor/ssg-compatible-components.md
  - rspress-plugin-api-extractor/import-generation-system.md
dependencies: []
---

# Cross-Linking Architecture

**Status:** Production-ready

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [MarkdownCrossLinker](#markdowncrosslinker)
- [ShikiCrossLinker](#shikicrosslinker)
- [URL Generation](#url-generation)
- [Type Matching Algorithm](#type-matching-algorithm)
- [Backtick Code Span Safety](#backtick-code-span-safety)
- [Integration Points](#integration-points)
- [VfsRegistry](#vfsregistry)
- [Testing](#testing)
- [File Locations](#file-locations)

---

## Overview

The cross-linking system turns type references into clickable links
throughout generated API documentation. It operates at two levels:

1. **Markdown text** -- `MarkdownCrossLinker` replaces type names in
   prose descriptions with `[TypeName](/route)` links during page
   generation.
2. **Code blocks** -- `ShikiCrossLinker` post-processes Shiki HAST
   output to wrap type identifiers in `<a>` tags, including inside
   Twoslash hover tooltips.

Both cross-linkers use module-level singleton instances, initialized
once per API scope during the build, and shared across all page
generators and remark plugins.

### Key Design Decisions

- **Scope-based isolation** -- Routes are stored per API scope in Maps,
  enabling multi-API builds without cross-contamination.
- **Longest-first matching** -- Names are sorted descending by length
  so "HookEvent" matches before "Hook".
- **Post-processing over inline transformation** -- The ShikiCrossLinker
  transforms HAST after Shiki/Twoslash rendering (not during), to avoid
  interfering with Twoslash popup positioning.
- **Backtick-aware filtering** -- Both cross-linkers and the MDX
  generics escaper detect backtick code spans and skip processing
  inside them.

---

## Architecture

### Data Flow

```text
prepareWorkItems (build-stages.ts)
  ├─> resolveEntryPoints() for multi-entry deduplication
  ├─> Build routes Map: typeName → routePath
  ├─> Build kinds Map: typeName → apiItemKind
  └─> Return crossLinkData: { routes, kinds }
         │
         ├─> markdownCrossLinker.initialize(categorizedItems, baseRoute, categories)
         │     Builds its own apiItemRoutes map from category structure
         │
         ├─> shikiCrossLinker.reinitialize(routes, kinds, apiScope)
         │     Stores routes/kinds per scope, builds classMembersMap
         │
         └─> VfsRegistry.register(apiScope, { crossLinker: shikiCrossLinker, ... })
               Makes cross-linker available to remark plugins

Page generation (page-generators/*.ts)
  └─> markdownCrossLinker.addCrossLinks(descriptionText)
        Markdown text → markdown text with [TypeName](/route) links

Code block rendering (remark-api-codeblocks.ts)
  └─> shikiCrossLinker.transformHast(hast, apiScope)
        HAST → HAST with <a> anchors on type references
```

### Singleton Instances

```typescript
// src/markdown/cross-linker.ts
export const markdownCrossLinker: MarkdownCrossLinker =
  new MarkdownCrossLinker();

// src/shiki-transformer.ts — instantiated per plugin call
const shikiCrossLinker = new ShikiCrossLinker();
```

The `MarkdownCrossLinker` is a true module-level singleton. The
`ShikiCrossLinker` is created per plugin instantiation and passed
into the `VfsRegistry` for scope-keyed retrieval by remark plugins.

---

## MarkdownCrossLinker

**Location:** `src/markdown/cross-linker.ts`

Transforms type references in plain markdown text into clickable links.
Used by page generators to cross-link descriptions, parameter docs, and
remarks.

### Interface

```typescript
class MarkdownCrossLinker {
  clear(): void;
  addRoutes(
    items: Record<string, CrossLinkableItem[]>,
    baseRoute: string,
    categories: Record<string, { folderName: string }>,
  ): { routes: Map<string, string>; kinds: Map<string, string> };
  initialize(...): { routes, kinds };  // deprecated: clear() + addRoutes()
  addCrossLinks(text: string): string;
  addCrossLinksHtml(text: string): string;
}
```

### State

Single `Map<string, string>` mapping display names to route paths.
Populated by `addRoutes()`, which iterates each category's items:

- **Top-level items:** `"MyClass"` → `"/api/classes/myclass"`
- **Class/interface members:** `"MyClass.method"` → `"/api/classes/myclass#method"`

Member routes are constructed using `sanitizeId()` for the anchor
fragment. Only classes and interfaces have member routes registered.

### addCrossLinks

Replaces standalone type names in text with markdown links:

1. Sort all registered names by length descending.
2. For each name, build regex: `\b${name}\b(?![a-zA-Z])`.
3. For each match, check:
   - Not inside an existing markdown link (`](` or `[` prefix).
   - Not inside a backtick code span (odd backtick count before offset).
4. Replace with `[${name}](${route})`.

### addCrossLinksHtml

Same logic but produces `<a href="${route}">${name}</a>`. Detects
existing HTML `<a>` tags instead of markdown link syntax.

---

## ShikiCrossLinker

**Location:** `src/shiki-transformer.ts`

Post-processes Shiki-generated HAST (Hypertext Abstract Syntax Tree) to
add clickable type reference links in syntax-highlighted code blocks,
including inside Twoslash hover tooltips.

### State

Three scope-indexed Maps for multi-API isolation:

```typescript
private apiItemRoutesByScope: Map<string, Map<string, string>>;
private apiItemKindsByScope: Map<string, Map<string, string>>;
private classMembersMapByScope: Map<string, Map<string, string[]>>;
```

`classMembersMap` groups member names by their parent class/namespace.
For example, if routes contain `"Logger.addTransport"`, the map stores
`"Logger"` → `["addTransport"]`, sorted by length descending.

### Interface

```typescript
class ShikiCrossLinker {
  reinitialize(
    routes: Map<string, string>,
    kinds: Map<string, string>,
    apiScope: string,
  ): void;

  setApiScope(apiScope: string): void;

  transformHast(hast: Root, apiScope?: string): Root;

  createTransformer(): ShikiTransformer;  // deprecated, returns no-op
}
```

### Three-Phase HAST Transformation

`transformHast()` delegates to `transformRootWithScope()`, which walks
the HAST tree in three phases per line:

#### Phase 1: Class/Namespace Member Linking

Maintains a `scopeStack` to track nested class, interface, and namespace
declarations. When inside a class body:

```text
class Logger {        ← push "Logger" onto scopeStack
  addTransport(): void;  ← check "Logger.addTransport" in routes
}                     ← pop scopeStack
```

Detects class/namespace boundaries by matching opening braces against
closing braces. When `currentScope` is set, attempts to match span
content as `${currentScope}.${content}` against the routes map.

#### Phase 2: Twoslash Tooltip Method Extraction

Finds `.twoslash-hover` spans and extracts method signatures from their
tooltip code blocks using regex:

```text
/^(?:\([^)]+\)\s+)?
  (?:(?:function|interface|class|enum|type|namespace|const|let|var)\s+)?
  ([A-Z]\w+)\.(\w+)[(:]/
```

This matches patterns like:

- `function Formatters.formatEntry(`
- `interface Formatters.Options`
- `(property) Logger.addTransport:`

When a match is found, the method name span is linked to the qualified
route `${className}.${methodName}`.

#### Phase 3a/3b: Type Reference Linking

Builds a regex pattern from all top-level type names (excluding dotted
member names) and processes:

- **3a:** Type references inside `.twoslash-hover` spans (tooltip type
  info).
- **3b:** Type references in regular code text.

The `linkTypeReferencesInLine()` helper walks element children, splits
text nodes at type reference boundaries, and inserts `<a>` elements
with class `api-type-link` and `data-api-processed` attribute.

Skips spans already processed by Phase 1 or 2 (detected via
`data-api-processed` attribute).

### Why Post-Processing?

The `createTransformer()` method (which would run during Shiki
rendering) is deprecated and returns a no-op. Cross-linking was moved
to post-processing via `transformHast()` because:

- Twoslash popup positioning depends on the original HAST structure.
- Modifying spans during rendering caused popup containers to shift or
  break.
- Post-processing the final HAST avoids these timing issues entirely.

---

## URL Generation

### Route Path Structure

Routes are constructed in `prepareWorkItems` (`build-stages.ts`):

```text
{baseRoute}/{categoryFolderName}/{itemDisplayName}

Examples:
  /api/classes/myclass
  /api/functions/createpipeline
  /api/interfaces/iconfig
  /api/enums/loglevel
  /api/types/options
  /api/variables/version
```

### Member Anchors

Class and interface members use fragment anchors:

```text
/api/classes/myclass#addtransport
/api/classes/myclass#static-create
/api/interfaces/iconfig#timeout
```

Anchor IDs are generated by `sanitizeId(displayName, prefix?)`:
lowercase, spaces/underscores → hyphens, strip special chars,
optional prefix for disambiguation (e.g., `"static"`).

### Multi-Entry Collision Segments

When `hasCollision` is true (same display name, different kind across
entry points), an entry-point segment is inserted:

```text
/api/classes/default/config
/api/classes/testing/config
```

See `multi-entry-point-support.md` for details.

### Namespace Members

Namespace members use qualified names with the namespace prefix:

```text
/api/functions/formatters.formatentry
/api/interfaces/formatters.formatoptions
```

PascalCase members also get an unqualified route if no collision
exists with a top-level item of the same name.

### Route Construction Code

```typescript
// Top-level item
const route = `${baseRoute}/${folderName}/${displayName.toLowerCase()}`;

// With collision segment
const route = `${baseRoute}/${folderName}/${segment}/${displayName.toLowerCase()}`;

// Class/interface member
const memberRoute = `${itemRoute}#${sanitizeId(memberName)}`;

// Namespace member (qualified)
const qualifiedRoute = `${baseRoute}/${folderName}/${qualifiedName.toLowerCase()}`;
```

---

## Type Matching Algorithm

### Longest-First Ordering

Both cross-linkers sort registered names by length descending before
matching. This prevents partial matches:

```text
Names: ["HookEvent", "Hook", "Event"]
Sorted: ["HookEvent", "Hook", "Event"]

Text: "Handles a HookEvent"
Match: "HookEvent" (not "Hook" + leftover "Event")
```

### Word Boundary Regex

```typescript
const regex = new RegExp(`\\b${name}\\b(?![a-zA-Z])`, "g");
```

- `\b` ensures the match starts and ends at a word boundary.
- `(?![a-zA-Z])` negative lookahead prevents matching "MyClass" inside
  "MyClassFactory".

### Conflict Avoidance

**MarkdownCrossLinker:**

- Skips matches inside existing markdown links (checks for `](` or `[`
  prefix before the match offset).
- Skips matches inside backtick code spans (odd backtick count).

**ShikiCrossLinker:**

- `data-api-processed` attribute prevents double-processing across
  phases.
- Dotted member names (e.g., `"Logger.addTransport"`) are filtered out
  of the Phase 3 regex pattern to avoid matching partial text. Only
  top-level names participate in generic type reference linking.
- Phase 1 handles dotted names via scope-stack context.
- Phase 2 handles dotted names via Twoslash tooltip parsing.

### Scope Isolation

The ShikiCrossLinker stores routes per API scope. When processing a
code block, the scope is determined by the file path or explicit
parameter. Routes from other scopes are not visible, preventing
false matches in multi-API builds.

---

## Backtick Code Span Safety

Both `addCrossLinks()` and the `escapeMdxGenerics()` helper detect
backtick code spans and skip processing inside them.

### Problem

Without backtick awareness, cross-linking could produce invalid MDX:

```text
Input:  `Pipeline<I, O>` processes data
Step 1: `[Pipeline](/api/classes/pipeline)<I, O>` processes data
Step 2: `[Pipeline](/api/classes/pipeline)`<I, O>`` processes data
         ^ MDX parser sees <I, O> as JSX tags → parse error
```

### Solution

**`addCrossLinks()`** counts backtick characters before the match
offset. If the count is odd, the match is inside a code span:

```typescript
const backtickCount = (beforeMatch.match(/`/g) || []).length;
if (backtickCount % 2 === 1) {
  return match;  // Skip, inside code span
}
```

**`escapeMdxGenerics()`** splits text on code spans, applies escaping
only to plain-text segments:

```typescript
const parts = text.split(/(`[^`]+`)/g);
return parts.map((part) => {
  if (part.startsWith("`") && part.endsWith("`")) {
    return part;  // Code span, leave alone
  }
  return part.replace(/<([A-Z]...)>/g, "`<$1>`");
}).join("");
```

---

## Integration Points

### 1. Build Program Initialization

**Location:** `src/build-program.ts`

Cross-linkers are initialized in `generateApiDocs` using data from
`prepareWorkItems`:

```typescript
// prepareWorkItems builds routes and kinds maps
const { workItems, crossLinkData } = prepareWorkItems({ ... });

// MarkdownCrossLinker: builds its own routes from categorized items
markdownCrossLinker.initialize(
  ApiParser.categorizeApiItems(resolvedItems, categories),
  baseRoute,
  categories,
);

// ShikiCrossLinker: receives pre-built routes/kinds maps
shikiCrossLinker.reinitialize(
  crossLinkData.routes,
  crossLinkData.kinds,
  apiScope,
);

// Register in VfsRegistry for remark plugin access
VfsRegistry.register(apiScope, {
  crossLinker: shikiCrossLinker,
  highlighter,
  packageName,
  apiScope,
  // ... other VFS config
});
```

### 2. Page Generation

**Location:** `src/markdown/page-generators/*.ts`

All page generators import the singleton `markdownCrossLinker` and apply
cross-linking to description text:

```typescript
import { markdownCrossLinker } from "../cross-linker.js";

// In generator methods:
const summary = markdownCrossLinker.addCrossLinks(rawSummary);
const description = markdownCrossLinker.addCrossLinks(rawDescription);
```

Cross-linking is applied to:

- Class/interface summaries and remarks
- Constructor and method parameter descriptions
- Property descriptions
- Return type descriptions
- `@see` and `@link` tag content

### 3. Code Block Rendering

**Generated API docs** (`remark-api-codeblocks.ts`):

Code blocks in generated pages are rendered by Shiki, then
post-processed by the ShikiCrossLinker:

```typescript
const vfsConfig = VfsRegistry.get(apiScopeValue);
let hast = await generateShikiHast(source, vfsConfig.highlighter, ...);
if (hast && vfsConfig.crossLinker) {
  hast = vfsConfig.crossLinker.transformHast(hast, apiScopeValue);
}
```

The resulting HAST is base64-encoded and passed as a prop to the
`ExampleBlockWrapper` or `SignatureBlockWrapper` component for
browser rendering.

**User-authored code blocks** (`remark-with-api.ts`):

```` ```typescript with-api ```` code blocks are processed by the
`remarkWithApi` remark plugin using the same VfsRegistry lookup and
`transformHast()` post-processing.

---

## VfsRegistry

**Location:** `src/vfs-registry.ts`

The `VfsRegistry` connects the ShikiCrossLinker to remark plugins by
storing per-scope `VfsConfig` objects:

```typescript
interface VfsConfig {
  vfs: Map<string, VirtualFileSystem>;
  highlighter: Highlighter;
  crossLinker?: ShikiCrossLinker;
  twoslashTransformer?: ShikiTransformer;
  hideCutTransformer?: ShikiTransformer;
  hideCutLinesTransformer?: ShikiTransformer;
  packageName: string;
  apiScope: string;
  theme?: ShikiThemeConfig;
}
```

**Key methods:**

- `register(apiScope, config)` -- Store config by scope
- `get(apiScope)` -- Retrieve by scope (used by remark plugins)
- `getByFilePath(filePath)` -- Extract scope from file path and
  retrieve (used for user-authored code blocks)

---

## Testing

### MarkdownCrossLinker Tests

**Location:** `src/markdown/cross-linker.test.ts`

- Route initialization: top-level items, class members, interface
  members, kinds tracking, member name sanitization, re-initialization
- `addCrossLinks()`: basic linking, longest-name priority, skip
  existing markdown links, word boundary matching, multiple
  occurrences, backtick code spans
- `addCrossLinksHtml()`: HTML anchor generation, skip existing HTML
  links, word boundaries, HTML tag preservation
- Module instance export verification

### ShikiCrossLinker Tests

**Location:** `src/shiki-transformer.test.ts`

- Phase 3 type reference linking: single match, split at boundaries,
  multiple references, no matches, whitespace, skip processed spans,
  filter dotted names, `api-type-link` class, Twoslash hover linking
- Phase 1 class method linking: class declaration scope, method linking,
  scope reset after closing brace
- Phase 1 namespace member linking: function, interface, enum members,
  scope reset
- Phase 2 tooltip regex: function/interface/property/class patterns
- Phase 3 namespace PascalCase unqualified names
- `reinitialize()` scope isolation: old routes with explicit scope,
  new routes with new scope, scope boundary enforcement

### VfsRegistry Tests

**Location:** `__test__/vfs-registry.test.ts`

- Registration and retrieval by scope
- Clearing, `hasConfigs()`, `getScopes()`
- `getByFilePath()` with various path patterns
- Config overwriting

---

## File Locations

| File | Purpose |
| --- | --- |
| `src/markdown/cross-linker.ts` | MarkdownCrossLinker class + singleton |
| `src/shiki-transformer.ts` | ShikiCrossLinker class + HAST transformation |
| `src/vfs-registry.ts` | VfsRegistry connecting cross-linker to remark |
| `src/build-program.ts` | Cross-linker initialization |
| `src/build-stages.ts` | Route/kinds map construction in prepareWorkItems |
| `src/markdown/helpers.ts` | `escapeMdxGenerics()` with backtick safety |
| `src/remark-api-codeblocks.ts` | Generated code block cross-linking |
| `src/remark-with-api.ts` | User-authored code block cross-linking |

---

## Future Enhancements

### Potential Improvements

1. **External package linking** -- Link to npm/TypeDoc documentation
   for types from external packages
2. **Conditional exports linking** -- Handle TypeScript conditional
   exports in cross-link resolution
3. **Broken link detection** -- Warn when a cross-linked route does
   not correspond to a generated page
4. **Regex caching** -- Pre-compile and cache the per-name regexes
   for large APIs

### Known Limitations

1. **No external package links** -- Only types from the documented
   package are linked; external types (e.g., `ZodType`) are not
   cross-linked
2. **Sanitization duplication** -- `sanitizeId()` logic exists in both
   `build-stages.ts` and `cross-linker.ts`; divergence would break
   member anchor links
3. **HTML cross-links in tooltips** -- Phase 2 Twoslash tooltip parsing
   uses a regex that may not match all TypeScript declaration forms

---

## Related Documentation

- **Page Generation System:**
  `page-generation-system.md` -- Stream pipeline using cross-link data
- **SSG Compatible Components:**
  `ssg-compatible-components.md` -- Runtime components rendering
  cross-linked code blocks
- **Import Generation System:**
  `import-generation-system.md` -- Type reference extraction
- **Multi-Entry Point Support:**
  `multi-entry-point-support.md` -- Collision segments in routes
- **Build Architecture:**
  `build-architecture.md` -- Service layer and plugin structure

### External Resources

- Shiki documentation: <https://shiki.style/>
- HAST specification: <https://github.com/syntax-tree/hast>
- RSPress plugin development: <https://rspress.dev/plugin/>
