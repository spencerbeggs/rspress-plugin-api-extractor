---
status: current
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-01-17
last-synced: 2026-01-17
completeness: 85
related: []
dependencies: []
---

# Source Mapping System

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Source Map Format](#source-map-format)
- [Components](#components)
- [Integration](#integration)
- [Use Cases](#use-cases)
- [Future Enhancements](#future-enhancements)

## Overview

The Source Mapping System generates JSON source maps that link generated
TypeScript declaration files (`.d.ts`) back to their original API Extractor
model and source files. This enables traceability, better error messages,
and lays the foundation for advanced tooling features.

### Key Features

- **Declaration-to-Source Mapping**: Each declaration line mapped to
  original source file
- **API Item Metadata**: Includes canonical reference, kind, and display name
- **Optional Generation**: Source maps only created when `apiModelPath` is provided
- **Per-Entry-Point Support**: Generates separate source maps for multi-entry packages
- **JSON Format**: Easy to parse and process for tooling

### System Purpose

Source maps serve as a bridge between:

- **Generated code**: Virtual `.d.ts` files used by TypeScript language service
- **Original source**: Actual TypeScript source files in the package
- **API model**: API Extractor's `.api.json` representation

## Architecture

### Components

#### 1. SourceMapGenerator

**Purpose**: Tracks declaration generation and builds source map

**Location**: `src/source-map-generator.ts`

**Responsibilities**:

- Track current line number during generation
- Record mappings between line numbers and API items
- Generate final source map JSON
- Serialize to JSON format

**Key Methods**:

```typescript
class SourceMapGenerator {
  // Get current line number in generated file
  getCurrentLine(): number
  
  // Advance line counter
  advanceLines(count: number = 1): void
  
  // Add mapping for an API item
  addMapping(apiItem: ApiItem): void
  
  // Generate complete source map
  generate(): ApiSourceMap
  
  // Serialize to JSON string
  toJSON(): string
}
```

**State Management**:

- Maintains internal `Map<number, SourceMapping>` for mappings
- Tracks `currentLine` counter during generation
- Stores `packageName` and `apiModelPath` for context

#### 2. TwoslashProjectGenerator Integration

**Modified Behavior**:

```typescript
class TwoslashProjectGenerator {
  constructor(
    apiPackage: ApiPackage,
    packageName: string,
    logger?: Logger,
    apiModelPath?: string  // New optional parameter
  )
}
```

**Generation Flow**:

1. Check if `apiModelPath` is provided
2. Create `SourceMapGenerator` instance for each entry point
3. Pass generator to `generateEntryPointDeclarations()`
4. Track line numbers as declarations are generated
5. Add mapping before each declaration
6. Generate source map JSON
7. Store in VFS as `${fileName}.map`

### Data Flow

```text
API Extractor Model (.api.json)
         ↓
TwoslashProjectGenerator.generate()
         ↓
   [For each entry point]
         ↓
Create SourceMapGenerator
         ↓
generateEntryPointDeclarations(entryPoint, sourceMapGenerator)
         ↓
   [For each member]
         ↓
1. sourceMapGenerator.addMapping(member)
2. Generate declaration
3. sourceMapGenerator.advanceLines(lineCount)
         ↓
sourceMapGenerator.generate()
         ↓
JSON source map stored in VFS
```

## Source Map Format

### ApiSourceMap Interface

```typescript
interface ApiSourceMap {
  /** Format version (currently 1) */
  version: 1
  
  /** Package name */
  packageName: string
  
  /** Path to API Extractor model file */
  apiModelPath: string
  
  /** Mappings from line numbers to source locations */
  declarations: Record<number, SourceMapping>
}
```

### SourceMapping Interface

```typescript
interface SourceMapping {
  /** Original source file path (relative to package root) */
  file: string
  
  /** Canonical reference (e.g., "package!Symbol:kind") */
  apiItem: string
  
  /** API item kind (Class, Interface, TypeAlias, etc.) */
  kind: string
  
  /** Display name of the symbol */
  displayName: string
}
```

### Example Source Map

```json
{
  "version": 1,
  "packageName": "my-package",
  "apiModelPath": "docs/lib/packages/my-package.api.json",
  "declarations": {
    "5": {
      "file": "src/types.ts",
      "apiItem": "my-package!MyType:type",
      "kind": "TypeAlias",
      "displayName": "MyType"
    },
    "10": {
      "file": "src/classes.ts",
      "apiItem": "my-package!MyClass:class",
      "kind": "Class",
      "displayName": "MyClass"
    }
  }
}
```

### Line Number Tracking

**Header Lines** (3 lines):

```typescript
// Type declarations for my-package
// Generated from API Extractor model
[blank line]
```

**Import Lines** (variable):

```typescript
import type { Symbol1, Symbol2 } from "external-package";
[blank line]
```

**Declaration Lines** (variable):

- Mapping recorded at start of declaration
- Line count includes all lines in declaration + blank line separator

**Example**:

```text
Line 1: // Type declarations for my-package
Line 2: // Generated from API Extractor model
Line 3: [blank]
Line 4: import type { ZodType } from "zod";
Line 5: [blank]
Line 6: export declare type MyType = string;  ← Mapped to source
Line 7: [blank]
Line 8: export declare class MyClass {        ← Mapped to source
Line 9:   constructor();
Line 10: }
Line 11: [blank]
```

## Source Map Components

### SourceMapping Extraction

The `addMapping()` method extracts metadata from API items:

```typescript
public addMapping(apiItem: ApiItem): void {
  // Extract source file path from API Extractor
  const fileUrlPath = (apiItem as any).fileUrlPath as string | undefined
  const file = fileUrlPath || "unknown"
  
  // Get canonical reference
  const canonicalRef = apiItem.canonicalReference?.toString() || "unknown"
  
  // Create mapping
  const mapping: SourceMapping = {
    file,
    apiItem: canonicalRef,
    kind: apiItem.kind,
    displayName: apiItem.displayName
  }
  
  this.mappings.set(this.currentLine, mapping)
}
```

### Line Counter Management

```typescript
// Initialize at line 1
private currentLine = 1

// Advance past header
sourceMapGenerator.advanceLines(3)

// Advance past imports
sourceMapGenerator.advanceLines(importStatements.length + 1)

// For each declaration
sourceMapGenerator.addMapping(member)
const declaration = generateDeclaration(member)
const lineCount = declaration.split("\n").length + 1  // +1 for blank
sourceMapGenerator.advanceLines(lineCount)
```

## Integration

### TwoslashProjectGenerator

The generator integrates source mapping into the declaration generation process:

```typescript
public generate(): VirtualFileSystem {
  const vfs: VirtualFileSystem = new Map()
  
  for (const entryPoint of this.apiPackage.entryPoints) {
    const entryName = this.getEntryPointName(entryPoint)
    const fileName = entryName ? `${entryName}.d.ts` : "index.d.ts"
    
    // Create source map generator if apiModelPath provided
    let sourceMapGenerator: SourceMapGenerator | undefined
    if (this.apiModelPath) {
      sourceMapGenerator = new SourceMapGenerator(
        this.packageName,
        this.apiModelPath
      )
    }
    
    // Generate declarations with source mapping
    const content = this.generateEntryPointDeclarations(
      entryPoint,
      sourceMapGenerator
    )
    vfs.set(`node_modules/${this.packageName}/${fileName}`, content)
    
    // Add source map to VFS
    if (sourceMapGenerator) {
      const sourceMapContent = sourceMapGenerator.toJSON()
      vfs.set(`node_modules/${this.packageName}/${fileName}.map`, sourceMapContent)
    }
  }
  
  return vfs
}
```

### Virtual File System

Source maps are stored alongside declaration files:

```text
node_modules/my-package/
├── index.d.ts              # Generated declarations
├── index.d.ts.map          # Source map
└── package.json            # Package metadata
```

### Multi-Entry Point Support

For packages with multiple entry points, each gets its own source map:

```text
node_modules/my-package/
├── index.d.ts
├── index.d.ts.map          # Main entry source map
├── testing.d.ts
├── testing.d.ts.map        # Testing entry source map
└── package.json
```

## Use Cases

### 1. Enhanced Error Messages

**Current**: Twoslash error shows line in generated file

```text
Error in index.d.ts:42: Cannot find type 'Foo'
```

**With Source Map**: Can show original source location

```text
Error in src/types.ts (MyType): Cannot find type 'Foo'
Generated declaration at index.d.ts:42
```

### 2. "Go to Definition"

Future tooling can use source maps to link documentation back to source:

```typescript
// User clicks on type in documentation
type MyType = string

// Tooling uses source map to find:
// - Original file: src/types.ts
// - API item: my-package!MyType:type
// - Opens GitHub file at correct location
```

### 3. Debugging Generated Declarations

Developers can trace generated code back to source:

```typescript
// Generated declaration looks wrong
export declare class MyClass {
  method(): void
}

// Source map reveals it came from:
// File: src/classes/MyClass.ts
// API item: my-package!MyClass:class
```

### 4. Cross-Reference Tools

Build tools that analyze relationships between declarations:

```typescript
// Find all declarations from a specific source file
const mappings = sourceMap.declarations
const fromFile = Object.values(mappings)
  .filter(m => m.file === "src/types.ts")

// Find all type aliases
const typeAliases = Object.values(mappings)
  .filter(m => m.kind === "TypeAlias")
```

## Future Enhancements

### Standard Source Map Format

Consider migrating to TypeScript's standard `.d.ts.map` format:

```json
{
  "version": 3,
  "file": "index.d.ts",
  "sourceRoot": "",
  "sources": ["src/types.ts", "src/classes.ts"],
  "names": [],
  "mappings": "AAAA;CAAA;EAAA"
}
```

**Pros**:

- TypeScript tooling already supports it
- Standard format, well-documented
- Efficient encoding with Base64 VLQ

**Cons**:

- More complex to generate
- Doesn't include API Extractor metadata
- Harder to parse for custom tooling

**Recommendation**: Keep custom format for now, consider hybrid approach:

- Standard V3 format for TypeScript tooling
- Extended metadata in separate file

### Source Map Merging

For packages with multiple entry points, merge source maps:

```json
{
  "version": 1,
  "packageName": "my-package",
  "apiModelPath": "model.api.json",
  "entryPoints": {
    "index.d.ts": { /* mappings */ },
    "testing.d.ts": { /* mappings */ }
  }
}
```

### Reverse Lookup Index

Build index for fast reverse lookups:

```json
{
  "byFile": {
    "src/types.ts": [5, 10, 15],  // Lines in generated file
    "src/classes.ts": [20, 25]
  },
  "byKind": {
    "TypeAlias": [5, 10],
    "Class": [20]
  },
  "byApiItem": {
    "my-package!MyType:type": 5,
    "my-package!MyClass:class": 20
  }
}
```

### Documentation Integration

Use source maps to:

- Link API docs to GitHub source
- Show "Edit on GitHub" buttons
- Generate code coverage reports
- Build interactive API explorers

### IDE Integration

Source maps could enable:

- "Go to Definition" in documentation
- Hover tooltips showing source context
- Inline documentation in generated files
- Breakpoint mapping for debugging

## Related Documentation

- **Type Loading & VFS**: `type-loading-vfs.md` - Virtual file system architecture
- **Import Generation**: `import-generation-system.md` - Related to
  declaration generation
- **Multi-Entry Points**: `multi-entry-point-support.md` - Per-entry source maps
- **Plugin README**: `plugin/README.md`
