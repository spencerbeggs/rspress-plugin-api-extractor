# Configuration

Every option the plugin accepts, organized by where it lives. You configure the plugin through a single options object passed to `ApiExtractorPlugin(...)`. At the top level you pick single-API mode (`api`) or multi-API mode (`apis`), then layer on categories, source links, theme, performance and LLMs settings.

## Top-level options

```ts
ApiExtractorPlugin({
  api: { /* single-API config */ },
  apis: [ /* multi-API config[] */ ],
  siteUrl: "https://example.com",
  ogImage: "./assets/og-default.png",
  defaultCategories: { /* category overrides applied to every API */ },
  errors: { example: "show" },
  llmsPlugin: { scopes: true },
  logLevel: "info",
  performance: { /* performance config */ },
});
```

| Option | Type | Purpose |
| --- | --- | --- |
| `api` | single-API config | Document one package. Mutually exclusive with `apis`. |
| `apis` | multi-API config array | Document several packages in one portal. |
| `siteUrl` | string | Absolute site URL, used for Open Graph tags. |
| `ogImage` | string or object | Default Open Graph image for generated pages. |
| `defaultCategories` | category record | Override the built-in categories for every API. |
| `errors` | object | `{ example: "show" \| "suppress" }` controls whether code-example type errors surface. |
| `llmsPlugin` | boolean or object | Enable and configure per-package `llms*.txt` generation. |
| `logLevel` | string | One of `none`, `error`, `warn`, `info`, `verbose`, `debug`. |
| `performance` | object | Slow-operation thresholds and metrics reporting. |

Provide exactly one of `api` or `apis`. Use `api` for a single package — it also supports RSPress multiVersion through `versions` — and `apis` for a portal that hosts more than one package.

## Single-API config (`api`)

```ts
ApiExtractorPlugin({
  api: {
    packageName: "my-library",
    name: "My Library",
    model: "./api/my-library.api.json",
    packageJson: "./api/package.json",
    tsconfig: "./api/tsconfig.json",
    baseRoute: "/reference",
    apiFolder: "api",
    theme: { light: "github-light-default", dark: "github-dark-default" },
  },
});
```

| Field | Type | Default | Purpose |
| --- | --- | --- | --- |
| `packageName` | string | required | npm name of the documented package. |
| `name` | string | `packageName` | Display name used in titles and navigation. |
| `model` | path, URL or loader fn | required unless `versions` is set | The `.api.json` model. |
| `packageJson` | path, URL or loader fn | — | The package's `package.json` for version and dependency detection. |
| `baseRoute` | string | — | Route prefix for all pages of this API. |
| `apiFolder` | string or `null` | `"api"` | Folder segment to nest pages under. Set to `null` to write categories at the route root. |
| `versions` | record | — | Per-version models for RSPress multiVersion. See the versioned recipe. |
| `theme` | string or `{ light, dark }` | — | Shiki theme for code blocks. |
| `categories` | category record | built-in defaults | Override how API items are grouped. |
| `source` | `{ url, ref? }` | — | Base URL for "view source" links. |
| `externalPackages` | spec array | — | External packages to load types for, used by hover tooltips. |
| `autoDetectDependencies` | object | peer + auto on | Auto-load types from the package's own dependencies. |
| `ogImage` | string or object | inherits top-level | Open Graph image for this API's pages. |
| `llmsPlugin` | boolean or object | inherits top-level | LLMs settings for this API. |
| `tsconfig` | path, URL or loader fn | — | `tsconfig.json` used when type-checking code examples. |
| `compilerOptions` | object | — | Inline compiler options, merged over `tsconfig`. |

`model` (and `packageJson`, `tsconfig`) take a string path, a `URL` or an async loader function that returns the content, so you can fetch a model over the network or generate one on the fly.

## Multi-API config (`apis`)

Each entry in `apis` has the same shape as the single-API config, with two differences. `model` is required, because multi-API mode has no `versions` field, and each entry defaults to its own `/{packageName}/api` route so the packages do not collide — set `baseRoute` per entry only to override that default. See the [multi-package recipe](./05-multi-package.md).

