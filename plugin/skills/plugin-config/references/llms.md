# LLMs

The plugin extends RSPress's LLMs support with per-package text files and in-page actions, so a reader can point an assistant at one package's docs rather than the whole site. Load this when configuring `llmsPlugin`, or when `llms*.txt` files are missing.

## Prerequisite: RSPress `llms: true`

The integration is a **post-processing step** over the `llms.txt` / `llms-full.txt` that RSPress itself generates. Enable RSPress's own LLMs support first:

```ts
export default defineConfig({
  root: "docs",
  llms: true,                              // required — RSPress's own LLMs plugin
  plugins: [
    ApiExtractorPlugin({
      api: { packageName: "my-library", model: "./api/my-library.api.json" },
      llmsPlugin: { scopes: true },
    }),
  ],
});
```

Without `llms: true` there are no global files to process and the integration stays dormant — this is the single most common "nothing happens" cause. Both `llms: true` and `llmsPlugin.enabled` must be on. See [troubleshooting.md](./troubleshooting.md).

## Configuration

`llmsPlugin` takes `true` for defaults or an object. It can be set at three levels, in increasing precedence: globally on the plugin options, per-API on an `api`/`apis` entry, and per-version inside a `versions` entry.

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

With `scopes` enabled, four files are written under each package's route:

| File | Contents |
| --- | --- |
| `llms.txt` | Per-package index — links to that package's guides and API pages. |
| `llms-full.txt` | Full guide and API page content for the package. |
| `llms-docs.txt` | Guide-only content (no API pages). |
| `llms-api.txt` | API-only content. Written when `apiTxt` is enabled. |

For a package at `/my-library`, these land at `/my-library/llms.txt`, `/my-library/llms-full.txt`, and so on. The global `llms.txt` at the site root is rewritten into sections grouped by package, each with its version, description and a pointer to that package's `llms-api.txt`.

Disable `scopes` and the plugin does less: it filters API pages out of the global files and appends pointers to per-package files, without writing the four scoped files.

## In-page actions

The plugin adds package-scoped actions — copy the package's docs, copy the `llms.txt` link, open the package in ChatGPT or Claude with a scoped prompt — into the LLMs UI RSPress already renders. RSPress's `themeConfig.llmsUI.placement` decides where they appear:

```ts
themeConfig: {
  llmsUI: {
    viewOptions: ["markdownLink", "chatgpt", "claude"],
    placement: "outline",     // or "title"
  },
}
```

- `placement: "outline"` injects the actions into the page outline sidebar.
- `placement: "title"` adds them to the view-options dropdown beside the page title.

## Versioned and localized sites

On versioned or localized sites, the per-package files are written under each version or locale prefix, so an assistant can be scoped to a specific version's or locale's docs as well as a specific package.
