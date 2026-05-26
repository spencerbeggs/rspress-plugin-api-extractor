# rspress-plugin-api-extractor documentation

`rspress-plugin-api-extractor` generates interactive API documentation from Microsoft API Extractor models. Point it at your `.api.json` files and you get a full RSPress documentation site: syntax-highlighted signatures, Twoslash hover tooltips, type references that cross-link between pages and copy-paste code examples.

## Install

```bash
npm install rspress-plugin-api-extractor
# or
pnpm add rspress-plugin-api-extractor
```

## Guides

- [Getting started](./01-getting-started.md) — Install the plugin, point it at one API Extractor model and run your first build.
- [Configuration](./02-configuration.md) — Every option the plugin accepts, organized by where it lives.
- [Config helpers](./03-config-helpers.md) — Discover model, package.json and tsconfig fields from a package folder instead of writing them out by hand.
- [Single package](./04-single-package.md) — The single-package recipe documents one library.
- [Multi-package](./05-multi-package.md) — A multi-API portal documents several packages from one RSPress site.
- [Versioned](./06-versioned.md) — Document each major version side by side with RSPress multiVersion.
- [i18n](./07-i18n.md) — Document a package across locales with RSPress internationalization.
- [Multi-entry points](./08-multi-entry-points.md) — Re-export deduplication, the "Available from" line and fail-fast route collisions.
- [LLMs](./09-llms.md) — Per-package llms*.txt files and in-page assistant actions.
- [Runtime components](./10-runtime-components.md) — The importable runtime components and live with-api code blocks.
- [Troubleshooting](./11-troubleshooting.md) — The build problems you are most likely to hit, and what each one means.
