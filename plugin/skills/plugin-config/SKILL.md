---
name: plugin-config
description: Write and debug rspress-plugin-api-extractor configuration in an rspress.config.ts. Use when editing the ApiExtractorPlugin(...) options object — api: vs apis: single/multi shapes, versions:/multiVersion, i18n locales, the api.fromDir/apis.fromDir helpers, baseRoute/apiFolder routing, categories/DEFAULT_CATEGORIES, externalPackages/autoDetectDependencies, source links, theme (Shiki) and --api-* CSS variables, llmsPlugin, observability/logLevel, the serve() dev/preview runner, .api.json model plumbing — or when a build fails with a route collision or a Twoslash/model error. Do NOT use for RSPress mechanics outside the plugin — _meta.json/_nav.json routing, page frontmatter, built-in components, --rp-* theming (see rspress-core); for what goes inside a with-api code fence — notation, @errors, ---cut--- (see twoslash); or for the editorial call of what deserves documenting (see doc-writer).
---

# plugin-config

Load this skill when you are configuring the `rspress-plugin-api-extractor` npm package — editing the `ApiExtractorPlugin(...)` options object inside a consumer's `rspress.config.ts`, wiring the model into the build, or reading a build error the plugin raised.

It owns the plugin's own surface: the config options, the `fromDir` helpers, the `--api-*` theme variables, the `.api.json` model plumbing, and the failure modes the plugin produces. Nothing in this skill is generic RSPress — that lives one skill over.

Route these adjacent decisions elsewhere:

- Generic RSPress mechanics — `_meta.json`/`_nav.json` sidebar and nav, page frontmatter, built-in components, `--rp-*` theme variables — see `rspress-core`.
- What belongs inside a `with-api` code fence — notation, `@errors`, `---cut---`, the fence contract — see `twoslash`.
- The editorial call of what to document and when a snippet earns `with-api` — see `doc-writer`.

## Boundary: looks similar, is not

This skill and `rspress-core` both configure the same site, so their surfaces read as one thing. They are not.

- This skill owns everything that plumbs the **API model** into pages — `ApiExtractorPlugin` options, `.api.json` models, the generated tree — and the **`--api-*`** CSS variables that theme the generated components.
- `rspress-core` owns the **generic RSPress** surface — routing/nav files, frontmatter, components — and the **`--rp-*`** CSS variables that theme the site chrome.

`--api-*` and `--rp-*` are two different variable families. Restyling a signature block is `--api-*` (this skill); restyling the sidebar is `--rp-*` (`rspress-core`).

## What the plugin does

`ApiExtractorPlugin` reads a Microsoft API Extractor model — a `.api.json` file describing a package's public API — and generates one MDX page per public API item (classes, interfaces, functions, type aliases, enums, variables, namespaces), plus the sidebar `_meta.json` files that structure them. It runs during the RSPress `config()` hook, so the pages exist before route scanning.

You give it, per documented API, up to three inputs: `model` (the `.api.json`, required), `packageJson` (for version and dependency detection, recommended), and `tsconfig` (to type-check the interactive code examples, optional). Everything else is presentation.

## The five site shapes

Pick the shape first; the option follows from it. Each maps to a real example site under `sites/`.

| Site shape | Config | Example site |
| --- | --- | --- |
| One package | `api: { … }` | `sites/basic` |
| Portal of several packages | `apis: [ … ]` | `sites/multi` |
| One package, many versions | `api: { versions: { … } }` + RSPress `multiVersion` | `sites/versioned` |
| One package, many locales | `api: { … }` + RSPress `locales` | `sites/i18n` |
| One package, many entry points | `api: { … }` (automatic — no extra config) | `sites/effect` |

`api` and `apis` are mutually exclusive: provide exactly one. `versions` lives only under `api`; `apis` entries always need an explicit `model`. i18n and multi-entry need no plugin-specific config at all — RSPress `locales`/`exports` drive them. Worked configs for all five are in `references/recipes.md`.

## The fromDir shortcut

Rather than hand-write `model`/`packageJson`/`tsconfig` per package, point a helper at a built model folder (a directory holding a `package.json`, a `*.api.json` and optionally a `tsconfig.json`):

```ts
api: ApiExtractorPlugin.api.fromDir("./lib/models/my-library", { cwd: __dirname }),
// or, for a whole portal:
apis: ApiExtractorPlugin.apis.fromDir("./lib/models", { cwd: __dirname }),
```

