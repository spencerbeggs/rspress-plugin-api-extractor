# Frontmatter

The frontmatter fields an RSPress 2.x page can set, the `pageType` enum, and the home-page `hero`/`features` shapes. Load this when configuring a page's metadata or building a home/landing page. All types are verified against the vendored `@rspress/shared@2.0.17` `FrontMatterMeta`.

## Field reference

| Field | Type | Purpose |
| --- | --- | --- |
| `title` | string | Page title; overrides the H1 as the document title. |
| `description` | string | `<meta name="description">` for SEO. |
| `pageType` | enum | Page layout — see below. Default `doc`. |
| `overview` | boolean | Turn the page into an overview page. Default `false`. |
| `overviewHeaders` | number[] | Heading levels shown on the overview. Default `[2]`. |
| `hero` | object | Home-page hero block (see below). |
| `features` | object[] | Home-page feature cards (see below). |
| `sidebar` | `boolean \| "placeholder"` | Show/hide the left sidebar; `"placeholder"` keeps its space blank. |
| `outline` | boolean | Show/hide the right-side outline. |
| `navbar` | boolean | Show/hide the top navbar. |
| `footer` | boolean | Show/hide the footer (prev/next links). |
| `titleSuffix` | string | Suffix appended to the title (default = site title). |
| `head` | `[string, Record<string,string>][]` | Extra `<head>` tags injected per page (e.g. Open Graph meta). |
| `search` | boolean | Include the page in the search index. Default `true` (`home` pages always excluded). |

Additional keys are permitted (the type carries an open index signature), so a plugin may read its own frontmatter fields.

## The `pageType` enum

Exactly six values (verified against the framework type). Default is `doc`.

| `pageType` | Layout |
| --- | --- |
| `doc` | Navbar + left sidebar + content + right outline. The default. |
| `home` | Homepage layout (navbar + hero/features). |
| `doc-wide` | Wide content — the body widens when `outline: false` and `sidebar: false`. |
| `custom` | Navbar + fully custom page body. |
| `blank` | Custom body **without** the navbar. |
| `404` | The not-found page. |

> **Trap:** `overview` is **not** a `pageType`. An overview page is a normal page with the boolean `overview: true` field (optionally `overviewHeaders`) — older skills that write `pageType: overview` are wrong; that value does not exist and the page falls back to `doc`.

## Home page: `hero`

Every `hero` sub-field is optional. `actions[].theme` is `"brand"` or `"alt"`.

```yaml
---
pageType: home
hero:
  name: My Library
  text: A typed data-pipeline toolkit
  tagline: Compose sources, transforms, and sinks with full type inference
  image:
    src: /logo.png
    alt: My Library
  actions:
    - theme: brand
      text: Get started
      link: /guides/getting-started
    - theme: alt
      text: API reference
      link: /api
---
```

`hero` also accepts a `badge` (string or `{ text, link? }`), and `image.src` may be a `{ light, dark }` pair for theme-specific logos.

## Home page: `features`

Each feature card takes an `icon`, `title`, `details`, and optional `span`/`link`. `icon` is a string — an emoji, an HTML/SVG string, or an image URL.

```yaml
---
pageType: home
features:
  - icon: 📦
    title: Typed pipelines
    details: Compose sources and transforms with inference end to end.
    span: 6
    link: /guides/getting-started
  - icon: 🎨
    title: Rich docs
    details: Generated API reference with live, type-checked examples.
    span: 6
---
```

`span` controls the card's grid width (the docs support `3`, `4`, `6`); `link` makes the whole card a link.

## Overview pages

`overview: true` turns a page into an overview that lists the pages beneath it. `overviewHeaders` (default `[2]`) picks which heading levels of the child pages surface in the overview — `overviewHeaders: [2, 3]` shows H2 and H3, `overviewHeaders: []` shows none.

## Note on the generated reference

The plugin sets `title`, `description`, and the OG `head` timestamps on the pages it generates — do not hand-edit those (the generated tree is build output; see the main skill and `doc-writer`). This reference is for your **hand-written** pages.
