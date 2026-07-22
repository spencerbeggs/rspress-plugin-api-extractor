import { Duration, Effect, Fiber, Metric, Ref } from "effect";
import { describe, expect, it } from "vitest";
import { BuildMetrics } from "../../src/layers/build-metrics.js";
import { makeEventBusLayer } from "../../src/observability/EventBus.js";
import type { PluginEvent } from "../../src/observability/events.js";
import type { ProgressCounts, ProgressPhase } from "../../src/observability/heartbeat.js";
import { formatProgress, makeProgressEvent, runHeartbeat } from "../../src/observability/heartbeat.js";
import type { EventSink } from "../../src/observability/sinks/types.js";

const zero: ProgressCounts = { vfsFiles: 0, externalPackages: 0, apisCompleted: 0, pages: 0, codeBlocks: 0 };
const asBuildProgress = (e: PluginEvent) => {
	if (e._tag !== "BuildProgress") throw new Error("expected BuildProgress");
	return e;
};

describe("makeProgressEvent", () => {
	it("computes the resolve delta from vfsFiles", () => {
		const e = asBuildProgress(
			makeProgressEvent({
				phase: "resolve",
				buildId: "b",
				elapsedMs: 10_000,
				apisTotal: 18,
				curr: { ...zero, vfsFiles: 11, externalPackages: 4 },
				prev: { ...zero, vfsFiles: 5 },
			}),
		);
		expect(e.delta).toBe(6);
		expect(e.level).toBe("info");
	});
	it("computes the generate delta from pages", () => {
		const e = asBuildProgress(
			makeProgressEvent({
				phase: "generate",
				buildId: "b",
				elapsedMs: 30_000,
				apisTotal: 18,
				curr: { ...zero, apisCompleted: 9, pages: 402, codeBlocks: 918 },
				prev: { ...zero, pages: 231 },
			}),
		);
		expect(e.delta).toBe(171);
	});
});

describe("formatProgress", () => {
	it("renders a resolve tick", () => {
		const e = asBuildProgress(
			makeProgressEvent({
				phase: "resolve",
				buildId: "b",
				elapsedMs: 10_000,
				apisTotal: 18,
				curr: { ...zero, vfsFiles: 11, externalPackages: 4 },
				prev: { ...zero, vfsFiles: 5 },
			}),
		);
		expect(formatProgress(e)).toBe("API docs · resolving types · 11 files · 4 pkgs · 10s (+6 files)");
	});
	it("renders a generate tick", () => {
		const e = asBuildProgress(
			makeProgressEvent({
				phase: "generate",
				buildId: "b",
				elapsedMs: 30_000,
				apisTotal: 18,
				curr: { ...zero, apisCompleted: 9, pages: 402, codeBlocks: 918 },
				prev: { ...zero, pages: 231 },
			}),
		);
		expect(formatProgress(e)).toBe("API docs · 9/18 APIs · 402 pages · 918 blocks · 30s (+171 pages)");
	});
	it("renders a +0 stall tick", () => {
		const e = asBuildProgress(
			makeProgressEvent({
				phase: "generate",
				buildId: "b",
				elapsedMs: 40_000,
				apisTotal: 18,
				curr: { ...zero, apisCompleted: 9, pages: 402, codeBlocks: 918 },
				prev: { ...zero, pages: 402 },
			}),
		);
		expect(formatProgress(e)).toBe("API docs · 9/18 APIs · 402 pages · 918 blocks · 40s (+0 pages)");
	});
});

describe("runHeartbeat", () => {
	it("emits at least one BuildProgress tick and stops when phase is done", async () => {
		const seen: PluginEvent[] = [];
		const sink: EventSink = { minLevel: "trace", capturesPayload: true, handle: (e) => seen.push(e) };
		const countBuildProgress = () => seen.filter((e) => e._tag === "BuildProgress").length;
		const intervalMs = 10;
		const settleMs = intervalMs * 3;
		await Effect.runPromise(
			Effect.gen(function* () {
				const phaseRef = yield* Ref.make<ProgressPhase>("generate");
				yield* Metric.update(BuildMetrics.pagesGenerated, 3);
				const fiber = yield* Effect.forkScoped(
					runHeartbeat({ phaseRef, intervalMs, startTime: performance.now(), apisTotal: 2, buildId: "b" }),
				);
				// Let the loop tick at least once while phase is still active.
				yield* Effect.sleep(Duration.millis(settleMs));
				yield* Ref.set(phaseRef, "done");
				// Give the loop enough time to observe "done" and self-terminate.
				yield* Effect.sleep(Duration.millis(settleMs));
				const countAfterSettle = countBuildProgress();
				// If the loop's own done-check were removed, it would keep sleeping
				// intervalMs and emitting ticks forever; this proves it did not.
				yield* Effect.sleep(Duration.millis(settleMs));
				expect(countBuildProgress()).toBe(countAfterSettle);
				// Cleanup only — self-termination already happened above, so this
				// is a safe no-op and is not relied on for the assertion.
				yield* Fiber.interrupt(fiber);
			}).pipe(Effect.scoped, Effect.provide(makeEventBusLayer([sink]))),
		);
		const progress = seen.filter((e) => e._tag === "BuildProgress");
		expect(progress.length).toBeGreaterThan(0);
		expect(progress[0]?._tag).toBe("BuildProgress");
	});
});
