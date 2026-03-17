---
status: draft
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-03-17
last-synced: 2026-03-17
completeness: 25
related:
  - rspress-plugin-api-extractor/page-generation-system.md
  - rspress-plugin-api-extractor/build-architecture.md
dependencies: []
---

# Cross-Linking Architecture

**Status:** Stub - Needs Implementation

## Overview

The cross-linking system provides bidirectional linking between API
documentation pages. It enables users to click on type references in
code blocks and navigate directly to the corresponding API documentation
page.

**Key Features:**

- **Code block cross-linking** via ShikiCrossLinker
- **Markdown text cross-linking** via MarkdownCrossLinker
- **URL generation** for API items
- **Scope-aware linking** (package-relative, external packages)
- **Singleton pattern** for shared state across build

## Components

### 1. ShikiCrossLinker

**Location:** `src/shiki-transformer.ts`

**Purpose:** Transform type references in code blocks into clickable
links during Shiki syntax highlighting.

**Key Methods:**

- `registerApiItem()` - Register an API item for linking
- `getTransformer()` - Get Shiki transformer for code blocks
- `shouldLinkType()` - Determine if type should be linked
- `generateUrl()` - Generate URL for API item

**Workflow:**

```text
Code Block Rendering:
  ├─> Shiki highlights syntax
  ├─> ShikiCrossLinker transformer processes tokens
  ├─> Type identifiers matched against registry
  ├─> Matching types wrapped in <a> tags
  └─> HTML output with clickable type links
```

**TODO: Document:**

- Registration flow during API doc generation
- Type matching algorithm
- URL generation strategy
- External vs internal linking
- Integration with Twoslash
- Edge cases and limitations

### 2. MarkdownCrossLinker

**Location:** `src/markdown/cross-linker.ts`

**Purpose:** Transform type references in plain markdown text into
clickable links.

**Key Methods:**

- `registerApiItem()` - Register an API item
- `generateInlineCodeLinks()` - Transform \`TypeName\` references
- `shouldLinkType()` - Determine if type should be linked
- `generateUrl()` - Generate URL for API item

**Workflow:**

```text
Markdown Generation:
  ├─> Page generator creates markdown text
  ├─> MarkdownCrossLinker.generateInlineCodeLinks()
  ├─> Regex matches inline code patterns
  ├─> Type names matched against registry
  ├─> Matching types replaced with [TypeName](url)
  └─> Markdown with clickable type links
```

**TODO: Document:**

- Regex patterns for type matching
- Conflict resolution (same name, different types)
- Performance optimization strategies
- Integration with page generators
- Testing approach

### 3. Singleton Pattern

**Approach:** Both cross-linkers use singleton pattern to share state
across all page generations.

**Benefits:**

- Single source of truth for all registered API items
- Efficient memory usage
- Consistent URL generation
- Easy access from any page generator

**Location:**

```typescript
// src/shiki-transformer.ts
export const shikiCrossLinker = new ShikiCrossLinker();

// src/markdown/cross-linker.ts
export const markdownCrossLinker = new MarkdownCrossLinker();
```

**TODO: Document:**

- Initialization timing
- Lifecycle management
- Thread safety considerations
- Testing singleton components

## URL Generation

### URL Structure

```text
/{category}/{api-item-name}

