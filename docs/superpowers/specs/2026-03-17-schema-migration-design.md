# Schema Migration Design

## Overview

Replace the 1,488-line `types.ts` with Effect Schema definitions, eliminating
manual type/interface maintenance and imperative validation. Schemas provide
runtime decode/encode plus automatic TypeScript type derivation.

### Goals

- Define plugin configuration as Effect Schemas with runtime validation
- Derive TypeScript types automatically from schemas (single source of truth)
- Replace `config-validation.ts` with `Schema.decodeUnknownSync` at factory time
- Split `types.ts` into focused files: schemas, internal types, config utilities
- Enable encode support for serializing validated config

### Non-Goals

- Schema-ifying internal types that reference external library enums
  (`TypeResolutionCompilerOptions`, `ApiItemKind`)
- Migrating `DEFAULT_CATEGORIES` to Effect `Config` providers
- Changing the plugin's public configuration API surface

### Constraints

- `PathLike | (() => Promise<...>)` fields use `Schema.declare` with predicate
  (not structurally validated, but typed correctly)
- `@effect/platform` used for file I/O internally; paths are `string` in schemas
- No backward compatibility shims needed (no prior release)
- Companion repo pattern: schema constant + derived type share the same name
- `exactOptionalPropertyTypes` is enabled in `tsconfig.json` (required by
  Effect docs for correct Schema behavior). This may surface type errors in
  existing code where `undefined` is assigned to optional properties — these
  must be fixed during the migration.

### Type Renames

These internal type names change (no backward compat needed):

| Old Name | New Name | Reason |
| -------- | -------- | ------ |
| `ApiExtractorPluginOptions` | `PluginOptions` | Shorter; re-exported as `ApiExtractorPluginOptions` in public API |
| `AutoDetectDependenciesOptions` | `AutoDetectDependencies` | Drop "Options" suffix (Schema is the definition, not an options bag) |
| `LlmsPluginOptions` | `LlmsPlugin` | Drop "Options" suffix |

All 18 consumer files must be updated to use the new names.

## Decisions Record

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Schema scope | User-facing config types only | Internal types with external library enums don't benefit from runtime validation |
| File organization | `src/schemas/` with grouped files | Related config schemas reference each other; avoids circular imports |
| `types.ts` fate | Split into 3 files, delete original | No backward compat needed (greenfield) |
| `PathLike` fields | `Schema.declare` with predicate | Preserves TypeScript type, skips structural validation for opaque types |
| `DEFAULT_CATEGORIES` | Plain constant in `src/schemas/config.ts` | Not decoded from user input; Schema defaults handle individual field defaults |
| Validation | `Schema.decodeUnknownSync` + ConfigService cross-validation | Structural issues caught at factory time; cross-field logic stays in ConfigService |
| `SourceConfig` | Named schema (not plain interface) | Used in `VersionConfig.source`, `SingleApiConfig.source`, `MultiApiConfig.source` — shared schema avoids type incompatibility |
| Type renames | `AutoDetectDependenciesOptions` → `AutoDetectDependencies`, `LlmsPluginOptions` → `LlmsPlugin`, `ApiExtractorPluginOptions` → `PluginOptions` | Shorter names; no backward compat needed. All 18 consumer files updated. |
| Deprecated `logFile` | Removed from schema | No prior release; dead field with no implementation behind it |
| `semver` dependency | Replace with `semver-effect` | Companion repo at `../semver-effect`, published on npm. Effect-native semver operations for `resolvePackageVersionConflicts` and `findHighestVersion` in config-utils. |

## File Structure

### New Files

