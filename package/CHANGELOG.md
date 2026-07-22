# rspress-plugin-api-extractor

## 0.7.0

### Features

* ### Production build progress heartbeat

  Large multi-API builds (hundreds of pages) used to look hung — `rspress build` would sit silent for minutes. During production builds only, the plugin now emits a periodic one-line progress update while API docs generate:

  * **Resolve phase** — model/VFS loading progress, plus a per-tick delta
  * **Generate phase** — `N/total APIs · pages · code-blocks · elapsed (+delta)`

  Scheduling sleeps first, so a fast single-API build emits nothing. Controlled by a new option:

  ```typescript
  apiExtractor({
    observability: {
      progressInterval: 10, // seconds; false or 0 disables
    },
  })
  ```

  ### `.api-docs/build/issues.json` build issues artifact

  Production builds now write a machine-readable issues file so problems can be found and fixed without scrolling console output:

  ```typescript
  interface IssuesArtifact {
    generatedAt: string;
    package: string;
    target: string;
    warnings: Issue[];
    errors: Issue[];
    suppressed: Issue[];
  }

  interface Issue {
    source: string;
    level: "warn" | "error";
    text: string;
    code?: string;
    file?: string;
    line?: number;
    column?: number;
    api?: string;
  }
  ```

  It captures Twoslash diagnostics, Prettier/Shiki errors, config-validation warnings, route collisions, model-load failures, and build failures. The file is written in `afterBuild`, and best-effort on the `config()` failure path, so a fatal error still leaves an artifact behind to diagnose.

  ### Doc-build issues monitor

  A new Claude Code plugin monitor (`plugin/monitors/watch-issues.mjs`, registered in `plugin/monitors/monitors.json`) surfaces the issue count from `.api-docs/build/issues.json` in the background.

  ### Route collisions and model-load failures now reported

  `RouteCollisionDetected` and `ModelLoadFailed` events — previously defined but never emitted — now fire during the build, surfacing as typed `routing`/`model` issues in `issues.json` and on the console.

  ### File location changes

  All of the plugin's on-disk artifacts now live under a single `<cwd>/.api-docs/` directory, split by lifecycle:

  * `.api-docs/snapshot/api-docs.db` — the incremental-build snapshot database, **renamed** from `api-docs-snapshot.db` and **relocated** from the working-directory root. This is the one artifact a site may choose to commit, for build idempotency between CI and local.
  * `.api-docs/build/` — regenerated every build and gitignored: `issues.json` and the opt-in `trace-<buildId>.jsonl`.

  The database rename-and-move is graceful, not breaking: a missing database falls back to on-disk content comparison, preserving SEO timestamps and producing no spurious rewrites. No manual migration is required — delete any old `api-docs-snapshot.db`. Gitignore `.api-docs/` wholesale, or — to commit the snapshot for idempotency — gitignore `.api-docs/build/` plus the `.api-docs/snapshot/*.db-wal` / `*.db-shm` sidecars and commit `.api-docs/snapshot/`.

### Bug Fixes

