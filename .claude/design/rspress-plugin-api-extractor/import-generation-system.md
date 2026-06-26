---
status: current
module: rspress-plugin-api-extractor
category: import-generation
created: 2026-01-17
updated: 2026-06-26
last-synced: 2026-06-26
completeness: 85
related:
  - rspress-plugin-api-extractor/type-loading-vfs.md
  - rspress-plugin-api-extractor/multi-entry-vfs.md
  - rspress-plugin-api-extractor/build-architecture.md
dependencies: []
---

# Import Generation System

## Overview

The generated `.d.ts` files in the virtual file system declare a package's own types but reference types owned by external packages (e.g. `ZodType` from `zod`). Without `import` statements for those external references, Twoslash reports errors like `Cannot find name 'ZodType'` and hover tooltips break. The import generation system extracts external type references from the API Extractor model and prepends `import type` statements to each entry point's declaration file.

## Architecture

The system has two halves that live in different files:

- `TypeReferenceExtractor` (`src/type-reference-extractor.ts`) — analyzes an `ApiPackage`, classifies the type references it finds and produces `ImportStatement[]`.
- `prependImportsToVfs` (`src/layers/ConfigServiceLive.ts`) — for each entry point, calls the extractor and prepends the formatted imports to that entry's `.d.ts` content in the VFS.

The VFS itself is produced by `ApiExtractedPackage.generateVfs()` (see `multi-entry-vfs.md`); import prepending runs immediately after, mutating the VFS map in place.

### Integration flow

```text
ApiExtractedPackage.fromPackage(apiPackage, name)
  → generateVfs()  →  node_modules/<name>/<entry>.d.ts (declarations only)
         |
prependImportsToVfs(vfs, apiPackage, name)   [ConfigServiceLive]
  → for each entry point:
       TypeReferenceExtractor.extractImportsForEntryPoint(entryPoint)
       TypeReferenceExtractor.formatImports(imports)
       prepend "import type { … } from \"…\";" to that entry's .d.ts
         |
combinedVfs  →  Twoslash / TypeScript language service resolves references
```

Per-entry-point extraction (`extractImportsForEntryPoint`) walks only the members exported from that entry, so each `.d.ts` imports only the external types it actually uses.

## Reference classification

API Extractor encodes type references as canonical references of the form `packageName!symbolName:kind`. The extractor parses these and sorts each reference into one of three buckets:

- **Built-in** (filtered out) — empty package name or a package name starting with a quote (Node.js builtins like `node:buffer`). Covers `Promise`, `Record`, `Buffer` and similar.
- **Internal** (filtered out) — package name matches the package being documented; these types are declared in the same VFS and need no import.
- **External** (imported) — any other non-empty package name; emitted as an `import type` statement.

Namespaced token text (e.g. `Schema.Struct` or `z.ZodType`) is reduced to its NAMESPACE ROOT — the first dotted segment (`Schema` / `z`), not the leaf member. The reconstructed declaration body preserves the qualified form verbatim, so the binding that must be in lexical scope is the namespace root (the package's importable export); importing the leaf (`Struct` / `ZodType`) would leave the namespace identifier undefined and collapse `typeof X.Type` companion types to an error type, producing a false `TS2353`. See the classification logic in `src/type-reference-extractor.ts` for the exact matching rules.

## Import statement rules

Generated imports are always type-only (`import type`), use named imports only, are deduplicated, and are sorted alphabetically by package and by symbol within each package. `TypeReferenceExtractor.formatImports` renders the `ImportStatement[]` into source lines.

## Cardinal types

```typescript
interface ImportStatement {
  packageName: string;   // package to import from
  symbols: Set<string>;  // named imports
  typeOnly: boolean;      // always true for declaration files
}
```

`TypeReferenceExtractor` exposes `extractImports()` (whole package), `extractImportsForEntryPoint(entryPoint)` (single entry, used by the pipeline) and `extractImportsForApiItem(apiItem)` (single item), plus the static `formatImports`. See `src/type-reference-extractor.ts` for the full surface.

## Known limitations

- **Namespaced types** — a qualified reference imports only its first segment (the namespace root); the leaf member is never imported separately. Nesting depth is irrelevant because the reconstructed body resolves the leaf through the imported root, so `A.B.C` needs only `A` imported.
- **Re-exports** — imports assume direct ownership by the originating package; types re-exported through an intermediate package are not traced.
- **Type parameters** — generic type parameters are not extracted as separate references.

## Related documentation

- **Type Loading & VFS:** `type-loading-vfs.md` — external package type loading
- **Multi-Entry VFS:** `multi-entry-vfs.md` — VFS `.d.ts` generation per entry point
- **Build Architecture:** `build-architecture.md` — service layer and config resolution
