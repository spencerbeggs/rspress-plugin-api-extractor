---
status: current
module: rspress-plugin-api-extractor
category: observability
created: 2026-01-17
updated: 2026-01-17
last-synced: 2026-01-17
completeness: 85
related: []
dependencies: []
---

# Performance Observability System Design

**Status:** Production-ready

## Table of Contents

1. [Overview](#overview)
2. [Goals and Requirements](#goals-and-requirements)
3. [Architecture](#architecture)
4. [Performance Metrics](#performance-metrics)
5. [Threshold System](#threshold-system)
6. [Logging and Output](#logging-and-output)
7. [Configuration](#configuration)
8. [Implementation Details](#implementation-details)
9. [Testing Strategy](#testing-strategy)
10. [Future Enhancements](#future-enhancements)

---

## Overview

The performance observability system provides comprehensive performance monitoring
for the `rspress-plugin-api-extractor` build process. It tracks execution times
for key operations, identifies performance bottlenecks, and provides actionable
insights through configurable thresholds and detailed logging.

### Key Features

- **Native Performance API integration** using Node.js `performance.mark()` and
  `performance.measure()`
- **Configurable thresholds** for identifying slow operations across different
  operation types
- **Code block statistics** tracking rendering performance for Shiki syntax
  highlighting
- **Detailed logging** at DEBUG and VERBOSE levels with timing information
- **Performance summaries** showing slow operations, totals, and averages
- **Type-safe measurement** using TypeScript for compile-time safety

---

## Goals and Requirements

### Primary Goals

1. **Identify bottlenecks** - Quickly pinpoint slow operations in the build
   process
2. **Track trends** - Monitor performance across builds to detect regressions
3. **Configurable alerting** - Allow users to define what constitutes "slow"
   for their site
4. **Minimal overhead** - Performance tracking should not significantly impact
   build times
5. **Actionable insights** - Provide clear information for optimization
   decisions
6. **Developer-friendly** - Easy to understand output with sensible defaults

### Non-Goals

- Real-time performance dashboards (CLI-focused output)
- Historical performance data persistence (logs only)
- Automated performance regression testing (left to CI/CD)
- Production runtime monitoring (build-time only)

---

## Architecture

### Components

```text
┌─────────────────────────────────────────────────────────────┐
│                     Plugin (plugin.ts)                       │
│  - Orchestrates build process                                │
│  - Calls PerformanceManager for timing                       │
│  - Uses CodeBlockStatsCollector for code block metrics      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│         PerformanceManager (performance-manager.ts)          │
│  - Wraps Node.js Performance API                            │
│  - Tracks marks and measures                                │
│  - Compares durations against thresholds                    │
│  - Provides isSlow() method                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│      CodeBlockStatsCollector (code-block-stats.ts)          │
│  - Accumulates code block rendering statistics              │
│  - Tracks total/slow/fast blocks                            │
│  - Calculates averages and percentages                      │
│  - Logs summary reports                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Logger (logger.ts)                        │
│  - Outputs performance logs at DEBUG/VERBOSE levels         │
│  - Formats timing information                               │
│  - Displays slow operation warnings                         │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```text
Build Start
    │
    ├─> PerformanceManager.mark("build.start")
    │
    ├─> For each API model:
    │       │
    │       ├─> PerformanceManager.mark("api.load.start")
    │       ├─> Load API model from disk
    │       ├─> PerformanceManager.mark("api.load.end")
    │       ├─> PerformanceManager.measure("api.load", "start", "end")
    │       │
    │       ├─> For each API item:
    │       │   │
    │       │   ├─> PerformanceManager.mark("page.generate.start")
    │       │   ├─> Generate markdown content
    │       │   │
    │       │   ├─> For each code block:
    │       │   │   │
    │       │   │   ├─> const startTime = performance.now()
    │       │   │   ├─> Render with Shiki
    │       │   │   ├─> const duration = performance.now() - startTime
    │       │   │   ├─> CodeBlockStatsCollector.recordBlock(duration)
    │       │   │   │
    │       │   │   └─> If isSlow("code.block", duration):
    │       │   │       └─> Logger.debug("Slow block: {duration}ms")
    │       │   │
    │       │   ├─> PerformanceManager.mark("page.generate.end")
    │       │   └─> PerformanceManager.measure("page.generate",
    │       │       "start", "end")
    │       │
    │       └─> CodeBlockStatsCollector.logSummary()
    │
    ├─> PerformanceManager.mark("build.end")
    ├─> PerformanceManager.measure("build.total", "build.start",
    │   "build.end")
    │
    └─> Build Complete
```

---

## Performance Metrics

### Tracked Operations

The system tracks performance for the following operation types:

| Operation | Metric Name | Description | Typical Range |
| --- | --- | --- | --- |
| **Build Total** | `build.total` | Entire plugin execution | 5-30 seconds |
| **API Load** | `api.load` | Loading `.api.json` model | 50-200ms |
| **Model Parse** | `model.parse` | Parsing API Extractor model | 20-100ms |
| **Page Generate** | `page.generate.{type}` | Generating MDX page | 10-100ms |
| **Code Block** | `code.block.render` | Shiki syntax highlighting | 5-50ms |
| **Snapshot Query** | `snapshot.query` | Database lookup | 0.01-0.1ms |
| **File Write** | `file.write` | Writing MDX to disk | 1-10ms |
| **Metadata Write** | `meta.write` | Writing `_meta.json` | 1-5ms |

### Code Block Statistics

The `CodeBlockStatsCollector` tracks detailed statistics for code block
rendering:

```typescript
interface CodeBlockStats {
    totalBlocks: number;       // Total code blocks rendered
    slowBlocks: number;        // Blocks exceeding threshold
    fastBlocks: number;        // Blocks under threshold
    totalTime: number;         // Cumulative rendering time (ms)
    slowTime: number;          // Time spent on slow blocks (ms)
    fastTime: number;          // Time spent on fast blocks (ms)
    averageTime: number;       // Average time per block (ms)
    slowPercentage: number;    // Percentage of slow blocks
}
```

**Example Output:**

```text
Code block statistics:
  Total blocks: 1,247
  Slow blocks: 73 (5.9%) - >100ms threshold
  Fast blocks: 1,174 (94.1%)
  Total time: 42.3s
  Average: 34ms per block
```

---

## Threshold System

### Default Thresholds

The system defines sensible defaults for identifying slow operations:

```typescript
export const DEFAULT_PERFORMANCE_THRESHOLDS = {
    slowCodeBlock: 100,        // 100ms - code blocks should be fast
    slowPageGeneration: 500,   // 500ms - pages can be complex
    slowApiLoad: 1000,         // 1s - API models can be large
    slowFileOperation: 50,     // 50ms - file I/O should be quick
    slowHttpRequest: 2000,     // 2s - network can be slow
    slowDbOperation: 100,      // 100ms - SQLite should be fast
} as const;
```

### Threshold Rationale

**Code Block (100ms):**

- Syntax highlighting should be fast
- Slow blocks indicate complex code or Twoslash overhead
- Typical block: 20-40ms
- Complex Twoslash block: 50-150ms

**Page Generation (500ms):**

- Most pages generate in 50-200ms
- Complex class pages with many members: 200-500ms
- Exceeding 500ms suggests optimization opportunities

**API Load (1000ms):**

- Typical API model: 100-300ms
- Large models (>1000 exports): 500-1000ms
- Exceeding 1s may indicate disk I/O issues or enormous models

**File Operation (50ms):**

- Writing MDX files: 1-10ms
- Reading API models: 10-50ms
- Exceeding 50ms suggests disk I/O problems

**HTTP Request (2000ms):**

- Fetching external packages from CDN
- Network latency + download time
- Exceeding 2s may indicate network issues or large packages

**Database Operation (100ms):**

- Snapshot queries: 0.01-0.1ms (indexed)
- Bulk operations: 10-50ms
- Exceeding 100ms suggests missing indexes or large datasets

### Configurable Thresholds

Users can customize thresholds via plugin options:

```typescript
export interface PerformanceThresholds {
    slowCodeBlock?: number;
    slowPageGeneration?: number;
    slowApiLoad?: number;
    slowFileOperation?: number;
    slowHttpRequest?: number;
    slowDbOperation?: number;
}
```

**When to customize:**

- **Large sites** (1000+ pages): Increase `slowPageGeneration` to 1000ms
- **Complex code examples**: Increase `slowCodeBlock` to 200ms
- **Slow disk**: Increase `slowFileOperation` to 100ms
- **Development machines**: Increase all thresholds by 50-100%
- **CI environments**: Use defaults for consistent benchmarking

---

## Logging and Output

### Log Levels

The system integrates with the plugin's logging system, outputting at two
levels:

**DEBUG Level:**

- Individual operation timings
- Slow operation warnings
- Mark and measure events
- Raw performance data

**VERBOSE Level:**

- Summary statistics
- Aggregated metrics
- Performance insights
- Human-readable reports

### Debug Output Format

```text
[DEBUG] 2026-01-15T15:23:45.147Z | api.load.start
[DEBUG] Loading API model: claude-binary-plugin (lib/packages/...)
[DEBUG] 2026-01-15T15:23:45.289Z | api.load.end
[DEBUG] ⏱️  api.load: 142ms

[DEBUG] 2026-01-15T15:23:45.290Z | page.generate.class.start
[DEBUG] Generating class: ClaudeBinaryPlugin
[DEBUG] ⏱️  Code block render: 67ms
[DEBUG] ⏱️  Code block render: 123ms (SLOW - >100ms)
[DEBUG] 2026-01-15T15:23:45.512Z | page.generate.class.end
[DEBUG] ⏱️  page.generate.class: 222ms
```

### Verbose Output Format

```text
📊 Code Block Performance:
   Total blocks: 1,247
   Slow blocks: 73 (5.9%, >100ms)
   Total time: 42.3s
   Average: 34ms per block

⚠️  Performance Warnings:
   • 73 slow code blocks detected (>100ms threshold)
   • 12 slow page generations (>500ms threshold)
   • Consider optimizing complex Twoslash examples

✓ Build completed in 18.4s
```

### Slow Operation Warnings

When operations exceed thresholds, the system logs warnings:

```text
[WARN] Slow code block rendering detected:
   Block: signature block for ClaudeBinaryPlugin.create()
   Duration: 234ms (threshold: 100ms)
   Location: api/class/claudebinaryplugin.mdx:87
   Reason: Complex Twoslash type inference
```

---

## Configuration

### Plugin Options

```typescript
export interface ApiExtractorPluginOptions {
    // ... existing options ...

    /**
     * Performance monitoring configuration
     */
    performance?: {
        /**
         * Custom performance thresholds
         * @default DEFAULT_PERFORMANCE_THRESHOLDS
         */
        thresholds?: PerformanceThresholds;

        /**
         * Enable detailed code block statistics
         * @default true in DEBUG mode, false otherwise
         */
        trackCodeBlocks?: boolean;
    };
}
```

### Usage Example

```typescript
// rspress.config.ts
import { defineConfig } from "rspress/config";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

export default defineConfig({
    plugins: [
        ApiExtractorPlugin({
            logLevel: "debug",

            // Custom thresholds for large site
            performance: {
                thresholds: {
                    slowCodeBlock: 200,       // More lenient
                    slowPageGeneration: 1000, // Complex pages
                },
                trackCodeBlocks: true, // Detailed stats
            },

            // ... other options
        }),
    ],
});
```

---

## Implementation Details

### PerformanceManager Class

**Location:** `plugin/src/performance-manager.ts`

**Key Methods:**

```typescript
export class PerformanceManager {
    private thresholds: Required<PerformanceThresholds>;

    constructor(
        private logger: Logger,
        thresholds?: PerformanceThresholds
    ) {
        this.thresholds = {
            ...DEFAULT_PERFORMANCE_THRESHOLDS,
            ...thresholds,
        };
    }

    /**
     * Mark a performance checkpoint
     */
    mark(name: string): void {
        performance.mark(name);
    }

    /**
     * Measure duration between two marks
     */
    measure(name: string, startMark: string, endMark: string): void {
        performance.measure(name, startMark, endMark);

        const measure = performance.getEntriesByName(name, "measure")[0];
        const duration = measure.duration;

        if (this.isSlow(name, duration)) {
            this.logger.warn(
                `⚠️  Slow operation: ${name} took ${duration.toFixed(0)}ms`
            );
        }

        this.logger.debug(`⏱️  ${name}: ${duration.toFixed(0)}ms`);
    }

    /**
     * Check if operation exceeds threshold
     */
    isSlow(operation: string, duration: number): boolean {
        if (operation.includes("code.block")) {
            return duration > this.thresholds.slowCodeBlock;
        }
        if (operation.includes("page.generate")) {
            return duration > this.thresholds.slowPageGeneration;
        }
        if (operation.includes("api.load")) {
            return duration > this.thresholds.slowApiLoad;
        }
        if (operation.includes("file.")) {
            return duration > this.thresholds.slowFileOperation;
        }
        if (operation.includes("http")) {
            return duration > this.thresholds.slowHttpRequest;
        }
        if (operation.includes("db.") || operation.includes("snapshot")) {
            return duration > this.thresholds.slowDbOperation;
        }
        return false;
    }
}
```

**Design Decisions:**

1. **Thin wrapper** - Delegates to native `performance` API for minimal overhead
2. **Pattern matching** - Uses string matching to determine operation type
3. **Immediate logging** - Logs as measurements complete for real-time feedback
4. **Threshold injection** - Accepts custom thresholds in constructor

### CodeBlockStatsCollector Class

**Location:**
`plugin/src/code-block-stats.ts`

**Key Methods:**

```typescript
export class CodeBlockStatsCollector {
    private totalBlocks = 0;
    private slowBlocks = 0;
    private totalTime = 0;
    private slowTime = 0;

    constructor(private slowThreshold: number = 100) {}

    /**
     * Record a code block rendering
     */
    recordBlock(duration: number): void {
        this.totalBlocks++;
        this.totalTime += duration;

        if (duration > this.slowThreshold) {
            this.slowBlocks++;
            this.slowTime += duration;
        }
    }

    /**
     * Log summary statistics
     */
    logSummary(logger: Logger): void {
        if (this.totalBlocks === 0) {
            return;
        }

        const avgTime = this.totalTime / this.totalBlocks;
        const slowPercent = (this.slowBlocks / this.totalBlocks) * 100;

        logger.info("📊 Code block performance:");
        logger.info(
            `   Total blocks: ${this.totalBlocks.toLocaleString()}`
        );
        logger.info(
            `   Slow blocks: ${this.slowBlocks} ` +
            `(${slowPercent.toFixed(1)}%, >${this.slowThreshold}ms)`
        );
        logger.info(
            `   Total time: ${(this.totalTime / 1000).toFixed(1)}s`
        );
        logger.info(
            `   Average: ${avgTime.toFixed(0)}ms per block`
        );

        if (this.slowBlocks > 0) {
            logger.info("");
            logger.info(
                `⚠️  Code block performance: ${this.slowBlocks} of ` +
                `${this.totalBlocks} blocks were slow ` +
                `(${slowPercent.toFixed(1)}%, >${this.slowThreshold}ms)`
            );
        }
    }
}
```

**Design Decisions:**

1. **Accumulation pattern** - Collects stats over entire build for summary
2. **Configurable threshold** - Accepts custom slow threshold in constructor
3. **Lazy logging** - Only logs summary at end of build
4. **Formatted output** - Human-readable numbers with locale formatting

### Integration Points

**plugin.ts:226-256** - Initialize PerformanceManager:

```typescript
const perfManager = new PerformanceManager(
    logger,
    options.performance?.thresholds
);
```

**plugin.ts:520-555** - Track page generation:

```typescript
perfManager.mark("page.generate.start");
// ... generate page ...
perfManager.mark("page.generate.end");
perfManager.measure(
    `page.generate.${category}`,
    "page.generate.start",
    "page.generate.end"
);
```

**remark-signature-block.ts:139** - Track code block rendering:

```typescript
const startTime = performance.now();
const html = await renderCodeToHtml(code, options);
const duration = performance.now() - startTime;

codeBlockStats.recordBlock(duration);

if (perfManager?.isSlow("code.block", duration)) {
    logger.debug(
        `⏱️  Slow code block: ${duration.toFixed(0)}ms ` +
        `(${code.length} chars)`
    );
}
```

---

## Testing Strategy

### Unit Tests

**Not yet implemented** - Future work includes:

1. **PerformanceManager tests:**
   - `isSlow()` correctly matches operation patterns
   - Custom thresholds override defaults
   - Mark and measure work correctly

2. **CodeBlockStatsCollector tests:**
   - Correctly accumulates statistics
   - Handles zero blocks gracefully
   - Formats output correctly
   - Respects custom thresholds

### Integration Tests

**Manual testing procedure:**

1. **Baseline build:**

   ```bash
   pnpm build
   ```

   - Verify timing logs appear at DEBUG level
   - Verify summary appears at VERBOSE level

2. **Custom threshold test:**

   ```typescript
   // Set very low threshold
   performance: {
       thresholds: {
           slowCodeBlock: 1,
       }
   }
   ```

   - Verify all blocks flagged as slow
   - Verify warnings appear

3. **Performance regression test:**

   ```bash
   # Run builds and compare times
   pnpm build > build1.log
   pnpm build > build2.log
   diff build1.log build2.log
   ```

   - Verify consistent performance
   - Verify no timing drift

---

## Future Enhancements

### 1. Hierarchical Metrics with Context Tracking

**Proposed:** Automatic context tagging for hierarchical statistics

**Benefits:**

- Compare performance across different APIs
- Identify version-specific bottlenecks
- Analyze category-specific slowness

**Implementation sketch:**

```typescript
export class PerformanceManager {
    private currentContext: MetricContext = {
        api: undefined,
        version: undefined,
        category: undefined,
    };

    setContext(context: Partial<MetricContext>): void {
        this.currentContext = { ...this.currentContext, ...context };
    }

    mark(name: string): void {
        performance.mark(name, {
            detail: { ...this.currentContext }
        });
    }
}
```

**See:** `.claude/design/rspress-plugin-api-extractor/
performance-observability-addendum.md` for full proposal

### 2. ~~Full Path Resolution in Logging~~ (Removed)

**Status:** Not implemented. PathResolver was considered but removed
during code simplification.

**Reasoning:**

- Logger already provides sufficient context with relative paths
- PathResolver added complexity without significant benefit
- Path formatting can be handled inline when needed

**Note:** This enhancement was removed from the codebase. See
code-simplifier session from 2026-01-17.

### 3. Performance Regression Detection

**Proposed:** Automated comparison with previous builds

**Benefits:**

- Detect performance regressions early
- Track performance trends over time
- CI/CD integration for blocking regressions

**Implementation approach:**

- Store performance metrics in JSON file
- Compare current build against baseline
- Fail build if metrics exceed threshold (e.g., 20% slower)

### 4. Flame Graph Export

**Proposed:** Export performance data in flame graph format

**Benefits:**

- Visual identification of bottlenecks
- Share performance profiles with team
- Detailed drill-down into slow operations

**Implementation approach:**

- Export marks/measures to speedscope format
- Generate SVG flame graphs
- Upload to performance tracking service

### 5. Performance Budgets

**Proposed:** Define performance budgets for operation types

**Benefits:**

- Enforce performance targets
- Prevent performance regressions
- Clear feedback when budgets exceeded

**Implementation example:**

```typescript
performance: {
    budgets: {
        totalBuildTime: 30000,      // 30s max
        avgPageGeneration: 100,     // 100ms avg
        slowCodeBlockPercent: 5,    // 5% max slow blocks
    }
}
```

---

## Appendix

### File Locations

| File | Purpose |
| --- | --- |
| `src/performance-manager.ts` | PerformanceManager class |
| `src/code-block-stats.ts` | CodeBlockStatsCollector class |
| `src/plugin.ts` | Integration points, initialization |
| `src/remark-signature-block.ts` | Code block tracking |

### Dependencies

- **Node.js Performance API** - Native performance measurement
- **Logger** - Output performance logs
- **Plugin options** - Configuration interface

### Related Documentation

- **Snapshot Tracking System:**
  `.claude/design/rspress-plugin-api-extractor/snapshot-tracking-system.md` -
  File change detection with performance tracking
- **Error Observability:**
  `.claude/design/rspress-plugin-api-extractor/error-observability.md` -
  Twoslash error tracking
- **Main Plugin README:** `plugin/README.md`
- **Package CLAUDE.md:** `plugin/CLAUDE.md`

#### External Resources

- Node.js Performance API:
  <https://nodejs.org/api/perf_hooks.html>
- Performance timing best practices:
  <https://web.dev/custom-metrics/>
- Flame graphs: <https://www.brendangregg.com/flamegraphs.html>

### Performance Optimization Tips

1. **Code blocks are the primary bottleneck:**
   - Shiki syntax highlighting: 60-80% of build time
   - Twoslash type inference: Adds 2-3x overhead
   - Minimize complex examples in documentation

2. **API model loading is usually fast:**
   - JSON parsing is efficient
   - Only optimize if exceeding 1s threshold
   - Consider splitting very large models

3. **File I/O is rarely a bottleneck:**
   - Modern SSDs make writes fast
   - Only optimize if exceeding 50ms threshold
   - Batch writes if possible

4. **Snapshot queries are negligible:**
   - SQLite with indexes is extremely fast
   - Only visible in DEBUG mode
   - No optimization needed
