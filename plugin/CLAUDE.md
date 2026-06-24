# plugin/CLAUDE.md

The publishable `rspress-plugin-api-extractor` package.

## Architecture

Built via `definePlugin()` from `@savvy-web/rspress-builder` (`plugin/savvy.build.ts`, a self-executing module that calls `runBuild`). The config passes `runtime: true`, `dtsBundledPackages`, `apiModel.tsdoc.suppressWarnings`, and a `transform` that rewrites the scoped package name per registry and strips dev-only fields. The runtime emission lives in `@savvy-web/rspress-builder`, not here. Published via `publishConfig.directory` (`dist/dev/pkg`) — there is no `files` field.

| Artifact | Entry | Target | Output |
| -------- | ----- | ------ | ------ |
| Plugin | `src/index.ts` | Node.js | per-file `.js` under `dist/<mode>/pkg/` (`index.js`, `serve.js`, etc.) |
| Runtime | `src/runtime/` | bundleless per-file JS | `dist/<mode>/pkg/runtime/` (RSPress does the final per-site compile) |
| API model | — | `.api.json` | `dist/<mode>/meta/` |

The React runtime ships **bundleless** (per-file compiled JS), not as raw `.tsx`. The builder transpiles each component to its own `.js` under `runtime/`, mirroring `src/runtime/...`, with `react`/`@theme` external and `import.meta.env.SSG_MD` left unresolved for RSPress to fill in per build. It also emits a bundled `runtime/index.d.ts`. The published `./runtime` export is `{ types: "./runtime/index.d.ts", import: "./runtime/index.js" }`.

### Runtime ships bundleless

Per-file compiled JS (not a single bundled chunk) is required because `import.meta.env.SSG_MD` is resolved only when RSPress compiles the component per site build; the bundleless output keeps the import-meta reference unresolved (external `react`/`@theme`, no inlining) so RSPress's compile produces the correct dual-mode (HTML vs markdown) rendering. `ApiLlmsPackageActions` (`globalUIComponents`) and `ApiLlmsViewOptions` (`resolve.alias`) register against these transpiled component files and use RSPress runtime hooks.

The component paths in `plugin.ts` are a **zero-level** resolve to the published `.js` — `path.resolve(pluginDir, "runtime/components/<Name>/index.js")`, e.g. `runtime/components/ApiLlmsViewOptions/index.js` — not `src/runtime/.../index.tsx`. It is layout-invariant because the runtime sits next to `index.js` in both the dev (`dist/dev`) and published (flat root) layouts. The old `../../src/runtime/` path only worked in the linked dev layout; in the published flat layout it overshot and broke `llms: true` builds for external consumers. Do not reintroduce the `../../` prefix.

### Effect Service Layer

The plugin uses Effect-TS for all build orchestration. `plugin.ts` is a thin
RSPress adapter (~380 lines) that wires an Effect `ManagedRuntime` with a
composed `Layer` stack:

- `ConfigServiceLive` — resolves plugin options + RSPress config into build
  context (model loading, type resolution, highlighter creation)
- `SnapshotServiceLive` — SQLite via `@effect/sql-sqlite-node` with managed
  migrations and WAL lifecycle
- `TypeRegistryServiceLive` — external package type loading via
  `type-registry-effect`
- `PathDerivationServiceLive` — route and output path computation
- `EventBus` layer (from `buildEventBus`) — synchronous fan-out event bus
  wiring console, metrics, and optional JSONL trace sinks
- `NodeFileSystem.layer` — cross-platform file I/O from `@effect/platform`

Doc generation runs as a `Stream` pipeline in `build-stages.ts`:
`Stream.fromIterable -> Stream.mapEffect(generateSinglePage) ->
Stream.mapEffect(writeSingleFile) -> Stream.runFold`

### Observability

The plugin emits structured `PluginEvent` values through a **synchronous
fan-out EventBus** (`src/observability/EventBus.ts`) rather than writing
directly to the console or incrementing metrics inline.

`buildEventBus(obs)` (`layers/ObservabilityLive.ts`) composes three sinks:

- **Console sink** — human-readable one-liners (or JSON at `logLevel: "debug"`),
  filtered by the configured level
- **Metrics sink** — translates events to `BuildMetrics` counters/histograms
  via `Effect.runSync`; exact counts are available when `logBuildSummary` runs
  in `afterBuild`
- **Trace sink** (opt-in) — full-fidelity JSONL written to `observability.trace`
  path; `minLevel: "trace"`, independent of console level

