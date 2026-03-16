# Test Infrastructure Expansion

**Date:** 2026-03-16
**Status:** Approved

## Overview

Expand the monorepo's test infrastructure from one example module and one
test site to three modules and four sites, covering single-API, multi-API,
multiVersion, and i18n configurations.

## Folder Structure

```text
plugin/                    # Published package (unchanged)
modules/
  kitchensink/             # Renamed from example-module/. Full API Extractor coverage.
  versioned-v1/            # Lightweight module, "v1" of a versioned package
  versioned-v2/            # Same published name, breaking changes from v1
sites/
  basic/                   # Renamed from docs-site/. Single API, no versions, no i18n.
  versioned/               # Single API + multiVersion (v1, v2)
  i18n/                    # Single API + i18n (en, zh stub)
  multi/                   # Multi-API portal (kitchensink + versioned-v1)
```

## Workspace Configuration

`pnpm-workspace.yaml`:

```yaml
packages:
  - plugin
  - modules/*
  - sites/*
```

Root `tsconfig.json` references: `plugin`, `modules/kitchensink`,
`modules/versioned-v1`, `modules/versioned-v2`. Sites excluded (RSPress
handles its own TS compilation).

## Modules

### modules/kitchensink

Renamed from `example-module/`. Full API Extractor feature coverage:
enums, interfaces, classes, functions, namespaces, type aliases, variables.
Package name changes from `example-module` to `kitchensink`.

Uses `@savvy-web/rslib-builder` with `apiModel: true`.

### modules/versioned-v1

Lightweight module with a small API:

- `Config` interface with a few fields
- `createApp()` function
- `Logger` class with `log()`, `warn()`, `error()`
- `LogLevel` enum
- `Plugin` type alias

Source `package.json` name: `versioned-v1`. The rslib-builder `transform`
function rewrites this to `versioned-module` in the **output `package.json`**
so the plugin sees both versions as the same package. Note: the `.api.json`
filename is derived from the source name (e.g., `versioned-v1.api.json`),
not the transformed name, since API Extractor runs before the transform.

```typescript
export default NodeLibraryBuilder.create({
  apiModel: true,
  transform({ pkg }) {
    pkg.name = "versioned-module";
    delete pkg.devDependencies;
    delete pkg.scripts;
    return pkg;
  },
});
```

### modules/versioned-v2

Same published package name (`versioned-module`), breaking changes from v1:

