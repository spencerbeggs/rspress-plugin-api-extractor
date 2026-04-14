# LLMs Integration

**Status:** Production-ready

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Post-Processing Pipeline](#post-processing-pipeline)
- [Per-Package File Generation](#per-package-file-generation)
- [Structured Global llms.txt](#structured-global-llmstxt)
- [Runtime UI Components](#runtime-ui-components)
- [Configuration](#configuration)
- [RSPress Lifecycle Integration](#rspress-lifecycle-integration)
- [File Locations](#file-locations)

---

## Overview

The LLMs integration system extends RSPress's built-in `@rspress/plugin-llms`
with package-scoped LLM text files and UI components for API documentation
sites. It operates as a post-processing step in `afterBuild`, reading the
global `llms.txt` and `llms-full.txt` files that RSPress generates and
splitting them into per-package scoped files.

### Key Features

- **Post-processing of RSPress-generated LLMs files** -- filters API page
  entries from global files and generates per-package equivalents
- **Per-package file generation** -- `llms.txt`, `llms-full.txt`,
  `llms-docs.txt`, `llms-api.txt` scoped to each documented package
- **Structured global llms.txt** -- reorganizes the flat link list into
  sections grouped by package with version and description metadata
- **Runtime UI components** -- package-scoped copy/open actions injected
  into RSPress's existing LLMs UI via portals and `resolve.alias`
- **Pure function + Effect program architecture** -- processing logic is
  pure and testable; I/O is handled by an Effect program

### Design Principles

- **Non-invasive** -- operates entirely in `afterBuild`, after RSPress
  and `@rspress/plugin-llms` have completed their work
- **Pure/Effect separation** -- all text processing is in pure functions
  (`llms-processing.ts`); all file I/O is in the Effect program
  (`llms-program.ts`)
- **Opt-in scoping** -- the `scopes` flag controls whether per-package
  files are generated; when disabled, only simple filtering is applied
- **RSPress CSS class reuse** -- UI components use RSPress's own
  `rp-llms-*` and `rp-outline__*` CSS classes for visual consistency

---

## Architecture

### Data Flow

```text
RSPress build completes
  → @rspress/plugin-llms generates dist/llms.txt + dist/llms-full.txt
  → Our plugin's afterBuild hook fires

afterBuild (plugin.ts)
  → Checks: rspressLlmsEnabled && resolvedLlmsPlugin.enabled
  → Dynamic import: llms-program.ts
  → Runs processLlmsFiles() as Effect program
       |
       +→ buildApiRoutes(): collect all API page URLs from build results
       +→ discoverPrefixes(): find version/locale path prefixes
       |
       +→ For each prefix (concurrent):
       |    processPrefix()
       |    ├─ Read global llms.txt + llms-full.txt
       |    ├─ Rewrite global llms.txt (structured or filtered)
       |    ├─ Filter global llms-full.txt (remove API sections)
       |    └─ When scopes enabled:
       |         generatePerPackageFiles() for each build result
       |         ├─ llms.txt    (per-package index)
       |         ├─ llms-full.txt (guides + API content)
       |         ├─ llms-docs.txt (guide-only content)
       |         └─ llms-api.txt  (API-only content, when apiTxt enabled)
       |
       +→ Files written via @effect/platform FileSystem

config() hook (plugin.ts)
  → Injects scope metadata into themeConfig.apiExtractorScopes
  → Registers ApiLlmsPackageActions as globalUIComponent
  → Aliases RSPress's LlmsViewOptions → ApiLlmsViewOptions via resolve.alias
```

### Module Responsibilities

| Module | Type | Purpose |
| --- | --- | --- |
| `llms-processing.ts` | Pure functions | Parse, filter, generate LLMs text content |
| `llms-program.ts` | Effect program | File I/O orchestration, prefix discovery |
| `config-utils.ts` | Pure functions | `mergeLlmsPluginConfig` defaults and merge |
| `schemas/config.ts` | Effect Schema | `LlmsPlugin` schema definition |
| `ApiLlmsPackageActions` | React component | Portal-based package actions (outline mode) |
| `ApiLlmsViewOptions` | React component | Aliased replacement for RSPress's LlmsViewOptions |

---

## Post-Processing Pipeline

### Pure Functions (llms-processing.ts)

All text processing is implemented as pure functions with no Effect
dependencies:

**`parseLlmsTxtLine(line)`** -- Parses a single llms.txt link line
matching the pattern `- [title](url): description`. Returns
`LlmsTxtEntry` or null for non-link lines.

**`filterLlmsTxt(content, apiRoutes, pointers)`** -- Removes lines
whose URL is in the `apiRoutes` set. Appends pointer lines for
per-package files when `pointers` is non-empty. Used when `scopes`
is disabled.

**`generateStructuredLlmsTxt(content, apiRoutes, packages)`** --
Reorganizes the flat link list into a structured format with
`## Others` and `## Packages` sections. Each package gets a
`### {name} {version}` heading with description, guide page links,
and an API Reference pointer. Used when `scopes` is enabled.

**`filterLlmsFullTxt(content, apiRoutes)`** -- Removes entire
frontmatter-delimited sections from llms-full.txt whose URL matches
an API route. Sections are delimited by `---\nurl: {path}\n---`
blocks.

**`generatePackageLlmsTxt(input)`** -- Generates a per-package
llms.txt index with `## Guides` and `## API Reference` sections.

**`generatePackageLlmsFullTxt(pages)`** -- Concatenates page content
with frontmatter delimiters. Used for llms-full.txt, llms-docs.txt,
and llms-api.txt (different page sets produce different files).

### Effect Program (llms-program.ts)

The `processLlmsFiles` function is the single Effect program that
orchestrates all I/O:

```typescript
export function processLlmsFiles(
  input: ProcessLlmsFilesInput,
): Effect.Effect<void, never, FileSystem.FileSystem>
```

**Steps:**

1. `buildApiRoutes()` -- Convert generated file paths (e.g.,
   `class/pipeline.mdx`) to route URLs (e.g.,
   `/api/class/pipeline.md`) by prepending each build result's
   `baseRoute` and replacing `.mdx` with `.md`.

2. `discoverPrefixes()` -- Extract version/locale prefixes from base
   routes. A base route of `/v1/api` yields prefix `v1`; `/api`
   yields `""` (root). Root is always included.

3. `processPrefix()` per prefix (concurrent) -- Reads global files,
   applies rewriting, generates per-package files.

4. `generatePerPackageFiles()` per build result (concurrent) --
   Collects entries and content sections, generates the four file
   types.

**Helper functions in llms-program.ts:**

- `buildPackagePointers()` -- Creates `PackagePointer` entries for
  simple filtering mode
- `collectApiEntries()` -- Extracts API page entries from global
  llms.txt for a specific package
- `collectGuideEntries()` -- Extracts non-API entries under a prefix
- `extractSections()` -- Parses llms-full.txt frontmatter-delimited
  sections matching a URL predicate
- `collectApiPageContent()` -- Extracts full content sections for a
  package's API routes

---

## Per-Package File Generation

When `scopes` is enabled, four files are generated per package at the
package route level (e.g., `dist/kitchensink/`):

### llms.txt

Per-package index listing guide and API pages:

```text
# Kitchen Sink

> API documentation for the kitchensink package

## Guides

- [Getting Started](/kitchensink/guides/getting-started.md)

## API Reference

- [Pipeline](/kitchensink/api/class/pipeline.md): Pipeline class
- [Config](/kitchensink/api/interface/config.md): Config interface
```

### llms-full.txt

Combined guide and API page content with frontmatter delimiters:

```text
---
url: /kitchensink/guides/getting-started.md
---

Guide content here...


---
url: /kitchensink/api/class/pipeline.md
---

API page content here...
```

### llms-docs.txt

Guide-only content (non-API pages). Same frontmatter-delimited format
as llms-full.txt but excluding API pages.

### llms-api.txt

API-only content. Generated when `apiTxt` is enabled (default: true).
Same format but including only API page sections.

### Output Directory Structure

```text
dist/
├── llms.txt              (global, restructured)
├── llms-full.txt         (global, API sections removed)
├── kitchensink/
│   ├── llms.txt          (per-package index)
│   ├── llms-full.txt     (guides + API content)
│   ├── llms-docs.txt     (guide-only content)
│   └── llms-api.txt      (API-only content)
└── other-package/
    ├── llms.txt
    ├── llms-full.txt
    ├── llms-docs.txt
    └── llms-api.txt
```

---

## Structured Global llms.txt

When `scopes` is enabled, the global `llms.txt` is reorganized from
RSPress's flat list into a structured format:

```text
# Site Title

## Others

- [Blog Post](/blog/post.md)
- [About](/about.md)

## Packages

### Kitchen Sink 1.0.0

A comprehensive test module.

- [Getting Started](/kitchensink/guides/getting-started.md)
- [API Reference](/kitchensink/llms-api.txt)

### Other Package 2.1.0

Another documented package.

- [Usage Guide](/other-package/guides/usage.md)
- [API Reference](/other-package/llms-api.txt)
```

Pages are partitioned by matching their URL against each package's
`packageRoute`. Unmatched pages go into `## Others`. Each package
section includes version, description, guide page links, and an
API Reference pointer to the per-package `llms-api.txt`.

When `scopes` is disabled, the global llms.txt is simply filtered
to remove API page entries and append pointer lines to per-package
llms.txt files.

---

## Runtime UI Components

### ApiLlmsPackageActions

**Location:** `src/runtime/components/ApiLlmsPackageActions/index.tsx`

Registered as a `globalUIComponent` in the `config()` hook. Renders
package-scoped LLM actions injected into RSPress's existing UI via
React portals.

**Behavior:**

- Reads `themeConfig.apiExtractorScopes` to find scope metadata
- Matches the current page route against package scopes using
  longest-prefix matching
- In **outline mode** (`llmsUI.placement === "outline"`): injects
  action rows into `.rp-outline__bottom` via `createPortal`
- In **title mode**: defers to `ApiLlmsViewOptions` (the aliased
  component)

**Actions provided:**

- Copy package docs (fetches `llms-docs.txt` and copies to clipboard)
- Copy llms.txt link
- Open in ChatGPT (with package-scoped prompt)
- Open in Claude (with package-scoped prompt)

Uses RSPress CSS classes (`rp-outline__action-row`,
`rp-llms-view-options__menu`, etc.) for visual consistency.

### ApiLlmsViewOptions

**Location:** `src/runtime/components/ApiLlmsViewOptions/index.tsx`

Replaces RSPress's default `LlmsViewOptions` component via
`resolve.alias` in the Rsbuild configuration. This allows extending
the default dropdown with package-level actions without modifying
RSPress internals.

**Behavior:**

- Outside a package scope: reproduces the original RSPress dropdown
  (markdown link, ChatGPT, Claude options)
- Inside a package scope: adds a divider and package-level actions
  below the page-level options

**Alias setup in config() hook:**

```typescript
const originalLlmsViewOptions = path.join(
  rspressCoreDir,
  "dist/theme/components/Llms/LlmsViewOptions.js",
);
updatedConfig.builderConfig.resolve.alias = {
  [originalLlmsViewOptions]: customLlmsViewOptions,
};
```

The alias points the original RSPress component file to the plugin's
source `.tsx` file, which RSPress's bundler compiles during the site
build.

**Page-level options** are derived from the `viewOptions` config
(defaults: `markdownLink`, `chatgpt`, `claude`). Uses RSPress's
`useI18n` hook for localized strings (`copyMarkdownLinkText`,
`openInText`).

**Package-level options** (when in scope):

- Copy {name} docs (fetches `llms-docs.txt`)
- Copy llms.txt link
- Copy llms-full.txt link
- Open {name} in ChatGPT
- Open {name} in Claude

### Scope Metadata Injection

The `config()` hook injects scope metadata into
`themeConfig.apiExtractorScopes` for consumption by the runtime
components:

```typescript
interface ApiScope {
  name: string;           // Display name
  packageName: string;    // npm package name
  packageRoute: string;   // e.g., "/kitchensink"
  baseRoute: string;      // e.g., "/kitchensink/api"
  version: string | null;
  locale: string | null;
  llmsTxt: string;        // e.g., "/kitchensink/llms.txt"
  llmsFullTxt: string;    // e.g., "/kitchensink/llms-full.txt"
  llmsDocsTxt: string;    // e.g., "/kitchensink/llms-docs.txt"
  llmsApiTxt: string | null; // e.g., "/kitchensink/llms-api.txt"
}
```

---

## Configuration

### LlmsPlugin Schema

Defined in `schemas/config.ts` as an Effect Schema:

```typescript
LlmsPlugin = Schema.Struct({
  enabled: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  scopes: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  apiTxt: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  showCopyButton: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  showViewOptions: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  copyButtonText: Schema.optionalWith(Schema.String, {
    default: () => "Copy Markdown",
  }),
  viewOptions: Schema.optionalWith(
    Schema.Array(Schema.Literal("markdownLink", "chatgpt", "claude")),
    { default: () => ["markdownLink", "chatgpt", "claude"] },
  ),
})
```

| Field | Type | Default | Purpose |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Enable/disable LLMs integration |
| `scopes` | `boolean` | `true` | Generate per-package files and UI |
| `apiTxt` | `boolean` | `true` | Generate llms-api.txt (API-only content) |
| `showCopyButton` | `boolean` | `true` | Show copy button in UI |
| `showViewOptions` | `boolean` | `true` | Show view options dropdown |
| `copyButtonText` | `string` | `"Copy Markdown"` | Copy button label |
| `viewOptions` | `string[]` | `["markdownLink","chatgpt","claude"]` | Dropdown menu items |

### Configuration Hierarchy

The `llmsPlugin` field can be set at three levels with increasing
precedence:

1. **Global** (`PluginOptions.llmsPlugin`) -- applies to all APIs.
   Accepts `boolean | LlmsPlugin`.
2. **API-level** (`SingleApiConfig.llmsPlugin` or
   `MultiApiConfig.llmsPlugin`) -- overrides global for a specific API.
3. **Version-level** (`VersionConfig.llmsPlugin`) -- overrides API
   for a specific version.

The `mergeLlmsPluginConfig` function in `config-utils.ts` merges
these levels with spread precedence and applies defaults when enabled.

### Prerequisite

The LLMs integration requires RSPress's `@rspress/plugin-llms` to be
enabled in `rspress.config.ts`:

```typescript
import { pluginLlms } from "@rspress/plugin-llms";

export default defineConfig({
  llms: true,       // or pluginLlms() in plugins array
  plugins: [
    apiExtractor({ llmsPlugin: { scopes: true } }),
  ],
});
```

Both `rspressLlmsEnabled` (from `_config.llms`) and
`resolvedLlmsPlugin.enabled` must be true for post-processing and
UI injection to activate.

---

## RSPress Lifecycle Integration

### config() Hook

Three things happen in the `config()` hook when LLMs integration is
active:

1. **Scope metadata injection** -- `themeConfig.apiExtractorScopes`
   is populated from `buildResults` with URLs to per-package LLMs
   files.

2. **Global UI component registration** -- The
   `ApiLlmsPackageActions` component path is added to
   `globalUIComponents` for portal-based rendering.

3. **resolve.alias setup** -- RSPress's `LlmsViewOptions` component
   is aliased to `ApiLlmsViewOptions` so the title-mode dropdown
   includes package-scoped actions.

### afterBuild() Hook

Post-processing runs once on the first build (skipped on HMR rebuilds):

1. `logBuildSummary` runs first (Effect metrics).
2. If `rspressLlmsEnabled && resolvedLlmsPlugin.enabled`:
   - Dynamic import of `llms-program.ts`
   - `processLlmsFiles()` runs as an Effect program with
     `FileSystem.FileSystem` from the existing ManagedRuntime
3. `isFirstBuild` set to false.
4. Runtime disposed in production builds.

### State Hoisted to Plugin Level

Several pieces of state are initialized at the plugin factory level
and shared between `config()` and `afterBuild()`:

- `buildResults: GenerateApiDocsResult[]` -- populated during
  `config()`, consumed by `processLlmsFiles()` in `afterBuild()`
- `packageRoutes: Map<string, string>` -- maps package names to
  package-level routes (without API folder)
- `resolvedLlmsPlugin` -- merged config from `mergeLlmsPluginConfig`
- `rspressLlmsEnabled` -- captured from `_config.llms`
- `rspressOutDir` -- captured from `_config.outDir`

---

## File Locations

| File | Purpose |
| --- | --- |
| `src/llms-processing.ts` | Pure functions for parsing, filtering, generating LLMs text |
| `src/llms-program.ts` | Effect program for file I/O orchestration |
| `src/config-utils.ts` | `mergeLlmsPluginConfig` merge and defaults |
| `src/schemas/config.ts` | `LlmsPlugin` Effect Schema definition |
| `src/plugin.ts` | Lifecycle hooks (scope injection, alias, afterBuild) |
| `src/build-program.ts` | `GenerateApiDocsResult` with LLMs metadata |
| `src/runtime/components/ApiLlmsPackageActions/index.tsx` | Portal-based package actions component |
| `src/runtime/components/ApiLlmsViewOptions/index.tsx` | Aliased LlmsViewOptions replacement |

---

## Related Documentation

- **Build Architecture:**
  `build-architecture.md` -- Plugin lifecycle and service layer
- **Page Generation System:**
  `page-generation-system.md` -- Build results consumed by LLMs program
- **Component Development:**
  `component-development.md` -- Runtime component patterns
- **SSG-Compatible Components:**
  `ssg-compatible-components.md` -- Dual-mode rendering patterns
- **Performance Observability:**
  `performance-observability.md` -- Effect Metrics and build summary
