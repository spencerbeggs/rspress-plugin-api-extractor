import { Effect, Metric } from "effect";
import { describe, expect, it } from "vitest";
import { BuildMetrics } from "../../../src/layers/build-metrics.js";
import { PluginEvent } from "../../../src/observability/events.js";
import { makeMetricsSink } from "../../../src/observability/sinks/metrics-sink.js";

const ctx = { buildId: "b1" };

describe("makeMetricsSink", () => {
	it("declares minLevel 'trace' so it captures every event", () => {
		expect(makeMetricsSink().minLevel).toBe("trace");
	});

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

	it("increments filesModified when FileDecision{status:'modified'} is handled", async () => {
		const sink = makeMetricsSink();

		const before = await Effect.runPromise(Metric.value(BuildMetrics.filesModified));

		sink.handle(
			PluginEvent.FileDecision({
				ctx,
				level: "debug",
				file: "class/foo.mdx",
				status: "modified",
				contentHash: "abc",
				frontmatterHash: "def",
				source: "snapshot",
			}),
		);

		const after = await Effect.runPromise(Metric.value(BuildMetrics.filesModified));
		expect(after.count).toBeGreaterThanOrEqual(before.count + 1);
	});

	it("increments filesUnchanged when FileDecision{status:'unchanged'} is handled", async () => {
		const sink = makeMetricsSink();

		const before = await Effect.runPromise(Metric.value(BuildMetrics.filesUnchanged));

		sink.handle(
			PluginEvent.FileDecision({
				ctx,
				level: "debug",
				file: "class/foo.mdx",
				status: "unchanged",
				contentHash: "abc",
				frontmatterHash: "def",
				source: "disk-fallback",
			}),
		);

		const after = await Effect.runPromise(Metric.value(BuildMetrics.filesUnchanged));
		expect(after.count).toBeGreaterThanOrEqual(before.count + 1);
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

	it("increments apisCompleted when ApiDocsCompleted is handled", async () => {
		const sink = makeMetricsSink();

		const before = await Effect.runPromise(Metric.value(BuildMetrics.apisCompleted));

		sink.handle(PluginEvent.ApiDocsCompleted({ ctx, level: "debug", packageName: "@modules/kitchensink" }));

		const after = await Effect.runPromise(Metric.value(BuildMetrics.apisCompleted));
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

	it("increments prettierErrors when PrettierError is handled", async () => {
		const sink = makeMetricsSink();

		const before = await Effect.runPromise(Metric.value(BuildMetrics.prettierErrors));

		sink.handle(PluginEvent.PrettierError({ ctx, level: "warn", file: "class/foo.mdx", reason: "syntax" }));

		const after = await Effect.runPromise(Metric.value(BuildMetrics.prettierErrors));
		expect(after.count).toBeGreaterThanOrEqual(before.count + 1);
	});

	it("records duration, shiki duration and the slow counter when a slow CodeBlockProcessed is handled", async () => {
		const sink = makeMetricsSink();

		const beforeTotal = await Effect.runPromise(Metric.value(BuildMetrics.codeblockTotal));
		const beforeDuration = await Effect.runPromise(Metric.value(BuildMetrics.codeblockDuration));
		const beforeShiki = await Effect.runPromise(Metric.value(BuildMetrics.codeblockShikiDuration));
		const beforeSlow = await Effect.runPromise(Metric.value(BuildMetrics.codeblockSlow));

		sink.handle(
			PluginEvent.CodeBlockProcessed({
				ctx,
				level: "debug",
				lang: "ts",
				shikiMs: 30,
				twoslashMs: 70,
				totalMs: 120,
				slow: true,
			}),
		);

		const afterTotal = await Effect.runPromise(Metric.value(BuildMetrics.codeblockTotal));
		const afterDuration = await Effect.runPromise(Metric.value(BuildMetrics.codeblockDuration));
		const afterShiki = await Effect.runPromise(Metric.value(BuildMetrics.codeblockShikiDuration));
		const afterSlow = await Effect.runPromise(Metric.value(BuildMetrics.codeblockSlow));

		expect(afterTotal.count).toBeGreaterThanOrEqual(beforeTotal.count + 1);
		expect(afterDuration.count).toBeGreaterThanOrEqual(beforeDuration.count + 1);
		expect(afterShiki.count).toBeGreaterThanOrEqual(beforeShiki.count + 1);
		expect(afterSlow.count).toBeGreaterThanOrEqual(beforeSlow.count + 1);
	});

	it("skips the shiki histogram and slow counter when shikiMs is 0 and not slow", async () => {
		const sink = makeMetricsSink();

		const beforeTotal = await Effect.runPromise(Metric.value(BuildMetrics.codeblockTotal));
		const beforeShiki = await Effect.runPromise(Metric.value(BuildMetrics.codeblockShikiDuration));
		const beforeSlow = await Effect.runPromise(Metric.value(BuildMetrics.codeblockSlow));

		sink.handle(
			PluginEvent.CodeBlockProcessed({
				ctx,
				level: "debug",
				lang: "ts",
				shikiMs: 0,
				twoslashMs: 0,
				totalMs: 4,
				slow: false,
			}),
		);

		const afterTotal = await Effect.runPromise(Metric.value(BuildMetrics.codeblockTotal));
		const afterShiki = await Effect.runPromise(Metric.value(BuildMetrics.codeblockShikiDuration));
		const afterSlow = await Effect.runPromise(Metric.value(BuildMetrics.codeblockSlow));

		expect(afterTotal.count).toBeGreaterThanOrEqual(beforeTotal.count + 1);
		// 0ms shiki observation is guarded out; slow counter untouched.
		expect(afterShiki.count).toBe(beforeShiki.count);
		expect(afterSlow.count).toBe(beforeSlow.count);
	});

	it("increments vfsFiles when VfsGenerated is handled", async () => {
		const sink = makeMetricsSink();

		const before = await Effect.runPromise(Metric.value(BuildMetrics.vfsFiles));

		sink.handle(PluginEvent.VfsGenerated({ ctx, level: "debug", file: "index.d.ts", declCount: 12, contentHash: "h" }));

		const after = await Effect.runPromise(Metric.value(BuildMetrics.vfsFiles));
		expect(after.count).toBeGreaterThanOrEqual(before.count + 1);
	});

	it("increments importsPrepended when ImportsPrepended is handled", async () => {
		const sink = makeMetricsSink();

		const before = await Effect.runPromise(Metric.value(BuildMetrics.importsPrepended));

		sink.handle(
			PluginEvent.ImportsPrepended({
				ctx,
				level: "debug",
				file: "index.d.ts",
				imports: [{ from: "zod", symbols: ["ZodType"] }],
			}),
		);

		const after = await Effect.runPromise(Metric.value(BuildMetrics.importsPrepended));
		expect(after.count).toBeGreaterThanOrEqual(before.count + 1);
	});

	it("records phaseDuration when PhaseCompleted is handled", async () => {
		const sink = makeMetricsSink();

		const before = await Effect.runPromise(Metric.value(BuildMetrics.phaseDuration));

		sink.handle(PluginEvent.PhaseCompleted({ ctx, level: "info", phase: "generate", durationMs: 250 }));

		const after = await Effect.runPromise(Metric.value(BuildMetrics.phaseDuration));
		expect(after.count).toBeGreaterThanOrEqual(before.count + 1);
	});

	it("increments configDefaultsApplied when DefaultApplied is handled", async () => {
		const sink = makeMetricsSink();

		const before = await Effect.runPromise(Metric.value(BuildMetrics.configDefaultsApplied));

		sink.handle(
			PluginEvent.DefaultApplied({ ctx, level: "debug", path: "llms.scopes", value: "true", reason: "default" }),
		);

		const after = await Effect.runPromise(Metric.value(BuildMetrics.configDefaultsApplied));
		expect(after.count).toBeGreaterThanOrEqual(before.count + 1);
	});

	it("ignores unmapped event tags without throwing", () => {
		const sink = makeMetricsSink();
		expect(() =>
			sink.handle(PluginEvent.ShikiError({ ctx, level: "warn", file: "f.mdx", reason: "bad" })),
		).not.toThrow();
	});
});
