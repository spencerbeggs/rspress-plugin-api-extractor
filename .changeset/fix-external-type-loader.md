---
"rspress-plugin-api-extractor": patch
---

## Bug Fixes

External package types now load reliably for documentation code examples.

* Auto-detected external package versions are resolved to exact published versions before their types are fetched. The type-registry CDN requires an exact version and rejected semver ranges (e.g. `^4.1.0`) and npm tags, which silently emptied the type VFS and broke Twoslash hover and type-checking across every example.
* Workspace-only and unpublished packages are now skipped instead of failing the whole batch. A package whose version cannot be resolved to a published release is dropped, so one local dependency no longer prevents all external types from loading.
* `.d.ts` reconstruction no longer emits invalid declarations for arrow-function consts (e.g. `name: (args) => ret`) that API Extractor reports as functions. These were written without the `const` keyword, producing parse errors that corrupted type resolution in the virtual file system.
