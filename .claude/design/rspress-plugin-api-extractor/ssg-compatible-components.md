---
status: current
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-05-26
last-synced: 2026-05-26
completeness: 85
related:
  - rspress-plugin-api-extractor/component-development.md
  - rspress-plugin-api-extractor/build-architecture.md
  - rspress-plugin-api-extractor/page-generation-system.md
  - rspress-plugin-api-extractor/llms-integration.md
dependencies:
  - rspress-plugin-api-extractor/component-development.md
---

# SSG-Compatible Components

## Overview

RSPress renders pages two ways: as interactive HTML in the browser, and as static markdown for LLM consumption (`llms.txt`, `llms-full.txt`). The runtime components must produce both from one codebase. They do this by branching on `import.meta.env.SSG_MD`: in SSG-MD mode they return clean markdown, otherwise they return the interactive React UI.

For the broader component conventions (directory layout, styling, accessibility), see `component-development.md`.

## Dual-mode pattern

```tsx
import type { ReactElement } from "react";
import styles from "./index.module.css";

export interface ComponentProps {
  data: string;
}

export function Component({ data }: ComponentProps): ReactElement {
  if (import.meta.env.SSG_MD) {
    return <>{`**Data:** ${data}`}</>; // clean markdown
  }
  return (
    <div className={styles.wrapper}>
      <strong>Data:</strong> {data}
    </div>
  );
}
```

The SSG-MD branch returns markdown as a JSX fragment wrapping a string literal — never `dangerouslySetInnerHTML`. The browser branch uses CSS-module class names.

## Why source export

`import.meta.env.SSG_MD` is only defined when **RSPress** compiles the component during the site build; a bundle pre-compiled by rslib sees `undefined`. The plugin therefore ships the runtime as source: the `./runtime` export points directly at `src/runtime/index.tsx`, and `src/runtime` is listed in the package `files`.

```json
{
  "exports": { "./runtime": "./src/runtime/index.tsx" },
  "files": ["dist", "src/runtime"]
}
```

Because RSPress compiles the source, `import.meta.env.SSG_MD` resolves to `true` or `false` per build mode and the dual-mode branch works. (An earlier design shipped both a pre-compiled `./runtime` and a source `./runtime-source`; that split has been collapsed into the single source export.)

## Components

The public runtime exports (`src/runtime/index.tsx`) are the documentation building blocks used in generated MDX:

| Component | Role |
| --- | --- |
| `SignatureBlock` | Signature code block with a "Signature" heading and wrap toggle |
| `MemberSignature` | Member signature block, reusing signature styling |
| `ExampleBlock` | Example code block (no heading) with copy and wrap toggles |
| `ApiSignature` / `ApiMember` / `ApiExample` | SSG-MD-aware wrappers around the block components |
| `ParametersTable` | Parameter documentation table |
| `EnumMembersTable` | Enum member/value table |

The `hastToReact` utility (`src/runtime/utils/hast-renderer.js`) renders Shiki HAST to React in browser mode. `ApiLlmsPackageActions` is intentionally not exported here — RSPress compiles it from source via `globalUIComponents` (see `llms-integration.md`).

The interactive blocks compose shared pieces: `SignatureToolbar` (wrap/copy buttons) and `SignatureCode` (Shiki HTML with Twoslash tooltips). See `src/runtime/components/` for the full tree.

## CSS modules

Runtime components use CSS modules (`index.module.css`), not Sass — RSPress has no Sass support configured by default, and CSS modules match RSPress's own CSS-module handling. Theming uses CSS custom properties defined in `src/runtime/components/shared/variables.css`, with `html.rp-dark` overrides for dark mode. Nested elements use `:global()` selectors.

CSS modules are imported with a default import (`import styles from "./index.module.css"`) to match RSPress's `namedExport: false` configuration; a named-import style would break the site build.

## Markdown generation in SSG-MD mode

Common patterns for the SSG-MD branch:

- **Headings, lists, formatting** — assemble a markdown string and return it as a fragment.
- **Tables** — emit `| col | col |` rows with a header separator; sanitize HTML out of cell text.
- **HTML to markdown** — strip tags and decode entities when the input is Shiki HTML.
- **Base64 summaries** — decode with `Buffer.from(summary, "base64")`, falling back to tag-stripping on failure.

`ExampleBlock`'s wrapper illustrates the split: SSG-MD mode emits a simple `<pre><code>` (RSPress converts it to a clean code fence), while browser mode renders the full block with Shiki HTML, Twoslash tooltips, a copy button (clean code, directives stripped) and a wrap toggle.

## Troubleshooting

- **Component never renders markdown** — confirm it is imported from `rspress-plugin-api-extractor/runtime` (source) and that the `import.meta.env.SSG_MD` branch exists; check the generated `dist/*.md`.
- **CSS classes undefined** — use a default import (`import styles from "./index.module.css"`), not a namespace import.
- **Styles missing on nested elements** — wrap nested selectors in `:global()`.
- **TS cannot find `*.module.css`** — declare the module in `types/env.d.ts`.

## Related documentation

- **Component Development:** `component-development.md` — component conventions, styling and accessibility
- **Build Architecture:** `build-architecture.md` — dual-bundle build and runtime export
- **Page Generation System:** `page-generation-system.md` — components used in generated pages
- **LLMs Integration:** `llms-integration.md` — SSG-MD file generation and the `globalUIComponents` path
