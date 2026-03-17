# Effect-TS Migration Design for rspress-plugin-api-extractor

## Overview

Migrate the rspress-plugin-api-extractor plugin from Promise-based async
orchestration to Effect-TS. The migration follows a three-phase hybrid
strategy: infrastructure first, bug fixes as validation, then incremental
service migration.

### Goals

- Replace fragile async orchestration with typed Effect programs
- Fix 3 active bugs (context clobbering, versioned path bypass, tsconfig
  sharing)
- Eliminate 5 ad-hoc observability collectors with Effect logging and metrics
- Enable full mock-layer testing at every service boundary
- Manage resource lifecycles (SQLite, Shiki highlighter) with guaranteed
  cleanup

### Non-Goals

- Exposing Effect types in the public plugin API (Effect is an
  implementation detail)
- Rewriting runtime React components (unaffected by this migration)
- Changing the plugin's external behavior or configuration surface

### Constraints

- Plugin must return a standard `RspressPlugin` object (plain JS surface)
- RSPress hooks (`config`, `beforeBuild`, `afterBuild`) are the integration
  points
- Remark plugins run in RSPress's build phase, outside direct Effect fiber
  control
- Companion repos (`type-registry-effect`, `semver-effect`, `jsonc-effect`)
  establish Effect patterns to follow
- Existing `__fixtures__/` API model files must remain usable in tests

## Decisions Record

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Public API surface | Effect internal, plain JS surface | Plugin consumers are RSPress sites, not Effect users |
| `@effect/platform` | Full adoption | Testability via mock FileSystem, HttpClient layers |
| SQLite driver | `@effect/sql` + `@effect/sql-sqlite-node` | Typed queries, Layer-based lifecycle, native Effect |
| Concurrency model | `Stream`-based pipeline | Backpressure, stage overlap, natural pipeline modeling |
| Observability | Effect Logger + Metrics | Eliminates 5 custom collectors, fiber-scoped context |
| Testing | Full mock layers at every boundary | Maximum isolation, consistent with companion repos |
| Migration strategy | Hybrid: skeleton, bug-fix validation, incremental | Low-risk per phase, each phase independently shippable |
| Test location | `plugin/__test__/(utils\|fixtures)` | Vitest configured for this pattern by default |

## Architecture

### Two Execution Contexts

The plugin operates in two distinct phases with different execution models:

- **Context 1 -- `beforeBuild` (Effect-controlled):**
  The plugin's `beforeBuild` hook runs the main build program as an Effect
  `Stream` pipeline. This handles API model loading, page generation,
  snapshot tracking, and file writing. Effect has full control over
  concurrency, error handling, and resource lifecycle.

- **Context 2 -- RSPress markdown processing (remark plugins):**
  After `beforeBuild` writes MDX files, RSPress compiles them through its
  own markdown pipeline. The remark plugins (`remark-api-codeblocks.ts`,
  `remark-with-api.ts`) run during this phase. They handle Shiki/Twoslash
  rendering and are called by RSPress, not by our Effect program.

- **Bridge between contexts:** The `ManagedRuntime` instance is stored at
module scope (closure in the plugin factory). Remark plugins access
services via `runtime.runPromise()` for operations that need Effect
services (e.g., Shiki highlighting, cross-linker lookups). This keeps
the runtime alive across both phases -- `runtime.dispose()` is only
called in `afterBuild`.

```text
Plugin Factory (module scope)
  |
  +-- ManagedRuntime (lives across both contexts)
  |
  +-- Context 1: beforeBuild
  |     +-- Effect Stream pipeline
  |     +-- Generates MDX files with raw code fences
  |     +-- Registers cross-link data, VFS config
  |
  +-- Context 2: RSPress markdown processing
  |     +-- remark-api-codeblocks reads VFS config via VfsRegistry
  |     +-- Shiki/Twoslash rendering uses runtime.runPromise()
  |     +-- Error context passed per-file (not shared mutable state)
  |
  +-- Context 3: afterBuild
        +-- Log final metrics summary
        +-- runtime.dispose() -- guaranteed cleanup
```

