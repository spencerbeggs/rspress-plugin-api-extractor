---
"rspress-plugin-api-extractor": patch
---

## Bug Fixes

Fixes spurious `TS2353 "X does not exist in type"` Twoslash errors on valid nested-struct fields in API doc code blocks for packages that use Effect Schema companion types (the `const T + type T` pattern). The type reference extractor now imports the namespace root (e.g., `Schema`) rather than a leaf member (e.g., `Struct`), matching the qualified form used in reconstructed `.d.ts` declarations. Previously, importing only the leaf left the namespace identifier undefined, causing companion types like `type T = typeof T.Type` to collapse to an error type in hover rendering.
