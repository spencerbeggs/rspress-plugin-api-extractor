# i18n and multiVersion

RSPress 2.x's built-in internationalization and versioned-docs mechanics, and how they compose. Load this when adding locales or versions to a site. Config shapes and routing rules are verified against the vendored docs (`.repos/rspress/website/docs/en/guide/basic/{i18n,multi-version}.mdx`).

Both are generic RSPress features. How `rspress-plugin-api-extractor` maps its models into them (the `api.versions` record, one `api` block covering every locale) is `plugin-config`'s — this reference is the RSPress substrate underneath.

## i18n (`locales`)

Declare `locales` as a **top-level** config array (not `themeConfig.locales`, which is deprecated), and set the default language with the top-level `lang`:

```ts
import { defineConfig } from "@rspress/core";

export default defineConfig({
  lang: "en",                     // default language
  locales: [
    { lang: "en", label: "English", title: "My Library", description: "…" },
    { lang: "zh", label: "简体中文", title: "My Library", description: "…" },
  ],
});
```

Per-locale fields: `lang` (the language id), `label` (the switcher label), and locale-level `title`/`description`.

### Directory layout and routing

One directory per language under the docs root, **each with its own `_nav.json`** at its root and `_meta.json` files in its subdirectories:

```text
docs/
├── en/
│   ├── _nav.json
│   ├── index.md
│   └── guide/_meta.json
└── zh/
    ├── _nav.json
    └── …
```

**The default language's prefix is dropped from routes**: `en/guide/intro` serves at `/guide/intro`, while `zh/guide/intro` serves at `/zh/guide/intro`. A `_nav.json` `text` or `_meta.json` `label` may be an i18n key resolved per language against a root `i18n.json` (`{ textId: { lang: string } }`).

## multiVersion

Declare `multiVersion` at the **top level** — a default version and the full list:

```ts
export default defineConfig({
  multiVersion: {
    default: "v2",
    versions: ["v1", "v2"],
  },
});
```

### Directory layout and routing

One directory per version under `docs/`, named exactly as the `versions` entries (there is no fixed `versioned/` folder — the names are whatever you list):

```text
docs/
├── v1/
│   └── guide/index.mdx
└── v2/
    └── guide/index.mdx
```

**The default version's prefix is dropped**: with `default: "v2"`, `v2/guide/` serves at `/guide/` and `v1/guide/` at `/v1/guide/`. Links inside a version auto-acquire that version's prefix, so a `/guide/` link in a `v1` page resolves to `/v1/guide/`.

Version-scoped search is on by default (`search.versioned: true` searches only the current version's index; set it `false` to search across all versions). A component can read the active version with `useVersion()` from `@rspress/core/runtime`.

## Composing i18n and versioning

They nest **version at the top, language within** — a per-language subdirectory inside each version directory — and both defaults are omitted from the route:

```text
docs/
├── v1/{en,zh}/…
└── v2/{en,zh}/…
```

| File | Route (`default: v2`, `lang: en`) |
| --- | --- |
| `v2/en/index.md` | `/` (both defaults dropped) |
| `v2/zh/index.md` | `/zh/` |
| `v1/en/index.md` | `/v1/` |
| `v1/zh/index.md` | `/v1/zh/` |

## Dead links during translation

While a locale is only partly translated, RSPress's dead-link checker flags the untranslated gaps and fails the build. Relaxing it with `markdown: { link: { checkDeadLinks: false } }` is the common accommodation — but it silences **all** dead-link reports, not just the translation gaps, so check links by hand while it is off (see `doc-writer`'s review rubric and `plugin-config`'s troubleshooting).
