---
"rspress-plugin-api-extractor": minor
---

## Features

### Migrated to Effect v4

The plugin's build orchestration now runs on Effect v4 (`effect@4.0.0-beta.98`) instead of Effect v3. The public plugin API is unchanged — `ApiExtractorPlugin`, the `api.fromDir`/`apis.fromDir` config helpers, `serve()`, and the runtime components all keep identical call signatures and behavior. Behavioral parity was verified against the full test suite and an end-to-end site build producing an identical generated page set.

What changed under the hood, visible at the dependency-graph and type level:

- `@effect/platform` and `@effect/sql` are gone — their functionality merged into the `effect` core (`FileSystem` is now a top-level module; SQL lives at `effect/unstable/sql`). `@effect/platform-node` and `@effect/sql-sqlite-node` remain as the Node platform implementations.
- The exported plugin option types (`PluginOptions`, `SingleApiConfig`, `MultiApiConfig`, `CategoryConfig`, and related config types) are now derived from Effect v4 schemas. Field sets and defaults are unchanged, but the generated TypeScript types are `readonly`-field variants — code that mutates a config object after constructing it will now fail to compile.
- External package type loading (for Twoslash hover/type-checking) now runs on `type-registry-effect@2`, which caches downloaded types under the OS XDG cache directory (namespace `type-registry-effect`) with a SQLite metadata plane, replacing the previous internal cache layout. The first build after upgrading will re-fetch external package types into the new cache location; no configuration change is required.

No consumer-facing config options, routes, or generated output changed as part of this migration.
