---
status: current
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-03-17
last-synced: 2026-03-17
completeness: 90
related:
  - rspress-plugin-api-extractor/build-architecture.md
  - rspress-plugin-api-extractor/ssg-compatible-components.md
dependencies:
  - rspress-plugin-api-extractor/build-architecture.md
---

# Component Development Guide

## Table of Contents

- [Overview](#overview)
- [Current State](#current-state)
- [Rationale](#rationale)
- [Component Structure](#component-structure)
- [Styling Guidelines](#styling-guidelines)
- [Accessibility](#accessibility)
- [Common Pitfalls](#common-pitfalls)

## Overview

This document provides comprehensive guidance for developing React components
in the rspress-plugin-api-extractor runtime bundle. Components must follow
specific patterns to ensure compatibility with RSPress SSG and proper CSS
bundling.

## Current State

### Component Organization

Components are organized in the `src/runtime/components/` directory:

```text
src/runtime/components/
├── SignatureBlock/
│   ├── index.tsx           # Component implementation
│   └── index.module.css    # Component styles (CSS modules)
├── SignatureBlockWrapper/
│   └── index.tsx           # SSG-MD compatible wrapper
├── SignatureToolbar/
│   ├── index.tsx           # Toolbar with buttons
│   └── index.module.css
├── SignatureCode/
│   ├── index.tsx           # Code display with wrap support
│   └── index.module.css
├── MemberSignature/
│   ├── index.tsx
│   └── index.module.css
├── MemberSignatureWrapper/
│   └── index.tsx           # SSG-MD compatible wrapper
├── ExampleBlock/
│   └── index.tsx           # Example code block (no heading)
├── ExampleBlockWrapper/
│   └── index.tsx           # SSG-MD compatible wrapper
├── ParametersTable/
│   ├── index.tsx
│   └── index.module.css
├── buttons/
│   ├── WrapSignatureButton.tsx   # Line wrap toggle button
│   ├── CopyCodeButton.tsx        # Copy-to-clipboard button
│   └── index.module.css          # Shared button styles
├── icons/
│   ├── WrapIcon/
│   │   └── index.tsx             # Wrap lines icon (text-wrap)
│   ├── UnwrapIcon/
│   │   └── index.tsx             # Unwrap lines icon (straight lines)
│   ├── CopyIcon/
│   │   └── index.tsx             # Copy icon (overlapping rectangles)
│   └── CheckIcon/
│       └── index.tsx             # Checkmark icon (success state)
└── shared/
    ├── variables.css             # CSS custom properties
    └── _twoslash.css             # Twoslash hover/error styles
```

### Component Registration

**Pattern:** Direct imports in generated MDX files

```typescript
// Generated MDX file
import { SourceCode } from "@rspress/core/theme";
import { MemberSignature, ParametersTable, SignatureBlock } from "rspress-plugin-api-extractor/runtime";
```

**Why NOT globalComponents:**

- Avoids SSG issues with CSS imports in the runtime bundle
- Follows RSPress's recommended pattern (see `@rspress/plugin-llms`)
- Ensures CSS is properly bundled with the runtime module

### Component Exports

All components must be exported from `src/runtime/index.tsx`:

```typescript
// src/runtime/index.tsx
import "./components/shared/_twoslash.scss";

export type { SignatureBlockProps } from "./components/SignatureBlock/index.js";
export { SignatureBlock } from "./components/SignatureBlock/index.js";

export type { MemberSignatureProps } from "./components/MemberSignature/index.js";
export { MemberSignature } from "./components/MemberSignature/index.js";

export type { ParametersTableProps } from "./components/ParametersTable/index.js";
export { ParametersTable } from "./components/ParametersTable/index.js";
```

**Important:** Always use `.js` file extensions in imports (Biome rule `useImportExtensions`).

## Rationale

### Why Component-Per-Directory?

**Organization Benefits:**

- **Colocation:** Component logic and styles live together
- **Discoverability:** Easy to find related files
- **Scalability:** Clear structure as components grow

**Build Benefits:**

- **Proper CSS Bundling:** Rslib correctly processes SCSS imports when colocated
- **Tree Shaking:** Unused components and their styles are eliminated
- **Code Splitting:** Future optimization potential for larger component sets

### Why Direct Imports Over Global Registration?

**SSG Compatibility:**
RSPress's `globalComponents` feature causes issues with CSS imports
during static site generation. Direct imports solve this by:

- Ensuring CSS is bundled with the runtime module
- Loading styles at the correct time in the build process
- Avoiding race conditions with style injection

**Best Practice Alignment:**
The `@rspress/plugin-llms` plugin uses this pattern, demonstrating it as
the recommended approach for RSPress plugins with custom components.

### Why TypeScript Interfaces for Props?

**Type Safety:**

- Catches prop errors at compile time
- Provides IntelliSense in IDEs
- Documents component API

**Documentation:**

- JSDoc comments on interfaces generate API documentation
- Type exports allow consumers to type-check prop usage

## Component Structure

### Basic Component Template

```typescript
// src/runtime/components/ExampleComponent/index.tsx
import type { ReactElement } from "react";
import { useState } from "react";
import "./index.scss";

export interface ExampleComponentProps {
 /** Brief description of the prop */
 propName: string;
 /** Optional prop description */
 optionalProp?: boolean;
}

export function ExampleComponent(
 { propName, optionalProp = false }: ExampleComponentProps
): ReactElement {
 const [state, setState] = useState<boolean>(false);

 return (
  <div className="api-example-component">
   {/* Component implementation */}
  </div>
 );
}

export default ExampleComponent;
```

### Component With Shared Utilities

```typescript
// src/runtime/components/ComplexComponent/index.tsx
import type { ReactElement } from "react";
import { useState } from "react";
import { WrapSignatureButton } from "../buttons/WrapSignatureButton.js";
import "./index.scss";

export interface ComplexComponentProps {
 html: string;
 heading?: string;
}

export function ComplexComponent(
 { html, heading }: ComplexComponentProps
): ReactElement {
 const [wrapped, setWrapped] = useState(false);

 const handleToggleWrap = () => {
  setWrapped(!wrapped);
 };

 return (
  <div className="api-complex-component">
   <div className="api-toolbar">
    <WrapSignatureButton wrapped={wrapped} onToggle={handleToggleWrap} />
   </div>
   <div className={wrapped ? "api-content wrapped" : "api-content"}>
    {/* Content */}
   </div>
  </div>
 );
}

export default ComplexComponent;
```

### Shared Button Components

The `buttons/` directory contains reusable button components:

**WrapSignatureButton** - Toggles line wrapping in code blocks:

```typescript
// src/runtime/components/buttons/WrapSignatureButton.tsx
import type { ReactElement } from "react";
import { WrapIcon } from "../icons/WrapIcon/index.js";
import { UnwrapIcon } from "../icons/UnwrapIcon/index.js";

export interface WrapSignatureButtonProps {
 wrapped: boolean;
 onToggle: () => void;
}

export function WrapSignatureButton(
 { wrapped, onToggle }: WrapSignatureButtonProps
): ReactElement {
 return (
  <button
   type="button"
   onClick={onToggle}
   aria-label={wrapped ? "Disable line wrapping" : "Enable line wrapping"}
   title={wrapped ? "Disable wrapping" : "Enable wrapping"}
  >
   {wrapped ? <UnwrapIcon size={16} /> : <WrapIcon size={16} />}
  </button>
 );
}
```

**CopyCodeButton** - Copies code to clipboard with success feedback:

```typescript
// src/runtime/components/buttons/CopyCodeButton.tsx
import type { ReactElement } from "react";
import { useCallback, useState } from "react";
import { CheckIcon } from "../icons/CheckIcon/index.js";
import { CopyIcon } from "../icons/CopyIcon/index.js";

export interface CopyCodeButtonProps {
 /** The code to copy to clipboard */
 code: string;
}

export function CopyCodeButton({ code }: CopyCodeButtonProps): ReactElement {
 const [copied, setCopied] = useState(false);

 const handleCopy = useCallback(async () => {
  await navigator.clipboard.writeText(code);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
 }, [code]);

 return (
  <button
   type="button"
   onClick={handleCopy}
   aria-label={copied ? "Copied!" : "Copy code"}
   title={copied ? "Copied!" : "Copy code"}
  >
   {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
  </button>
 );
}
```

### Icon Components

The `icons/` directory contains reusable SVG icon components:

```typescript
// src/runtime/components/icons/CopyIcon/index.tsx
import type { ReactElement, SVGProps } from "react";

export interface CopyIconProps extends SVGProps<SVGSVGElement> {
 /** Icon size in pixels */
 size?: number;
}

export function CopyIcon({ size = 16, ...props }: CopyIconProps): ReactElement {
 return (
  <svg
   xmlns="http://www.w3.org/2000/svg"
   width={size}
   height={size}
   viewBox="0 0 24 24"
   {...props}
  >
   <title>Copy</title>
   <path fill="currentColor" d="M19 21H8V7h11..." />
  </svg>
 );
}
```

**Available Icons:**

- `CopyIcon` - Copy/duplicate action (overlapping rectangles)
- `CheckIcon` - Success/copied state (checkmark)
- `WrapIcon` - Enable line wrap (curved text lines)
- `UnwrapIcon` - Disable line wrap (straight lines)

**Icon Component Pattern:**

- Extend `SVGProps<SVGSVGElement>` for flexibility
- Accept `size` prop with sensible default (16px)
- Include `<title>` element for accessibility
- Use `currentColor` for automatic color inheritance

**Benefits:**

- Eliminates duplicate SVG code
- Consistent icon sizing and styling
- Accessible with title elements
- Reduces bundle size through reuse
- Easy to add new icons following the pattern

## Styling Guidelines

### SCSS Structure

```scss
// src/runtime/components/ExampleComponent/index.scss
@use '../shared/variables' as *;

.api-example-component {
 background-color: var(--rp-c-bg);
 border: 1px solid var(--rp-c-divider);
 border-radius: 8px;
 overflow: hidden;
}

.api-example-toolbar {
 display: flex;
 justify-content: space-between;
 align-items: center;
 padding: 12px 16px;
 background-color: var(--rp-c-bg-soft);
 border-bottom: 1px solid var(--rp-c-divider);
}
```

### Available RSPress CSS Variables

**Background Colors:**

- `--rp-c-bg` - Background color
- `--rp-c-bg-soft` - Soft background color
- `--rp-c-bg-mute` - Muted background color
- `--rp-c-bg-alt` - Alternative background color

**Text Colors:**

- `--rp-c-text-1` - Primary text color
- `--rp-c-text-2` - Secondary text color
- `--rp-c-text-3` - Tertiary text color
- `--rp-c-text-code` - Code text color

**Brand/Accent Colors:**

- `--rp-c-brand` - Brand color
- `--rp-c-brand-light` - Light brand color
- `--rp-c-brand-dark` - Dark brand color

**Borders:**

- `--rp-c-divider` - Border/divider color
- `--rp-c-divider-light` - Light divider color

### Shared Styles

**Using Shared Variables:**

```scss
// Import shared variables
@use '../shared/variables' as *;

// Use variables
.my-component {
 padding: $spacing-md;
 border-radius: $border-radius-default;
}
```

**Importing Component Styles:**

```scss
// Import styles from another component
@import '../SignatureBlock/index.scss';
```

### Twoslash Styles

Twoslash styles (hover tooltips, errors, completions) must be imported
in the runtime entry point:

```typescript
// src/runtime/index.tsx
import "./components/shared/_twoslash.scss";
```

**Note:** Biome may try to change `.scss` to `.js` - use `sed` to fix:

```bash
sed -i '' 's/_twoslash\.js/_twoslash.scss/' src/runtime/index.tsx
```

## Accessibility

### Best Practices

**Semantic HTML:**
Use appropriate HTML elements for their intended purpose:

```typescript
// Good
<button type="button" onClick={handleClick}>
 Click me
</button>

// Bad
<div onClick={handleClick}>
 Click me
</div>
```

**ARIA Labels:**
Provide labels for icon buttons and interactive elements:

```typescript
<button
 type="button"
 aria-label={wrapped ? "Disable line wrapping" : "Enable line wrapping"}
 title={wrapped ? "Disable wrapping" : "Enable wrapping"}
>
 <svg>...</svg>
</button>
```

**Keyboard Navigation:**
Ensure components work with keyboard-only navigation:

```typescript
<div
 role="button"
 tabIndex={0}
 onKeyDown={(e) => {
  if (e.key === 'Enter' || e.key === ' ') {
   handleClick();
  }
 }}
 onClick={handleClick}
>
 Interactive element
</div>
```

**Focus Management:**
Ensure focus states are visible and intuitive:

```scss
.api-button {
 &:focus-visible {
  outline: 2px solid var(--rp-c-brand);
  outline-offset: 2px;
 }
}
```

### Testing Accessibility

**Manual Testing:**

- Navigate with Tab/Shift+Tab
- Activate with Enter/Space
- Test with screen reader (VoiceOver on macOS)

**Automated Testing:**
Consider adding axe-core or similar tools for accessibility testing.

## Common Pitfalls

### 1. Using globalComponents

**Don't:**

```typescript
// rspress.config.ts
globalComponents: [
 path.join(__dirname, 'src/runtime/components/SignatureBlock/index.tsx'),
]
```

**Do:**

```typescript
// Generated MDX file
import { SignatureBlock } from "rspress-plugin-api-extractor/runtime";
```

**Why:** Global registration causes SSG issues with CSS imports.

### 2. Missing CSS Imports

**Don't:**

```typescript
// Component without SCSS import
export function MyComponent() {
 return <div className="my-component">Content</div>;
}
```

**Do:**

```typescript
import "./index.scss";

export function MyComponent() {
 return <div className="my-component">Content</div>;
}
```

**Why:** CSS won't be bundled without explicit imports.

### 3. Duplicate Code

**Don't:**

```typescript
// Copy-paste SVG icons in multiple components
export function ComponentA() {
 return (
  <button>
   <svg>...</svg>  {/* Duplicate icon */}
  </button>
 );
}

export function ComponentB() {
 return (
  <button>
   <svg>...</svg>  {/* Same icon duplicated */}
  </button>
 );
}
```

**Do:**

```typescript
// Extract to shared component
import { IconButton } from "../buttons/IconButton.js";

export function ComponentA() {
 return <IconButton icon="wrap" />;
}

export function ComponentB() {
 return <IconButton icon="wrap" />;
}
```

**Why:** Reduces bundle size and ensures consistency.

### 4. Missing File Extensions

**Don't:**

```typescript
import { MyComponent } from "./components/MyComponent/index";
```

**Do:**

```typescript
import { MyComponent } from "./components/MyComponent/index.js";
```

**Why:** Biome enforces `useImportExtensions` rule for ESM compatibility.

### 5. Missing Props Documentation

**Don't:**

```typescript
export interface MyComponentProps {
 data: string;
 onClose: () => void;
}
```

**Do:**

```typescript
export interface MyComponentProps {
 /** The data to display in the component */
 data: string;
 /** Callback fired when the component is closed */
 onClose: () => void;
}
```

**Why:** JSDoc comments provide documentation and better IDE support.

## Related Documentation

- **Build Architecture:** `@./build-architecture.md`
- **SSG-Compatible Components:** `@./ssg-compatible-components.md`
- **Twoslash Integration:** Reference performance-observability.md for error tracking
- **LLMs Integration:** `@./llms-integration.md`
