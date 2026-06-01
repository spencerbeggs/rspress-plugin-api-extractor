---
status: current
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-06-01
last-synced: 2026-06-01
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
- [Compiled Plugin and Bundleless Runtime](#compiled-plugin-and-bundleless-runtime)
- [Effect Service Layer](#effect-service-layer)
- [Shared Library Delegation](#shared-library-delegation)
- [Plugin Lifecycle](#plugin-lifecycle)
- [Configuration System](#configuration-system)
- [Build Tooling](#build-tooling)
- [Development Workflow](#development-workflow)

## Overview

The rspress-plugin-api-extractor separates Node.js plugin code from React runtime components, combined with an **Effect service layer** for doc generation orchestration. The two halves ship differently: the plugin code is **compiled** to a single Node.js bundle, while the runtime components are emitted **bundleless** (per-file transpile) so RSPress does the final per-site compile.

The plugin entry point (`plugin.ts`) is a thin RSPress adapter that wires
Effect services and delegates all doc generation to `build-program.ts` and
`build-stages.ts`.

## Compiled Plugin and Bundleless Runtime

### Plugin code (compiled, Node.js)

**Entry:** `src/index.ts` (re-exports `src/plugin.ts`). **Output:** `dist/<mode>/index.js`. **Environment:** Node.js (RSPress build process).

The plugin half is bundled to a single Node.js file. It owns the RSPress lifecycle hooks (config, beforeBuild, afterBuild), Effect service layer initialization and runtime management, the doc generation pipeline and the remark plugins for code block processing.

### Runtime components (bundleless, React/browser)

**Published export:** `./runtime` → `{ "types": "./runtime/index.d.ts", "import": "./runtime/index.js" }`. **Environment:** Browser (RSPress SSG and client-side).

The runtime is **not** compiled into a single `runtime/index.js` bundle, nor shipped as raw `.tsx`. `RSPressPluginBuilder` emits it **bundleless**: each component is transpiled 1:1 into its own `.js` under `dist/<mode>/runtime/`, mirroring the `src/runtime/...` tree, with `react`/`@theme` external and `import.meta.env` left as a runtime expression. **RSPress then compiles each referenced `.js` per site build.** This is required for `import.meta.env.SSG_MD` to resolve correctly (a single bundle froze it to `undefined`, breaking the SSG-MD dual-mode branch) and so the `globalUIComponents` / `resolve.alias` registrations in `plugin.ts` can point at real per-component `.js` files. A bundled `runtime/index.d.ts` (types only) is also emitted so the export's `types` condition resolves. See `ssg-compatible-components.md` for the bundleless mechanism and why component-path resolution is layout-invariant.

The runtime provides the React components that render API documentation: signature/example blocks, parameter and enum tables, the interactive wrap/copy buttons and the Twoslash hover tooltips and error display.

### Build tooling

**Bundler:** Rslib (Rsbuild-based library bundler), configured via `RSPressPluginBuilder.create()` from `@savvy-web/rslib-builder`. The builder auto-detects `src/runtime/index.tsx` and emits the runtime lib bundleless; the plugin's own `rslib.config.ts` does nothing runtime-specific. **Module system:** ESM with `"module": "esnext"` and `"moduleResolution": "bundler"`. **CSS processing:** CSS modules (no Sass) for runtime components, compiled by RSPress alongside the transpiled JS.

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
  |     +-> PluginLoggerLayer
  |     |     Custom Effect Logger + log level
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
| `PluginLoggerLayer` | `layers/ObservabilityLive.ts` | Effect Logger |

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
  api: { fromFolder, fromModelsDir },
});
```

### Config Helpers

`ApiExtractorPlugin.api.fromFolder` and `ApiExtractorPlugin.api.fromModelsDir`
(`src/config-helpers.ts`) build `MultiApiConfig` objects by discovering the
package name, version, `.api.json` model and `tsconfig.json` from a
`@savvy-web/rslib-builder` `localPaths` package folder:

- `fromFolder(dir, overrides?)` -- one config from a single package folder;
  caller overrides win over discovery. `baseRoute` accepts a `{dirname}` /
  `{packageName}` template string or an `(info) => string` callback.
- `fromModelsDir(parentDir, options?)` -- scans a parent directory and builds
  one config per subfolder, requiring every non-dotfile subdirectory to be a
  valid model folder.

The helper return types (`FolderInfo`, `BaseRoute`, `FromFolderOptions`,
`FromModelsDirOptions`) are re-exported from `src/index.ts`.

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

### Rslib Configuration

`rslib.config.ts` delegates to `RSPressPluginBuilder.create()` from `@savvy-web/rslib-builder` and is **minimal** — it passes only `dtsBundledPackages`, `apiModel.suppressWarnings` and a package-name `transform`. There is no `runtime: false`, no `copyPatterns` and no `exports`/`files` mutation; the runtime handling lives entirely in the builder:

```typescript
// rslib.config.ts
export default RSPressPluginBuilder.create({
  dtsBundledPackages: ["@rspress/core"],
  apiModel: { suppressWarnings: [ /* ae-forgotten-export rules */ ] },
  transform({ pkg, target }) {
    // rewrite package.json per registry (scoped name for GitHub Packages),
    // strip dev-only fields
  },
});
```

`RSPressPluginBuilder` auto-detects `src/runtime/index.tsx` and produces two RSlib libs: the Node.js plugin bundle and the **bundleless** runtime lib (`bundle: false`, `outBase: "./src/runtime"`, `react`/`@theme` external, identity `define` preserving `import.meta.env`). The builder rewrites the published `exports["./runtime"]` to `{ "types": "./runtime/index.d.ts", "import": "./runtime/index.js" }` and sets `files` to `["runtime"]`. The plugin's `transform` only adjusts the package name and strips dev fields. See `ssg-compatible-components.md` for the bundleless mechanism and `createRuntimeLib` in `@savvy-web/rslib-builder`'s `rspress-plugin-builder.ts` for the lib config.

### TypeScript Configuration

The plugin uses a standalone `tsconfig.json` with
`"module": "esnext"` and `"moduleResolution": "bundler"` because:

- Root config uses `"module": "node20"` (incompatible with API Extractor)
- API Extractor requires `"moduleResolution": "bundler"`

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
cd plugin && pnpm dev   # Rebuilds on file changes
```

### Key Source Files

| File | Purpose |
| --- | --- |
| `plugin.ts` | RSPress adapter, runtime management |
| `build-program.ts` | Doc generation orchestration |
| `build-stages.ts` | Stream pipeline, page gen, file writes |
| `config-helpers.ts` | `fromFolder` / `fromModelsDir` config builders |
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