- `Config` interface: fields renamed/removed, new fields added
- `createApp()` signature changed (new required parameter)
- `Logger` class: `log()` removed, replaced with `info()`. New `setLevel()`
- `LogLevel` enum: new members added, one removed
- `Plugin` type alias: changed shape
- New: `Middleware` interface (didn't exist in v1)
- No item survives unchanged from v1 (true breaking release)

Same rslib-builder config as v1 with `pkg.name = "versioned-module"`.

## Sites

All sites are private RSPress workspaces with:

- `package.json` (private, depends on `rspress-plugin-api-extractor`
  workspace)
- `rspress.config.ts`
- `turbo.json` (build depends on `^build`)
- `tsconfig.json`
- `lib/scripts/dev.mts` + `preview.mts` (auto-open browser)
- `docs/index.md` (landing page)

Sites are **excluded from default `pnpm run build`** — they only build
when explicitly targeted via `pnpm --filter <site> run build` or the
dev/preview scripts.

Dev/preview scripts are identical boilerplate across all sites (copied from
the current `docs-site/lib/scripts/`). Each uses port 4173 by default,
configurable via `DEV_PORT` env var. Only one site should run at a time.

The `api-docs-snapshot.db` file (SQLite, used by snapshot tracking) is
a generated artifact. It is gitignored and will be regenerated on first
build for each site.

Sites intentionally vary which optional fields they specify to test both
explicit values and defaults:
- `basic`: explicit `apiFolder`, `tsconfig`
- `versioned`: `tsconfig` omitted (tests default resolution)
- `i18n`: `apiFolder` omitted (tests default `"api"`)
- `multi`: explicit `baseRoute` override on second API

### sites/basic

Renamed from `docs-site/`. Single API, no versioning, no i18n.

```typescript
ApiExtractorPlugin({
  api: {
    packageName: "kitchensink",
    model: "../../modules/kitchensink/dist/npm/kitchensink.api.json",
    packageJson: "../../modules/kitchensink/dist/npm/package.json",
    tsconfig: "../../modules/kitchensink/tsconfig.json",
    apiFolder: "api",
  },
})
```

### sites/versioned

Single API with RSPress multiVersion.

```typescript
defineConfig({
  multiVersion: { default: "v2", versions: ["v1", "v2"] },
  plugins: [
    ApiExtractorPlugin({
      api: {
        packageName: "versioned-module",
        versions: {
          v1: { model: "../../modules/versioned-v1/dist/npm/versioned-v1.api.json",
                packageJson: "../../modules/versioned-v1/dist/npm/package.json" },
          v2: { model: "../../modules/versioned-v2/dist/npm/versioned-v2.api.json",
                packageJson: "../../modules/versioned-v2/dist/npm/package.json" },
        },
      },
    }),
  ],
})
```

### sites/i18n

Single API with i18n. Stub translations (same English content in both
locale dirs).

```typescript
defineConfig({
  lang: "en",
  locales: [
    { lang: "en", label: "English" },
    { lang: "zh", label: "中文" },
  ],
  plugins: [
    ApiExtractorPlugin({
      api: {
        packageName: "kitchensink",
        model: "../../modules/kitchensink/dist/npm/kitchensink.api.json",
        packageJson: "../../modules/kitchensink/dist/npm/package.json",
        tsconfig: "../../modules/kitchensink/tsconfig.json",
      },
    }),
  ],
})
```

Docs structure: `docs/en/index.md`, `docs/zh/index.md` (same content).

### sites/multi

Multi-API portal, no versioning, no i18n.

```typescript
ApiExtractorPlugin({
  apis: [
    {
      packageName: "kitchensink",
      model: "../../modules/kitchensink/dist/npm/kitchensink.api.json",
      packageJson: "../../modules/kitchensink/dist/npm/package.json",
      tsconfig: "../../modules/kitchensink/tsconfig.json",
    },
    {
      packageName: "versioned-module",
      baseRoute: "/versioned",
      model: "../../modules/versioned-v1/dist/npm/versioned-v1.api.json",
      packageJson: "../../modules/versioned-v1/dist/npm/package.json",
    },
  ],
})
```

## Root Scripts

```json
{
  "dev": "pnpm --filter basic run dev",
  "dev:basic": "pnpm --filter basic run dev",
  "dev:versioned": "pnpm --filter versioned run dev",
  "dev:i18n": "pnpm --filter i18n run dev",
  "dev:multi": "pnpm --filter multi run dev",
  "preview": "pnpm --filter basic run preview",
  "preview:basic": "pnpm --filter basic run preview",
  "preview:versioned": "pnpm --filter versioned run preview",
  "preview:i18n": "pnpm --filter i18n run preview",
  "preview:multi": "pnpm --filter multi run preview"
}
```

`dev` and `preview` (no suffix) default to `basic`.

## Turbo Orchestration

Build graph:

```text
types:check (all workspaces, no dependencies)
    |
    v
build:dev / build:prod (modules/* and plugin, in parallel)
    |
    v
build (sites/* — only when explicitly targeted, depends on ^build)
```

Plugin and modules have no workspace dependencies on each other and build
in parallel. Sites depend on both (via `^build`) and only build when
explicitly targeted via `pnpm --filter`. This keeps CI fast.

## Migration

**Moves (git mv):**

- `example-module/` -> `modules/kitchensink/` (rename package to
  `kitchensink`)
- `docs-site/` -> `sites/basic/` (update model paths to
  `../../modules/kitchensink/`)

**Creates:**

- `modules/versioned-v1/` — new module
- `modules/versioned-v2/` — new module with breaking changes
- `sites/versioned/` — new RSPress site
- `sites/i18n/` — new RSPress site
- `sites/multi/` — new RSPress site

**Updates:**

- `pnpm-workspace.yaml` — `modules/*`, `sites/*`, `plugin`
- Root `tsconfig.json` — references to all modules
- Root `package.json` — new dev/preview scripts, update existing ones
- Root `turbo.json` — exclude sites from default build
- `.gitignore` — update generated docs paths for new sites
- `CLAUDE.md` — update workspace table and commands

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Folder structure | `modules/` + `sites/` | Clean root, scales with more fixtures |
| Versioned modules | Breaking changes between v1 and v2 | Tests realistic API evolution |
| Package name trick | rslib-builder transform rewrites name | Workspace names stay unique, plugin sees same package |
| i18n content | Stub (same English in both dirs) | Tests path derivation, not translation |
| Multi site | No i18n | One concern per site, i18n tested separately |
| Sites in default build | Excluded | CI builds only modules + plugin |
| Default dev/preview | basic site | Most common development workflow |
