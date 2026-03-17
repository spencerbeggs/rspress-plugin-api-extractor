# ConfigService Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development
> (if subagents available) or superpowers:executing-plans to implement this plan.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand ConfigService from a stub into a full config resolution + type
system setup service, reducing `plugin.ts:beforeBuild` from ~400 lines to ~30
lines.

**Architecture:** `ConfigServiceLive.resolve()` takes `PluginOptions` + RSPress
config, produces `ResolvedBuildContext` containing loaded models, merged
categories, combined VFS, Shiki highlighter, TypeScript env cache, and scoped
SnapshotManager. The `generateApiDocs` signature changes from 9 positional
arguments to `(apiConfig, buildContext, fileContextMap)`.

**Tech Stack:** Effect (Layer, Effect, Scope, acquireRelease), Vitest, Biome

**Spec:** `docs/superpowers/specs/2026-03-17-config-service-design.md`

---

## File Structure

### Modified files

| File | Change |
| ---- | ------ |
| `plugin/src/services/ConfigService.ts` | Expand with `RspressConfigSubset`, `ResolvedApiConfig`, `ResolvedBuildContext`, new `ConfigServiceShape` |
| `plugin/src/layers/ConfigServiceLive.ts` | Full `resolve()` implementation (~350 lines, moved from plugin.ts:beforeBuild) |
| `plugin/src/plugin.ts` | Shrink beforeBuild to ~30 lines, update layer composition to `Layer.provideMerge`, change `generateApiDocs` signature |

### New files

| File | Responsibility |
| ---- | -------------- |
| `plugin/__test__/config-service.test.ts` | Tests for `ConfigServiceLive.resolve()` |

---

## Chunk 1: Expand ConfigService Interface

### Task 1: Add types and expand ConfigServiceShape

**Files:**

- Modify: `plugin/src/services/ConfigService.ts`
- Test: `plugin/__test__/config-service.test.ts`

- [ ] **Step 1: Write the test**

Create `plugin/__test__/config-service.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type {
  ResolvedApiConfig,
  ResolvedBuildContext,
  RspressConfigSubset,
} from "../src/services/ConfigService.js";

describe("ConfigService types", () => {
  it("RspressConfigSubset has correct shape", () => {
    const config: RspressConfigSubset = {};
    void config.multiVersion;
    void config.locales;
    void config.lang;
    void config.root;
    expect(true).toBe(true);
  });

  it("ResolvedApiConfig has required fields", () => {
    const config = {} as ResolvedApiConfig;
    void config.apiPackage;
    void config.packageName;
    void config.outputDir;
    void config.baseRoute;
    void config.categories;
    expect(true).toBe(true);
  });

  it("ResolvedBuildContext has required fields", () => {
    const ctx = {} as ResolvedBuildContext;
    void ctx.apiConfigs;
    void ctx.combinedVfs;
    void ctx.highlighter;
    void ctx.snapshotManager;
    void ctx.shikiCrossLinker;
    void ctx.pageConcurrency;
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/config-service.test.ts`

Expected: FAIL — types not exported.

- [ ] **Step 3: Expand ConfigService.ts**

Rewrite `plugin/src/services/ConfigService.ts`:

```typescript
import type { ApiPackage } from "@microsoft/api-extractor-model";
import type { Effect, Scope } from "effect";
import { Context } from "effect";
import type { Highlighter, ShikiTransformer } from "shiki";
import type { VirtualTypeScriptEnvironment } from "type-registry-effect/node";
import type { ApiModelLoadError, ConfigValidationError, TypeRegistryError } from "../errors.js";
import type { PackageJson, TypeResolutionCompilerOptions } from "../internal-types.js";
import type { ShikiCrossLinker } from "../shiki-transformer.js";
import type { SnapshotManager } from "../snapshot-manager.js";
import type { OpenGraphResolver } from "../og-resolver.js";
import type {
  CategoryConfig,
  LlmsPlugin,
  LogLevel,
  OpenGraphImageConfig,
  SourceConfig,
} from "../schemas/index.js";
import type { ShikiThemeConfig } from "../markdown/shiki-utils.js";

export interface RspressConfigSubset {
  readonly multiVersion?: { default: string; versions: string[] };
  readonly locales?: ReadonlyArray<{ lang: string }>;
  readonly lang?: string;
  readonly root?: string;
}

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

export interface ConfigServiceShape {
  readonly resolve: (
    rspressConfig: RspressConfigSubset,
  ) => Effect.Effect<
    ResolvedBuildContext,
    ConfigValidationError | ApiModelLoadError | TypeRegistryError,
    Scope.Scope
  >;
}

export class ConfigService extends Context.Tag("rspress-plugin-api-extractor/ConfigService")<
  ConfigService,
  ConfigServiceShape
>() {}
```