```ts
ApiExtractorPlugin({
  apis: [
    {
      packageName: "core",
      model: "./api/core.api.json",
      packageJson: "./api/core-package.json",
    },
    {
      packageName: "utils",
      baseRoute: "/utils",
      model: "./api/utils.api.json",
    },
  ],
});
```

## Categories

Categories control how API items are grouped into folders and labeled in the sidebar. The built-in categories cover the seven API item kinds, and the plugin exports them as `DEFAULT_CATEGORIES`:

```ts
import { DEFAULT_CATEGORIES } from "rspress-plugin-api-extractor";

console.log(Object.keys(DEFAULT_CATEGORIES));
// ["classes", "interfaces", "functions", "types", "enums", "variables", "namespaces"]
```

Each category is an object:

| Field | Type | Default | Purpose |
| --- | --- | --- | --- |
| `displayName` | string | required | Plural label shown as the sidebar group heading. |
| `singularName` | string | required | Singular label used in page titles. |
| `folderName` | string | required | URL/folder segment for items in this category. |
| `itemKinds` | API item kind array | — | Which API Extractor item kinds belong here. |
| `tsdocModifier` | string | — | Route items carrying a given TSDoc modifier into this category. |
| `collapsible` | boolean | `true` | Whether the sidebar group can collapse. |
| `collapsed` | boolean | `true` | Whether the group starts collapsed. |
| `overviewHeaders` | number array | `[2]` | Heading levels surfaced in the overview. |

To override a single category, spread the defaults and replace what you want. Set it on `defaultCategories`, which applies to every API, or on a specific API's `categories`:

```ts
import { ApiExtractorPlugin, DEFAULT_CATEGORIES } from "rspress-plugin-api-extractor";

ApiExtractorPlugin({
  api: {
    packageName: "my-library",
    model: "./api/my-library.api.json",
    categories: {
      ...DEFAULT_CATEGORIES,
      classes: {
        ...DEFAULT_CATEGORIES.classes,
        displayName: "Components",
        collapsed: false,
      },
    },
  },
});
```

## Source links

Set `source` to turn API items into "view source" links pointing at your repository:

```ts
api: {
  packageName: "my-library",
  model: "./api/my-library.api.json",
  source: {
    url: "https://github.com/me/my-library",
    ref: "main",
  },
}
```

`url` is the repository base. `ref` is the branch, tag or commit to link against; omit it to use the repository default.

## Theme

`theme` sets the Shiki syntax-highlighting theme for code blocks. Pass a single theme name for both light and dark, or an object with separate themes:

```ts
api: {
  packageName: "my-library",
  model: "./api/my-library.api.json",
  theme: {
    light: "github-light-default",
    dark: "github-dark-default",
  },
}
```

