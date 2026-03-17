---
status: current
module: rspress-plugin-api-extractor
category: observability
created: 2026-01-15
updated: 2026-03-17
last-synced: 2026-03-17
completeness: 85
related:
  - rspress-plugin-api-extractor/performance-observability.md
  - rspress-plugin-api-extractor/build-architecture.md
dependencies: []
---

# Error Observability System Design

**Status:** Production-ready (Effect Metrics)

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Twoslash Error Handling](#twoslash-error-handling)
- [Prettier Error Handling](#prettier-error-handling)
- [Build Summary Integration](#build-summary-integration)
- [File Locations](#file-locations)

---

## Overview

The error observability system tracks Twoslash and Prettier errors that
occur during code block processing in API documentation. It uses Effect
Metric counters for aggregate tracking and console output for inline
error reporting.

### Key Features

- **Effect Metric counters** for Twoslash and Prettier error totals
- **Inline console logging** when errors occur (immediate feedback)
- **Aggregate summary** in `logBuildSummary` at build end
- **Non-fatal errors** -- build continues, errors are informational

### What Was Deleted

The following files were removed during the Effect migration:

- `twoslash-error-stats.ts` -- `TwoslashErrorStatsCollector` class with
  multi-dimensional tracking (by error code, file, API, version)
- `prettier-error-stats.ts` -- `PrettierErrorStatsCollector` class

The new system is simpler: it counts errors via Effect Metrics and logs
them inline. The multi-dimensional breakdown (by error code, by file,
by API) was removed as unnecessary complexity.

### What Are Twoslash Errors?

Twoslash is a TypeScript-powered documentation tool that adds type
information to code blocks. When Twoslash encounters TypeScript compiler
errors (like `TS2440`), it reports them as "errors". These are **not
build failures** -- they are warnings that Twoslash could not fully
type-check a code example. Common causes:

- Intentional type errors in examples
- Missing `@errors` annotations for expected errors
- Incomplete code examples (for brevity)
- Type definition conflicts between packages

---

## Architecture

### Error Tracking Flow

```text
Code block processing (remark plugin or page generator)
    |
    +-> Shiki with Twoslash transformer
    |   |
    |   +-> onTwoslashError callback
    |       |
    |       +-> Effect.runSync(
    |       |     Metric.increment(BuildMetrics.twoslashErrors)
    |       |   )
    |       +-> console.error(`Twoslash error: ${msg}`)
    |
    +-> Prettier formatting
        |
        +-> catch block
            |
            +-> Effect.runSync(
            |     Metric.increment(BuildMetrics.prettierErrors)
            |   )
            +-> console.error(`Prettier error: ${msg}`)

afterBuild hook (plugin.ts)
    |
    +-> logBuildSummary reads metric values
    +-> Logs aggregate error count if > 0
```

### Why Effect.runSync?

The Twoslash `onTwoslashError` callback runs inside Shiki's transformer
pipeline, which is not an Effect fiber. To increment the Effect Metric
counter from this synchronous callback context, `Effect.runSync` is used:

```typescript
onTwoslashError: (error: unknown, _code: string): void => {
  Effect.runSync(Metric.increment(BuildMetrics.twoslashErrors));
  const errorMsg = error instanceof Error
    ? error.message : String(error);
  console.error(`Twoslash error: ${errorMsg}`);
},
```

This is safe because `Metric.increment` is a pure synchronous operation
that does not require asynchronous resources.

---

## Twoslash Error Handling

### Location: `twoslash-transformer.ts`

The `TwoslashManager` configures the Twoslash transformer with
`throws: false` and an `onTwoslashError` callback:

```typescript
this.transformer = transformerTwoslash({
  throws: false,
  onTwoslashError: (error: unknown, _code: string): void => {
    // Increment Effect Metric counter
    Effect.runSync(Metric.increment(BuildMetrics.twoslashErrors));
    // Log inline for immediate visibility
    const errorMsg = error instanceof Error
      ? error.message : String(error);
    console.error(`Twoslash error: ${errorMsg}`);
  },
  // ... other options
});
```

### Error Behavior

- **Non-fatal:** The build continues after a Twoslash error
- **Code block still renders:** The code block is displayed without
  Twoslash enhancements (no hover tooltips, no type annotations)
- **Logged inline:** Each error is logged to stderr as it occurs
- **Counted:** The aggregate count appears in the build summary

---

## Prettier Error Handling

### Location: `prettier-formatter.ts`

When Prettier fails to format a code block, the error is caught and
counted:

```typescript
try {
  formatted = await prettier.format(code, options);
} catch (error) {
  Effect.runSync(Metric.increment(BuildMetrics.prettierErrors));
  console.error(`Prettier error: ${error}`);
  // Fall back to unformatted code
  formatted = code;
}
```

---

## Build Summary Integration

### Aggregate Error Reporting

The `logBuildSummary` program in `ObservabilityLive.ts` reads error
metrics and logs a summary:

```typescript
const tsErrors = twoslashErrors.count;
const prErrors = prettierErrors.count;
const totalErrors = tsErrors + prErrors;

if (totalErrors > 0) {
  const errorParts: string[] = [];
  if (tsErrors > 0) errorParts.push(`${tsErrors} Twoslash`);
  if (prErrors > 0) errorParts.push(`${prErrors} Prettier`);
  yield* Effect.logWarning(
    `${totalErrors} error(s) in code blocks `
    + `(${errorParts.join(", ")})`
  );
}
```

### Example Output

No errors:

```text
(no error line in summary)
```

With errors:

```text
[15:23:47] 3 error(s) in code blocks (2 Twoslash, 1 Prettier)
```

---

## File Locations

| File | Purpose |
| --- | --- |
| `layers/ObservabilityLive.ts` | `BuildMetrics.twoslashErrors`, `BuildMetrics.prettierErrors`, `logBuildSummary` |
| `twoslash-transformer.ts` | `onTwoslashError` callback with `Effect.runSync` |
| `prettier-formatter.ts` | Prettier error catch with `Effect.runSync` |

---

## Related Documentation

- **Performance Observability:**
  `performance-observability.md` -- Full metrics and logging system
- **Build Architecture:**
  `build-architecture.md` -- Plugin structure and service layer
