# Recipes

The five site shapes as complete, working configs. Each mirrors a real example site under `sites/`, so a consumer's `rspress.config.ts` can start from the closest one. Field-level detail is in [config-reference.md](./config-reference.md).

All five resolve `model` paths from the config file's own location so they are machine-independent:

```ts
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
```

## 1. Single package — `api` (`sites/basic`)

One library, every page under an `api/` folder.

```ts
import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

export default defineConfig({
  root: "docs",
  title: "My Library",
  outDir: "dist",
  plugins: [
    ApiExtractorPlugin({
      logLevel: "info",
      api: {
        name: "My Library",
        packageName: "my-library",
        model: path.join(__dirname, "api/my-library.api.json"),
        packageJson: path.join(__dirname, "api/package.json"),
        tsconfig: path.join(__dirname, "api/tsconfig.json"),
        apiFolder: "api",
        theme: { light: "github-light-default", dark: "github-dark-default" },
      },
    }),
  ],
  route: { cleanUrls: true },
});
```

`apiFolder: "api"` nests pages at `/api/class/myclass`; `apiFolder: null` writes them at the root (`/class/myclass`); `baseRoute: "/reference"` prefixes the whole API. The real `sites/basic` config collapses all of `api:` into one line with the helper: `api: ApiExtractorPlugin.api.fromDir("./lib/models/kitchensink")`.

## 2. Portal — `apis` (`sites/multi`)

Several packages in one site. `model` is required per entry; each defaults to `/{packageName}/api`.

```ts
ApiExtractorPlugin({
  logLevel: "info",
  apis: [
    {
      packageName: "kitchensink",
      model: path.join(__dirname, "api/kitchensink/kitchensink.api.json"),
      packageJson: path.join(__dirname, "api/kitchensink/package.json"),
      theme: { light: "github-light-default", dark: "github-dark-default" },
    },
    {
      packageName: "versioned-module",
      baseRoute: "/versioned",            // overrides the /{packageName}/api default
      model: path.join(__dirname, "api/versioned/versioned.api.json"),
    },
  ],
});
```

From a directory of model folders, `apis.fromDir` builds the array — the real `sites/multi` is just `apis: ApiExtractorPlugin.apis.fromDir("./lib/models")`. Shared options (like `theme`) passed to `apis.fromDir` apply to every discovered package.

## 3. Versioned — `api.versions` + RSPress `multiVersion` (`sites/versioned`)

Two pieces must agree: RSPress `multiVersion` owns the version switcher and URL prefixes; the plugin's `versions` record maps each version key to its model. The keys must match.

```ts
export default defineConfig({
  root: "docs",
  multiVersion: { default: "v2", versions: ["v1", "v2"] },
  plugins: [
    ApiExtractorPlugin({
      api: {
        packageName: "my-library",
        theme: { light: "github-light-default", dark: "github-dark-default" },
        versions: {
          v1: {
            model: path.join(__dirname, "api/v1/my-library.api.json"),
            source: { url: "https://github.com/me/my-library", ref: "v1.x" },
          },
          v2: {
            model: path.join(__dirname, "api/v2/my-library.api.json"),
            source: { url: "https://github.com/me/my-library", ref: "main" },
          },
        },
      },
    }),
  ],
});
```

`default` is served at the root; other versions are prefixed (`v1` → `/v1/...`). A version entry needing no overrides can be a bare model path: `v1: path.join(__dirname, "api/v1/my-library.api.json")`. Fields on `api` (like `theme`) are shared unless a version overrides them. The real `sites/versioned` uses the helper per version: `v1: ApiExtractorPlugin.api.fromDir("./lib/models/v1")`.

## 4. i18n — RSPress `locales` (`sites/i18n`)

The plugin config does **not** change for i18n. Declare `locales`; the generated pages slot into every locale's routing.

```ts
export default defineConfig({
  root: "docs",
  lang: "en",
  locales: [
    { lang: "en", label: "English" },
    { lang: "zh", label: "中文" },
  ],
  plugins: [
    ApiExtractorPlugin({
      api: ApiExtractorPlugin.api.fromDir("./lib/models/kitchensink"),
    }),
  ],
  markdown: { link: { checkDeadLinks: false } },
});
```

The plugin generates the API pages once and they appear under each locale. API content (signatures, summaries) comes verbatim from the `.api.json` model, so it reads in whatever language the source TSDoc is written in — to translate it, translate the TSDoc and rebuild the model. Only the RSPress-owned UI strings (LLMs actions, view-options labels) localize automatically. `checkDeadLinks: false` is common while translations are incomplete (see [troubleshooting.md](./troubleshooting.md)). i18n composes with versioning — declare both `locales` and `multiVersion` for a locale × version matrix.

## 5. Multi-entry — automatic (`sites/effect`)

A package that exposes more than one entry point needs **no** extra config:

```json
{ "exports": { ".": "./dist/index.js", "./testing": "./dist/testing.js" } }
```

```ts
ApiExtractorPlugin({
  api: ApiExtractorPlugin.api.fromDir("./lib/models/effect-kit"),
});
```

The plugin counts entry points, deduplicates anything re-exported across them (one page per item, not one per entry), and adds an "Available from" line to items reachable from more than one entry: `` Available from: `my-library`, `my-library/testing` ``. The main entry maps to the bare package name; named entries become subpath imports. Two items count as the same when they share a name **and** a kind; a value and a type that share a name stay distinct in different category folders. Route collisions between genuinely distinct items fail the build — see [troubleshooting.md](./troubleshooting.md).