`api.fromDir` returns one config; `apis.fromDir` scans a parent directory and returns one per subfolder. Overrides you pass win over discovery. `apis.fromDir` is strict — every non-dotfile subdirectory must be a valid model folder or it throws. Discovery rules, `baseRoute` templates, and the return types (`DirInfo`, `BaseRoute`, `FromDirOptions`) are in `references/config-reference.md`.

## Wiring the site

- **Routing.** `apiFolder` (default `"api"`) nests the generated pages under one folder segment; `baseRoute` prefixes the whole API. Under `api:` the default is `/api`; under `apis:` each entry defaults to `/{packageName}/api` so packages do not collide.
- **tsconfig.** The package ships a base config sites extend: `{ "extends": ["rspress-plugin-api-extractor/tsconfig/rspress.json"] }`. This is the site's own `tsconfig.json`, separate from the per-API `tsconfig` field that type-checks examples.
- **serve().** The plugin exports a `serve` runner for a two-line dev/preview script — it frees a stale port, spawns `rspress dev|preview`, and opens the browser once ready:

  ```ts
  // scripts/dev.mts
  import { serve } from "rspress-plugin-api-extractor";
  await serve({ mode: "dev", openPath: "/api/" });
  ```

  It defaults to `pnpm rspress dev` on port `4173` and skips opening a browser when `NO_OPEN` is set.

## The generated tree is plugin-owned

The plugin writes the entire tree under `{baseRoute}/{apiFolder}` — the MDX pages **and** their `_meta.json` files. Treat that folder as build output:

- **Mount it, do not author inside it.** Add one `dir` entry for the API folder to your hand-written root `_meta.json` (array form — see `rspress-core`) so it appears in the sidebar. That is the only file you touch.
- **Never hand-edit a generated page.** The plugin rewrites changed pages and deletes stale/orphaned ones on every build, so edits inside the generated folder are silently reverted or removed. Fix the source: change the TSDoc and rebuild the model, or change the plugin config.

## Common mistakes

- **Setting both `api` and `apis`.** They are mutually exclusive; provide exactly one. A portal is `apis: []`, a single package is `api: {}`.
- **Editing a generated page to fix a typo.** It gets overwritten on the next build. The prose comes from the model's TSDoc — fix it in the documented package's source and rebuild the `.api.json`.
- **Expecting the generated pages in the sidebar without mounting them.** The plugin writes the tree but does not touch your root `_meta.json`; add the `dir` entry yourself.
- **Reaching for `--rp-*` to restyle a signature block.** The generated components theme through `--api-*`; `--rp-*` is RSPress chrome. See `references/theming.md`.
- **Using the `{packageName}` `baseRoute` token for a scoped name.** `@scope/pkg` interpolates verbatim, scope and slash included, landing in the URL. Prefer `{dirname}` or a callback.
- **Expecting `llms*.txt` files without RSPress `llms: true`.** The integration post-processes RSPress's own LLMs output; with RSPress LLMs off there is nothing to process. See `references/llms.md`.
- **Treating a Twoslash error in an example as a build failure.** It renders inline and warns; the build still succeeds. The mechanics are `twoslash`'s; the config levers (`externalPackages`, `errors: { example: "suppress" }`) are in `references/troubleshooting.md`.

## Reference map

Load on demand; none is required to write a first config. Each answers a narrower question than this file.

- `references/config-reference.md` — every option, organized by where it lives: top-level, per-API, categories, source, theme, external types, OG images, observability, the `fromDir` helper surface.
- `references/recipes.md` — the five site shapes as complete, working configs keyed to the example sites.
- `references/model-plumbing.md` — the model-folder contract, getting the `.api.json` next to the docs, build ordering, and the forgotten-export / `_base` suppression setup.
- `references/theming.md` — the `--api-*` variable groups, `html.rp-dark` overrides, the Shiki `theme` option and its dual-theme CSS mechanism, and the global popup CSS.
- `references/llms.md` — the `llms: true` prerequisite, the per-package `llms*.txt` outputs, and the `llmsUI` placements.
- `references/troubleshooting.md` — route collisions, Twoslash errors in examples, stale-cache resets, and the `checkDeadLinks` accommodation.
