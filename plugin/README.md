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

- Generate complete API docs from `.api.json` models (classes, interfaces, functions, types, enums, variables)
- Interactive Twoslash tooltips with type information on hover
- Automatic cross-linking between type references across your API
- Support for single-package sites, multi-package portals, and versioned documentation
- SSG-compatible React components that output clean markdown for LLM consumption

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

The plugin reads your `.api.json` model and generates MDX pages under your docs
directory, organized by category (classes, interfaces, functions, etc.) with
full navigation metadata.

## Documentation

For configuration options, multi-package setup, versioned docs, external
package types, and advanced usage, see [docs/](./docs/).

## License

[MIT](../LICENSE)
