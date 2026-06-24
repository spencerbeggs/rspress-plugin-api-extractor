import { Effect, Metric, MetricBoundaries } from "effect";
import { makeEventBusLayer } from "../observability/EventBus.js";
import { makeConsoleSink } from "../observability/sinks/console-sink.js";
import { makeMetricsSink } from "../observability/sinks/metrics-sink.js";
import { makeTraceSink } from "../observability/sinks/trace-sink.js";
import type { EventSink } from "../observability/sinks/types.js";
import type { ResolvedObservability } from "../schemas/observability.js";

/**
 * All build metrics as named counters/histograms.
 *
 * Note: Effect Metrics use a process-wide registry. In tests, counters
 * accumulate across test cases within the same process. Test assertions
 * should use loose matching (toContain) rather than exact count checks.
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
	phaseDuration: Metric.histogram(
		"phase.duration",
		MetricBoundaries.fromIterable([50, 100, 250, 500, 1000, 2500, 5000, 10000]),
	),
	vfsFiles: Metric.counter("vfs.files"),
	importsPrepended: Metric.counter("imports.prepended"),
	twoslashDiagnostics: Metric.counter("twoslash.diagnostics"),
	configDefaultsApplied: Metric.counter("config.defaults.applied"),
} as const;

export interface BuiltSinks {
	readonly layer: ReturnType<typeof makeEventBusLayer>;
	readonly trace: (EventSink & { flush: () => void }) | null;
}

/** Compose the console + metrics (+ optional trace) sinks into an EventBus layer. */
export function buildEventBus(obs: ResolvedObservability): BuiltSinks {
	const sinks: EventSink[] = [makeConsoleSink(obs.logLevel, { json: obs.json }), makeMetricsSink()];
	const trace = obs.tracePath ? makeTraceSink(obs.tracePath) : null;
	if (trace) sinks.push(trace);
	return { layer: makeEventBusLayer(sinks), trace };
}

/**
 * Log a build summary by reading all metric snapshots.
 * Replaces the 4 separate logSummary() calls in afterBuild.
 */
export const logBuildSummary = Effect.gen(function* () {
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
		yield* Effect.logWarning(`⚠️  Code block performance: ${slowBlocks} of ${blocks} blocks were slow (>${100}ms)`);
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
