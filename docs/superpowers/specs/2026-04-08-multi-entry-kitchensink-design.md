# Multi-Entry Point Kitchensink Module

**Date:** 2026-04-08
**Status:** Approved
**Scope:** Module setup only (plugin presentation changes deferred)

## Goal

Add a `./testing` entry point to the kitchensink module to produce a
multi-entry API Extractor model. This validates that rslib-builder
correctly merges per-entry models into a single `.api.json` with scoped
canonical references, and provides a test fixture for the plugin's
multi-entry point handling.

## File Changes

### New file: `modules/kitchensink/src/testing.ts`

A testing utilities entry point that re-exports shared types from the
main entry and adds testing-specific items.

**Re-exports from `./index.js`:**

- `Result<T>` -- return type used by testing utilities
- `Logger` -- base class for `MockLogger`
- `LogLevel` -- used in `MockLogger` configuration
- `TaskStatus` -- used by `TestRunner`

**New exports:**

| Export | Kind | Purpose |
| --- | --- | --- |
| `MockLogger` | Class (extends `Logger`) | Captures log entries in an array. Exposes `entries` property and `clear()` method. |
| `createMockResult<T>` | Function (overloaded) | Factory for `Result<T>` objects. `createMockResult(value)` for success, `createMockResult(undefined, error)` for failure. |
| `TestRunner` | Class | Wraps `AsyncTask` with lifecycle hooks (`beforeEach`, `afterEach`). Exposes `results` array and `lastStatus` getter. |
| `TestHook` | Type alias | `() => void \| Promise<void>` for lifecycle hooks. |

All TSDoc comments cross-reference main entry types using `{@link}` tags
to test cross-entry type linking.

### Modified file: `modules/kitchensink/package.json`

Add the testing entry to exports:

```json
"exports": {
  ".": "./src/index.ts",
  "./testing": "./src/testing.ts"
}
```

### No changes required

- `rslib.config.ts` -- rslib-builder auto-detects entries from exports
- Site configurations -- they consume the `.api.json` model, which now
  contains both entry points
- Plugin code -- deferred to a separate task

## How rslib-builder Processes This

1. `EntryExtractor` reads both exports from `package.json`
2. Maps `"."` to entry name `"index"`, `"./testing"` to `"testing"`
3. Runs API Extractor separately for each entry
4. Merges per-entry models into single `kitchensink.api.json`:
   - Main entry canonical refs: `kitchensink!Symbol`
   - Testing entry canonical refs: `kitchensink/testing!Symbol`
5. Copies merged model to all 3 site model directories

## Expected Build Output

```text
dist/npm/
  index.js
  index.d.ts
  testing.js
  testing.d.ts
  kitchensink.api.json    (merged model with 2 EntryPoint members)
  package.json            (transformed with conditional exports)
  tsdoc-metadata.json
  tsdoc.json
  tsconfig.json
```

The transformed `package.json` exports:

```json
{
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "import": "./index.js"
    },
    "./testing": {
      "types": "./testing.d.ts",
      "import": "./testing.js"
    }
  }
}
```

## Verification

1. Build succeeds: `pnpm --filter kitchensink run build`
2. Merged `.api.json` contains two `ApiEntryPoint` members
3. Canonical references are properly scoped per entry
4. Built `dist/npm/` has separate JS/DTS files per entry
5. Transformed `package.json` has correct conditional exports
6. Current plugin behavior documented (only processes first entry)

## Design Decisions

**Why kitchensink?** It is the comprehensive test fixture, feeds 3 sites,
and is purpose-built to exercise all API Extractor features.

**Why `./testing`?** Mirrors a real-world pattern (testing utilities
entry). Provides natural cross-references to the main entry's types
through inheritance and usage.

**Why re-export shared types?** Tests how the builder scopes items that
appear in both entries and how the plugin resolves cross-entry
references.

**Why defer plugin changes?** Verifying each layer independently reduces
debugging surface. The merged model must be correct before the plugin
can consume it.
