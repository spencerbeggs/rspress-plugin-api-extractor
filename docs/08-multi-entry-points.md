# Multi-entry points

Modern packages often expose more than one entry point — a main entry and subpaths like `./testing` or `./node`:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./testing": "./dist/testing.js"
  }
}
```

The plugin documents these end to end. It counts the entry points, deduplicates anything re-exported across them and records which entries each item is reachable from. Single-entry packages are unaffected, and none of this needs extra configuration.

## Deduplication

A type is often re-exported from several entry points. Rather than emit a duplicate page per entry, the plugin produces one page per item and notes everywhere it is available. Two items count as the same item when they share both a name and a kind. If a name shows up with different kinds — a value and a type that deliberately share a name, say — they stay distinct and each gets its own page.

## The "Available from" line

When an item is exported from more than one entry point, its page shows an "Available from" line listing the import paths:

```text
Available from: `my-library`, `my-library/testing`
```

The main entry maps to the bare package name; named entries become subpath imports. An item that lives in only one entry point shows no such line, because there is one way to import it and the import lines in its examples already say so.

## Route collisions fail the build

Every item is written to a route of the form `category-folder/name`, lowercased. When two genuinely distinct items resolve to the same route — two different items both named `Config` in the same category, say — that is almost always a naming or category-configuration mistake on your side. So the plugin fails the build rather than overwrite one page with the other.

The error names both colliding items, their kinds and the shared route, and tells you how to resolve it. There is no automatic renaming and no silent disambiguation: the outcome is distinct routes or a failed build. Nothing wrong ships.

```text
Route collision: "Config" (Interface) and "Config" (Class) both resolve to
/api/interface/config. Rename one of the items or remap categories so they
land in different folders.
```

Detection runs on the lowercased route, so it catches collisions that a case-insensitive filesystem (macOS, Windows) would otherwise merge silently.

### What is not a collision

- The same item re-exported from several entry points is deduplicated, not a collision.
- A value and a type that share a name route to different category folders (`/variable/...` and `/type/...`), so they never collide. A bare cross-link to the shared name resolves to the value page.
- Two items with the same name in different categories live at different routes and are fine.

## Resolving a real collision

If two distinct items legitimately need the same name, split them across categories by giving one a custom category with a different `folderName`, or rename one of the items in your source. The [troubleshooting guide](./11-troubleshooting.md) has the full walk-through.

## Next steps

- [Multi-package](./05-multi-package.md) — multiple packages, each potentially multi-entry.
- [Troubleshooting](./11-troubleshooting.md) — resolving route collisions step by step.