Remove the old `ValidatedApiConfig`, `ValidatedPluginConfig`, and the old
`ConfigServiceShape` (validateMultiVersion method).

- [ ] **Step 4: Run test**

Run: `pnpm vitest run plugin/__test__/config-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

Note: `ConfigServiceLive.ts` will have type errors since its old
implementation no longer matches the new interface. This is expected —
we'll rewrite it in Task 2.

- [ ] **Step 6: Commit**

```bash
git add plugin/src/services/ConfigService.ts plugin/__test__/config-service.test.ts
git commit -m "feat: expand ConfigService interface with ResolvedBuildContext types"
```

---

## Chunk 2: Implement ConfigServiceLive.resolve()

### Task 2: Rewrite ConfigServiceLive

**Files:**

- Rewrite: `plugin/src/layers/ConfigServiceLive.ts`
- Test: `plugin/__test__/config-service.test.ts`

This is the core task. Move the ~370 lines from `plugin.ts:beforeBuild`
(lines 340-798) into `ConfigServiceLive.resolve()`.

- [ ] **Step 1: Write the integration test**

Add to `plugin/__test__/config-service.test.ts`:

```typescript
import { Effect, Layer, Scope } from "effect";
import path from "node:path";
import { ConfigService } from "../src/services/ConfigService.js";
import { ConfigServiceLive } from "../src/layers/ConfigServiceLive.js";
import { PathDerivationServiceLive } from "../src/layers/PathDerivationServiceLive.js";
import { MockTypeRegistryServiceLayer } from "./utils/layers.js";
import { PluginLoggerLayer } from "../src/layers/ObservabilityLive.js";
import type { PluginOptions } from "../src/schemas/index.js";

