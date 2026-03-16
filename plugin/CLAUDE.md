# plugin/CLAUDE.md

The publishable `rspress-plugin-api-extractor` package.

## Architecture

Uses a **custom rslib config** (`@rslib/core` `defineConfig()` directly, NOT
`@savvy-web/rslib-builder`). Two bundles:

| Bundle | Entry | Target | Output |
| ------ | ----- | ------ | ------ |
| Runtime | `src/runtime/index.tsx` | web (React) | `dist/runtime/` |
| Plugin | `src/index.ts` | Node.js | `dist/` |

The runtime bundle uses `@rsbuild/plugin-react`, BannerPlugin for CSS
injection, and CSS modules. The plugin bundle is a single Node.js file with
external dependencies.

## Key Dependencies

- `type-registry-effect` — npm package for fetching/caching TypeScript type
  definitions. Use Promise wrappers from `type-registry-effect/node` (not the
  Effect-based API from the main entry).
- `@microsoft/api-extractor-model` — parses `.api.json` model files
- `@shikijs/twoslash` — syntax highlighting with type information
- `better-sqlite3` — snapshot tracking database

## Biome Override

`plugin/biome.jsonc` disables `useImportExtensions` for CSS and runtime
component files. This is required because the runtime imports `.css` files
which the global biome rule would rewrite to `.js`.

## Source Structure

- `src/index.ts` — main plugin entry
- `src/plugin.ts` — plugin implementation (~1500 lines)
- `src/types.ts` — shared types
- `src/markdown/` — page generators (class, enum, function, interface, etc.)
- `src/runtime/` — React components for SSG-compatible rendering
- `src/runtime/components/` — UI components (ApiSignature, SignatureBlock, etc.)
- `src/__fixtures__/` — test fixtures (API model JSON, declarations)

## Design Docs

Load these when working on specific subsystems:

- @./.claude/design/rspress-plugin-api-extractor/build-architecture.md
- @./.claude/design/rspress-plugin-api-extractor/page-generation-system.md
- @./.claude/design/rspress-plugin-api-extractor/cross-linking-architecture.md
- @./.claude/design/rspress-plugin-api-extractor/component-development.md
- @./.claude/design/rspress-plugin-api-extractor/ssg-compatible-components.md
- @./.claude/design/rspress-plugin-api-extractor/type-loading-vfs.md
- @./.claude/design/rspress-plugin-api-extractor/import-generation-system.md
- @./.claude/design/rspress-plugin-api-extractor/multi-entry-point-support.md
- @./.claude/design/rspress-plugin-api-extractor/source-mapping-system.md
- @./.claude/design/rspress-plugin-api-extractor/snapshot-tracking-system.md
- @./.claude/design/rspress-plugin-api-extractor/performance-observability.md
- @./.claude/design/rspress-plugin-api-extractor/error-observability.md
