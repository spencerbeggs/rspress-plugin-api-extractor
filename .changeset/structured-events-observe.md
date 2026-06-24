---
"rspress-plugin-api-extractor": minor
---

## Features

### Observability config block

A new top-level `observability` option consolidates all build-output controls into one place.

```ts
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

export default ApiExtractorPlugin({
  observability: {
    logLevel: "info",       // "none" | "error" | "warn" | "info" | "debug" | "trace"
    trace: true,            // write a JSONL trace artifact; or pass a custom path string
    thresholds: {
      slowCodeBlock: 100,   // ms — slow code-block threshold for build summary
      slowPageGeneration: 500,
    },
  },
  // ...
});
```

- **`logLevel`** — `none | error | warn | info | debug | trace` level ladder. Filters console output. The `LOG_LEVEL` environment variable takes precedence when set.
- **`trace`** — opt-in JSONL trace artifact. Pass `true` to write to `<outDir>/.api-extractor/trace-<buildId>.jsonl`, or a string path to write to a custom location. Useful for diagnosing slow builds — every plugin event is recorded at full fidelity, independent of the console log level.
- **`thresholds`** — slow-operation thresholds (ms) for the build summary: `slowCodeBlock`, `slowPageGeneration`, `slowApiLoad`, `slowFileOperation`, `slowHttpRequest`, `slowDbOperation`. Defaults are 100 ms for code blocks, 500 ms for pages, and so on.

The build summary now reports per-phase timing and previously-unreported counts (LLMs post-processing, snapshot commits, stale-file deletions).

### Deprecations

The top-level `logLevel` and `performance` options are deprecated in favor of `observability.logLevel` and `observability.thresholds`. They continue to work — existing configs require no changes. When both the old and new keys are set, `observability` wins. Using a deprecated key emits a notice at build time pointing to the replacement.
