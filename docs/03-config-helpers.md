# Config helpers

Writing out a full `model`, `packageJson`, `tsconfig` and `baseRoute` for every package gets tedious once you document more than one. The plugin ships two helpers that read those fields from a package folder so you do not have to repeat them. They are split across two namespaces: `ApiExtractorPlugin.api.fromDir` builds one config for the single-API `api:` option, and `ApiExtractorPlugin.apis.fromDir` builds an array for the multi-API `apis:` option.

## When to use them

The helpers expect the folder layout that [@savvy-web/bundler](https://github.com/savvy-web/bundler) produces for its `meta.localPaths` option: a directory holding a `package.json`, a `*.api.json` model and, optionally, a `tsconfig.json`. Point a helper at such a folder and it reads the package name, version and model path for you.

Both helpers produce `MultiApiConfig` objects. `api.fromDir` returns one, suitable for the `api:` option or as an element of the `apis:` array. `apis.fromDir` scans a parent directory and returns an array of them for the `apis:` option.

## api.fromDir

`ApiExtractorPlugin.api.fromDir(dir, overrides?)` builds one config from a single package folder and hands it straight to the `api:` option.

```ts
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "docs",
  plugins: [
    ApiExtractorPlugin({
      api: ApiExtractorPlugin.api.fromDir("lib/models/effect-kit", {
        cwd: __dirname,
        name: "Effect Kit",
        theme: { light: "github-light-default", dark: "github-dark-default" },
      }),
    }),
  ],
});
```

`fromDir` reads `packageName`, `model`, `packageJson` and `tsconfig` from `lib/models/effect-kit/`, then merges your overrides on top.

### Discovery rules

- `packageName` and `name` come from the folder's `package.json` `name` field.
- `model` is the single `*.api.json` file in the folder. If several exist, the helper prefers one named after the package (`<unscoped-name>.api.json`) and otherwise throws, asking you to pass an explicit `model`.
- `packageJson` is the folder's `package.json`.
- `tsconfig` is the folder's `tsconfig.json` if present.
- `baseRoute` is left unset unless you override it, so the plugin applies its own context-aware default — `/api` under the `api:` option, `/{packageName}/api` under the `apis:` option.

### Options

`fromDir`'s second argument accepts any `MultiApiConfig` field as an override, plus two helper-specific options:

| Option | Type | Purpose |
| --- | --- | --- |
| `cwd` | string | Base directory for resolving a relative `dir`. Defaults to `process.cwd()`. |
| `baseRoute` | string or `(info) => string` | How to derive the route prefix. See below. |

Any field you pass wins over what discovery found. For example, supply your own `name` or `theme`, or point at a different `model` if the folder has several.

### baseRoute templates

`baseRoute` is the exception. Besides a literal string, it accepts a template with tokens or a callback.

- Omit it and the plugin applies its own default — `/api` for a single API, `/{packageName}/api` for a multi-API portal.
- Pass a template string with `{dirname}` and/or `{packageName}` tokens, for example `"reference/{dirname}"`.
- Pass a callback `(info) => string` for full control. `info` carries `dir`, `dirname`, `packageName`, `version` and `modelPath`.

```ts
ApiExtractorPlugin.api.fromDir("lib/models/effect-kit", {
  cwd: __dirname,
  baseRoute: (info) => `/reference/${info.dirname}`,
});
// route prefix becomes /reference/effect-kit
```

Prefer `{dirname}` or the callback for the route. The `{packageName}` token is interpolated verbatim, so a scoped name like `@scope/pkg` lands in the URL scope and all, which is rarely what you want in a path.

## apis.fromDir

`ApiExtractorPlugin.apis.fromDir(parentDir, options?)` scans a parent directory and builds one config per subfolder, returning an array. Spread it into `apis`:

```ts
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "docs",
  plugins: [
    ApiExtractorPlugin({
      apis: [
        ...ApiExtractorPlugin.apis.fromDir("lib/models", {
          cwd: __dirname,
          theme: { light: "github-light-default", dark: "github-dark-default" },
        }),
      ],
    }),
  ],
});
```

Every option except `cwd` becomes a shared default across the discovered packages, so a single `theme` or `baseRoute` template covers them all.

### Strictness

`apis.fromDir` is strict on purpose. Every non-dotfile subdirectory must be a valid model folder — a `package.json` plus a `*.api.json`. If one is not, the helper throws and names the offending folder, which catches stray directories before they silently drop a package from the portal. To include only some folders, call `api.fromDir` for each one instead.

```ts
// Three documented packages, plus one stray folder → apis.fromDir throws.
// Use api.fromDir per package for selective inclusion:
apis: [
  ApiExtractorPlugin.api.fromDir("lib/models/core", { cwd: __dirname }),
  ApiExtractorPlugin.api.fromDir("lib/models/utils", { cwd: __dirname }),
],
```

## Helper return types

The helper input and result types are exported for typed config files:

```ts
import type {
  BaseRoute,
  DirInfo,
  FromDirOptions,
} from "rspress-plugin-api-extractor";
```

- `DirInfo` — what discovery found: `dir`, `dirname`, `packageName`, `version`, `modelPath`.
- `BaseRoute` — the `string | (info: DirInfo) => string` type for the `baseRoute` option.
- `FromDirOptions` — the options-object shape shared by `api.fromDir` and `apis.fromDir`.

## Related guides

- [Multi-package](./05-multi-package.md) — building a portal, with and without the helpers.
- [Configuration](./02-configuration.md) — every field the discovered config can carry.