Twoslash and Prettier error callbacks fire outside Effect fibers.
`makeRuntimeEmitter(runtime)` creates a sync bridge (`runtime.runSync(emit(event))`);
`plugin.ts` injects it into both modules via `setEventEmitter(emitSync)`.

A best-effort stream tee (`src/observability/stream.ts`) is exported but not
wired into the live plugin — available for custom integrations.

OpenTelemetry spans (`Effect.withSpan`) exist in the span substrate
(`src/observability/spans.ts`) but no OTLP exporter is wired. This is a dormant
seam for future integration.

See `performance-observability.md` and `error-observability.md` in the design
docs for the full architecture.

## Key Dependencies

- `effect` — core Effect-TS runtime (services, layers, streams, metrics)
- `@effect/platform` + `@effect/platform-node` — cross-platform file I/O
- `@effect/sql` + `@effect/sql-sqlite-node` — typed SQLite with migrations
- `type-registry-effect` — npm package type definition loading
- `api-extractor-llms` — shared pure renderer: model loading, TSDoc extraction, type-signature formatting, prose cross-linking (the plugin delegates these to it)
- `@microsoft/api-extractor-model` — `.api.json` model parsing (direct dep; model loading now flows through `api-extractor-llms`'s `loadApiModel`)
- `@shikijs/twoslash` — syntax highlighting with type information
- `open` — best-effort browser launch for the `serve()` dev/preview runner

## Biome Override

`plugin/biome.jsonc` disables `useImportExtensions` for CSS and runtime
component files. This is required because the runtime imports `.css` files
which the global biome rule would rewrite to `.js`.

## Source Structure

- `src/index.ts` — main plugin entry (re-exports plugin.ts, serve.ts)
- `src/plugin.ts` — RSPress adapter (~380 lines), runtime management
- `src/serve.ts` — public `serve(options?)` dev/preview RSPress server runner (exports `ServeOptions`/`ServeMode`/`ResolvedServeConfig`/`isServerReady`/`resolveServeConfig`); used by the sites' `lib/scripts/dev.mts` and `preview.mts`
- `src/build-program.ts` — doc generation orchestration (5-stage pipeline)
- `src/build-stages.ts` — Stream pipeline, page gen, file writes (~1220 lines)
- `src/multi-entry-resolver.ts` — multi-entry point deduplication and collision detection
- `src/content-hash.ts` — SHA-256 hashing (pure, standalone)
- `src/observability/` — EventBus, PluginEvent taxonomy, sinks (console/trace/metrics), span helpers, stream tee
  - `events.ts` — `PluginEvent` taggedEnum, `EventLevel`, `EventContext`, `levelOf`
  - `EventBus.ts` — synchronous fan-out bus, `makeRuntimeEmitter`, `EventBusNoop`
  - `sinks/` — `console-sink.ts`, `trace-sink.ts`, `metrics-sink.ts`, `types.ts`
  - `spans.ts` — `withPhase`, `withOp`, `PHASE_THRESHOLD_KEY`
  - `stream.ts` — best-effort sliding-queue stream tee (exported, not wired to live plugin)
- `src/schemas/` — Effect Schema definitions (config, opengraph, performance, observability)
- `src/services/` — Effect service interfaces (Context.Tag)
- `src/layers/` — Effect Layer implementations
- `src/migrations/` — SQLite schema migrations
- `src/internal-types.ts` — internal type definitions
- `src/errors.ts` — tagged error types
- `src/markdown/` — page generators (class, enum, function, interface, etc.)
- `src/runtime/` — React components for SSG-compatible rendering
- `src/runtime/components/` — UI components (SignatureBlock, etc.)
- `src/__fixtures__/` — test fixtures (API model JSON, declarations)

`model-loader.ts`, `formatter.ts`, the `ApiParser` TSDoc statics in `loader.ts`, and `MarkdownCrossLinker.addCrossLinks` are thin adapters over `api-extractor-llms`. Page generators, call sites, and `ApiExtractedPackage.extractPlainText` (a distinct `.d.ts` algorithm preserving `{@link}` and code fences) stay plugin-local.

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
- @./.claude/design/rspress-plugin-api-extractor/multi-entry-resolution.md
- @./.claude/design/rspress-plugin-api-extractor/multi-entry-vfs.md

**LLMs integration** — load when modifying llms.txt post-processing,
per-package file generation, or scope-aware UI components:

- @./.claude/design/rspress-plugin-api-extractor/llms-integration.md

**Observability** — load when modifying metrics, logging, or error tracking:

- @./.claude/design/rspress-plugin-api-extractor/performance-observability.md
- @./.claude/design/rspress-plugin-api-extractor/error-observability.md
