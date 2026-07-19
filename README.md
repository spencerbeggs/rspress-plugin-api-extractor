# rspress-plugin-api-extractor

This is the development repository for `rspress-plugin-api-extractor`, an [RSPress](https://rspress.dev/) 2.0 plugin that generates interactive API documentation from [Microsoft API Extractor](https://api-extractor.com/) models. It is a pnpm monorepo. The publishable plugin lives in `package/`; everything else is private test fixtures and example sites that run the plugin against real configurations.

To use the plugin in your own site, install [rspress-plugin-api-extractor](https://www.npmjs.com/package/rspress-plugin-api-extractor) and read the [documentation](./docs/). The rest of this README is for working on the plugin itself.

## Packages

| Package | Purpose |
| --- | --- |
| [`package/`](./package) | The published `rspress-plugin-api-extractor` package. |
| [`modules/`](./modules) | Private TypeScript fixture libraries that produce `.api.json` models for the example sites. |
| [`sites/`](./sites) | Private RSPress example sites, one per configuration the plugin supports. |

The `modules/` workspaces build demo libraries whose API Extractor models feed the sites. The `sites/` workspaces run the plugin with different options — single API, multi-API portal, multiVersion, i18n, multi-entry-point packages and Effect-TS API patterns — so every supported configuration has a working end-to-end build.

The repository also ships a companion Claude Code plugin, `api-docs`, under [`plugin/`](./plugin). It bundles documentation-authoring skills, an agent and slash commands for building and maintaining RSPress API-documentation sites with this plugin. It is not a pnpm workspace; it ships through the [spencerbeggs/bot](https://github.com/spencerbeggs/bot) marketplace, versioned in lockstep with the npm package, and loads locally with `pnpm claude`.

## Install

The plugin is on npm. To use it in your own RSPress site:

```bash
npm install rspress-plugin-api-extractor
# or
pnpm add rspress-plugin-api-extractor
```

To work on the plugin in this repository, install the workspace and build:

```bash
pnpm install
pnpm run build
# Builds the plugin and the fixture modules (not the example sites)
```

## Documentation

User-facing documentation for the plugin lives in [`docs/`](./docs):

- [Getting started](./docs/01-getting-started.md) — Install, minimal config, first build.
- [Configuration](./docs/02-configuration.md) — Full plugin-options reference.
- [Config helpers](./docs/03-config-helpers.md) — `api.fromDir` and `apis.fromDir`.
- [Single package](./docs/04-single-package.md) — The single-API recipe.
- [Multi-package](./docs/05-multi-package.md) — The multi-API portal recipe.
- [Versioned](./docs/06-versioned.md) — Documenting major versions side by side.
- [i18n](./docs/07-i18n.md) — Internationalized documentation.
- [Multi-entry points](./docs/08-multi-entry-points.md) — Deduplication, "Available from" and route collisions.
- [LLMs](./docs/09-llms.md) — Per-package `llms*.txt` files and assistant actions.
- [Runtime components](./docs/10-runtime-components.md) — The runtime components and `with-api` code blocks.
- [Troubleshooting](./docs/11-troubleshooting.md) — Route collisions, forgotten exports, Twoslash errors and stale caches.

## Development

The example sites have dev and preview servers wired up per configuration:

```bash
pnpm dev               # Start the basic example site with hot reload
pnpm dev:versioned     # Start the multiVersion example site
pnpm dev:i18n          # Start the i18n example site
pnpm dev:multi         # Start the multi-API portal example site
pnpm dev:effect        # Start the Effect-TS example site
```

Each has a matching `preview:` script that serves the production build instead.

Common workspace scripts:

```bash
pnpm run build         # Build the plugin and fixture modules
pnpm run test          # Run the test suite
pnpm run lint          # Check code with Biome
pnpm run lint:md       # Check markdown with markdownlint
pnpm run typecheck     # Type-check every workspace
```

## Requirements

- Node.js >=24.11.0
- pnpm (this repository uses pnpm workspaces)

## License

[MIT](LICENSE)
