# rspress-plugin-api-extractor

[![npm](https://img.shields.io/npm/v/rspress-plugin-api-extractor?label=npm&color=cb3837)](https://www.npmjs.com/package/rspress-plugin-api-extractor)
[![License: MIT](https://img.shields.io/badge/License-MIT-4caf50.svg)](https://opensource.org/licenses/MIT)
[![Node.js %3E%3D24.11.0](https://img.shields.io/badge/Node.js-%3E%3D24.11.0-5fa04e.svg)](https://nodejs.org/)
[![TypeScript 6.0](https://img.shields.io/badge/TypeScript-6.0-3178c6.svg)](https://www.typescriptlang.org/)

An [RSPress](https://rspress.dev/) 2.0 plugin that generates interactive API documentation from [Microsoft API Extractor](https://api-extractor.com/) models. Point it at your `.api.json` files and you get a documentation site: syntax-highlighted signatures, Twoslash hover tooltips, type references that cross-link between pages and copy-paste code examples.

## Install

```bash
npm install rspress-plugin-api-extractor
# or
pnpm add rspress-plugin-api-extractor
```

The plugin is a peer of `@rspress/core`, `react` and `react-dom`; install those too if your site does not already have them.

## Quick start

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

```bash
npx rspress dev
# Generates one MDX page per public API item and serves them at http://localhost:3000
```

The plugin reads your `.api.json` model and writes one MDX page per public API item under your docs root, grouped into category folders (classes, interfaces, functions, type aliases, enums, variables and namespaces) with navigation metadata. To produce the model, pair it with [@savvy-web/rslib-builder](https://github.com/savvy-web/rslib-builder), which emits the `.api.json` as part of your TypeScript build.

## Features

- Generates API docs from `.api.json` models for classes, interfaces, functions, type aliases, enums, variables and namespaces.
- Type-checks code examples and adds Twoslash hover tooltips that show inferred types.
- Cross-links type references between pages, so a type named in a signature links to its own page.
- Inlines compiler-generated base declarations (the `Foo_base` pattern from Effect `Schema.Class` and mixin factories) in a "Base Class" section on the owning class page instead of documenting them as orphan variables.
- Drives single-package sites, multi-package portals, RSPress multiVersion and i18n from one plugin.
- Handles multi-entry-point packages: it deduplicates re-exports and notes which entry points each item is available from.
- Writes per-package `llms*.txt` files and in-page actions for pointing an assistant at one package's docs.

## Documentation

- [Getting started](https://github.com/spencerbeggs/rspress-plugin-api-extractor/blob/main/docs/01-getting-started.md) — Install, minimal config, first build.
- [Configuration](https://github.com/spencerbeggs/rspress-plugin-api-extractor/blob/main/docs/02-configuration.md) — Full plugin-options reference.
- [Config helpers](https://github.com/spencerbeggs/rspress-plugin-api-extractor/blob/main/docs/03-config-helpers.md) — `api.fromDir` and `apis.fromDir` for discovering config from package folders.
- [Single package](https://github.com/spencerbeggs/rspress-plugin-api-extractor/blob/main/docs/04-single-package.md) — The single-API recipe.
- [Multi-package](https://github.com/spencerbeggs/rspress-plugin-api-extractor/blob/main/docs/05-multi-package.md) — The multi-API portal recipe.
- [Versioned](https://github.com/spencerbeggs/rspress-plugin-api-extractor/blob/main/docs/06-versioned.md) — Documenting major versions side by side.
- [i18n](https://github.com/spencerbeggs/rspress-plugin-api-extractor/blob/main/docs/07-i18n.md) — Internationalized documentation.
- [Multi-entry points](https://github.com/spencerbeggs/rspress-plugin-api-extractor/blob/main/docs/08-multi-entry-points.md) — Deduplication, "Available from" and route collisions.
- [LLMs](https://github.com/spencerbeggs/rspress-plugin-api-extractor/blob/main/docs/09-llms.md) — Per-package `llms*.txt` files and assistant actions.
- [Runtime components](https://github.com/spencerbeggs/rspress-plugin-api-extractor/blob/main/docs/10-runtime-components.md) — The runtime components and live `with-api` code blocks.
- [Troubleshooting](https://github.com/spencerbeggs/rspress-plugin-api-extractor/blob/main/docs/11-troubleshooting.md) — Route collisions, forgotten exports, Twoslash errors and stale caches.

## License

[MIT](LICENSE)