### ManagedRuntime Bridge

```text
apiExtractorPlugin(options)
  |
  +-- Validate options via Schema.decodeUnknownSync (fail fast)
  |
  +-- Build AppLayer:
  |     Layer.mergeAll(
  |       SnapshotServiceLive,
  |       ShikiServiceLive,
  |       TypeRegistryLive,
  |       PageGeneratorServiceLive,
  |       PathDerivationServiceLive,
  |       ObservabilityLive,
  |       SqlLive,
  |       NodeFileSystem.layer,
  |       NodeHttpClient.layer,
  |     )
  |
  +-- Create ManagedRuntime.make(AppLayer)
  |
  +-- Return RspressPlugin {
        config(config):
          Sync hook -- config merging only
          Shiki cross-linker transformer created outside Effect
          (it is a plain ShikiTransformer object, not an Effect)

        async beforeBuild(config, isProd):
          await runtime.runPromise(buildProgram(config, isProd))

        async afterBuild(config, isProd):
          await runtime.runPromise(finalizeBuild)
          await runtime.dispose()  // Guaranteed cleanup
      }
```

Key points:

- `config()` stays sync -- the Shiki cross-linker transformer is a plain
  object created from cross-link data populated during `beforeBuild`
- `ManagedRuntime.make()` called once in the factory, not per-build
- `runtime.dispose()` in `afterBuild` guarantees `acquireRelease`
  finalizers run (DB checkpoint, file handle cleanup) even on failure
- Schema validation at factory time -- fail before RSPress starts

### Service Dependency Graph

```text
                       BuildProgram
                            |
            +---------------+-------------------+
            |               |                   |
   PageGeneratorService  SnapshotService   TypeRegistryService
            |               |                   |
   +--------+--------+     |            +------+------+
   |        |        |     |            |             |
ShikiSvc    |  CrossLinkerSvc        CacheSvc    PackageFetcher
            |                          |             |
   PathDerivationService          SqlClient     HttpClient
                                      |             |
                                 @effect/sql   @effect/platform
                                 sqlite-node   node (HttpClient)
                                      |
                                 FileSystem
                                      |
                                 @effect/platform-node
```

### Service Definitions

All services follow the companion repo pattern: interface +
`Context.GenericTag`.

| Service | Responsibility | Key Methods |
| --------- | --------------- | ------------- |
| `PathDerivationService` | Route/output path computation | `derivePaths(input) -> Effect<DerivedPath[]>` |
| `SnapshotService` | File change detection, timestamps | `getSnapshot`, `upsert`, `cleanupStale`, `hashContent` |
| `ShikiService` | Syntax highlighting + Twoslash | `highlightCode`, `createTransformer` |
| `CrossLinkerService` | Type reference linking | `registerItems`, `getTransformer`, `generateLinks` |
| `TypeRegistryService` | External package type loading | `loadPackages -> Effect<VirtualFileSystem>` |
| `PageGeneratorService` | Stream pipeline orchestration | `generatePages(model) -> Stream<GeneratedPage>` |
| `ConfigService` | Validated plugin + RSPress config | `getApiConfig`, `getPerformanceThresholds` |

### Error Types

All errors use the `*Base` + class pattern from companion repos for API
Extractor bundling compatibility.

| Error | Scenarios | Recovery |
| ------- | ----------- | -------- |
| `ConfigValidationError` | Invalid plugin options | Fatal -- abort before build starts |
| `ApiModelLoadError` | Model file not found, parse failure | Fatal -- abort build |
| `SnapshotDbError` | SQLite open/query/write failure | Fatal -- abort build |
| `PathDerivationError` | Invalid route or path configuration | Fatal -- abort build |
| `TypeRegistryError` | Package fetch/cache/resolution failure | Recoverable -- continue without external types, log warning |
| `PageGenerationError` | Page generator failure for specific item | Recoverable -- skip item, log warning, continue pipeline |
| `TwoslashProcessingError` | Twoslash compiler error | Ignorable -- log only, code block renders without type info |
| `PrettierFormatError` | Code formatting failure | Ignorable -- log only, use unformatted code |

