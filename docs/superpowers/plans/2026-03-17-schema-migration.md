# Schema Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development
> (if subagents available) or superpowers:executing-plans to implement this plan.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `types.ts` (1,488 lines) with Effect Schema definitions,
eliminating manual type/validation maintenance and enabling runtime
decode/encode with automatic type derivation.

**Architecture:** Three new file groups: `src/schemas/` (Schema definitions +
`DEFAULT_CATEGORIES`), `src/internal-types.ts` (plain interfaces with external
library types), `src/config-utils.ts` (utility functions). `types.ts` and
`config-validation.ts` are deleted. All 18 consumer files update imports.

**Tech Stack:** Effect (Schema), semver-effect, Vitest, Biome

**Spec:** `docs/superpowers/specs/2026-03-17-schema-migration-design.md`

---

## File Structure

### New files

| File | Responsibility |
| ---- | -------------- |
| `plugin/src/schemas/config.ts` | Config schemas: `ExternalPackageSpec`, `AutoDetectDependencies`, `CategoryConfig`, `LlmsPlugin`, `ErrorConfig`, `SourceConfig`, `VersionConfig`, `SingleApiConfig`, `MultiApiConfig`, `PluginOptions`, `LogLevel`, `ThemeConfig` + `DEFAULT_CATEGORIES` constant |
| `plugin/src/schemas/opengraph.ts` | OG schemas: `OpenGraphImageMetadata`, `OpenGraphImageConfig`, `OpenGraphMetadata` |
| `plugin/src/schemas/performance.ts` | Perf schemas: `PerformanceThresholds`, `PerformanceConfig` |
| `plugin/src/schemas/index.ts` | Re-exports all schemas and derived types |
| `plugin/src/internal-types.ts` | Plain interfaces: `TypeResolutionCompilerOptions`, `TypeScriptConfig`, `TypeScriptConfigFields`, `PackageJson`, `LoadedModel` |
| `plugin/src/config-utils.ts` | Utility functions from types.ts: config merging, dependency extraction, version resolution, type guards |
| `plugin/__test__/schemas.test.ts` | Schema decode/encode tests |
| `plugin/__test__/config-utils.test.ts` | Migrated utility function tests |

### Modified files

| File | Change |
| ---- | ------ |
| `plugin/src/plugin.ts` | Import updates + `Schema.decodeUnknownSync` at factory |
| `plugin/src/index.ts` | Re-export from new locations |
| `plugin/src/build-stages.ts` | Import updates |
| `plugin/src/category-resolver.ts` | Import updates |
| `plugin/src/category-resolver.test.ts` | Import updates |
| `plugin/src/loader.ts` | Import updates |
| `plugin/src/loader.test.ts` | Import updates |
| `plugin/src/model-loader.ts` | Import updates |
| `plugin/src/model-loader.test.ts` | Import updates |
| `plugin/src/og-resolver.ts` | Import updates |
| `plugin/src/og-resolver.test.ts` | Import updates |
| `plugin/src/tsconfig-parser.ts` | Import updates |
| `plugin/src/typescript-config.ts` | Import updates |
| `plugin/src/typescript-config.test.ts` | Import updates |
| `plugin/src/twoslash-transformer.ts` | Import updates |
| `plugin/src/layers/ConfigServiceLive.ts` | Import updates + use Schema types |
| `plugin/src/services/ConfigService.ts` | Import updates |
| `plugin/package.json` | Add `semver-effect`, remove `semver` + `@types/semver` |

### Deleted files

| File | Reason |
| ---- | ------ |
| `plugin/src/types.ts` | Split into schemas/, internal-types.ts, config-utils.ts |
| `plugin/src/types.test.ts` | Migrated to `__test__/config-utils.test.ts` |
| `plugin/src/config-validation.ts` | Replaced by Schema decode (structural) + ConfigServiceLive (cross-field) |
| `plugin/src/config-validation.test.ts` | Tests are cross-field validations (api vs apis, multiVersion matching) — these stay with ConfigServiceLive, not schema tests. Deleted when config-validation.ts is deleted; equivalent coverage already exists in `plugin/src/layers/ConfigServiceLive.ts` validation logic. |

---

## Chunk 1: Schema Definitions

### Task 1: Create OpenGraph schemas

**Files:**

- Create: `plugin/src/schemas/opengraph.ts`
- Create: `plugin/src/schemas/index.ts`
- Test: `plugin/__test__/schemas.test.ts`

- [ ] **Step 1: Write the test**

Create `plugin/__test__/schemas.test.ts`:

