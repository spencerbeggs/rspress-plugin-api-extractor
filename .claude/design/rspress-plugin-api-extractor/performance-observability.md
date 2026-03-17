---
status: current
module: rspress-plugin-api-extractor
category: observability
created: 2026-01-17
updated: 2026-03-17
last-synced: 2026-03-17
completeness: 90
related:
  - rspress-plugin-api-extractor/error-observability.md
  - rspress-plugin-api-extractor/snapshot-tracking-system.md
  - rspress-plugin-api-extractor/build-architecture.md
dependencies: []
---

# Performance Observability System Design

**Status:** Production-ready (Effect Metrics)

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Effect Metrics](#effect-metrics)
- [Logging System](#logging-system)
- [Build Summary](#build-summary)
- [Code Block Timing](#code-block-timing)
- [File Locations](#file-locations)

---

## Overview

The performance observability system provides build-time monitoring for the
`rspress-plugin-api-extractor` using Effect's built-in Logger and Metric
primitives. It replaces the previous custom classes (`PerformanceManager`,
`CodeBlockStatsCollector`, `FileGenerationStats`, `TwoslashErrorStats`,
`PrettierErrorStats`) with a single unified approach.

### Key Features

- **Effect Metric counters and histograms** for all build statistics
- **Custom Effect Logger** with human-readable and structured JSON modes
- **Single `logBuildSummary` program** reads all metrics at build end
- **Fiber-scoped context** -- metrics are automatically associated with
  the correct fiber
- **Zero custom collector classes** -- all state lives in Effect's metric
  registry

### What Was Deleted

The following files were removed during the Effect migration:

- `performance-manager.ts` -- replaced by native `performance.now()` calls
  and Effect Metrics
- `code-block-stats.ts` -- replaced by `codeblock.*` metrics
- `file-generation-stats.ts` -- replaced by `files.*` metrics
- `twoslash-error-stats.ts` -- replaced by `twoslash.errors` counter
- `prettier-error-stats.ts` -- replaced by `prettier.errors` counter
- `build-events.ts` -- deleted (event system no longer needed)
- `debug-logger.ts` -- replaced by Effect Logger

---

## Architecture

### Single Observability Module

All observability is defined in `layers/ObservabilityLive.ts`:

```text
ObservabilityLive.ts
  +-> BuildMetrics (named counters and histograms)
  +-> PluginLoggerLayer (custom Effect Logger + log level)
  +-> logBuildSummary (Effect program to read metrics)
```

### Integration Points

```text
Plugin initialization (plugin.ts)
    |
    +-> PluginLoggerLayer(logLevel)
    |   Replaces default Effect logger with custom formatter
    |   Sets minimum log level
    |
    +-> Layer composed into BaseLayer -> EffectAppLayer
    +-> ManagedRuntime.make(EffectAppLayer)

Build execution (build-stages.ts)
    |
    +-> Metric.increment(BuildMetrics.filesTotal)
    +-> Metric.increment(BuildMetrics.filesNew / modified / unchanged)
    +-> Metric.increment(BuildMetrics.pagesGenerated)
    +-> Metric.increment(BuildMetrics.codeblockTotal / codeblockSlow)
    +-> Metric.update(BuildMetrics.codeblockDuration)(duration)

Error callbacks (twoslash-transformer.ts, prettier-formatter.ts)
    |
    +-> Effect.runSync(Metric.increment(BuildMetrics.twoslashErrors))
    +-> Effect.runSync(Metric.increment(BuildMetrics.prettierErrors))

afterBuild hook (plugin.ts)
    |
    +-> effectRuntime.runPromise(logBuildSummary)
```

---

## Effect Metrics

All metrics are defined as named counters and histograms in
`BuildMetrics`:

```typescript
export const BuildMetrics = {
  // File tracking
  filesTotal: Metric.counter("files.total"),
  filesNew: Metric.counter("files.new"),
  filesModified: Metric.counter("files.modified"),
  filesUnchanged: Metric.counter("files.unchanged"),

  // Code block performance
  codeblockDuration: Metric.histogram(
    "codeblock.duration",
    MetricBoundaries.fromIterable([10, 25, 50, 100, 200, 500, 1000]),
  ),
  codeblockShikiDuration: Metric.histogram(
    "codeblock.shiki.duration",
    MetricBoundaries.fromIterable([5, 10, 25, 50, 100, 250]),
  ),
  codeblockTotal: Metric.counter("codeblock.total"),
  codeblockSlow: Metric.counter("codeblock.slow"),

  // Error tracking
  twoslashErrors: Metric.counter("twoslash.errors"),
  prettierErrors: Metric.counter("prettier.errors"),

  // Build progress
  pagesGenerated: Metric.counter("pages.generated"),
  apiVersionsLoaded: Metric.counter("api.versions.loaded"),
  externalPackagesTotal: Metric.counter("external.packages.total"),
} as const;
```

### Usage Pattern

Metrics are incremented within Effect programs using `Metric.increment`:

```typescript
// In build-stages.ts writeSingleFile
yield* Metric.increment(BuildMetrics.filesTotal);
if (status === "new") {
  yield* Metric.increment(BuildMetrics.filesNew);
} else {
  yield* Metric.increment(BuildMetrics.filesModified);
}
```

For error tracking in non-Effect callbacks (Shiki transformer hooks),
`Effect.runSync` is used:

```typescript
// In twoslash-transformer.ts onTwoslashError callback
Effect.runSync(Metric.increment(BuildMetrics.twoslashErrors));
```

---

## Logging System

### Custom Plugin Logger

`PluginLoggerLayer` creates a custom Effect Logger that replaces the
default logger:

```typescript
export function PluginLoggerLayer(
  logLevel: "debug" | "verbose" | "info" | "warn" | "error" | "none",
): Layer.Layer<never> {
  const debugMode = logLevel === "debug";
  const pluginLogger = makePluginLogger(debugMode);
  const effectLogLevel = { /* mapping */ }[logLevel];

  return Layer.mergeAll(
    Logger.replace(Logger.defaultLogger, pluginLogger),
    Logger.minimumLogLevel(effectLogLevel),
  );
}
```

### Output Modes

**Human-readable mode** (info, verbose, warn, error):

```text
[15:23:45] Generating API documentation...
[15:23:46] Generated 42 pages across 6 categories in parallel
[15:23:47] Generated 12 API documentation files for my-package
```

**Structured JSON mode** (debug):

```json
{"timestamp":1710691425000,"level":"info","message":"Generating API documentation..."}
```

### Log Level Mapping

| Plugin Level | Effect Level | Behavior |
| --- | --- | --- |
| `debug` | `Debug` | Structured JSON, all messages |
| `verbose` | `Debug` | Human-readable, all messages |
| `info` | `Info` | Human-readable, info+ only |
| `warn` | `Warning` | Human-readable, warnings+ only |
| `error` | `Error` | Human-readable, errors only |
| `none` | `None` | No output |

The `LOG_LEVEL` environment variable can override the configured level.

---

## Build Summary

### logBuildSummary

A single Effect program reads all metric snapshots and logs a summary:

```typescript
export const logBuildSummary = Effect.gen(function* () {
  const filesTotal = yield* Metric.value(BuildMetrics.filesTotal);
  const filesNew = yield* Metric.value(BuildMetrics.filesNew);
  const filesModified = yield* Metric.value(BuildMetrics.filesModified);
  const filesUnchanged = yield* Metric.value(BuildMetrics.filesUnchanged);
  const twoslashErrors = yield* Metric.value(BuildMetrics.twoslashErrors);
  const prettierErrors = yield* Metric.value(BuildMetrics.prettierErrors);
  const codeblockTotal = yield* Metric.value(BuildMetrics.codeblockTotal);
  const codeblockSlow = yield* Metric.value(BuildMetrics.codeblockSlow);

  // File summary
  yield* Effect.log(`files summary line`);

  // Code block performance warning (if slow blocks detected)
  if (blocks > 0 && slowBlocks > 0) {
    yield* Effect.logWarning(`slow blocks warning`);
  }

  // Error summary (if errors detected)
  if (totalErrors > 0) {
    yield* Effect.logWarning(`error summary`);
  }
});
```

### Example Output

```text
[15:23:47] files: 339 files (12 new, 5 modified, 322 unchanged)
[15:23:47] code block performance: 8 of 1247 blocks were slow (>100ms)
[15:23:47] 3 error(s) in code blocks (2 Twoslash, 1 Prettier)
```

### When It Runs

`logBuildSummary` is called in the `afterBuild` hook, but only on the
first build (skipped on HMR rebuilds to reduce noise):

```typescript
async afterBuild(_config, isProd) {
  if (isFirstBuild) {
    await effectRuntime.runPromise(logBuildSummary);
    isFirstBuild = false;
  }
  if (isProd) {
    await effectRuntime.dispose();
  }
}
```

---

## Code Block Timing

### Twoslash Timing Wrapper

The `createTwoslashTimingWrapper` (`twoslash-timing-wrapper.ts`) wraps a
Shiki transformer to measure Twoslash preprocessing time:

```typescript
export function createTwoslashTimingWrapper(
  twoslashTransformer: ShikiTransformer,
  onTiming: (duration: number) => void,
): ShikiTransformer {
  // Wraps the preprocess hook with performance.now() timing
}
```

The `onTiming` callback increments the `codeblockDuration` histogram
and the `codeblockSlow` counter when duration exceeds 100ms.

### Histogram Boundaries

Code block duration is tracked with histogram buckets at:
10ms, 25ms, 50ms, 100ms, 200ms, 500ms, 1000ms.

Shiki-only duration (excluding Twoslash) uses: 5ms, 10ms, 25ms, 50ms,
100ms, 250ms.

---

## File Locations

| File | Purpose |
| --- | --- |
| `layers/ObservabilityLive.ts` | BuildMetrics, PluginLoggerLayer, logBuildSummary |
| `twoslash-timing-wrapper.ts` | Timing wrapper for Shiki transformers |
| `build-stages.ts` | Metric increments in generate/write functions |
| `twoslash-transformer.ts` | Twoslash error counter via Effect.runSync |
| `prettier-formatter.ts` | Prettier error counter via Effect.runSync |

---

## Related Documentation

- **Error Observability:**
  `error-observability.md` -- Twoslash and Prettier error tracking
- **Snapshot Tracking System:**
  `snapshot-tracking-system.md` -- File change tracking with metrics
- **Build Architecture:**
  `build-architecture.md` -- Plugin structure and service layer
