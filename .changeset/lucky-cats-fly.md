---
"rspress-plugin-api-extractor": minor
---

## Features

### LLMs.txt Integration

Added scope-aware LLMs integration that generates and post-processes the text files RSPress produces for LLM consumption.

After each build, the plugin post-processes RSPress's top-level `llms.txt` and `llms-full.txt` to remove generated API pages, keeping those files clean for human-authored documentation. In their place, the plugin generates four files at each API package's output directory scope:

- `llms.txt` — links to all pages in that package's documentation scope
- `llms-full.txt` — full page content for all pages in that scope
- `llms-docs.txt` — links to human-authored guide pages only
- `llms-api.txt` — links to generated API reference pages only

The global `llms.txt` is restructured with `## Others` and `## Packages` sections, grouping pages by package scope so the top-level file remains navigable alongside the per-package files.

### Scope-Aware LlmsViewOptions Component

Added a `resolve.alias` replacement for RSPress's built-in `LlmsViewOptions` component. When a user is browsing within a package scope, the title-mode dropdown gains additional actions to open or copy the four package-scoped LLMs files alongside the existing site-wide options.

### Package-Level Actions in Outline Panel

Added `ApiLlmsPackageActions`, a React component that injects per-package LLMs copy/open actions into RSPress's outline panel via React portals when viewing a page within a package scope. This provides outline-mode access to the same package-scoped files without duplicating controls in the title bar.

### LlmsPlugin Schema

Added `scopes` and `apiTxt` fields to the `LlmsPlugin` configuration schema. All new LLMs features are enabled by default and can be selectively disabled through this schema.
