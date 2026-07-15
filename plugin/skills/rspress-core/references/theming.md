# Theming (`--rp-*`)

How to restyle an RSPress 2.x site: the `globalStyles` hook, the `--rp-*` CSS variable families, why a plain `:root` override wins, and the home-page gradient/dark-mode blocks. Load this when recoloring a site's chrome. Variable names are verified against the vendored theme CSS (`.repos/rspress/packages/core/src/theme/styles/vars/`).

This reference is RSPress chrome — sidebar, nav, hero, page background — themed through **`--rp-*`**. The plugin's generated components theme through **`--api-*`** (a different family, see `plugin-config`). Do not cross them.

## The `globalStyles` hook

`globalStyles` is a **top-level** `rspress.config.ts` field: an absolute path to a CSS file injected site-wide. This is where your `--rp-*` overrides live.

```ts
import path from "node:path";
import { defineConfig } from "@rspress/core";

export default defineConfig({
  globalStyles: path.join(import.meta.dirname, "theme/site.css"),
});
```

```css
/* theme/site.css */
:root {
  --rp-c-brand: #d6219b;
}
```

## Why a plain `:root` override wins

RSPress declares **every** theme variable inside a zero-specificity `:where(...)` selector — `:where(:root)`, `:where(html:not(.rp-dark))`, `:where(html.rp-dark)`. `:where()` contributes **no specificity**, so your ordinary `:root { --rp-c-brand: … }` (specificity 0,1,0) reliably beats the theme default (specificity 0,0,0) without `!important` and without matching the theme's exact selector. Override with plain `:root`; reach for `:where()` yourself only when defining your *own* low-specificity tokens that you want a consumer to override in turn.

For per-mode values, target the mode selector — **both** `html.rp-dark` and `html.dark` work as dark-mode selectors:

```css
:root { --rp-c-brand: #0060df; }
html.rp-dark { --rp-c-brand: #6cb4ff; }
```

## The `--rp-*` families

| Family | Variables |
| --- | --- |
| Brand | `--rp-c-brand`, `--rp-c-brand-light`, `--rp-c-brand-lighter`, `--rp-c-brand-dark`, `--rp-c-brand-darker`, `--rp-c-brand-tint` |
| Backgrounds | `--rp-c-bg`, `--rp-c-bg-soft`, `--rp-c-bg-mute`, `--rp-c-bg-alt` |
| Dividers | `--rp-c-divider`, `--rp-c-divider-light` |
| Text | `--rp-c-text-0` … `--rp-c-text-4`, `--rp-c-link` |
| Inline code | `--rp-c-text-code`, `--rp-c-text-code-bg`, `--rp-c-text-code-border` |
| Grays / shadows / radii | `--rp-c-gray*`, `--rp-shadow-1` … `--rp-shadow-5`, `--rp-radius`, `--rp-radius-small`, `--rp-radius-large` |
| Code block (container) | `--rp-code-font-size`, `--rp-code-title-bg`, `--rp-code-block-color`, `--rp-code-block-bg`, `--rp-code-block-border`, `--rp-code-block-shadow` |
| Home page | `--rp-home-hero-secondary-color`, `--rp-home-hero-title-color`, `--rp-home-hero-title-bg`, `--rp-home-background-bg`, `--rp-home-feature-bg` |

The brand ramp is the highest-leverage lever — setting the six `--rp-c-brand*` values recolors links, active states, buttons, and the hero across the whole site. The backgrounds/dividers/text families are defined per-mode, so override them under `html.rp-dark` too.

Two families are **not** `--rp-*`:

- **Shiki syntax tokens** are `--shiki-*` (`--shiki-token-keyword`, `--shiki-token-string`, …) — override these to recolor code-block *syntax*, distinct from the `--rp-code-block-*` container vars.
- **The plugin's generated components** are `--api-*` — see `plugin-config`.

## Home-page gradient and dark-mode blocks

A branded home hero and background come from the `--rp-home-*` family. A worked pattern (magenta→violet hero title with light/dark background glows), matching a real site's `globalStyles`:

```css
:where(html:not(.rp-dark)),
:where(html.rp-dark) {
  --rp-home-hero-secondary-color: #7c5cff;
  --rp-home-hero-title-color: transparent;
  --rp-home-hero-title-bg: linear-gradient(
    90deg,
    var(--rp-c-brand-dark) 0%,
    var(--rp-c-brand) 32%,
    var(--rp-home-hero-secondary-color) 100%
  );
}

:where(html:not(.rp-dark)) {
  --rp-home-background-bg: radial-gradient(42% 56% at 100% 0%, rgba(214,33,155,0.1) 0%, transparent 100%), #fff;
}
html.rp-dark {
  --rp-home-background-bg: radial-gradient(42% 56% at 100% 0%, #3a0b2a 0%, transparent 100%), #121212;
}
```

Setting `--rp-home-hero-title-color: transparent` with a `--rp-home-hero-title-bg` gradient produces a gradient-filled hero title (the gradient shows through the transparent text). Keep project-specific tokens (your own `--brand-50`…`--brand-900` ramp) in a separate `:where(:root)` block and reference them from the `--rp-*` overrides, so the RSPress-facing variables stay readable.
