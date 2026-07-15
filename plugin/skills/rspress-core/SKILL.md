---
name: rspress-core
description: Author and configure a general RSPress 2.x documentation site — the framework surface a docs site needs regardless of any plugin. Use when editing _meta.json (sidebar) or _nav.json (navbar); setting page frontmatter (pageType, hero/features, sidebar/outline toggles); using built-in MDX components (Badge, Tabs, PackageManagerTabs, Steps, containers, code-block line highlighting); theming with --rp-* CSS variables or the globalStyles hook; configuring RSPress locales (i18n) or multiVersion; or importing from @rspress/core/theme. Do NOT use for rspress-plugin-api-extractor's own options, --api-* variables, or API-model plumbing (see plugin-config); for the editorial craft of what prose to write (see doc-writer); or for what goes inside a with-api code fence (see twoslash).
---

# rspress-core

Load this skill for the **general RSPress 2.x** surface — the framework mechanics a documentation site needs no matter which plugins it runs: routing, the sidebar and navbar files, page frontmatter, built-in components, `--rp-*` theming, and i18n/multiVersion. It is package-agnostic: nothing here is specific to `rspress-plugin-api-extractor`.

Three sibling skills route *into* this one for generic RSPress questions, so keep the boundary sharp:

- `rspress-plugin-api-extractor`'s own configuration — its options, `--api-*` variables, `.api.json` model plumbing — see `plugin-config`.
- The editorial craft of what to write and how to structure prose — see `doc-writer`.
- What goes **inside** a `with-api` code fence — notation, `@errors`, `---cut---` — see `twoslash`.

## Boundary: looks similar, is not

This skill and `plugin-config` both configure "the site," so their surfaces read as one. They are not.

- **rspress-core owns the generic RSPress surface:** `_meta.json`/`_nav.json`, page frontmatter, built-in components, and the **`--rp-*`** CSS variables that theme RSPress's chrome (sidebar, nav, hero, page background).
- **plugin-config owns the plugin:** `ApiExtractorPlugin` options, the generated `api/` tree, and the **`--api-*`** variables that theme the generated components.

`--rp-*` and `--api-*` are two different variable families. Restyling the sidebar or the home hero is `--rp-*` (this skill); restyling a generated signature block is `--api-*` (`plugin-config`).

## Mental model

RSPress is convention-routed. The `docs/` tree (the `root` in `rspress.config.ts`) maps 1:1 to routes: `docs/guide/intro.md` serves at `/guide/intro`. You shape two things on top of that file-to-route mapping:

- **The sidebar** — a `_meta.json` in a directory orders and labels that directory's pages. Contextual, per-section.
- **The navbar** — a single `_nav.json` at the docs root defines the global top navigation.

Everything else — a page's title, layout, whether it is a home page — is set in that page's **frontmatter**. Site-wide settings (title, theme, locales, plugins) live in `rspress.config.ts`.

## The two version traps

RSPress 1.x content is all over the internet and in older skills. Two 1.x patterns silently break on 2.x — encode them loudly:

1. **Import components from `@rspress/core/theme`, never `rspress/theme`.** The bare `rspress/theme` specifier is the 1.x package; on RSPress 2.x it does not resolve (or resolves to nothing), so a component import from it fails the build or renders nothing. Every built-in component — `Badge`, `Tabs`, `Steps`, `PackageManagerTabs` — comes from `@rspress/core/theme`.

2. **`_meta.json` is an ARRAY, never an object.** RSPress 2.x sidebar metadata is a JSON array of entry objects (`[ { "type": "dir", ... }, ... ]`). The 1.x object form (`{ "intro": "Introduction", ... }`) is not read on 2.x — a page using it gets an auto-generated sidebar instead, silently ignoring your ordering and labels.

> **Trap:** both failures are quiet. A `rspress/theme` import or an object-form `_meta.json` does not error with a helpful message — the component vanishes or the sidebar falls back to alphabetical. If a sidebar or component "isn't taking," check these two first.

## Config file anatomy

`rspress.config.ts` is a `defineConfig({...})` from `@rspress/core`. The fields a docs author touches most:

- `root` — the docs directory (usually `"docs"`), the base of the file-to-route map.
- `title` / `description` / `icon` / `logo` — site identity.
- `themeConfig` — navbar social links, footer, the outline, `llmsUI`, and other theme-level settings.
- `globalStyles` — a path to a CSS file injected site-wide; this is where `--rp-*` overrides live (see `references/theming.md`).
- `locales` / `lang` — internationalization (see `references/i18n-multiversion.md`).
- `multiVersion` — versioned docs (same reference).
- `plugins` — where `ApiExtractorPlugin(...)` and other plugins are registered (the plugin's own options are `plugin-config`'s).
- `route` — routing options such as `cleanUrls`.

## Common mistakes

- **Importing from `rspress/theme`.** That is 1.x; on 2.x use `@rspress/core/theme`. The component silently fails to render.
- **Writing `_meta.json` as an object.** 2.x reads the array form only; the object form is ignored and the sidebar falls back to alphabetical order.
- **Reaching for `--api-*` to theme the sidebar or hero.** Those are the plugin's generated-component variables; RSPress chrome themes through `--rp-*`. See `references/theming.md`.
- **Hand-authoring inside the plugin's generated `api/` tree.** That folder is build output — mount it with one `_meta.json` `dir` entry and leave the rest to the plugin (`plugin-config` / `doc-writer`).
- **Assuming a missing `_meta.json` is an error.** It is not — RSPress auto-generates an alphabetical sidebar. A wrong *order* usually means a missing or object-form `_meta.json`, not a broken build.

## Reference map

Load on demand; none is required for a first page. Each answers a narrower question than this file.

- `references/routing-nav.md` — `_meta.json` array-form field reference (every `type`), `_nav.json` fields and the `activeMatch` dropdown pattern, the section-header flat-spine sidebar, and ordering heuristics.
- `references/components.md` — the built-in component catalog with exact `@rspress/core/theme` import paths, code-block meta (line highlight, diff), and the `:::` container syntax.
- `references/frontmatter.md` — the frontmatter field reference, the verified `pageType` enum, and the home-page `hero`/`features` YAML.
- `references/theming.md` — the `--rp-*` variable families, the `globalStyles` hook, the `:where()` zero-specificity recipe, and hero-gradient / dark-mode blocks.
- `references/i18n-multiversion.md` — RSPress `locales` and `multiVersion` mechanics, and how they compose.
- `references/deploy.md` — deploying the built static site (stub — GitHub Pages, Cloudflare).
