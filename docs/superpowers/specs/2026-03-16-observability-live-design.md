# ObservabilityLive Buildout Design

## Overview

Replace the plugin's 6 ad-hoc observability files with Effect's native
logging and metrics primitives. Build the replacement infrastructure
first, then migrate consumers incrementally, deleting old files as each
one's last consumer is migrated.

### Goals

- Replace DebugLogger, 4 stats collectors, and PerformanceManager with
  Effect Logger + Metrics
- Preserve the current developer experience (emoji-prefixed console
  output at INFO/VERBOSE, structured JSON at DEBUG)
- Eliminate shared mutable state (setContext/clearContext) via
  fiber-scoped annotations
- Delete 7 source files and their test files

### Non-Goals

- JSONL debug log file output (dropped; pipe stdout if needed)
- Changing the plugin's public API or configuration surface
- Migrating remark plugin internals (only their option types change)

## Decisions Record

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Debug log file | Dropped | Pipe stdout if needed; simplifies system |
| PerformanceManager | Replace with Effect Metric + withSpan | Full Effect-native, no legacy singleton |
| Stats collectors | Replace with Metric counters/histograms | Effect Metric IS the centralized metrics system |
| Console format | Custom Logger.make matching current style | Preserves developer experience |
| Migration order | Logger first, metrics, then consumers | Logger must exist before consumers can switch |

## Custom Logger Layer

A custom `Logger.make` that produces the same output style as
DebugLogger: emoji-prefixed human-readable at INFO/VERBOSE, structured
JSON at DEBUG.

The logger reads annotations set via `Effect.annotateLogs` for context
(api, version, file). These replace the shared mutable
`setContext`/`clearContext` pattern.

- `Logger.replace(Logger.defaultLogger, PluginLogger)` swaps Effect's
  default for our custom logger
- `Logger.minimumLogLevel` filters based on plugin config
- "verbose" maps to Effect's Debug level (Effect has no Verbose level)
- Annotations carry fiber-scoped context without shared mutable state

Output formats:

- **INFO/VERBOSE:** `[HH:MM:SS] {emoji} {message}` — same as current
  DebugLogger output
- **DEBUG:** One JSON object per line with timestamp, level, message,
  and all annotations — same structured format as current DEBUG mode

## Metrics Definitions

All metrics defined in a single `BuildMetrics` object in
`ObservabilityLive.ts`.

### Counters

| Metric | Replaces |
| ------ | -------- |
| `files.total` | `FileGenerationStatsCollector.recordFile()` count |
| `files.new` | Status="new" count |
| `files.modified` | Status="modified" count |
| `files.unchanged` | Status="unchanged" count |
| `pages.generated` | Manual counting in plugin.ts |
| `twoslash.errors` | `TwoslashErrorStatsCollector.recordError()` count |
| `prettier.errors` | `PrettierErrorStatsCollector.recordError()` count |
| `codeblock.total` | `CodeBlockStatsCollector.recordBlock()` count |
| `codeblock.slow` | Slow block count |
| `api.versions.loaded` | `perfManager.increment("api.versions.loaded")` |
| `external.packages.total` | `perfManager.increment("external.packages.total")` |

### Histograms

| Metric | Boundaries | Replaces |
| ------ | ---------- | -------- |
| `codeblock.duration` | 10, 25, 50, 100, 200, 500, 1000 | `CodeBlockStatsCollector.recordBlock(time)` |
| `codeblock.shiki.duration` | 5, 10, 25, 50, 100, 250 | Shiki-specific timing |

### PerformanceManager replacement

| Current Pattern | Effect Replacement |
| --------------- | ------------------ |
| `perfManager.mark/measure` | `Effect.withSpan` for Effect code; `performance.now()` delta + `Effect.log` for non-Effect code |
| `perfManager.increment` | `Metric.increment(BuildMetrics.xxx)` |
| `perfManager.setContext/clearContext` | `Effect.annotateLogs` (fiber-scoped) |
| `perfManager.isSlow()` | Threshold comparison inline + `Effect.logWarning` |

### Build Summary

A `logBuildSummary` Effect reads all metric snapshots via `Metric.value`
and produces the same summary output as the current `logSummary()` calls
in `afterBuild`. Single function replaces 4 separate `logSummary()`
calls.

## Consumer Migration Strategy

Three waves, each leaving the system in a working state. Every commit
passes all tests.

### Wave 1: Stats Collectors (lowest coupling)

Replace `recordFile()`, `recordBlock()`, `recordError()` calls with
`Metric.increment` / `Metric.update`. One-line replacements. After all
call sites migrated for a collector, delete the file.

Order within wave 1:

1. `FileGenerationStatsCollector` — 9 references in plugin.ts (simplest,
   no transitive consumers outside plugin.ts)
2. `PrettierErrorStatsCollector` — 2 direct refs in plugin.ts, plus
   transitive consumers: `prettier-formatter.ts` (receives as param),
   `markdown/helpers.ts` (calls setContext/clearContext, passes to
   formatCode)
3. `TwoslashErrorStatsCollector` — 3 direct refs in plugin.ts, plus
   transitive consumers: `twoslash-transformer.ts` (TwoslashManager
   singleton receives it via `initialize()`), `remark-with-api.ts`
   (passes as option)
4. `CodeBlockStatsCollector` — 2 refs in plugin.ts, feeds remark plugins

Transitive consumer updates per collector:

- `FileGenerationStatsCollector`: plugin.ts only
- `PrettierErrorStatsCollector`: plugin.ts, prettier-formatter.ts,
  markdown/helpers.ts
