# Components and code blocks

The built-in MDX components RSPress 2.x ships, the code-block meta syntax, and the `:::` containers. Load this when adding an interactive element or a formatted code block to a page. Everything here is verified against the vendored RSPress 2.x source (`.repos/rspress`).

## Import from `@rspress/core/theme`

Every built-in component is imported from **`@rspress/core/theme`** — this is the load-bearing 2.x fact (the bare `rspress/theme` is 1.x and does not resolve; see the main skill's traps). Components are **not** auto-global: import each one in the MDX file before using it. The one exception is the `:::` container syntax, which is a markdown directive and needs no import.

```tsx
import { Badge, Tabs, Tab, PackageManagerTabs, Steps } from "@rspress/core/theme";
```

> **One-off exception:** `Callout` imports from `@rspress/core/theme-original`, not `@rspress/core/theme`. `theme-original` is otherwise only for custom-theme `theme/index.tsx` files — for ordinary doc authoring, prefer the `:::` container over the `Callout` component anyway.

## Component catalog

| Component | Import | Purpose |
| --- | --- | --- |
| `Badge` | `@rspress/core/theme` | Inline label; `type` = `tip`/`info`/`warning`/`danger`, optional `outline`. |
| `Tabs` / `Tab` | `@rspress/core/theme` | Tabbed panes; `groupId` syncs tab choice across the page. |
| `PackageManagerTabs` | `@rspress/core/theme` | Install/exec commands across npm/yarn/pnpm/bun/deno from one source. |
| `Steps` | `@rspress/core/theme` | Renders the headings inside it as numbered step blocks. |
| `PageTabs` / `PageTab` | `@rspress/core/theme` | Page-level sub-tabs (experimental; one set per page). |
| `SourceCode` | `@rspress/core/theme` | "View source" link; `platform` = `github`/`gitlab`. |
| `Prompt` | `@rspress/core/theme` | Copyable AI-agent instruction card. |
| `Tag` | `@rspress/core/theme` | Small tag label. |
| `OverviewGroup` | `@rspress/core/theme` | Groups card lists on an overview page. |
| `Callout` | `@rspress/core/theme-original` | Tip/warning/note block — prefer the `:::` container instead. |

> **Does not exist in 2.x:** `LinkCard` and `Card` are not RSPress 2.x components — do not reach for them. For an overview/landing grid, use `OverviewGroup` or a frontmatter `overview: true` page (see `references/frontmatter.md`), not a hand-imported card.

### Common usage

```tsx
<Badge type="tip" text="Stable" />

<PackageManagerTabs command="install rspress-plugin-api-extractor" />

<Tabs groupId="lang">
  <Tab label="TypeScript">…</Tab>
  <Tab label="JavaScript">…</Tab>
</Tabs>

<Steps>
### Install
…
### Configure
…
</Steps>
```

## Code-block meta

Metadata after the language tag controls how a fence renders. Two families: **meta flags** (after the language) and **inline notation** (`// [!code …]` comments). Notation is more robust than line-number meta because a formatter that shifts lines does not break it.

| Meta | Effect |
| --- | --- |
| `title="path/to/file.ts"` | Filename header on the block. |
| `{1,3-4}` | Highlight lines 1 and 3–4 (needs the compatible-meta-highlight transformer). |
| `lineNumbers` | Show line numbers (`lineNumbers=false` to disable per block). |
| `wrapCode` | Soft-wrap long lines (`wrapCode=false` to disable). |
| `fold height="350"` | Collapsible block; `height="200"` alone fixes height with scroll. |
| `file="./snippet.ts"` | Render an external file (`./`, `/` = docs root, `<root>/` = project root). |

| Inline notation | Effect |
| --- | --- |
| `// [!code highlight]` (`:2` for a range) | Highlight this line (or next N). |
| `// [!code ++]` / `// [!code --]` | Diff added / removed line. |
| `// [!code focus]` | Focus this line, dim the rest. |
| `// [!code error]` / `// [!code warning]` | Error/warning styling on the line. |

```ts title="example.ts" lineNumbers
const stable = true; // [!code highlight]
const removed = 1; // [!code --]
const added = 2; // [!code ++]
```

### Transformer registration

The `// [!code …]` **notation** transformers (`transformerNotationDiff`, `transformerNotationErrorLevel`, `transformerNotationFocus`, and `transformerNotationHighlight`) are RSPress defaults from `@shikijs/transformers` — they work out of the box. The `{2,4-6}` **meta-range** highlight is the exception: it needs `transformerCompatibleMetaHighlight` registered explicitly, and that one comes from `@rspress/core/shiki-transformers`, not `@shikijs/transformers`:

```ts
import { defineConfig } from "@rspress/core";
import { transformerCompatibleMetaHighlight } from "@rspress/core/shiki-transformers";

export default defineConfig({
  markdown: { shiki: { transformers: [transformerCompatibleMetaHighlight()] } },
});
```

So if a `{2,4-6}` range renders as literal text, register that transformer; if a `[!code …]` marker does, it is a genuine syntax slip (the notation transformers are already on). A plain `diff`-language fence with `+`/`-` gutters needs no transformer at all.

## `:::` containers

Callout containers are built into 2.x (no plugin, no import). The complete type set:

```markdown
:::note
:::tip
:::important
:::info
:::warning
:::danger
:::details
```

Types must be **lowercase** (`:::Tip` is not recognized). A custom title takes either form — prefer the space form in MDX, since the brace form needs its braces escaped:

```markdown
:::tip Custom title
Recommended in MDX — no brace escaping.
:::

:::details Click to expand
Collapsed by default.
:::
```

GitHub-style alerts (`> [!NOTE]`, `> [!WARNING]`, …) are an equivalent alternative RSPress 2.x also renders.