Any [Shiki bundled theme](https://shiki.style/themes) name works.

## External package types and auto-detection

Interactive code examples are type-checked, so types referenced from other packages — `ZodType` from `zod`, say — need to be loaded. By default the plugin finds these in your package's dependencies. Control that with `autoDetectDependencies`:

```ts
api: {
  packageName: "my-library",
  model: "./api/my-library.api.json",
  packageJson: "./api/package.json",
  autoDetectDependencies: {
    peerDependencies: true,
    autoDependencies: true,
    dependencies: false,
    devDependencies: false,
  },
}
```

| Field | Default | Loads types from |
| --- | --- | --- |
| `peerDependencies` | `true` | The package's peer dependencies. |
| `autoDependencies` | `true` | Dependencies the plugin infers are referenced by the public API. |
| `dependencies` | `false` | All runtime dependencies. |
| `devDependencies` | `false` | All dev dependencies. |

To load a package's types explicitly, list it in `externalPackages`:

```ts
api: {
  packageName: "my-library",
  model: "./api/my-library.api.json",
  externalPackages: [
    { name: "zod", version: "^3.22.4" },
    { name: "effect", version: "^3.0.0" },
  ],
}
```

Each spec takes `name` and `version`, plus an optional `tsconfig` and `compilerOptions` that control how that package's types load.

## Open Graph images

`ogImage` accepts a string path/URL or a metadata object. Set it at the top level as a site-wide default, or per-API to override:

```ts
ApiExtractorPlugin({
  siteUrl: "https://docs.example.com",
  ogImage: {
    url: "https://docs.example.com/og.png",
    width: 1200,
    height: 630,
    alt: "My Library API",
  },
  api: { packageName: "my-library", model: "./api/my-library.api.json" },
});
```

| Field | Type | Purpose |
| --- | --- | --- |
| `url` | string | Image URL (required when using the object form). |
| `secureUrl` | string | HTTPS variant of the URL. |
| `type` | string | MIME type, for example `image/png`. |
| `width` / `height` | number | Image dimensions in pixels. |
| `alt` | string | Alt text. |

## Performance

`performance` tunes the slow-operation thresholds used for build warnings and whether timing metrics are reported:

```ts
ApiExtractorPlugin({
  api: { packageName: "my-library", model: "./api/my-library.api.json" },
  performance: {
    showInsights: true,
    trackDetailedMetrics: false,
    thresholds: {
      slowCodeBlock: 100,
      slowPageGeneration: 500,
      slowApiLoad: 1000,
    },
  },
});
```

| Field | Type | Default | Purpose |
| --- | --- | --- | --- |
| `showInsights` | boolean | `true` | Print a build performance summary. |
| `trackDetailedMetrics` | boolean | `false` | Track per-operation timing. |
| `thresholds.slowCodeBlock` | number (ms) | `100` | Warn when a code block takes longer than this. |
| `thresholds.slowPageGeneration` | number (ms) | `500` | Warn when a page takes longer to generate. |
| `thresholds.slowApiLoad` | number (ms) | `1000` | Warn when loading a model is slow. |
| `thresholds.slowFileOperation` | number (ms) | `50` | Warn when a file write is slow. |
| `thresholds.slowHttpRequest` | number (ms) | `2000` | Warn when a network request is slow. |
| `thresholds.slowDbOperation` | number (ms) | `100` | Warn when the incremental-build store is slow. |

## LLMs

`llmsPlugin` turns on per-package `llms.txt`, `llms-full.txt`, `llms-docs.txt` and `llms-api.txt` files, plus the in-page actions that copy or open them. Pass `true` for defaults or an object to configure. The [LLMs guide](./09-llms.md) has the full picture, including the RSPress `llms: true` prerequisite.

```ts
ApiExtractorPlugin({
  api: { packageName: "my-library", model: "./api/my-library.api.json" },
  llmsPlugin: {
    scopes: true,
    apiTxt: true,
    copyButtonText: "Copy Markdown",
    viewOptions: ["markdownLink", "chatgpt", "claude"],
  },
});
```

| Field | Type | Default | Purpose |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | Turn the integration on or off. |
| `scopes` | boolean | `true` | Generate per-package files and scoped UI actions. |
| `apiTxt` | boolean | `true` | Generate `llms-api.txt` (API-only content). |
| `showCopyButton` | boolean | `true` | Show the copy button in the page UI. |
| `showViewOptions` | boolean | `true` | Show the view-options dropdown. |
| `copyButtonText` | string | `"Copy Markdown"` | Copy button label. |
| `viewOptions` | string array | `["markdownLink", "chatgpt", "claude"]` | Dropdown actions. |

## Logging

`logLevel` controls build output verbosity:

```ts
ApiExtractorPlugin({
  logLevel: "verbose",
  api: { packageName: "my-library", model: "./api/my-library.api.json" },
});
```

| Level | Output |
| --- | --- |
| `none` | Silent. |
| `error` | Errors only. |
| `warn` | Warnings and errors. |
| `info` | Normal build messages (the usual choice). |
| `verbose` | Detailed messages. |
| `debug` | Structured JSON, every message. |

The `LOG_LEVEL` environment variable overrides the configured level for a single run.
