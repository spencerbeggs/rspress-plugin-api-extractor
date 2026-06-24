import { Effect, Metric } from "effect";
import { describe, expect, it } from "vitest";
import { BuildMetrics } from "../../layers/build-metrics.js";
import { PluginEvent } from "../events.js";
import { makeMetricsSink } from "./metrics-sink.js";

const ctx = { buildId: "b1" };

describe("makeMetricsSink", () => {
	it("increments filesTotal and filesNew when FileDecision{status:'new'} is handled", async () => {
		const sink = makeMetricsSink();

		const beforeTotal = await Effect.runPromise(Metric.value(BuildMetrics.filesTotal));
		const beforeNew = await Effect.runPromise(Metric.value(BuildMetrics.filesNew));

		sink.handle(
			PluginEvent.FileDecision({
				ctx,
				level: "debug",
				file: "class/foo.mdx",
				status: "new",
				contentHash: "abc123",
				frontmatterHash: "def456",
				source: "snapshot",
			}),
		);

		const afterTotal = await Effect.runPromise(Metric.value(BuildMetrics.filesTotal));
		const afterNew = await Effect.runPromise(Metric.value(BuildMetrics.filesNew));

		expect(afterTotal.count).toBeGreaterThanOrEqual(beforeTotal.count + 1);
		expect(afterNew.count).toBeGreaterThanOrEqual(beforeNew.count + 1);
	});

	it("increments pagesGenerated when PageGenerated is handled", async () => {
		const sink = makeMetricsSink();

		const before = await Effect.runPromise(Metric.value(BuildMetrics.pagesGenerated));

		sink.handle(
			PluginEvent.PageGenerated({
				ctx,
				level: "info",
				item: "Pipeline",
				category: "Classes",
				codeblockCount: 2,
				durationMs: 5,
			}),
		);

		const after = await Effect.runPromise(Metric.value(BuildMetrics.pagesGenerated));
		expect(after.count).toBeGreaterThanOrEqual(before.count + 1);
	});

	it("increments twoslashDiagnostics and twoslashErrors when TwoslashDiagnostic is handled", async () => {
		const sink = makeMetricsSink();

		const beforeDiagnostics = await Effect.runPromise(Metric.value(BuildMetrics.twoslashDiagnostics));
		const beforeErrors = await Effect.runPromise(Metric.value(BuildMetrics.twoslashErrors));

		sink.handle(
			PluginEvent.TwoslashDiagnostic({
				ctx,
				level: "warn",
				file: "class/foo.mdx",
				line: 1,
				col: 1,
				code: 2440,
				message: "Import declaration conflicts",
				snippet: "import { x } from 'y';",
			}),
		);

		const afterDiagnostics = await Effect.runPromise(Metric.value(BuildMetrics.twoslashDiagnostics));
		const afterErrors = await Effect.runPromise(Metric.value(BuildMetrics.twoslashErrors));

		expect(afterDiagnostics.count).toBeGreaterThanOrEqual(beforeDiagnostics.count + 1);
		expect(afterErrors.count).toBeGreaterThanOrEqual(beforeErrors.count + 1);
	});
});
