---
"rspress-plugin-api-extractor": minor
---

## Features

Auto-detection of external package types now includes runtime `dependencies` by default, not just `peerDependencies`.

* A documented package's public type surface is usually written against its runtime dependencies (for example an Effect-based API whose options are `Schema.Struct<…>` from `effect`). Those declarations must be in the virtual file system for Twoslash to resolve them in `with-api` examples and signatures. Previously only `peerDependencies` and the type-utility packages were fetched, so types from regular `dependencies` were missing.
* `autoDetectDependencies.dependencies` now defaults to `true`. `devDependencies` remains `false` and `peerDependencies` / `autoDependencies` remain `true`. Set `dependencies: false` to restore the previous peer-only behavior.
* Workspace-only and unpublished dependencies that cannot be resolved to a published version are dropped during loading, so broadening the default does not fail the build on local packages.

## Bug Fixes

* First-party packages (the ones being documented) are no longer fetched as external types. Their declarations come from their own generated virtual file system, which is authoritative — fetching a published version (when one exists) would overwrite the model-derived declarations, and when it does not exist (for example an optimistic next version) it produced a stream of 404 warnings. Documented package names are now excluded from external auto-detection.
* A single non-2xx fetch is now reported at debug rather than warning. These are routinely handled (an unpublished or workspace dependency that is then dropped); a package that genuinely fails to load is still reported at warning.