## Stream Pipeline

The `beforeBuild` Stream pipeline handles page generation and file writing.
This covers Context 1 only -- Shiki/Twoslash rendering in remark plugins
(Context 2) happens later during RSPress's markdown compilation.

```text
LoadModels
    |
    v
Stream.fromIterable(apis)          // For each API config
    |
    v
FlatMap: DeriveOutputPaths          // PathDerivationService for ALL variants
    |
    v
FlatMap: GenerateWorkItems          // Expand to (apiItem x outputPath) pairs
    |
    v
MapEffect(concurrency: N):         // Per-fiber context via FiberRef
  +-- annotateLog("api", name)
  +-- annotateLog("version", v)
  +-- annotateLog("file", path)
  +-- Generate page content (raw code fences, no Shiki yet)
  +-- Hash content + frontmatter
  +-- Emit GeneratedPage
    |
    v
MapEffect(concurrency: N):         // Snapshot comparison
  +-- Query SnapshotService
  +-- Compare hashes
  +-- Determine state (new/modified/unchanged)
  +-- Preserve/update timestamps
  +-- Emit FileWriteDecision
    |
    v
Filter: changed only               // Skip unchanged files
    |
    v
MapEffect(concurrency: N):         // Write stage
  +-- Write file via FileSystem
  +-- Upsert snapshot
  +-- Metric.counter("files.written")
  +-- Emit WriteResult
    |
    v
RunFold: accumulate stats           // Final aggregation
```

Concurrency `N` defaults to `os.cpus().length` (matching the current
`pageConcurrency` behavior). Configurable via plugin options.

Backpressure is natural -- if writes are slower than generation, generation
pauses. This prevents memory buildup from buffering hundreds of generated
pages.

## Bug Fixes

The three active bugs are fixed by the Effect architecture:

### Bug 1: Twoslash Error Context Clobbering (plugin.ts:575)

**Problem:** `twoslashErrorStats.setContext()` is shared mutable state.
Concurrent workers in `parallelLimit` overwrite each other's context.
The same pattern exists in `prettier-error-stats.ts`. Affected call sites:
`plugin.ts:575`, remark plugin context management, and prettier stats.

**Fix (Context 1 -- beforeBuild):** Each work item fiber in the Stream
pipeline gets its own log annotations via `Effect.annotateLogs`. When a
`TwoslashProcessingError` occurs, the fiber's annotations automatically
include the correct `api`, `version`, and `file`. No shared state.

**Fix (Context 2 -- remark plugins):** Remark plugins receive the file
path from the VFile argument. Instead of calling
`setContext()`/`clearContext()` on a shared singleton, they pass context
directly to `runtime.runPromise()` via `Effect.annotateLogs` scoped to
that call. Each file's remark processing carries its own context.

### Bug 2: Versioned Path Bypass (plugin.ts:1550)

**Problem:** Versioned API path computation manually constructs
`outputDir` via `path.join(rspressRoot, version, baseRoute, apiFolder)`,
bypassing `deriveOutputPaths()`. This means `locales` and `defaultLang`
are not passed through, so i18n + versioned documentation silently
generates only for the default locale.

**Fix:** The `DeriveOutputPaths` stream stage calls
`PathDerivationService.derivePaths()` for every API including versioned
ones, passing `locales` and `defaultLang`. There is no separate code path
-- the service handles the locale x version cross-product uniformly.

### Bug 3: Multi-API Tsconfig Sharing (plugin.ts:1625)

**Problem:** In multi-API mode, `firstApiTsconfig` captures the first
API's tsconfig and uses it for all APIs. Race conditions in
`Promise.all` make "first" non-deterministic.

**Fix:** Each API in multi-API mode gets its own `Layer` composition:

```text
Stream.fromIterable(apis).pipe(
  Stream.mapEffect((api) => {
    const apiLayer = Layer.mergeAll(
      ShikiServiceLive(api.tsconfig, api.compilerOptions),
      TypeRegistryServiceLive(api.externalPackages),
    );
    return generateApiDocs(api).pipe(Effect.provide(apiLayer));
  })
)
```

