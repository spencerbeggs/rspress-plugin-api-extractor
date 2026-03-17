# ObservabilityLive Buildout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development
> (if subagents available) or superpowers:executing-plans to implement this plan.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 6 ad-hoc observability files with Effect's native logging and
metrics, deleting old files as their consumers migrate.

**Architecture:** Custom `Logger.make` for console output (emoji at INFO,
JSON at DEBUG). `Metric` counters/histograms replace stats collectors.
Three migration waves: stats collectors, PerformanceManager, DebugLogger.

**Tech Stack:** Effect (Logger, Metric, LogLevel, annotateLogs), Vitest

**Spec:** `docs/superpowers/specs/2026-03-16-observability-live-design.md`

---

## Chunk 1: Logger Infrastructure

### Task 1: Expand ObservabilityLive with custom Logger

**Files:**

- Modify: `plugin/src/layers/ObservabilityLive.ts`
- Modify: `plugin/src/layers/index.ts`
- Test: `plugin/__test__/layers/ObservabilityLive.test.ts`

- [ ] **Step 1: Write tests for custom logger formatting**

Add to `plugin/__test__/layers/ObservabilityLive.test.ts`:

```typescript
import { Effect, FiberRef, Layer, Logger, LogLevel, Metric } from "effect";
import { describe, expect, it, vi } from "vitest";
import {
 BuildMetrics,
 PluginLoggerLayer,
} from "../../src/layers/ObservabilityLive.js";

describe("PluginLoggerLayer", () => {
 it("INFO level outputs emoji-prefixed messages", async () => {
  const output: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
   output.push(args.join(" "));
  });

  const program = Effect.gen(function* () {
   yield* Effect.log("Build started");
   yield* Effect.logWarning("Slow code block");
   yield* Effect.logError("Build failed");
  });

  await Effect.runPromise(
   program.pipe(Effect.provide(PluginLoggerLayer("info"))),
  );

  spy.mockRestore();

  // INFO messages should have timestamp prefix
  expect(output.some((l) => l.includes("Build started"))).toBe(true);
  // Warnings get emoji
  expect(output.some((l) => l.includes("⚠️") && l.includes("Slow code block"))).toBe(true);
  // Errors get emoji
  expect(output.some((l) => l.includes("🔴") && l.includes("Build failed"))).toBe(true);
 });

 it("DEBUG level outputs structured JSON", async () => {
  const output: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
   output.push(args.join(" "));
  });

  const program = Effect.gen(function* () {
   yield* Effect.log("test message").pipe(
    Effect.annotateLogs("api", "my-package"),
    Effect.annotateLogs("version", "1.0.0"),
   );
  });

  await Effect.runPromise(
   program.pipe(Effect.provide(PluginLoggerLayer("debug"))),
  );

  spy.mockRestore();

  // Should be valid JSON
  const jsonLine = output.find((l) => l.startsWith("{"));
  expect(jsonLine).toBeDefined();
  const parsed = JSON.parse(jsonLine!);
  expect(parsed.message).toBe("test message");
  expect(parsed.api).toBe("my-package");
  expect(parsed.version).toBe("1.0.0");
 });

 it("minimum log level filters correctly", async () => {
  const output: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
   output.push(args.join(" "));
  });

  const program = Effect.gen(function* () {
   yield* Effect.logDebug("debug msg");
   yield* Effect.log("info msg");
   yield* Effect.logWarning("warn msg");
  });

  await Effect.runPromise(
   program.pipe(Effect.provide(PluginLoggerLayer("warn"))),
  );

  spy.mockRestore();

  expect(output.length).toBe(1);
  expect(output[0]).toContain("warn msg");
 });

 it("annotations propagate to output", async () => {
  const output: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
   output.push(args.join(" "));
  });

  const program = Effect.gen(function* () {
   yield* Effect.log("generating page").pipe(
    Effect.annotateLogs("file", "class/MyClass.mdx"),
   );
  });

  await Effect.runPromise(
   program.pipe(Effect.provide(PluginLoggerLayer("debug"))),
  );

  spy.mockRestore();

  const parsed = JSON.parse(output[0]);
  expect(parsed.file).toBe("class/MyClass.mdx");
 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run plugin/__test__/layers/ObservabilityLive.test.ts`

Expected: FAIL — `PluginLoggerLayer` not exported.

- [ ] **Step 3: Implement custom Logger in ObservabilityLive.ts**

