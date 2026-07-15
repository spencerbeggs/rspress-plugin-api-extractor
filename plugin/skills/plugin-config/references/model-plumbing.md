# Model plumbing

The plugin reads a `.api.json` model; it does not produce one. Getting that model — and the `package.json`/`tsconfig.json` that ride with it — from the documented package to the docs site is the plumbing this reference covers. Load it when a build cannot find a model, a page is stale after a source change, or an Effect-TS package's base classes render wrong.

## The model folder contract

The `fromDir` helpers (and, conceptually, every API you document) expect a **model folder** — one directory per package holding:

```text
lib/models/my-library/
├── my-library.api.json    # the API Extractor doc model (required)
├── package.json           # version + dependency detection (recommended)
└── tsconfig.json          # type-checking for code examples (optional)
```

- The `*.api.json` is required. With several in one folder, `api.fromDir` prefers `<unscoped-name>.api.json` and otherwise throws.
- `package.json` supplies the version shown on pages and drives `autoDetectDependencies`.
- `tsconfig.json` is what type-checks the `with-api` examples; without it, examples still render but are not type-checked.

Writing `model`/`packageJson`/`tsconfig` by hand works too — the folder contract only matters when you use `fromDir`.

## Producing the `.api.json`

The model comes from Microsoft API Extractor's **doc model**. Two ways to get one:

- **Run API Extractor directly.** Set `"docModel": { "enabled": true }` in the package's `api-extractor.json`, run `api-extractor run`, and it writes the `.api.json`.
- **Let the build emit it.** A builder wired to API Extractor can emit the model as part of the library build. For example `@savvy-web/rslib-builder` emits it next to `dist/` when `apiModel: true` is set, and its `localPaths` option pushes the model folder to a target directory. Use whatever your library build already provides.

The plugin does not care which tool produced the model, only that a valid `.api.json` lands in a place the config points at.

## Getting the model next to the docs

Two patterns, depending on repo layout:

- **Builder push (monorepo).** A builder that supports a `localPaths`-style option writes each package's model folder into the docs site's model directory (e.g. `sites/docs/lib/models/<pkg>/`) as part of the library build. `apis.fromDir("./lib/models")` then discovers them all.
- **Manual copy (standalone).** Copy the freshly built `.api.json` (and `package.json`/`tsconfig.json`) into the docs project and point `model` at it, or fetch it at config time via the loader-function form of `model` (a `URL` or async function).

Either way, the model on disk must reflect the current source — a page will not change if the model behind it did not.

## Build ordering

The model must be built **before** the docs, or the docs build reads a stale or missing `.api.json`. This is a real ordering hazard whenever the library and the docs live in the same repo.

- **In a monorepo with a task graph** (Turbo, Nx, etc.), make the docs build depend on the library build. With Turbo, the docs `build` task lists the library's build in `dependsOn` (typically `"^build"`), so the model is always fresh before the plugin runs.
- **Without a task runner**, order the commands yourself: build the library (emitting the model), then build the docs. A `predev`/`prebuild` script that rebuilds the model is the simplest guard.

If pages look stale after a source change, the usual cause is either the model was not rebuilt or the Rspack cache is serving old output — see [troubleshooting.md](./troubleshooting.md).

## Effect-TS setup: forgotten-export and `_base`

Packages whose classes extend a **call expression** — Effect's `Schema.Class` and `Data.TaggedError`, or any mixin factory — need one extra API Extractor setting, or their base classes document badly.

TypeScript compiles `class Person extends Schema.Class(...)` by emitting an unexported `declare const Person_base` that the class extends. That declaration is not part of the public API, so:

1. **Include forgotten exports in the doc model.** Set `includeForgottenExports` in the API Extractor doc-model config so `Person_base` appears in the `.api.json`. When it is present, the plugin detects it, generates **no** standalone page or sidebar entry for it, and renders the declaration inline in a "Base Class" section on the owning class page — the `Person_base` reference in the signature links straight to that section.
2. **Suppress the `ae-forgotten-export` warning for `_base` names.** With the declaration included, API Extractor still warns that `Person_base` is a forgotten export. Suppress that rule for `_base` names in your API Extractor configuration so the build stays clean.

Without step 1 the base class reference dangles (no page, broken cross-link); without step 2 the build is noisy. Both are one-time setup for an Effect-TS package, not per-build work.

A genuine forgotten export — a type referenced by your public API but never exported and not a compiler-generated `_base` — is a different problem: export the type, or mark it `@internal` so API Extractor drops it. That fix lives in your library's source, not the plugin. See [troubleshooting.md](./troubleshooting.md).
