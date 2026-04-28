# rspress-plugin-api-extractor

## 0.1.0

### Features

* [`10e00ec`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/10e00ec49083bfbbe3dc35506bc1545eee514605) ### Multi-Entry Point Support

Packages with multiple entry points (e.g., `"."` and `"./testing"`) are now fully supported in the doc generation pipeline. The plugin automatically processes all entry points from merged API Extractor models.

* **Deduplication**: Re-exported items that appear in multiple entry points are documented once, with an "Available from" line listing all import paths
* **Collision handling**: When different items share the same display name across entry points, URLs are disambiguated with entry-point segments (e.g., `/class/default/config` vs `/class/testing/config`) and navigation labels include qualifiers
* **Backward compatible**: Single-entry packages produce identical output to previous versions

- [`b033d15`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/b033d1555ef695e01b70f2701bf64063ca18e8d7) ### LLMs.txt Integration

Added scope-aware LLMs integration that generates and post-processes the text files RSPress produces for LLM consumption.

After each build, the plugin post-processes RSPress's top-level `llms.txt` and `llms-full.txt` to remove generated API pages, keeping those files clean for human-authored documentation. In their place, the plugin generates four files at each API package's output directory scope:

* `llms.txt` — links to all pages in that package's documentation scope
* `llms-full.txt` — full page content for all pages in that scope
* `llms-docs.txt` — links to human-authored guide pages only
* `llms-api.txt` — links to generated API reference pages only

The global `llms.txt` is restructured with `## Others` and `## Packages` sections, grouping pages by package scope so the top-level file remains navigable alongside the per-package files.

### Bug Fixes

* [`10e00ec`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/10e00ec49083bfbbe3dc35506bc1545eee514605) ### MDX Parse Errors from Generics in Code Spans

Fixed MDX parse errors caused by unescaped generic type parameters (e.g., `<I, O>`) appearing outside backtick code spans in generated documentation. Both the cross-linker and the MDX generics escaper now detect backtick code spans and skip processing inside them, preventing broken markup like `` `[Pipeline](/path)`<I, O>` ``.

### Scope-Aware LlmsViewOptions Component

Added a `resolve.alias` replacement for RSPress's built-in `LlmsViewOptions` component. When a user is browsing within a package scope, the title-mode dropdown gains additional actions to open or copy the four package-scoped LLMs files alongside the existing site-wide options.

### Package-Level Actions in Outline Panel

Added `ApiLlmsPackageActions`, a React component that injects per-package LLMs copy/open actions into RSPress's outline panel via React portals when viewing a page within a package scope. This provides outline-mode access to the same package-scoped files without duplicating controls in the title bar.

### LlmsPlugin Schema

Added `scopes` and `apiTxt` fields to the `LlmsPlugin` configuration schema. All LLMs features activate automatically when `llms: true` is set in the RSPress config. To disable, set `llmsPlugin: { enabled: false }` in the plugin options. Individual features can also be selectively disabled through this schema.