Each API resolves its own tsconfig through its own layer.

## Observability

### Logger Layer

A single custom `Logger` layer replaces `DebugLogger` and all 5 stats
collectors' logging methods. The log level from plugin options maps to
`Logger.withMinimumLogLevel`.

Output format by level:

- **DEBUG:** Structured JSON per line (LLM-friendly)
- **VERBOSE:** Human-readable with api/version/file context
- **INFO:** Brief summary output

### Metrics

| Metric | Type | Replaces |
| -------- | ------ | ---------- |
| `files.total` | Counter | `FileGenerationStatsCollector.totalFiles` |
| `files.new` | Counter | `FileGenerationStatsCollector.newFiles` |
| `files.modified` | Counter | `FileGenerationStatsCollector.modifiedFiles` |
| `files.unchanged` | Counter | `FileGenerationStatsCollector.unchangedFiles` |
| `codeblock.duration` | Histogram | `CodeBlockStatsCollector.recordBlock()` |
| `codeblock.slow` | Counter | `CodeBlockStatsCollector.slowBlocks` |
| `twoslash.errors` | Counter | `TwoslashErrorStatsCollector.errors.length` |
| `prettier.errors` | Counter | `PrettierErrorStatsCollector.errors.length` |
| `pages.generated` | Counter | Manual counting in plugin.ts |
| `build.duration` | Gauge | `PerformanceManager.measure("build.total")` |

Twoslash errors use fiber-scoped log annotations instead of
`setContext`/`clearContext`:

```text
Effect.annotateLogs({
  "error.code": "TS2440",
  "error.file": "api/class/Plugin.mdx",
  "error.api": "my-package",
}).pipe(
  Effect.andThen(Effect.logWarning("Twoslash error in code block")),
  Effect.andThen(Metric.increment(twoslashErrorCounter)),
)
```

## Schema Validation

Plugin options defined as `Schema.Struct` with refinements. Replaces
imperative if/throw validation in `config-validation.ts`.

Validation happens at factory time via `Schema.decodeUnknownSync` --
structured `ParseError` with all violations reported at once instead of
failing on the first error.

Cross-validation with RSPress config (multiVersion matching) moves into
`ConfigService` which receives both decoded plugin options and RSPress
config at build time.

Note: `build-events.ts` currently uses Zod for event schemas. This will
migrate to `Schema` in Phase 3 to eliminate the Zod dependency.

## Testing Architecture

Full mock layers at every service boundary.

### Test Layer Structure

```text
TestLayer = Layer.mergeAll(
  MockFileSystem,         // @effect/platform test utilities
  MockHttpClient,         // @effect/platform test utilities
  MockSqlClient,          // In-memory or fixture-based
  MockShikiService,       // Returns pre-rendered HTML strings
  MockTypeRegistry,       // Returns fixture VFS maps
)
```

### Mock Patterns

Following companion repo conventions:

- `Layer.succeed` with static fixture data for stateless mocks
- `Layer.effect` with `Ref` for stateful mocks that track calls
- Existing `__fixtures__/` API model files reused as test data

### Test Levels

| Level | What | Layers | Example |
| ------- | ------ | -------- | --------- |
| Unit | Individual service logic | All mocks | `SnapshotService.hashContent` consistency |
| Service integration | Service interactions | Mix mock + real | `PageGeneratorService` with real `CrossLinkerService` |
| Pipeline | Full Stream pipeline | All mocks | Fixture model through pipeline, assert write decisions |
| Bug regression | The 3 fixed bugs | Targeted mocks | Context isolation, versioned+i18n paths, per-API tsconfig |

### Test File Location

Test infrastructure in `plugin/__test__/utils/` and
`plugin/__test__/fixtures/`. Bug regression tests in
`plugin/__test__/bugs/`.

### Existing Test Migration

