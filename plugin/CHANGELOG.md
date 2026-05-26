# rspress-plugin-api-extractor

## 0.1.0

### Features

* [`de7f3d2`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/de7f3d2f542057c2039cfd36a915aeca0eea2a04) ### Initial Release — 0.1.0

`rspress-plugin-api-extractor` is an [RSPress 2.0](https://rspress.dev/) plugin that generates interactive API documentation directly from [Microsoft API Extractor](https://api-extractor.com/) `.api.json` models. It turns your TypeScript library's public API surface into syntax-highlighted, fully cross-linked documentation pages with Twoslash hover tooltips and copy-ready code examples.

Install the plugin and point it at your API model:

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

### Configuration Helpers

`ApiExtractorPlugin.api.fromFolder` and `ApiExtractorPlugin.api.fromModelsDir` derive all configuration automatically from an [`@savvy-web/rslib-builder`](https://github.com/savvy-web/rslib-builder) package folder — package name, version, model path, and TypeScript config are all resolved without manual specification.

### Multi-Package Portals

Pass an `apis` array instead of a single `api` object to document multiple packages in one site. Each package gets its own navigation scope, route prefix, and LLM text files.

### Multi-Version and i18n

RSPress `multiVersion` and `i18n` configurations are supported. Version prefixes and locale segments are handled automatically in both navigation and the generated LLM files.

### Multi-Entry Point Packages

Packages that expose more than one entry point (e.g. `.` and `./testing`) are fully supported. Re-exported items are deduplicated into a single page; each page displays an "Available from" line listing every entry point that exports it. Route collisions between two genuinely distinct items fail the build with an actionable error.

### SSG-Compatible Runtime Components

Runtime components (`SignatureBlock`, `MemberSignature`, `ExampleBlock`, `ParametersTable`, `EnumMembersTable`) implement a dual-mode pattern: they render interactive HTML in the browser and clean Markdown when RSPress is generating LLM text files via `import.meta.env.SSG_MD`.

### Per-Package LLM Text Files

When `@rspress/plugin-llms` is enabled, the plugin post-processes the global `llms.txt` and `llms-full.txt` files and generates per-package scoped equivalents — `llms.txt`, `llms-full.txt`, `llms-docs.txt`, and `llms-api.txt` — at each package's route prefix.
