---
status: current
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-01-23
last-synced: 2026-01-23
completeness: 90
related: []
dependencies: []
---

# SSG-Compatible Components

**Status:** Production-ready

## Overview

This document describes the architecture for creating React components that
work in both browser rendering and SSG-MD (Static Site Generation to Markdown)
modes. These components can detect their rendering context and output either
interactive HTML or clean markdown accordingly.

### Problem Statement

RSPress supports two rendering modes:

1. **Browser Mode** - Interactive HTML with React components, CSS styling,
   and JavaScript interactivity
2. **SSG-MD Mode** - Static markdown files for LLM consumption (llms.txt, llms-full.txt)

The plugin needs components that can:

- Render rich, interactive UI in the browser
- Output clean, semantic markdown in SSG-MD mode
- Share the same codebase without duplication
- Work with RSPress's build pipeline

### Solution

Create components that:

1. Detect `import.meta.env.SSG_MD` at build time
2. Return markdown strings in SSG-MD mode
3. Use CSS modules (not Sass) for RSPress compatibility
4. Are compiled by RSPress (not pre-compiled in the plugin)

## Architecture

### Dual-Mode Component Pattern

Components follow this pattern:

```tsx
import type { ReactElement } from "react";
import styles from "./index.module.css";

export interface ComponentProps {
  data: string;
}

export function Component({ data }: ComponentProps): ReactElement {
  // SSG-MD mode: return clean markdown
  if (import.meta.env.SSG_MD) {
    return <>{`**Data:** ${data}`}</>;
  }

  // Browser mode: return interactive HTML
  return (
    <div className={styles.wrapper}>
      <strong>Data:</strong> {data}
    </div>
  );
}
```

**Key Points:**

- Single component, dual behavior
- Markdown returned as JSX fragment with string literal
- CSS modules for scoped styling
- No dangerouslySetInnerHTML in SSG-MD mode

### Build-Time vs Pre-Compilation

**Critical Distinction:**

The `import.meta.env.SSG_MD` variable is **only available when RSPress
compiles the components during the website build**. Pre-compiled components
(built by rslib in the plugin) have `undefined` for this variable.

```text
Plugin Build (rslib):
  import.meta.env.SSG_MD = undefined ❌

Website Build (RSPress):
  import.meta.env.SSG_MD = true (in SSG-MD mode) ✅
  import.meta.env.SSG_MD = false (in browser mode) ✅
```

**Solution:** Export components as **source files** (`.tsx`) so RSPress
compiles them:

```json
// package.json
{
  "exports": {
    "./runtime-source": {
      "types": "./src/runtime/index.tsx",
      "import": "./src/runtime/index.tsx"
    }
  },
  "files": ["dist", "src/runtime"]
}
```

### Component Hierarchy

**Current Components:**

```text
SignatureBlockWrapper (wrapper)
  └─ SignatureBlock (inner component)
       ├─ SignatureToolbar (toolbar with wrap button)
       └─ SignatureCode (Shiki HTML with Twoslash tooltips)

MemberSignatureWrapper (wrapper with parameters support)
  └─ MemberSignature (inner component)
       ├─ SignatureToolbar (toolbar with wrap button)
       └─ SignatureCode (Shiki HTML with Twoslash tooltips)

ExampleBlockWrapper (wrapper for example code)
  └─ ExampleBlock (inner component - no heading)
       ├─ SignatureToolbar (toolbar with copy + wrap buttons)
       └─ SignatureCode (Shiki HTML with Twoslash tooltips)

ParametersTable (standalone)
  └─ Table rows (parameter documentation)
```

**Key Differences Between Block Types:**

- **SignatureBlock**: Has "Signature" heading, wrap button only
- **ExampleBlock**: No heading, both copy and wrap buttons
- **MemberSignature**: Reuses SignatureBlock styling for member docs

The component library focuses on essential documentation components with
simple, semantic wrappers for code blocks and member signatures.

## Implementation Guide

### 1. Create Component Structure

```text
src/runtime/components/MyComponent/
├── index.tsx          # Component logic
└── index.module.css   # Scoped styles
```

### 2. Component Implementation