describe("ConfigServiceLive.resolve", () => {
  const fixtureModel = path.join(
    import.meta.dirname,
    "../src/__fixtures__/example-module/example-module.api.json",
  );

  const makeTestLayer = (options: PluginOptions) =>
    Layer.provideMerge(
      Layer.mergeAll(
        PathDerivationServiceLive,
        MockTypeRegistryServiceLayer,
        PluginLoggerLayer("info"),
      ),
      ConfigServiceLive(options, new ShikiCrossLinker()),
    );

  it("resolves single-API config with fixture model", async () => {
    const options: PluginOptions = {
      api: {
        packageName: "example-module",
        model: fixtureModel,
        baseRoute: "/example-module",
      },
    };

    const program = Effect.gen(function* () {
      const config = yield* ConfigService;
      return yield* config.resolve({});
    }).pipe(Effect.scoped);

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(makeTestLayer(options))),
    );

    expect(result.apiConfigs).toHaveLength(1);
    expect(result.apiConfigs[0].packageName).toBe("example-module");
    expect(result.apiConfigs[0].baseRoute).toBe("/example-module");
    expect(result.highlighter).toBeDefined();
    expect(result.snapshotManager).toBeDefined();
    expect(result.shikiCrossLinker).toBeDefined();
    expect(result.pageConcurrency).toBeGreaterThan(0);
  });

  it("fails with ConfigValidationError when both api and apis provided", async () => {
    const options: PluginOptions = {
      api: { packageName: "foo", model: fixtureModel },
      apis: [{ packageName: "bar", model: fixtureModel }],
    };

    const program = Effect.gen(function* () {
      const config = yield* ConfigService;
      return yield* config.resolve({});
    }).pipe(Effect.scoped);

    const result = await Effect.runPromiseExit(
      program.pipe(Effect.provide(makeTestLayer(options))),
    );

    expect(result._tag).toBe("Failure");
  });

  it("fails with ConfigValidationError when neither api nor apis provided", async () => {
    const options: PluginOptions = {};

    const program = Effect.gen(function* () {
      const config = yield* ConfigService;
      return yield* config.resolve({});
    }).pipe(Effect.scoped);

    const result = await Effect.runPromiseExit(
      program.pipe(Effect.provide(makeTestLayer(options))),
    );

    expect(result._tag).toBe("Failure");
  });

  it("recovers from TypeRegistryError and continues without external types", async () => {
    // Mock TypeRegistryService that always fails
    const FailingTypeRegistryLayer = Layer.succeed(TypeRegistryService, {
      loadPackages: (_packages) =>
        Effect.fail(
          new TypeRegistryError({ packageName: "zod", version: "3.0.0", reason: "Network error" }),
        ),
      createTypeScriptCache: (_packages, _compilerOptions) =>
        Effect.succeed(new Map()),
    });

    const options: PluginOptions = {
      api: {
        packageName: "example-module",
        model: fixtureModel,
        baseRoute: "/example-module",
        externalPackages: [{ name: "zod", version: "3.0.0" }],
      },
    };

    const testLayer = Layer.provideMerge(
      Layer.mergeAll(
        PathDerivationServiceLive,
        FailingTypeRegistryLayer,
        PluginLoggerLayer("info"),
      ),
      ConfigServiceLive(options, new ShikiCrossLinker()),
    );

    const program = Effect.gen(function* () {
      const config = yield* ConfigService;
      return yield* config.resolve({});
    }).pipe(Effect.scoped);

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(testLayer)),
    );

    // Should succeed despite TypeRegistry failure
    expect(result.apiConfigs).toHaveLength(1);
    expect(result.highlighter).toBeDefined();
  });

  it("resolves multi-API config", async () => {
    const options: PluginOptions = {
      apis: [
        { packageName: "api-a", model: fixtureModel, baseRoute: "/api-a" },
        { packageName: "api-b", model: fixtureModel, baseRoute: "/api-b" },
      ],
    };

    const program = Effect.gen(function* () {
      const config = yield* ConfigService;
      return yield* config.resolve({});
    }).pipe(Effect.scoped);

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(makeTestLayer(options))),
    );

    expect(result.apiConfigs).toHaveLength(2);
    expect(result.apiConfigs[0].packageName).toBe("api-a");
    expect(result.apiConfigs[1].packageName).toBe("api-b");
  });

  it("cleans up SnapshotManager when scope closes", async () => {
    const options: PluginOptions = {
      api: {
        packageName: "example-module",
        model: fixtureModel,
        baseRoute: "/example-module",
      },
    };

    let snapshotManagerRef: any = null;

    const program = Effect.gen(function* () {
      const config = yield* ConfigService;
      const ctx = yield* config.resolve({});
      snapshotManagerRef = ctx.snapshotManager;
      // Verify DB is accessible during scope
      const snapshots = snapshotManagerRef.getSnapshotsForOutputDir("/nonexistent");
      expect(Array.isArray(snapshots)).toBe(true);
      return ctx;
    }).pipe(Effect.scoped);

    await Effect.runPromise(
      program.pipe(Effect.provide(makeTestLayer(options))),
    );

    // After scope closes, DB should be closed (close is idempotent)
    // Calling close again should not throw
    expect(() => snapshotManagerRef.close()).not.toThrow();
  });
});
```

Also add these imports at the top of the test file:

```typescript
import { TypeRegistryError } from "../src/errors.js";
import { TypeRegistryService } from "../src/services/TypeRegistryService.js";
import { ShikiCrossLinker } from "../src/shiki-transformer.js";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/config-service.test.ts`

Expected: FAIL — `ConfigServiceLive` doesn't implement the new interface.

- [ ] **Step 3: Implement ConfigServiceLive**

Rewrite `plugin/src/layers/ConfigServiceLive.ts`. The `resolve()` method
implements the 15-step sequence from the spec. Key points:

**Dependencies:** The layer depends on `TypeRegistryService` and
`PathDerivationService`. It also receives `shikiCrossLinker` as a
parameter — this instance is created at factory scope (needed by the
`config()` hook before `beforeBuild` runs) and passed in so ConfigService
can include it in `ResolvedBuildContext`:

```typescript
export function ConfigServiceLive(
  options: PluginOptions,
  shikiCrossLinker: ShikiCrossLinker,
): Layer.Layer<ConfigService, never, TypeRegistryService | PathDerivationService>
```

**Structure of `resolve()`:**

```typescript
resolve: (rspressConfig) => Effect.gen(function* () {
  // 1. Cross-field validation
  yield* validateOptions(options, rspressConfig);

  // 2-8. Config resolution + model loading + VFS
  const { apiConfigs, combinedVfs, allExternalPackages } =
    yield* resolveApiConfigs(options, rspressConfig);

  // 9. TypeScript config resolution
  const resolvedCompilerOptions = yield* Effect.promise(() =>
    resolveTypeScriptConfig(projectRoot, globalTsConfig),
  );

  // 10. External type loading (recoverable)
  const { tsEnvCache } = yield* loadExternalTypes(
    allExternalPackages, resolvedCompilerOptions,
  );

  // 11. Twoslash init
  TwoslashManager.getInstance().initialize(combinedVfs, ...);

  // 12. Shiki highlighter
  const highlighter = yield* Effect.promise(() => createHighlighter({...}));

  // 13. Snapshot DB (acquireRelease)
  const snapshotManager = yield* Effect.acquireRelease(
    Effect.sync(() => new SnapshotManager(dbPath)),
    (sm) => Effect.sync(() => sm.close()),
  );

  // 14. OG resolver
  const ogResolver = options.siteUrl ? new OpenGraphResolver({...}) : null;

  // 15. Assemble context
  return { apiConfigs, combinedVfs, highlighter, ... };
})
```

Move the `processSimpleApi` helper, single-API logic (versioned +
non-versioned), and multi-API logic from `plugin.ts` into private
functions within `ConfigServiceLive.ts`.

**Important details to preserve:**

- `normalizeBaseRoute`, `normalizeThemeConfig`, `isVersionConfig` calls
- `mergeLlmsPluginConfig` three-level cascade
- `validateExternalPackages` conflict detection
- `extractAutoDetectedPackages` with `autoDetectDependencies` options
- `BuildMetrics` increment calls (`apiVersionsLoaded`, `externalPackagesTotal`)
- Multi-API tsconfig warning when multiple APIs specify different tsconfigs
- `prependImportsToVfs` call for each API's VFS
- Theme collection across all API configs for Shiki initialization
- `ShikiCrossLinker`, `MemberFormatTransformer`, `HideCutLinesTransformer`
  creation
- `TwoslashManager.getInstance().getTransformer()` for `twoslashTransformer`

**Verbose timing logs:** Replace the ~6 `console.log` timing checkpoints
with `Effect.logDebug` calls inside `resolve()`. Use `performance.now()`
deltas for timing. The Effect logger layer handles level filtering, so
these only appear at debug/verbose levels.

**Multi-API tsconfig warning:** Replace `console.warn(...)` with
`yield* Effect.logWarning(...)` so it flows through the Effect logger.

**Scope semantics:** `ManagedRuntime` provides a `Scope` that lives
until `runtime.dispose()`. The `acquireRelease` in `resolve()` attaches
to this scope — `SnapshotManager.close()` runs at `runtime.dispose()` in
`afterBuild`. In tests, `Effect.scoped` creates a local scope that closes
when the test's Effect completes. Both approaches are correct.

**TypeRegistryError recovery:**

```typescript
const typeResult = yield* loadExternalTypes.pipe(
  Effect.catchTag("TypeRegistryError", (err) =>
    Effect.gen(function* () {
      yield* Effect.logWarning(`Failed to load external types: ${err.message}`);
      const registry = yield* TypeRegistryService;
      const cache = yield* registry.createTypeScriptCache([], compilerOptions);
      return { vfs: new Map<string, string>(), cache };
    }),
  ),
);
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run plugin/__test__/config-service.test.ts`

Expected: All tests pass.

- [ ] **Step 5: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

Note: `plugin.ts` may show unused import warnings since we haven't
removed the old code yet. That's OK for now.

- [ ] **Step 6: Run all tests**

Run: `pnpm run test`

Expected: All existing tests pass. The old `beforeBuild` code still works
alongside the new `ConfigServiceLive`.

- [ ] **Step 7: Commit**

```bash
git add plugin/src/layers/ConfigServiceLive.ts plugin/__test__/config-service.test.ts
git commit -m "feat: implement ConfigServiceLive.resolve() with full config + type system setup"
```

---

## Chunk 3: Wire Into Plugin and Adapt generateApiDocs

### Task 3: Change `generateApiDocs` signature

**Files:**

- Modify: `plugin/src/plugin.ts`

Change `generateApiDocs` from 9 positional arguments to
`(apiConfig, buildContext, fileContextMap)`:

- [ ] **Step 1: Update `generateApiDocs` signature and body**

Change:

```typescript
// OLD
async function generateApiDocs(
  config: { ... },
  shikiCrossLinker: ShikiCrossLinker,
  snapshotManager: SnapshotManager,
  ogResolver: OpenGraphResolver | null,
  fileContextMap: Map<...>,
  highlighter?: Highlighter,
  hideCutTransformer?: ShikiTransformer,
  hideCutLinesTransformer?: ShikiTransformer,
  twoslashTransformer?: ShikiTransformer,
): Promise<CrossLinkData>
```

To:

```typescript
// NEW
async function generateApiDocs(
  apiConfig: ResolvedApiConfig & { suppressExampleErrors?: boolean },
  buildContext: ResolvedBuildContext,
  fileContextMap: Map<string, { api?: string; version?: string; file: string }>,
): Promise<CrossLinkData>
```

Update the function body to destructure from `buildContext`:

```typescript
const {
  snapshotManager, shikiCrossLinker, highlighter,
  hideCutTransformer, hideCutLinesTransformer, twoslashTransformer,
  pageConcurrency,
} = buildContext;

