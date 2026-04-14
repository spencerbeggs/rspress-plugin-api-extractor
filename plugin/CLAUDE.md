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

### Effect Service Layer

The plugin uses Effect-TS for all build orchestration. `plugin.ts` is a thin
RSPress adapter (~252 lines) that wires an Effect `ManagedRuntime` with a
composed `Layer` stack:

- `ConfigServiceLive` — resolves plugin options + RSPress config into build
  context (model loading, type resolution, highlighter creation)
- `SnapshotServiceLive` — SQLite via `@effect/sql-sqlite-node` with managed
  migrations and WAL lifecycle
- `TypeRegistryServiceLive` — external package type loading via
  `type-registry-effect`
- `PathDerivationServiceLive` — route and output path computation
- `PluginLoggerLayer` — custom Effect Logger with human-readable and JSON modes
- `NodeFileSystem.layer` — cross-platform file I/O from `@effect/platform`

Doc generation runs as a `Stream` pipeline in `build-stages.ts`:
`Stream.fromIterable -> Stream.mapEffect(generateSinglePage) ->
Stream.mapEffect(writeSingleFile) -> Stream.runFold`

## Key Dependencies

- `effect` — core Effect-TS runtime (services, layers, streams, metrics)
- `@effect/platform` + `@effect/platform-node` — cross-platform file I/O
- `@effect/sql` + `@effect/sql-sqlite-node` — typed SQLite with migrations
- `type-registry-effect` — npm package type definition loading
- `@microsoft/api-extractor-model` — parses `.api.json` model files
- `@shikijs/twoslash` — syntax highlighting with type information

## Biome Override

`plugin/biome.jsonc` disables `useImportExtensions` for CSS and runtime
component files. This is required because the runtime imports `.css` files
which the global biome rule would rewrite to `.js`.

## Source Structure

- `src/index.ts` — main plugin entry (re-exports plugin.ts)
- `src/plugin.ts` — RSPress adapter (~252 lines), runtime management
- `src/build-program.ts` — doc generation orchestration (5-stage pipeline)
- `src/build-stages.ts` — Stream pipeline, page gen, file writes (~1120 lines)
- `src/multi-entry-resolver.ts` — multi-entry point deduplication and collision detection
- `src/content-hash.ts` — SHA-256 hashing (pure, standalone)
- `src/schemas/` — Effect Schema definitions (config, opengraph, performance)
- `src/services/` — Effect service interfaces (Context.Tag)
- `src/layers/` — Effect Layer implementations
- `src/migrations/` — SQLite schema migrations
- `src/internal-types.ts` — internal type definitions
- `src/errors.ts` — tagged error types
- `src/markdown/` — page generators (class, enum, function, interface, etc.)
- `src/runtime/` — React components for SSG-compatible rendering
- `src/runtime/components/` — UI components (SignatureBlock, etc.)
- `src/__fixtures__/` — test fixtures (API model JSON, declarations)

## Testing

```bash
pnpm vitest run plugin/            # Run all plugin tests
pnpm vitest run plugin/__test__/   # Run only __test__/ directory tests
pnpm vitest run plugin/src/        # Run colocated source tests
```

Fixtures in `src/__fixtures__/`. Mock layers in `__test__/utils/layers.ts`.

## Interactive Frontend Debugging

For CSS and component debugging with Playwright MCP browser inspection:

```bash
# 1. Build plugin + modules first
pnpm run build

# 2. Start the basic site dev server (suppresses browser auto-open)
NO_OPEN=1 pnpm dev:basic

# 3. Use Playwright MCP to navigate to http://localhost:4173/api/...
```

**Iteration loop for CSS/component changes:**

1. Edit CSS in `src/runtime/components/`
2. Rebuild plugin: `pnpm --filter rspress-plugin-api-extractor run build:dev`
3. Kill and restart the dev server (the RSPress dev server does NOT
   hot-reload when the plugin's dist files change — it must be restarted)
4. Navigate in Playwright to verify

**Key patterns:**

- Twoslash popup CSS is global (not CSS modules) in
  `src/runtime/components/shared/_twoslash.css` — targets Shiki-generated
  class names
- SignatureCode CSS is a CSS module in
  `src/runtime/components/SignatureCode/index.module.css` — CSS module
  selectors have higher specificity than global selectors; use
  `.twoslash .twoslash-popup-container .twoslash-popup-docs` (3 classes)
  to beat `.code-xxx code` (1 class + 1 element)
- Twoslash popups use `position: fixed` when visible (escapes scroll
  containers); JS in `SignatureCode/index.tsx` sets `--popup-top`,
  `--popup-left`, `--popup-max-width` CSS custom properties on hover
- Hidden popups collapse to `width: 0; height: 0; overflow: hidden` to
  avoid expanding the `<pre>` scroll area
- The `<pre>` element uses `overflow-x: auto` for horizontal code
  scrolling; per CSS spec this forces `overflow-y: auto` too

## Design Docs

**Build & infrastructure** — load when modifying services, layers, or
plugin lifecycle:

- @./.claude/design/rspress-plugin-api-extractor/build-architecture.md
- @./.claude/design/rspress-plugin-api-extractor/snapshot-tracking-system.md

**Page generation & markdown** — load when modifying Stream pipeline,
page generators, or cross-linking:

- @./.claude/design/rspress-plugin-api-extractor/page-generation-system.md
- @./.claude/design/rspress-plugin-api-extractor/cross-linking-architecture.md
- @./.claude/design/rspress-plugin-api-extractor/import-generation-system.md
- @./.claude/design/rspress-plugin-api-extractor/source-mapping-system.md

**Runtime components & SSG** — load when modifying React components or
SSG-MD rendering:

- @./.claude/design/rspress-plugin-api-extractor/component-development.md
- @./.claude/design/rspress-plugin-api-extractor/ssg-compatible-components.md

**Type loading, VFS & multi-entry points** — load when modifying Twoslash,
external package types, VFS generation, or multi-entry point resolution:

- @./.claude/design/rspress-plugin-api-extractor/type-loading-vfs.md
- @./.claude/design/rspress-plugin-api-extractor/multi-entry-point-support.md

**LLMs integration** — load when modifying llms.txt post-processing,
per-package file generation, or scope-aware UI components:

- @./.claude/design/rspress-plugin-api-extractor/llms-integration.md

**Observability** — load when modifying metrics, logging, or error tracking:

- @./.claude/design/rspress-plugin-api-extractor/performance-observability.md
- @./.claude/design/rspress-plugin-api-extractor/error-observability.md
