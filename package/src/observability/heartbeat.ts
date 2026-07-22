import { Duration, Effect, Metric, Ref } from "effect";
import { BuildMetrics } from "../layers/build-metrics.js";
import { emit } from "./EventBus.js";
import { PluginEvent } from "./events.js";

export interface ProgressCounts {
	readonly vfsFiles: number;
	readonly externalPackages: number;
	readonly apisCompleted: number;
	readonly pages: number;
	readonly codeBlocks: number;
}

export interface MakeProgressEventArgs {
	readonly phase: "resolve" | "generate";
	readonly buildId: string;
	readonly elapsedMs: number;
	readonly apisTotal: number;
	readonly curr: ProgressCounts;
	readonly prev: ProgressCounts;
}

/** Build a `BuildProgress` event from the current + previous metric snapshot. */
export function makeProgressEvent(args: MakeProgressEventArgs): PluginEvent {
	const { phase, curr, prev } = args;
	const delta = phase === "resolve" ? curr.vfsFiles - prev.vfsFiles : curr.pages - prev.pages;
	return PluginEvent.BuildProgress({
		ctx: { buildId: args.buildId },
		level: "info",
		phase,
		elapsedMs: args.elapsedMs,
		vfsFiles: curr.vfsFiles,
		externalPackages: curr.externalPackages,
		apisCompleted: curr.apisCompleted,
		apisTotal: args.apisTotal,
		pages: curr.pages,
		codeBlocks: curr.codeBlocks,
		delta,
	});
}

/** One-line human-readable render of a `BuildProgress` event body (no timestamp prefix). */
export function formatProgress(e: Extract<PluginEvent, { _tag: "BuildProgress" }>): string {
	const secs = `${Math.round(e.elapsedMs / 1000)}s`;
	if (e.phase === "resolve") {
		return `API docs · resolving types · ${e.vfsFiles} files · ${e.externalPackages} pkgs · ${secs} (+${e.delta} files)`;
	}
	return `API docs · ${e.apisCompleted}/${e.apisTotal} APIs · ${e.pages} pages · ${e.codeBlocks} blocks · ${secs} (+${e.delta} pages)`;
}

/** Which build phase the heartbeat is currently reporting progress for. */
export type ProgressPhase = "resolve" | "generate" | "done";

/** Read the five progress counters into a snapshot. */
export const readCounts: Effect.Effect<ProgressCounts> = Effect.gen(function* () {
	const vfsFiles = (yield* Metric.value(BuildMetrics.vfsFiles)).count;
	const externalPackages = (yield* Metric.value(BuildMetrics.externalPackagesTotal)).count;
	const apisCompleted = (yield* Metric.value(BuildMetrics.apisCompleted)).count;
	const pages = (yield* Metric.value(BuildMetrics.pagesGenerated)).count;
	const codeBlocks = (yield* Metric.value(BuildMetrics.codeblockTotal)).count;
	return { vfsFiles, externalPackages, apisCompleted, pages, codeBlocks };
});

export interface RunHeartbeatOpts {
	readonly phaseRef: Ref.Ref<ProgressPhase>;
	readonly intervalMs: number;
	readonly startTime: number;
	readonly apisTotal: number;
	readonly buildId: string;
}

/**
 * Sleep-first heartbeat loop: waits `intervalMs`, then reads the metric
 * snapshot and emits a `BuildProgress` event, repeating until the phase Ref
 * reads `"done"` or the fiber is interrupted (scope close). Sleeping first
 * means a build that finishes before the first interval emits nothing.
 */
export function runHeartbeat(opts: RunHeartbeatOpts): Effect.Effect<void> {
	const loop = (prev: ProgressCounts): Effect.Effect<void> =>
		Effect.gen(function* () {
			yield* Effect.sleep(Duration.millis(opts.intervalMs));
			const phase = yield* Ref.get(opts.phaseRef);
			if (phase === "done") return;
			const curr = yield* readCounts;
			yield* emit(
				makeProgressEvent({
					phase,
					buildId: opts.buildId,
					elapsedMs: performance.now() - opts.startTime,
					apisTotal: opts.apisTotal,
					curr,
					prev,
				}),
			);
			return yield* loop(curr);
		});
	return loop({ vfsFiles: 0, externalPackages: 0, apisCompleted: 0, pages: 0, codeBlocks: 0 });
}