Rewrite `plugin/src/layers/ObservabilityLive.ts`:

```typescript
import { HashMap, Layer, Logger, LogLevel, Metric, MetricBoundaries } from "effect";

/**
 * All build metrics as named counters/histograms.
 */
export const BuildMetrics = {
 filesTotal: Metric.counter("files.total"),
 filesNew: Metric.counter("files.new"),
 filesModified: Metric.counter("files.modified"),
 filesUnchanged: Metric.counter("files.unchanged"),
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
 twoslashErrors: Metric.counter("twoslash.errors"),
 prettierErrors: Metric.counter("prettier.errors"),
 pagesGenerated: Metric.counter("pages.generated"),
 apiVersionsLoaded: Metric.counter("api.versions.loaded"),
 externalPackagesTotal: Metric.counter("external.packages.total"),
} as const;

/**
 * Format a Date as HH:MM:SS for console output.
 */
function formatTime(date: Date): string {
 return date.toTimeString().slice(0, 8);
}

/**
 * Extract annotations from HashMap to a plain object.
 */
function annotationsToObject(
 annotations: HashMap.HashMap<string, unknown>,
): Record<string, unknown> {
 const obj: Record<string, unknown> = {};
 for (const [key, value] of annotations) {
  obj[key] = value;
 }
 return obj;
}

/**
 * Create a custom plugin logger for the given mode.
 * Uses a closure to capture debugMode — no mutable module state.
 */
function makePluginLogger(debugMode: boolean) {
 return Logger.make(({ logLevel, message, date, annotations }) => {
  if (debugMode) {
   // Structured JSON for LLM consumption
   const entry: Record<string, unknown> = {
    timestamp: date.getTime(),
    level: logLevel.label.toLowerCase(),
    message: typeof message === "string" ? message : String(message),
    ...annotationsToObject(annotations),
   };
   console.log(JSON.stringify(entry));
  } else {
   // Human-readable with emoji prefix
   const time = formatTime(date);
   const msg = typeof message === "string" ? message : String(message);
   const prefix =
    logLevel._tag === "Warning" ? "⚠️  "
    : logLevel._tag === "Error" ? "🔴 "
    : "";
   console.log(`[${time}] ${prefix}${msg}`);
  }
 });
}

/**
 * Create the complete observability layer for the plugin.
 *
 * @param logLevel - Plugin log level from options
 */
export function PluginLoggerLayer(
 logLevel: "debug" | "verbose" | "info" | "warn" | "error" | "none" = "info",
): Layer.Layer<never> {
 const debugMode = logLevel === "debug";
 const pluginLogger = makePluginLogger(debugMode);

 const effectLogLevel = {
  debug: LogLevel.Debug,
  verbose: LogLevel.Debug,
  info: LogLevel.Info,
  warn: LogLevel.Warning,
  error: LogLevel.Error,
  none: LogLevel.None,
 }[logLevel];

 return Layer.mergeAll(
  Logger.replace(Logger.defaultLogger, pluginLogger),
  Logger.minimumLogLevel(effectLogLevel),
 );
}
```

Key design points:

- `makePluginLogger(debugMode)` creates the logger inside a closure —
  no mutable module-level state
- `Layer.mergeAll` composes the logger replacement and minimum level
  into a single layer
- Annotations from `Effect.annotateLogs` flow through automatically

- [ ] **Step 4: Update layers/index.ts**

Replace the `PluginLoggerLive` export with `PluginLoggerLayer`:

```typescript
export { BuildMetrics, PluginLoggerLayer } from "./ObservabilityLive.js";
```

- [ ] **Step 5: Update plugin.ts import**

In `plugin/src/plugin.ts`, find the import of `PluginLoggerLive` and
rename to `PluginLoggerLayer`:

```typescript
import { PluginLoggerLayer } from "./layers/ObservabilityLive.js";
```

And update the usage where `PluginLoggerLive` is called (in the
ManagedRuntime setup).

- [ ] **Step 6: Run tests**

Run: `pnpm vitest run plugin/__test__/layers/ObservabilityLive.test.ts`

Expected: All tests PASS.

- [ ] **Step 7: Run full test suite + typecheck**

Run: `pnpm run test && pnpm run typecheck`

Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add plugin/src/layers/ObservabilityLive.ts plugin/src/layers/index.ts plugin/src/plugin.ts plugin/__test__/layers/ObservabilityLive.test.ts
git commit -m "$(cat <<'EOF'
feat: expand ObservabilityLive with custom Logger

