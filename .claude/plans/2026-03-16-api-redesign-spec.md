# API Redesign: Single/Multi Mode with Versioning & i18n

**Date:** 2026-03-16
**Status:** Approved

## Overview

Redesign the plugin's top-level configuration API to cleanly separate two
mutually exclusive modes:

- **Single-API mode** (`api` field) — one package per site, supports RSPress
  native multiVersion and i18n
- **Multi-API mode** (`apis` field) — multiple packages on one site, no
  versioning support

The plugin derives output paths automatically from RSPress config (`root`,
`locales`, `multiVersion`) instead of requiring user-specified `docsDir`.

## Goals

- Clean separation between single-package sites and multi-package portals
- Native RSPress multiVersion support (site-wide versioning)
- i18n support via RSPress locales (auto-detected, not user-configured)
- Derived output paths — less config, fewer mistakes
- Clear validation errors for invalid combinations

## Top-Level Plugin Options

```typescript
interface ApiExtractorPluginOptions {
  // Mode A: Single API (supports multiVersion + i18n)
  api?: SingleApiConfig;

  // Mode B: Multiple APIs (no versioning)
  apis?: MultiApiConfig[];

  // Global options
  siteUrl?: string;
  ogImage?: OpenGraphImageConfig;
  defaultCategories?: Record<string, CategoryConfig>;
  errors?: ErrorConfig;
  llmsPlugin?: boolean | LlmsPluginOptions;
  logLevel?: LogLevel;
  performance?: PerformanceConfig;
  logFile?: string;
}
```

Providing both `api` and `apis` is a validation error. Providing neither is
also an error. `tsconfig` and `compilerOptions` are per-API only (not global).

## SingleApiConfig

```typescript
interface SingleApiConfig {
  /** Package name for display purposes */
  packageName: string;

  /**
   * Base route path. Defaults to "/".
   * API docs appear at {baseRoute}/{apiFolder}/...
   */
  baseRoute?: string;

  /** Subfolder for API docs. Defaults to "api". Null for flat routes. */
  apiFolder?: string | null;

  /**
   * Human-readable display name for page titles.
   * e.g., "My Library SDK". If omitted, packageName is used.
   */
  name?: string;

  /**
   * Path to .api.json file. Required for non-versioned sites.
   * When multiVersion is active, this field is ignored — each version
   * must provide its own model via the versions map.
   */
  model?: PathLike | (() => Promise<ApiModel | LoadedModel>);

  /** Path to package.json for type loading */
  packageJson?: PathLike | (() => Promise<PackageJson>);

  /**
   * Per-version overrides. Required when RSPress multiVersion is active.
   * Keys must exactly match config.multiVersion.versions (no extra, no missing).
   * Each version must provide a model. Other fields inherit from parent.
   * When multiVersion is not active, this field is ignored with a warning.
   * Accepts full VersionConfig or shorthand path/loader for model-only.
   */
  versions?: Record<string, PathLike | (() => Promise<ApiModel | LoadedModel>) | VersionConfig>;

  // Shared per-API options
  theme?: string | { light: string; dark: string } | Record<string, unknown>;
  categories?: Record<string, CategoryConfig>;
  source?: SourceConfig;
  externalPackages?: ExternalPackageSpec[];
  autoDetectDependencies?: AutoDetectDependenciesOptions;
  ogImage?: OpenGraphImageConfig;
  llmsPlugin?: LlmsPluginOptions;
  tsconfig?: PathLike | (() => Promise<TypeResolutionCompilerOptions>);
  compilerOptions?: TypeResolutionCompilerOptions;
}
```

## MultiApiConfig

