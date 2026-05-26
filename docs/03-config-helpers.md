# Config helpers

Writing out a full `model`, `packageJson`, `tsconfig` and `baseRoute` for every package gets tedious once you document more than one. The plugin ships two helpers that read those fields from a package folder so you do not have to repeat them. Both hang off `ApiExtractorPlugin.api`.

## When to use them

The helpers expect the folder layout that [@savvy-web/rslib-builder](https://github.com/savvy-web/rslib-builder) produces for its `localPaths` option: a directory holding a `package.json`, a `*.api.json` model and, optionally, a `tsconfig.json`. Point a helper at such a folder and it reads the package name, version and model path for you.

Both helpers return `MultiApiConfig` objects, so they go inside `apis: [ ... ]`, not `api:`. That holds even for a single package — `fromFolder` produces one multi-API entry.

## fromFolder

`ApiExtractorPlugin.api.fromFolder(dir, overrides?)` builds one config from a single package folder.

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
        ApiExtractorPlugin.api.fromFolder("lib/models/effect-kit", {
          cwd: __dirname,
          name: "Effect Kit",
          baseRoute: "/api",
          apiFolder: "api",
          theme: { light: "github-light-default", dark: "github-dark-default" },
        }),
      ],
    }),
  ],
});
```

This is the actual configuration from the `effect` example site. `fromFolder` reads `packageName`, `model`, `packageJson` and `tsconfig` from `lib/models/effect-kit/`, then merges your overrides on top.

### Discovery rules

- `packageName` and `name` come from the folder's `package.json` `name` field.
- `model` is the single `*.api.json` file in the folder. If several exist, the helper prefers one named after the package (`<unscoped-name>.api.json`) and otherwise throws, asking you to pass an explicit `model`.
- `packageJson` is the folder's `package.json`.
- `tsconfig` is the folder's `tsconfig.json` if present.
- `baseRoute` defaults to the `{dirname}` template (see below).

### Options

`fromFolder`'s second argument accepts any `MultiApiConfig` field as an override, plus two helper-specific options:

| Option | Type | Purpose |
| --- | --- | --- |
| `cwd` | string | Base directory for resolving a relative `dir`. Defaults to `process.cwd()`. |
| `baseRoute` | string or `(info) => string` | How to derive the route prefix. See below. |

Any field you pass wins over what discovery found. For example, supply your own `name` or `theme`, or point at a different `model` if the folder has several.

### baseRoute templates

`baseRoute` is the exception. Besides a literal string, it accepts a template with tokens or a callback.

- Omit it and you get the template `"{dirname}"` — the folder's own name.
- Pass a template string with `{dirname}` and/or `{packageName}` tokens, for example `"reference/{dirname}"`.
- Pass a callback `(info) => string` for full control. `info` carries `dir`, `dirname`, `packageName`, `version` and `modelPath`.

```ts
ApiExtractorPlugin.api.fromFolder("lib/models/effect-kit", {
  cwd: __dirname,
  baseRoute: (info) => `/reference/${info.dirname}`,
});
// route prefix becomes /reference/effect-kit
```

Prefer `{dirname}` or the callback for the route. The `{packageName}` token is interpolated verbatim, so a scoped name like `@scope/pkg` lands in the URL scope and all, which is rarely what you want in a path.

## fromModelsDir

`ApiExtractorPlugin.api.fromModelsDir(parentDir, options?)` scans a parent directory and builds one config per subfolder, returning an array. Spread it into `apis`:

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
        ...ApiExtractorPlugin.api.fromModelsDir("lib/models", {
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

`fromModelsDir` is strict on purpose. Every non-dotfile subdirectory must be a valid model folder — a `package.json` plus a `*.api.json`. If one is not, the helper throws and names the offending folder, which catches stray directories before they silently drop a package from the portal. To include only some folders, call `fromFolder` for each one instead.

```ts
// Three documented packages, plus one stray folder → fromModelsDir throws.
// Use fromFolder per package for selective inclusion:
apis: [
  ApiExtractorPlugin.api.fromFolder("lib/models/core", { cwd: __dirname }),
  ApiExtractorPlugin.api.fromFolder("lib/models/utils", { cwd: __dirname }),
],
```

## Helper return types

The helper input and result types are exported for typed config files:

```ts
import type {
  BaseRoute,
  FolderInfo,
  FromFolderOptions,
  FromModelsDirOptions,
} from "rspress-plugin-api-extractor";
```

- `FolderInfo` — what discovery found: `dir`, `dirname`, `packageName`, `version`, `modelPath`.
- `BaseRoute` — the `string | (info: FolderInfo) => string` type for the `baseRoute` option.
- `FromFolderOptions` / `FromModelsDirOptions` — the options-object shapes.

## Related guides

- [Multi-package](./05-multi-package.md) — building a portal, with and without the helpers.
- [Configuration](./02-configuration.md) — every field the discovered config can carry.
