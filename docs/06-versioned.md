# Versioned

When your library ships breaking changes across major versions, you can document each version side by side. The plugin hooks into RSPress's built-in multiVersion support. You declare the versions in `multiVersion`, then map each one to its own model through the `versions` field of a single `api` config.

## Recipe

```ts
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "docs",
  title: "Versioned API",
  outDir: "dist",
  multiVersion: {
    default: "v2",
    versions: ["v1", "v2"],
  },
  plugins: [
    ApiExtractorPlugin({
      logLevel: "info",
      api: {
        packageName: "my-library",
        versions: {
          v1: {
            model: path.join(__dirname, "api/v1/my-library.api.json"),
            packageJson: path.join(__dirname, "api/v1/package.json"),
          },
          v2: {
            model: path.join(__dirname, "api/v2/my-library.api.json"),
            packageJson: path.join(__dirname, "api/v2/package.json"),
          },
        },
        theme: { light: "github-light-default", dark: "github-dark-default" },
      },
    }),
  ],
  route: { cleanUrls: true },
});
```

This mirrors the `versioned` example site. It documents one package across two versions, with `v2` as the default.

## How the two pieces fit

RSPress's `multiVersion` field controls the version switcher and the URL structure. `default` is the version served at the root, and `versions` lists every version — RSPress prefixes the non-default ones, so `v1` is served at `/v1/...`. The plugin's `versions` record maps each of those version keys to the model that documents it. The keys must match the names in `multiVersion.versions`.

Each entry in `versions` is a version config carrying its own `model` and, optionally, its own `packageJson`, `categories`, `source`, `externalPackages`, `theme`, `ogImage` and `llmsPlugin`. A version can therefore override its presentation on its own, which helps when an older version's categories differ from the current one.

```ts
api: {
  packageName: "my-library",
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
}
```

A version entry can also be just a model path when it needs no other overrides:

```ts
versions: {
  v1: path.join(__dirname, "api/v1/my-library.api.json"),
  v2: path.join(__dirname, "api/v2/my-library.api.json"),
}
```

## Top-level fields are shared

Fields you set directly on `api` (like `theme` or `packageName`) apply to every version unless a version overrides them. Set the common configuration once at the `api` level and only put per-version differences inside `versions`.

## Next steps

- [Configuration](./02-configuration.md) — every field a version config can carry.
- [i18n](./07-i18n.md) — translations, which compose with versioning.
