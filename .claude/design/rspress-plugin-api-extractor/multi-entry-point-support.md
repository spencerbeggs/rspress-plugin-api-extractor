---
status: current
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-05-26
last-synced: 2026-05-26
completeness: 90
related:
  - rspress-plugin-api-extractor/multi-entry-resolution.md
  - rspress-plugin-api-extractor/multi-entry-vfs.md
  - rspress-plugin-api-extractor/page-generation-system.md
dependencies: []
---

# Multi-Entry Point Support

## Overview

Modern npm packages expose multiple entry points for different audiences — testing utilities, platform-specific code, plugin subpaths:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./testing": "./dist/testing.js"
  }
}
```

The plugin supports these end-to-end, detecting the entry point count and adjusting generation while staying fully backward compatible with single-entry packages. The support spans two independent subsystems, each documented separately:

- **Doc generation pipeline** — `multi-entry-resolution.md` covers the `MultiEntryResolver` (`resolveEntryPoints`), re-export deduplication, the `route-collisions.ts` fail-fast collision detector, and how `prepareWorkItems` attaches `availableFrom` to work items and renders the "Available from" line.
- **Virtual TypeScript environment** — `multi-entry-vfs.md` covers `ApiExtractedPackage`, per-entry `.d.ts` generation, and the synthetic `package.json` (`types` for single entry, `exports` for multiple) produced via `VirtualPackage`.

## How the subsystems relate

The two subsystems read the same `ApiPackage` but produce different artifacts and never share state. The resolution pipeline produces documentation pages and cross-link routes; the VFS subsystem produces TypeScript declarations for Twoslash. A multi-entry package such as `modules/kitchensink/` (which declares a `./testing` entry) exercises both at once: deduplicated pages with "Available from" metadata on the doc side, and separate `index.d.ts` / `testing.d.ts` files on the VFS side.

## Related documentation

- **Multi-Entry Resolution:** `multi-entry-resolution.md` — deduplication, route collisions, "Available from"
- **Multi-Entry VFS:** `multi-entry-vfs.md` — per-entry `.d.ts` generation and synthetic `package.json`
- **Page Generation System:** `page-generation-system.md` — Stream pipeline consuming resolved entry items
- **Type Loading & VFS:** `type-loading-vfs.md` — VFS integration with Twoslash
