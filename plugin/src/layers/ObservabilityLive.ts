import { Effect, Layer, LogLevel, Logger, Metric } from "effect";
import { makeEventBusLayer } from "../observability/EventBus.js";
import type { EventLevel } from "../observability/events.js";
import { makeConsoleSink } from "../observability/sinks/console-sink.js";
import { makeMetricsSink } from "../observability/sinks/metrics-sink.js";
import { makeTraceSink } from "../observability/sinks/trace-sink.js";
import type { EventSink } from "../observability/sinks/types.js";
import type { ResolvedObservability } from "../schemas/observability.js";
import { BuildMetrics } from "./build-metrics.js";

export { BuildMetrics } from "./build-metrics.js";

function formatTime(date: Date): string {
	return date.toTimeString().slice(0, 8);
}

/**
 * A slim Effect Logger layer that gates the residual `Effect.log*` calls in
 * `build-program.ts` and `logBuildSummary` at the configured level.
 *
 * Level mapping: none→None, error→Error, warn→Warning, info→Info,
 * debug/trace→Debug.  Format: `[HH:MM:SS] <prefix><message>` with
 * `⚠️  ` / `🔴 ` prefixes for Warning / Error to match the EventBus
 * console-sink style.
 */
export function makeSummaryLoggerLayer(logLevel: EventLevel | "none"): Layer.Layer<never> {
	const effectLevel =
		logLevel === "none"
			? LogLevel.None
			: logLevel === "error"
				? LogLevel.Error
				: logLevel === "warn"
					? LogLevel.Warning
					: logLevel === "info"
						? LogLevel.Info
						: LogLevel.Debug; // debug | trace

	const pluginLogger = Logger.make(({ logLevel: lvl, message, date }) => {
		const time = formatTime(date);
		const msg = typeof message === "string" ? message : String(message);
		const prefix = lvl._tag === "Warning" ? "⚠️  " : lvl._tag === "Error" ? "🔴 " : "";
		console.log(`[${time}] ${prefix}${msg}`);
	});

	return Layer.mergeAll(Logger.replace(Logger.defaultLogger, pluginLogger), Logger.minimumLogLevel(effectLevel));
}

export interface BuiltSinks {
	readonly layer: ReturnType<typeof makeEventBusLayer>;
	readonly trace: (EventSink & { flush: () => void; setPath: (p: string) => void }) | null;
}

/**
 * Compose the console + metrics (+ optional trace) sinks into an EventBus layer.
 *
 * When `traceIsDefault` is true the trace path was derived from the guessed
 * outDir at factory time.  In that case we create the sink in deferred mode
 * (no `initialPath`) so no stray empty file is written to the guessed path;
 * `plugin.ts` must call `trace.setPath(realPath)` in the `config()` hook once
 * the real RSPress `outDir` is known.
 *
 * When `traceIsDefault` is false the caller supplied an explicit path string,
 * so we open the file eagerly (existing behaviour).
 */
export function buildEventBus(obs: ResolvedObservability, traceIsDefault = false): BuiltSinks {
	const sinks: EventSink[] = [makeConsoleSink(obs.logLevel, { json: obs.json }), makeMetricsSink()];
	const trace = obs.tracePath ? makeTraceSink(traceIsDefault ? undefined : obs.tracePath) : null;
	if (trace) sinks.push(trace);
	return { layer: makeEventBusLayer(sinks), trace };
}

/**
 * Log a build summary by reading all metric snapshots.
 * Accepts the configured slow-codeblock threshold so the warning message
 * interpolates the actual threshold rather than a hard-coded 100ms.
 * Replaces the 4 separate logSummary() calls in afterBuild.
 */
export const logBuildSummary = (slowCodeBlockMs: number) =>
	Effect.gen(function* () {
		const filesTotal = yield* Metric.value(BuildMetrics.filesTotal);
		const filesNew = yield* Metric.value(BuildMetrics.filesNew);
		const filesModified = yield* Metric.value(BuildMetrics.filesModified);
		const filesUnchanged = yield* Metric.value(BuildMetrics.filesUnchanged);
		const twoslashErrors = yield* Metric.value(BuildMetrics.twoslashErrors);
		const prettierErrors = yield* Metric.value(BuildMetrics.prettierErrors);
		const codeblockTotal = yield* Metric.value(BuildMetrics.codeblockTotal);
		const codeblockSlow = yield* Metric.value(BuildMetrics.codeblockSlow);
		const pagesGenerated = yield* Metric.value(BuildMetrics.pagesGenerated);
		const externalPackages = yield* Metric.value(BuildMetrics.externalPackagesTotal);
		const phaseDurationSnapshot = yield* Metric.value(BuildMetrics.phaseDuration);

		const total = filesTotal.count;
		const newCount = filesNew.count;
		const modified = filesModified.count;
		const unchanged = filesUnchanged.count;
		const tsErrors = twoslashErrors.count;
		const prErrors = prettierErrors.count;
		const blocks = codeblockTotal.count;
		const slowBlocks = codeblockSlow.count;

		// File summary
		if (total === 0) {
			yield* Effect.log("📝 No files generated");
		} else if (newCount === 0 && modified === 0) {
			yield* Effect.log(`📝 ${total} files (all unchanged)`);
		} else {
			const parts: string[] = [];
			if (newCount > 0) parts.push(`${newCount} new`);
			if (modified > 0) parts.push(`${modified} modified`);
			if (unchanged > 0) parts.push(`${unchanged} unchanged`);
			yield* Effect.log(`📝 ${total} files (${parts.join(", ")})`);
		}

		// Pages and external packages summary
		if (pagesGenerated.count > 0) {
			yield* Effect.log(`🧩 ${pagesGenerated.count} pages, ${externalPackages.count} external package(s)`);
		}

		// Per-phase duration summary (silent until Task 12 wires phaseDuration increments)
		if (phaseDurationSnapshot.count > 0) {
			yield* Effect.log(`⏱ ${phaseDurationSnapshot.count} phase(s) timed`);
		}

		// Code block summary
		if (blocks > 0 && slowBlocks > 0) {
			yield* Effect.logWarning(
				`⚠️  Code block performance: ${slowBlocks} of ${blocks} blocks were slow (>${slowCodeBlockMs}ms)`,
			);
		}

		// Error summary
		const totalErrors = tsErrors + prErrors;
		if (totalErrors > 0) {
			const errorParts: string[] = [];
			if (tsErrors > 0) errorParts.push(`${tsErrors} Twoslash`);
			if (prErrors > 0) errorParts.push(`${prErrors} Prettier`);
			yield* Effect.logWarning(`🔴 ${totalErrors} error(s) in code blocks (${errorParts.join(", ")})`);
		}
	});
