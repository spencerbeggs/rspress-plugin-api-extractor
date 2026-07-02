---
"rspress-plugin-api-extractor": patch
---

## Bug Fixes

- Updated `type-registry-effect` to `^1.0.2`, fixing broken bundled type declarations shipped in `1.0.1`. The prior release left dangling `TypeRegistryModule`/`VirtualPackageModule` namespace references in its `.d.ts`, which could fail downstream typechecks with errors like `Property 'generateVfs' does not exist on type 'ApiExtractedPackage'`.

## Dependencies

| Dependency           | Type       | Action  | From   | To     |
| -------------------- | ---------- | ------- | ------ | ------ |
| semver-effect        | dependency | updated | ^0.2.1 | ^0.3.0 |
| type-registry-effect | dependency | updated | ^1.0.0 | ^1.0.2 |
