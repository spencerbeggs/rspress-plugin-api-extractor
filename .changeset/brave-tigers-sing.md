---
"rspress-plugin-api-extractor": minor
---

## Breaking Changes

### Config helper functions renamed and reorganized

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

### Renamed exports

| Before | After |
| :----- | :---- |
| `ApiExtractorPlugin.api.fromFolder` | `ApiExtractorPlugin.api.fromDir` |
| `ApiExtractorPlugin.api.fromModelsDir` | `ApiExtractorPlugin.apis.fromDir` |
| `FolderInfo` (type) | `DirInfo` |
| `FromFolderOptions` (type) | `FromDirOptions` |
| `FromModelsDirOptions` (type) | removed — both helpers now share `FromDirOptions` |

`BaseRoute` keeps its name; its callback signature now receives `DirInfo` instead of `FolderInfo`.

### Context-aware `baseRoute` default

Previously `api.fromFolder` injected a `"{dirname}"` template as the default `baseRoute`, causing single-API sites to mount docs at `/{dirname}/api` (e.g. `/kitchensink/api`) instead of the intended `/api`. This default has been removed from the helpers.

The plugin now applies a context-aware default during resolution:

- Under the `api:` option (single API): defaults to `/api`
- Under the `apis:` option (multi-API): defaults to `/{packageName}/api`

If you relied on the old `/{dirname}/api` mount, pass an explicit `baseRoute`:

```typescript
// Preserve the old behavior explicitly
ApiExtractorPlugin.api.fromDir("./modules/kitchensink", {
  baseRoute: "{dirname}",
});
```

## Features

### `serve()` dev/preview server runner

Added `serve(options?)` to the main entry for running an RSPress dev or preview server without hand-copying a launch script between projects:

```typescript
import { serve } from "rspress-plugin-api-extractor";

await serve({ mode: "dev", openPath: "/api/" });
```

It frees the target port, spawns `rspress dev|preview`, streams output, and opens a browser once the server is ready. Options: `mode` (`"dev"` or `"preview"`), `port`, `open`, `openPath`, `packageManager`, `cwd`, and a `readyWhen` override. The pure helpers `isServerReady` and `resolveServeConfig`, plus the `ServeOptions`, `ServeMode` and `ResolvedServeConfig` types, are exported alongside it.

### RSPress tsconfig export

Added a `rspress-plugin-api-extractor/tsconfig/rspress.json` export — a standard RSPress/React-JSX tsconfig that documentation sites can extend instead of hand-writing one:

```jsonc
{
  "extends": ["rspress-plugin-api-extractor/tsconfig/rspress.json"]
}
```