```typescript
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { OpenGraphImageConfig, OpenGraphImageMetadata, OpenGraphMetadata } from "../src/schemas/index.js";

describe("OpenGraph schemas", () => {
  it("decodes OpenGraphImageMetadata", () => {
    const decode = Schema.decodeUnknownSync(OpenGraphImageMetadata);
    const result = decode({ url: "https://example.com/og.png", width: 1200, height: 630 });
    expect(result.url).toBe("https://example.com/og.png");
    expect(result.width).toBe(1200);
  });

  it("decodes OpenGraphImageMetadata with only required fields", () => {
    const decode = Schema.decodeUnknownSync(OpenGraphImageMetadata);
    const result = decode({ url: "https://example.com/og.png" });
    expect(result.url).toBe("https://example.com/og.png");
    expect(result.width).toBeUndefined();
  });

  it("rejects OpenGraphImageMetadata without url", () => {
    const decode = Schema.decodeUnknownSync(OpenGraphImageMetadata);
    expect(() => decode({ width: 1200 })).toThrow();
  });

  it("decodes OpenGraphImageConfig as string", () => {
    const decode = Schema.decodeUnknownSync(OpenGraphImageConfig);
    const result = decode("/images/og.png");
    expect(result).toBe("/images/og.png");
  });

  it("decodes OpenGraphImageConfig as metadata object", () => {
    const decode = Schema.decodeUnknownSync(OpenGraphImageConfig);
    const result = decode({ url: "https://example.com/og.png", width: 1200 });
    expect(typeof result).toBe("object");
  });

  it("decodes OpenGraphMetadata", () => {
    const decode = Schema.decodeUnknownSync(OpenGraphMetadata);
    const result = decode({
      siteUrl: "https://example.com",
      pageRoute: "/api/class/foo",
      description: "Foo class",
      publishedTime: "2025-01-01T00:00:00.000Z",
      modifiedTime: "2025-01-01T00:00:00.000Z",
      section: "Classes",
      tags: ["TypeScript", "API"],
      ogType: "article",
    });
    expect(result.siteUrl).toBe("https://example.com");
    expect(result.tags).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/schemas.test.ts`

Expected: FAIL — cannot resolve `../src/schemas/index.js`.

- [ ] **Step 3: Implement OpenGraph schemas**

Create `plugin/src/schemas/opengraph.ts`:

```typescript
import { Schema } from "effect";

export const OpenGraphImageMetadata = Schema.Struct({
  url: Schema.String,
  secureUrl: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
  alt: Schema.optional(Schema.String),
});
export type OpenGraphImageMetadata = Schema.Schema.Type<typeof OpenGraphImageMetadata>;

export const OpenGraphImageConfig = Schema.Union(Schema.String, OpenGraphImageMetadata);
export type OpenGraphImageConfig = Schema.Schema.Type<typeof OpenGraphImageConfig>;

export const OpenGraphMetadata = Schema.Struct({
  siteUrl: Schema.String,
  pageRoute: Schema.String,
  description: Schema.String,
  publishedTime: Schema.String,
  modifiedTime: Schema.String,
  section: Schema.String,
  tags: Schema.Array(Schema.String),
  ogImage: Schema.optional(OpenGraphImageMetadata),
  ogType: Schema.String,
});
export type OpenGraphMetadata = Schema.Schema.Type<typeof OpenGraphMetadata>;
```

Create `plugin/src/schemas/index.ts`:

```typescript
export {
  OpenGraphImageConfig,
  OpenGraphImageMetadata,
  OpenGraphMetadata,
} from "./opengraph.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run plugin/__test__/schemas.test.ts`

Expected: PASS.

- [ ] **Step 5: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

- [ ] **Step 6: Commit**

```bash
git add plugin/src/schemas/ plugin/__test__/schemas.test.ts
git commit -m "feat: add OpenGraph Effect schemas"
```

---

### Task 2: Create Performance schemas

**Files:**

- Create: `plugin/src/schemas/performance.ts`
- Modify: `plugin/src/schemas/index.ts`
- Test: `plugin/__test__/schemas.test.ts`

- [ ] **Step 1: Write the test**

Add to `plugin/__test__/schemas.test.ts`:

```typescript
import { PerformanceConfig, PerformanceThresholds } from "../src/schemas/index.js";

describe("Performance schemas", () => {
  it("decodes PerformanceThresholds with defaults", () => {
    const decode = Schema.decodeUnknownSync(PerformanceThresholds);
    const result = decode({});
    expect(result.slowCodeBlock).toBe(100);
    expect(result.slowPageGeneration).toBe(500);
    expect(result.slowApiLoad).toBe(1000);
    expect(result.slowFileOperation).toBe(50);
    expect(result.slowHttpRequest).toBe(2000);
    expect(result.slowDbOperation).toBe(100);
  });

  it("decodes PerformanceThresholds with overrides", () => {
    const decode = Schema.decodeUnknownSync(PerformanceThresholds);
    const result = decode({ slowCodeBlock: 200 });
    expect(result.slowCodeBlock).toBe(200);
    expect(result.slowPageGeneration).toBe(500); // default
  });

  it("decodes PerformanceConfig with defaults", () => {
    const decode = Schema.decodeUnknownSync(PerformanceConfig);
    const result = decode({});
    expect(result.showInsights).toBe(true);
    expect(result.trackDetailedMetrics).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/schemas.test.ts`

Expected: FAIL — `PerformanceConfig` not exported.

- [ ] **Step 3: Implement Performance schemas**

Create `plugin/src/schemas/performance.ts`:

```typescript
import { Schema } from "effect";

export const PerformanceThresholds = Schema.Struct({
  slowCodeBlock: Schema.optionalWith(Schema.Number, { default: () => 100 }),
  slowPageGeneration: Schema.optionalWith(Schema.Number, { default: () => 500 }),
  slowApiLoad: Schema.optionalWith(Schema.Number, { default: () => 1000 }),
  slowFileOperation: Schema.optionalWith(Schema.Number, { default: () => 50 }),
  slowHttpRequest: Schema.optionalWith(Schema.Number, { default: () => 2000 }),
  slowDbOperation: Schema.optionalWith(Schema.Number, { default: () => 100 }),
});
export type PerformanceThresholds = Schema.Schema.Type<typeof PerformanceThresholds>;

export const PerformanceConfig = Schema.Struct({
  thresholds: Schema.optional(PerformanceThresholds),
  showInsights: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  trackDetailedMetrics: Schema.optionalWith(Schema.Boolean, { default: () => false }),
});
export type PerformanceConfig = Schema.Schema.Type<typeof PerformanceConfig>;
```

Add to `plugin/src/schemas/index.ts`:

```typescript
export { PerformanceConfig, PerformanceThresholds } from "./performance.js";
```

- [ ] **Step 4: Run test, lint, typecheck, commit**

Run: `pnpm vitest run plugin/__test__/schemas.test.ts`

Expected: PASS.

```bash
git add plugin/src/schemas/ plugin/__test__/schemas.test.ts
git commit -m "feat: add Performance Effect schemas"
```

---

### Task 3: Create Config schemas (leaf types)

**Files:**

- Create: `plugin/src/schemas/config.ts`
- Modify: `plugin/src/schemas/index.ts`
- Test: `plugin/__test__/schemas.test.ts`

This task creates the leaf schemas: `LogLevel`, `ExternalPackageSpec`,
`AutoDetectDependencies`, `ErrorConfig`, `LlmsPlugin`, `CategoryConfig`,
`SourceConfig`, and the `ModelInput` declared schema. Also `DEFAULT_CATEGORIES`.

- [ ] **Step 1: Write the test**

Add to `plugin/__test__/schemas.test.ts`:

```typescript
import {
  AutoDetectDependencies,
  CategoryConfig,
  DEFAULT_CATEGORIES,
  ErrorConfig,
  ExternalPackageSpec,
  LlmsPlugin,
  LogLevel,
  SourceConfig,
} from "../src/schemas/index.js";

describe("Config leaf schemas", () => {
  it("decodes LogLevel literals", () => {
    const decode = Schema.decodeUnknownSync(LogLevel);
    expect(decode("info")).toBe("info");
    expect(decode("debug")).toBe("debug");
    expect(() => decode("invalid")).toThrow();
  });

  it("decodes ExternalPackageSpec", () => {
    const decode = Schema.decodeUnknownSync(ExternalPackageSpec);
    const result = decode({ name: "zod", version: "^3.22.4" });
    expect(result.name).toBe("zod");
    expect(result.version).toBe("^3.22.4");
  });

  it("decodes ExternalPackageSpec with tsconfig string", () => {
    const decode = Schema.decodeUnknownSync(ExternalPackageSpec);
    const result = decode({ name: "zod", version: "3.0.0", tsconfig: "tsconfig.json" });
    expect(result.tsconfig).toBe("tsconfig.json");
  });

  it("decodes ExternalPackageSpec with tsconfig function", () => {
    const decode = Schema.decodeUnknownSync(ExternalPackageSpec);
    const fn = async () => ({ target: 9 });
    const result = decode({ name: "zod", version: "3.0.0", tsconfig: fn });
    expect(typeof result.tsconfig).toBe("function");
  });

  it("rejects ExternalPackageSpec with tsconfig number", () => {
    const decode = Schema.decodeUnknownSync(ExternalPackageSpec);
    expect(() => decode({ name: "zod", version: "3.0.0", tsconfig: 42 })).toThrow();
  });

  it("decodes AutoDetectDependencies with defaults", () => {
    const decode = Schema.decodeUnknownSync(AutoDetectDependencies);
    const result = decode({});
    expect(result.dependencies).toBe(false);
    expect(result.devDependencies).toBe(false);
    expect(result.peerDependencies).toBe(true);
    expect(result.autoDependencies).toBe(true);
  });

  it("decodes ErrorConfig", () => {
    const decode = Schema.decodeUnknownSync(ErrorConfig);
    expect(decode({ example: "suppress" }).example).toBe("suppress");
    expect(decode({}).example).toBeUndefined();
    expect(() => decode({ example: "invalid" })).toThrow();
  });

  it("decodes LlmsPlugin with defaults", () => {
    const decode = Schema.decodeUnknownSync(LlmsPlugin);
    const result = decode({});
    expect(result.enabled).toBe(false);
    expect(result.showCopyButton).toBe(true);
    expect(result.copyButtonText).toBe("Copy Markdown");
    expect(result.viewOptions).toEqual(["markdownLink", "chatgpt", "claude"]);
  });

  it("decodes CategoryConfig with defaults", () => {
    const decode = Schema.decodeUnknownSync(CategoryConfig);
    const result = decode({ displayName: "Classes", singularName: "Class", folderName: "class" });
    expect(result.collapsible).toBe(true);
    expect(result.collapsed).toBe(true);
    expect(result.overviewHeaders).toEqual([2]);
  });

  it("decodes SourceConfig", () => {
    const decode = Schema.decodeUnknownSync(SourceConfig);
    const result = decode({ url: "https://github.com/org/repo" });
    expect(result.url).toBe("https://github.com/org/repo");
    expect(result.ref).toBeUndefined();
  });

  it("DEFAULT_CATEGORIES has 7 categories", () => {
    expect(Object.keys(DEFAULT_CATEGORIES)).toHaveLength(7);
    expect(DEFAULT_CATEGORIES.classes.folderName).toBe("class");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/schemas.test.ts`

Expected: FAIL — schemas not exported.

- [ ] **Step 3: Implement config leaf schemas**

Create `plugin/src/schemas/config.ts`. Include:

1. `ModelInput` — `Schema.declare` for `string | Function | URL`
2. `LogLevel` — `Schema.Literal("none", "info", "verbose", "debug")`
3. `ExternalPackageSpec` — with `ModelInput` for tsconfig
4. `AutoDetectDependencies` — with `optionalWith` defaults
5. `ErrorConfig` — with `Schema.Literal("suppress", "show")`
6. `LlmsPlugin` — with `optionalWith` defaults
7. `CategoryConfig` — with `optionalWith` defaults for collapsible/collapsed/overviewHeaders; `itemKinds` as `Schema.Array(Schema.Number)` since `ApiItemKind` is a number enum
8. `SourceConfig` — named schema (url required, ref optional)
9. `ThemeConfig` — union of string | {light, dark} | Record
10. `DEFAULT_CATEGORIES` constant — moved verbatim from `types.ts:1104-1168`

The `DEFAULT_CATEGORIES` constant requires `import { ApiItemKind } from "@microsoft/api-extractor-model"`.

Add all exports to `plugin/src/schemas/index.ts`.

- [ ] **Step 4: Run test, lint, typecheck, commit**

```bash
git add plugin/src/schemas/ plugin/__test__/schemas.test.ts
git commit -m "feat: add config leaf Effect schemas and DEFAULT_CATEGORIES"
```

---

### Task 4: Create Config composite schemas

**Files:**

- Modify: `plugin/src/schemas/config.ts`
- Modify: `plugin/src/schemas/index.ts`
- Test: `plugin/__test__/schemas.test.ts`

Add `VersionConfig`, `SingleApiConfig`, `MultiApiConfig`, `PluginOptions`.

- [ ] **Step 1: Write the test**

Add to `plugin/__test__/schemas.test.ts`:

```typescript
import {
  MultiApiConfig,
  PluginOptions,
  SingleApiConfig,
  VersionConfig,
} from "../src/schemas/index.js";

describe("Config composite schemas", () => {
  it("decodes VersionConfig", () => {
    const decode = Schema.decodeUnknownSync(VersionConfig);
    const result = decode({ model: "temp/v1.api.json" });
    expect(result.model).toBe("temp/v1.api.json");
  });

  it("decodes VersionConfig with source", () => {
    const decode = Schema.decodeUnknownSync(VersionConfig);
    const result = decode({
      model: "temp/v1.api.json",
      source: { url: "https://github.com/org/repo", ref: "blob/v1" },
    });
    expect(result.source?.url).toBe("https://github.com/org/repo");
  });

  it("decodes SingleApiConfig minimal", () => {
    const decode = Schema.decodeUnknownSync(SingleApiConfig);
    const result = decode({ packageName: "my-lib", model: "temp/my-lib.api.json" });
    expect(result.packageName).toBe("my-lib");
  });

  it("decodes SingleApiConfig with versions", () => {
    const decode = Schema.decodeUnknownSync(SingleApiConfig);
    const result = decode({
      packageName: "my-lib",
      versions: {
        "v1": "temp/v1.api.json",
        "v2": { model: "temp/v2.api.json" },
      },
    });
    expect(result.versions).toBeDefined();
    expect(Object.keys(result.versions!)).toHaveLength(2);
  });

  it("decodes SingleApiConfig with apiFolder null", () => {
    const decode = Schema.decodeUnknownSync(SingleApiConfig);
    const result = decode({ packageName: "my-lib", model: "x", apiFolder: null });
    expect(result.apiFolder).toBeNull();
  });

  it("decodes MultiApiConfig with required model", () => {
    const decode = Schema.decodeUnknownSync(MultiApiConfig);
    const result = decode({ packageName: "my-lib", model: "temp/my-lib.api.json" });
    expect(result.model).toBe("temp/my-lib.api.json");
  });

  it("rejects MultiApiConfig without model", () => {
    const decode = Schema.decodeUnknownSync(MultiApiConfig);
    expect(() => decode({ packageName: "my-lib" })).toThrow();
  });

  it("decodes PluginOptions single-api mode", () => {
    const decode = Schema.decodeUnknownSync(PluginOptions);
    const result = decode({
      api: { packageName: "my-lib", model: "temp/my-lib.api.json" },
    });
    expect(result.api?.packageName).toBe("my-lib");
  });

  it("decodes PluginOptions multi-api mode", () => {
    const decode = Schema.decodeUnknownSync(PluginOptions);
    const result = decode({
      apis: [{ packageName: "core", model: "temp/core.api.json" }],
    });
    expect(result.apis).toHaveLength(1);
  });

  it("decodes PluginOptions with llmsPlugin boolean", () => {
    const decode = Schema.decodeUnknownSync(PluginOptions);
    const result = decode({
      api: { packageName: "x", model: "y" },
      llmsPlugin: true,
    });
    expect(result.llmsPlugin).toBe(true);
  });

  it("decodes PluginOptions with llmsPlugin object", () => {
    const decode = Schema.decodeUnknownSync(PluginOptions);
    const result = decode({
      api: { packageName: "x", model: "y" },
      llmsPlugin: { enabled: true, showCopyButton: false },
    });
    expect(typeof result.llmsPlugin).toBe("object");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/schemas.test.ts`

Expected: FAIL — composite schemas not exported.

- [ ] **Step 3: Implement composite schemas**

Add to `plugin/src/schemas/config.ts`:

- `VersionValue = Schema.Union(ModelInput, VersionConfig)`
- `CategoriesRecord = Schema.Record({ key: Schema.String, value: CategoryConfig })`
- `SingleApiConfig` — 16 fields as specified in the spec
- `MultiApiConfig` — 15 fields (required `model`, no `versions`)
- `PluginOptions` — top-level with `api`, `apis`, `siteUrl`, `ogImage`, `defaultCategories`, `errors`, `llmsPlugin` (`Schema.Union(Schema.Boolean, LlmsPlugin)`), `logLevel`, `performance`

Add all exports to `plugin/src/schemas/index.ts`.

- [ ] **Step 4: Run test, lint, typecheck, commit**

```bash
git add plugin/src/schemas/ plugin/__test__/schemas.test.ts
git commit -m "feat: add composite config Effect schemas"
```

---

## Chunk 2: Internal Types and Config Utils

### Task 5: Create `internal-types.ts`

**Files:**

- Create: `plugin/src/internal-types.ts`

- [ ] **Step 1: Create the file**

Move these plain interfaces from `types.ts` to `plugin/src/internal-types.ts`:

- `TypeResolutionCompilerOptions` (lines 11-23 in types.ts)
- `TypeScriptConfig` (lines 30-33)
- `TypeScriptConfigFields` (lines 39-83)
- `PackageJson` (lines 113-120)
- `LoadedModel` (lines 102-108) — `source` field references
  `import("./schemas/index.js").SourceConfig`

