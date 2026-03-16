---
status: draft
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-01-23
last-synced: 2026-01-23
completeness: 40
related: []
dependencies: []
---

# Page Generation System

**Status:** Stub - Needs Implementation

## Overview

The page generation system transforms Microsoft API Extractor models
into markdown/MDX files for RSPress. It provides specialized generators
for each API item category (classes, interfaces, functions, types,
enums, variables).

**Key Features:**

- **Class-based generators** for each API category
- **Markdown/MDX output** with frontmatter
- **Component integration** for interactive features
- **Cross-linking** via MarkdownCrossLinker
- **Snapshot tracking** for incremental builds
- **Metadata generation** for RSPress navigation

## Architecture

### Generator Class Hierarchy

```text
PageGenerator (abstract base - if exists)
  ├─ ClassPageGenerator
  ├─ InterfacePageGenerator
  ├─ FunctionPageGenerator
  ├─ TypeAliasPageGenerator
  ├─ EnumPageGenerator
  └─ VariablePageGenerator
```

> TODO: Verify if abstract base class exists or if generators are
> independent

### Generator Responsibilities

Each generator is responsible for:

1. **Frontmatter generation** - title, description, Open Graph tags
2. **Content generation** - structured markdown/MDX
3. **Member processing** - methods, properties, parameters
4. **Code block generation** - signature blocks with Twoslash
5. **Cross-linking** - type references to other pages
6. **Component usage** - SignatureBlock, ParametersTable, etc.

## Page Structure

### Standard Page Layout

```markdown
---
title: "ItemName | Category | API | PackageName"
description: "Brief summary of the item"
head:
  - - meta
    - property: "og:title"
      content: "ItemName"
  - - meta
    - property: "article:published_time"
      content: "2026-01-15T12:00:00.000Z"
  - - meta
    - property: "article:modified_time"
      content: "2026-01-17T10:30:00.000Z"
---

import { SignatureBlock, ParametersTable } from
"rspress-plugin-api-extractor/runtime";

# ItemName

Summary text describing the item.

## Signature

<SignatureBlock>
...signature code block...
</SignatureBlock>

## Description

Detailed description from TSDoc comments.

## Parameters

<ParametersTable parameters={...} />

## Related

Links to related types, inheritance, implementations.
```

> TODO: Document variations for each category

## Generator Implementations

### 1. ClassPageGenerator

**Location:** `src/markdown/page-generators/class-page.ts`

**Responsibilities:**

- Generate class signature with generics
- Process constructors, methods, properties
- Handle inheritance hierarchy
- Display implemented interfaces
- Group members by visibility (public, protected, private)

**Key Methods:**

> TODO: Document public API methods

**Generated Sections:**

- Signature
- Description
- Constructors
- Properties
- Methods
- Inherited Members
- Type Parameters

> TODO: Add example output

### 2. InterfacePageGenerator

**Location:** `src/markdown/page-generators/interface-page.ts`

**Responsibilities:**

- Generate interface signature with generics
- Process properties and methods
- Handle extended interfaces
- Display type parameters

**Key Methods:**

> TODO: Document public API methods

**Generated Sections:**

- Signature
- Description
- Properties
- Methods
- Extended Interfaces
- Type Parameters

> TODO: Add example output

### 3. FunctionPageGenerator

**Location:** `src/markdown/page-generators/function-page.ts`

**Responsibilities:**

- Generate function signature
- Process parameters and return type
- Handle overloads
- Display type parameters

**Generated Sections:**

- Signature
- Description
- Parameters
- Returns
- Examples
- Overloads

> TODO: Add example output

### 4. TypeAliasPageGenerator

**Location:** `src/markdown/page-generators/type-alias-page.ts`

**Responsibilities:**

- Generate type alias signature
- Process type parameters
- Display expanded type definition

**Generated Sections:**

- Signature
- Description
- Type Parameters
- References

> TODO: Add example output

### 5. EnumPageGenerator

**Location:** `src/markdown/page-generators/enum-page.ts`

**Responsibilities:**

- Generate enum signature
- List all members with values
- Process member descriptions

**Generated Sections:**

- Signature
- Description
- Members
- Usage Examples

> TODO: Add example output

### 6. VariablePageGenerator

**Location:** `src/markdown/page-generators/variable-page.ts`

**Responsibilities:**

- Generate variable/constant signature
- Display type annotation
- Show initial value if available

**Generated Sections:**

- Signature
- Description
- Type
- Usage Examples

> TODO: Add example output

## Integration Points

### 1. API Extractor Model

**Input:** `.api.json` files from Microsoft API Extractor

**Parsing:**

> TODO: Document model parsing logic

**Item Types:**

- `ApiClass`
- `ApiInterface`
- `ApiFunction`
- `ApiTypeAlias`
- `ApiEnum`
- `ApiVariable`

### 2. Helper Functions

**Location:** `src/markdown/helpers.ts`

The helpers module provides shared utilities for page generators:

**`generateFrontmatter()`** - Creates YAML frontmatter:

- Generate structured page title (`{entityName} | {singularName} | API | {apiName}`)
- Escape YAML special characters in title and description
- Build Open Graph meta tags array for social sharing
- Set published/modified timestamps from snapshot tracking

**`prepareExampleCode()`** - Prepares code for Twoslash:

- Adds import statements for the documented API
- Injects `// @noErrors` directive for error suppression
- Detects language (TypeScript/JavaScript)

**`stripTwoslashDirectives()`** - Cleans code for display/copy:

Removes Twoslash directive comments from code so users see clean output
and don't accidentally copy directives when using the copy button:

```typescript
export function stripTwoslashDirectives(code: string): string {
  return code
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      // Remove lines that are only Twoslash directives
      if (
        trimmed.startsWith("// @") ||      // @noErrors, @errors, @filename, etc.
        trimmed.startsWith("// ^?") ||     // Type annotation markers
        trimmed === "// ---cut---"         // Cut markers
      ) {
        return false;
      }
      return true;
    })
    .join("\n")
    .trim();
}
```

**Directives stripped:**

- `// @noErrors` - Error suppression
- `// @errors: 2304` - Specific error expectations
- `// @filename: example.ts` - Virtual file markers
- `// ^?` - Type annotation query markers
- `// ---cut---` - Code section cut markers

**Usage in page generators:**

All page generators pass example code through `stripTwoslashDirectives()`
before passing it to `ExampleBlockWrapper` for the copy button:

```typescript
const displayCode = stripTwoslashDirectives(prepared.code);
content += `<ExampleBlockWrapper code={\`${displayCode}\`} html={...} />\n`;
```

**Other helpers:**

- `sanitizeId()` - Create URL-safe HTML IDs from display names
- `escapeYamlString()` - Escape YAML special characters
- `escapeMdxGenerics()` - Wrap `<T>` in backticks to avoid MDX interpretation
- `formatExampleCode()` - Format code with Prettier

### 3. Signature Block Generation

**Workflow:**

```text
Generator:
  ├─> Extract signature from API model
  ├─> Format with TypeScript syntax
  ├─> Add type parameters, parameters, return type
  ├─> Generate Shiki HTML with Twoslash processing
  ├─> Pass HTML to SignatureBlock/ExampleBlock component
  └─> Component renders with interactive Twoslash tooltips
```

**Twoslash Processing:**

When generating Shiki HTML for code blocks, the `generateShikiHtml()` function
accepts a `meta` parameter that triggers Twoslash processing. This is important
when `explicitTrigger: true` is configured in the Twoslash options:

```typescript
// Generate HTML with Twoslash processing enabled
const html = await generateShikiHtml(code, "typescript", {
  meta: { __raw: "twoslash" }  // Triggers Twoslash when explicitTrigger is true
});
```

**The `meta: { __raw: "twoslash" }` pattern:**

- RSPress/Shiki checks for the `twoslash` keyword in code fence metadata
- When `explicitTrigger: true`, only code blocks with `twoslash` in meta
  are processed (e.g., ` ```ts twoslash`)
- The `__raw` property simulates the code fence meta string
- Without this, Twoslash types, hover information, and error highlighting
  are not generated

**Applied to:**

- Signature blocks (class, function, interface signatures)
- Example blocks from TSDoc `@example` tags

**Note on with-api blocks:**

The `remarkWithApi` plugin processes user-authored `with-api` code blocks in
MDX files. Unlike generated API docs, it does NOT use `MemberFormatTransformer`
since these are standalone code blocks, not member signatures wrapped in
class/interface context.

### 4. MemberFormatTransformer

**Location:** `src/hide-cut-transformer.ts`

**Purpose:** Formats member signature blocks for display by hiding the
class/interface wrapper lines.

Member signatures in generated API docs are wrapped in a 3-line structure:

```typescript
class Foo {
  memberSignature(): void;  // This is the actual member
}
```

The transformer:

1. **Hides line 0** - The class/interface opening (`class Foo {`)
2. **Removes left padding** from line 1 (the member signature)
3. **Hides last line** - The closing brace (`}`)

**Implementation:**

```typescript
// Singleton pattern - no factory function needed
export const MemberFormatTransformer: ShikiTransformer = {
  name: "member-format",
  code(node: Element): void {
    const lines = node.children.filter(
      (child): child is Element =>
        child.type === "element" && child.tagName === "span",
    );

    // Only applies to 3+ line blocks (member signature structure)
    if (lines.length >= 3) {
      lines[0].properties.style = "display: none;";
      lines[1].properties.style = "padding-left: 0;";
      lines[lines.length - 1].properties.style = "display: none;";
    }
  },
};
```

**Usage in page generators:**

All page generators (ClassPageGenerator, InterfacePageGenerator, etc.)
receive `MemberFormatTransformer` as a parameter and apply it to member
signature code blocks:

```typescript
const transformers: ShikiTransformer[] = [];
if (twoslashTransformer) transformers.push(twoslashTransformer);
if (apiDocsTransformer) transformers.push(apiDocsTransformer);
if (hideCutTransformer) transformers.push(hideCutTransformer);

const html = await codeToHtml(signatureCode, {
  lang: "typescript",
  transformers,
  // ...
});
```

**Important:** This transformer is ONLY for generated API docs member
signatures. It is NOT used by:

- `remarkWithApi` plugin (user-authored code blocks)
- Top-level signatures (functions, classes, interfaces themselves)
- Example blocks from TSDoc `@example` tags

### 5. Cross-Linking Integration

**Usage:**

```typescript
const linkedText = markdownCrossLinker.generateInlineCodeLinks(
  description
);
```

**Applies to:**

- Item descriptions
- Parameter descriptions
- Return type descriptions
- Member summaries

> TODO: Document cross-linking patterns

### 5. Snapshot Tracking

**Workflow:**

```text
Generator:
  ├─> Generate markdown content
  ├─> Calculate content hash
  ├─> Check snapshot database
  ├─> If unchanged, skip write
  ├─> If changed, write file and update snapshot
  └─> Track timestamps for Open Graph
```

> TODO: Document snapshot integration

## Member Processing

### Method Signatures

> TODO: Document how methods are processed

### Property Signatures

> TODO: Document how properties are processed

### Parameter Documentation

**Component:** `ParametersTable`

**Data Structure:**

```typescript
interface Parameter {
  name: string;
  type: string;
  description: string;
  optional: boolean;
  defaultValue?: string;
}
```

> TODO: Document parameter extraction logic

### Type Parameters

> TODO: Document generic type parameter handling

## Code Generation Patterns

### 1. Signature Blocks

**Pattern:**

```typescript
content += '## Signature\n\n';
content += '<SignatureBlock>\n\n';
content += '```typescript twoslash\n';
content += signatureCode;
content += '\n```\n\n';
content += '</SignatureBlock>\n\n';
```

> TODO: Document all code block patterns

### 2. Component Usage

**Imported Components:**

```typescript
import { SignatureBlock, ParametersTable, MemberSignature }
from "rspress-plugin-api-extractor/runtime";
```

> TODO: Document when each component is used

### 3. Metadata Structures

**Navigation (_meta.json):**

> TODO: Document _meta.json generation

**Category Organization:**

```text
api/
├── class/
│   └── _meta.json
├── interface/
│   └── _meta.json
├── function/
│   └── _meta.json
├── type/
│   └── _meta.json
├── enum/
│   └── _meta.json
└── variable/
    └── _meta.json
```

## Testing

### Unit Tests

**Test Files:**

- `class-page.test.ts`
- `interface-page.test.ts`
- `function-page.test.ts`
- `type-alias-page.test.ts`
- `enum-page.test.ts`
- `variable-page.test.ts`

> TODO: Document testing patterns

### Test Coverage

> TODO: Document current coverage and target

## Performance Considerations

### Generation Speed

> TODO: Benchmark page generation times

### Memory Usage

> TODO: Document memory usage patterns

### Optimization Strategies

> TODO: Document optimization techniques

## Error Handling

### Missing Data

> TODO: Document how generators handle incomplete models

### Invalid Syntax

> TODO: Document validation and error recovery

### Edge Cases

> TODO: Document known edge cases and handling

## Future Enhancements

### Phase 1: Enhanced Member Display

- Collapsible member sections
- Member search/filter
- Syntax highlighting improvements
- Better inherited member display

### Phase 2: Interactive Features

- Live code examples
- Try-it-now playground
- Type inference visualization
- Interactive parameter editing

### Phase 3: Documentation Quality

- JSDoc tag support expansion
- Example code validation
- Documentation completeness scoring
- AI-generated examples

### Phase 4: Performance

- Parallel page generation
- Lazy content loading
- Incremental regeneration
- Build cache optimization

## Related Documentation

- **Cross-Linking Architecture:**
  `.claude/design/rspress-plugin-api-extractor/cross-linking-architecture.md` -
  Type reference linking in generated pages
- **SSG Compatible Components:**
  `.claude/design/rspress-plugin-api-extractor/ssg-compatible-components.md` -
  Runtime components used in generated pages
- **Snapshot Tracking System:**
  `.claude/design/rspress-plugin-api-extractor/snapshot-tracking-system.md` -
  Incremental build optimization for pages
- **Performance Observability:**
  `.claude/design/rspress-plugin-api-extractor/performance-observability.md` -
  Page generation performance tracking
- **Main Plugin README:** `plugin/README.md`
- **Package CLAUDE.md:** `plugin/CLAUDE.md`

### External Resources

- Microsoft API Extractor: <https://api-extractor.com/>
- API Extractor Model: <https://api-extractor.com/pages/overview/model/>
- RSPress: <https://rspress.dev/>
- TSDoc: <https://tsdoc.org/>

---

**Document Status:** Stub - outlines structure but needs detailed
implementation documentation.

**Next Steps:** Document each generator implementation, add code examples,
create architecture diagrams, add performance benchmarks, document testing
patterns.
