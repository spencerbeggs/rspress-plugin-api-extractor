---
status: current
module: rspress-plugin-api-extractor
category: source-mapping
created: 2026-05-26
updated: 2026-06-01
last-synced: 2026-06-01
completeness: 85
related:
  - rspress-plugin-api-extractor/multi-entry-point-support.md
  - rspress-plugin-api-extractor/multi-entry-resolution.md
  - rspress-plugin-api-extractor/type-loading-vfs.md
  - rspress-plugin-api-extractor/import-generation-system.md
  - rspress-plugin-api-extractor/build-architecture.md
dependencies: []
---

# Multi-Entry VFS Generation

## Overview

To give Twoslash a TypeScript project it can type-check against, the plugin reconstructs `.d.ts` files from the API Extractor model and writes them into a virtual file system under `node_modules/<package>/`. Each entry point gets its own declaration file, and the synthetic `package.json` exposes those files via either a `types` field (single entry) or an `exports` map (multiple entries) so TypeScript resolves cross-entry references the way the real package would.

For deduplication and route-collision handling in the documentation pipeline, see `multi-entry-resolution.md`.

## ApiExtractedPackage

`ApiExtractedPackage` (`src/api-extracted-package.ts`) extends `VirtualPackage` from `type-registry-effect`. It overrides declaration generation to emit high-fidelity `.d.ts` output from an `ApiPackage` — enum values, full JSDoc, namespace members and all interface member kinds — while delegating the VFS map and `package.json` synthesis to the base class.

Factory methods:

- `ApiExtractedPackage.fromApiModel(modelPath)` — load an `.api.json` file and build the package.
- `ApiExtractedPackage.fromPackage(apiPackage, packageName)` — build from an in-memory `ApiPackage`.

`fromPackage` walks the package's entry points, derives each entry's file name (`index.d.ts` for the main entry, `<name>.d.ts` for named entries) and calls `generateDeclarations(entryPoint)` to populate the entries map passed to the `VirtualPackage` constructor.

`ApiExtractedPackage` keeps its OWN private `extractPlainText` and does NOT delegate to the `api-extractor-llms` library helper of the same name. The two share a name but are different algorithms: this one PRESERVES `{@link X.Y}` TSDoc syntax and reconstructs fenced code blocks (needed for faithful `.d.ts`/JSDoc reconstruction), whereas the library helper flattens `{@link}` to display text and drops code fences (for prose TSDoc extraction). They are not interchangeable. The plugin's other shells that DO delegate to the library are summarized in `build-architecture.md`.

## VFS layout

`generateVfs()` (inherited from `VirtualPackage`) returns a `Map<string, string>` prefixed with `node_modules/<package>/`:

```text
Single entry point:
node_modules/my-package/
  ├── index.d.ts          (all declarations)
  └── package.json        { "types": "index.d.ts" }

Multiple entry points:
node_modules/my-package/
  ├── index.d.ts          (main entry declarations)
  ├── testing.d.ts        (testing entry declarations)
  └── package.json        { "exports": {
       ".":        { "types": "./index.d.ts" },
       "./testing": { "types": "./testing.d.ts" } } }
```

The `types`-vs-`exports` decision lives in `VirtualPackage.generatePackageJson()` in `type-registry-effect`, driven by how many entries the package has. `ApiExtractedPackage` only supplies the entries map; it does not build `package.json` itself.

## Import prepending

`generateVfs()` emits declarations only. External type references (e.g. `ZodType` from `zod`) still need `import type` statements, which are prepended afterward by `prependImportsToVfs` in `ConfigServiceLive`. See `import-generation-system.md`.

## Backward compatibility

Single-entry packages are detected automatically (`entries.size <= 1`) and use the simple `types` field, so the VFS works with every TypeScript module resolution strategy. Multi-entry packages use `exports`, and cross-entry references (a `testing.d.ts` type referencing a `Plugin` declared in `index.d.ts`) resolve through TypeScript's own module resolution against the synthetic `package.json`.

## Known limitations

- **Exports complexity** — the synthetic `package.json` only emits the simple `{ "types": "…" }` form, not conditional exports.
- **Subpath nesting** — nested entry names like `./utils/helpers` are carried through as file names but not specially flattened.

## Related documentation

- **Multi-Entry Point Support:** `multi-entry-point-support.md` — overview linking the resolution and VFS subsystems
- **Multi-Entry Resolution:** `multi-entry-resolution.md` — deduplication and route collisions
- **Type Loading & VFS:** `type-loading-vfs.md` — external package type loading and VFS consumption
- **Import Generation System:** `import-generation-system.md` — prepending external imports to entry declarations
- **Build Architecture:** `build-architecture.md` — `api-extractor-llms` delegation boundaries (and why this doc's `extractPlainText` is not one of them)