Keep all JSDoc comments. Keep all imports (`PathLike`, `ApiModel`, `ts`).

- [ ] **Step 2: Typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

Expected: PASS (new file, no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add plugin/src/internal-types.ts
git commit -m "feat: create internal-types.ts for external library type interfaces"
```

---

### Task 6: Create `config-utils.ts` and replace `semver` with `semver-effect`

**Files:**

- Create: `plugin/src/config-utils.ts`
- Create: `plugin/__test__/config-utils.test.ts`
- Modify: `plugin/package.json`

Move all utility functions from `types.ts` to `config-utils.ts`. Replace
`semver` import with `semver-effect`.

- [ ] **Step 1: Install `semver-effect` and remove `semver`**

```bash
cd plugin && pnpm add semver-effect && pnpm remove semver @types/semver
```

- [ ] **Step 2: Create `config-utils.ts`**

Move these from `types.ts`:

**Exported functions:**

- `isVersionConfig` (line 1173)
- `isLoadedModel` (line 1182)
- `normalizeLlmsPluginConfig` (line 1189)
- `mergeLlmsPluginConfig` (line 1203)
- `extractPeerDependencies` (line 1249)
- `extractTypeUtilities` (line 1274)
- `extractAutoDetectedPackages` (line 1316)
- `resolvePackageVersionConflicts` (line 1373)
- `validateExternalPackages` (line 1458)

**Private (not exported):**

- `findHighestVersion` (line 1415)
- `TYPE_UTILITY_PACKAGES` constant (line 1233)

Update imports:

- Types from `"./schemas/index.js"` (`ExternalPackageSpec`, `LlmsPlugin`, `VersionConfig`)
- Types from `"./internal-types.js"` (`PackageJson`, `LoadedModel`)
- Replace `import semver from "semver"` with `import { SemVer, Range } from "semver-effect"`

The `findHighestVersion` function uses `semver.minVersion`, `semver.valid`,
and `semver.rcompare`. Replace with `semver-effect`:

```typescript
import { SemVer } from "semver-effect";
import { Effect } from "effect";

/**
 * Strip range prefixes (^, ~, >=, >, <=, <, =) from a version string
 * to extract the base version. e.g., "^3.22.4" → "3.22.4"
 */
function stripRangePrefix(version: string): string {
  return version.replace(/^[~^>=<]+\s*/, "");
}

function findHighestVersion(versions: string[]): string {
  const parsedVersions: Array<{ original: string; version: SemVer.SemVer }> = [];

  for (const version of versions) {
    // Strip range prefix and try to parse as a semver version
    const cleaned = stripRangePrefix(version);
    const result = Effect.runSyncExit(SemVer.fromString(cleaned));
    if (result._tag === "Success") {
      parsedVersions.push({ original: version, version: result.value });
    }
  }

  if (parsedVersions.length === 0) {
    return versions[versions.length - 1];
  }

  // Sort descending using SemVer comparison
  parsedVersions.sort((a, b) => {
    if (SemVer.gt(a.version, b.version)) return -1;
    if (SemVer.lt(a.version, b.version)) return 1;
    return 0;
  });

  return parsedVersions[0].original;
}
```

This replaces three `semver` APIs:

- `semver.minVersion(range)` → `stripRangePrefix(range)` + `SemVer.fromString`
- `semver.valid(version)` → `SemVer.fromString` (returns Effect, check exit)
- `semver.rcompare(a, b)` → `SemVer.gt` / `SemVer.lt` comparison

- [ ] **Step 3: Create `config-utils.test.ts`**

Copy the test content from `plugin/src/types.test.ts` to
`plugin/__test__/config-utils.test.ts`. Update imports:

- `ExternalPackageSpec` → `"../src/schemas/index.js"`
- `PackageJson` → `"../src/internal-types.js"`
- Utility functions → `"../src/config-utils.js"`

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run plugin/__test__/config-utils.test.ts`

Expected: All tests pass (same behavior, new location).

- [ ] **Step 5: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

- [ ] **Step 6: Commit**

```bash
git add plugin/src/config-utils.ts plugin/__test__/config-utils.test.ts plugin/package.json pnpm-lock.yaml
git commit -m "feat: create config-utils.ts, replace semver with semver-effect"
```

---

## Chunk 3: Migration

### Task 7: Update all consumer imports

**Files:**

- Modify: 16 files in `plugin/src/` (all files that import from `"./types.js"`)

Update every `import ... from "./types.js"` to import from the correct new
location. The mapping is:

**Schema-derived types** → `"./schemas/index.js"`:
`CategoryConfig`, `SourceConfig`, `ExternalPackageSpec`, `AutoDetectDependencies`,
`LlmsPlugin`, `ErrorConfig`, `VersionConfig`, `SingleApiConfig`, `MultiApiConfig`,
`PluginOptions`, `LogLevel`, `OpenGraphImageConfig`, `OpenGraphImageMetadata`,
`OpenGraphMetadata`, `PerformanceConfig`, `PerformanceThresholds`

**Internal types** → `"./internal-types.js"`:
`TypeResolutionCompilerOptions`, `TypeScriptConfig`, `TypeScriptConfigFields`,
`PackageJson`, `LoadedModel`

**Utility functions** → `"./config-utils.js"`:
`isVersionConfig`, `isLoadedModel`, `normalizeLlmsPluginConfig`,
`mergeLlmsPluginConfig`, `extractAutoDetectedPackages`,
`validateExternalPackages`, `extractPeerDependencies`, `extractTypeUtilities`,
`resolvePackageVersionConflicts`

**Constants** → `"./schemas/config.js"` or `"./schemas/index.js"`:
`DEFAULT_CATEGORIES`

**Renamed types** (update all references):

- `ApiExtractorPluginOptions` → `PluginOptions`
- `AutoDetectDependenciesOptions` → `AutoDetectDependencies`
- `LlmsPluginOptions` → `LlmsPlugin`

- [ ] **Step 1: Update each file**

Process each of the 16 files. For each:

1. Read the current imports from `"./types.js"`
2. Split into the correct new import sources
3. Apply type renames

The files and their imports (from the grep):

| File | Schema types | Internal types | Util functions |
| ---- | ------------ | -------------- | -------------- |
| `plugin.ts` | `CategoryConfig`, `ExternalPackageSpec`, `LlmsPlugin`, `LogLevel`, `MultiApiConfig`, `OpenGraphImageConfig`, `SingleApiConfig`, `SourceConfig`, `VersionConfig` | `PackageJson`, `TypeResolutionCompilerOptions` | `DEFAULT_CATEGORIES`, `extractAutoDetectedPackages`, `isVersionConfig`, `mergeLlmsPluginConfig`, `validateExternalPackages` |
| `build-stages.ts` | `CategoryConfig`, `LlmsPlugin`, `SourceConfig` | — | — |
| `category-resolver.ts` | `CategoryConfig`, `SourceConfig` | — | — |
| `loader.ts` | `CategoryConfig`, `SourceConfig` | — | — |
| `model-loader.ts` | `AutoDetectDependencies`, `CategoryConfig`, `ExternalPackageSpec`, `LlmsPlugin`, `OpenGraphImageConfig`, `SourceConfig`, `VersionConfig` | `LoadedModel`, `PackageJson` | `isLoadedModel`, `isVersionConfig` |
| `model-loader.test.ts` | `SourceConfig`, `VersionConfig` | `LoadedModel`, `PackageJson` | — |
| `og-resolver.ts` | `OpenGraphImageConfig`, `OpenGraphImageMetadata`, `OpenGraphMetadata` | — | — |
| `tsconfig-parser.ts` | — | `TypeResolutionCompilerOptions` | — |
| `typescript-config.ts` | — | `TypeResolutionCompilerOptions`, `TypeScriptConfig` | — |
| `twoslash-transformer.ts` | — | `TypeResolutionCompilerOptions` | — |
| `layers/ConfigServiceLive.ts` | `PluginOptions` | — | — |
| `index.ts` | Re-exports (see Task 8) | `LoadedModel` | `DEFAULT_CATEGORIES` |

Also update test files: `category-resolver.test.ts`, `loader.test.ts`,
`model-loader.test.ts`, `og-resolver.test.ts`, `typescript-config.test.ts`.

- [ ] **Step 2: Run all tests**

Run: `pnpm run test`

Expected: All tests pass (both old and new). The old `types.ts` still exists
at this point — both import paths work.

- [ ] **Step 3: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

**Note:** `exactOptionalPropertyTypes` may surface type errors in existing
code where `undefined` is explicitly assigned to optional properties. Fix
these by removing the explicit `undefined` assignment or using `?:` optional
syntax correctly.

- [ ] **Step 4: Commit**

```bash
git add plugin/src/
git commit -m "refactor: update all imports from types.js to schemas/internal-types/config-utils"
```

---

### Task 8: Update `index.ts` public API

**Files:**

- Modify: `plugin/src/index.ts`

- [ ] **Step 1: Update re-exports**

Replace `plugin/src/index.ts`:

```typescript
export { ApiExtractorPlugin } from "./plugin.js";

export type {
  PluginOptions as ApiExtractorPluginOptions,
  CategoryConfig,
  LogLevel,
  MultiApiConfig,
  OpenGraphImageConfig,
  OpenGraphImageMetadata,
  OpenGraphMetadata,
  SingleApiConfig,
  SourceConfig,
  VersionConfig,
} from "./schemas/index.js";

export type { LoadedModel } from "./internal-types.js";

export { DEFAULT_CATEGORIES } from "./schemas/config.js";
```

- [ ] **Step 2: Run all tests, lint, typecheck**

Run: `pnpm run test && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

- [ ] **Step 3: Commit**

```bash
git add plugin/src/index.ts
git commit -m "refactor: update public API re-exports to new locations"
```

---

### Task 9: Add Schema decode to plugin factory

**Files:**

- Modify: `plugin/src/plugin.ts`

- [ ] **Step 1: Add Schema.decodeUnknownSync at factory entry**

In `plugin/src/plugin.ts`, find the `ApiExtractorPlugin` function. Add
Schema decode as the first operation:

```typescript
import { Schema } from "effect";
import { PluginOptions } from "./schemas/index.js";

export function ApiExtractorPlugin(rawOptions: PluginOptions): RspressPlugin {
  // Validate options via Schema decode (catches all structural issues at once)
  // Note: cross-field validation (api vs apis, multiVersion matching)
  // stays in ConfigServiceLive since it needs RSPress config
  const options = Schema.decodeUnknownSync(PluginOptions)(rawOptions);
  // ... rest of factory
}
```

**Note:** The function parameter type is `PluginOptions` (the Schema-derived
type) for TypeScript's benefit, but the runtime decode catches invalid input
from JavaScript callers.

- [ ] **Step 2: Remove `validatePluginOptions` import and call**

In `plugin/src/plugin.ts`:

1. Remove `import { validatePluginOptions } from "./config-validation.js"` (line 16)
2. Remove the call `validatePluginOptions(options, _config as ...)` (line 852, inside the `config()` hook)

The cross-field validation that `validatePluginOptions` performed (api vs
apis mutual exclusion, multiVersion matching) stays in `ConfigServiceLive`
and runs during `beforeBuild` when RSPress config is available. The Schema
decode handles structural validation.

- [ ] **Step 3: Run all tests**

Run: `pnpm run test`

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add plugin/src/plugin.ts
git commit -m "feat: add Schema.decodeUnknownSync validation, remove imperative validatePluginOptions"
```

---

## Chunk 4: Delete Old Files

### Task 10: Delete `types.ts`, `config-validation.ts`, and old tests

**Files:**

- Delete: `plugin/src/types.ts`
- Delete: `plugin/src/types.test.ts`
- Delete: `plugin/src/config-validation.ts`
- Delete: `plugin/src/config-validation.test.ts`

- [ ] **Step 1: Verify no remaining imports from `types.js`**

```bash
grep -rn "from [\"']\.\/types" plugin/src/ --include="*.ts"
```

Expected: No matches.

- [ ] **Step 2: Verify no remaining imports from `config-validation.js`**

```bash
grep -rn "from [\"']\.\/config-validation" plugin/src/ --include="*.ts"
```

Expected: No matches.

- [ ] **Step 3: Delete files**

```bash
git rm plugin/src/types.ts plugin/src/types.test.ts plugin/src/config-validation.ts plugin/src/config-validation.test.ts
```

- [ ] **Step 4: Run all tests**

Run: `pnpm run test`

Expected: All remaining tests pass. Test count decreases (removed
`types.test.ts` and `config-validation.test.ts`).

- [ ] **Step 5: Lint and typecheck**

Run: `$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint && $SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=typecheck`

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor: delete types.ts and config-validation.ts (replaced by schemas)"
```

---

## Chunk 5: Verification

### Task 11: Full regression verification

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

- [ ] **Step 4: Verify deleted files are gone**

```bash
for f in plugin/src/types.ts plugin/src/config-validation.ts; do
  ls "$f" 2>/dev/null && echo "FAIL: $f still exists" || echo "OK: $f deleted"
done
```

- [ ] **Step 5: Verify no `semver` import remains**

```bash
grep -rn "from [\"']semver[\"']" plugin/src/ --include="*.ts" && echo "FAIL" || echo "OK: semver replaced"
```

- [ ] **Step 6: Verify schema files exist**

```bash
ls plugin/src/schemas/config.ts plugin/src/schemas/opengraph.ts plugin/src/schemas/performance.ts plugin/src/schemas/index.ts
```

Expected: All 4 files exist.

- [ ] **Step 7: Verify Schema decode is in plugin factory**

```bash
grep "decodeUnknownSync" plugin/src/plugin.ts
```

Expected: Match found.
