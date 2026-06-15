---
status: current
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-06-15
last-synced: 2026-06-15
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

## Why bundleless per-file output

`import.meta.env.SSG_MD` is only defined when **RSPress** compiles the component during the site build. A single bundled `runtime/index.js` froze `import.meta.env.SSG_MD` to `undefined`, so the dual-mode branch always took the browser path. The fix emits the runtime **bundleless** — each component is transpiled 1:1 into its own `.js` under `runtime/`, mirroring the `src/runtime/...` tree, and `import.meta.env` is left as a runtime expression that RSPress resolves per site build.

The mechanism lives in `@savvy-web/rspress-builder`'s `definePlugin` (built on `@savvy-web/bundler`), not in the plugin. The plugin's `savvy.build.ts` passes `runtime: true` to opt the runtime bundle in; `definePlugin` then produces it. Key properties of the published runtime:

- Each component compiles to its own `.js` next to its CSS module (e.g. `runtime/components/ApiLlmsPackageActions/index.js`), bundleless with the runtime tree as its out-base.
- `react`, `react/jsx-runtime` and `@theme` stay **external** (RSPress provides them); JSX is transpiled to `react/jsx-runtime` calls.
- `import.meta.env` is preserved by an identity `define` applied by `definePlugin`, so `import.meta.env.SSG_MD` stays a runtime expression.
- A bundled `runtime/index.d.ts` (types only) is still emitted so the published `./runtime` export's `types` condition resolves.

The published `exports["./runtime"]` is `{ "types": "./runtime/index.d.ts", "import": "./runtime/index.js" }`. (The source `plugin/package.json` keeps `"./runtime": "./src/runtime/index.tsx"` for the dev workspace link; the build rewrites it to the compiled form.) An earlier design shipped both a pre-compiled `./runtime` and a source `./runtime-source`; that split was collapsed, then an interim attempt shipped raw `.tsx` — both are superseded by this bundleless output.

### Layout-invariant component paths

The bundleless layout makes the runtime **component paths in `plugin.ts` layout-invariant**. `ApiLlmsPackageActions` (registered via `globalUIComponents`) and `ApiLlmsViewOptions` (registered via `resolve.alias` over RSPress's `LlmsViewOptions.js`) are referenced by an absolute `.js` path computed from `import.meta.url`. Because every emitted package root carries the identical per-file flat shape — the dev/link target `dist/dev/pkg` and each published `dist/prod/<target>/pkg` — the runtime always sits at `runtime/components/.../index.js` next to `index.js`. Those paths are a **zero-level** resolve — `path.resolve(pluginDir, "runtime/components/.../index.js")` — that points at a real file in both the linked and published layouts. RSPress compiles the referenced `.js`, resolving `import.meta.env.SSG_MD`. An earlier `../../src/runtime/...` form only resolved against the source tree, breaking the `globalUIComponents` registration and cascading into an `ESModulesLinkingError` for RSPress's `LlmsViewOptions` re-export under `llms: true`. See `llms-integration.md` for the registration sites and `build-architecture.md` for the output roots.

### Avoid `import * as` of sibling runtime modules

In bundleless mode a namespace import of a sibling runtime module (`import * as X from "../Block/index.js"`) forces a webpack namespace-object plus a shared runtime chunk that lands outside `runtime/`, breaking the per-file layout. `ApiSignature`, `ApiExample` and `ApiMember` therefore use named imports of their block components (`import { SignatureBlock }`, `import { ExampleBlock }`, `import { MemberSignature }`), which transpile to clean per-file ESM. See `component-development.md`.

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

- **Component never renders markdown** — confirm it is imported from `rspress-plugin-api-extractor/runtime` (the bundleless `.js`, compiled by RSPress) and that the `import.meta.env.SSG_MD` branch exists; check the generated `dist/*.md`.
- **CSS classes undefined** — use a default import (`import styles from "./index.module.css"`), not a namespace import.
- **Styles missing on nested elements** — wrap nested selectors in `:global()`.
- **TS cannot find `*.module.css`** — declare the module in `types/env.d.ts`.

## Related documentation

- **Component Development:** `component-development.md` — component conventions, styling and accessibility
- **Build Architecture:** `build-architecture.md` — per-file plugin, bundleless runtime and the `./runtime` export
- **Page Generation System:** `page-generation-system.md` — components used in generated pages
- **LLMs Integration:** `llms-integration.md` — SSG-MD file generation and the `globalUIComponents` path
