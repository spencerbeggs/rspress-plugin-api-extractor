# ConfigService Migration Design

## Overview

Expand `ConfigService` from a stub into the full config resolution + type
system setup service. It takes `PluginOptions` (already Schema-decoded) +
RSPress config subset, resolves all models/paths/categories/packages, sets
up the TypeScript environment and Shiki highlighter, and returns a
`ResolvedBuildContext`. The `beforeBuild` hook shrinks from ~400 lines of
imperative config plumbing to a single `configService.resolve(rspressConfig)`
call.

### Goals

- Move all config resolution logic from `plugin.ts:beforeBuild` into
  `ConfigServiceLive`
- Move type system setup (tsconfig, external packages, Twoslash, Shiki)
  into the same `resolve()` call
- Manage SnapshotManager lifecycle via `Effect.acquireRelease` (guaranteed
  WAL checkpoint + close)
- Produce a single `ResolvedBuildContext` consumed by the doc generation
  pipeline
- Reduce `plugin.ts:beforeBuild` to ~30 lines

### Non-Goals

- Rewriting `buildPipelineForApi` or per-item Stream stages
- Migrating `ApiModelLoader` to an Effect service (it stays as a class
  with static async methods, called via `Effect.promise`)
- Migrating the `config()` hook (sync, stays imperative)
- Changing the public plugin API

Note: `generateApiDocs` signature changes minimally — it receives
`ResolvedBuildContext` instead of 9 positional arguments. This is an
adapter change, not a pipeline rewrite.

### Constraints

- `ApiModelLoader`, `CategoryResolver`, `OpenGraphResolver` are existing
  classes with async/sync methods — called via `Effect.promise` or
  `Effect.sync` from within `ConfigServiceLive`
- `TwoslashManager` is a singleton with `getInstance().initialize()` — called
  as a side effect during resolution
- `createHighlighter` from `shiki` is an async factory — called via
  `Effect.promise`
- The `Scope` requirement from `acquireRelease` flows through the
  `ManagedRuntime` — cleanup happens at `runtime.dispose()` in `afterBuild`

## Decisions Record

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| ConfigService scope | Config resolution + type system setup | Single `resolve()` call produces everything `beforeBuild` needs |
| Output shape | Single `ResolvedBuildContext` struct | Consumers always need all fields together |
| `ResolvedApiConfig` | Plain interface (not Schema) | Contains `ApiPackage` (opaque external class) |
| SnapshotManager lifecycle | `acquireRelease` in `resolve()` | Guaranteed cleanup via `runtime.dispose()`, no manual `.close()` |
| Highlighter lifecycle | Created in `resolve()`, no cleanup needed | Shiki highlighters don't have explicit cleanup |
| Existing classes | Called via `Effect.promise`/`Effect.sync` | Pragmatic wrapping, not full rewrites |

## Types

### RspressConfigSubset

What ConfigService needs from RSPress's config (extracted in `beforeBuild`):

```typescript
export interface RspressConfigSubset {
  readonly multiVersion?: { default: string; versions: string[] };
  readonly locales?: ReadonlyArray<{ lang: string }>;
  readonly lang?: string;
  readonly root?: string;
}
```

### ResolvedApiConfig

Fully resolved config for a single API (after model loading, category
merging, path derivation). Plain interface — not a Schema because it
contains `ApiPackage`:

```typescript
export interface ResolvedApiConfig {
  readonly apiPackage: ApiPackage;
  readonly packageName: string;
  readonly apiName?: string;
  readonly outputDir: string;
  readonly baseRoute: string;
  readonly categories: Record<string, CategoryConfig>;
  readonly source?: SourceConfig;
  readonly packageJson?: PackageJson;
  readonly llmsPlugin?: LlmsPlugin;
  readonly siteUrl?: string;
  readonly ogImage?: OpenGraphImageConfig;
  readonly docsDir?: string;
  readonly docsRoot?: string;
  readonly theme?: ShikiThemeConfig;
}
```

### ResolvedBuildContext

Everything needed to run the doc generation pipeline:

```typescript
export interface ResolvedBuildContext {
  readonly apiConfigs: ReadonlyArray<ResolvedApiConfig>;
  readonly combinedVfs: ReadonlyMap<string, string>;
  readonly highlighter: Highlighter;
  readonly tsEnvCache: ReadonlyMap<string, VirtualTypeScriptEnvironment>;
  readonly resolvedCompilerOptions: TypeResolutionCompilerOptions;
  readonly ogResolver: OpenGraphResolver | null;
  readonly snapshotManager: SnapshotManager;
  readonly shikiCrossLinker: ShikiCrossLinker;
  readonly hideCutTransformer: ShikiTransformer;
  readonly hideCutLinesTransformer: ShikiTransformer;
  readonly twoslashTransformer: ShikiTransformer | undefined;
  readonly pageConcurrency: number;
  readonly logLevel: LogLevel;
  readonly suppressExampleErrors: boolean;
}
```

`shikiCrossLinker`, `hideCutTransformer`, `hideCutLinesTransformer`, and
`twoslashTransformer` are created at factory scope and passed into
`ResolvedBuildContext` by `ConfigServiceLive.resolve()`. This moves them
from factory-scope mutable variables to the immutable build context.

### ConfigServiceShape

```typescript
export interface ConfigServiceShape {
  readonly resolve: (
    rspressConfig: RspressConfigSubset,
  ) => Effect.Effect<
    ResolvedBuildContext,
    ConfigValidationError | ApiModelLoadError | TypeRegistryError,
    Scope
  >;
}
```

Single method. `Scope` requirement comes from `acquireRelease` for the
snapshot DB.

## ConfigServiceLive Implementation

### Constructor

`ConfigServiceLive` is a function that takes `PluginOptions` and returns
a `Layer<ConfigService>`:

```typescript
export function ConfigServiceLive(
  options: PluginOptions,
): Layer.Layer<ConfigService, never, TypeRegistryService | PathDerivationService>
```

It depends on `TypeRegistryService` (for external package loading) and
`PathDerivationService` (for output path derivation). These are provided
by the `EffectAppLayer` in `plugin.ts`.

### `resolve()` Internal Sequence

The method executes these steps as one composed Effect:

1. **Cross-field validation** — api vs apis mutual exclusion, multiVersion
   matching. Fails with `ConfigValidationError`.

2. **Derive RSPress context** — extract `docsRoot`, locales, lang,
   multiVersion from `RspressConfigSubset`.

3. **Category resolution** — merge `DEFAULT_CATEGORIES` + plugin defaults
   - per-API categories (+ per-version categories for versioned mode).
   Uses `CategoryResolver` synchronously.

4. **Model loading** — For each API config (single/multi/versioned):
   - Call `ApiModelLoader.loadApiModel` or `loadVersionModel` via
     `Effect.promise`
   - Fails with `ApiModelLoadError` on missing/invalid model files

5. **Path derivation** — Call `PathDerivationService.derivePaths` for each
   API to get `outputDir` and `routeBase`.

6. **Package.json loading** — Per API/version, with version > API fallback.
   Via `Effect.promise`.

7. **External package collection** — Explicit config or auto-detected from
   package.json. Collect into `allExternalPackages[]`.

8. **VFS generation** — `ApiExtractedPackage.fromPackage` + import
   prepending per API. Merge into `combinedVfs`.

9. **TypeScript config resolution** — Resolve tsconfig cascade via
   `resolveTypeScriptConfig`. First API's tsconfig wins in multi-API mode.

10. **External type loading** — `TypeRegistryService.loadPackages` +
    `createTypeScriptCache`. Fails with `TypeRegistryError` (recoverable —
    caught and logged, build continues without external types).

11. **Twoslash initialization** — `TwoslashManager.getInstance().initialize`
    with combined VFS + env cache.

12. **Shiki highlighter** — Collect themes from all API configs, call
    `createHighlighter` via `Effect.promise`.

13. **Snapshot DB** — `Effect.acquireRelease`:

    ```typescript
    yield* Effect.acquireRelease(
      Effect.sync(() => new SnapshotManager(dbPath)),
      (sm) => Effect.sync(() => sm.close()),
    );
    ```

14. **OG resolver** — Create `OpenGraphResolver` if `siteUrl` configured.

