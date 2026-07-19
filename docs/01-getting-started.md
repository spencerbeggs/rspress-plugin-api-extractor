# Getting started

Install the plugin, point it at one API Extractor model and run your first build. This guide covers the minimal single-API setup. The recipes and the configuration reference take it from there.

## Install

```bash
npm install rspress-plugin-api-extractor
# or
pnpm add rspress-plugin-api-extractor
```

The plugin is a peer of `@rspress/core` and `react` / `react-dom`. If you already have an RSPress 2.0 site, those are present; otherwise install them too:

```bash
npm install @rspress/core react react-dom
```

The package also ships a base RSPress tsconfig you can extend in your site's `tsconfig.json`:

```json
{
  "extends": ["rspress-plugin-api-extractor/tsconfig/rspress.json"]
}
```

## What you need first

The plugin reads a Microsoft [API Extractor](https://api-extractor.com/) model — a `.api.json` file that describes your package's public API. You produce this file when you build your library. If you build with [@savvy-web/bundler](https://github.com/savvy-web/bundler), a production build emits the model into `dist/prod/<group>/meta/` with no extra configuration. Otherwise run API Extractor yourself with `"docModel": { "enabled": true }` in `api-extractor.json`.

You point the plugin at three things per API:

- `model` — the `.api.json` file (required)
- `packageJson` — your library's `package.json`, used for the package version and dependency auto-detection (optional but recommended)
- `tsconfig` — a `tsconfig.json` used to type-check the interactive code examples (optional)

## Minimal configuration

Add the plugin to `rspress.config.ts` and give it a single `api` block:

```ts
// rspress.config.ts
import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

export default defineConfig({
  root: "docs",
  plugins: [
    ApiExtractorPlugin({
      api: {
        packageName: "my-library",
        model: "./api/my-library.api.json",
      },
    }),
  ],
});
```

`packageName` is the npm name of the package you are documenting. It labels the generated pages and supplies the import lines shown in examples. `model` is the path to your `.api.json` file, resolved relative to the RSPress project root.

So the path resolves the same way on every machine, resolve `model` from the config file's own location rather than the process working directory:

```ts
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

ApiExtractorPlugin({
  api: {
    packageName: "my-library",
    model: path.join(__dirname, "api/my-library.api.json"),
    packageJson: path.join(__dirname, "api/package.json"),
    tsconfig: path.join(__dirname, "api/tsconfig.json"),
  },
});
```

## Run the build

Start the dev server to generate pages and preview them with hot reload:

```bash
npx rspress dev
# Pages are generated under your docs root and served at http://localhost:3000
```

Build the static site for production:

```bash
npx rspress build
# Static output is written to your configured outDir (default dist/)
```

On the first run the plugin reads the model, writes one MDX page per public API item and builds a navigation sidebar. Items are grouped into category folders: classes, interfaces, functions, type aliases, enums, variables and namespaces. Later builds rewrite only the pages whose content actually changed, so unchanged pages keep their files and timestamps.

## Where pages land

With the config above, `apiFolder` defaults to `"api"`, so pages are served under `/api` at routes like `/api/class/mylibrary` and `/api/function/create`. Set `apiFolder: null` to drop the folder and serve pages at the docs root, or set `baseRoute` to prefix the whole API. The single-package recipe walks through these placement options.

## Next steps

- [Configuration](./02-configuration.md) — the full plugin-options reference.
- [Single package](./04-single-package.md) — the complete single-API recipe.
- [Troubleshooting](./11-troubleshooting.md) — what to do when the build fails or a page looks wrong.
