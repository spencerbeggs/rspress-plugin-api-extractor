---
status: current
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-03-17
last-synced: 2026-03-17
completeness: 90
related:
  - rspress-plugin-api-extractor/component-development.md
  - rspress-plugin-api-extractor/ssg-compatible-components.md
  - rspress-plugin-api-extractor/snapshot-tracking-system.md
  - rspress-plugin-api-extractor/page-generation-system.md
  - rspress-plugin-api-extractor/performance-observability.md
dependencies: []
---

# Build Architecture

## Table of Contents

- [Overview](#overview)
- [Dual-Bundle Architecture](#dual-bundle-architecture)
- [Effect Service Layer](#effect-service-layer)
- [Plugin Lifecycle](#plugin-lifecycle)
- [Configuration System](#configuration-system)
- [Build Tooling](#build-tooling)
- [Development Workflow](#development-workflow)

## Overview

The rspress-plugin-api-extractor uses a **dual-build architecture** that
separates Node.js plugin code from React runtime components, combined
with an **Effect service layer** for doc generation orchestration.

The plugin entry point (`plugin.ts`) is a thin RSPress adapter (252 lines)
that wires Effect services and delegates all doc generation to
`build-program.ts` and `build-stages.ts`.

## Dual-Bundle Architecture

### 1. Plugin Bundle (Node.js)

**Entry:** `src/index.ts` (re-exports `src/plugin.ts`)
**Output:** `dist/index.js`
**Environment:** Node.js (RSPress build process)

**Purpose:**

- RSPress plugin lifecycle hooks (config, beforeBuild, afterBuild)
- Effect service layer initialization and runtime management
- API documentation generation via build pipeline
- Remark plugins for code block processing

### 2. Runtime Bundle (React/Browser)

**Entry:** `src/runtime/index.tsx`
**Output:** `dist/runtime/index.js` + `dist/runtime/index.css`
**Environment:** Browser (RSPress SSG and client-side)

**Purpose:**

- React components for rendering API documentation
- Interactive features (wrap buttons, copy buttons, tooltips)
- Twoslash hover tooltips and error display

### Build Tooling

**Bundler:** Rslib (Rsbuild-based library bundler)
**Module System:** ESM with `"module": "esnext"` and
`"moduleResolution": "bundler"`
**CSS Processing:** Sass plugin with automatic import injection

## Effect Service Layer

### Service Architecture

The plugin uses Effect's Context/Layer/Tag pattern for dependency injection:

```text
plugin.ts (RSPress adapter, 252 lines)
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

Options are decoded at plugin factory time:

```typescript
export function ApiExtractorPlugin(rawOptions: PluginOptions) {
  const options = Schema.decodeUnknownSync(PluginOptions)(rawOptions);
  // ...
}
```

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

The `ConfigServiceLive` (`layers/ConfigServiceLive.ts`, ~600 lines)
resolves raw plugin options + RSPress config into a `ResolvedBuildContext`:

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

```typescript
// rslib.config.ts (simplified)
export default defineConfig({
  lib: [
    // Runtime bundle (React + CSS)
    {
      format: "esm",
      syntax: "es2021",
      source: { entry: { index: "./src/runtime/index.tsx" } },
      output: { distPath: { root: "./dist/runtime" } },
    },
    // Plugin bundle (Node.js)
    {
      format: "esm",
      syntax: "es2021",
      source: { entry: { index: "./src/index.ts" } },
      output: { distPath: { root: "./dist" } },
    },
  ],
  plugins: [pluginReact(), pluginSass()],
});
```

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

| File | Lines | Purpose |
| --- | --- | --- |
| `plugin.ts` | ~252 | RSPress adapter, runtime management |
| `build-program.ts` | ~167 | Doc generation orchestration |
| `build-stages.ts` | ~1120 | Stream pipeline, page gen, file writes |
| `layers/ConfigServiceLive.ts` | ~600 | Config resolution, model loading |
| `layers/SnapshotServiceLive.ts` | ~148 | SQLite snapshot implementation |
| `layers/ObservabilityLive.ts` | ~147 | Metrics, logger, build summary |
| `schemas/config.ts` | ~250 | Effect Schema definitions |

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
