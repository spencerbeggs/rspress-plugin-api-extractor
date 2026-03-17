---
status: current
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-03-17
last-synced: 2026-03-17
completeness: 85
related: []
dependencies: []
---

# Import Generation System for Virtual TypeScript Environment

## Overview

Automatic import statement generation for virtual TypeScript
declaration files created from API Extractor models. This system ensures
that Twoslash can correctly resolve external type references in
documentation code examples.

**Status:** ✅ Production-ready

## Problem Statement

The `TwoslashProjectGenerator` was reconstructing TypeScript declarations
from API Extractor models but wasn't including import statements for
external type references. This caused Twoslash errors like:

```text
Cannot find name 'ZodType'
Cannot find module 'zod'
```

Even though external package types were loaded via
`type-registry-effect`, the generated declaration files didn't import
them, preventing TypeScript's language service from resolving the
references.

## Solution Architecture

### Component: TypeReferenceExtractor

**Purpose:** Extract and classify type references from API
Extractor models to generate import statements.

**Location:** `src/type-reference-extractor.ts`

**Key Features:**

1. **Excerpt Token Analysis**: Walks through API Extractor excerpt
   tokens to identify `Reference` tokens
2. **Canonical Reference Parsing**: Parses format
   `"packageName!symbolName:kind"` to extract package and symbol names
3. **Smart Filtering**: Distinguishes between built-in types, internal
   references, and external packages
4. **Namespace Handling**: Extracts clean symbol names from namespaced
   references (e.g., `z.ZodType` → `ZodType`)
5. **Alphabetical Organization**: Sorts both packages and symbols for
   consistent output
6. **Per-Entry-Point Extraction**: Generates imports separately for each
   entry point, including only types actually used by that entry point

### Integration Flow

```text
API Extractor Model (.api.json)
       ↓
TwoslashProjectGenerator
  → For each entry point:
       ↓
    TypeReferenceExtractor
      → Analyze entry point API items
      → Extract type references from excerpt tokens
      → Parse canonical references
      → Filter and categorize references
      → Group by package
       ↓
    Import Statements
      → import type { ZodType, ... } from "zod";
      → import type { JsonObject, ... } from "type-fest";
       ↓
    Generate Entry Point Declarations
      → Package header
      → Import statements (entry point-specific)
      → Type declarations
       ↓
Virtual File System (VFS)
  → node_modules/package-name/index.d.ts (with imports)
  → node_modules/package-name/[entry].d.ts (for multi-entry packages)
  → node_modules/package-name/package.json
       ↓
Twoslash Transformer
  → TypeScript language service resolves all references ✅
```

## Implementation Details

### Canonical Reference Format

API Extractor uses canonical references to identify type references:

```typescript
// External package reference
"zod!ZodType:interface"
  ↓
packageName: "zod"
symbolName: "ZodType"
isExternal: true

// Internal reference (same package)
"my-package!MyType:type"
  ↓
packageName: "my-package"
symbolName: "MyType"
isInternal: true

// Built-in TypeScript type
"!Promise:interface"
  ↓
packageName: ""
symbolName: "Promise"
isBuiltIn: true

// Node.js built-in
"!\"node:buffer\".__global.Buffer:interface"
  ↓
packageName: "!\"node:buffer\""
symbolName: "Buffer"
isBuiltIn: true (starts with quote)
```

### Reference Classification

The extractor classifies references into three categories:

1. **Built-in Types** (filtered out):
   - TypeScript types: `Promise`, `Record`, `NonNullable`, `Array`, etc.
   - Node.js built-ins: `Buffer`, `ReadableStream`, etc.
   - Indicated by empty package name or package name starting with `"`

2. **Internal References** (filtered out):
   - Types from the same package being documented
   - Package name matches the current package name
   - These are exported in the same declaration file, no import needed

3. **External References** (imported):
   - Types from npm packages
   - Non-empty package name that doesn't match current package
   - Requires `import type` statement

### Namespace Handling

Some references use namespace syntax in the token text but the actual
type name is simpler:

```typescript
// Token text: "z.ZodType"
// Canonical: "zod!ZodType:interface"
// Generated import: import type { ZodType } from "zod";

// Token text: "z.infer"
// Canonical: "zod!infer:type"
// Generated import: import type { infer } from "zod";
```

The extractor extracts the clean symbol name by checking for dots in
the token text and taking the last segment.

### Import Statement Generation

Generated imports follow these rules:

1. **Always type-only**: `import type` (for declaration files)
2. **Named imports**: `{ Symbol1, Symbol2 }` (no default imports)
3. **Alphabetically sorted**: Both packages and symbols within each
   package
4. **Deduplicated**: Multiple references to the same symbol only
   generate one import

**Example output:**

```typescript
// Type declarations for my-package
// Generated from API Extractor model

import type { JsonObject, PartialDeep } from "type-fest";
import type { ZodError, ZodType, infer } from "zod";

export declare function parseConfig(schema: ZodType): Config;
export declare type InferredType = infer<typeof mySchema>;
```

## API Reference

### TypeReferenceExtractor