Custom Logger.make matching current DebugLogger output format:
emoji-prefixed at INFO/VERBOSE, structured JSON at DEBUG.
Annotations flow through via Effect.annotateLogs.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>
EOF
)"
```

---

### Task 2: Add logBuildSummary Effect

**Files:**

- Modify: `plugin/src/layers/ObservabilityLive.ts`
- Test: `plugin/__test__/layers/ObservabilityLive.test.ts`

The build summary reads all metric snapshots and logs a formatted
summary, replacing the 4 `logSummary()` calls in `afterBuild`.

- [ ] **Step 1: Write test for build summary**

Add to `plugin/__test__/layers/ObservabilityLive.test.ts`:

```typescript
import { BuildMetrics, logBuildSummary } from "../../src/layers/ObservabilityLive.js";

describe("logBuildSummary", () => {
 it("produces summary from metric values", async () => {
  const output: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
   output.push(args.join(" "));
  });

  const program = Effect.gen(function* () {
   // Simulate a build
   yield* Metric.increment(BuildMetrics.filesTotal, 10);
   yield* Metric.increment(BuildMetrics.filesNew, 3);
   yield* Metric.increment(BuildMetrics.filesModified, 2);
   yield* Metric.increment(BuildMetrics.filesUnchanged, 5);
   yield* Metric.increment(BuildMetrics.twoslashErrors, 1);

   // Log summary
   yield* logBuildSummary();
  });

  await Effect.runPromise(
   program.pipe(Effect.provide(PluginLoggerLayer("info"))),
  );

  spy.mockRestore();

  // Should contain file counts
  const summaryLine = output.find((l) => l.includes("files"));
  expect(summaryLine).toBeDefined();
 });
});
```

- [ ] **Step 2: Implement logBuildSummary**

Add to `plugin/src/layers/ObservabilityLive.ts`:

```typescript
import { Effect } from "effect";

/**
 * Log a build summary by reading all metric snapshots.
 * Replaces the 4 separate logSummary() calls in afterBuild.
 */
export const logBuildSummary = Effect.gen(function* () {
 // Read metric values
 // Note: Effect Metric.value returns the current state of the metric.
 // For counters, this is the accumulated count.
 const filesTotal = yield* Metric.value(BuildMetrics.filesTotal);
 const filesNew = yield* Metric.value(BuildMetrics.filesNew);
 const filesModified = yield* Metric.value(BuildMetrics.filesModified);
 const filesUnchanged = yield* Metric.value(BuildMetrics.filesUnchanged);
 const twoslashErrors = yield* Metric.value(BuildMetrics.twoslashErrors);
 const prettierErrors = yield* Metric.value(BuildMetrics.prettierErrors);

 // Extract count values from MetricState
 const total = extractCount(filesTotal);
 const newCount = extractCount(filesNew);
 const modified = extractCount(filesModified);
 const unchanged = extractCount(filesUnchanged);
 const tsErrors = extractCount(twoslashErrors);
 const prErrors = extractCount(prettierErrors);

 // File summary
 if (total === 0) {
  yield* Effect.log("📝 No files generated");
 } else if (newCount === 0 && modified === 0) {
  yield* Effect.log(`📝 ${total} files (all unchanged)`);
 } else {
  const parts = [];
  if (newCount > 0) parts.push(`${newCount} new`);
  if (modified > 0) parts.push(`${modified} modified`);
  if (unchanged > 0) parts.push(`${unchanged} unchanged`);
  yield* Effect.log(`📝 ${total} files (${parts.join(", ")})`);
 }

 // Error summary
 const totalErrors = tsErrors + prErrors;
 if (totalErrors > 0) {
  yield* Effect.logWarning(
   `${totalErrors} error(s) in code blocks` +
   (tsErrors > 0 ? ` (${tsErrors} Twoslash` : "") +
   (prErrors > 0 ? `, ${prErrors} Prettier` : "") +
   (tsErrors > 0 || prErrors > 0 ? ")" : ""),
  );
 }
});

/**
 * Extract the count value from a MetricState.
 * Counter metrics return a CounterState with a count field.
 */
