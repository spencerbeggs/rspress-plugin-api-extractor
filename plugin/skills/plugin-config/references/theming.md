# Theming

How the generated API components are styled, and the two levers you have over them: the Shiki `theme` config option (code-block colors) and the `--api-*` CSS custom properties (everything else). Load this when a consumer wants to restyle signature blocks, parameter tables or code colors.

The dividing line with `rspress-core`: this reference owns the **`--api-*`** family that themes the generated components; the **`--rp-*`** family that themes RSPress's own chrome (sidebar, nav, page background) is `rspress-core`'s. They do not overlap.

## The first lever: Shiki `theme`

`theme` on an API config sets the syntax-highlighting theme for that API's code blocks. It is the simplest way to recolor code, and usually the only theming a site needs.

```ts
api: {
  packageName: "my-library",
  model: "./api/my-library.api.json",
  theme: { light: "github-light-default", dark: "github-dark-default" },
}
```

Pass a single string for one theme in both modes, or `{ light, dark }` for separate ones. Any [Shiki bundled theme](https://shiki.style/themes) name works.

### How dual themes render (the `--api-shiki-*` mechanism)

With a `{ light, dark }` theme, Shiki runs in `defaultColor: false` mode: instead of baking one color into each token, it emits **both** as inline CSS variables (`--api-shiki-light`, `--api-shiki-dark`, and `-bg`/`-font-style`/`-font-weight`/`-text-decoration` variants) on every span. CSS then picks the active one, scoped to `.api-doc-code` so it never collides with a site's own `--shiki-*` code blocks:

```css
/* light (default) */
.api-doc-code .shiki,
.api-doc-code .shiki span { color: var(--api-shiki-light); }

/* dark */
html.rp-dark .api-doc-code .shiki,
html.rp-dark .api-doc-code .shiki span { color: var(--api-shiki-dark); }
```

The switch keys off `html.rp-dark` — the same class RSPress toggles for its own dark mode — so code colors flip in lockstep with the rest of the site. You do not write this CSS; it ships with the plugin. Knowing it exists explains why a single Shiki `theme` handles both modes and why the code-block selector is `.api-doc-code`, not a generic `.shiki`.

## The second lever: `--api-*` custom properties

Everything the components render other than code tokens — backgrounds, borders, links, spacing, typography — themes through `--api-*` custom properties defined on `:root`, with a `html.rp-dark` block overriding the colors for dark mode. To restyle, **override these properties in your site's CSS**; do not fork the components.

```css
/* your site's global CSS */
:root { --api-color-link: #0060df; }
html.rp-dark { --api-color-link: #6cb4ff; }
```

The variable groups:

| Group | Variables |
| --- | --- |
| Colors | `--api-color-bg`, `--api-color-bg-secondary`, `--api-color-text`, `--api-color-text-secondary`, `--api-color-border`, `--api-color-border-secondary`, `--api-color-border-hover`, `--api-color-hover-bg`, `--api-color-active-bg`, `--api-color-link`, `--api-color-link-hover`, `--api-color-code-bg` |
| Spacing | `--api-spacing-xs` … `--api-spacing-xl` |
| Radius | `--api-border-radius`, `--api-border-radius-sm`, `--api-border-radius-md` |
| Typography | `--api-font-size-sm/base/md/lg`, `--api-line-height-base`, `--api-line-height-button` |
| Transitions | `--api-transition-fast/base/slow` |
| Shadows | `--api-shadow-sm`, `--api-shadow-md` |
| Z-index | `--api-z-index-dropdown` (40), `--api-z-index-tooltip` (999), `--api-z-index-popup` (1000) |
| Breakpoint | `--api-breakpoint-mobile` (768px) |

Only the **color** group is re-declared under `html.rp-dark`; spacing, typography and the rest are mode-independent. So a dark-mode restyle overrides colors under `html.rp-dark`; a structural restyle (spacing, radius) overrides once on `:root`.

## Twoslash popup CSS

The hover tooltips and error displays in code blocks are styled by **global** CSS (not CSS modules), because they target Shiki-generated class names the plugin does not control. That styling ships with the plugin. To adjust it, override the global Twoslash classes (e.g. `.twoslash-popup-container`, `.twoslash-hover`) in your site CSS — the popup uses `position: fixed` when visible and the plugin's own JS sets `--popup-top`/`--popup-left`/`--popup-max-width` on hover, so restyle appearance, not positioning.

## What not to reach for

- **Do not fork a runtime component to restyle it.** Override `--api-*` (or the Shiki `theme`) instead; a fork drifts from the shipped component on every plugin update.
- **Do not use `--rp-*` for a generated component.** Those theme RSPress chrome and have no effect on signature blocks or parameter tables. The mirror mistake — using `--api-*` for the sidebar — also fails. See `rspress-core` for `--rp-*`.
