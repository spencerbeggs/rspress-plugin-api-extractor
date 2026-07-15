# Config reference

Every option `ApiExtractorPlugin(...)` accepts, organized by where it lives. Load this when you need a field's exact name, type, or default; the [recipes](./recipes.md) show these fields assembled into working configs.

## Top-level options

The object passed to `ApiExtractorPlugin(...)`. Choose single-API (`api`) or multi-API (`apis`), then layer site-wide settings on top.

| Option | Type | Purpose |
| --- | --- | --- |
| `api` | single-API config | Document one package. Mutually exclusive with `apis`. |
| `apis` | multi-API config array | Document several packages in one portal. |
| `siteUrl` | string | Absolute site URL, used for Open Graph tags. |
| `ogImage` | string or object | Default Open Graph image for generated pages. |
| `defaultCategories` | category record | Category overrides applied to every API. |
| `errors` | object | `{ example: "show" \| "suppress" }` — whether code-example type errors surface. |
| `llmsPlugin` | boolean or object | Per-package `llms*.txt` generation. See [llms.md](./llms.md). |
| `observability` | object | Log level, opt-in JSONL trace, slow-operation thresholds. |
| `logLevel` | string | **Deprecated** alias for `observability.logLevel`. |
| `performance` | object | **Deprecated** alias for `observability.thresholds`. |

Provide exactly one of `api` or `apis`.

## Single-API config (`api`)

| Field | Type | Default | Purpose |
| --- | --- | --- | --- |
| `packageName` | string | required | npm name of the documented package. Supplies import lines in examples. |
| `name` | string | `packageName` | Display name in titles and navigation. |
| `model` | path, URL or loader fn | required unless `versions` is set | The `.api.json` model. |
| `packageJson` | path, URL or loader fn | — | The package's `package.json`, for version and dependency detection. |
| `tsconfig` | path, URL or loader fn | — | `tsconfig.json` used to type-check code examples. |
| `compilerOptions` | object | — | Inline compiler options, merged over `tsconfig`. |
| `baseRoute` | string | context-aware | Route prefix for all pages of this API. |
| `apiFolder` | string or `null` | `"api"` | Folder segment to nest pages under. `null` writes categories at the route root. |
| `versions` | record | — | Per-version models for RSPress multiVersion. See [recipes.md](./recipes.md). |
| `theme` | string or `{ light, dark }` | — | Shiki theme for code blocks. See [theming.md](./theming.md). |
| `categories` | category record | `DEFAULT_CATEGORIES` | Override how API items are grouped. |
| `source` | `{ url, ref? }` | — | Base URL for "view source" links. |
| `externalPackages` | spec array | — | External packages to load types for (hover tooltips). |
| `autoDetectDependencies` | object | peer + auto on | Auto-load types from the package's own dependencies. |
| `ogImage` | string or object | inherits top-level | Open Graph image for this API's pages. |
| `llmsPlugin` | boolean or object | inherits top-level | LLMs settings for this API. |

`model`, `packageJson` and `tsconfig` each take a string path, a `URL`, or an async loader function returning the content — so a model can be fetched over the network or generated on the fly. Paths resolve relative to the RSPress project root; resolve them from the config file's own location (`fileURLToPath(import.meta.url)`) so they are machine-independent.

`baseRoute` defaults are context-aware: under `api:` it is `/api` (`baseRoute ?? "/"` + `apiFolder`); under `apis:` it is `/{packageName}/api`, with a scoped name unscoped for the path (`@scope/pkg` → `/pkg/api`). Set it explicitly to override.

## Multi-API config (`apis`)

Each entry has the same shape as the single-API config, with two differences: `model` is **required** on every entry (there is no `versions` field in `apis` mode), and each entry defaults to its own `/{packageName}/api` route so packages do not collide. Set `baseRoute` per entry only to override that default.

## Version config (inside `api.versions`)

Keys must match the names in RSPress `multiVersion.versions`. Each value is either a bare model path or a version config carrying its own `model` plus optional `packageJson`, `categories`, `source`, `externalPackages`, `theme`, `ogImage`, `llmsPlugin`. Fields set directly on `api` are shared across versions unless a version overrides them.

## Categories

Categories group API items into folders and label them in the sidebar. The seven built-ins are exported as `DEFAULT_CATEGORIES`:

```ts
import { DEFAULT_CATEGORIES } from "rspress-plugin-api-extractor";
// keys: classes, interfaces, functions, types, enums, variables, namespaces
```

| Field | Type | Default | Purpose |
| --- | --- | --- | --- |
| `displayName` | string | required | Plural label — the sidebar group heading. |
| `singularName` | string | required | Singular label — used in page titles. |
| `folderName` | string | required | URL/folder segment for items in this category. |
| `itemKinds` | item-kind array | — | Which API Extractor item kinds belong here. |
| `tsdocModifier` | string | — | Route items carrying a given TSDoc modifier into this category. |
| `collapsible` | boolean | `true` | Whether the sidebar group can collapse. |
| `collapsed` | boolean | `true` | Whether the group starts collapsed. |
| `overviewHeaders` | number array | `[2]` | Heading levels surfaced in the overview. |

