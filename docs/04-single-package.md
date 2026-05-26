# Single package

The single-package recipe documents one library. It uses the `api` block and is where most projects start. This guide builds on [Getting started](./01-getting-started.md) with the full set of placement and presentation options.

## Baseline

```ts
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
        theme: {
          light: "github-light-default",
          dark: "github-dark-default",
        },
      },
    }),
  ],
  route: { cleanUrls: true },
});
```

This mirrors the `basic` example site. It documents one package called `my-library`, nests every page under an `api/` folder and sets the GitHub light/dark Shiki themes.

## Choosing where pages land

Two fields decide the routes:

- `apiFolder` nests pages under a single folder segment. With `apiFolder: "api"`, a class page lands at `/api/class/myclass`. Set it to `null` (or omit it) to write categories at the root: `/class/myclass`.
- `baseRoute` prefixes the entire API. With `baseRoute: "/reference"` and `apiFolder: "api"`, the class lands at `/reference/api/class/myclass`.

Pick whichever keeps your generated API pages out of the way of your hand-written guides. A common layout is hand-written pages at the root and generated reference under `apiFolder: "api"`.

## Display name

`packageName` is the npm name and supplies the import lines in code examples. `name` is the label readers see in page titles and the sidebar. Omit `name` and the package name is used as-is. Set it when the npm name is not what you want on the page:

```ts
api: {
  packageName: "@acme/widget-kit",
  name: "Widget Kit",
  model: path.join(__dirname, "api/widget-kit.api.json"),
}
```

## Adding source links

Point `source` at your repository to turn each documented item into a "view source" link:

```ts
api: {
  packageName: "my-library",
  model: path.join(__dirname, "api/my-library.api.json"),
  source: {
    url: "https://github.com/me/my-library",
    ref: "main",
  },
}
```

## Type-checked examples

Supply `tsconfig` (and `packageJson`) and the code examples in both the generated pages and your own guides get type-checked and gain hover tooltips. The plugin loads the documented package's own types from the model and pulls in dependency types on its own. If an example references a type from another package that auto-detection misses, add it to `externalPackages`:

```ts
api: {
  packageName: "my-library",
  model: path.join(__dirname, "api/my-library.api.json"),
  packageJson: path.join(__dirname, "api/package.json"),
  tsconfig: path.join(__dirname, "api/tsconfig.json"),
  externalPackages: [{ name: "zod", version: "^3.22.4" }],
}
```

## Build and preview

```bash
npx rspress dev
# Generates pages and serves them with hot reload at http://localhost:3000

npx rspress build
# Writes the static site to outDir (dist/ here)
```

The first build generates every page; later builds only rewrite pages whose content changed.

## Next steps

- [Versioned](./06-versioned.md) — keep this single package and add RSPress multiVersion.
- [i18n](./07-i18n.md) — add translated documentation.
- [Runtime components](./10-runtime-components.md) — embed live, type-checked examples in your own guides.