Colocated test files (e.g., `src/snapshot-manager.test.ts`,
`src/path-derivation.test.ts`) are migrated to `plugin/__test__/` as their
corresponding source files are converted to Effect services. Tests for
files that are deleted in Phase 3 are rewritten against the new service
interfaces. Tests for unchanged files (page generators, loaders) remain
colocated until those files are modified.

## Backward Compatibility

Each migration phase produces a working, shippable build. The public API
contract (`RspressPlugin` return type, plugin options shape, generated MDX
output) is unchanged at every phase boundary. Consumers upgrading the
plugin at any phase see no behavior change.

## Bundle Size

Effect and `@effect/platform` are listed as `externals` in the rslib
config -- they are not bundled into the plugin's output. Consumers install
them as dependencies. The plugin's own bundle size remains comparable
(Effect replaces `async`, `better-sqlite3`, and custom observability code).
The `@effect/sql-sqlite-node` package uses `better-sqlite3` under the
hood, so the native module situation is unchanged for consumers.

## Migration Phases

### Phase 1: Effect Infrastructure

Stand up the service skeleton and ManagedRuntime bridge. Existing code
wrapped in `Effect.promise()` behind service interfaces. Everything works
as before, just routed through Effect.

**New files:**

| File | Purpose |
| ------ | --------- |
| `src/services/index.ts` | Re-exports all service interfaces |
| `src/services/SnapshotService.ts` | Interface + GenericTag |
| `src/services/ShikiService.ts` | Interface + GenericTag |
| `src/services/CrossLinkerService.ts` | Interface + GenericTag |
| `src/services/TypeRegistryService.ts` | Interface + GenericTag |
| `src/services/PageGeneratorService.ts` | Interface + GenericTag |
| `src/services/PathDerivationService.ts` | Interface + GenericTag |
| `src/services/ConfigService.ts` | Interface + GenericTag + Schema definitions |
| `src/layers/index.ts` | Re-exports all Live layers |
| `src/layers/SnapshotServiceLive.ts` | Wraps snapshot-manager.ts via Effect.promise |
| `src/layers/ShikiServiceLive.ts` | Wraps Shiki setup via Effect.promise |
| `src/layers/CrossLinkerServiceLive.ts` | Wraps singletons via Ref |
| `src/layers/TypeRegistryServiceLive.ts` | Direct type-registry-effect integration |
| `src/layers/PathDerivationServiceLive.ts` | Wraps deriveOutputPaths |
| `src/layers/PageGeneratorServiceLive.ts` | Wraps generators via Effect.promise |
| `src/layers/ConfigServiceLive.ts` | Schema validation + decoded config |
| `src/layers/ObservabilityLive.ts` | Custom Logger layer + Metric declarations |
| `src/errors.ts` | All TaggedError definitions |
| `src/build-program.ts` | Top-level Effect program |
| `__test__/utils/layers.ts` | Mock layers for all services |
| `__test__/utils/helpers.ts` | Test Effect runners, assertion helpers |

**Modified files:**

| File | Change |
| ------ | -------- |
| `src/plugin.ts` | Factory creates ManagedRuntime, hooks delegate to build-program.ts |
| `package.json` | Add effect, @effect/platform, @effect/platform-node, @effect/sql, @effect/sql-sqlite-node |

No deletions in Phase 1.

### Phase 2: Bug Fixes as Native Effect

Fix the 3 active bugs as the first native Effect implementations.

**Modified files:**

| File | Change |
| ------ | -------- |
| `src/build-program.ts` | Replace Effect.promise orchestration with Stream pipeline |
| `src/layers/PathDerivationServiceLive.ts` | Native Effect, versioned + i18n unified |
| `src/layers/ShikiServiceLive.ts` | Per-API Layer composition |
| `src/layers/ObservabilityLive.ts` | FiberRef annotations replace setContext/clearContext |
| `src/remark-api-codeblocks.ts` | Pass per-file context via runtime.runPromise, not shared state |
| `src/remark-with-api.ts` | Same remark context fix |

**New test files:**

