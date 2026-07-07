---
"rspress-plugin-api-extractor": patch
---

## Bug Fixes

- Added `@effect/cluster`, `@effect/experimental`, `@effect/rpc`, and `@effect/workflow` as direct dependencies to complete the `@effect/*` peer dependency closure. Previously only `@effect/platform-node`, `@effect/sql`, and `@effect/sql-sqlite-node` were declared, so their non-optional peers escaped to the consuming workspace and, with `autoInstallPeers`, could resolve to an incompatible `effect` version (#69).

## Dependencies

| Dependency           | Type       | Action | From | To     |
| -------------------- | ---------- | ------ | ---- | ------ |
| @effect/cluster      | dependency | added  | —    | 0.59.0 |
| @effect/experimental | dependency | added  | —    | 0.60.0 |
| @effect/rpc          | dependency | added  | —    | 0.75.1 |
| @effect/workflow     | dependency | added  | —    | 0.18.2 |
