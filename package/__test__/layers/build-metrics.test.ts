import { Effect, Metric } from "effect";
import { describe, expect, it } from "vitest";
import { BuildMetrics } from "../../src/layers/build-metrics.js";

describe("BuildMetrics.apisCompleted", () => {
	it("is an updatable counter", async () => {
		const value = await Effect.runPromise(
			Effect.gen(function* () {
				const before = (yield* Metric.value(BuildMetrics.apisCompleted)).count;
				yield* Metric.update(BuildMetrics.apisCompleted, 1);
				const after = (yield* Metric.value(BuildMetrics.apisCompleted)).count;
				return after - before;
			}),
		);
		expect(value).toBe(1);
	});
});
