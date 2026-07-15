---
status: current
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-07-14
last-synced: 2026-07-14
completeness: 90
related:
  - rspress-plugin-api-extractor/component-development.md
  - rspress-plugin-api-extractor/ssg-compatible-components.md
  - rspress-plugin-api-extractor/snapshot-tracking-system.md
  - rspress-plugin-api-extractor/page-generation-system.md
  - rspress-plugin-api-extractor/performance-observability.md
  - rspress-plugin-api-extractor/type-loading-vfs.md
dependencies: []
---

# Build Architecture

## Table of Contents

- [Overview](#overview)
- [Per-file Plugin and Bundleless Runtime](#per-file-plugin-and-bundleless-runtime)
- [Effect Service Layer](#effect-service-layer)
- [Shared Library Delegation](#shared-library-delegation)
- [Plugin Lifecycle](#plugin-lifecycle)
- [Configuration System](#configuration-system)
- [Build Tooling](#build-tooling)
- [Development Workflow](#development-workflow)

## Overview

The rspress-plugin-api-extractor separates Node.js plugin code from React runtime components, combined with an **Effect service layer** for doc generation orchestration. Both halves are emitted **per-file** (each `src/*.ts(x)` transpiled 1:1 to its own `.js`, mirroring the source tree); they differ by **environment and externals**, not by bundling strategy. The plugin half targets Node.js with its dependencies external; the runtime half targets the browser with `react`/`@theme` external, CSS modules and `import.meta.env` preserved so RSPress does the final per-site compile.

The plugin entry point (`plugin.ts`) is a thin RSPress adapter that wires
Effect services and delegates all doc generation to `build-program.ts` and
`build-stages.ts`.

## Per-file Plugin and Bundleless Runtime

### Plugin code (Node.js)

**Entry:** `src/index.ts` (a barrel re-exporting `plugin.ts`, the `serve.ts` API and the public config schemas). **Output:** `dist/dev/pkg/` (the published package root — see [Build Tooling](#build-tooling)). **Environment:** Node.js (RSPress build process).

The plugin half is emitted **per-file**: every `src/*.ts` becomes its own `.js` under `dist/dev/pkg/`, mirroring the source tree (e.g. `plugin.js`, `build-program.js`, `layers/ConfigServiceLive.js`), with sibling imports preserved as relative `./...js` specifiers and `dependencies` left external. It owns the RSPress lifecycle hooks (config, beforeBuild, afterBuild), Effect service layer initialization and runtime management, the doc generation pipeline and the remark plugins for code block processing. A bundled `index.d.ts` is emitted alongside, inlining the declarations of any `dtsBundledPackages` (here `@rspress/core`).

### Runtime components (bundleless, React/browser)

**Published export:** `./runtime` → `{ "types": "./runtime/index.d.ts", "import": "./runtime/index.js" }`. **Environment:** Browser (RSPress SSG and client-side).

The runtime is **not** compiled into a single `runtime/index.js` bundle, nor shipped as raw `.tsx`. `definePlugin` (from `@savvy-web/rspress-builder`) emits it **bundleless**: each component is transpiled 1:1 into its own `.js` under `runtime/`, mirroring the `src/runtime/...` tree, with `react`/`@theme` external and `import.meta.env` left as a runtime expression. **RSPress then compiles each referenced `.js` per site build.** This is required for `import.meta.env.SSG_MD` to resolve correctly (a single bundle froze it to `undefined`, breaking the SSG-MD dual-mode branch) and so the `globalUIComponents` / `resolve.alias` registrations in `plugin.ts` can point at real per-component `.js` files. A bundled `runtime/index.d.ts` (types only) is also emitted so the export's `types` condition resolves. See `ssg-compatible-components.md` for the bundleless mechanism and why component-path resolution is layout-invariant.

The runtime provides the React components that render API documentation: signature/example blocks, parameter and enum tables, the interactive wrap/copy buttons and the Twoslash hover tooltips and error display.

### Build tooling

**Builder:** `@savvy-web/rspress-builder`'s `definePlugin()`, which is built on the tsdown-based `@savvy-web/bundler`. The plugin builds via a self-executing `package/savvy.build.ts` that calls `definePlugin(...)` and hands the config to `runBuild`. `definePlugin` produces the two-entry shape automatically — the Node plugin entry (`.`) and the bundleless React runtime (`./runtime`); the plugin half is not a single bundle but per-file JS. **Module system:** ESM with `"module": "esnext"` and `"moduleResolution": "bundler"`. **CSS processing:** CSS modules (no Sass) for runtime components, compiled by RSPress alongside the transpiled JS.

## Effect Service Layer

### Service Architecture

The plugin uses Effect's Context/Layer/Tag pattern for dependency injection:

```text
plugin.ts (RSPress adapter)
  |
  +-> EffectAppLayer (composed Layer stack)
  |     |
  |     +-> ConfigServiceLive
  |     |     Resolves plugin options + RSPress config
  |     |     into ResolvedBuildContext
  |     |
  |     +-> SnapshotServiceLive
  |     |     SQLite via @effect/sql-sqlite-node
  |     |     Managed migrations, WAL lifecycle
  |     |
  |     +-> TypeRegistryServiceLive
  |     |     External package type loading
  |     |
  |     +-> PathDerivationServiceLive
  |     |     Route and output path computation
  |     |
  |     +-> EventBus layer (from buildEventBus)
  |     |     Synchronous fan-out: console, metrics, optional trace sinks
  |     |
  |     +-> makeSummaryLoggerLayer
  |     |     Slim Effect Logger gating residual Effect.log* calls
  |     |
  |     +-> NodeFileSystem.layer
  |           @effect/platform cross-platform file I/O
  |
  +-> ManagedRuntime.make(EffectAppLayer)
        Single runtime instance, shared across hooks
```

### Service Interfaces

| Service | Location | Purpose |
| --- | --- | --- |
| `ConfigService` | `services/ConfigService.ts` | Resolve options into build context |
| `SnapshotService` | `services/SnapshotService.ts` | Incremental build tracking |
| `TypeRegistryService` | `services/TypeRegistryService.ts` | External type loading |
| `PathDerivationService` | `services/PathDerivationService.ts` | Path computation |

### Layer Implementations

| Layer | Location | Key Dependencies |
| --- | --- | --- |
| `ConfigServiceLive` | `layers/ConfigServiceLive.ts` | PathDerivation, TypeRegistry |
| `SnapshotServiceLive` | `layers/SnapshotServiceLive.ts` | `@effect/sql-sqlite-node` |
| `TypeRegistryServiceLive` | `layers/TypeRegistryServiceLive.ts` | `type-registry-effect` |
| `PathDerivationServiceLive` | `layers/PathDerivationServiceLive.ts` | (none) |
| `buildEventBus` (EventBus layer) | `layers/ObservabilityLive.ts` | Synchronous fan-out event bus |
| `makeSummaryLoggerLayer` | `layers/ObservabilityLive.ts` | Effect Logger gate for `Effect.log*` calls |

### Effect peer dependency closure

`package/package.json` declares `@effect/cluster`, `@effect/experimental`, `@effect/rpc` and `@effect/workflow` as direct dependencies even though the plugin never imports them. They exist solely to close the non-optional peer graph of `@effect/platform-node`, `@effect/sql` and `@effect/sql-sqlite-node`: because the per-file plugin build leaves `dependencies` external, unclosed peers escape to the consuming workspace, where pnpm `autoInstallPeers` can bind them to an incompatible `effect` version (issue #69). Do not remove these packages as "unused" — a dependency prune that drops them reintroduces the bug.

### Schema Validation

Plugin options are defined as Effect Schemas in `schemas/`:

- `schemas/config.ts` -- `PluginOptions`, `SingleApiConfig`,
  `MultiApiConfig`, `CategoryConfig`, `ExternalPackageSpec`, etc.
- `schemas/opengraph.ts` -- `OpenGraphImageConfig`
- `schemas/performance.ts` -- `PerformanceConfig`

Options are decoded at plugin factory time. The exported
`ApiExtractorPlugin` is the factory function with config helpers attached as
a namespace:

```typescript
function ApiExtractorPluginImpl(rawOptions: PluginOptions): RspressPlugin {
  const options = Schema.decodeUnknownSync(PluginOptions)(rawOptions);
  // ...
}

export const ApiExtractorPlugin = Object.assign(ApiExtractorPluginImpl, {
  api: { fromDir },
  apis: { fromDir: fromParentDir },
});
```

### Config Helpers

`ApiExtractorPlugin.api.fromDir` and `ApiExtractorPlugin.apis.fromDir` (`src/config-helpers.ts`, internally `fromDir` and `fromParentDir`) build `MultiApiConfig` objects by discovering the package name, version, `.api.json` model and `tsconfig.json` from a built module package folder (the per-package model dirs the modules emit via `@savvy-web/bundler`'s `meta.localPaths`). They are exposed under two namespaces matching the plugin option they feed:

- `api.fromDir(dir, overrides?)` -- one config from a single package folder, for use under the `api:` option or as an element of `apis:`. Caller overrides win over discovery.
- `apis.fromDir(parentDir, options?)` -- scans a parent directory and builds one config per subfolder for the `apis:` option, requiring every non-dotfile subdirectory to be a valid model folder.

The helpers no longer inject a default `baseRoute`. When the caller omits it the route is left unset and the plugin applies a context-aware default during resolution in `ConfigServiceLive`: under `api:` it mounts at `/api` (`baseRoute ?? "/"`), under `apis:` at `/{packageName}/api` (`baseRoute ?? "/${unscopedName(packageName)}"`), in both cases appending `apiFolder ?? "api"`. This fixes a bug where a single-API site using the helper generated docs at `/{dirname}/api` instead of `/api`. Callers can still pass an explicit `baseRoute` -- a `{dirname}` / `{packageName}` template string or an `(info: DirInfo) => string` callback -- to override.

The helper types (`DirInfo`, `BaseRoute`, `FromDirOptions`) are re-exported from `src/index.ts`; both helpers share `FromDirOptions`.

## Shared Library Delegation

The plugin depends on the published **`api-extractor-llms`** package and delegates its pure, reusable logic to it, keeping plugin-specific shells as thin adapters. The delegation happens at four boundaries; the page generators are unaffected because they still consume `ApiParser.*` and `markdownCrossLinker` by the same names.

| Plugin shell | Delegates to | Stays plugin-local |
| --- | --- | --- |
| `ApiModelLoader.loadFromPath` (`model-loader.ts`) | `loadApiModel(path)` | existence check + not-found error contract |
| `TypeSignatureFormatter` (`formatter.ts`) | extends the library `TypeSignatureFormatter` (`format`/`stripExportDeclare`/`needsSpaceBefore` inherited) | positional constructor, test-only `addLinks`/`escapeRegExp` |
| `ApiParser` TSDoc statics (`loader.ts`) | `lib*`-aliased helpers (`getSummary`, `getReleaseTag`, `getParams`, `getReturns`, `getExamples`, `getDeprecation`, `hasModifierTag`, prose `extractPlainText`) | non-TSDoc statics with no library equivalent: `categorizeApiItems`, `extractNamespaceMembers`, `getInheritance`, `getSeeReferences`, `getSourceLink` |
| `MarkdownCrossLinker.addCrossLinks` (`markdown/cross-linker.ts`) | the library's immutable `CrossLinker` (see `cross-linking-architecture.md`) | class shape (`setRoutes`/`addRoutes`/`clear`/`sanitizeId`) and test-only `addCrossLinksHtml` (library has no HTML variant) |

**Not delegated — looks similar, is not.** `ApiExtractedPackage` (`api-extracted-package.ts`) keeps its OWN private `extractPlainText`. Despite the shared name with the library helper, it is a different algorithm for declaration reconstruction: it PRESERVES `{@link X.Y}` TSDoc syntax and reconstructs fenced code blocks for `.d.ts`/JSDoc output, whereas the library's `extractPlainText` flattens `{@link}` to display text and drops code fences. The two are not interchangeable. `CrossLinkerService` (`Context.Tag`, no Live layer) is also unchanged.

### Stage 2 output convergence (deferred)

A "Stage 2" that would emit the MDX pages on top of the library's `renderItem` body was evaluated and **deferred**. The page generators emit MDX with JSX components (`<ApiSignature>`, `<ParametersTable>`, `<ApiMember>`, `<ApiExample>`) carrying dual `code`/`source` props for Shiki + Twoslash, so the library's plain-markdown body is not a clean substring of the generated output. Converging would require the library to expose a structured `bodyParts(item)` API. The full diff and decision are recorded at `docs/superpowers/notes/2026-06-01-renderitem-vs-pagegen-diff.md`.

## Plugin Lifecycle

### Hook Execution Order

```text
1. ApiExtractorPlugin(rawOptions)  -- factory
   - Decode options via Effect Schema
   - Create ShikiCrossLinker instance
   - Build Layer stack and ManagedRuntime

2. config(rspressConfig)  -- BEFORE route scanning
   - Pre-create output directories
   - Run Effect program:
     - ConfigService.resolve() loads models, creates highlighter,
       resolves types
     - generateApiDocs() for each API config (concurrent)
   - Register remark plugins (remarkWithApi, remarkApiCodeblocks)

3. beforeBuild()  -- intentionally empty
   (doc generation happens in config() to fix cold-start issues)

4. afterBuild(config, isProd)
   - Log build summary (first build only, skip HMR)
   - Dispose runtime in production (preserves it for dev HMR)
```

### Doc Generation Pipeline

The `config()` hook runs the full doc generation as an Effect program:

```typescript
await effectRuntime.runPromise(
  Effect.gen(function* () {
    const configSvc = yield* ConfigService;
    const buildContext = yield* configSvc.resolve(rspressConfigSubset);

    yield* Effect.forEach(
      buildContext.apiConfigs,
      (apiConfig) => generateApiDocs(apiConfig, buildContext, fileContextMap),
      { concurrency: 2 },
    );
  }).pipe(Effect.scoped),
);
```

### Build Program (build-program.ts)

`generateApiDocs` orchestrates the 5 build stages for a single API:

1. **prepareWorkItems** -- Categorize items, build cross-link data
2. **buildPipelineForApi** (Stream) -- Generate pages and write files
3. **writeMetadata** -- Root _meta.json, index page, category_meta.json
4. **cleanupAndCommit** -- Batch upsert snapshots, delete stale/orphans

See `page-generation-system.md` for the Stream pipeline details.

### Runtime Management

The `ManagedRuntime` is created once at plugin initialization and shared
across all hooks:

- **Production builds:** Runtime disposed in `afterBuild`, triggering
  scope finalizers (SQLite WAL checkpoint, resource cleanup)
- **Dev mode:** Runtime stays alive for HMR rebuilds. Disposing would
  destroy the DB connection and break subsequent builds.

## Configuration System

### ConfigService.resolve()

The `ConfigServiceLive` (`layers/ConfigServiceLive.ts`) resolves raw plugin
options + RSPress config into a `ResolvedBuildContext`:

**Inputs:**

- `PluginOptions` (decoded at factory time)
- `RspressConfigSubset` (extracted from RSPress UserConfig at config time)

**Outputs (`ResolvedBuildContext`):**

- `apiConfigs[]` -- Fully resolved config per API (model, paths, categories)
- `combinedVfs` -- Merged type definitions for all external packages
- `highlighter` -- Shared Shiki highlighter instance
- `tsEnvCache` -- TypeScript environment cache per package
- `ogResolver` -- Open Graph image resolver
- `shikiCrossLinker` -- Cross-linker for type references
- `hideCutTransformer` / `hideCutLinesTransformer` -- Shiki transformers
- `twoslashTransformer` -- Twoslash transformer (or undefined if disabled)
- `pageConcurrency` -- Parallel page generation limit

### Schema Types

Key config types defined via Effect Schema:

- `PluginOptions` -- Top-level plugin config
- `SingleApiConfig` -- Config for single-API mode (`api:`)
- `MultiApiConfig` -- Config for multi-API mode (`apis:[]`)
- `CategoryConfig` -- API category definition (display name, folder, kinds)
- `ExternalPackageSpec` -- External package for type loading
- `VersionConfig` -- Multi-version configuration

## Build Tooling

### `savvy.build.ts` and `definePlugin`

`package/savvy.build.ts` is a self-executing build script: it calls `definePlugin(...)` from `@savvy-web/rspress-builder`, exports the resulting config and, under `import.meta.main`, hands it to `runBuild`. `definePlugin` is deliberately small (RSPress plugins have a fixed shape) — the plugin passes `runtime: true`, `dtsBundledPackages: ["@rspress/core"]`, `apiModel.tsdoc.suppressWarnings` (the `ae-forgotten-export` rules) and a `transform`:

```typescript
// package/savvy.build.ts (abridged)
const config = definePlugin({
  runtime: true,
  dtsBundledPackages: ["@rspress/core"],
  apiModel: { tsdoc: { suppressWarnings: [ /* ae-forgotten-export rules */ ] } },
  transform({ pkg, targetGroup }) {
    // GitHub Packages target: rename to @spencerbeggs/rspress-plugin-api-extractor
    // strip dev-only fields (devDependencies, scripts, publishConfig, …)
  },
});
export default config;
if (import.meta.main) await runBuild(config, { cwd: import.meta.dirname, argv: process.argv.slice(2) });
```

`definePlugin` produces the fixed two-entry shape — the Node plugin entry (`.`) and the **bundleless** React runtime (`./runtime`, `react`/`@theme` external). It applies the `import.meta.env` identity `define` (replacements are merged *after* it, so a user key can override intentionally) that keeps `import.meta.env.SSG_MD` a runtime expression for RSPress to resolve per site. The published `exports` (`./`, `./runtime`, `./tsconfig/rspress.json`) and `private: false` are produced by the builder's manifest handling plus the plugin's `transform`. See `ssg-compatible-components.md` for the bundleless mechanism and the `definePlugin` surface in `@savvy-web/rspress-builder` for the full option set.

### Build output layout and the local link

The plugin emits the same per-file flat package shape into several roots. The dev build writes `dist/dev/pkg`, and the plugin's `publishConfig` (`directory: "dist/dev/pkg"`, `linkDirectory: true`) makes **that directory the workspace link target** — sites depending on `rspress-plugin-api-extractor` via `workspace:*` import the built per-file JS from `dist/dev/pkg`, not the `src/` sources. The production build emits one **published** root per registry under `dist/prod/<target>/pkg` (`npm`, `github`), selected by `transform`'s `targetGroup` and recorded in `dist/prod/targets.json`. The source `package/package.json` keeps `private: true` with `src/`-pointing `exports`; the build rewrites these to the compiled form (`private: false`, `index.js` / `runtime/index.js`, plus the `tsconfig/rspress.json` export). Every one of these `pkg` roots carries the identical per-file flat layout (the runtime sits next to `index.js`), which is what makes the runtime component paths layout-invariant — see [Per-file Plugin and Bundleless Runtime](#per-file-plugin-and-bundleless-runtime) and `ssg-compatible-components.md`.

### TypeScript Configuration

The plugin uses a standalone `tsconfig.json` with
`"module": "esnext"` and `"moduleResolution": "bundler"` because:

- Root config uses `"module": "node20"` (incompatible with API Extractor)
- API Extractor requires `"moduleResolution": "bundler"`

The package also publishes a standalone **RSPress tsconfig** at `rspress-plugin-api-extractor/tsconfig/rspress.json` (source `package/public/tsconfig/rspress.json`), which the documentation sites extend from. It is a standard RSPress/React-JSX bundler-resolution config (`jsx: react-jsx`, `module: esnext`, `verbatimModuleSyntax`) and is exported as a third entry point alongside `.` and `./runtime`.

### Component Registration

Components are imported directly in generated MDX files (NOT via
RSPress `globalComponents`):

```typescript
import { SignatureBlock, ParametersTable }
  from "rspress-plugin-api-extractor/runtime";
```

## Development Workflow

### Local Development

```bash
pnpm run build          # Build plugin + modules
pnpm dev                # Start basic site dev server
```

### Watch Mode

```bash
cd package && pnpm dev   # Rebuilds on file changes
```

### Dev and preview servers (`serve`)

The plugin exports a `serve(options?: ServeOptions): Promise<void>` runner (`src/serve.ts`) from the main entry, used by every site's `lib/scripts/dev.mts` / `preview.mts` (they just call `serve({ mode, openPath })`). It frees the target port (best-effort `lsof`), spawns `pnpm rspress dev|preview --port <port>`, streams output and opens a browser once the server is ready. Readiness is detected from RSPress's `Local:` address line (cross-mode), with a dev `built in` fallback (`isServerReady(mode, output)`). `open` is a lazy dynamic import and a plugin dependency.

`ServeOptions`, `ServeMode`, `ResolvedServeConfig` and the pure helpers `isServerReady` and `resolveServeConfig` are exported from `rspress-plugin-api-extractor`. The two pure helpers carry the testable logic (readiness predicate, default/config resolution); the spawning side effects are not unit-tested. See `src/serve.ts` for the option defaults (`port`, `open`, `openPath`, `packageManager`, `cwd`, `readyWhen`).

### Key Source Files

| File | Purpose |
| --- | --- |
| `savvy.build.ts` | Build script: `definePlugin` config + `runBuild` |
| `index.ts` | Public barrel: plugin, `serve` API, config schemas/types |
| `plugin.ts` | RSPress adapter, runtime management |
| `serve.ts` | `serve` dev/preview runner + pure config/readiness helpers |
| `build-program.ts` | Doc generation orchestration |
| `build-stages.ts` | Stream pipeline, page gen, file writes |
| `config-helpers.ts` | `fromDir` / `fromParentDir` config builders |
| `layers/ConfigServiceLive.ts` | Config resolution, model loading |
| `layers/SnapshotServiceLive.ts` | SQLite snapshot implementation |
| `layers/ObservabilityLive.ts` | Metrics, logger, build summary |
| `schemas/config.ts` | Effect Schema definitions |

## Related Documentation

- **Component Development:**
  `component-development.md`
- **SSG-Compatible Components:**
  `ssg-compatible-components.md`
- **Page Generation System:**
  `page-generation-system.md`
- **Snapshot Tracking:**
  `snapshot-tracking-system.md`
- **LLMs Integration:**
  `llms-integration.md`
- **Type Loading & VFS:**
  `type-loading-vfs.md`
