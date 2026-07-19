---
status: current
module: rspress-plugin-api-extractor
category: observability
created: 2026-01-17
updated: 2026-07-14
last-synced: 2026-07-14
completeness: 90
related:
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
- [Three Sinks](#three-sinks)
- [Span Substrate](#span-substrate)
- [Build Metrics](#build-metrics)
- [Build Summary](#build-summary)
- [Programmatic Stream Tee (Deferred)](#programmatic-stream-tee-deferred)
- [Sync-Island Bridge](#sync-island-bridge)
- [File Locations](#file-locations)

---

## Overview

Build observability is wired through a **synchronous fan-out EventBus** backed
by three sinks: a console sink (human-readable or JSON, level-filtered), a
full-fidelity JSONL trace sink (opt-in, captures every event), and a metrics
sink (translates events to `BuildMetrics` counters and histograms).

The entire observability module lives under `package/src/observability/`. The
plugin creates the bus once during initialization and tears it down at the end
of `afterBuild`.

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
| Lifecycle | `BuildStarted`, `BuildCompleted`, `PhaseStarted`, `PhaseCompleted`, `SlowOperation` |
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

## Three Sinks

All three implement `EventSink` (`package/src/observability/sinks/types.ts`):

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

### Trace Sink

**Location:** `package/src/observability/sinks/trace-sink.ts`

`makeTraceSink(initialPath?)` returns
`EventSink & { flush: () => void; setPath: (p: string) => void }`.

- `minLevel: "trace"`, `capturesPayload: true` — captures every event regardless of console level.
- **Eager mode** (`initialPath` supplied, i.e. an explicit `trace: "/some/path"` config): creates the parent directory and truncates the file at construction.
- **Deferred mode** (`initialPath` omitted): events are silently dropped until `setPath(p)` is called, which opens and truncates the file. This exists because the plugin factory runs before RSPress's real `outDir` is known — when the trace path was derived from a *guessed* outDir, the sink is created deferred so no stray empty file is written to the wrong location, and `plugin.ts` calls `trace.setPath(realPath)` in the `config()` hook once `_config.outDir` is available.
- Calls `appendFileSync` per event (synchronous, nothing buffered).
- `flush()` is a no-op: sync appends mean nothing is held in memory.

The trace sink and console level are **independent**. Running at
`logLevel: "info"` with `trace: true` still writes every event to the JSONL
file; the console shows only `info`-and-above messages.

### Metrics Sink

**Location:** `package/src/observability/sinks/metrics-sink.ts`

`makeMetricsSink()` returns an `EventSink` with `minLevel: "trace"`. It
translates events to `BuildMetrics` via `Effect.runSync`. The fan-out is
synchronous, so metric counts are exact when `logBuildSummary` reads them.

| Event | Metric(s) updated |
| ----- | ----------------- |
| `FileDecision` | `filesTotal`, `filesNew` / `filesModified` / `filesUnchanged` |
| `PageGenerated` | `pagesGenerated` |
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

`buildEventBus(obs, traceIsDefault?)` composes sinks into a layer:

```typescript
function buildEventBus(
  obs: ResolvedObservability,
  traceIsDefault = false,
): BuiltSinks {
  const sinks: EventSink[] = [
    makeConsoleSink(obs.logLevel, { json: obs.json }),
    makeMetricsSink(),
  ];
  const trace = obs.tracePath
    ? makeTraceSink(traceIsDefault ? undefined : obs.tracePath)
    : null;
  if (trace) sinks.push(trace);
  return { layer: makeEventBusLayer(sinks), trace };
}
```

`traceIsDefault` marks a trace path derived from the *guessed* outDir at
factory time. In that case the trace sink is created in deferred mode (no
`initialPath`) and `plugin.ts` binds the real path with `trace.setPath(...)`
in the `config()` hook. An explicitly configured path opens eagerly.

`BuiltSinks.trace` is retained at the plugin level so `config()` can call
`setPath` and `afterBuild` can call `trace.flush()` before disposing the
runtime.

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
| `src/observability/spans.ts` | `withPhase`, `withOp`, `PHASE_THRESHOLD_KEY` |
| `src/observability/stream.ts` | Best-effort sliding-queue stream tee (exported, not wired) |
| `src/layers/build-metrics.ts` | `BuildMetrics` counters and histograms |
| `src/layers/ObservabilityLive.ts` | `buildEventBus`, `BuiltSinks`, `logBuildSummary` |
| `src/schemas/observability.ts` | `ObservabilityConfig`, `ResolvedObservability`, `resolveObservability` |

---

## Related Documentation

- **Error Observability:** `error-observability.md` — how Twoslash and Prettier errors flow through the bus
- **Build Architecture:** `build-architecture.md` — plugin structure and service layer
- **Snapshot Tracking System:** `snapshot-tracking-system.md` — `FileDecision` events and file-write metrics
