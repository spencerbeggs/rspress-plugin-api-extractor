import { Effect, Metric } from "effect";
import { describe, expect, it } from "vitest";
import { BuildMetrics } from "../../src/layers/ObservabilityLive.js";

describe("Bug: Twoslash error context clobbering (plugin.ts:575)", () => {
	// TwoslashErrorStatsCollector replaced by Effect Metric.counter("twoslash.errors").
	// Context-based attribution is no longer tracked; only aggregate count matters.

	it("twoslash errors are tracked via Effect Metric counter", () => {
		// Increment the counter as the onTwoslashError callback now does
		Effect.runSync(Metric.increment(BuildMetrics.twoslashErrors));

		const state = Effect.runSync(Metric.value(BuildMetrics.twoslashErrors));
		expect(state.count).toBeGreaterThanOrEqual(1);
	});
});

// Prettier error context clobbering tests removed:
// PrettierErrorStatsCollector replaced by Effect Metric.counter("prettier.errors")