function extractCount(state: unknown): number {
 // MetricState for counters has a count property
 if (state && typeof state === "object" && "count" in state) {
  return Number((state as { count: number }).count);
 }
 return 0;
}
```

- [ ] **Step 3: Export logBuildSummary from layers/index.ts**

Add to exports:

```typescript
export { BuildMetrics, PluginLoggerLayer, logBuildSummary } from "./ObservabilityLive.js";
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run plugin/__test__/layers/ObservabilityLive.test.ts`

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/layers/ObservabilityLive.ts plugin/src/layers/index.ts plugin/__test__/layers/ObservabilityLive.test.ts
git commit -m "$(cat <<'EOF'
feat: add logBuildSummary for metric-based build reporting

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>
EOF
)"
```

---

## Chunk 2: Wave 1 — Stats Collector Migration

### Task 3: Migrate FileGenerationStatsCollector

**Files:**

- Modify: `plugin/src/plugin.ts`
- Delete: `plugin/src/file-generation-stats.ts`
- Delete: `plugin/src/file-generation-stats.test.ts`

Replace 9 `fileStatsCollector.recordFile()` calls + summary with
`Metric.increment` + `Effect.log`. This is the simplest collector —
no transitive consumers outside plugin.ts.

**Note on the bridge pattern:** The code being migrated is not yet
inside Effect programs — it's plain async/await in plugin.ts. To
increment metrics from non-Effect code, use
`Effect.runSync(Metric.increment(BuildMetrics.xxx))`. Effect metrics
use a global default registry, so `runSync` works without providing a
layer. Verify this in the first replacement and confirm tests pass
before proceeding to other call sites.

- [ ] **Step 1: In plugin.ts, add BuildMetrics import**

Add near the Effect imports at the top of plugin.ts:

```typescript
import { Effect, Metric } from "effect";
import { BuildMetrics } from "./layers/ObservabilityLive.js";
```

- [ ] **Step 2: Replace each recordFile call with Metric.increment**

Each `fileStatsCollector.recordFile(path, absPath, status, context)`
becomes a synchronous metric increment. Since plugin.ts isn't fully
Effect yet, use `Effect.runSync`:

```typescript
// Before:
fileStatsCollector.recordFile(relativePath, filePath, "unchanged", context);

// After:
Effect.runSync(Metric.increment(BuildMetrics.filesTotal));
Effect.runSync(Metric.increment(BuildMetrics.filesUnchanged));
```

For "new" status:

```typescript
Effect.runSync(Metric.increment(BuildMetrics.filesTotal));
Effect.runSync(Metric.increment(BuildMetrics.filesNew));
```

For "modified" status:

```typescript
Effect.runSync(Metric.increment(BuildMetrics.filesTotal));
Effect.runSync(Metric.increment(BuildMetrics.filesModified));
```

Apply this pattern to all 7 `recordFile()` call sites (lines 182, 220,
451, 457, 900, 1132, 1138).

- [ ] **Step 3: Replace afterBuild summary**

In `afterBuild`, remove:

```typescript
const fileSummary = fileStatsCollector.getSummary();
fileStatsCollector.logSummary(debugLogger);
debugLogger.fileStatsSummary(fileSummary);
```

The `logBuildSummary` Effect will be called from `afterBuild` via
`effectRuntime.runPromise(logBuildSummary)` after all collectors are
migrated. For now, add a placeholder comment.

- [ ] **Step 4: Remove fileStatsCollector initialization and import**

Remove the `import { FileGenerationStatsCollector }` line and the
`fileStatsCollector = new FileGenerationStatsCollector()` initialization.
Remove the `let fileStatsCollector` declaration.

Also remove from the `writeFile` helper function signature if it
receives `fileStatsCollector` as a parameter.

- [ ] **Step 5: Delete the source and test files**

```bash
rm plugin/src/file-generation-stats.ts plugin/src/file-generation-stats.test.ts
```

- [ ] **Step 6: Run all tests**

Run: `pnpm run test`

