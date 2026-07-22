---
status: current
module: rspress-plugin-api-extractor
category: observability
created: 2026-01-17
updated: 2026-07-22
last-synced: 2026-07-22
completeness: 90
related:
  - rspress-plugin-api-extractor/build-progress-and-issues.md
  - rspress-plugin-api-extractor/error-observability.md
  - rspress-plugin-api-extractor/build-architecture.md
  - rspress-plugin-api-extractor/snapshot-tracking-system.md
dependencies: []
---

# Performance Observability System Design

## Table of Contents

- [Overview](#overview)
- [EventBus: Synchronous Fan-Out](#eventbus-synchronous-fan-out)
- [PluginEvent Taxonomy](#pluginevent-taxonomy)
- [Correlation Envelope and Level Ladder](#correlation-envelope-and-level-ladder)
- [Four Sinks](#four-sinks)
- [Progress Heartbeat](#progress-heartbeat)
- [Span Substrate](#span-substrate)
- [Build Metrics](#build-metrics)
- [Build Summary](#build-summary)
- [Programmatic Stream Tee (Deferred)](#programmatic-stream-tee-deferred)
- [Sync-Island Bridge](#sync-island-bridge)
- [File Locations](#file-locations)

---

## Overview

Build observability is wired through a **synchronous fan-out EventBus** backed
by four sinks: a console sink (human-readable or JSON, level-filtered), an
issues sink (accumulates diagnostic events into the `.api-docs/build/issues.json`
artifact, production builds only), a full-fidelity JSONL trace sink (opt-in,
captures every event), and a metrics sink (translates events to `BuildMetrics`
counters and histograms).

The entire observability module lives under `package/src/observability/`. The
plugin creates the bus once during initialization and tears it down at the end
of `afterBuild`. A production-only progress heartbeat and the issues artifact
are documented in full in `build-progress-and-issues.md`; this document covers
the EventBus/sink/metrics substrate they ride on.

---

## EventBus: Synchronous Fan-Out

**Location:** `package/src/observability/EventBus.ts`

The `EventBus` is NOT an async PubSub. `emit` fans out to every registered
sink inline — by the time the emitting fiber resumes, all sinks have finished.
This keeps metrics exact when `logBuildSummary` reads them in `afterBuild`.

```typescript
interface EventBusShape {
  readonly emit: (event: PluginEvent) => Effect.Effect<void>;
  readonly wantsLevel: (level: EventLevel) => Effect.Effect<boolean>;
}

export class EventBus extends Context.Service<EventBus, EventBusShape>()(
  "rspress-plugin-api-extractor/EventBus"
) {}
```

`makeShape(sinks)` computes `maxAdmitted` as the highest-rank `minLevel` among
sinks that declare `capturesPayload: true` — sinks that actually serialize the
event. The trace sink always sets it; the console sink sets it only in JSON
mode (`capturesPayload: json`), since human-readable rendering does not
consume a structured payload. Scalar-only sinks such as the metrics sink omit
the flag, so callers are not forced to build an expensive string/JSON payload
just to bump a counter. `wantsLevel(level)` returns `true` when
`levelRank(level) <= maxAdmitted`, and `false` when no bus is in context.

Fan-out itself is unaffected by the flag: `emit` still delivers to every sink
whose `minLevel` admits the event's rank, so the metrics sink at
`minLevel: "trace"` sees everything regardless of `wantsLevel`.

The free `emit(event)` and `wantsLevel(level)` functions use
`Effect.serviceOption(EventBus)` and are no-ops when no bus is in context,
requiring `R = never` so they are safe to call from any effect.

`EventBusNoop` is `makeEventBusLayer([])` — useful in tests that do not want
observable side effects.

---

## PluginEvent Taxonomy

**Location:** `package/src/observability/events.ts`

`PluginEvent` is a `Data.TaggedEnum` with approximately 40 variants organized
across seven subsystems:

| Subsystem | Representative events |
| --------- | --------------------- |
| Lifecycle | `BuildStarted`, `BuildCompleted`, `BuildProgress`, `ApiDocsCompleted`, `PhaseStarted`, `PhaseCompleted`, `SlowOperation` |
| Config parse / merge | `OptionsDecoded`, `DefaultApplied`, `DeprecatedConfigUsed`, `ConfigResolved` |
| Model loading | `ModelLoaded`, `ModelLoadFailed` |
| Type loading / VFS | `VfsGenerated`, `ImportsPrepended`, `TypeRegistryEvent` |
| Multi-entry / routing | `EntryPointResolved`, `RouteCollisionDetected` |
| Page gen / code blocks | `PageGenerated`, `CodeBlockProcessed`, `TwoslashDiagnostic`, `TwoslashCheckFailed`, `PrettierError`, `ShikiError` |
| Write / snapshot / cleanup | `FileDecision`, `SnapshotUpdated`, `StaleFileRemoved`, `OrphanFileRemoved` |
| LLMs | `LlmsPackageFilesGenerated`, `LlmsGlobalFilesRewritten` |

`levelOf(event)` extracts `event.level`. Every variant carries a `level` field
of type `EventLevel`.

**Known limitation:** `BuildStarted.mode` is always `"prod"` regardless of
whether `rspress dev` or `rspress build` is running.

`BuildProgress` is emitted only by the production-only heartbeat fiber, not by
a build-stage emit site — see `build-progress-and-issues.md`. `RouteCollisionDetected`
and `ModelLoadFailed` were long present in the taxonomy but unemitted; they are
now emitted through new sync-island seams (`setBuildStagesEventEmitter`,
`setModelLoaderEventEmitter`) so they feed both the console sink and the issues
artifact — also documented there.

---

## Correlation Envelope and Level Ladder

### EventContext

Every event carries an `EventContext` envelope:

```typescript
interface EventContext {
  buildId: string;
  apiScope?: string;
  packageName?: string;
  version?: string;
  locale?: string;
  entryPoint?: string;
  route?: string;
  file?: string;
  symbol?: string;
}
```

All fields except `buildId` are optional — emit sites fill in what they know.

### Level Ladder

```text
none  — no console output
error (rank 0) — fatal and non-recoverable failures
warn  (rank 1) — degraded output, recoverable errors
info  (rank 2) — per-file and phase milestones
debug (rank 3) — all events with full payloads; activates JSON console mode
trace (rank 4) — fine-grained internals (e.g. TwoslashCheckFailed env snapshots)
```

`LEVEL_RANK` maps each level to its numeric rank. A sink with `minLevel: "info"`
admits events ranked 0–2 — lower rank means higher severity and always emitted.

`verbose` is accepted as a config input value and normalized to `debug` by
`resolveObservability`; it is not a valid `EventLevel`.

---

## Four Sinks

All four implement `EventSink` (`package/src/observability/sinks/types.ts`):

```typescript
interface EventSink {
  readonly minLevel: EventLevel;
  readonly handle: (event: PluginEvent) => void;
  /**
   * When true, this sink serializes event payloads. Only payload-capturing
   * sinks drive the `wantsLevel` hint (see makeShape above). Scalar-only
   * sinks (metrics) omit the field.
   */
  readonly capturesPayload?: boolean;
}
```

### Console Sink

**Location:** `package/src/observability/sinks/console-sink.ts`

`makeConsoleSink(logLevel, opts)` produces an `EventSink` with `minLevel` set
to the configured `logLevel`. When `logLevel === "none"` the threshold is `-1`
so no event passes.

Mode is selected by the sink's `json` option, which `buildEventBus` passes through as `{ json: obs.json }`. `resolveObservability` derives that flag from the level (`json: level === "debug"`), so in practice `debug` activates JSON mode — but the sink itself is level-agnostic and can be constructed with either mode at any level:

- **Human-readable mode** (default): `[HH:MM:SS] rendered-message`. `render(event)` switches on `_tag` to produce a one-liner per variant; unknown tags fall back to the bare `_tag`.
- **JSON mode** (`json: true`): `console.log(JSON.stringify({ timestamp, ...event }))`. Also sets `capturesPayload: true`.

### Issues Sink

**Location:** `package/src/observability/sinks/issues-sink.ts`

`makeIssuesSink()` returns an `EventSink & { snapshot: () => IssuesSnapshot }`. It accumulates a curated subset of diagnostic events (Twoslash, Prettier, Shiki, config-validation, route-collision, model-load-failure, build-failure) into in-memory `warnings`/`errors`/`suppressed` buckets. Collection is always-on (cheap); only the write to `.api-docs/build/issues.json` is gated by production and happens in `afterBuild`. Full schema, event-to-bucket mapping and the monitor that consumes the artifact are documented in `build-progress-and-issues.md`.

### Trace Sink

**Location:** `package/src/observability/sinks/trace-sink.ts`

`makeTraceSink(path)` returns
`EventSink & { flush: () => void; setPath: (p: string) => void }`.

- `minLevel: "trace"`, `capturesPayload: true` — captures every event regardless of console level.
- The trace path is now resolved eagerly at plugin-factory time — `resolveObservability` derives `<cwd>/.api-docs/build/trace-<buildId>.jsonl` from `cwd` (known at factory time, unlike the RSPress `outDir`), so `buildEventBus` always constructs the sink with a concrete path and it opens (creates the parent directory, truncates the file) immediately.
- `setPath` is retained on the returned sink but is no longer called anywhere in `plugin.ts`; the deferred-open mode it supports (construct without a path, bind one later) is unused now that the path no longer depends on RSPress's `outDir`.
- Calls `appendFileSync` per event (synchronous, nothing buffered).
- `flush()` is a no-op: sync appends mean nothing is held in memory.

The trace sink and console level are **independent**. Running at
`logLevel: "info"` with `trace: true` still writes every event to the JSONL
file; the console shows only `info`-and-above messages. See `build-progress-and-issues.md`
for the `.api-docs/` directory this trace file now lives in, alongside `issues.json`.

### Metrics Sink

**Location:** `package/src/observability/sinks/metrics-sink.ts`

`makeMetricsSink()` returns an `EventSink` with `minLevel: "trace"`. It
translates events to `BuildMetrics` via `Effect.runSync`. The fan-out is
synchronous, so metric counts are exact when `logBuildSummary` reads them.

| Event | Metric(s) updated |
| ----- | ----------------- |
| `FileDecision` | `filesTotal`, `filesNew` / `filesModified` / `filesUnchanged` |
| `PageGenerated` | `pagesGenerated` |
| `ApiDocsCompleted` | `apisCompleted` |
| `TwoslashDiagnostic` | `twoslashDiagnostics`, `twoslashErrors` |
| `PrettierError` | `prettierErrors` |
| `CodeBlockProcessed` | `codeblockTotal`, `codeblockDuration`, `codeblockShikiDuration` (if `shikiMs > 0`), `codeblockSlow` |
| `VfsGenerated` | `vfsFiles` |
| `ImportsPrepended` | `importsPrepended` |
| `PhaseCompleted` | `phaseDuration` |
| `DefaultApplied` | `configDefaultsApplied` |

Unmapped tags (including `ShikiError`) hit the `default` branch and are
silently ignored. See the inline-metrics note below.

**Not event-derived:** `externalPackagesTotal` and `apiVersionsLoaded` remain
inline `Metric.update` calls in `ConfigServiceLive`. The only candidate
event (`TypeRegistryEvent{BatchComplete}`) carries a `loaded` (succeeded) count,
not a configured count — deriving it here would change the metric's semantics.
`apisCompleted`, by contrast, IS event-derived: `plugin.ts` emits an
`ApiDocsCompleted` event via `Effect.tap` on each `generateApiDocs` result
inside the `Effect.forEach` over `apiConfigs`, and the metrics sink maps it to
`apisCompleted`. The heartbeat reads that counter for the generate-phase
denominator — see `build-progress-and-issues.md`.

---

## Progress Heartbeat

A production-only `forkScoped` fiber (`runHeartbeat`, `package/src/observability/heartbeat.ts`) emits a `BuildProgress` event on a timer so a long, silent build (many APIs, network fetches, hundreds of pages) does not read as hung. It rides the same EventBus as every other event — the console sink renders it via `formatProgress`, the trace sink records it, and the metrics sink ignores it. Full mechanism, configuration (`observability.progressInterval`) and rendered line format are documented in `build-progress-and-issues.md`.

The heartbeat only covers the `config()` doc-generation phase (`resolve` + `generate`) — it does not run during RSPress's own render pass, where Twoslash type-checking of code blocks is often the dominant cost on a large site. See the Known Limitations section of `build-progress-and-issues.md`.

---

## Span Substrate

**Location:** `package/src/observability/spans.ts`

Two helpers wrap Effects in `Effect.withSpan` and emit timing events:

### `withPhase(phase, ctx, effect, thresholds?)`

Emits `PhaseStarted` before and `PhaseCompleted` after. Measures wall-clock
duration. If duration exceeds the threshold for that phase, also emits
`SlowOperation`. Phase names map to threshold keys via `PHASE_THRESHOLD_KEY`:

| Phase | Threshold key |
| ----- | ------------- |
| `"modelLoad"`, `"resolve"` | `slowApiLoad` |
| `"generate"` | `slowPageGeneration` |
| `"write"` | `slowFileOperation` |
| `"cleanup"` | `slowDbOperation` |

### `withOp(operation, ctx, effect, threshold?)`

No phase events — emits `SlowOperation` only if duration exceeds `threshold`.
Used for sub-operation timing inside a phase.

Both helpers call `Effect.withSpan`, which creates OpenTelemetry-compatible
spans in the Effect fiber context. **No OTLP exporter is wired in the live
plugin.** The spans are a dormant seam for future integration.

---

## Build Metrics

**Location:** `package/src/layers/build-metrics.ts`

`BuildMetrics` is extracted from `ObservabilityLive.ts` into its own module to
avoid circular imports between the metrics sink and the layer that assembles
sinks. It provides Effect `Metric.counter` and `Metric.histogram` instances.

Under Effect v4 the `MetricBoundaries` module is gone — histogram boundaries
are passed inline as an options object:

```typescript
codeblockDuration: Metric.histogram("codeblock.duration", {
  boundaries: [10, 25, 50, 100, 200, 500, 1000],
}),
```

Updates use `Metric.update(metric, n)` (v3's `Metric.increment` /
`Metric.incrementBy` are gone). The counter and histogram state shapes read by
`logBuildSummary` via `Metric.value` are unchanged.

### Summary logger layer

`makeSummaryLoggerLayer(logLevel)` builds the slim Effect Logger that gates
residual `Effect.log*` calls. In v4 this is
`Layer.mergeAll(Logger.layer([pluginLogger]), Layer.succeed(References.MinimumLogLevel, effectLevel))`
— `Logger.minimumLogLevel` is replaced by setting the `References.MinimumLogLevel`
reference. v4's `LogLevel` is a plain string union (`"None" | "Error" | "Warn" |
"Info" | "Debug" | ...`; note `"Warn"`, not v3's `"Warning"`), and the logger
receives its `message` as an **args array**, which `pluginLogger` joins before
formatting.

---

## Build Summary

**Location:** `package/src/layers/ObservabilityLive.ts`

`logBuildSummary` is an Effect program that reads all metric snapshots and logs
a human-readable summary. It is called once in `afterBuild` (skipped on HMR
rebuilds). The summary covers file counts (new/modified/unchanged), pages and
external packages, phase timing, slow code blocks, and Twoslash/Prettier error
totals.

`buildEventBus(obs)` composes sinks into a layer:

```typescript
function buildEventBus(obs: ResolvedObservability): BuiltSinks {
  const issues = makeIssuesSink();
  const sinks: EventSink[] = [
    makeConsoleSink(obs.logLevel, { json: obs.json }),
    makeMetricsSink(),
    issues,
  ];
  const trace = obs.tracePath ? makeTraceSink(obs.tracePath) : null;
  if (trace) sinks.push(trace);
  return { layer: makeEventBusLayer(sinks), trace, issues };
}
```

`obs.tracePath` is always resolved eagerly now (see [Trace Sink](#trace-sink)), so there is no deferred-path parameter to thread through — the earlier `traceIsDefault` flag and the corresponding `setPath` rebind in `plugin.ts`'s `config()` hook are gone.

`BuiltSinks.trace` is retained at the plugin level so `afterBuild` can call
`trace.flush()` before disposing the runtime. `BuiltSinks.issues` is retained
so `afterBuild` (and the `config()` catch block, on a fatal build) can read
`issues.snapshot()` and write `.api-docs/build/issues.json` — see
`build-progress-and-issues.md`.

---

## Programmatic Stream Tee (Deferred)

**Location:** `package/src/observability/stream.ts`

`makeStreamSink()` creates a bounded sliding `Queue<PluginEvent>` (capacity
1024). The returned `EventSink` offers events into the queue; when full, the
oldest entry is dropped. The companion `stream` drains events as a
`Stream.Stream<PluginEvent>`.

**This sink is NOT wired into the live plugin.** To use it, export the sink
from `makeStreamSink` and pass it to `makeEventBusLayer` at the call site.

---

## Sync-Island Bridge

**Location:** `package/src/observability/EventBus.ts`

`makeRuntimeEmitter(runtime)` creates a synchronous bridge for callbacks that
fire outside any Effect fiber:

```typescript
const emitSync = makeRuntimeEmitter(effectRuntime);
// (event: PluginEvent) => void — calls runtime.runSync(emit(event))
```

The Twoslash transformer and Prettier formatter each maintain a module-level
`emitEvent` variable (default: no-op) that `plugin.ts` wires via
`setEventEmitter(emitSync)` right after creating the runtime emitter. Error
events flow through `emitEvent` and into the normal fan-out path. See
`error-observability.md` for how the error variants are handled.

The same pattern now also covers two previously-silent emit sites:
`setBuildStagesEventEmitter` (`build-stages.ts`, detect-emit-throw at the
route-collision check) and `setModelLoaderEventEmitter` (`model-loader.ts`,
emit-then-rethrow on a failed model load). Both `RouteCollisionDetected` and
`ModelLoadFailed` existed in the taxonomy from the start but had no emit site
until these seams were added; see `build-progress-and-issues.md`.

---

## File Locations

| File | Purpose |
| ---- | ------- |
| `src/observability/events.ts` | `PluginEvent` taggedEnum, `EventLevel`, `LEVEL_RANK`, `EventContext`, `levelOf` |
| `src/observability/EventBus.ts` | `EventBus` tag, `makeShape`, `makeEventBusLayer`, `emit`, `wantsLevel`, `makeRuntimeEmitter`, `EventBusNoop` |
| `src/observability/sinks/types.ts` | `EventSink` interface |
| `src/observability/sinks/console-sink.ts` | Level-filtered console output (human-readable or JSON) |
| `src/observability/sinks/trace-sink.ts` | Full-fidelity JSONL file sink |
| `src/observability/sinks/metrics-sink.ts` | Event-to-BuildMetrics translation |
| `src/observability/sinks/issues-sink.ts` | Issues collector sink, `eventToIssue`, `writeIssuesJson` — see `build-progress-and-issues.md` |
| `src/observability/heartbeat.ts` | Progress heartbeat fiber, `BuildProgress` event builder, `formatProgress` — see `build-progress-and-issues.md` |
| `src/observability/spans.ts` | `withPhase`, `withOp`, `PHASE_THRESHOLD_KEY` |
| `src/observability/stream.ts` | Best-effort sliding-queue stream tee (exported, not wired) |
| `src/layers/build-metrics.ts` | `BuildMetrics` counters and histograms |
| `src/layers/ObservabilityLive.ts` | `buildEventBus`, `BuiltSinks`, `logBuildSummary` |
| `src/schemas/observability.ts` | `ObservabilityConfig`, `ResolvedObservability`, `resolveObservability` |

---

## Related Documentation

- **Build Progress & Issues Artifact:** `build-progress-and-issues.md` — the progress heartbeat (and its known coverage gap), the `.api-docs/build/issues.json` artifact and its monitor
- **Error Observability:** `error-observability.md` — how Twoslash and Prettier errors flow through the bus
- **Build Architecture:** `build-architecture.md` — plugin structure and service layer
- **Snapshot Tracking System:** `snapshot-tracking-system.md` — `FileDecision` events and file-write metrics
