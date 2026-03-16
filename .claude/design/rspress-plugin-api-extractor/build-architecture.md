---
status: current
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-01-17
last-synced: 2026-01-17
completeness: 90
related:
  - rspress-plugin-api-extractor/component-development.md
  - rspress-plugin-api-extractor/ssg-compatible-components.md
dependencies: []
---

# Build Architecture

## Table of Contents

- [Overview](#overview)
- [Current State](#current-state)
- [Rationale](#rationale)
- [Implementation Details](#implementation-details)
- [Build Configuration](#build-configuration)
- [Development Workflow](#development-workflow)

## Overview

The rspress-plugin-api-extractor uses a **dual-build architecture** that
separates Node.js plugin code from React runtime components. This separation
enables optimal bundling strategies for each environment and prevents
runtime issues with CSS imports.

## Current State

### Architecture Components

The plugin is split into two distinct bundles:

#### 1. Plugin Bundle (Node.js)

**Location:** `src/plugin.ts`, `src/markdown.ts`, `src/transformer.ts`
**Output:** `dist/index.js` (117.5 kB)
**Environment:** Node.js (RSPress build process)

**Purpose:**

- Generates MDX files from API Extractor models
- Configures RSPress markdown processing
- Registers Shiki transformers for code block cross-linking
- Manages external package type loading via `type-registry-effect`

#### 2. Runtime Bundle (React/Browser)

**Location:** `src/runtime/`
**Output:** `dist/runtime/index.js` (18.0 kB) + `dist/runtime/index.css` (21.7 kB)
**Environment:** Browser (RSPress SSG and client-side)

**Purpose:**

- React components for rendering API documentation
- Interactive features (wrap buttons, copy buttons, tooltips)
- Twoslash hover tooltips and error display

### Build Tooling

**Bundler:** Rslib (Rsbuild-based library bundler)
**TypeScript:** tsgo (experimental native TypeScript compiler) via API Extractor
**Module System:** ESM with `"module": "esnext"` and `"moduleResolution": "bundler"`
**CSS Processing:** Sass plugin with automatic import injection

### Bundle Sizes

```text
Plugin (Node.js): 117.5 kB JS + 14 KB types
Runtime (React):  18.0 kB JS + 3.1 KB types + 21.7 kB CSS
Total: ~175 kB (bundled and optimized)
```

## Rationale

### Why Dual Bundles?

**Environment Separation:**
The plugin code runs in Node.js during the RSPress build process, while
runtime components execute in the browser during SSG and client-side
rendering. Separating these concerns allows:

- **Optimized Dependencies:** Node.js-specific code (file system,
  Effect-TS services) stays out of the browser bundle
- **Smaller Client Bundle:** Runtime bundle contains only React components and styles
- **Better Tree Shaking:** Build tools can eliminate unused code more effectively

**CSS Import Issues:**
RSPress's `globalComponents` feature causes issues with CSS imports in
the runtime bundle during SSG. The dual-bundle approach solves this by:

- Importing components directly in generated MDX files instead of global registration
- Ensuring CSS is properly bundled and injected via Rslib plugins
- Following RSPress's recommended pattern (see `@rspress/plugin-llms`)

### Why Standalone tsconfig.json?

The plugin requires a standalone `tsconfig.json` because:

- **Root Config Incompatibility:** The monorepo root uses
  `"module": "node20"` which is incompatible with API Extractor's
  bundling requirements
- **API Extractor Requirements:** Requires `"module": "esnext"` and
  `"moduleResolution": "bundler"` for proper type bundling
- **Build Tool Alignment:** Rslib expects modern ESM configuration for optimal bundling

### Why Rslib?

**Rsbuild-Based Tooling:**
Rslib is the recommended bundler for RSPress plugins, offering:

- **Framework Compatibility:** First-class support for React and Sass
- **Type Bundling:** Integration with API Extractor for `.d.ts` generation
- **Plugin Ecosystem:** Access to Rsbuild plugins for advanced features
- **Performance:** Fast builds with modern bundling techniques

**Alternative Considered:**
We evaluated Rollup but chose Rslib for better alignment with the
RSPress ecosystem and superior React/Sass integration.

## Implementation Details

### Rslib Configuration

```typescript
// rslib.config.ts
import { defineConfig } from "@rslib/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginSass } from "@rsbuild/plugin-sass";

export default defineConfig({
 lib: [
  // Runtime bundle (React components + CSS)
  {
   format: "esm",
   syntax: "es2021",
   dts: {
    bundle: true,
    distPath: "./dist/runtime",
   },
   source: {
    entry: { index: "./src/runtime/index.tsx" },
   },
   output: {
    distPath: { root: "./dist/runtime" },
   },
  },
  // Plugin bundle (Node.js)
  {
   format: "esm",
   syntax: "es2021",
   dts: {
    bundle: true,
    distPath: "./dist",
   },
   source: {
    entry: { index: "./src/plugin.ts" },
   },
   output: {
    distPath: { root: "./dist" },
   },
  },
 ],
 plugins: [
  pluginReact(),
  pluginSass(),
 ],
});
```

### TypeScript Configuration

```json
// tsconfig.json
{
 "extends": "../tsconfig.base.json",
 "compilerOptions": {
  "module": "esnext",
  "moduleResolution": "bundler",
  "jsx": "react-jsx",
  "skipLibCheck": true,
  "lib": ["es2021", "dom"]
 },
 "include": ["src/**/*"],
 "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.test.tsx"]
}
```

### Component Registration Pattern

**IMPORTANT:** Do NOT use RSPress's `globalComponents` feature. Instead,
import components directly in generated MDX files.

```typescript
// src/markdown.ts - MDX file generation
let content = generateFrontmatter(name, summary, singularName, apiName);
content += `import { SourceCode } from "@rspress/core/theme";\n`;
content += `import { MemberSignature, ParametersTable, SignatureBlock } from "rspress-plugin-api-extractor/runtime";\n\n`;
```

**Why This Works:**

- All generated MDX files include component imports at the top
- Components are available without global registration
- CSS is properly bundled with the runtime module
- Avoids SSG issues with global CSS imports

## Build Configuration

### Package.json Scripts

```json
{
 "scripts": {
  "build": "rslib build && pnpm build:api",
  "build:api": "api-extractor run --local --verbose",
  "dev": "rslib build --watch"
 }
}
```

### Build Order

1. **Rslib Build:** Generates both plugin and runtime bundles with type definitions
2. **API Extractor:** Bundles TypeScript types into `.api.json` and `.d.ts` files

### CSS Bundling

The Sass plugin automatically:

- Compiles `.scss` files to CSS
- Injects CSS imports via BannerPlugin
- Bundles CSS into `dist/runtime/index.css`

**Important:** Twoslash styles must be imported in the runtime entry point:

```typescript
// src/runtime/index.tsx
import "./components/shared/_twoslash.scss";
```

**Note:** Biome may try to change `.scss` to `.js` - use `sed` to fix:

```bash
sed -i '' 's/_twoslash\.js/_twoslash.scss/' src/runtime/index.tsx
```

## Development Workflow

### Local Development

1. **Edit component code** in `src/runtime/components/`

2. **Build the plugin:**

   ```bash
   pnpm turbo run build --filter="rspress-plugin-api-extractor"
   ```

3. **Build the website** to test changes:

   ```bash
   pnpm turbo run build --filter="website"
   ```

4. **Preview locally:**

   ```bash
   cd website && NO_OPEN=1 pnpm preview
   ```

### Watch Mode

```bash
cd plugin
pnpm dev  # Rebuilds on file changes
```

### Verifying Build Output

After building, check bundle sizes:

```bash
ls -lh dist/
# Plugin (Node.js): 117.5 kB JS + 14 KB types
# Runtime (React):  18.0 kB JS + 3.1 KB types + 21.7 kB CSS
```

### Common Build Issues

**Issue:** Type definitions not generated
**Solution:** Ensure `api-extractor.json` is properly configured and run `pnpm build:api`

**Issue:** CSS not bundled
**Solution:** Verify SCSS imports in component files and `pluginSass()` in rslib.config.ts

**Issue:** Module resolution errors
**Solution:** Check `tsconfig.json` has `"moduleResolution": "bundler"`

## Related Documentation

- **Component Development:** `@./.claude/design/rspress-plugin-api-extractor/component-development.md`
- **SSG-Compatible Components:** `@./ssg-compatible-components.md`
- **Type Loading & VFS:** `@./type-loading-vfs.md`
