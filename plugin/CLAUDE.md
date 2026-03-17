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

**Type loading & VFS** — load when modifying Twoslash, external package
types, or VFS generation:

- @./.claude/design/rspress-plugin-api-extractor/type-loading-vfs.md
- @./.claude/design/rspress-plugin-api-extractor/multi-entry-point-support.md

**Observability** — load when modifying metrics, logging, or error tracking:

- @./.claude/design/rspress-plugin-api-extractor/performance-observability.md
- @./.claude/design/rspress-plugin-api-extractor/error-observability.md
