# rspress-plugin-api-extractor

## 0.2.1

### Bug Fixes

* [`df28b81`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/df28b81b974223295c7856c0208b8f956675b358) Moved `unist-util-visit` package to a direct dependency.

## 0.2.0

### Breaking Changes

* [`22411d8`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/22411d851c805adf4131adc96b0eff70609b246a) ### Config helper functions renamed and reorganized

The config-helper factory functions exposed on `ApiExtractorPlugin` have been renamed and split into two namespaces that match the option they produce for.

**Before:**

```typescript
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

// Single package folder → one config for the `api:` option
const api = ApiExtractorPlugin.api.fromFolder("./modules/kitchensink");

// Parent directory → array of configs for the `apis:` option
const apis = ApiExtractorPlugin.api.fromModelsDir("./modules");
```

**After:**

```typescript
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

// Single package folder → one config for the `api:` option
const api = ApiExtractorPlugin.api.fromDir("./modules/kitchensink");

// Parent directory → array of configs for the `apis:` option
const apis = ApiExtractorPlugin.apis.fromDir("./modules");
```

### Features

* [`22411d8`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/22411d851c805adf4131adc96b0eff70609b246a) ### `serve()` dev/preview server runner

Added `serve(options?)` to the main entry for running an RSPress dev or preview server without hand-copying a launch script between projects:

```typescript
import { serve } from "rspress-plugin-api-extractor";

await serve({ mode: "dev", openPath: "/api/" });
```

It frees the target port, spawns `rspress dev|preview`, streams output, and opens a browser once the server is ready. Options: `mode` (`"dev"` or `"preview"`), `port`, `open`, `openPath`, `packageManager`, `cwd`, and a `readyWhen` override. The pure helpers `isServerReady` and `resolveServeConfig`, plus the `ServeOptions`, `ServeMode` and `ResolvedServeConfig` types, are exported alongside it.

### Renamed exports

| Before                                 | After                                             |
| :------------------------------------- | :------------------------------------------------ |
| `ApiExtractorPlugin.api.fromFolder`    | `ApiExtractorPlugin.api.fromDir`                  |
| `ApiExtractorPlugin.api.fromModelsDir` | `ApiExtractorPlugin.apis.fromDir`                 |
| `FolderInfo` (type)                    | `DirInfo`                                         |
| `FromFolderOptions` (type)             | `FromDirOptions`                                  |
| `FromModelsDirOptions` (type)          | removed — both helpers now share `FromDirOptions` |

`BaseRoute` keeps its name; its callback signature now receives `DirInfo` instead of `FolderInfo`.

### Context-aware `baseRoute` default

Previously `api.fromFolder` injected a `"{dirname}"` template as the default `baseRoute`, causing single-API sites to mount docs at `/{dirname}/api` (e.g. `/kitchensink/api`) instead of the intended `/api`. This default has been removed from the helpers.

The plugin now applies a context-aware default during resolution:

* Under the `api:` option (single API): defaults to `/api`
* Under the `apis:` option (multi-API): defaults to `/{packageName}/api`

If you relied on the old `/{dirname}/api` mount, pass an explicit `baseRoute`:

```typescript
// Preserve the old behavior explicitly
ApiExtractorPlugin.api.fromDir("./modules/kitchensink", {
  baseRoute: "{dirname}",
});
```

### RSPress tsconfig export

Added a `rspress-plugin-api-extractor/tsconfig/rspress.json` export — a standard RSPress/React-JSX tsconfig that documentation sites can extend instead of hand-writing one:

```jsonc
{
  "extends": ["rspress-plugin-api-extractor/tsconfig/rspress.json"],
}
```

## 0.1.2

### Bug Fixes

* [`43bbeff`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/43bbeff9662e2dd388f76617041e0b1fe68bb54d) Fixes a crash that occurred when the plugin was installed from npm and an RSPress site was built with `llms: true`. Previously, the plugin registered its SSG runtime components (`ApiLlmsPackageActions`, `LlmsViewOptions` alias) using source `.tsx` paths that only resolved in the local linked-workspace layout. Published installs failed with "Module not found … ApiLlmsPackageActions/index.tsx" and a cascading `LlmsViewOptions` linking error.

The root cause was that the precompiled runtime bundle froze `import.meta.env.SSG_MD` to `undefined`, making RSPress unable to apply its SSG-MD markdown rendering pass. The fix updates to `@savvy-web/rslib-builder@^0.21.0`, which emits the React runtime bundleless (per-file compiled JS under `dist/runtime/`) so RSPress compiles the SSG components directly and resolves `import.meta.env.SSG_MD` per site build. `globalUIComponents` and the `LlmsViewOptions` alias are now registered against the published transpiled `.js` files.

No public API, configuration options, or exports changed — `apiExtractor({...})` usage is identical; `llms: true` now works correctly for published installs.

### Refactoring

* [`fb86ff4`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/fb86ff418b86a4c0c96ae0448dc45334987f652f) Delegates previously duplicated pure logic to the new `api-extractor-llms` runtime dependency. Model loading, type-signature formatting, TSDoc extraction helpers, and prose cross-linking now route through shared library implementations. Public config surface, route schemes, RSPress integration, and generated output are unchanged.

### Dependencies

* | [`fb86ff4`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/fb86ff418b86a4c0c96ae0448dc45334987f652f) | Dependency | Type  | Action | From  | To |
  | :------------------------------------------------------------------------------------------------------------------------ | :--------- | :---- | :----- | :---- | -- |
  | api-extractor-llms                                                                                                        | dependency | added | —      | 0.1.0 |    |

- | [`43bbeff`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/43bbeff9662e2dd388f76617041e0b1fe68bb54d) | Dependency    | Type    | Action   | From    | To |
  | :------------------------------------------------------------------------------------------------------------------------ | :------------ | :------ | :------- | :------ | -- |
  | @savvy-web/rslib-builder                                                                                                  | devDependency | updated | ^0.20.12 | ^0.21.0 |    |

## 0.1.1

### Bug Fixes

* [`8afe892`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/8afe89273d7503e08fa114e83c65d1f921bf53e4) Corrects turbo build order.

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