```tsx
import clsx from "clsx";
import type { ReactElement } from "react";
import styles from "./index.module.css";

export interface MyComponentProps {
  title: string;
  content: string;
  items?: string[];
}

export function MyComponent({
  title,
  content,
  items,
}: MyComponentProps): ReactElement {
  // SSG-MD mode: return clean markdown
  if (import.meta.env.SSG_MD) {
    let markdown = `### ${title}\n\n${content}`;

    if (items && items.length > 0) {
      markdown += '\n\n';
      for (const item of items) {
        markdown += `- ${item}\n`;
      }
    }

    return <>{markdown}</>;
  }

  // Browser mode: return interactive HTML
  return (
    <div className={styles.wrapper}>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.content}>{content}</p>
      {items && items.length > 0 && (
        <ul className={styles.list}>
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default MyComponent;
```

### 3. CSS Module Styling

Use CSS modules with CSS custom properties (no Sass):

```css
/* index.module.css */
.wrapper {
  padding: var(--api-spacing-md);
  border: 1px solid var(--api-color-border);
  border-radius: var(--api-border-radius);
  background-color: var(--api-color-bg);
}

html.rp-dark .wrapper {
  border-color: var(--api-color-border);
  background-color: var(--api-color-bg);
}

.title {
  margin: 0 0 var(--api-spacing-sm);
  font-size: var(--api-font-size-lg);
  color: var(--api-color-text);
}

/* Use :global() for nested elements */
.wrapper :global(a) {
  color: var(--api-color-link);
}
```

**CSS Variables defined in `shared/variables.css`:**

```css
:root {
  /* Colors */
  --api-color-bg: #f6f8fa;
  --api-color-border: #e1e4e8;
  --api-color-text: #24292f;
  --api-color-link: #0969da;

  /* Spacing */
  --api-spacing-sm: 0.5rem;
  --api-spacing-md: 0.75rem;
  --api-spacing-lg: 1rem;

  /* Typography */
  --api-font-size-md: 0.9375rem;
  --api-font-size-lg: 1.25rem;

  /* Border */
  --api-border-radius: 6px;
}

html.rp-dark {
  --api-color-bg: #161b22;
  --api-color-border: #30363d;
  --api-color-text: #e6edf3;
  --api-color-link: #4493f8;
}
```

### 4. Export Component

Add to `src/runtime/index.tsx`:

```tsx
export type { MyComponentProps } from "./components/MyComponent/index.js";
export { MyComponent } from "./components/MyComponent/index.js";
```

### 5. Use in Generated MDX

```tsx
// src/markdown/page-generators/example-page.ts
let content = generateFrontmatter(name, summary);
content += `import { MyComponent } from "rspress-plugin-api-extractor/runtime";\n\n`;
content += `<MyComponent title="Example" content="This is content" />\n\n`;
```

## Configuration

### Package.json Exports

```json
{
  "exports": {
    "./runtime": {
      "types": "./dist/runtime/index.d.ts",
      "import": "./dist/runtime/index.js"
    },
    "./runtime-source": {
      "types": "./src/runtime/index.tsx",
      "import": "./src/runtime/index.tsx"
    }
  },
  "files": ["dist", "src/runtime"]
}
```

**Two exports:**

- `./runtime` - Pre-compiled bundle (used in production)
- `./runtime-source` - Source files (for SSG-MD mode testing)

### Rslib Configuration

```typescript
// rslib.config.ts
export default defineConfig({
  lib: [
    {
      // Runtime bundle (React components + CSS)
      dts: {
        bundle: true,
        tsgo: true,
        distPath: "./dist/runtime",
      },
      source: {
        entry: { index: "./src/runtime/index.tsx" },
      },
      bundle: true,
      format: "esm",
      plugins: [pluginReact()],
      output: {
        distPath: { root: "./dist/runtime" },
        target: "web",
        cssModules: {
          // Use default export to match RSPress
          namedExport: false,
          exportLocalsConvention: "camelCaseOnly",
        },
      },
    },
    // ... Node.js plugin config
  ],
});
```

**Key Settings:**

- `cssModules.namedExport: false` - Matches RSPress CSS module format
- `target: "web"` - Browser-compatible output
- Separate `distPath` to avoid rslib-runtime.js conflicts

### TypeScript Configuration

```typescript
// types/env.d.ts
/// <reference types="@rslib/core/types" />

declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
```

## Markdown Generation Patterns

### Simple Text

```tsx
if (import.meta.env.SSG_MD) {
  return <>This is plain text</>;
}
```

### Headings and Formatting

```tsx
if (import.meta.env.SSG_MD) {
  return <>
    {`### ${heading}

**Bold text** and \`inline code\`

This is a paragraph with [a link](https://example.com).`}
  </>;
}
```

### Lists

```tsx
if (import.meta.env.SSG_MD) {
  let markdown = `### Items\n\n`;
  for (const item of items) {
    markdown += `- ${item}\n`;
  }
  return <>{markdown}</>;
}
```

### Tables

```tsx
if (import.meta.env.SSG_MD) {
  let markdown = "#### Parameters\n\n";
  markdown += "| Name | Type | Description |\n";
  markdown += "|------|------|-------------|\n";

  for (const param of parameters) {
    const name = `\`${param.name}\``;
    const type = param.type ? `\`${param.type}\`` : "";
    const description = param.description.replace(/<[^>]*>/g, "").trim();
    markdown += `| ${name} | ${type} | ${description} |\n`;
  }

  return <>{markdown}</>;
}
```

### Extracting Text from HTML

When you have HTML content (e.g., from Shiki) that needs to be markdown:

```tsx
if (import.meta.env.SSG_MD) {
  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, "");

  // Decode HTML entities
  text = text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

  return <>{`\`${text}\``}</>;
}
```

### Decoding Base64 Summaries

```tsx
if (import.meta.env.SSG_MD && summary) {
  let decodedSummary = "";
  try {
    decodedSummary = Buffer.from(summary, "base64").toString("utf-8");
  } catch {
    // Fallback if decoding fails
    decodedSummary = summary.replace(/<[^>]*>/g, "").trim();
  }

  return <>{`### ${title}\n\n${decodedSummary}`}</>;
}
```

## Testing

### Unit Testing Components

Create test files that verify both modes:

```tsx
// MyComponent.test.tsx
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { MyComponent } from "./index.js";

describe("MyComponent", () => {
  it("renders interactive HTML in browser mode", () => {
    const { container } = render(
      <MyComponent title="Test" content="Content" />
    );

    expect(container.querySelector("h3")).toBeDefined();
    expect(container.textContent).toContain("Test");
  });

  it("renders markdown in SSG-MD mode", () => {
    // Mock import.meta.env.SSG_MD
    import.meta.env.SSG_MD = true;

    const { container } = render(
      <MyComponent title="Test" content="Content" />
    );

    expect(container.textContent).toContain("### Test");
    expect(container.querySelector("h3")).toBeNull();

    import.meta.env.SSG_MD = false;
  });
});
```

### Integration Testing

Create a test MDX page:

```mdx
---
title: SSG-MD Test
---

import { MyComponent } from "rspress-plugin-api-extractor/runtime-source";

<MyComponent title="Example" content="Testing SSG-MD mode" />
```

Build and verify output:

```bash
pnpm build
cat dist/ssg-md-test.md
```

**Expected output in SSG-MD mode:**

```markdown
### Example

Testing SSG-MD mode
```

**Expected output in browser:**

Interactive HTML with styling.

## Design Decisions

### Why CSS Modules Instead of Sass?

**Problem:** RSPress doesn't have Sass support configured by default. When
importing `.scss` files from plugin source, the build fails:

```text
Module parse failed: JavaScript parse error: Expression expected
@use '../shared/variables' as *;
To enable support for Sass, use "@rsbuild/plugin-sass"
```

**Options Considered:**

1. **Inject Sass plugin from our plugin** ❌
   - Complex configuration
   - Couples plugin to RSPress internals
   - Requires users to configure their rspress.config.ts

2. **Convert to CSS modules** ✅
   - Standard CSS, no preprocessor needed
   - Better scoping (prevents naming collisions)
   - Matches RSPress's CSS module configuration
   - Smaller bundle size
   - Works out of the box

**Result:** CSS modules with CSS custom properties provide the same benefits
as Sass (variables, theming) without the dependency.

### Why Default Exports for CSS Modules?

**Plugin build:**

```typescript
cssModules: {
  namedExport: false,  // export default { ... }
}
```

**Reason:** RSPress compiles CSS modules with default exports. To maintain
consistency:

```tsx
// Works in both plugin build and RSPress build
import styles from "./index.module.css";
className={styles.wrapper}
```

If we used `namedExport: true` in the plugin:

- Plugin build: `import { wrapper } from "./index.module.css"`
- RSPress build: `import styles from "./index.module.css"`
- **Result:** Build failures ❌

### Why Source Exports?

**Pre-compiled approach:**

```text
Plugin build (rslib) → dist/runtime/index.js
Website imports dist/runtime/index.js
import.meta.env.SSG_MD = undefined ❌
```

**Source export approach:**

```text
Plugin exports src/runtime/index.tsx
Website imports src/runtime/index.tsx
RSPress compiles during website build
import.meta.env.SSG_MD = true/false ✅
```

**Trade-off:**

- Pre-compiled: Faster builds, but no SSG-MD detection
- Source exports: Slower builds, but full SSG-MD support

**Decision:** Provide both:

- `./runtime` - Pre-compiled for production
- `./runtime-source` - Source for SSG-MD testing

### Why Not Use Server-Side Rendering (SSR)?

**Alternative approach:** Use RSPress's SSR to render components on the server.

**Problems:**

1. SSR renders HTML, not markdown
2. Would need post-processing to convert HTML → markdown
3. Loses semantic structure (headings, lists become divs)
4. More complex pipeline

**Our approach:** Direct markdown generation is simpler and produces cleaner
output.

## Performance Considerations

### Bundle Size

**Before CSS modules:**

- Runtime: 26.0 kB CSS + 16.9 kB JS = 42.9 kB

**After CSS modules:**

- Runtime: 22.4 kB CSS + 17.2 kB JS = 39.6 kB
- **Savings:** 3.3 kB (7.7%)

**Why smaller?**

- No Sass runtime
- Better CSS minification
- Removed unused Sass mixins

### Build Time

**Plugin build:**

- With Sass: ~350ms
- With CSS modules: ~270ms
- **Faster:** 23%

**Website build:**

- Unchanged (RSPress handles CSS modules natively)

## Future Enhancements

### Phase 1: Complete (Current State)

- ✅ CSS modules conversion
- ✅ SSG-MD detection pattern
- ✅ Test export for source components
- ✅ Component documentation

### Phase 2: Improve Markdown Output

- [ ] Preserve code block language info in SSG-MD mode
- [ ] Add syntax highlighting hints for markdown
- [ ] Better table formatting
- [ ] Preserve more semantic structure

### Phase 3: Expand Component Library

- [ ] Create more SSG-compatible components
- [ ] Add composition patterns
- [ ] Document best practices
- [ ] Add more examples

### Phase 4: Developer Experience

- [ ] Add Storybook for component preview
- [ ] Create component generator CLI
- [ ] Add visual regression testing
- [ ] Improve error messages

## Examples

### Real Components

See these implementations for reference:

1. **ParametersTable** (`src/runtime/components/ParametersTable/`)
   - Table generation in SSG-MD mode
   - Styled table in browser mode
   - HTML sanitization

2. **MemberSignature** (`src/runtime/components/MemberSignature/`)
   - Complex markdown generation
   - Nested component composition
   - Rendering Shiki HTML

3. **MemberSignatureWrapper**
   (`src/runtime/components/MemberSignatureWrapper/`)
   - Wrapper component pattern
   - Conditional rendering
   - Props delegation

4. **SignatureBlock** (`src/runtime/components/SignatureBlock/`)
   - HTML content handling
   - :global() CSS patterns
   - Twoslash integration

5. **ExampleBlock** (`src/runtime/components/ExampleBlock/`)
   - Similar to SignatureBlock but without heading
   - Includes both copy and wrap buttons
   - Accepts `code` prop for copy functionality

6. **ExampleBlockWrapper** (`src/runtime/components/ExampleBlockWrapper/`)
   - SSG-MD mode: Renders simple `<pre><code>` for clean markdown
   - Browser mode: Uses ExampleBlock with Shiki HTML
   - Passes both `html` (for display) and `code` (for copying)

### ExampleBlock Pattern

The ExampleBlock demonstrates the pattern for code blocks with multiple
toolbar actions:

```tsx
// ExampleBlock - code display with copy and wrap buttons
export interface ExampleBlockProps {
  /** Pre-rendered HTML from Shiki with Twoslash */
  html: string;
  /** The code for copy functionality */
  code?: string;
}

export function ExampleBlock({ html, code }: ExampleBlockProps): ReactElement {
  const { wrapped, toggleWrap } = useWrapToggle();

  return (
    <div className={styles.block}>
      <SignatureToolbar
        buttons={
          <div className={buttonStyles.buttonGroup}>
            {code && <CopyCodeButton code={code} />}
            <WrapSignatureButton wrapped={wrapped} onToggle={toggleWrap} />
          </div>
        }
      />
      <SignatureCode html={html} wrapped={wrapped} />
    </div>
  );
}
```

**Key Points:**

- `html` prop contains pre-rendered Shiki HTML with Twoslash
- `code` prop contains clean code for copy button (Twoslash directives stripped)
- Copy button only renders if `code` prop is provided
- Uses shared `SignatureToolbar` and `SignatureCode` components

### ExampleBlockWrapper Pattern

The wrapper handles SSG-MD mode rendering:

```tsx
export function ExampleBlockWrapper(
  { code, html }: ExampleBlockWrapperProps
): ReactElement {
  if (import.meta.env.SSG_MD) {
    // SSG-MD mode: Simple HTML that converts to clean markdown
    return (
      <pre>
        <code className="language-typescript">{code.trim()}</code>
      </pre>
    );
  }

  // Browser mode: Use ExampleBlock with Shiki HTML
  return createElement(ExampleBlock, { html, code });
}
```

**SSG-MD Output:**

In SSG-MD mode, the wrapper outputs a simple `<pre><code>` block that
RSPress converts to clean markdown code fence.

**Browser Output:**

In browser mode, renders the full ExampleBlock with:

- Syntax-highlighted code via Shiki HTML
- Twoslash hover tooltips for type information
- Copy button (copies clean code without directives)
- Line wrap toggle button

## Troubleshooting

### Component Not Detecting SSG_MD

**Symptom:** Component always renders HTML, never markdown.

**Cause:** Component is pre-compiled by plugin, not compiled by RSPress.

**Solution:**

1. Check that you're importing from `/runtime-source` export
2. Verify `import.meta.env.SSG_MD` check exists
3. Build website and check `dist/*.md` files

### CSS Module Classes Not Applied

**Symptom:** Styles not working, class names are `undefined`.

**Cause:** CSS module import pattern mismatch.

**Solution:**

```tsx
// ✅ Correct (default export)
import styles from "./index.module.css";

// ❌ Wrong (named exports)
import * as styles from "./index.module.css";
```

### Styles Not Applying to Nested Elements

**Symptom:** Styles for `<pre>`, `<code>`, `<a>` not working.

**Solution:** Use `:global()` selector:

```css
/* ❌ Wrong - tries to scope pre as CSS module */
.wrapper pre {
  padding: 1rem;
}

/* ✅ Correct - applies to all pre elements inside wrapper */
.wrapper :global(pre) {
  padding: 1rem;
}
```

### TypeScript Errors for CSS Module Imports

**Symptom:** `Cannot find module './index.module.css'`

**Solution:** Add type definitions:

```typescript
// types/env.d.ts
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
```

## Related Documentation

- **Page Generation System:**
  `.claude/design/rspress-plugin-api-extractor/page-generation-system.md` -
  Components used in generated pages
- **Cross-Linking Architecture:**
  `.claude/design/rspress-plugin-api-extractor/cross-linking-architecture.md` -
  Type linking in code blocks
- **Main Plugin README:** `plugin/README.md`
- **Package CLAUDE.md:** `plugin/CLAUDE.md` -
  Component development guide

### External Resources

- [RSPress Documentation](https://rspress.dev)
- [CSS Modules Specification](https://github.com/css-modules/css-modules)
- [Vite Import Meta Env](https://vitejs.dev/guide/env-and-mode.html#env-variables)
- [@rspress/plugin-llms](https://rspress.dev/plugin/official-plugins/llms) -
  SSG-MD feature