```typescript
interface MultiApiConfig {
  /** Package name for display purposes */
  packageName: string;

  /**
   * Human-readable display name for page titles.
   * e.g., "My Library SDK". If omitted, packageName is used.
   */
  name?: string;

  /**
   * Base route path. Defaults to unscoped packageName.
   * "@spencerbeggs/foobar" -> "/foobar"
   */
  baseRoute?: string;

  /** Subfolder for API docs. Defaults to "api". Null for flat routes. */
  apiFolder?: string | null;

  /** Path to .api.json file */
  model: PathLike | (() => Promise<ApiModel | LoadedModel>);

  /** Path to package.json for type loading */
  packageJson?: PathLike | (() => Promise<PackageJson>);

  // Same shared per-API options
  theme?: string | { light: string; dark: string } | Record<string, unknown>;
  categories?: Record<string, CategoryConfig>;
  source?: SourceConfig;
  externalPackages?: ExternalPackageSpec[];
  autoDetectDependencies?: AutoDetectDependenciesOptions;
  ogImage?: OpenGraphImageConfig;
  llmsPlugin?: LlmsPluginOptions;
  tsconfig?: PathLike | (() => Promise<TypeResolutionCompilerOptions>);
  compilerOptions?: TypeResolutionCompilerOptions;
}
```

No `versions` field. Versioning does not exist in multi-API mode.

## VersionConfig

Only exists within `SingleApiConfig.versions`:

```typescript
interface VersionConfig {
  /** Path to .api.json file for this version */
  model: PathLike | (() => Promise<ApiModel | LoadedModel>);

  /** Version-specific overrides (all optional, inherit from parent) */
  packageJson?: PathLike | (() => Promise<PackageJson>);
  categories?: Record<string, CategoryConfig>;
  source?: SourceConfig;
  externalPackages?: ExternalPackageSpec[];
  autoDetectDependencies?: AutoDetectDependenciesOptions;
  ogImage?: OpenGraphImageConfig;
  llmsPlugin?: LlmsPluginOptions;
  tsconfig?: PathLike | (() => Promise<TypeResolutionCompilerOptions>);
  compilerOptions?: TypeResolutionCompilerOptions;
}
```

Cascade: global plugin options -> SingleApiConfig -> VersionConfig.

## Path Derivation

The plugin reads RSPress config and computes output paths automatically.

**Inputs from RSPress:**

- `config.root` — docs root directory (default: `"docs"`)
- `config.locales` — locale array (if i18n enabled)
- `config.lang` — default locale (prefix stripped from routes)
- `config.multiVersion` — `{ default, versions }` (if versioning enabled)

**Path patterns:**

| multiVersion | i18n | Output path |
|---|---|---|
| No | No | `{root}/{baseRoute}/{apiFolder}/` |
| No | Yes | `{root}/{locale}/{baseRoute}/{apiFolder}/` |
| Yes | No | `{root}/{version}/{baseRoute}/{apiFolder}/` |
| Yes | Yes | `{root}/{version}/{locale}/{baseRoute}/{apiFolder}/` |

For single-API mode with `baseRoute: "/"`, the baseRoute segment is omitted.

For multi-API mode, `baseRoute` defaults to the unscoped `packageName`
(e.g., `@spencerbeggs/foobar` -> `/foobar`).

Multi-API mode supports i18n (auto-detected from RSPress locales). Path
pattern: `{root}/{locale}/{baseRoute}/{apiFolder}/`. Versioning is the
only feature exclusive to single-API mode.

## Startup Validation

- `api` + `apis` both present -> error
- Neither `api` nor `apis` present -> error
- `apis` + `config.multiVersion` active -> error (versioning incompatible
  with multi-API mode)
- `api.versions` present but `config.multiVersion` not configured -> warning
  (versions ignored)
- `config.multiVersion` active but `api.versions` missing -> error
- `config.multiVersion.versions` has entries not in `api.versions` -> error
- `api.versions` has keys not in `config.multiVersion.versions` -> error
- `api.model` provided without `config.multiVersion` -> required (used as
  the sole model)
- `api.model` provided with `config.multiVersion` -> ignored (each version
  must specify its own model)

**baseRoute normalization:** Leading slashes are added if missing, trailing
slashes are stripped. `"foobar"` becomes `"/foobar"`, `"/foobar/"` becomes
`"/foobar"`.

**Category merge strategy:** Shallow merge — per-version `categories`
replaces the parent's entire categories map for that version. To add a
single category, the version must re-declare all categories it wants.

## Example Configurations

**Simplest case — single package, no versioning, no i18n:**

```typescript
ApiExtractorPlugin({
  api: {
    packageName: "my-lib",
    model: "path/to/my-lib.api.json",
  },
})
// Output: docs/api/...
// Routes: /api/class/Foo
```