| File | Purpose |
| ------ | --------- |
| `__test__/bugs/context-clobbering.test.ts` | Concurrent fiber annotation isolation |
| `__test__/bugs/versioned-i18n-paths.test.ts` | Versioned + i18n cross-product |
| `__test__/bugs/per-api-tsconfig.test.ts` | Multi-API tsconfig independence |

### Phase 3: Native Effect Migration

Migrate remaining services to native Effect, one by one.

**Files deleted (replaced by service/layer implementations):**

| Existing File | Replaced By |
| -------------- | ------------- |
| `src/snapshot-manager.ts` | `src/layers/SnapshotServiceLive.ts` |
| `src/type-registry-loader.ts` | `src/layers/TypeRegistryServiceLive.ts` |
| `src/debug-logger.ts` | `src/layers/ObservabilityLive.ts` |
| `src/performance-manager.ts` | `src/layers/ObservabilityLive.ts` |
| `src/code-block-stats.ts` | `src/layers/ObservabilityLive.ts` |
| `src/file-generation-stats.ts` | `src/layers/ObservabilityLive.ts` |
| `src/twoslash-error-stats.ts` | `src/layers/ObservabilityLive.ts` |
| `src/prettier-error-stats.ts` | `src/layers/ObservabilityLive.ts` |
| `src/config-validation.ts` | `src/services/ConfigService.ts` |
| `src/utils.ts` | `src/build-program.ts` (Stream replaces parallelLimit) |
| `src/build-events.ts` | `src/services/ConfigService.ts` (Zod schemas to Effect Schema) |

11 files deleted total.

### Files Unchanged by Migration

The following files are wrapped in Phase 1 but not rewritten. They
continue to work as-is behind Effect service interfaces:

- `src/loader.ts` -- API item categorization and namespace extraction
- `src/api-extracted-package.ts` -- Package model utilities and VFS gen
- `src/model-loader.ts` -- API model and package.json loading
- `src/markdown/page-generators/*.ts` -- All 7 page generators
- `src/markdown/helpers.ts` -- Shared generation utilities
- `src/markdown/cross-linker.ts` -- Markdown cross-linking
- `src/markdown/shiki-utils.ts` -- Shiki configuration and theming
- `src/shiki-transformer.ts` -- Shiki cross-linker transformer
- `src/category-resolver.ts` -- API category resolution
- `src/og-resolver.ts` -- Open Graph resolver
- `src/path-derivation.ts` -- Pure functions (used by PathDerivationService)
- `src/type-reference-extractor.ts` -- External type reference extraction
- `src/source-map-generator.ts` -- Source map generation
- `src/hide-cut-transformer.ts` -- Shiki transformer for member formatting
- `src/formatter.ts` -- Code formatting
- `src/code-post-processor.ts` -- Code post-processing
- `src/tsconfig-parser.ts` -- tsconfig.json parsing
- `src/typescript-config.ts` -- TypeScript configuration resolution
- `src/twoslash-patterns.ts` -- Twoslash pattern detection
- `src/twoslash-timing-wrapper.ts` -- Performance wrapper for Twoslash
- `src/vfs-registry.ts` -- VFS configuration registry
- `src/remark-api-codeblocks.ts` -- Modified in Phase 2, otherwise unchanged
- `src/remark-with-api.ts` -- Modified in Phase 2, otherwise unchanged
- `src/types.ts` -- Shared types (Schema types added alongside, not replacing)
- `src/runtime/` -- All React components (unaffected)

These files may be incrementally migrated to Effect in future work beyond
the scope of this spec.

### Dependency Changes

**Added (all direct dependencies):**

- `effect`
- `@effect/platform`
- `@effect/platform-node`
- `@effect/sql`
- `@effect/sql-sqlite-node`

Note: All Effect packages are direct dependencies (not peer), since Effect
is an implementation detail not exposed to consumers.

**Removed (Phase 3):**

- `better-sqlite3` + `@types/better-sqlite3` (replaced by
  `@effect/sql-sqlite-node`, which uses `better-sqlite3` internally)
- `async` (replaced by `Stream.mapEffect` with bounded concurrency)
- `zod` (replaced by `Schema` from `effect`, after `build-events.ts`
  migration)
