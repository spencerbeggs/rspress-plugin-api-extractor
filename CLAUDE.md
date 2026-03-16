# CLAUDE.md

This file provides guidance to Claude Code when working with code in this
repository.

## Project Status

RSPress plugin for generating API documentation from TypeScript API Extractor
models. This is a **monorepo with multiple workspaces** organized into modules,
a plugin, and documentation sites.

## Getting Started

```bash
pnpm install
pnpm run build            # Build plugin + modules (not sites)
pnpm dev                  # Start basic site dev server
```

## Workspaces

| Workspace | Package Name | Private | Purpose |
| --------- | ------------ | ------- | ------- |
| `plugin/` | `rspress-plugin-api-extractor` | Publishable | The main RSPress plugin |
| `modules/kitchensink/` | `kitchensink` | Yes | Full API Extractor feature coverage |
| `modules/versioned-v1/` | `versioned-v1` | Yes | Version testing — v1 baseline |
| `modules/versioned-v2/` | `versioned-v2` | Yes | Version testing — v2 breaking changes |
| `sites/basic/` | `basic` | Yes | Single API, no versioning, no i18n |
| `sites/versioned/` | `versioned` | Yes | Single API + multiVersion |
| `sites/i18n/` | `i18n` | Yes | Single API + i18n |
| `sites/multi/` | `multi` | Yes | Multi-API portal |

### plugin/

The publishable package. Uses a **custom rslib config with `@rslib/core`
directly** (NOT `@savvy-web/rslib-builder`). Exports two entry points:

- `.` — Main plugin (`dist/index.js`)
- `./runtime` — React components for SSG-compatible rendering (`dist/runtime/index.js`)

### modules/

Test fixture modules using `@savvy-web/rslib-builder` to build demo TypeScript
libraries. Each produces dual outputs:

- `dist/dev/` — Development build with source maps
- `dist/npm/` — Production build with API Extractor model (`.api.json`)

**kitchensink** — Comprehensive module exercising all API Extractor item kinds
(classes, interfaces, enums, functions, type aliases, variables, namespaces).

**versioned-v1 / versioned-v2** — Paired modules for testing multiVersion
documentation. v1 provides a baseline API; v2 introduces breaking changes.

### sites/

RSPress 2.0 documentation sites that consume the plugin with different
configurations. Each site depends on `rspress-plugin-api-extractor` via
`workspace:*` and one or more modules.

**basic** — Minimal single-API site with no versioning or i18n.

**versioned** — Tests multiVersion support using versioned-v1 and versioned-v2.

**i18n** — Tests internationalization support.

**multi** — Multi-API portal combining multiple module API models.

## Design Documentation

Design docs live in `.claude/design/rspress-plugin-api-extractor/`. Load the
relevant doc when working on these areas:

**Build & infrastructure:**

- @./.claude/design/rspress-plugin-api-extractor/build-architecture.md
- @./.claude/design/rspress-plugin-api-extractor/snapshot-tracking-system.md

**Page generation & markdown:**

- @./.claude/design/rspress-plugin-api-extractor/page-generation-system.md
- @./.claude/design/rspress-plugin-api-extractor/cross-linking-architecture.md
- @./.claude/design/rspress-plugin-api-extractor/import-generation-system.md
- @./.claude/design/rspress-plugin-api-extractor/source-mapping-system.md

**Runtime components & SSG:**

- @./.claude/design/rspress-plugin-api-extractor/component-development.md
- @./.claude/design/rspress-plugin-api-extractor/ssg-compatible-components.md

**Type loading & VFS:**

- @./.claude/design/rspress-plugin-api-extractor/type-loading-vfs.md
- @./.claude/design/rspress-plugin-api-extractor/multi-entry-point-support.md

**Observability:**

- @./.claude/design/rspress-plugin-api-extractor/performance-observability.md
- @./.claude/design/rspress-plugin-api-extractor/error-observability.md

## Build Pipeline

### How `private: true` Works

The source `package.json` in `plugin/` is marked `"private": true` — **this is
intentional and correct**. The `publishConfig` field controls how the package is
published. Never manually set `"private": false` in the source `package.json`.

The module workspaces use rslib-builder which transforms `package.json` during
build — sets `"private": false` based on `publishConfig.access`, rewrites
`exports`, and strips dev-only fields.

### Publish Targets

The `plugin/` package publishes to:

- **GitHub Packages** — `https://npm.pkg.github.com/`
- **npm registry** — `https://registry.npmjs.org/`

Both targets publish with provenance attestation enabled.

### Turbo Orchestration