* The plugin now honors RSPress's real `isProd` flag in the `config()` hook, rather than assuming production — the progress heartbeat and `issues.json` are correctly gated to production builds only.
* Fixed a YAML frontmatter parse error in the api-docs Claude Code plugin's `plugin-config` skill that caused it to load with empty metadata (and therefore never trigger).
* The `rspress-docs` agent now reaches for the `twoslash` skill first when diagnosing a Twoslash diagnostic instead of reading package or engine source, and treats diagnostics in the generated `api/` tree as upstream findings rather than edits. [#103][#103]

### Minor Changes

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

[#103]: https://github.com/spencerbeggs/rspress-plugin-api-extractor/pull/103

## 0.6.4

### Dependencies

* | Dependency | Type       | Action  | From   | To     |                                                                            |
  | ---------- | ---------- | ------- | ------ | ------ | -------------------------------------------------------------------------- |
  | prettier   | dependency | updated | ^3.9.5 | ^3.9.6 | [#100][#100] Thanks [@spencerbeggs](https://github.com/apps/spencerbeggs)! |

### Patch Changes

[#100]: https://github.com/spencerbeggs/rspress-plugin-api-extractor/pull/100

## 0.6.3

### Dependencies

* | Dependency              | Type       | Action  | From   | To     |                                                                          |
  | ----------------------- | ---------- | ------- | ------ | ------ | ------------------------------------------------------------------------ |
  | @effected/tsconfig-json | dependency | updated | ^0.2.7 | ^0.3.0 |                                                                          |
  | type-registry-effect    | dependency | updated | ^2.1.2 | ^2.2.0 | [#98][#98] Thanks [@spencerbeggs](https://github.com/apps/spencerbeggs)! |

### Patch Changes

[#98]: https://github.com/spencerbeggs/rspress-plugin-api-extractor/pull/98

## 0.6.2

### Bug Fixes

* Fixed namespace member routing when a member's simple name matches its category folder (e.g. an Effect Schema companion-namespace alias like `CompilerOptions.Type`) — this previously produced corrupted page paths with colliding `_meta.json` navigation entries, breaking the RSPress sidebar and failing the consumer's docs build. Only the final route segment is now replaced with the qualified name.
* Fixed incremental build cleanup to actually remove directories left empty by stale or orphaned file deletion. The sweep previously only fed on orphaned files (missing directories emptied by stale-file cleanup) and never removed anything, because directory removal without the recursive flag failed silently.
* Long `tsconfig`/`compilerOptions` "ignoring alternatives" console warnings (multi-API configs with more than 2 APIs) now collapse to a count instead of listing every path, keeping the warning to one scannable line.

### Documentation

* `MultiApiConfig.tsconfig` and `compilerOptions` now document the multi-API constraint: Twoslash type-checks all code examples in a single shared TypeScript environment, so only the first API entry that provides a value is honored — the rest are ignored, with a warning logged when they differ. [#95][#95]

### Dependencies

* | Dependency | Type       | Action  | From   | To     |                                                                     |
  | ---------- | ---------- | ------- | ------ | ------ | ------------------------------------------------------------------- |
  | prettier   | dependency | updated | ^3.9.6 | ^3.9.5 | [#95][#95] Thanks [@spencerbeggs](https://github.com/spencerbeggs)! |

### Patch Changes

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

[#95]: https://github.com/spencerbeggs/rspress-plugin-api-extractor/pull/95

## 0.6.1

### Dependencies

* | Dependency           | Type       | Action  | From   | To     |                                                                          |
  | -------------------- | ---------- | ------- | ------ | ------ | ------------------------------------------------------------------------ |
  | type-registry-effect | dependency | updated | ^2.1.1 | ^2.1.2 | [#94][#94] Thanks [@spencerbeggs](https://github.com/apps/spencerbeggs)! |

- | Dependency                     | Type       | Action  | From          | To            |                                                                          |
  | ------------------------------ | ---------- | ------- | ------------- | ------------- | ------------------------------------------------------------------------ |
  | @effect/platform-node          | dependency | updated | 4.0.0-beta.98 | 4.0.0-beta.99 |                                                                          |
  | @effect/sql-sqlite-node        | dependency | updated | 4.0.0-beta.98 | 4.0.0-beta.99 |                                                                          |
  | @effected/semver               | dependency | updated | ^0.1.0        | ^0.2.0        |                                                                          |
  | @effected/store                | dependency | updated | ^0.1.0        | ^0.1.1        |                                                                          |
  | @effected/tsconfig-json        | dependency | updated | ^0.2.3        | ^0.2.7        |                                                                          |
  | @effected/xdg                  | dependency | updated | ^0.1.3        | ^0.1.7        |                                                                          |
  | @microsoft/api-extractor-model | dependency | updated | ^7.33.8       | ^7.33.10      |                                                                          |
  | effect                         | dependency | updated | 4.0.0-beta.98 | 4.0.0-beta.99 |                                                                          |
  | prettier                       | dependency | updated | ^3.9.5        | ^3.9.6        |                                                                          |
  | type-registry-effect           | dependency | updated | ^2.0.0        | ^2.1.1        | [#92][#92] Thanks [@spencerbeggs](https://github.com/apps/spencerbeggs)! |

### Patch Changes

[#92]: https://github.com/spencerbeggs/rspress-plugin-api-extractor/pull/92

[#94]: https://github.com/spencerbeggs/rspress-plugin-api-extractor/pull/94

## 0.6.0

### Features

* ### Migrated to Effect v4

  The plugin's build orchestration now runs on Effect v4 (`effect@4.0.0-beta.98`) instead of Effect v3. The public plugin API is unchanged — `ApiExtractorPlugin`, the `api.fromDir`/`apis.fromDir` config helpers, `serve()`, and the runtime components all keep identical call signatures and behavior. Behavioral parity was verified against the full test suite and an end-to-end site build producing an identical generated page set.

  What changed under the hood, visible at the dependency-graph and type level:

  * `@effect/platform` and `@effect/sql` are gone — their functionality merged into the `effect` core (`FileSystem` is now a top-level module; SQL lives at `effect/unstable/sql`). `@effect/platform-node` and `@effect/sql-sqlite-node` remain as the Node platform implementations.
  * The exported plugin option types (`PluginOptions`, `SingleApiConfig`, `MultiApiConfig`, `CategoryConfig`, and related config types) are now derived from Effect v4 schemas. Field sets and defaults are unchanged, but the generated TypeScript types are `readonly`-field variants — code that mutates a config object after constructing it will now fail to compile.
  * External package type loading (for Twoslash hover/type-checking) now runs on `type-registry-effect@2`, which caches downloaded types under the OS XDG cache directory (namespace `type-registry-effect`) with a SQLite metadata plane, replacing the previous internal cache layout. The first build after upgrading will re-fetch external package types into the new cache location; no configuration change is required.

  No consumer-facing config options, routes, or generated output changed as part of this migration. [#89][#89]

### Dependencies

* | Dependency              | Type       | Action  | From     | To            |                                                                     |
  | ----------------------- | ---------- | ------- | -------- | ------------- | ------------------------------------------------------------------- |
  | @effect/cluster         | dependency | removed | ^0.59.0  | —             |                                                                     |
  | @effect/experimental    | dependency | removed | ^0.60.0  | —             |                                                                     |
  | @effect/platform        | dependency | removed | ^0.96.2  | —             |                                                                     |
  | @effect/rpc             | dependency | removed | ^0.75.1  | —             |                                                                     |
  | @effect/sql             | dependency | removed | ^0.51.1  | —             |                                                                     |
  | @effect/workflow        | dependency | removed | ^0.18.2  | —             |                                                                     |
  | semver-effect           | dependency | removed | ^0.3.1   | —             |                                                                     |
  | @effect/platform-node   | dependency | updated | ^0.107.0 | 4.0.0-beta.98 |                                                                     |
  | @effect/sql-sqlite-node | dependency | updated | ^0.52.0  | 4.0.0-beta.98 |                                                                     |
  | effect                  | dependency | updated | ^3.21.4  | 4.0.0-beta.98 |                                                                     |
  | type-registry-effect    | dependency | updated | ^1.1.0   | ^2.0.0        |                                                                     |
  | @effected/semver        | dependency | added   | —        | ^0.1.0        |                                                                     |
  | @effected/store         | dependency | added   | —        | ^0.1.0        |                                                                     |
  | @effected/tsconfig-json | dependency | added   | —        | ^0.2.3        |                                                                     |
  | @effected/xdg           | dependency | added   | —        | ^0.1.3        |                                                                     |
  | @typescript/vfs         | dependency | added   | —        | ^1.6.4        |                                                                     |
  | ioredis                 | dependency | added   | —        | ^5.7.0        | [#89][#89] Thanks [@spencerbeggs](https://github.com/spencerbeggs)! |

### Patch Changes

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

[#89]: https://github.com/spencerbeggs/rspress-plugin-api-extractor/pull/89

## 0.5.0

### Features

* ### api-docs Claude Code plugin — full capability set

  The companion `api-docs` Claude Code plugin (versioned in lockstep with this package, shipped under `plugin/`) gained its complete set of model-invoked skills, an orchestrating agent, and two slash commands.

  **New skills:**

  * `twoslash` — the `with-api` code-fence contract and Twoslash notation reference
  * `plugin-config` — the package's own configuration, theming, and model plumbing
  * `doc-writer` — editorial craft: page skeletons, a review rubric, the sync workflow, and cross-linking guidance
  * `rspress-core` — package-agnostic RSPress 2.x reference: routing/nav, components, frontmatter, `--rp-*` theming, i18n/multiVersion

  **New agent:**

  * `rspress-docs` — force-loads all four skills for end-to-end documentation work

  **New commands:**

  * `/api-docs:review` — review generated or hand-written docs against the rubric
  * `/api-docs:sync` — sync site docs after an API change

  The SessionStart orientation hook was also shortened to name the `rspress-docs` agent instead of duplicating its guidance inline. [#87][#87]

### Minor Changes

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

[#87]: https://github.com/spencerbeggs/rspress-plugin-api-extractor/pull/87

## 0.4.0

### Features

* ### Inline synthetic base-class declarations

  When a documented class extends a call expression (Effect `Schema.Class`, `Data.TaggedError`, mixin factories, etc.), TypeScript emits an unexported companion declaration (`Foo_base`) that API Extractor hoists into the doc model. Previously this rendered as its own empty Variable page with a sidebar entry, and the class signature linked out to that orphan page.

  The plugin now detects these synthetic bases automatically — an unexported item referenced only from an exported class's `extends` clause — and:

  * generates no standalone page or sidebar entry for the synthetic base
  * renders its declaration inline in a "Base Class" section on the owning class's page
  * points the `Foo_base` reference in the class signature at that section's anchor instead of a dead link

  Classes that don't extend a call expression are unaffected, and genuine forgotten exports still surface as before. This is automatic — there is no configuration option and no opt-out. [#82][#82]

### Minor Changes

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

[#82]: https://github.com/spencerbeggs/rspress-plugin-api-extractor/pull/82

## 0.3.8

### Dependencies

* | Dependency    | Type           | Action  | From         | To                |                                                          |
  | ------------- | -------------- | ------- | ------------ | ----------------- | -------------------------------------------------------- |
  | typescript    | dependency     | updated | catalog:silk | ^6.0.3            |                                                          |
  | @rspress/core | peerDependency | updated | ^2.0.0       | catalog:silkPeers | Thanks [@spencerbeggs](https://github.com/spencerbeggs)! |

## 0.3.7

### Bug Fixes

* ### Fix Effect Closures

  Bump `type-registry-effect` to a version that won't leak `effect` peerDependencies in a monorepo with Effect v4.

### Patch Changes

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

## 0.3.6

### Bug Fixes

* Added `@effect/cluster`, `@effect/experimental`, `@effect/rpc`, and `@effect/workflow` as direct dependencies to complete the `@effect/*` peer dependency closure. Previously only `@effect/platform-node`, `@effect/sql`, and `@effect/sql-sqlite-node` were declared, so their non-optional peers escaped to the consuming workspace and, with `autoInstallPeers`, could resolve to an incompatible `effect` version (#69).

### Dependencies

* | Dependency           | Type       | Action | From | To     |                                                                     |
  | -------------------- | ---------- | ------ | ---- | ------ | ------------------------------------------------------------------- |
  | @effect/cluster      | dependency | added  | —    | 0.59.0 |                                                                     |
  | @effect/experimental | dependency | added  | —    | 0.60.0 |                                                                     |
  | @effect/rpc          | dependency | added  | —    | 0.75.1 |                                                                     |
  | @effect/workflow     | dependency | added  | —    | 0.18.2 | [#71][#71] Thanks [@spencerbeggs](https://github.com/spencerbeggs)! |

### Patch Changes

[#71]: https://github.com/spencerbeggs/rspress-plugin-api-extractor/pull/71

## 0.3.5

### Bug Fixes

* [`a0699e4`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/a0699e41c1fd45da9b5ab4de162ae4e9a4607e56) Updated `type-registry-effect` to `^1.0.2`, fixing broken bundled type declarations shipped in `1.0.1`. The prior release left dangling `TypeRegistryModule`/`VirtualPackageModule` namespace references in its `.d.ts`, which could fail downstream typechecks with errors like `Property 'generateVfs' does not exist on type 'ApiExtractedPackage'`.

### Dependencies

* [`a0699e4`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/a0699e41c1fd45da9b5ab4de162ae4e9a4607e56) | Dependency | Type | Action | From | To |
  \| -------------------- | ---------- | ------- | ------ | ------ |
  \| semver-effect | dependency | updated | ^0.2.1 | ^0.3.0 |
  \| type-registry-effect | dependency | updated | ^1.0.0 | ^1.0.2 |

## 0.3.4

### Dependencies

* [`3b661fe`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/3b661fe73116d83e39664c898304d6079087df59) | Dependency | Type | Action | From | To |
  \| :------------------------- | :------------ | :------ | :-------------------- | :-------------------- |
  \| prettier | dependency | updated | ^3.8.5 | ^3.9.4 |
  \| @types/node | devDependency | added | — | ^26.0.1 |
  \| @typescript/native-preview | devDependency | updated | ^7.0.0-dev.20260621.1 | ^7.0.0-dev.20260630.1 |
  \| @savvy-web/rspress-builder | devDependency | updated | ^0.12.0 | ^1.0.1 |

## 0.3.3

### Dependencies

* | [`a6f5e47`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/a6f5e478b5dd704f163328ad7e0c8ca40a16175c) | Dependency    | Type    | Action   | From    | To |
  | ------------------------------------------------------------------------------------------------------------------------- | ------------- | ------- | -------- | ------- | -- |
  | @savvy-web/bundler                                                                                                        | devDependency | updated | ^11.12.2 | ^12.0.0 |    |

## 0.3.2

### Bug Fixes

* [`9aa4fe4`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/9aa4fe43b145cfd95f2625a80865f0ed7b51106b) Abstract classes are now reconstructed with the `abstract` modifier on the class
  header. Previously the modifier was dropped while abstract members were kept,
  producing `TS1244`/`TS1253` ("abstract member in a non-abstract class") errors in
  the generated Twoslash VFS declarations. The modifier is also preserved for
  abstract classes nested inside namespaces.

- [`9aa4fe4`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/9aa4fe43b145cfd95f2625a80865f0ed7b51106b) Fixes spurious `TS2353 "X does not exist in type"` Twoslash errors on valid nested-struct fields in API doc code blocks for packages that use Effect Schema companion types (the `const T + type T` pattern). The type reference extractor now imports the namespace root (e.g., `Schema`) rather than a leaf member (e.g., `Struct`), matching the qualified form used in reconstructed `.d.ts` declarations. Previously, importing only the leaf left the namespace identifier undefined, causing companion types like `type T = typeof T.Type` to collapse to an error type in hover rendering.

* [`9aa4fe4`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/9aa4fe43b145cfd95f2625a80865f0ed7b51106b) Reference tokens carrying a dts-rollup disambiguation suffix (e.g.
  `CoverageLevelName$1`, emitted when a symbol is re-imported under an alias) are
  now reconstructed using their canonical, un-suffixed name. The prepended import
  uses the canonical name, so emitting the suffixed form previously left the
  identifier undefined (`TS2304`) in the generated Twoslash VFS declarations. The
  suffix is only stripped when the de-suffixed text matches the token's canonical
  symbol, so identifiers that genuinely end in `$N` are left untouched.

## 0.3.1

### Dependencies

* | [`99f2295`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/99f229534042bac423e7282bcaf265794ffe96a8) | Dependency    | Type    | Action  | From    | To |
  | :------------------------------------------------------------------------------------------------------------------------ | :------------ | :------ | :------ | :------ | -- |
  | @shikijs/twoslash                                                                                                         | dependency    | updated | ^4.2.0  | ^4.3.0  |    |
  | shiki                                                                                                                     | dependency    | updated | ^4.2.0  | ^4.3.0  |    |
  | @rspress/core                                                                                                             | devDependency | updated | ^2.0.14 | ^2.0.15 |    |
  | @savvy-web/rspress-builder                                                                                                | devDependency | updated | ^0.10.0 | ^0.11.0 |    |

## 0.3.0

### Features

* [`1b311ce`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/1b311ce955b314aa221c4bf353f7eb2940ad03bb) Auto-detection of external package types now includes runtime `dependencies` by default, not just `peerDependencies`.

- A documented package's public type surface is usually written against its runtime dependencies (for example an Effect-based API whose options are `Schema.Struct<…>` from `effect`). Those declarations must be in the virtual file system for Twoslash to resolve them in `with-api` examples and signatures. Previously only `peerDependencies` and the type-utility packages were fetched, so types from regular `dependencies` were missing.
- `autoDetectDependencies.dependencies` now defaults to `true`. `devDependencies` remains `false` and `peerDependencies` / `autoDependencies` remain `true`. Set `dependencies: false` to restore the previous peer-only behavior.
- Workspace-only and unpublished dependencies that cannot be resolved to a published version are dropped during loading, so broadening the default does not fail the build on local packages.

* [`1b311ce`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/1b311ce955b314aa221c4bf353f7eb2940ad03bb) ### Observability config block

A new top-level `observability` option consolidates all build-output controls into one place.

* [`1b311ce`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/1b311ce955b314aa221c4bf353f7eb2940ad03bb) External package types now load reliably for documentation code examples.

- Auto-detected external package versions are resolved to exact published versions before their types are fetched. The type-registry CDN requires an exact version and rejected semver ranges (e.g. `^4.1.0`) and npm tags, which silently emptied the type VFS and broke Twoslash hover and type-checking across every example.
- Workspace-only and unpublished packages are now skipped instead of failing the whole batch. A package whose version cannot be resolved to a published release is dropped, so one local dependency no longer prevents all external types from loading.
- `.d.ts` reconstruction no longer emits invalid declarations for arrow-function consts (e.g. `name: (args) => ret`) that API Extractor reports as functions. These were written without the `const` keyword, producing parse errors that corrupted type resolution in the virtual file system.

* [`1b311ce`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/1b311ce955b314aa221c4bf353f7eb2940ad03bb) Restored single-sourced build logging for external type loading. type-registry-effect v1 surfaces typed events instead of writing logs; the plugin now forwards those events to its own logger, so external-type progress is reported once in the plugin's configured format and log level. Previously the same operations were printed twice — once by the plugin runtime and once by a separate default-logger runtime.

```ts
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

export default ApiExtractorPlugin({
  observability: {
    logLevel: "info", // "none" | "error" | "warn" | "info" | "debug" | "trace"
    trace: true, // write a JSONL trace artifact; or pass a custom path string
    thresholds: {
      slowCodeBlock: 100, // ms — slow code-block threshold for build summary
      slowPageGeneration: 500,
    },
  },
  // ...
});
```

* **`logLevel`** — `none | error | warn | info | debug | trace` level ladder. Filters console output. The `LOG_LEVEL` environment variable takes precedence when set.
* **`trace`** — opt-in JSONL trace artifact. Pass `true` to write to `<outDir>/.api-extractor/trace-<buildId>.jsonl`, or a string path to write to a custom location. Useful for diagnosing slow builds — every plugin event is recorded at full fidelity, independent of the console log level.
* **`thresholds`** — slow-operation thresholds (ms) for the build summary: `slowCodeBlock`, `slowPageGeneration`, `slowApiLoad`, `slowFileOperation`, `slowHttpRequest`, `slowDbOperation`. Defaults are 100 ms for code blocks, 500 ms for pages, and so on.

The build summary now reports per-phase timing and previously-unreported counts (LLMs post-processing, snapshot commits, stale-file deletions).

### Bug Fixes

* [`1b311ce`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/1b311ce955b314aa221c4bf353f7eb2940ad03bb) First-party packages (the ones being documented) are no longer fetched as external types. Their declarations come from their own generated virtual file system, which is authoritative — fetching a published version (when one exists) would overwrite the model-derived declarations, and when it does not exist (for example an optimistic next version) it produced a stream of 404 warnings. Documented package names are now excluded from external auto-detection.
* A single non-2xx fetch is now reported at debug rather than warning. These are routinely handled (an unpublished or workspace dependency that is then dropped); a package that genuinely fails to load is still reported at warning.

- [`1b311ce`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/1b311ce955b314aa221c4bf353f7eb2940ad03bb) External package types now load reliably for documentation code examples.

* | [`1b311ce`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/1b311ce955b314aa221c4bf353f7eb2940ad03bb) | Dependency | Type    | Action | From   | To |
  | :------------------------------------------------------------------------------------------------------------------------ | :--------- | :------ | :----- | :----- | -- |
  | type-registry-effect                                                                                                      | dependency | updated | ^0.2.3 | ^1.0.0 |    |

- [`1b311ce`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/1b311ce955b314aa221c4bf353f7eb2940ad03bb) Restored single-sourced build logging for external type loading. type-registry-effect v1 surfaces typed events instead of writing logs; the plugin now forwards those events to its own logger, so external-type progress is reported once in the plugin's configured format and log level. Previously the same operations were printed twice — once by the plugin runtime and once by a separate default-logger runtime.

### Performance

* [`1b311ce`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/1b311ce955b314aa221c4bf353f7eb2940ad03bb) External package types are now fetched once per build. Previously the build fetched the external type VFS twice — once to assemble the combined VFS, and again inside a TypeScript-environment pre-build that Twoslash discarded. The redundant fetch and pre-build are removed.

## 0.2.2

### Dependencies

* | [`24e3f3e`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/24e3f3e062470ee80d9a6c539cc68b35125a12a1) | Dependency    | Type    | Action               | From                 | To |
  | :------------------------------------------------------------------------------------------------------------------------ | :------------ | :------ | :------------------- | :------------------- | -- |
  | @shikijs/twoslash                                                                                                         | dependency    | updated | ^4.1.0               | ^4.2.0               |    |
  | prettier                                                                                                                  | dependency    | updated | ^3.8.3               | ^3.8.4               |    |
  | shiki                                                                                                                     | dependency    | updated | ^4.1.0               | ^4.2.0               |    |
  | @typescript/native-preview                                                                                                | devDependency | updated | 7.0.0-dev.20260617.2 | 7.0.0-dev.20260618.1 |    |
  | @savvy-web/rspress-builder                                                                                                | devDependency | updated | ^0.1.0               | ^0.1.1               |    |

## 0.2.1

### Bug Fixes

* [`df28b81`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/df28b81b974223295c7856c0208b8f956675b358) Moved `unist-util-visit` package to a direct dependency.

## 0.2.0

### Breaking Changes

* [`22411d8`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/22411d851c805adf4131adc96b0eff70609b246a) ### Config helper functions renamed and reorganized

The config-helper factory functions exposed on `ApiExtractorPlugin` have been renamed and split into two namespaces that match the option they produce for.

**Before:**

```typescript
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

// Single package folder → one config for the `api:` option
const api = ApiExtractorPlugin.api.fromFolder("./modules/kitchensink");

// Parent directory → array of configs for the `apis:` option
const apis = ApiExtractorPlugin.api.fromModelsDir("./modules");
```

**After:**

```typescript
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

// Single package folder → one config for the `api:` option
const api = ApiExtractorPlugin.api.fromDir("./modules/kitchensink");

// Parent directory → array of configs for the `apis:` option
const apis = ApiExtractorPlugin.apis.fromDir("./modules");
```

### Features

* [`22411d8`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/22411d851c805adf4131adc96b0eff70609b246a) ### `serve()` dev/preview server runner

Added `serve(options?)` to the main entry for running an RSPress dev or preview server without hand-copying a launch script between projects:

```typescript
import { serve } from "rspress-plugin-api-extractor";

await serve({ mode: "dev", openPath: "/api/" });
```

It frees the target port, spawns `rspress dev|preview`, streams output, and opens a browser once the server is ready. Options: `mode` (`"dev"` or `"preview"`), `port`, `open`, `openPath`, `packageManager`, `cwd`, and a `readyWhen` override. The pure helpers `isServerReady` and `resolveServeConfig`, plus the `ServeOptions`, `ServeMode` and `ResolvedServeConfig` types, are exported alongside it.

### Renamed exports

| Before                                 | After                                             |
| :------------------------------------- | :------------------------------------------------ |
| `ApiExtractorPlugin.api.fromFolder`    | `ApiExtractorPlugin.api.fromDir`                  |
| `ApiExtractorPlugin.api.fromModelsDir` | `ApiExtractorPlugin.apis.fromDir`                 |
| `FolderInfo` (type)                    | `DirInfo`                                         |
| `FromFolderOptions` (type)             | `FromDirOptions`                                  |
| `FromModelsDirOptions` (type)          | removed — both helpers now share `FromDirOptions` |

`BaseRoute` keeps its name; its callback signature now receives `DirInfo` instead of `FolderInfo`.

### Context-aware `baseRoute` default

Previously `api.fromFolder` injected a `"{dirname}"` template as the default `baseRoute`, causing single-API sites to mount docs at `/{dirname}/api` (e.g. `/kitchensink/api`) instead of the intended `/api`. This default has been removed from the helpers.

The plugin now applies a context-aware default during resolution:

* Under the `api:` option (single API): defaults to `/api`
* Under the `apis:` option (multi-API): defaults to `/{packageName}/api`

If you relied on the old `/{dirname}/api` mount, pass an explicit `baseRoute`:

```typescript
// Preserve the old behavior explicitly
ApiExtractorPlugin.api.fromDir("./modules/kitchensink", {
  baseRoute: "{dirname}",
});
```

### RSPress tsconfig export

Added a `rspress-plugin-api-extractor/tsconfig/rspress.json` export — a standard RSPress/React-JSX tsconfig that documentation sites can extend instead of hand-writing one:

```jsonc
{
  "extends": ["rspress-plugin-api-extractor/tsconfig/rspress.json"],
}
```

## 0.1.2

### Bug Fixes

* [`43bbeff`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/43bbeff9662e2dd388f76617041e0b1fe68bb54d) Fixes a crash that occurred when the plugin was installed from npm and an RSPress site was built with `llms: true`. Previously, the plugin registered its SSG runtime components (`ApiLlmsPackageActions`, `LlmsViewOptions` alias) using source `.tsx` paths that only resolved in the local linked-workspace layout. Published installs failed with "Module not found … ApiLlmsPackageActions/index.tsx" and a cascading `LlmsViewOptions` linking error.

The root cause was that the precompiled runtime bundle froze `import.meta.env.SSG_MD` to `undefined`, making RSPress unable to apply its SSG-MD markdown rendering pass. The fix updates to `@savvy-web/rslib-builder@^0.21.0`, which emits the React runtime bundleless (per-file compiled JS under `dist/runtime/`) so RSPress compiles the SSG components directly and resolves `import.meta.env.SSG_MD` per site build. `globalUIComponents` and the `LlmsViewOptions` alias are now registered against the published transpiled `.js` files.

No public API, configuration options, or exports changed — `apiExtractor({...})` usage is identical; `llms: true` now works correctly for published installs.

### Refactoring

* [`fb86ff4`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/fb86ff418b86a4c0c96ae0448dc45334987f652f) Delegates previously duplicated pure logic to the new `api-extractor-llms` runtime dependency. Model loading, type-signature formatting, TSDoc extraction helpers, and prose cross-linking now route through shared library implementations. Public config surface, route schemes, RSPress integration, and generated output are unchanged.

### Dependencies

* | [`fb86ff4`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/fb86ff418b86a4c0c96ae0448dc45334987f652f) | Dependency | Type  | Action | From  | To |
  | :------------------------------------------------------------------------------------------------------------------------ | :--------- | :---- | :----- | :---- | -- |
  | api-extractor-llms                                                                                                        | dependency | added | —      | 0.1.0 |    |

- | [`43bbeff`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/43bbeff9662e2dd388f76617041e0b1fe68bb54d) | Dependency    | Type    | Action   | From    | To |
  | :------------------------------------------------------------------------------------------------------------------------ | :------------ | :------ | :------- | :------ | -- |
  | @savvy-web/rslib-builder                                                                                                  | devDependency | updated | ^0.20.12 | ^0.21.0 |    |

## 0.1.1

### Bug Fixes

* [`8afe892`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/8afe89273d7503e08fa114e83c65d1f921bf53e4) Corrects turbo build order.

## 0.1.0

### Features

* [`de7f3d2`](https://github.com/spencerbeggs/rspress-plugin-api-extractor/commit/de7f3d2f542057c2039cfd36a915aeca0eea2a04) ### Initial Release — 0.1.0

`rspress-plugin-api-extractor` is an [RSPress 2.0](https://rspress.dev/) plugin that generates interactive API documentation directly from [Microsoft API Extractor](https://api-extractor.com/) `.api.json` models. It turns your TypeScript library's public API surface into syntax-highlighted, fully cross-linked documentation pages with Twoslash hover tooltips and copy-ready code examples.

Install the plugin and point it at your API model:

```ts
// rspress.config.ts
import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

export default defineConfig({
  root: "docs",
  plugins: [
    ApiExtractorPlugin({
      api: {
        packageName: "my-library",
        model: "./api/my-library.api.json",
      },
    }),
  ],
});
```

### Configuration Helpers

`ApiExtractorPlugin.api.fromFolder` and `ApiExtractorPlugin.api.fromModelsDir` derive all configuration automatically from an [`@savvy-web/rslib-builder`](https://github.com/savvy-web/rslib-builder) package folder — package name, version, model path, and TypeScript config are all resolved without manual specification.

### Multi-Package Portals

Pass an `apis` array instead of a single `api` object to document multiple packages in one site. Each package gets its own navigation scope, route prefix, and LLM text files.

### Multi-Version and i18n

RSPress `multiVersion` and `i18n` configurations are supported. Version prefixes and locale segments are handled automatically in both navigation and the generated LLM files.

### Multi-Entry Point Packages

Packages that expose more than one entry point (e.g. `.` and `./testing`) are fully supported. Re-exported items are deduplicated into a single page; each page displays an "Available from" line listing every entry point that exports it. Route collisions between two genuinely distinct items fail the build with an actionable error.

### SSG-Compatible Runtime Components

Runtime components (`SignatureBlock`, `MemberSignature`, `ExampleBlock`, `ParametersTable`, `EnumMembersTable`) implement a dual-mode pattern: they render interactive HTML in the browser and clean Markdown when RSPress is generating LLM text files via `import.meta.env.SSG_MD`.

### Per-Package LLM Text Files

When `@rspress/plugin-llms` is enabled, the plugin post-processes the global `llms.txt` and `llms-full.txt` files and generates per-package scoped equivalents — `llms.txt`, `llms-full.txt`, `llms-docs.txt`, and `llms-api.txt` — at each package's route prefix.
