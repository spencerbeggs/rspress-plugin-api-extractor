import { Effect, Metric } from "effect";
import { BuildMetrics } from "../../layers/build-metrics.js";
import type { PluginEvent } from "../events.js";
import type { EventSink } from "./types.js";

/**
 * Event-driven metrics sink.
 *
 * Translates each `PluginEvent` to the corresponding `BuildMetrics` counter or
 * histogram update via `Effect.runSync`. The fan-out from `EventBus.emit` is
 * synchronous, so by the time the emitting fiber resumes the metrics are already
 * recorded — counts are exact when `logBuildSummary` reads them in `afterBuild`.
 *
 * Unmapped event tags hit the `default` branch and are silently ignored.
 *
 * Intentionally NOT derived here: `externalPackagesTotal` and `apiVersionsLoaded`
 * remain inline increments in `ConfigServiceLive`. `externalPackagesTotal` counts
 * CONFIGURED packages via `incrementBy(length)`; the only candidate event,
 * `TypeRegistryEvent{BatchComplete}`, carries an unstructured `detail` string and
 * a `loaded` (SUCCEEDED) count — different semantics, so deriving it here would
 * change what the metric means. `apiVersionsLoaded` has no corresponding event.
 */
export function makeMetricsSink(): EventSink {
	return {
		minLevel: "trace",
		handle(event: PluginEvent): void {
			switch (event._tag) {
				case "FileDecision":
					Effect.runSync(Metric.update(BuildMetrics.filesTotal, 1));
					if (event.status === "new") {
						Effect.runSync(Metric.update(BuildMetrics.filesNew, 1));
					} else if (event.status === "modified") {
						Effect.runSync(Metric.update(BuildMetrics.filesModified, 1));
					} else {
						Effect.runSync(Metric.update(BuildMetrics.filesUnchanged, 1));
					}
					break;

				case "PageGenerated":
					Effect.runSync(Metric.update(BuildMetrics.pagesGenerated, 1));
					break;

				case "ApiDocsCompleted":
					Effect.runSync(Metric.update(BuildMetrics.apisCompleted, 1));
					break;

				case "TwoslashDiagnostic":
					Effect.runSync(Metric.update(BuildMetrics.twoslashDiagnostics, 1));
					Effect.runSync(Metric.update(BuildMetrics.twoslashErrors, 1));
					break;

				case "PrettierError":
					Effect.runSync(Metric.update(BuildMetrics.prettierErrors, 1));
					break;

				case "CodeBlockProcessed":
					Effect.runSync(Metric.update(BuildMetrics.codeblockTotal, 1));
					Effect.runSync(Metric.update(BuildMetrics.codeblockDuration, event.totalMs));
					// Guard the shiki histogram so a 0ms observation does not skew the
					// lowest bucket (matches the prior inline `if (shikiTime > 0)` guard).
					if (event.shikiMs > 0) {
						Effect.runSync(Metric.update(BuildMetrics.codeblockShikiDuration, event.shikiMs));
					}
					if (event.slow) {
						Effect.runSync(Metric.update(BuildMetrics.codeblockSlow, 1));
					}
					break;

				case "VfsGenerated":
					Effect.runSync(Metric.update(BuildMetrics.vfsFiles, 1));
					break;

				case "ImportsPrepended":
					Effect.runSync(Metric.update(BuildMetrics.importsPrepended, 1));
					break;

				case "PhaseCompleted":
					Effect.runSync(Metric.update(BuildMetrics.phaseDuration, event.durationMs));
					break;

				case "DefaultApplied":
					Effect.runSync(Metric.update(BuildMetrics.configDefaultsApplied, 1));
					break;

				default:
					break;
			}
		},
	};
}