Examples:
/class/ClaudeBinaryPlugin
/interface/PluginConfig
/function/createPlugin
/type/Options
/enum/LogLevel
```

**TODO: Document:**

- Category determination logic
- Name sanitization rules
- Handling name collisions
- External package URLs
- Version-specific URLs
- Anchor generation for members

## Integration Points

### 1. Build Program Initialization

**Location:** `src/build-program.ts`

Cross-linkers are initialized in `generateApiDocs` using data from
`prepareWorkItems`:

```typescript
markdownCrossLinker.initialize(
  ApiParser.categorizeApiItems(apiPackage, categories),
  baseRoute,
  categories,
);
shikiCrossLinker.reinitialize(
  crossLinkData.routes,
  crossLinkData.kinds,
  apiScope,
);
TwoslashManager.addTypeRoutes(crossLinkData.routes);
```

The `prepareWorkItems` function in `build-stages.ts` builds the route
and kind maps by iterating over all API items and their members.

### 2. Page Generation

**Location:** `src/markdown/page-generators/*.ts`

- Use MarkdownCrossLinker for text transformation
- Generate member signatures with links
- Cross-link related types

> TODO: Document integration patterns

### 3. Code Block Rendering

**Generated API Docs:**

Code blocks in generated API documentation (class signatures, member
signatures, examples) are rendered by page generators using Shiki with
the `ShikiCrossLinker.createTransformer()` transformer applied.

**Location:** `src/markdown/page-generators/*.ts`

- Page generators call `codeToHtml()` with cross-linker transformer
- `MemberFormatTransformer` handles member signature display formatting
- Twoslash provides type hover information

**User-Authored Code Blocks:**

User-authored `with-api` code blocks in MDX files are processed by the
`remarkWithApi` remark plugin.

**Location:** `src/remark-with-api.ts`

- Processes ```` ```typescript with-api ```` code blocks
- Applies Shiki cross-linker transformer for type links
- Does NOT apply `MemberFormatTransformer` (not member signatures)
- Renders to ExampleBlock component with pre-rendered HTML

> TODO: Document full rendering pipeline details

## Type Matching Algorithm

### Matching Strategy

**TODO: Document:**

- Exact name matching
- Qualified name matching (e.g., `Module.Type`)
- Generic type matching
- Union/intersection type handling
- Import path resolution
- Scope priority (current package > external packages)

### Conflict Resolution

**TODO: Document:**

- Same name in different scopes
- Same name, different categories
- Priority rules
- Disambiguation strategies

## Performance Considerations

### Registration Performance

**TODO: Benchmark and document:**

- Time to register N API items
- Memory usage for registry
- Lookup performance (O notation)

### Transformation Performance

**TODO: Benchmark and document:**

- Code block transformation overhead
- Markdown text transformation overhead
- Impact on total build time
- Optimization opportunities

## Testing Strategy

### Unit Tests

**TODO: Create tests for:**

- Type matching accuracy
- URL generation correctness
- Conflict resolution
- Edge cases (special characters, Unicode, etc.)

### Integration Tests

**TODO: Create tests for:**

- End-to-end cross-linking
- Multiple packages
- External package linking
- Generated HTML validation

## Future Enhancements

### Phase 1: Enhanced Matching

- Fuzzy matching for typos
- Alias support (import as)
- Namespace support
- Module augmentation handling

### Phase 2: External Package Linking

- Link to npm package documentation
- Link to TypeDoc sites
- Custom URL mapping configuration

### Phase 3: Analytics

- Track most-linked types
- Identify broken links
- Generate link graph visualization

### Phase 4: Optimization

- Lazy registration
- Incremental updates
- Parallel transformation
- Cache compiled regexes

## Related Documentation

- **Page Generation System:**
  `.claude/design/rspress-plugin-api-extractor/page-generation-system.md` -
  Integration with page generators
- **SSG Compatible Components:**
  `.claude/design/rspress-plugin-api-extractor/ssg-compatible-components.md` -
  Runtime components with cross-linked code blocks
- **Import Generation System:**
  `.claude/design/rspress-plugin-api-extractor/import-generation-system.md` -
  Type reference extraction (related to cross-linking)
- **Main Plugin README:** `plugin/README.md`
- **Package CLAUDE.md:** `plugin/CLAUDE.md`

### External Resources

- Shiki documentation: <https://shiki.style/>
- TypeScript AST: <https://astexplorer.net/>
- RSPress plugin development: <https://rspress.dev/plugin/>

---

**Document Status:** Stub - outlines architecture but needs detailed
implementation documentation.

**Next Steps:** Document type matching algorithm, URL generation logic,
registration flow, integration patterns, add code examples and diagrams,
benchmark performance.
