# Upstream issue draft — twoslash mis-resolves deeply-computed types from VFS `extraFiles`

**Target repo:** `twoslashes/twoslash` (also relevant to `shikijs/shiki`'s
`@shikijs/twoslash`, which hardcodes `compilerOptions: { moduleResolution: 100 }`).

**Versions seen:** `twoslash@0.3.8`, `@shikijs/twoslash@4.2.0`, `@typescript/vfs@1.6.4`,
`typescript@6.0.3`.

---

## Summary

When type declarations are supplied to twoslash via `extraFiles` (or a populated
`fsMap`), a **deeply-computed conditional/mapped type** — specifically an Effect
Schema `type T = typeof SchemaConst.Type` whose struct has a **nested** object
field — resolves **incompletely**: the nested field is dropped from the computed
object type. The same declarations type-checked by a direct
`languageService.getSemanticDiagnostics` call on a `@typescript/vfs`
`createVirtualTypeScriptEnvironment` built with **populated root files** resolve
**correctly**.

The user-visible symptom is a false `TS2353` ("Object literal may only specify
known properties, and 'X' does not exist in type 'Y'") on a property that *does*
exist on the type.

## Observed vs expected

Given two virtual packages in `extraFiles`:

- `@scope/sdk` exports `const Options: Schema.Struct<{ console: Schema.optional<Schema.Struct<{...}>>, coverageTargets: Schema.optional<Schema.refine<...>> }>` and `type Options = typeof Options.Type`.
- `@scope/plugin` exports `interface ConstructorOptions extends Options` and `function Plugin(o?: ConstructorOptions): ...`.

Example checked by twoslash:

```ts
import { Plugin } from "@scope/plugin";
Plugin({ console: { human: "stream" }, coverageTargets: {} });
```

- **twoslash (`createTwoslasher` / `transformerTwoslash`):** reports
  `TS2353 'console' does not exist in type 'ConstructorOptions'`. The
  `coverageTargets` field (a `Schema.refine`, not a nested `Schema.Struct`)
  resolves fine — only the **nested-struct** field is dropped.
- **Direct LS query on a populated-root `@typescript/vfs` env (same files, same
  compilerOptions):** clean. A deliberately bogus key *is* rejected and `console`
  *is* accepted — i.e. the type genuinely resolves with `console` present.

## What was ruled out

The discrepancy is **not** explained by any of:

- `moduleResolution` (Bundler / Node10 / NodeNext all reproduce it in twoslash's env)
- compiler flags (`strict`, `exactOptionalPropertyTypes`, `skipLibCheck`, `allowJs`, `pathsBasePath`)
- missing TS lib files (added via `createDefaultMapFromNodeModules` — no change)
- missing the upstream dep (`effect`) — bundling all of `effect`'s `.d.ts` into a pure VFS still reproduces it
- pre-seeding twoslash's env cache (`getObjectHash(mergedOptions)` key) with a known-correct pre-built env — twoslash reuses it but still reports the error

The only configuration that resolves correctly is a direct
`getSemanticDiagnostics` on an env created with **non-empty `rootFiles` at
construction** (as `@typescript/vfs`'s typical usage / type-registry-effect's
`createTypeScriptCache` does). twoslash builds its env with
`createVirtualTypeScriptEnvironment(system, [], ts, opts)` (empty root files) and
then adds files lazily via `env.createFile(vfsRoot + path, ...)`. The hypothesis
is that lazily-added VFS files plus the empty-root program produce an incomplete
type-resolution state for deeply-computed mapped types, which a populated-root
program does not.

## Suspected mechanism (for maintainers)

`createTwoslasher` → `getEnv` runs
`createVirtualTypeScriptEnvironment(system, [], ts, compilerOptions)` with an
empty root-file list, then `twoslasher` adds `extraFiles` and the split sample
files via `env.createFile(fsRoot + name, ...)`. Files referenced only transitively
(here `@scope/sdk` reached via `@scope/plugin`'s `extends`) appear to be resolved
in a way that drops nested computed sub-types. Seeding the root-file list with the
extra `.d.ts` (or otherwise forcing them into the initial program) is the likely fix.

## Reproduction

A self-contained repro can be built with `@typescript/vfs` + `twoslash` + `effect`
by emitting the two `.d.ts` files above and comparing:

1. `createTwoslasher({ tsModule, fsMap })(code, "ts", { extraFiles })` → error
2. `createVirtualTypeScriptEnvironment(createFSBackedSystem(mapWithRootDts, cwd), [...rootDts], ts, opts)` then `languageService.getSemanticDiagnostics` → clean

(Originally found in `rspress-plugin-api-extractor`, which reconstructs `.d.ts`
from API Extractor models into a VFS for Twoslash; the affected types are Effect
Schema companion types `type T = typeof T.Type`.)
