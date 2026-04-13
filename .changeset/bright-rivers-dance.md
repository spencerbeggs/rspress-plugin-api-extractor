---
"rspress-plugin-api-extractor": minor
---

## Features

### Multi-Entry Point Support

Packages with multiple entry points (e.g., `"."` and `"./testing"`) are now fully supported in the doc generation pipeline. The plugin automatically processes all entry points from merged API Extractor models.

- **Deduplication**: Re-exported items that appear in multiple entry points are documented once, with an "Available from" line listing all import paths
- **Collision handling**: When different items share the same display name across entry points, URLs are disambiguated with entry-point segments (e.g., `/class/default/config` vs `/class/testing/config`) and navigation labels include qualifiers
- **Backward compatible**: Single-entry packages produce identical output to previous versions

## Bug Fixes

### MDX Parse Errors from Generics in Code Spans

Fixed MDX parse errors caused by unescaped generic type parameters (e.g., `<I, O>`) appearing outside backtick code spans in generated documentation. Both the cross-linker and the MDX generics escaper now detect backtick code spans and skip processing inside them, preventing broken markup like `` `[Pipeline](/path)`<I, O>` ``.