```typescript
class TypeReferenceExtractor {
  constructor(
    apiPackage: ApiPackage,
    currentPackageName: string
  )

  // Extract imports for a specific entry point
  extractImportsForEntryPoint(entryPoint: ApiEntryPoint): ImportStatement[]

  // Static method to format import statements as strings
  static formatImports(imports: ImportStatement[]): string[]
}
```

### TypeReference Interface

```typescript
interface TypeReference {
  symbolName: string;        // e.g., "ZodType"
  packageName: string;       // e.g., "zod"
  canonicalReference: string; // e.g., "zod!ZodType:interface"
  isBuiltIn: boolean;        // true for Promise, Record, etc.
  isInternal: boolean;       // true for same-package references
}
```

### ImportStatement Interface

```typescript
interface ImportStatement {
  packageName: string;   // Package to import from
  symbols: Set<string>;  // Named imports
  typeOnly: boolean;     // Always true for declaration files
}
```

## Testing

### Unit Tests

**Location:** `src/type-reference-extractor.test.ts`

**Coverage:**

```typescript
✓ should extract external package references from API model
✓ should format imports correctly
✓ should filter out built-in types
✓ should filter out internal references
✓ should sort imports alphabetically

Test Files: 1 passed (1)
Tests: 5 passed (5)
Duration: 449ms
```

**Test Data:** Uses actual `claude-binary-plugin.api.json` model

### Integration Test

**Location:** `src/integration-test.ts`

**Usage:**

```bash
pnpm tsx src/integration-test.ts
```

**Output:**

```text
=== Testing TypeReferenceExtractor ===

Generated import statements:
  import type { JsonArray, JsonObject, ... } from "type-fest";
  import type { $ZodRegistry, ZodArray, ... } from "zod";

Total external packages: 2

=== Testing TwoslashProjectGenerator ===

Generated 2 files in VFS:
  - node_modules/claude-binary-plugin/index.d.ts
  - node_modules/claude-binary-plugin/package.json

First 50 lines of generated index.d.ts:
// Type declarations for claude-binary-plugin
// Generated from API Extractor model

import type { JsonArray, ... } from "type-fest";
import type { $ZodRegistry, ... } from "zod";

export declare type AnyPipelineOutput = ...
export declare interface BaseState { ... }
...
```

## Performance Impact

The import generation system provides full TypeScript type resolution in
documentation code examples with minimal build overhead:

**Capabilities:**

- ✅ External types resolve correctly in Twoslash
- ✅ Hover tooltips show full type information from imported packages
- ✅ IntelliSense works for all imported types
- ✅ Type checking enabled for all code examples
- ✅ Per-entry-point optimization reduces import bloat

**Build Performance:**

- Import extraction adds ~0.5s to build time
- Per-entry-point extraction ensures only necessary imports are included
- No runtime performance impact (imports only in generated .d.ts files)
- Efficient caching via snapshot tracking system

**Typical Build Output:**

```text
📝 Generated 339 files
⚠️  Code block performance: 86 blocks (100%, >100ms)
🔴 Twoslash errors: 0-1 errors (deliberate errors in examples)
```

## Code Quality

### Linting

All code passes Biome linting with strict rules:

- ✅ No unused imports
- ✅ No unused variables
- ✅ Explicit types for all variables (nursery rule)
- ✅ Proper import ordering

### TypeScript

All code type-checks successfully with:

- ✅ `strict: true`
- ✅ `noImplicitAny: true`
- ✅ No type assertions except documented cases
- ✅ Full type safety with API Extractor types

## Future Enhancements

**Note:** Multi-entry point support, per-entry-point import optimization,
and source mapping have been implemented. See related documentation for
details.

### Potential Improvements

1. **Enhanced Excerpt Token Usage**:
   - Use full token structure instead of just text
   - Preserve type parameter constraints in imports
   - Handle conditional types better

2. **Namespace Import Support**:
   - Support `import type * as` for namespace imports
   - Handle complex nested namespace patterns
   - Optimize imports for packages with many exports

3. **Import Analysis**:
   - Detect truly unused imports and remove them
   - Suggest alternative import paths for re-exported types
   - Warn about deprecated imports from external packages

### Known Limitations

1. **Namespaced Types**: Only handles simple namespace patterns
   (`z.ZodType`). Complex nested namespaces may need special handling.

2. **Re-exports**: Doesn't handle re-exported types from intermediate
   packages. Assumes direct imports from original packages.

3. **Type Parameter References**: Type parameters in generics aren't
   currently extracted as separate references.

4. **Ambient Declarations**: Global types and ambient declarations
   aren't distinguished from regular imports.

## Related Documentation

- **Multi-Entry Point Support:**
  `.claude/design/rspress-plugin-api-extractor/multi-entry-point-support.md` -
  Multiple entry point generation system
- **Source Mapping:**
  `.claude/design/rspress-plugin-api-extractor/source-mapping-system.md` -
  Declaration-to-source mapping system
- **Type Loading & VFS:**
  `.claude/design/rspress-plugin-api-extractor/type-loading-vfs.md` -
  External package type loading
- **Effect Type Registry:**
  `.claude/design/type-registry-effect/observability.md` -
  Type definition registry architecture
- **Main Plugin README:**
  `plugin/README.md`
- **Package CLAUDE.md:**
  `plugin/CLAUDE.md`