const ogResolver = buildContext.ogResolver;
const {
  apiPackage, packageName, apiName, outputDir, baseRoute,
  categories, source, packageJson, llmsPlugin, siteUrl, ogImage,
} = apiConfig;
const suppressExampleErrors = apiConfig.suppressExampleErrors ?? true;
```

The rest of the function body (prepareWorkItems, buildPipelineForApi,
writeMetadata, cleanupAndCommit) stays the same — it already uses these
local variables.

Remove `pageConcurrency` calculation (it comes from `buildContext` now).

- [ ] **Step 2: Update the call site in `beforeBuild`**

The current call (around line 811):

```typescript
await generateApiDocs(
  { ...config, suppressExampleErrors: options.errors?.example !== "show" },
  shikiCrossLinker, snapshotManager, ogResolver, fileContextMap,
  shikiHighlighter, hideCutTransformer, hideCutLinesTransformer,
  TwoslashManager.getInstance().getTransformer() ?? undefined,
);
```

Temporarily change to pass `buildContext`-like object. This is a
transitional step — the real wiring comes in Task 4.

For now, construct a `ResolvedBuildContext` from the existing local
variables:

```typescript
const buildContext: ResolvedBuildContext = {
  apiConfigs: apiConfigs as ReadonlyArray<ResolvedApiConfig>,
  combinedVfs: combinedVfs!,
  highlighter: shikiHighlighter!,
  tsEnvCache: tsEnvCache!,
  resolvedCompilerOptions,
  ogResolver,
  snapshotManager,
  shikiCrossLinker,
  hideCutTransformer,
  hideCutLinesTransformer,
  twoslashTransformer: TwoslashManager.getInstance().getTransformer() ?? undefined,
  pageConcurrency: Math.max(os.cpus().length > 4 ? os.cpus().length - 1 : os.cpus().length, 2),
  logLevel: logLevel as LogLevel,
  suppressExampleErrors: options.errors?.example !== "show",
};

