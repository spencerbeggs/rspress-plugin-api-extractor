# Routing and navigation

The two navigation files — `_meta.json` (sidebar) and `_nav.json` (navbar) — with their complete 2.x field references. Load this when building or fixing a sidebar or navbar. All types below are verified against the vendored RSPress 2.x framework source (`.repos/rspress`, `@rspress/shared@2.0.17`).

## `_meta.json` — the sidebar (array form)

A `_meta.json` sits in a directory and orders/labels that directory's pages. It is a **JSON array** of entries (the framework type is `SideMeta = SideMetaItem[]`). The 1.x object/map form is not read on 2.x — see the main skill's traps.

An entry is either a bare string (shorthand for a file of that name) or an object with one of six `type` values:

| `type` | Renders as | Key fields |
| --- | --- | --- |
| `"file"` | A document page | `name`, `label?`, `tag?`, `overviewHeaders?`, `context?` |
| `"dir"` | A collapsible subdirectory | file fields + `collapsible?`, `collapsed?` |
| `"dir-section-header"` | A directory shown as a flat section header (new in 2.x) | dir fields + `label` |
| `"divider"` | A separator line | `dashed?` |
| `"section-header"` | A non-linking group heading | `label`, `tag?` |
| `"custom-link"` | An arbitrary internal/external link | `label`, `link` (or `items` to nest) |

### Field semantics

- **`name`** — the file or directory name, with or without extension (`"introduction"` resolves `introduction.mdx`).
- **`label`** — the sidebar display text. **Omit it and RSPress uses the page's H1** automatically.
- **`collapsible` / `collapsed`** (dir) — whether the group can collapse, and whether it starts collapsed.
- **`overviewHeaders`** — heading levels surfaced on the overview page; **defaults to `[2]`**.
- **`tag`** — an icon (SVG string or image URL) after the title.
- **`context`** — adds a `data-context` attribute to the sidebar DOM node.
- **`dashed`** (divider) — dashed instead of solid.
- **`link`** (custom-link) — the target; supports external URLs. Nest with `items`.

```json
[
  { "type": "file", "name": "index", "label": "Home" },
  { "type": "dir", "name": "guides", "label": "Guides", "collapsible": true, "collapsed": false },
  { "type": "divider" },
  { "type": "dir", "name": "api", "label": "API Reference", "collapsible": true, "collapsed": true }
]
```

### Ordering

**Order is array position.** There is no `priority`/`order`/`weight` field anywhere in the type — entries render top to bottom in the order you list them. Only when a directory has **no** `_meta.json` does RSPress auto-generate a sidebar, sorted alphabetically by filename; override that fallback by numeric-prefixing files (`1-intro.mdx`, `2-install.mdx`). With a `_meta.json` present, array order always wins.

### The section-header flat-spine pattern

`section-header` gives you a grouped sidebar with **no nesting** — group headings at the same level as the files under them, so a reader sees the whole spine at once. Combine with `divider` to separate groups:

```json
[
  { "type": "section-header", "label": "Getting started" },
  "introduction",
  "install",
  { "type": "divider" },
  { "type": "section-header", "label": "Guides" },
  "data-sources",
  "error-handling"
]
```

`dir-section-header` is the related pattern for the **root** `_meta.json`: it behaves like `dir` but renders the directory's title as a flat section header rather than a collapsible group — used to lay out top-level sections (`guide`, `api`) as headers.

## `_nav.json` — the navbar

A single `_nav.json` at the docs root defines the global top navigation. It is a JSON array of `NavItem`. An item may have a `link`, a set of `items` (a dropdown), or both:

| Field | Type | Purpose |
| --- | --- | --- |
| `text` | string | The label. |
| `link` | string | The target route. |
| `items` | `NavItem[]` | Dropdown children (the field is **`items`**, not `children`). |
| `activeMatch` | string | Regex deciding when this item is highlighted. |
| `position` | `"left" \| "right"` | Which side of the navbar. |
| `tag` | string | An icon/badge after the text. |

A **dropdown** is any item carrying `items` (with or without its own `link`).

```json
[
  { "text": "Guide", "link": "/guide", "activeMatch": "^/guide/", "position": "right" },
  {
    "text": "Packages",
    "link": "/packages",
    "activeMatch": "^/(packages|plugin|sdk)(/.*)?$",
    "position": "right",
    "items": [
      { "text": "@scope/plugin", "link": "/plugin", "activeMatch": "^/plugin/?$" },
      { "text": "@scope/sdk", "link": "/sdk", "activeMatch": "^/sdk(/.*)?$" }
    ]
  }
]
```

### `activeMatch` is a raw regex

`activeMatch` is a **regex source string** — no delimiters, no flags — compiled as `new RegExp(activeMatch).test(currentPathname)`. It defaults to the item's own `link`, so you only set it when the item should highlight for a broader set of routes than its link (e.g. a "Packages" dropdown that stays active across `/plugin`, `/sdk`, …). Because it is a real regex, anchor it (`^/guide/`) so it does not match unintended routes.

## The generated `api/` tree

The `rspress-plugin-api-extractor` plugin writes the entire `api/` subtree, including its own `_meta.json` files. Mount it into your sidebar with **one** `dir` entry in the root `_meta.json` (as in the example above) and touch nothing inside — the rest is build output. Authoring or ordering *inside* `api/` is `plugin-config`/`doc-writer` territory; here it is just one mounted directory.