[Turbo](https://turbo.build/) manages build task dependencies and caching:

- `build` tasks depend on `^build` (upstream workspaces build first)
- `build:dev` and `build:prod` both depend on `types:check`
- `types:check` runs first (no dependencies)
- Default `build` script filters to `plugin` and `./modules/*` (excludes sites)
- Cache excludes: `*.md`, `.changeset/**`, `.claude/**`, `.github/**`,
  `.husky/**`, `.vscode/**`
- Environment pass-through: `GITHUB_ACTIONS`, `CI`

## Savvy-Web Tool References

This project depends on several `@savvy-web/*` packages. These are in active
development — if behavior seems unexpected, explore both the GitHub docs and the
installed source.

| Package | Purpose | GitHub | Local Source |
| ------- | ------- | ------ | ------------ |
| rslib-builder | Build pipeline for modules (dual output, package.json transform) | [savvy-web/rslib-builder](https://github.com/savvy-web/rslib-builder) | `node_modules/@savvy-web/rslib-builder/` |
| commitlint | Conventional commit + DCO enforcement | [savvy-web/commitlint](https://github.com/savvy-web/commitlint) | `node_modules/@savvy-web/commitlint/` |
| changesets | Versioning, changelogs, release management | [savvy-web/changesets](https://github.com/savvy-web/changesets) | `node_modules/@savvy-web/changesets/` |
| lint-staged | Pre-commit file linting via Biome | [savvy-web/lint-staged](https://github.com/savvy-web/lint-staged) | `node_modules/@savvy-web/lint-staged/` |
| vitest | Vitest config factory with project support | [savvy-web/vitest](https://github.com/savvy-web/vitest) | `node_modules/@savvy-web/vitest/` |

TypeScript configuration extends from rslib-builder:
`@savvy-web/rslib-builder/tsconfig/ecma/lib.json`

## Commands

Root scripts run across all workspaces. Per-workspace commands can be run with
`pnpm --filter <workspace> run <script>`.

### Development

```bash
pnpm run lint              # Check code with Biome
pnpm run lint:fix          # Auto-fix lint issues
pnpm run lint:fix:unsafe   # Auto-fix including unsafe transforms
pnpm run lint:md           # Check markdown with markdownlint
pnpm run lint:md:fix       # Auto-fix markdown issues
pnpm run typecheck         # Type-check all workspaces via Turbo (runs tsgo)
pnpm run test              # Run all tests
pnpm run test:watch        # Run tests in watch mode
pnpm run test:coverage     # Run tests with v8 coverage report
```

### Building

```bash
pnpm run build             # Build plugin + modules via Turbo (excludes sites)
```

### Dev & Preview Servers

```bash
pnpm dev                   # Start basic site dev server (default)
pnpm dev:basic             # Start basic site dev server
pnpm dev:versioned         # Start versioned site dev server
pnpm dev:i18n              # Start i18n site dev server
pnpm dev:multi             # Start multi-API portal dev server
pnpm preview               # Preview basic site (default)
pnpm preview:basic         # Preview basic site
pnpm preview:versioned     # Preview versioned site
pnpm preview:i18n          # Preview i18n site
pnpm preview:multi         # Preview multi-API portal
```

### Per-Workspace Examples

```bash
pnpm --filter plugin run build             # Build the plugin only
pnpm --filter kitchensink run build        # Build the kitchensink module only
pnpm --filter basic run dev                # Start basic site dev server
pnpm --filter basic run preview            # Preview basic site production build
```

### Running a Specific Test

```bash
pnpm vitest run plugin/src/index.test.ts
```

## Code Quality and Hooks

### Biome

Unified linter and formatter replacing ESLint + Prettier. Configuration in
`biome.jsonc` extends `@savvy-web/lint-staged/biome/silk.jsonc`.

### Commitlint

Enforces conventional commit format with DCO signoff. Configuration in
`lib/configs/commitlint.config.ts` uses the `CommitlintConfig.silk()` preset.

### Husky Git Hooks

| Hook | Action |
| ---- | ------ |
| `pre-commit` | Runs lint-staged (Biome on staged files) |
| `commit-msg` | Validates commit message format via commitlint |
| `pre-push` | Runs tests for affected packages using Turbo |
| `post-checkout` | Package manager setup |
| `post-merge` | Package manager setup |

### Lint-Staged

Configuration in `lib/configs/lint-staged.config.ts` uses the `Preset.silk()`
preset from `@savvy-web/lint-staged`.

## Conventions

### Imports

- Use `.js` extensions for relative imports (ESM requirement)
- Use `node:` protocol for Node.js built-ins (e.g., `import fs from 'node:fs'`)
- Separate type imports: `import type { Foo } from './bar.js'`

### Commits

All commits require:

1. Conventional commit format (`feat`, `fix`, `chore`, etc.)
2. DCO signoff: `Signed-off-by: Name <email>`

### Publishing

Packages publish to both GitHub Packages and npm with provenance via the
[@savvy-web/changesets](https://github.com/savvy-web/changesets) release
workflow. The GitHub Action is at
[savvy-web/workflow-release-action](https://github.com/savvy-web/workflow-release-action).

## Testing

- **Framework**: [Vitest](https://vitest.dev/) with v8 coverage provider
- **Pool**: Uses `forks` (not threads) for broader compatibility
- **Config**: `vitest.config.ts` uses the `VitestConfig.create()` factory from
  `@savvy-web/vitest`, which supports project-based filtering via `--project`
- **CI**: `pnpm run ci:test` sets `CI=true` and enables coverage
