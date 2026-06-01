---
status: current
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-06-01
last-synced: 2026-06-01
completeness: 85
related:
  - rspress-plugin-api-extractor/build-architecture.md
  - rspress-plugin-api-extractor/ssg-compatible-components.md
  - rspress-plugin-api-extractor/llms-integration.md
dependencies:
  - rspress-plugin-api-extractor/build-architecture.md
---

# Component Development Guide

## Table of Contents

- [Overview](#overview)
- [Component Organization](#component-organization)
- [Registration](#registration)
- [Component Structure](#component-structure)
- [Styling](#styling)
- [Accessibility](#accessibility)
- [Common Pitfalls](#common-pitfalls)

## Overview

This guide covers conventions for the React components in the runtime tree (`src/runtime/`). Every component must be SSG-MD compatible (render markdown when `import.meta.env.SSG_MD` is set) — see `ssg-compatible-components.md` for the dual-mode pattern. This document focuses on organization, registration and styling.

## Component Organization

Components live one-per-directory under `src/runtime/components/`, each with an `index.tsx` and, where it has browser-mode styling, an `index.module.css`:

```text
src/runtime/components/
├── SignatureBlock/        # signature code block (heading + wrap)
├── MemberSignature/       # member signature block
├── ExampleBlock/          # example code block (copy + wrap)
├── ApiSignature/          # SSG-MD-aware signature wrapper
├── ApiMember/             # SSG-MD-aware member wrapper
├── ApiExample/            # SSG-MD-aware example wrapper
├── ParametersTable/       # parameter table
├── EnumMembersTable/      # enum member/value table
├── MarkdownContent/       # rendered markdown body
├── MarkdownText/          # inline markdown text
├── SignatureToolbar/      # shared toolbar (wrap/copy buttons)
├── SignatureCode/         # shared Shiki HTML + Twoslash code display
├── ApiLlmsPackageActions/ # LLMs scope actions (globalUIComponents)
├── ApiLlmsViewOptions/    # aliased RSPress LlmsViewOptions
├── buttons/               # ButtonGroup, WrapSignatureButton, CopyCodeButton
├── icons/                 # CheckIcon, CopyIcon, WrapIcon, UnwrapIcon
└── shared/                # variables.css, _twoslash.css, types.ts
```

Colocating logic and styles keeps related files together. The runtime is emitted **bundleless** — `RSPressPluginBuilder` transpiles each component to its own `.js` next to its CSS module under `runtime/`, and RSPress does the final per-site compile (resolving `import.meta.env.SSG_MD`); see `ssg-compatible-components.md`. See `src/runtime/components/` for the authoritative tree.

## Registration

Most components are exported from `src/runtime/index.tsx` and imported directly in generated MDX:

```typescript
import { MemberSignature, ParametersTable, SignatureBlock }
  from "rspress-plugin-api-extractor/runtime";
```

`ApiLlmsPackageActions` and `ApiLlmsViewOptions` are the exception: they are registered through RSPress's `globalUIComponents` / `resolve.alias` (pointed at their transpiled `runtime/components/.../index.js` files and compiled by RSPress) rather than imported into MDX, because they use RSPress runtime hooks and would pull `react-dom` into the pre-imported runtime. See `llms-integration.md`.

### Avoid `import * as` of sibling runtime modules

Because the runtime is emitted bundleless, a namespace import of a sibling runtime module (`import * as RuntimeComponents from "../<Block>/index.js"`) forces a webpack namespace-object plus a shared runtime chunk that lands outside `runtime/`, breaking the per-file layout. Use named imports of sibling components instead: `ApiSignature`, `ApiExample` and `ApiMember` import `{ SignatureBlock }` / `{ ExampleBlock }` / `{ MemberSignature }`, which transpile to clean per-file ESM.

Props are declared as exported TypeScript interfaces with JSDoc so the API is type-checked and self-documenting.

## Component Structure

```tsx
// src/runtime/components/ExampleComponent/index.tsx
import type { ReactElement } from "react";
import { useState } from "react";
import styles from "./index.module.css";

export interface ExampleComponentProps {
  /** Brief description of the prop */
  propName: string;
  /** Optional prop description */
  optionalProp?: boolean;
}

export function ExampleComponent({
  propName,
  optionalProp = false,
}: ExampleComponentProps): ReactElement {
  const [open, setOpen] = useState(false);
  return <div className={styles.wrapper}>{/* … */}</div>;
}

export default ExampleComponent;
```

Shared building blocks (`SignatureToolbar`, `SignatureCode`, the `buttons/` and `icons/` components) are imported with `.js` extensions to satisfy the Biome `useImportExtensions` rule. The block components compose them: a toolbar plus a `SignatureCode` displaying Shiki HTML with Twoslash tooltips.

## Styling

Components use **CSS modules** (`index.module.css`), not Sass. Import the module as a default import and reference class names off it:

```tsx
import styles from "./index.module.css";
// className={styles.wrapper}
```

A default import is required to match RSPress's `namedExport: false` CSS-module configuration. Theming uses CSS custom properties defined in `src/runtime/components/shared/variables.css`, with `html.rp-dark` overrides for dark mode. Style nested non-module elements (`pre`, `code`, `a`) with `:global()` selectors. Twoslash hover/error styles are global (not module-scoped) and live in `shared/_twoslash.css`, imported once from `src/runtime/index.tsx`.

## Accessibility

- Use semantic HTML — a `<button type="button">` for actions, not a clickable `<div>`.
- Give icon-only buttons an `aria-label` and `title`.
- Ensure keyboard operation (Tab focus, Enter/Space activation) and a visible `:focus-visible` outline.
- Test with keyboard navigation and a screen reader (VoiceOver on macOS).

## Common Pitfalls

- **Missing CSS module import** — without `import styles from "./index.module.css"` the class names are `undefined` and styling silently drops.
- **Namespace CSS import** — `import * as styles` breaks against the `namedExport: false` config; use a default import.
- **Missing `:global()`** — module selectors do not reach nested `pre`/`code`/`a`; wrap them in `:global()`.
- **Missing `.js` extensions** — Biome's `useImportExtensions` rule requires them on relative imports.
- **Undocumented props** — add JSDoc to every prop in the interface for IDE support and generated docs.

## Related Documentation

- **Build Architecture:** `build-architecture.md` — compiled plugin, bundleless runtime and the `./runtime` export
- **SSG-Compatible Components:** `ssg-compatible-components.md` — dual-mode (markdown vs HTML) rendering
- **LLMs Integration:** `llms-integration.md` — the `globalUIComponents` registration path