**Single package with RSPress multiVersion:**

```typescript
defineConfig({
  multiVersion: { default: "v2", versions: ["v1", "v2"] },
  plugins: [
    ApiExtractorPlugin({
      api: {
        packageName: "my-lib",
        model: "path/to/v2/my-lib.api.json",
        versions: {
          v1: { model: "path/to/v1/my-lib.api.json" },
          v2: { model: "path/to/v2/my-lib.api.json" },
        },
      },
    }),
  ],
})
// Output: docs/v1/api/..., docs/v2/api/...
// Routes: /api/class/Foo (v2 default), /v1/api/class/Foo
```

**Single package with i18n + multiVersion:**

```typescript
defineConfig({
  lang: "en",
  locales: [
    { lang: "en", label: "English" },
    { lang: "zh", label: "中文" },
  ],
  multiVersion: { default: "v2", versions: ["v1", "v2"] },
  plugins: [
    ApiExtractorPlugin({
      api: {
        packageName: "my-lib",
        model: "path/to/v2/my-lib.api.json",
        versions: {
          v1: { model: "path/to/v1/my-lib.api.json" },
          v2: { model: "path/to/v2/my-lib.api.json" },
        },
      },
    }),
  ],
})
// Output: docs/v1/en/api/..., docs/v1/zh/api/..., docs/v2/en/api/...
// Routes: /api/class/Foo (v2+en defaults), /zh/api/..., /v1/api/..., etc.
```

**Multi-API documentation portal:**

```typescript
ApiExtractorPlugin({
  apis: [
    {
      packageName: "@spencerbeggs/foobar",
      model: "lib/packages/foobar/foobar.api.json",
      packageJson: "lib/packages/foobar/package.json",
    },
    {
      packageName: "@spencerbeggs/bazqux",
      baseRoute: "/packages/bazqux",
      model: "lib/packages/bazqux/bazqux.api.json",
    },
  ],
})
// Output: docs/foobar/api/..., docs/packages/bazqux/api/...
// Routes: /foobar/api/class/Foo, /packages/bazqux/api/class/Bar
```

## Migration & Breaking Changes

Pre-1.0, breaking changes are acceptable.

**Removed:**

- `VersionedApiModelConfig` — replaced by `SingleApiConfig.versions`
- `docsDir` field — derived automatically from RSPress config
- Top-level `tsconfig` and `compilerOptions` — per-API only

**Changed:**

- `apis` field type: was `ApiModelConfig | VersionedApiModelConfig | Array<...>`,
  now `MultiApiConfig[]` (array only, no versioning)
- `name` field: preserved on both `SingleApiConfig` and `MultiApiConfig`
  (was on `ApiModelConfig` and `VersionedApiModelConfig`)
- `versions` value type: accepts shorthand `PathLike | loader` in addition
  to full `VersionConfig` (preserves current ergonomics)

**Added:**

- `api` field for single-API mode
- Automatic path derivation from RSPress config
- Startup validation for mode conflicts

**Unchanged:**

- All shared per-API fields (theme, categories, source, etc.)
- `VersionConfig` interface (scoped to single-API mode)
- Global options (siteUrl, ogImage, logLevel, etc.)
- Runtime components, page generators, snapshot tracking
- Everything downstream of config parsing

## Implementation Scope

The change is isolated to config parsing and path computation:

- `types.ts` — rewrite config interfaces
- `plugin.ts` — update config parsing, path derivation, validation
- `docs-site/rspress.config.ts` — update to new `api` field

Page generation, markdown output, runtime components, and all downstream
code stays the same.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| API shape | `api` vs `apis` discriminated union | Explicit, TypeScript-friendly |
| Versioning | Single-API only, via RSPress multiVersion | Site-wide versioning can't mix with multi-API |
| i18n | Auto-detected from RSPress locales config | No plugin config needed |
| docsDir | Derived, not user-specified | Less config, fewer path mistakes |
| baseRoute default (single) | `"/"` | Whole site is the package |
| baseRoute default (multi) | Unscoped packageName | Short, clean URLs |
| apiFolder default | `"api"` | Separates generated docs from hand-written content |
| tsconfig location | Per-API only, not global | No reason for a global default |