| File | Contents | ~Lines |
| ---- | -------- | ------ |
| `src/schemas/config.ts` | `ExternalPackageSpec`, `AutoDetectDependencies`, `CategoryConfig`, `LlmsPlugin`, `ErrorConfig`, `VersionConfig`, `SingleApiConfig`, `MultiApiConfig`, `PluginOptions`, `LogLevel` schemas + `DEFAULT_CATEGORIES` constant | ~300 |
| `src/schemas/opengraph.ts` | `OpenGraphImageMetadata`, `OpenGraphImageConfig`, `OpenGraphMetadata` schemas | ~80 |
| `src/schemas/performance.ts` | `PerformanceThresholds`, `PerformanceConfig` schemas | ~60 |
| `src/schemas/index.ts` | Re-exports all schemas and derived types | ~20 |
| `src/internal-types.ts` | `TypeResolutionCompilerOptions`, `TypeScriptConfig`, `TypeScriptConfigFields`, `PackageJson`, `LoadedModel` — plain interfaces with external library types | ~100 |
| `src/config-utils.ts` | Utility functions: `normalizeLlmsPluginConfig`, `mergeLlmsPluginConfig`, `extractPeerDependencies`, `extractAutoDetectedPackages`, `resolvePackageVersionConflicts`, `validateExternalPackages`, `findHighestVersion`, `isVersionConfig`, `isLoadedModel`. Semver operations use `semver-effect` instead of `semver`. | ~290 |

### Deleted Files

| File | Reason |
| ---- | ------ |
| `src/types.ts` | Split into schemas/, internal-types.ts, config-utils.ts |
| `src/config-validation.ts` | Replaced by Schema.decodeUnknownSync at factory time |

### Modified Files

18 files update their imports from `"./types.js"` to the appropriate new
location:

- Schema-derived types → `"./schemas/index.js"`
- Internal types → `"./internal-types.js"`
- Utility functions → `"./config-utils.js"`

`src/index.ts` (public API) updates re-exports to point at new locations.

## Schema Definitions

### Pattern

Following the companion repo pattern (`type-registry-effect`), each schema
exports the Schema constant and its derived type with the same name:

```typescript
import { Schema } from "effect";

export const ExternalPackageSpec = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
});
export type ExternalPackageSpec = Schema.Schema.Type<typeof ExternalPackageSpec>;
```

### Opaque Type Pattern

For fields that accept `PathLike | (() => Promise<...>)`, use
`Schema.declare` with a runtime predicate. This gives correct TypeScript
type inference without structural validation:

```typescript
const ModelInput = Schema.declare(
  (input): input is string | Function | URL =>
    typeof input === "string" ||
    typeof input === "function" ||
    input instanceof URL,
);
```

### Schema Defaults

`CategoryConfig` uses `Schema.optionalWith` for fields with defaults:

```typescript
export const CategoryConfig = Schema.Struct({
  displayName: Schema.String,
  singularName: Schema.String,
  folderName: Schema.String,
  itemKinds: Schema.optional(Schema.Array(Schema.Number)),
  tsdocModifier: Schema.optional(Schema.String),
  collapsible: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  collapsed: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  overviewHeaders: Schema.optionalWith(
    Schema.Array(Schema.Number),
    { default: () => [2] },
  ),
});
export type CategoryConfig = Schema.Schema.Type<typeof CategoryConfig>;
```

### Config Schemas (`src/schemas/config.ts`)

#### Leaf Schemas

```typescript
export const LogLevel = Schema.Literal("none", "info", "verbose", "debug");
export type LogLevel = Schema.Schema.Type<typeof LogLevel>;

export const ExternalPackageSpec = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  tsconfig: Schema.optional(ModelInput),
  compilerOptions: Schema.optional(Schema.Unknown),
});
export type ExternalPackageSpec = Schema.Schema.Type<typeof ExternalPackageSpec>;

export const AutoDetectDependencies = Schema.Struct({
  dependencies: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  devDependencies: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  peerDependencies: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  autoDependencies: Schema.optionalWith(Schema.Boolean, { default: () => true }),
});
export type AutoDetectDependencies = Schema.Schema.Type<typeof AutoDetectDependencies>;

export const ErrorConfig = Schema.Struct({
  example: Schema.optional(Schema.Literal("suppress", "show")),
});
export type ErrorConfig = Schema.Schema.Type<typeof ErrorConfig>;

export const LlmsPlugin = Schema.Struct({
  enabled: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  showCopyButton: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  showViewOptions: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  copyButtonText: Schema.optionalWith(Schema.String, { default: () => "Copy Markdown" }),
  viewOptions: Schema.optionalWith(
    Schema.Array(Schema.Literal("markdownLink", "chatgpt", "claude")),
    { default: () => ["markdownLink", "chatgpt", "claude"] as const },
  ),
});
export type LlmsPlugin = Schema.Schema.Type<typeof LlmsPlugin>;
```