15. **Assemble and return** `ResolvedBuildContext`.

### Error Handling

| Error | Behavior |
| ----- | -------- |
| `ConfigValidationError` | Fatal — abort before any loading |
| `ApiModelLoadError` | Fatal — abort, model is required |
| `TypeRegistryError` | Recoverable — log warning, continue without external types. `tsEnvCache` created with empty external packages so built-in types still work. |

The `TypeRegistryError` recovery is handled inside `resolve()`:

```typescript
const typeResult = yield* loadExternalTypes.pipe(
  Effect.catchTag("TypeRegistryError", (err) =>
    Effect.gen(function* () {
      yield* Effect.logWarning(`Failed to load external types: ${err.message}`);
      // Create cache with just lib files
      const cache = yield* registry.createTypeScriptCache([], compilerOptions);
      return { vfs: new Map(), cache };
    }),
  ),
);
```

## Snapshot Lifetime Change

Moving `SnapshotManager.close()` from the end of `beforeBuild` to
`acquireRelease` with `runtime.dispose()` in `afterBuild` intentionally
extends the DB connection lifetime. The snapshot DB now stays open during
RSPress's markdown compilation phase (between `beforeBuild` and
`afterBuild`). This is safe — the DB is only queried during `beforeBuild`
and no writes happen during compilation. The benefit is guaranteed cleanup
even on build failure (the current manual `.close()` call is in a
`try/finally` that could miss edge cases).

## `generateApiDocs` Adapter

The current `generateApiDocs` takes 9 positional arguments. After the
migration, it receives `ResolvedBuildContext` instead:

```typescript
// BEFORE (9 positional args)
await generateApiDocs(
  config, shikiCrossLinker, snapshotManager, ogResolver,
  fileContextMap, highlighter, hideCutTransformer,
  hideCutLinesTransformer, twoslashTransformer,
);

// AFTER (context object)
await generateApiDocs(
  apiConfig, buildContext, fileContextMap,
);
```

The `generateApiDocs` signature changes to:

```typescript
async function generateApiDocs(
  config: ResolvedApiConfig & { suppressExampleErrors?: boolean },
  buildContext: ResolvedBuildContext,
  fileContextMap: Map<string, { api?: string; version?: string; file: string }>,
): Promise<CrossLinkData>
```

It destructures `buildContext` to get `shikiCrossLinker`, `snapshotManager`,
`ogResolver`, `highlighter`, `hideCutTransformer`, `hideCutLinesTransformer`,
`twoslashTransformer`. The function body is unchanged — only the entry point
unwrapping changes.

## Helper Functions Preserved

The following helper functions from `beforeBuild` are called inside
`ConfigServiceLive.resolve()` via `Effect.promise` or `Effect.sync`.
They are not listed in the 15-step sequence individually but are
preserved in the implementation:

- `normalizeBaseRoute` — route normalization per API
- `normalizeThemeConfig` — theme config normalization per API
- `mergeLlmsPluginConfig` — three-level cascade (global > API > version)
- `validateExternalPackages` — conflict detection with peerDependencies
- `isVersionConfig` — version value type guard
- `extractAutoDetectedPackages` — auto-detect from package.json
- Multi-API tsconfig warning (`console.warn` when multiple APIs specify
  different tsconfigs)
- `Effect.runSync(Metric.increment(...))` calls for tracking
  `apiVersionsLoaded`, `externalPackagesTotal`

## Verbose Timing Logs

The current `beforeBuild` has ~6 timing checkpoints (`⏱ Loading API
models`, `⏱ Initializing Twoslash`, etc.) gated by `isVerbose`. These
are replaced by `Effect.log` calls at `LogLevel.Debug` inside
`ConfigServiceLive.resolve()`. The Effect logger layer handles level
filtering. The timing information is preserved via `Effect.timed` or
manual `performance.now()` deltas within the Effect program.

## What Moves Out of `plugin.ts`

### Lines removed from `beforeBuild` (~370 lines)

