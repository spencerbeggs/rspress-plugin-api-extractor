# rspress-plugin-api-extractor

[![npm version](https://img.shields.io/npm/v/rspress-plugin-api-extractor)](https://www.npmjs.com/package/rspress-plugin-api-extractor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An [RSPress](https://rspress.dev/) plugin that generates interactive API
documentation from
[Microsoft API Extractor](https://api-extractor.com/) models. Point it at your
`.api.json` files and get a full documentation site with syntax-highlighted
signatures, Twoslash hover tooltips, cross-linked type references, and
copy-paste code examples.

## Features

- Generate complete API docs from `.api.json` models (classes, interfaces,
  functions, types, enums, variables, namespaces)
- Interactive Twoslash tooltips with type information on hover
- Automatic cross-linking between type references across your API
- Single-package sites with RSPress multiVersion and i18n support
- Multi-package documentation portals
- SSG-compatible React components that output clean markdown for LLM
  consumption

## Installation

```bash
npm install rspress-plugin-api-extractor
```

## Quick Start

```typescript
// rspress.config.ts
import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

export default defineConfig({
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

The plugin reads your `.api.json` model and generates MDX pages under your
docs directory, organized by category (classes, interfaces, functions, etc.)
with full navigation metadata.

## Configuration Modes

### Single API (`api`)

For single-package documentation sites. Supports RSPress multiVersion and
i18n:

```typescript
ApiExtractorPlugin({
  api: {
    packageName: "my-library",
    model: "./api/my-library.api.json",
    packageJson: "./dist/package.json",
    tsconfig: "./tsconfig.json",
  },
})
```

### Multi API (`apis`)

For documentation portals hosting multiple packages:

```typescript
ApiExtractorPlugin({
  apis: [
    { packageName: "core", model: "./api/core.api.json" },
    { packageName: "utils", model: "./api/utils.api.json" },
  ],
})
```

## Companion Build Tool

This plugin is designed to work with
[@savvy-web/rslib-builder](https://github.com/savvy-web/rslib-builder),
which generates `.api.json` models as part of the TypeScript build pipeline
via `apiModel: true`.

## Repository Structure

This is a monorepo with the plugin source and test infrastructure:

| Directory | Purpose |
| --------- | ------- |
| `plugin/` | The published `rspress-plugin-api-extractor` package |
| `modules/` | Example TypeScript modules for testing |
| `sites/` | RSPress test sites covering different configurations |

## Development

```bash
pnpm install
pnpm run build        # Build modules + plugin
pnpm dev              # Start the basic test site with HMR
pnpm dev:versioned    # Start the versioned test site
pnpm dev:i18n         # Start the i18n test site
pnpm dev:multi        # Start the multi-API portal test site
```

## License

[MIT](LICENSE)
