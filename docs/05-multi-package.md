# Multi-package

A multi-API portal documents several packages from one RSPress site. Use the `apis` array in place of `api`. Each entry has the same shape as a single-API config. Each package is namespaced by its own name by default — with no `baseRoute`, an entry mounts at `/{packageName}/api` — so the packages do not collide out of the box. Set `baseRoute` on an entry only when you want to override that default.

## Explicit portal

```ts
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "docs",
  title: "Acme API Portal",
  outDir: "dist",
  plugins: [
    ApiExtractorPlugin({
      logLevel: "info",
      apis: [
        {
          packageName: "kitchensink",
          model: path.join(__dirname, "api/kitchensink/kitchensink.api.json"),
          packageJson: path.join(__dirname, "api/kitchensink/package.json"),
          tsconfig: path.join(__dirname, "api/kitchensink/tsconfig.json"),
          theme: { light: "github-light-default", dark: "github-dark-default" },
        },
        {
          packageName: "versioned-module",
          baseRoute: "/versioned",
          model: path.join(__dirname, "api/versioned/versioned.api.json"),
          packageJson: path.join(__dirname, "api/versioned/package.json"),
          theme: { light: "github-light-default", dark: "github-dark-default" },
        },
      ],
    }),
  ],
  route: { cleanUrls: true },
});
```

This mirrors the `multi` example site. The first package has no `baseRoute`, so its pages mount at its own namespace, `/kitchensink/api`; the second overrides the default with `/versioned`. You only need to set `baseRoute` when you want a route other than the per-package default.

## Required fields differ from single-API mode

In `apis` mode, `model` is required on every entry. There is no `versions` field, so each package needs an explicit model. `packageName` is required as always. Everything else (`name`, `packageJson`, `tsconfig`, `theme`, `categories`, `source`, `externalPackages`, `ogImage`, `llmsPlugin`) is optional and behaves just as it does in the single-package recipe, with one exception: `tsconfig` and `compilerOptions` are shared across the whole portal. Twoslash type-checks all code examples in one shared TypeScript environment, so the first entry that provides a `tsconfig` wins and the rest are ignored with a warning. Make them equivalent across entries, or set the intended one on the first entry only.

## Portal from a directory of models

When your packages sit in a predictable folder layout, the [config helpers](./03-config-helpers.md) build the `apis` array for you. `apis.fromDir` scans a parent directory and returns one config per subfolder:

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

Each subfolder becomes one package, with its `baseRoute` defaulting to `/{packageName}/api` unless you override it. The shared options — here, `theme` — apply to every package. To include only some folders, call `api.fromDir` per package instead of scanning the whole directory.

## Per-package LLMs files

With LLMs enabled, a multi-package portal writes scoped `llms*.txt` files under each package's route and a structured global `llms.txt` grouped by package. See the [LLMs guide](./09-llms.md).

## Next steps

- [Config helpers](./03-config-helpers.md) — `api.fromDir` and `apis.fromDir` in depth.
- [Multi-entry points](./08-multi-entry-points.md) — when a single package exposes more than one entry point.
- [Troubleshooting](./11-troubleshooting.md) — what a route collision looks like and how to fix it.