Expected: All pass (minus the deleted test file's tests).

- [ ] **Step 7: Run typecheck + lint**

Run: `pnpm run typecheck && pnpm run lint`

Expected: No errors. Fix any remaining references to the deleted
`FileGenerationStatsCollector`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: migrate FileGenerationStatsCollector to Effect Metrics

Replace recordFile() calls with Metric.increment(). Delete
file-generation-stats.ts and its test file.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>
EOF
)"
```

---

### Task 4: Migrate PrettierErrorStatsCollector

**Files:**

- Modify: `plugin/src/plugin.ts`
- Modify: `plugin/src/prettier-formatter.ts`
- Modify: `plugin/src/markdown/helpers.ts`
- Modify: `plugin/src/remark-with-api.ts`
- Delete: `plugin/src/prettier-error-stats.ts`

Transitive consumers: `prettier-formatter.ts` receives stats as param,
`markdown/helpers.ts` calls setContext/clearContext.

- [ ] **Step 1: Update prettier-formatter.ts**

Remove the `PrettierErrorStatsCollector` parameter from `formatCode()`.
When a prettier error occurs, use `console.warn` as a temporary fallback
(the full Effect logging replaces this in Wave 3 when DebugLogger is
removed). Or use `Effect.runSync(Metric.increment(...))`:

```typescript
// Before:
export async function formatCode(
  code: string,
  language: string,
  errorStats?: PrettierErrorStatsCollector,
  logger?: DebugLogger,
): Promise<FormatResult>

// After:
export async function formatCode(
  code: string,
  language: string,
  logger?: DebugLogger,
): Promise<FormatResult>
```

In the error handling path, replace `errorStats.recordError(...)` with:

```typescript
import { Effect, Metric } from "effect";
import { BuildMetrics } from "./layers/ObservabilityLive.js";

// In catch block:
Effect.runSync(Metric.increment(BuildMetrics.prettierErrors));
```

- [ ] **Step 2: Update markdown/helpers.ts**

Remove `PrettierErrorStatsCollector` parameter from
`formatCodeWithContext()`. Remove the `setContext`/`clearContext` calls.
Update the `formatCode` call to not pass stats:

```typescript
// Before:
export async function formatCodeWithContext(
  code: string,
  language: string,
  context?: { ... },
  prettierErrorStats?: PrettierErrorStatsCollector,
  logger?: DebugLogger,
): Promise<string>

// After:
export async function formatCodeWithContext(
  code: string,
  language: string,
  context?: { ... },
  logger?: DebugLogger,
): Promise<string>
```

- [ ] **Step 3: Update all callers in plugin.ts and remark-with-api.ts**

Remove `prettierErrorStats` from function call arguments throughout.
Remove initialization, summary calls in afterBuild.

- [ ] **Step 4: Delete source and test files**

```bash
rm plugin/src/prettier-error-stats.ts plugin/src/prettier-error-stats.test.ts
```

- [ ] **Step 5: Run all tests + typecheck + lint**

Run: `pnpm run test && pnpm run typecheck && pnpm run lint`

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: migrate PrettierErrorStatsCollector to Effect Metrics

Replace recordError() with Metric.increment(). Remove stats parameter
from formatCode/formatCodeWithContext. Delete prettier-error-stats.ts.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>
EOF
)"
```

---

### Task 5: Migrate TwoslashErrorStatsCollector

**Files:**

- Modify: `plugin/src/plugin.ts`
- Modify: `plugin/src/twoslash-transformer.ts`
- Modify: `plugin/src/remark-with-api.ts`
- Delete: `plugin/src/twoslash-error-stats.ts`
- Delete: `plugin/src/twoslash-error-stats.test.ts`

Key challenge: TwoslashManager singleton receives the collector via
`initialize()`. Its `onTwoslashError` callback needs to increment
metrics via `Effect.runSync`.

- [ ] **Step 1: Update TwoslashManager.initialize()**

Remove `errorStatsCollector` parameter. Update `onTwoslashError`
callback to use Effect metrics directly:

```typescript
// In onTwoslashError callback:
import { Effect, Metric } from "effect";
import { BuildMetrics } from "./layers/ObservabilityLive.js";

onTwoslashError: (error: unknown, code: string): void => {
  // Increment error counter
  Effect.runSync(Metric.increment(BuildMetrics.twoslashErrors));

  // Log the error (keep logger fallback until Wave 3)
  if (this.logger) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    this.logger.debug(`🔴 Twoslash error: ${errorMsg}`);
    this.logger.debug(`   Code: ${code.substring(0, 200).replace(/\n/g, " ")}`);
  }
}
```

- [ ] **Step 2: Update remark-with-api.ts options**

Remove `twoslashErrorStats` from the options interface and remove all
`setContext`/`clearContext` calls for it.

- [ ] **Step 3: Update plugin.ts**

Remove initialization, the `setContext` call at line 581, the summary
calls in afterBuild, and the parameter passed to
`TwoslashManager.initialize()`.

- [ ] **Step 4: Delete source and test files**

```bash
rm plugin/src/twoslash-error-stats.ts plugin/src/twoslash-error-stats.test.ts
```

