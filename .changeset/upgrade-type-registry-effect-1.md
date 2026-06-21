---
"rspress-plugin-api-extractor": patch
---

## Dependencies

| Dependency | Type | Action | From | To |
| :--------- | :--------- | :------ | :----- | :----- |
| type-registry-effect | dependency | updated | ^0.2.3 | ^1.0.0 |

## Performance

* External package types are now fetched once per build. Previously the build fetched the external type VFS twice — once to assemble the combined VFS, and again inside a TypeScript-environment pre-build that Twoslash discarded. The redundant fetch and pre-build are removed.

## Bug Fixes

* Restored single-sourced build logging for external type loading. type-registry-effect v1 surfaces typed events instead of writing logs; the plugin now forwards those events to its own logger, so external-type progress is reported once in the plugin's configured format and log level. Previously the same operations were printed twice — once by the plugin runtime and once by a separate default-logger runtime.
