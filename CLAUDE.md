# CLAUDE.md

This file provides guidance to Claude Code when working with code in this
repository.

## Project Status

RSPress plugin for generating API documentation from TypeScript API Extractor
models. This is a **monorepo with three workspaces**.

Design documentation lives in `.claude/design/rspress-plugin-api-extractor/`.

## Workspaces

| Workspace | Package Name | Private | Purpose |
| --------- | ------------ | ------- | ------- |
| `plugin/` | `rspress-plugin-api-extractor` | Publishable | The main RSPress plugin |
| `example-module/` | `example-module` | Yes | Test fixture — demo TypeScript module with API Extractor model generation |
| `docs-site/` | `docs-site` | Yes | Minimal RSPress 2.0 test harness that loads the plugin with the example-module's API model |

### plugin/

The publishable package. Uses a **custom rslib config with `@rslib/core`
directly** (NOT `@savvy-web/rslib-builder`). Exports two entry points:

- `.` — Main plugin (`dist/index.js`)
- `./runtime` — React components for SSG-compatible rendering (`dist/runtime/index.js`)

### example-module/

Private test fixture using `@savvy-web/rslib-builder` to build a demo
TypeScript module. Produces dual outputs:

- `dist/dev/` — Development build with source maps
- `dist/npm/` — Production build with API Extractor model

### docs-site/

Private minimal RSPress 2.0 site. Depends on `rspress-plugin-api-extractor`
via `workspace:*`. Outputs static HTML to `dist/`.

## Build Pipeline

### How `private: true` Works

The source `package.json` in `plugin/` is marked `"private": true` — **this is
intentional and correct**. The `publishConfig` field controls how the package is
published. Never manually set `"private": false` in the source `package.json`.

The `example-module/` workspace uses rslib-builder which transforms
`package.json` during build — sets `"private": false` based on
`publishConfig.access`, rewrites `exports`, and strips dev-only fields.

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
- Cache excludes: `*.md`, `.changeset/**`, `.claude/**`, `.github/**`,
  `.husky/**`, `.vscode/**`
- Environment pass-through: `GITHUB_ACTIONS`, `CI`

## Savvy-Web Tool References

This project depends on several `@savvy-web/*` packages. These are in active
development — if behavior seems unexpected, explore both the GitHub docs and the
installed source.

| Package | Purpose | GitHub | Local Source |
| ------- | ------- | ------ | ------------ |
| rslib-builder | Build pipeline for example-module (dual output, package.json transform) | [savvy-web/rslib-builder](https://github.com/savvy-web/rslib-builder) | `node_modules/@savvy-web/rslib-builder/` |
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
pnpm run build             # Build all workspaces via Turbo
```

### Per-Workspace Examples

```bash
pnpm --filter plugin run build          # Build the plugin only
pnpm --filter example-module run build  # Build the example module only
pnpm --filter docs-site run dev         # Start docs site dev server
pnpm --filter docs-site run preview     # Preview docs site production build
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