The `CategoryConfig` schema is as shown in the Schema Defaults section above.

#### Theme Schema

```typescript
const ThemeConfig = Schema.Union(
  Schema.String,
  Schema.Struct({ light: Schema.String, dark: Schema.String }),
  Schema.Record({ key: Schema.String, value: Schema.Unknown }),
);
```

#### SourceConfig Schema

`SourceConfig` is a named schema (not a plain interface) because it's used
by `VersionConfig`, `SingleApiConfig`, and `MultiApiConfig`:

```typescript
export const SourceConfig = Schema.Struct({
  url: Schema.String,
  ref: Schema.optional(Schema.String),
});
export type SourceConfig = Schema.Schema.Type<typeof SourceConfig>;
```

Note: `SourceConfig` moves FROM `internal-types.ts` INTO `schemas/config.ts`
since it has no external library type references and is used in schema
composition. The public API (`index.ts`) re-exports it from schemas.

#### Categories Record Schema

Reusable record of category configs:

```typescript
const CategoriesRecord = Schema.Record({
  key: Schema.String,
  value: CategoryConfig,
});
```

#### Composite Schemas

##### VersionConfig

```typescript
export const VersionConfig = Schema.Struct({
  model: ModelInput,
  packageJson: Schema.optional(ModelInput),
  categories: Schema.optional(CategoriesRecord),
  source: Schema.optional(SourceConfig),
  externalPackages: Schema.optional(Schema.Array(ExternalPackageSpec)),
  autoDetectDependencies: Schema.optional(AutoDetectDependencies),
  ogImage: Schema.optional(OpenGraphImageConfig),
  llmsPlugin: Schema.optional(LlmsPlugin),
  tsconfig: Schema.optional(ModelInput),
  compilerOptions: Schema.optional(Schema.Unknown),
});
export type VersionConfig = Schema.Schema.Type<typeof VersionConfig>;
```

##### SingleApiConfig

```typescript
const VersionValue = Schema.Union(ModelInput, VersionConfig);

export const SingleApiConfig = Schema.Struct({
  packageName: Schema.String,
  name: Schema.optional(Schema.String),
  baseRoute: Schema.optional(Schema.String),
  apiFolder: Schema.optional(Schema.Union(Schema.String, Schema.Null)),
  model: Schema.optional(ModelInput),
  packageJson: Schema.optional(ModelInput),
  versions: Schema.optional(Schema.Record({
    key: Schema.String,
    value: VersionValue,
  })),
  theme: Schema.optional(ThemeConfig),
  categories: Schema.optional(CategoriesRecord),
  source: Schema.optional(SourceConfig),
  externalPackages: Schema.optional(Schema.Array(ExternalPackageSpec)),
  autoDetectDependencies: Schema.optional(AutoDetectDependencies),
  ogImage: Schema.optional(OpenGraphImageConfig),
  llmsPlugin: Schema.optional(LlmsPlugin),
  tsconfig: Schema.optional(ModelInput),
  compilerOptions: Schema.optional(Schema.Unknown),
});
export type SingleApiConfig = Schema.Schema.Type<typeof SingleApiConfig>;
```

Key differences from `VersionConfig`:

- `model` is optional (required when no `multiVersion`, but cross-field
  validation handles this in ConfigService)
- `versions` field: `Record<string, ModelInput | VersionConfig>` — the
  complex union allowing path strings, loader functions, or full version
  configs
- `name`, `baseRoute`, `apiFolder`, `theme` fields present
- `apiFolder` accepts `string | null` (null = output to base route directly)

##### MultiApiConfig

```typescript
export const MultiApiConfig = Schema.Struct({
  packageName: Schema.String,
  name: Schema.optional(Schema.String),
  baseRoute: Schema.optional(Schema.String),
  apiFolder: Schema.optional(Schema.Union(Schema.String, Schema.Null)),
  model: ModelInput,  // REQUIRED (not optional)
  packageJson: Schema.optional(ModelInput),
  theme: Schema.optional(ThemeConfig),
  categories: Schema.optional(CategoriesRecord),
  source: Schema.optional(SourceConfig),
  externalPackages: Schema.optional(Schema.Array(ExternalPackageSpec)),
  autoDetectDependencies: Schema.optional(AutoDetectDependencies),
  ogImage: Schema.optional(OpenGraphImageConfig),
  llmsPlugin: Schema.optional(LlmsPlugin),
  tsconfig: Schema.optional(ModelInput),
  compilerOptions: Schema.optional(Schema.Unknown),
});
export type MultiApiConfig = Schema.Schema.Type<typeof MultiApiConfig>;
```

Key differences from `SingleApiConfig`:

- `model` is **required** (each multi-API entry must have its own model)
- No `versions` field (multi-API mode does not support versioning)

#### Top-Level Schema

```typescript
export const PluginOptions = Schema.Struct({
  api: Schema.optional(SingleApiConfig),
  apis: Schema.optional(Schema.Array(MultiApiConfig)),
  siteUrl: Schema.optional(Schema.String),
  ogImage: Schema.optional(OpenGraphImageConfig),
  defaultCategories: Schema.optional(Schema.Record({
    key: Schema.String,
    value: CategoryConfig,
  })),
  errors: Schema.optional(ErrorConfig),
  llmsPlugin: Schema.optional(Schema.Union(Schema.Boolean, LlmsPlugin)),
  logLevel: Schema.optional(LogLevel),
  performance: Schema.optional(PerformanceConfig),
});
export type PluginOptions = Schema.Schema.Type<typeof PluginOptions>;
```

### OpenGraph Schemas (`src/schemas/opengraph.ts`)

```typescript
export const OpenGraphImageMetadata = Schema.Struct({
  url: Schema.String,
  secureUrl: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
  alt: Schema.optional(Schema.String),
});
export type OpenGraphImageMetadata = Schema.Schema.Type<typeof OpenGraphImageMetadata>;

export const OpenGraphImageConfig = Schema.Union(
  Schema.String,
  OpenGraphImageMetadata,
);
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

### Performance Schemas (`src/schemas/performance.ts`)

```typescript
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

## Validation Strategy

### Factory-Time Decode

In `ApiExtractorPlugin()`, replace imperative validation with Schema decode:

```typescript
export function ApiExtractorPlugin(rawOptions: unknown): RspressPlugin {
  const options = Schema.decodeUnknownSync(PluginOptions)(rawOptions);
  // options is now fully typed and validated
}
```

This catches all structural violations at once via `ParseError` (instead of
the current imperative approach that stops at the first error).

### Cross-Field Validation

Validations that require comparing multiple fields stay in `ConfigServiceLive`
as Effect programs:

- `api` vs `apis` mutual exclusion
- `api.versions` must match `multiVersion.versions`
- `api.model` required when no `multiVersion`

These run during `beforeBuild` when both plugin options and RSPress config
are available.

## Internal Types (`src/internal-types.ts`)

Plain interfaces for types with external library references:

```typescript
import type { PathLike } from "node:fs";
import type { ApiModel } from "@microsoft/api-extractor-model";
import type ts from "typescript";

export interface TypeResolutionCompilerOptions {
  target?: ts.ScriptTarget;
  module?: ts.ModuleKind;
  moduleResolution?: ts.ModuleResolutionKind;
  lib?: string[];
  types?: string[];
  typeRoots?: string[];
  strict?: boolean;
  skipLibCheck?: boolean;
  esModuleInterop?: boolean;
  allowSyntheticDefaultImports?: boolean;
  jsx?: ts.JsxEmit;
}

export interface TypeScriptConfig {
  tsconfig?: PathLike | (() => Promise<TypeResolutionCompilerOptions>);
  compilerOptions?: TypeResolutionCompilerOptions;
}

export interface TypeScriptConfigFields {
  tsconfig?: PathLike | (() => Promise<TypeResolutionCompilerOptions>);
  compilerOptions?: TypeResolutionCompilerOptions;
}

export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface LoadedModel {
  model: ApiModel;
  source?: import("./schemas/index.js").SourceConfig;
}
```

Note: `SourceConfig` is NOT in this file — it's a named schema in
`src/schemas/config.ts` since it has no external library type references.
`LoadedModel.source` references it via import.

## Config Utils (`src/config-utils.ts`)

All utility functions move here with updated imports:

**Exported functions:**

- `isVersionConfig` — type guard (may be replaceable by Schema decode)
- `isLoadedModel` — type guard
- `normalizeLlmsPluginConfig` — config normalization
- `mergeLlmsPluginConfig` — config merging with precedence
- `extractPeerDependencies` — dependency extraction
- `extractTypeUtilities` — type utility detection
- `extractAutoDetectedPackages` — auto-detect from package.json
- `resolvePackageVersionConflicts` — semver-based dedup
- `validateExternalPackages` — conflict detection

**Private (not exported):**

- `findHighestVersion` — semver comparison helper (used by `resolvePackageVersionConflicts`)
- `TYPE_UTILITY_PACKAGES` — constant array `["type-fest", "ts-extras"]`

These functions import types from both `./schemas/index.js` (for
`ExternalPackageSpec`, `LlmsPlugin`, etc.) and `./internal-types.js` (for
`PackageJson`).

## Public API (`src/index.ts`)

Updates to re-export from new locations:

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

export type {
  LoadedModel,
} from "./internal-types.js";

export { DEFAULT_CATEGORIES } from "./schemas/config.js";
```

Note: `PluginOptions` is re-exported as `ApiExtractorPluginOptions` to
preserve the public API name.

## Testing

### Schema Tests (`__test__/schemas.test.ts`)

Test decode/encode for each schema:

- Valid inputs decode successfully with correct types
- Invalid inputs produce `ParseError` with descriptive messages
- Default values are applied for `optionalWith` fields
- `Schema.declare` fields accept strings, functions, and URLs
- `Schema.declare` fields reject numbers, objects, etc.

### Config Validation Tests

The 12 tests from `config-validation.test.ts` migrate to:

- **Structural tests** → `__test__/schemas.test.ts` (decode failures for
  missing required fields, invalid types)
- **Cross-field tests** → existing `ConfigServiceLive` tests (mutual
  exclusion, multiVersion matching)

### Config Utils Tests

`types.test.ts` (dependency extraction tests) migrates to
`config-utils.test.ts` with updated imports.

## Migration Order

1. Create `src/schemas/` with all schema definitions + tests
2. Create `src/internal-types.ts` with plain interfaces
3. Create `src/config-utils.ts` with utility functions
4. Update all 18 consumer files to import from new locations
5. Update `src/index.ts` public API re-exports
6. Update `plugin.ts` factory to use `Schema.decodeUnknownSync`
7. Delete `src/types.ts`, `src/config-validation.ts`
8. Migrate tests: `config-validation.test.ts` → schemas + ConfigService,
   `types.test.ts` → `config-utils.test.ts`