Override one category by spreading the defaults and replacing what you want. Set it on `defaultCategories` (every API) or a specific API's `categories`:

```ts
categories: {
  ...DEFAULT_CATEGORIES,
  classes: { ...DEFAULT_CATEGORIES.classes, displayName: "Components", collapsed: false },
}
```

Changing a category's `folderName` is also how you separate two items that would otherwise collide on a route — see [troubleshooting.md](./troubleshooting.md).

## Source links

```ts
source: { url: "https://github.com/me/my-library", ref: "main" }
```

`url` is the repository base; `ref` is the branch, tag or commit to link against (omit to use the repo default). Turns each documented item into a "view source" link.

## External package types and auto-detection

Code examples are type-checked, so types referenced from other packages (`ZodType` from `zod`, say) must be loaded. By default the plugin finds them in the package's dependencies; tune that with `autoDetectDependencies`:

| Field | Default | Loads types from |
| --- | --- | --- |
| `peerDependencies` | `true` | The package's peer dependencies. |
| `autoDependencies` | `true` | Dependencies inferred to be referenced by the public API. |
| `dependencies` | `false` | All runtime dependencies. |
| `devDependencies` | `false` | All dev dependencies. |

To load a package explicitly, list it in `externalPackages`:

```ts
externalPackages: [
  { name: "zod", version: "^3.22.4" },
  { name: "effect", version: "^3.0.0" },
]
```

Each spec takes `name` and `version`, plus optional `tsconfig` and `compilerOptions` controlling how that package's types load.

## Open Graph images

`ogImage` takes a string path/URL or a metadata object; set it top-level as a default or per-API to override.

| Field | Type | Purpose |
| --- | --- | --- |
| `url` | string | Image URL (required in object form). |
| `secureUrl` | string | HTTPS variant. |
| `type` | string | MIME type, e.g. `image/png`. |
| `width` / `height` | number | Dimensions in pixels. |
| `alt` | string | Alt text. |

## Observability

```ts
observability: {
  logLevel: "info",
  trace: true,              // or a file path string
  thresholds: { slowCodeBlock: 100, slowPageGeneration: 500, slowApiLoad: 1000 },
}
```

**`logLevel`** — which events reach the console: `none`, `error`, `warn`, `info` (the usual choice), `debug` (structured JSON), `trace` (everything, incl. VFS keys and compiler options). `verbose` is a synonym for `debug`. The `LOG_LEVEL` environment variable overrides it for one run.

**`trace`** — `true` writes a full-fidelity JSONL log of every event to a temp file; a string sets the path. The trace captures every event regardless of `logLevel`, useful for reproducing Twoslash diagnostics.

**`thresholds`** — millisecond durations for slow-operation warnings: `slowCodeBlock` (100), `slowPageGeneration` (500), `slowApiLoad` (1000), `slowFileOperation` (50), `slowDbOperation` (100).

The deprecated top-level `logLevel` and `performance` aliases still work, but `observability` wins when both are set.

## The `fromDir` helper surface

`ApiExtractorPlugin.api.fromDir(dir, overrides?)` builds one config; `ApiExtractorPlugin.apis.fromDir(parentDir, options?)` scans a parent directory and returns one per subfolder. Both read a **model folder** — a directory holding a `package.json`, a `*.api.json` and optionally a `tsconfig.json`.

**Discovery:**

- `packageName` / `name` come from the folder's `package.json` `name`.
- `model` is the single `*.api.json`; with several, it prefers `<unscoped-name>.api.json` and otherwise throws.
- `packageJson` / `tsconfig` are the folder's own files.
- `baseRoute` is left unset unless overridden, so the plugin applies its context-aware default.

**Options** (second argument) — any `MultiApiConfig` field as an override, plus:

| Option | Type | Purpose |
| --- | --- | --- |
| `cwd` | string | Base directory for a relative `dir`. Defaults to `process.cwd()`. |
| `baseRoute` | string or `(info: DirInfo) => string` | Route derivation — literal, `{dirname}`/`{packageName}` template, or callback. |

Overrides win over discovery. `apis.fromDir` shares every option except `cwd` across the discovered packages, and is strict: every non-dotfile subdirectory must be a valid model folder or it throws (naming the offending folder). For selective inclusion, call `api.fromDir` per package.

**`baseRoute` templates:** prefer `{dirname}` or a callback. The `{packageName}` token interpolates verbatim, so a scoped `@scope/pkg` lands in the URL scope-and-all — rarely what you want in a path. The callback's `info` carries `dir`, `dirname`, `packageName`, `version`, `modelPath`.

**Exported helper types** (for typed config files):

```ts
import type { BaseRoute, DirInfo, FromDirOptions } from "rspress-plugin-api-extractor";
```

- `DirInfo` — what discovery found: `dir`, `dirname`, `packageName`, `version`, `modelPath`.
- `BaseRoute` — the `string | (info: DirInfo) => string` type for the `baseRoute` option.
- `FromDirOptions` — the options-object shape shared by both helpers.