- [ ] **Step 5: Run all tests + typecheck + lint**

Run: `pnpm run test && pnpm run typecheck && pnpm run lint`

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: migrate TwoslashErrorStatsCollector to Effect Metrics

Replace recordError() with Metric.increment() in TwoslashManager
onTwoslashError callback. Remove stats from remark-with-api options.
Delete twoslash-error-stats.ts.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>
EOF
)"
```

---

### Task 6: Migrate CodeBlockStatsCollector

**Files:**

- Modify: `plugin/src/plugin.ts`
- Modify: `plugin/src/remark-with-api.ts` (if it receives statsCollector)
- Delete: `plugin/src/code-block-stats.ts`
- Delete: `plugin/src/code-block-stats.test.ts`

- [ ] **Step 1: Update plugin.ts**

Remove initialization, summary calls. The `onSlowBlock` callback
becomes inline metric increment. Any code that passes `statsCollector`
to remark plugins is updated.

- [ ] **Step 2: Update remark-with-api.ts**

Remove `statsCollector` from options if present.

- [ ] **Step 3: Delete source and test files**

```bash
rm plugin/src/code-block-stats.ts plugin/src/code-block-stats.test.ts
```

- [ ] **Step 4: Run all tests + typecheck + lint**

Run: `pnpm run test && pnpm run typecheck && pnpm run lint`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: migrate CodeBlockStatsCollector to Effect Metrics

Replace recordBlock() with Metric.update() for histograms.
Delete code-block-stats.ts.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>
EOF
)"
```

---

### Task 7: Wire logBuildSummary into afterBuild

**Files:**

- Modify: `plugin/src/plugin.ts`

Now that all 4 stats collectors are deleted, replace their `logSummary`
calls with the Effect-based `logBuildSummary`.

- [ ] **Step 1: Replace afterBuild summary section**

In the `afterBuild` hook, replace the old summary block:

```typescript
// Before (remove all of this):
const fileSummary = fileStatsCollector.getSummary();
const codeBlockSummary = statsCollector.getSummary();
const twoslashSummary = twoslashErrorStats.getSummary();
const prettierSummary = prettierErrorStats.getSummary();
fileStatsCollector.logSummary(debugLogger);
statsCollector.logSummary(debugLogger);
twoslashErrorStats.logSummary(debugLogger);
prettierErrorStats.logSummary(debugLogger);
debugLogger.fileStatsSummary(fileSummary);
debugLogger.codeBlockStatsSummary(codeBlockSummary);
debugLogger.errorStatsSummary({ twoslash: twoslashSummary, prettier: prettierSummary });

// After:
await effectRuntime.runPromise(logBuildSummary);
```

- [ ] **Step 2: Add logBuildSummary import**

```typescript
import { logBuildSummary } from "./layers/ObservabilityLive.js";
```

- [ ] **Step 3: Run all tests + typecheck**

Run: `pnpm run test && pnpm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add plugin/src/plugin.ts
git commit -m "$(cat <<'EOF'
feat: wire logBuildSummary into afterBuild hook

Replace 4 separate logSummary() calls with single Effect-based
logBuildSummary that reads metric snapshots.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>
EOF
)"
```

---

## Chunk 3: Wave 2 — PerformanceManager Migration

Wave 2 replaces PerformanceManager's 69 references. This is the largest
wave. Tasks are higher-level and will be expanded during implementation
as the exact call sites are assessed.

### Task 8: Replace PerformanceManager counter/increment calls

**Files:**

- Modify: `plugin/src/plugin.ts`

Replace all `perfManager?.increment(name, value)` calls with
`Effect.runSync(Metric.increment(BuildMetrics.xxx))`. Map each named
counter to its `BuildMetrics` equivalent.

- [ ] **Step 1: Map all perfManager.increment calls to BuildMetrics**
- [ ] **Step 2: Replace each call site**
- [ ] **Step 3: Run tests + typecheck**
- [ ] **Step 4: Commit**

---

### Task 9: Replace PerformanceManager mark/measure calls

**Files:**

- Modify: `plugin/src/plugin.ts`

Replace `perfManager?.mark/measure` pairs with `performance.now()`
deltas + `Effect.log` for timing. Defer `Effect.withSpan` until the
code paths become Effect programs.

- [ ] **Step 1: Replace each mark/measure pair**
- [ ] **Step 2: Run tests + typecheck**
- [ ] **Step 3: Commit**

