---
status: current
module: rspress-plugin-api-extractor
category: observability
created: 2026-07-22
updated: 2026-07-22
last-synced: 2026-07-22
completeness: 90
related:
  - rspress-plugin-api-extractor/performance-observability.md
  - rspress-plugin-api-extractor/error-observability.md
  - rspress-plugin-api-extractor/build-architecture.md
dependencies: []
---

# Build Progress Heartbeat and Issues Artifact

## Table of Contents

- [Overview](#overview)
- [The `.api-docs/` Artifact Directory](#the-api-docs-artifact-directory)
- [Progress Heartbeat](#progress-heartbeat)
- [Issues Artifact](#issues-artifact)
- [Monitor](#monitor)
- [Known Limitations and Future Work](#known-limitations-and-future-work)
- [File Locations](#file-locations)

## Overview

On a large multi-API docs site the production build can run for minutes inside the plugin's `config()` hook with no console output between `BuildStarted` and `BuildCompleted` — at scale this reads as a hang. Separately, Twoslash/Prettier/Shiki diagnostics were only ever rendered to the console, with no durable, machine-readable record an agent could read to locate and fix broken examples.

Both gaps are closed by riding the existing `EventBus` / sink architecture (`performance-observability.md`) rather than adding a new logging path: a production-only heartbeat fiber emits a periodic `BuildProgress` event, and a fourth sink accumulates diagnostic events into a `.api-docs/build/issues.json` artifact that a background monitor in the api-docs Claude Code plugin (`plugin/`) surfaces. Both features are **production-only** — gated on the real `isProd` flag RSPress passes into the `config(config, utils, isProd)` hook (`package/src/plugin.ts`), not a `NODE_ENV` heuristic.

## The `.api-docs/` Artifact Directory

`<cwd>/.api-docs/` holds all of the plugin's on-disk artifacts, split into two lifecycle subfolders that reflect whether the file is worth persisting across builds:

```text
.api-docs/
├── snapshot/
│   ├── api-docs.db          # the incremental-build DB (see snapshot-tracking-system.md)
│   ├── api-docs.db-wal      # SQLite WAL sidecar (checkpointed away on clean shutdown)
│   └── api-docs.db-shm      # SQLite shared-memory sidecar
└── build/
    ├── issues.json          # prod builds only, stable name, overwritten each build
    └── trace-<buildId>.jsonl # the EventBus trace sink's JSONL output
```

`snapshot/` holds the **one** artifact a production consumer site may choose to commit for CI/local build idempotency — the snapshot DB (`<cwd>/.api-docs/snapshot/api-docs.db`, previously `<cwd>/api-docs.db`). `build/` holds everything regenerated fresh on every build and never worth persisting: `issues.json` and the opt-in trace JSONL. The plugin `mkdirSync`s `.api-docs/snapshot/` at factory time, before `SnapshotServiceLive` opens the SQLite client — unlike `cwd`, this nested path is not guaranteed to exist and SQLite does not create intermediate directories itself.

The trace JSONL moved here (originally from `<outDir>/.api-extractor/`, then briefly `<cwd>/.api-docs/trace-<buildId>.jsonl` before the `build/` split). Because `cwd` (unlike RSPress's `outDir`) is known at plugin-factory time, `resolveObservability` (`schemas/observability.ts`) derives the trace path eagerly — `${cwd}/.api-docs/build/trace-${buildId}.jsonl` when `observability.trace: true` — and `buildEventBus` opens the file immediately. This removed the trace sink's deferred-open mode (construct without a path, `setPath()` it once RSPress's real `outDir` was known in `config()`); see `performance-observability.md`'s Trace Sink section for what remains of that mechanism as dead code.

### Gitignore story

This repo's fixture sites never commit the snapshot DB, so the root `.gitignore` ignores the whole directory in one line: `.api-docs/`.

A production consumer site that wants the DB idempotency benefit instead splits the ignore: gitignore `.api-docs/build/` plus the WAL sidecars `.api-docs/snapshot/*.db-wal` and `.api-docs/snapshot/*.db-shm` (both are checkpointed away by the `wal_checkpoint(TRUNCATE)` scope finalizer after a clean production-build shutdown, so the committed directory settles to just `api-docs.db`), then commits `.api-docs/snapshot/`.

## Progress Heartbeat

**Location:** `package/src/observability/heartbeat.ts`

### Mechanism

`plugin.ts`'s `config()` hook holds a shared `Ref<ProgressPhase>` (`"resolve" | "generate" | "done"`), set to `"resolve"` before `ConfigService.resolve()`, flipped to `"generate"` before the `Effect.forEach` over `apiConfigs`, and to `"done"` once that completes. When `isProd && obs.progressIntervalMs !== null`, a heartbeat fiber is forked with `Effect.forkScoped` inside the same `Effect.scoped` block that runs the rest of the build program: `runHeartbeat` loops **sleep-first** — wait `intervalMs`, read the phase Ref, read the current metric snapshot, emit a `BuildProgress` event, repeat — so a build that finishes before the first interval elapses emits zero ticks (the self-suppression for small sites, with no separate threshold logic). The loop exits as soon as it reads `"done"`, and scope close on either success or failure interrupts the fiber cleanly, so there is never an orphan tick after the completion or failure line.

### Data read each tick

`readCounts` (an `Effect.Effect<ProgressCounts>`) reads five `BuildMetrics` counters into a `ProgressCounts` snapshot: `vfsFiles`, `externalPackages` (`externalPackagesTotal`), `apisCompleted`, `pages` (`pagesGenerated`), `codeBlocks` (`codeblockTotal`). `makeProgressEvent` diffs the current snapshot against the previous tick's to compute a phase-appropriate `delta` — `vfsFiles` delta during `resolve`, `pages` delta during `generate` — the "still moving" signal a stalled build would show as `(+0)`.

The **resolve** phase intentionally does not report `N/18 models` against a model-count denominator: the model-load loop runs at `concurrency: "unbounded"` with no clean per-model completion signal, so the heartbeat instead reports the honest moving `vfsFiles` counter (VFS declaration files generated during type resolution) plus its delta. The **generate** phase does have a clean denominator — `apisCompleted`/`apisTotal`, backed by the new `BuildMetrics.apisCompleted` counter, which is driven by an `ApiDocsCompleted` event emitted via `Effect.tap` on each `generateApiDocs` result inside the `Effect.forEach` and mapped to the counter in the metrics sink.

### Event and rendering

`BuildProgress` (added to the `PluginEvent` taxonomy, level `info`) carries `phase`, `elapsedMs`, `vfsFiles`, `externalPackages`, `apisCompleted`, `apisTotal`, `pages`, `codeBlocks` and `delta`. `formatProgress` (pure, in `heartbeat.ts`) renders one line per phase:

```text
resolve:   API docs · resolving types · 11 files · 4 pkgs · 10s (+6 files)
generate:  API docs · 9/18 APIs · 402 pages · 918 blocks · 30s (+171 pages)
```

The console sink dispatches `BuildProgress` to `formatProgress` (`console-sink.ts`); the trace sink records the full payload; the metrics sink ignores it (hits the `default` branch — see `performance-observability.md`).

### Configuration

`observability.progressInterval` (`schemas/observability.ts`) accepts a number of seconds or `false`; it resolves to `ResolvedObservability.progressIntervalMs`, defaulting to `10_000`, with `false` or `0` resolving to `null` (heartbeat disabled). The heartbeat only forks when `isProd` is true — it never runs in dev/HMR builds.

## Issues Artifact

### Collector sink

**Location:** `package/src/observability/sinks/issues-sink.ts`

`makeIssuesSink()` is the fourth EventBus sink (alongside console, metrics and trace — see `performance-observability.md`). It is always registered by `buildEventBus` (collection is cheap and side-effect-free); only the **write** to disk is gated by production. The pure `eventToIssue(event)` maps a curated subset of diagnostic `PluginEvent` variants to a typed `Issue`, and the bucket it belongs in:

| Event | Bucket | `source` | `code` |
| --- | --- | --- | --- |
| `TwoslashDiagnostic` | `warnings` | `twoslash` | `TS<code>` |
| `TwoslashCheckFailed` | `warnings` | `twoslash` | `TS<code>` |
| `PrettierError` | `warnings` | `prettier` | `prettier` |
| `ShikiError` | `warnings` | `shiki` | `shiki` |
| `ConfigValidationWarning` | `warnings` | `config` | `config-validation` |
| `RouteCollisionDetected` | `errors` | `routing` | `route-collision` |
| `ModelLoadFailed` | `errors` | `model` | `model-load-failed` |
| `BuildFailed` | `errors` | `build` | `build-failed` |

Every other event tag returns `null` from `eventToIssue` and is not collected. The `suppressed` bucket is schema-reserved but always empty — no event in the current stream distinguishes a diagnostic silenced by `suppressExampleErrors` / `@noErrors` from one that surfaced, so there is nothing to route into it yet.

### Newly-emitted events

`RouteCollisionDetected` and `ModelLoadFailed` existed in the `PluginEvent` taxonomy from early on but had no emit site — this work added one to each, following the same sync-island pattern as the Twoslash/Prettier error flow (`error-observability.md`):

- `setBuildStagesEventEmitter` (`build-stages.ts`) — the route-collision check now emits `RouteCollisionDetected` before throwing.
- `setModelLoaderEventEmitter` (`model-loader.ts`) — a failed model load now emits `ModelLoadFailed` before rethrowing.

Both seams are wired in `plugin.ts` immediately after the runtime emitter is created, alongside the existing Twoslash/Prettier/OG/remark seams.

### Schema

`writeIssuesJson(snapshot, opts)` (Effect, requires `FileSystem.FileSystem`) serializes an `IssuesSnapshot` to `<cwd>/.api-docs/build/issues.json`, matching `@savvy-web/bundler`'s `issues.json` shape field-for-field so tooling is shared between the two artifacts:

```jsonc
{
  "generatedAt": "2026-07-22T16:02:35.486Z",
  "package": "@effected/website",
  "target": "prod",
  "warnings": [
    {
      "source": "twoslash",
      "level": "warn",
      "text": "Cannot find name 'ZodType'.",
      "code": "TS2304",
      "file": "api/class/schema.mdx",
      "line": 12,
      "column": 8,
      "api": "@effect/schema"
    }
  ],
  "errors": [],
  "suppressed": []
}
```

`source`/`level`/`text`/`code`/`file`/`line`/`column` match the bundler artifact exactly. The optional `api` field is this artifact's one addition — it carries per-scope attribution (`event.ctx.packageName`) that a multi-API docs site needs but a single-package bundler build does not.

### Write path

`writeIssuesJson` is called from two places in `plugin.ts`, both gated on `isProd`:

- **`afterBuild`**, alongside `logBuildSummary`, on the first build only (skipped on HMR rebuilds) — the normal path.
- **The `config()` `catch` block**, best-effort, when the build program throws. `afterBuild` never runs on a fatal `config()` failure, so without this second write path a `RouteCollisionDetected` or `ModelLoadFailed` event emitted just before the throw would never reach disk. The write is wrapped so a failure here can never mask the original build error — it is swallowed silently and the original error is still rethrown.

## Monitor

**Location:** `plugin/monitors/watch-issues.mjs`, registered in `plugin/monitors/monitors.json` as `doc-build-issues`.

A background monitor in the api-docs Claude Code plugin polls `**/.api-docs/build/issues.json` (excluding `node_modules`) every 2 seconds and prints one notification line per site once its issue count **settles** at a non-zero value. The debounce shape is reused from `savvy-web/systems`' silk `watch-issues.mjs`:

- a self-scheduling poll loop (not `setInterval`), so ticks never overlap;
- a stable-streak counter per file path — a count still changing build-to-build (a build or a fixing agent in flight) is held back until it holds steady for `minStablePolls` polls (env-tunable via `API_DOCS_MONITOR_STABLE_POLLS`, default 3; `--once` mode uses 0);
- notify-once dedup keyed on the settled count, cleared when the count returns to zero.

The pure step function `diagnose(current, prev, minStablePolls)` implements the debounce and is exported for testing (`plugin/__test__/watch-issues.bats`, `--once` mode against fixture `.api-docs/` directories). It counts every entry across `warnings` + `errors` (both are "doc-build issues" for this monitor's purposes — Twoslash `TS`-coded entries are the common case, but Prettier/Shiki/routing/model failures count too) and notifies with a line pointing at the fix path:

```text
docs: @site/x has 1 doc-build issue in prod — read .api-docs/build/issues.json and fix the examples (dispatch the rspress-docs agent for the affected package); if a build or fixing agent is already in flight, let it finish before acting on this line
```

The existing silk monitor watches `**/dist/{dev,prod}/issues.json`; this monitor's glob (`**/.api-docs/build/issues.json`) never overlaps it, so the two do not double-report the same artifact.

## Known Limitations and Future Work

### The heartbeat does not cover the phase where Twoslash dominates build time

A production build of a large consumer site (`effected/website`, 22 APIs) surfaced this gap. The build log showed the `config()` doc-generation phase — the phase the heartbeat is scoped to — completing in roughly 2 seconds (`Generating API documentation (22 APIs)…` → `API documentation complete (2.05s)`), then RSPress's own build running for over 3 minutes (`ready built in 3m 20.6s (node_md)`), with the end-of-build summary reporting 184 of 184 code blocks as slow (>500ms).

Doc generation — writing the `.mdx` files in `config()` — is fast. The multi-minute cost is RSPress/Rspack's `node_md` render pass invoking `remarkWithApi` / `remarkApiCodeblocks`, which run Twoslash type-checking on the code blocks. That render pass runs *after* `config()` returns, once the `Effect.scoped` block hosting the heartbeat fiber has already been torn down, so the heartbeat as built cannot show progress during the actual hang — it only covers doc generation (and a slow cold-cache type resolve). `CodeBlockProcessed` events are still emitted during the render phase (that is how the summary counts 184 blocks), so the metrics sink sees everything, but nothing ticks live to the console while it happens.

A future improvement would add a live progress ticker to the render phase, driven by the same `CodeBlockProcessed` counts. Two open questions block that work:

- **RSPress's render process model** — whether the `node_md` render pass runs on the main process or inside Rspack worker threads determines whether a main-process ticker could observe the counters live, or whether progress would need to cross a worker boundary.
- **Unknown denominator** — the resolve/generate heartbeat reports a moving count against a known-or-approximable total (files resolved, APIs completed); the render phase has no equivalent upfront total, since the number of code blocks across all generated pages is not known until they have all been rendered. A render-phase ticker could report a moving count but not a completion fraction without solving this first.

This is a real observability gap, not a nice-to-have: on a large site the heartbeat's silence during the phase that actually dominates build time can still read as a hang.

## File Locations

| File | Purpose |
| --- | --- |
| `src/observability/heartbeat.ts` | `ProgressCounts`, `ProgressPhase`, `readCounts`, `makeProgressEvent`, `formatProgress`, `runHeartbeat` |
| `src/observability/events.ts` | `BuildProgress`, `RouteCollisionDetected`, `ModelLoadFailed` variants |
| `src/observability/sinks/issues-sink.ts` | `Issue`, `IssuesSnapshot`, `eventToIssue`, `makeIssuesSink`, `writeIssuesJson` |
| `src/observability/sinks/console-sink.ts` | Renders `BuildProgress` via `formatProgress` |
| `src/layers/build-metrics.ts` | `apisCompleted` counter |
| `src/layers/ObservabilityLive.ts` | `buildEventBus` wiring the issues sink + eager trace path |
| `src/schemas/observability.ts` | `progressInterval` → `progressIntervalMs` resolution, eager `tracePath` derivation |
| `src/build-stages.ts` | `setBuildStagesEventEmitter`, `RouteCollisionDetected` emit site |
| `src/model-loader.ts` | `setModelLoaderEventEmitter`, `ModelLoadFailed` emit site |
| `src/plugin.ts` | Real `isProd` threading, phase `Ref`, heartbeat fork, issues write (`afterBuild` + fatal-path `catch`) |
| `plugin/monitors/monitors.json` | Registers the `doc-build-issues` monitor |
| `plugin/monitors/watch-issues.mjs` | Poll loop, `diagnose` debounce, notification copy |

## Related Documentation

- **Performance Observability:** `performance-observability.md` — the EventBus/sink/metrics substrate this subsystem rides on
- **Error Observability:** `error-observability.md` — the Twoslash/Prettier error flow this subsystem extends with two new emit sites
- **Build Architecture:** `build-architecture.md` — the `config()`/`afterBuild` lifecycle hooks this subsystem wires into
- **Snapshot Tracking System:** `snapshot-tracking-system.md` — the `api-docs.db` snapshot DB, now nested under `.api-docs/snapshot/` alongside the `build/` artifacts this document covers
