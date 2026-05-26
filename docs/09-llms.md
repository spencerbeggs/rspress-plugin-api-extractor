# LLMs

The plugin extends RSPress's LLMs support with per-package text files and in-page actions, so you can point an assistant at the docs for one package rather than the whole site. It reads the `llms.txt` and `llms-full.txt` that RSPress generates, then splits and reorganizes them around the packages you document.

## Prerequisite

Enable RSPress's own LLMs plugin first by setting `llms: true` in your RSPress config. Without it there are no global LLMs files to process, and the integration stays dormant.

```ts
import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

export default defineConfig({
  root: "docs",
  llms: true,
  plugins: [
    ApiExtractorPlugin({
      api: { packageName: "my-library", model: "./api/my-library.api.json" },
      llmsPlugin: { scopes: true },
    }),
  ],
});
```

## Configuration

`llmsPlugin` takes `true` for defaults or an object to configure. You can set it at three levels, in increasing order of precedence: globally on the plugin options, per-API on an `api`/`apis` entry and per-version inside a `versions` entry.

| Field | Type | Default | Purpose |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | Turn the integration on or off. |
| `scopes` | boolean | `true` | Generate per-package files and scoped UI actions. |
| `apiTxt` | boolean | `true` | Generate `llms-api.txt` (API-only content). |
| `showCopyButton` | boolean | `true` | Show the copy button in the page UI. |
| `showViewOptions` | boolean | `true` | Show the view-options dropdown. |
| `copyButtonText` | string | `"Copy Markdown"` | Copy button label. |
| `viewOptions` | string array | `["markdownLink", "chatgpt", "claude"]` | Dropdown actions. |

## Generated files

With `scopes` enabled, the plugin writes four files under each package's route:

| File | Contents |
| --- | --- |
| `llms.txt` | Per-package index: links to that package's guides and API pages. |
| `llms-full.txt` | Full guide and API page content for the package. |
| `llms-docs.txt` | Guide-only content (no API pages). |
| `llms-api.txt` | API-only content. Written when `apiTxt` is enabled. |

For a package served at `/my-library`, these land at `/my-library/llms.txt`, `/my-library/llms-full.txt` and so on. The global `llms.txt` at the site root is rewritten into sections grouped by package, each with its version, description and a pointer to that package's `llms-api.txt`.

Disable `scopes` and the plugin does less: it filters API pages out of the global files and appends pointers to the per-package files, without writing the four scoped files.

## In-page actions

The plugin adds package-scoped actions to the LLMs UI RSPress already renders. On a page inside a documented package, readers can copy that package's docs, copy the `llms.txt` link or open the package in ChatGPT or Claude with a scoped prompt. RSPress's `llmsUI.placement` decides where these appear:

```ts
export default defineConfig({
  root: "docs",
  llms: true,
  themeConfig: {
    llmsUI: {
      viewOptions: ["markdownLink", "chatgpt", "claude"],
      placement: "outline",
    },
  },
  plugins: [
    ApiExtractorPlugin({
      api: { packageName: "my-library", model: "./api/my-library.api.json" },
      llmsPlugin: { scopes: true },
    }),
  ],
});
```

- `placement: "outline"` injects the package actions into the page outline sidebar.
- `placement: "title"` adds them to the view-options dropdown next to the page title.

## Versioned and localized sites

On versioned or localized sites, the per-package files are written under each version or locale prefix, so you can scope an assistant to a specific version's docs as well as a specific package.

## Next steps

- [Configuration](./02-configuration.md) — the `llmsPlugin` field summary alongside every other option.
- [Multi-package](./05-multi-package.md) — how the structured global `llms.txt` groups a portal by package.
