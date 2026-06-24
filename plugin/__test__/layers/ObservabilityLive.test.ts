import { Effect, Logger, Metric } from "effect";
import { describe, expect, it, vi } from "vitest";
import { BuildMetrics, logBuildSummary } from "../../src/layers/ObservabilityLive.js";

describe("BuildMetrics", () => {
	it("counters can be incremented", async () => {
		const program = Effect.gen(function* () {
			yield* Metric.increment(BuildMetrics.filesNew);
			yield* Metric.increment(BuildMetrics.filesNew);
			yield* Metric.increment(BuildMetrics.filesModified);
		});

		await Effect.runPromise(program);
	});

	it("histograms record values", async () => {
		const program = Effect.gen(function* () {
			yield* Metric.update(BuildMetrics.codeblockDuration, 42);
			yield* Metric.update(BuildMetrics.codeblockDuration, 150);
		});

		await Effect.runPromise(program);
	});

	it("Effect.runSync works for metric increments (bridge pattern)", () => {
		// This verifies the pattern used in non-Effect code (plugin.ts)
		Effect.runSync(Metric.increment(BuildMetrics.pagesGenerated));
		Effect.runSync(Metric.increment(BuildMetrics.pagesGenerated));
		// No error = success (metrics use global default registry)
	});
});

describe("logBuildSummary", () => {
	it("produces file summary from metric values", async () => {
		const output: string[] = [];
		const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
			output.push(args.map(String).join(" "));
		});

		const program = Effect.gen(function* () {
			yield* Metric.incrementBy(BuildMetrics.filesTotal, 10);
			yield* Metric.incrementBy(BuildMetrics.filesNew, 3);
			yield* Metric.incrementBy(BuildMetrics.filesModified, 2);
			yield* Metric.incrementBy(BuildMetrics.filesUnchanged, 5);
			yield* logBuildSummary;
		});

		await Effect.runPromise(program);

		spy.mockRestore();

		const fileLine = output.find((l) => l.includes("files"));
		expect(fileLine).toBeDefined();
		expect(fileLine).toContain("new");
		expect(fileLine).toContain("modified");
	});

	it("shows error summary when errors present", async () => {
		const output: string[] = [];
		const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
			output.push(args.map(String).join(" "));
		});

		const program = Effect.gen(function* () {
			yield* Metric.incrementBy(BuildMetrics.twoslashErrors, 3);
			yield* logBuildSummary;
		});

		await Effect.runPromise(program);

		spy.mockRestore();

		const errorLine = output.find((l) => l.includes("error"));
		expect(errorLine).toBeDefined();
		expect(errorLine).toContain("Twoslash");
	});

	it("reports pages generated and external packages in summary", async () => {
		const output: string[] = [];
		const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
			output.push(args.map(String).join(" "));
		});

		const program = Effect.gen(function* () {
			// Prime to ensure the count>0 guard fires; registry is process-wide so assert loosely
			yield* Metric.incrementBy(BuildMetrics.pagesGenerated, 5);
			yield* Metric.incrementBy(BuildMetrics.externalPackagesTotal, 2);
			yield* logBuildSummary;
		});

		await Effect.runPromise(program);

		spy.mockRestore();

		// Process-wide registry: counts accumulate, so use toContain / loose assertions
		const pagesLine = output.find((l) => l.includes("pages"));
		expect(pagesLine).toBeDefined();
		expect(pagesLine).toContain("external package");
	});

	it("suppresses output with Logger.withMinimumLogLevel None", async () => {
		const output: string[] = [];
		const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
			output.push(args.map(String).join(" "));
		});

		const program = Effect.gen(function* () {
			yield* logBuildSummary;
		}).pipe(Logger.withMinimumLogLevel(Logger.none.minimumLogLevel));

		await Effect.runPromise(program);

		spy.mockRestore();

		expect(output).toHaveLength(0);
	});
});
