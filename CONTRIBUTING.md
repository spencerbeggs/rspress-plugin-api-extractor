# Contributing to rspress-plugin-api-extractor

Thanks for your interest in contributing. This document covers local setup, the development commands and the contribution process. The publishable plugin lives in `plugin/`; the rest of the repo is private test fixtures (`modules/`) and example sites (`sites/`) that run the plugin against real configurations.

## Prerequisites

- Node.js >=24.11.0
- pnpm (this repository uses pnpm workspaces)

## Development setup

```bash
# Clone the repository
git clone https://github.com/spencerbeggs/rspress-plugin-api-extractor.git
cd rspress-plugin-api-extractor

# Install dependencies
pnpm install

# Build the plugin and fixture modules (not the example sites)
pnpm run build

# Run the tests
pnpm run test
```

## Project structure

```text
rspress-plugin-api-extractor/
├── plugin/        # The published rspress-plugin-api-extractor package
├── modules/       # Private TypeScript fixture libraries that produce .api.json models
├── sites/         # Private RSPress example sites, one per supported configuration
├── docs/          # User-facing documentation for the plugin
└── lib/           # Shared configuration files
```

## Running the example sites

The example sites have dev and preview servers wired up per configuration:

```bash
pnpm dev               # Start the basic example site with hot reload
pnpm dev:versioned     # Start the multiVersion example site
pnpm dev:i18n          # Start the i18n example site
pnpm dev:multi         # Start the multi-API portal example site
```

The preview servers serve a production build:

```bash
pnpm preview           # Preview the basic example site
pnpm preview:multi     # Preview the multi-API portal example site
```

## Available scripts

| Script | Description |
| ------ | ----------- |
| `pnpm run build` | Build the plugin and fixture modules via Turbo |
| `pnpm run test` | Run the test suite |
| `pnpm run test:watch` | Run tests in watch mode |
| `pnpm run test:coverage` | Run tests with v8 coverage |
| `pnpm run lint` | Check code with Biome |
| `pnpm run lint:fix` | Auto-fix lint issues |
| `pnpm run lint:md` | Check markdown with markdownlint |
| `pnpm run typecheck` | Type-check every workspace |

Per-workspace commands run with `pnpm --filter <workspace> run <script>`, for example `pnpm --filter rspress-plugin-api-extractor run build:dev`.

## Code quality

This project uses:

- **Biome** for linting and formatting
- **Commitlint** for enforcing conventional commits with DCO signoff
- **Husky** for Git hooks (pre-commit lint-staged, commit-msg validation, pre-push tests)

### Commit format

All commits must follow the [Conventional Commits](https://conventionalcommits.org) specification and include a DCO signoff:

```text
feat(plugin): add support for namespace members

Signed-off-by: Your Name <your.email@example.com>
```

The signoff certifies that you wrote the patch or otherwise have the right to submit it under the project license — see the [DCO](./DCO) file. Add it automatically with `git commit -s`.

## TypeScript conventions

- Use `.js` extensions for relative imports (ESM requirement).
- Use the `node:` protocol for Node.js built-ins, e.g. `import fs from "node:fs"`.
- Separate type imports: `import type { Foo } from "./bar.js"`.

## Submitting changes

1. Fork the repository.
2. Create a feature branch: `git checkout -b feat/my-feature`.
3. Make your changes.
4. Run the tests: `pnpm run test`.
5. Run linting: `pnpm run lint:fix`.
6. Commit with conventional format and a DCO signoff.
7. Push and open a pull request.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