// Then in the forEach:
await generateApiDocs(
  { ...config, suppressExampleErrors: buildContext.suppressExampleErrors },
  buildContext,
  fileContextMap,
);
```

- [ ] **Step 3: Run all tests**

Run: `pnpm run test`

Expected: All tests pass. Behavior is unchanged — just different argument
packaging.

- [ ] **Step 4: Lint, typecheck, commit**

```bash
git add plugin/src/plugin.ts
git commit -m "refactor: change generateApiDocs to accept ResolvedBuildContext"
```

---

### Task 4: Replace `beforeBuild` with ConfigService.resolve()

**Files:**

- Modify: `plugin/src/plugin.ts`

This is the big shrink — replace ~370 lines of imperative config plumbing
with a single `configService.resolve()` call.

- [ ] **Step 1: Update layer composition**

In `plugin/src/plugin.ts`, find the `EffectAppLayer` construction
(around line 293). Change from `Layer.mergeAll` to `Layer.provideMerge`:

```typescript
const BaseLayer = Layer.mergeAll(
  PathDerivationServiceLive,
  PluginLoggerLayer(effectLogLevel),
  TypeRegistryServiceLive,
);
const EffectAppLayer = Layer.provideMerge(
  BaseLayer,
  ConfigServiceLive(options, shikiCrossLinker),
);
```

Note: `shikiCrossLinker` is still created at factory scope (line 279)
because the `config()` hook needs it for remark plugin registration.
It's passed into `ConfigServiceLive` so `resolve()` can include it in
`ResolvedBuildContext`.

Add import for `ConfigServiceLive`:

```typescript
import { ConfigServiceLive } from "./layers/ConfigServiceLive.js";
import { ConfigService } from "./services/ConfigService.js";
import type { ResolvedBuildContext } from "./services/ConfigService.js";
```

- [ ] **Step 2: Replace `beforeBuild` body**

Replace the entire `beforeBuild` body (lines 327-849) with:

```typescript
async beforeBuild(_config: UserConfig, _isProd: boolean): Promise<void> {
  buildStartTime = performance.now();
  VfsRegistry.clear();
  fileContextMap.clear();

  if (isVerbose) {
    console.log("🚀 RSPress API Extractor Plugin");
  }

  try {
    const buildContext = await effectRuntime.runPromise(
      Effect.gen(function* () {
        const config = yield* ConfigService;
        return yield* config.resolve({
          multiVersion: (_config as any).multiVersion,
          locales: (_config as any).locales?.map((l: { lang: string }) => l.lang),
          lang: (_config as any).lang,
          root: docsRoot,
        });
      }),
    );

    // Generate API documentation
    console.log("📝 Generating API documentation...");
    const pageGenStart = performance.now();

    await Effect.runPromise(
      Effect.forEach(
        buildContext.apiConfigs,
        (apiConfig) =>
          Effect.promise(async () => {
            const configStart = performance.now();
            await generateApiDocs(
              { ...apiConfig, suppressExampleErrors: buildContext.suppressExampleErrors },
              buildContext,
              fileContextMap,
            );
            if (isVerbose) {
              console.log(`⏱  Generating docs for ${apiConfig.packageName}: ${(performance.now() - configStart).toFixed(0)}ms`);
            }
          }),
        { concurrency: 2 },
      ),
    );

    const pageGenMs = performance.now() - pageGenStart;
    console.log(`📝 Page generation completed in ${pageGenMs.toFixed(0)}ms`);

    const totalTime = ((performance.now() - buildStartTime) / 1000).toFixed(2);
    console.log(`✅ API documentation complete (${totalTime}s)`);
  } catch (error) {
    console.error(
      `❌ Error generating API documentation: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
},
```

**Key changes:**

- No more `snapshotManager.close()` — handled by `acquireRelease`
- No more `shikiHighlighter`, `combinedVfs`, `tsEnvCache`, etc. as
  mutable local variables — all in `buildContext`
- No more `processSimpleApi` helper — moved to ConfigServiceLive
- No more model loading, category resolution, path derivation, external
  package loading, Twoslash init, Shiki init — all in ConfigServiceLive

- [ ] **Step 3: Remove dead code from plugin.ts**

Remove now-unused imports and variables:

- `ApiModelLoader` import
- `CategoryResolver` import
- `SnapshotManager` import
- `OpenGraphResolver` import
- `ApiExtractedPackage` import
- `TypeReferenceExtractor` import
- `createHighlighter` import
- `resolveTypeScriptConfig` import
- `TypeRegistryService` import
- Various type imports that are no longer used
- `prependImportsToVfs` function (moved to ConfigServiceLive)
- `DEFAULT_SHIKI_THEMES` constant (moved to ConfigServiceLive)
- Mutable variables: `shikiHighlighter`, `combinedVfs`

**Keep (used in `config()` hook or `generateApiDocs`):**

- `normalizeBaseRoute`, `unscopedName` (config hook path derivation)
- `normalizeThemeConfig` (config hook remark plugin theme setup)
- `markdownCrossLinker` (generateApiDocs cross-linking)
- `deriveOutputPaths` (config hook pre-creates output dirs)
- `VfsRegistry`, `TwoslashManager` (generateApiDocs + remark plugins)
- `remarkApiCodeblocks`, `remarkWithApi` (config hook remark plugins)
- `Schema` from effect (factory-time decode)
- `BuildMetrics`, `logBuildSummary` (afterBuild summary)
- `DEFAULT_CATEGORIES` (config hook path derivation)

**Remove (all moved to ConfigServiceLive or no longer used):**

- `ApiModelLoader` — model loading moved to ConfigServiceLive
- `ApiExtractedPackage` — VFS generation moved to ConfigServiceLive
- `CategoryResolver` — category merging moved to ConfigServiceLive
- `SnapshotManager` — lifecycle via acquireRelease in ConfigServiceLive
- `OpenGraphResolver` — created in ConfigServiceLive
- `TypeReferenceExtractor` — VFS import prepending moved to ConfigServiceLive
- `createHighlighter` — Shiki init moved to ConfigServiceLive
- `resolveTypeScriptConfig` — tsconfig resolution moved to ConfigServiceLive
- `TypeRegistryService` — external types loaded in ConfigServiceLive
- `extractAutoDetectedPackages`, `isVersionConfig`, `mergeLlmsPluginConfig`,
  `validateExternalPackages` — config utils only used in ConfigServiceLive
- `prependImportsToVfs` function — moved to ConfigServiceLive
- `DEFAULT_SHIKI_THEMES` constant — moved to ConfigServiceLive
- Type imports only used in beforeBuild: `ExternalPackageSpec`,
  `MultiApiConfig`, `SingleApiConfig`, `VersionConfig`, `TypeScriptConfig`,
  `LoadedModel`, `VirtualFileSystem`, `VirtualTypeScriptEnvironment`

**Factory-scope variables that STAY:**

- `shikiCrossLinker` (line 279) — needed by `config()` hook for remark
  plugin registration before `beforeBuild` runs. Also passed into
  `ConfigServiceLive` as a parameter so it can include it in
  `ResolvedBuildContext`.
- `hideCutTransformer`, `hideCutLinesTransformer` (lines 283-284) —
  imported singletons, ConfigServiceLive imports them directly.
- `docsRoot` — captured by `config()` hook, read by `beforeBuild`.

- [ ] **Step 4: Run all tests**

Run: `pnpm run test`

Expected: All tests pass.

- [ ] **Step 5: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

- [ ] **Step 6: Commit**

```bash
git add plugin/src/plugin.ts
git commit -m "refactor: replace beforeBuild config plumbing with ConfigService.resolve()"
```

---

## Chunk 4: Verification

### Task 5: Full regression verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `pnpm run test`

Expected: All tests pass.

- [ ] **Step 2: Run typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

Expected: No type errors.

- [ ] **Step 3: Run lint**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint`

Expected: No lint errors.

- [ ] **Step 4: Verify plugin.ts shrank**

```bash
wc -l plugin/src/plugin.ts
```

Expected: ~600 lines (down from ~996). The ~370 lines of config plumbing
moved to `ConfigServiceLive.ts`.

- [ ] **Step 5: Verify ConfigServiceLive grew**

```bash
wc -l plugin/src/layers/ConfigServiceLive.ts
```

Expected: ~400-450 lines (up from ~114).

- [ ] **Step 6: Verify acquireRelease is used for SnapshotManager**

```bash
grep "acquireRelease" plugin/src/layers/ConfigServiceLive.ts
```

Expected: Match found.

- [ ] **Step 7: Verify no manual snapshotManager.close() in plugin.ts**

```bash
grep "snapshotManager.close\|\.close()" plugin/src/plugin.ts
```

Expected: No matches.