---

### Task 10: Replace PerformanceManager context and slow checks

**Files:**

- Modify: `plugin/src/plugin.ts`

Replace `perfManager?.setContext/clearContext` with removal (context
flows through log annotations). Replace `perfManager?.isSlow()` with
inline threshold checks.

- [ ] **Step 1: Remove setContext/clearContext calls**
- [ ] **Step 2: Replace isSlow checks**
- [ ] **Step 3: Run tests + typecheck**
- [ ] **Step 4: Commit**

---

### Task 11: Delete PerformanceManager

**Files:**

- Delete: `plugin/src/performance-manager.ts`
- Delete: `plugin/src/performance-manager.test.ts`
- Modify: `plugin/src/plugin.ts` (remove import and initialization)

- [ ] **Step 1: Remove all remaining perfManager references**
- [ ] **Step 2: Delete files**
- [ ] **Step 3: Run tests + typecheck + lint**
- [ ] **Step 4: Commit**

---

## Chunk 4: Wave 3 — DebugLogger Migration

Wave 3 replaces DebugLogger's 35 references. This is last because
Waves 1-2 eliminated the stats collectors and perf manager that fed
into it. Tasks are higher-level.

### Task 12: Replace DebugLogger generic logging calls

**Files:**

- Modify: `plugin/src/plugin.ts`

Replace `debugLogger.verbose(msg)` with `Effect.runSync(Effect.log(msg))`
(or `Effect.logDebug` for verbose). Replace `warn/error` similarly.

- [ ] **Step 1: Replace all verbose/debug/info/warn/error calls**
- [ ] **Step 2: Run tests + typecheck**
- [ ] **Step 3: Commit**

---

### Task 13: Replace DebugLogger event methods and timers

**Files:**

- Modify: `plugin/src/plugin.ts`

Replace `debugLogger.buildStart(data)`, `debugLogger.startTimer()`,
etc. with `Effect.log` + annotations or `performance.now()` deltas.

- [ ] **Step 1: Replace event emission calls**
- [ ] **Step 2: Replace timer usage**
- [ ] **Step 3: Run tests + typecheck**
- [ ] **Step 4: Commit**

---

### Task 14: Remove DebugLogger from transitive consumers

**Files:**

- Modify: `plugin/src/twoslash-transformer.ts`
- Modify: `plugin/src/type-registry-loader.ts`
- Modify: `plugin/src/prettier-formatter.ts`
- Modify: `plugin/src/markdown/helpers.ts`
- Modify: `plugin/src/remark-api-codeblocks.ts`

Remove `logger?: DebugLogger` parameters from all functions that
receive it. Replace internal logging with `console.log` or
`Effect.runSync(Effect.log(...))`.

- [ ] **Step 1: Update each file's function signatures**
- [ ] **Step 2: Run tests + typecheck**
- [ ] **Step 3: Commit**

---

### Task 15: Delete DebugLogger and build-events

**Files:**

- Delete: `plugin/src/debug-logger.ts`
- Delete: `plugin/src/logger.test.ts`
- Delete: `plugin/src/build-events.ts`
- Modify: `plugin/src/plugin.ts` (remove import and initialization)

- [ ] **Step 1: Remove all remaining debugLogger references**
- [ ] **Step 2: Delete files**
- [ ] **Step 3: Run tests + typecheck + lint**
- [ ] **Step 4: Commit**

---

### Task 16: Final verification

- [ ] **Step 1: Run all tests**

Run: `pnpm run test`

Expected: All tests pass.

- [ ] **Step 2: Run typecheck + lint + build**

Run: `pnpm run typecheck && pnpm run lint && pnpm run build`

Expected: All pass.

- [ ] **Step 3: Verify deleted files**

```bash
ls plugin/src/debug-logger.ts plugin/src/build-events.ts plugin/src/performance-manager.ts plugin/src/code-block-stats.ts plugin/src/file-generation-stats.ts plugin/src/twoslash-error-stats.ts plugin/src/prettier-error-stats.ts 2>&1
```

Expected: All "No such file or directory".

- [ ] **Step 4: Verify no remaining references to deleted modules**

```bash
grep -r "debug-logger\|build-events\|performance-manager\|code-block-stats\|file-generation-stats\|twoslash-error-stats\|prettier-error-stats" plugin/src/ --include="*.ts" | grep -v node_modules | grep -v ".test.ts"
```

Expected: No matches.