- Lines 340-377: RSPress config extraction, `apiConfigs[]` array, `allExternalPackages[]`
- Lines 382-384: tsconfig tracking variables
- Lines 386-454: `processSimpleApi` helper function
- Lines 456-668: Single-API mode (versioned + non-versioned), Multi-API mode
- Lines 670-691: TypeScript config resolution
- Lines 697-738: External type loading + TypeScript cache creation
- Lines 740-752: Twoslash initialization
- Lines 754-798: Shiki highlighter initialization
- Lines 346-348: Snapshot manager creation
- Lines 350-356: OG resolver creation

### What stays in `beforeBuild` (~30 lines)

```typescript
async beforeBuild(_config, _isProd) {
  buildStartTime = performance.now();
  VfsRegistry.clear();
  fileContextMap.clear();

  const rspressConfig = extractRspressConfig(_config);
  const buildContext = await effectRuntime.runPromise(
    Effect.gen(function* () {
      const config = yield* ConfigService;
      return yield* config.resolve(rspressConfig);
    }),
  );

  // Doc generation pipeline
  await Effect.runPromise(
    Effect.forEach(
      buildContext.apiConfigs,
      (apiConfig) => generateDocsForApi(apiConfig, buildContext, fileContextMap),
      { concurrency: 2 },
    ),
  );

  console.log(`✅ API documentation complete (${...}s)`);
}
```

### What stays in `config()` hook

The sync `config()` hook is unchanged — it creates output directories and
injects remark plugins. It doesn't use ConfigService.

### VfsRegistry.register calls

Currently `generateApiDocs` calls `VfsRegistry.register` per API. This
stays in `generateApiDocs` (not moved to ConfigService) because it needs
the `highlighter` and transformers from `buildContext`, and is per-API
not per-build.

## Layer Composition

The `EffectAppLayer` in `plugin.ts` adds `ConfigService`. Because
`ConfigServiceLive` depends on `TypeRegistryService` and
`PathDerivationService`, it must be provided via `Layer.provideMerge`
(not `Layer.mergeAll` which only merges outputs):

```typescript
const BaseLayer = Layer.mergeAll(
  PathDerivationServiceLive,
  PluginLoggerLayer(effectLogLevel),
  TypeRegistryServiceLive,
);
const EffectAppLayer = Layer.provideMerge(
  BaseLayer,
  ConfigServiceLive(options),
);
```

This wires `TypeRegistryService` and `PathDerivationService` from
`BaseLayer` into `ConfigServiceLive`'s input requirements, and merges
all service outputs into the final `EffectAppLayer`.

## Testing

### Unit tests (`__test__/config-service.test.ts`)

Test `ConfigServiceLive.resolve()` with mock layers:

- **Valid single-API config** — resolves to `ResolvedBuildContext` with
  1 API config, loaded model, derived paths
- **Valid multi-API config** — resolves to context with multiple API configs
- **Versioned single-API** — resolves each version with correct paths
- **Cross-field validation failures** — api + apis → `ConfigValidationError`,
  missing model → `ConfigValidationError`
- **TypeRegistry failure recovery** — external type loading fails,
  `resolve()` continues with empty VFS and warning logged
- **SnapshotManager lifecycle** — acquired during resolve, released when
  scope closes

Uses `MockTypeRegistryServiceLayer` and `MockPathDerivationServiceLayer`
from `__test__/utils/layers.ts`. API model loading uses the
`example-module.api.json` fixture.

### Existing test preservation

All existing tests continue to pass — no behavior change in the generated
output.

## File Changes

### New/Modified

| Action | File |
| ------ | ---- |
| Rewrite | `plugin/src/services/ConfigService.ts` — new types + expanded interface |
| Rewrite | `plugin/src/layers/ConfigServiceLive.ts` — full `resolve()` implementation |
| Modify | `plugin/src/plugin.ts` — shrink `beforeBuild`, update layer composition |
| Create | `plugin/__test__/config-service.test.ts` — tests for resolve() |

### Not Changed

- `plugin/src/build-stages.ts` — unchanged
- `plugin/src/model-loader.ts` — called from ConfigServiceLive, not modified
- `plugin/src/category-resolver.ts` — called from ConfigServiceLive, not modified
- `plugin/src/schemas/` — unchanged
- All page generators, remark plugins, runtime components — unchanged
