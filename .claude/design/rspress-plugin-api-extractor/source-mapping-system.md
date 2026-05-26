---
status: draft
module: rspress-plugin-api-extractor
category: source-mapping
created: 2026-01-17
updated: 2026-05-26
last-synced: 2026-05-26
completeness: 55
related:
  - rspress-plugin-api-extractor/multi-entry-vfs.md
  - rspress-plugin-api-extractor/import-generation-system.md
  - rspress-plugin-api-extractor/type-loading-vfs.md
dependencies: []
---

# Source Mapping System

## Overview

`SourceMapGenerator` (`src/source-map-generator.ts`) produces a JSON map linking lines in a generated `.d.ts` file back to the originating API Extractor item and source file. It is a standalone, unit-tested utility (`src/source-map-generator.test.ts`).

**It is not currently wired into the build pipeline.** Declaration generation now lives in `ApiExtractedPackage` (`src/api-extracted-package.ts`) and `generateVfs()` does not invoke `SourceMapGenerator` or emit `.d.ts.map` files. This document describes the utility's shape and its intended use; treat it as available-but-unused infrastructure, not part of the active VFS flow.

## Cardinal types

```typescript
interface SourceMapping {
  file: string;        // original source file path, relative to package root
  apiItem: string;     // canonical reference, e.g. "pkg!Symbol:kind"
  kind: string;        // API item kind (Class, Interface, TypeAlias, …)
  displayName: string; // symbol display name
}

interface ApiSourceMap {
  version: 1;
  packageName: string;
  apiModelPath: string;
  declarations: Record<number, SourceMapping>; // line number → mapping
}
```

## Generator surface

`SourceMapGenerator` is constructed with a package name and API model path, then driven imperatively as declarations are emitted: `advanceLines(count)` moves the line cursor, `addMapping(apiItem)` records a mapping at the current line, and `generate()` / `toJSON()` produce the final `ApiSourceMap`. `addMapping` reads the API item's `fileUrlPath` (falling back to `"unknown"`) and its canonical reference. See `src/source-map-generator.ts` for the exact methods.

## Intended use

Were it re-wired into declaration generation, a source map would enable tracing a generated declaration back to its source file for richer error messages, "go to definition" from documentation and cross-reference tooling. Any future integration would call `addMapping` before emitting each declaration and `advanceLines` for the lines written, then store the `toJSON()` output alongside the `.d.ts` in the VFS.

## Related documentation

- **Multi-Entry VFS:** `multi-entry-vfs.md` — current `.d.ts` generation via `ApiExtractedPackage`
- **Import Generation System:** `import-generation-system.md` — external import prepending in the VFS
- **Type Loading & VFS:** `type-loading-vfs.md` — VFS architecture and Twoslash consumption