- `TwoslashErrorStatsCollector`: plugin.ts, twoslash-transformer.ts,
  remark-with-api.ts
- `CodeBlockStatsCollector`: plugin.ts, remark-api-codeblocks.ts

Files deleted after wave 1:

- `plugin/src/file-generation-stats.ts`
- `plugin/src/prettier-error-stats.ts`
- `plugin/src/twoslash-error-stats.ts`
- `plugin/src/code-block-stats.ts`

### TwoslashManager adaptation (Wave 1)

The `TwoslashManager` singleton (`twoslash-transformer.ts`) currently
receives `TwoslashErrorStatsCollector` and `DebugLogger` via its
`initialize()` method. Its `onTwoslashError` callback calls
`errorStatsCollector.recordError()`.

When `TwoslashErrorStatsCollector` is deleted in Wave 1, the
`onTwoslashError` callback is updated to call `Metric.increment` +
`Effect.logWarning` via the `ManagedRuntime` bridge
(`runtime.runSync()`). This works because the callback runs
synchronously within Shiki's transformer pipeline (Context 2), and the
`ManagedRuntime` instance is available at module scope.

The `DebugLogger` parameter is kept in TwoslashManager until Wave 3
when DebugLogger itself is deleted.

### Wave 2: PerformanceManager (69 references)

Replace `mark/measure/increment` calls throughout plugin.ts.

- `increment(name, value)` becomes `Metric.increment(BuildMetrics.xxx)`
- `mark/measure` pairs become `Effect.withSpan` (Effect code) or
  `performance.now()` delta with `Effect.log` (non-Effect code)
- `setContext/clearContext` becomes `Effect.annotateLogs`
- `isSlow()` becomes inline threshold check + `Effect.logWarning`

File deleted after wave 2:

- `plugin/src/performance-manager.ts`

### Wave 3: DebugLogger (35 references)

Last because waves 1-2 eliminate the collectors and perf manager that
feed into it.

- `verbose/debug/info/warn/error` becomes `Effect.log/logDebug/logWarning/logError`
- `startTimer()` becomes `Effect.withSpan` or `performance.now()` delta
- Event emission methods become `Effect.log` with annotations
- `group/groupEnd` becomes `Effect.annotateLogs`
- `close()` removed (no file writer)

Transitive consumer updates for Wave 3:

- `plugin/src/twoslash-transformer.ts` — remove DebugLogger parameter
  from `initialize()`
- `plugin/src/type-registry-loader.ts` — remove DebugLogger parameter
  from constructor
- `plugin/src/remark-api-codeblocks.ts` — remove logger option type
- `plugin/src/prettier-formatter.ts` — remove logger parameter
- `plugin/src/markdown/helpers.ts` — remove logger parameter

Files deleted after wave 3:

- `plugin/src/debug-logger.ts`
- `plugin/src/build-events.ts`

### Remark plugin updates

Remark plugins (`remark-api-codeblocks.ts`, `remark-with-api.ts`)
receive logger/stats as options from plugin.ts. When plugin.ts stops
passing old collectors, the remark plugins' option types are updated.
The remark plugin logic itself does not change.

## Testing

### Logger tests

- Custom logger formats correctly at each level (INFO emoji, DEBUG JSON)
- `Logger.minimumLogLevel` filters correctly
- Annotations (api, version, file) appear in output
- "verbose" level handling works

### Metrics tests

- All counters increment correctly
- Histograms record values in correct buckets
- `Metric.value` reads back accumulated state
- `logBuildSummary` produces correct output from metric snapshots

### Test file migration

Test files rewritten as their source files are deleted:

| Deleted Source | Tests Move To |
| -------------- | ------------- |
| `file-generation-stats.test.ts` | `__test__/layers/ObservabilityLive.test.ts` |
| `prettier-error-stats.test.ts` | Same |
| `twoslash-error-stats.test.ts` | Same |
| `code-block-stats.test.ts` | Same |
| `performance-manager.test.ts` | Same |
| `logger.test.ts` | Same |

## File Changes Summary

### Modified

- `plugin/src/layers/ObservabilityLive.ts` — expanded with custom
  Logger, full metrics, build summary
- `plugin/src/layers/index.ts` — updated exports
- `plugin/src/plugin.ts` — replace all collector/logger/perfManager
  references
- `plugin/src/twoslash-transformer.ts` — remove error stats + logger
  params, use runtime.runSync for error metrics (Wave 1 + Wave 3)
- `plugin/src/prettier-formatter.ts` — remove stats + logger params
  (Wave 1 + Wave 3)
- `plugin/src/markdown/helpers.ts` — remove stats + logger params
  (Wave 1 + Wave 3)
- `plugin/src/type-registry-loader.ts` — remove logger param (Wave 3)
- `plugin/src/remark-api-codeblocks.ts` — remove logger option (Wave 3)
- `plugin/src/remark-with-api.ts` — remove stats option (Wave 1)

### Deleted (7 files)

| File | Deleted After |
| ---- | ------------- |
| `plugin/src/file-generation-stats.ts` | Wave 1 |
| `plugin/src/prettier-error-stats.ts` | Wave 1 |
| `plugin/src/twoslash-error-stats.ts` | Wave 1 |
| `plugin/src/code-block-stats.ts` | Wave 1 |
| `plugin/src/performance-manager.ts` | Wave 2 |
| `plugin/src/debug-logger.ts` | Wave 3 |
| `plugin/src/build-events.ts` | Wave 3 |
