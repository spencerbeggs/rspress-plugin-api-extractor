import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Effect, Metric } from "effect";
import { describe, expect, it, vi } from "vitest";
import {
	BuildMetrics,
	buildEventBus,
	logBuildSummary,
	makeSummaryLoggerLayer,
} from "../../src/layers/ObservabilityLive.js";
import type { ResolvedObservability } from "../../src/schemas/observability.js";

/**
 * Effect Metrics use a single process-wide registry, but reads/writes honour
 * the `currentMetricLabels` FiberRef. Tagging a program with a unique label
 * routes every BuildMetrics read/write inside it to a fresh, isolated hook,
 * so each test can exercise the zero-count branches deterministically.
 */
let isolationSeq = 0;
function isolate<A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> {
	isolationSeq += 1;
	return program.pipe(Effect.tagMetrics("ObservabilityLiveTest", `case-${isolationSeq}`));
}

function captureConsole(): { output: string[]; restore: () => void } {
	const output: string[] = [];
	const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
		output.push(args.map(String).join(" "));
	});
	return { output, restore: () => spy.mockRestore() };
}

function makeObs(overrides: Partial<ResolvedObservability> = {}): ResolvedObservability {
	return {
		logLevel: "info",
		json: false,
		tracePath: null,
		thresholds: {
			slowCodeBlock: 500,
			slowPageGeneration: 500,
			slowApiLoad: 1000,
			slowFileOperation: 50,
			slowHttpRequest: 2000,
			slowDbOperation: 100,
		},
		...overrides,
	};
}

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
			yield* logBuildSummary(100);
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
			yield* logBuildSummary(100);
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
			yield* logBuildSummary(100);
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

		await Effect.runPromise(Effect.provide(logBuildSummary(100), makeSummaryLoggerLayer("none")));

		spy.mockRestore();

		expect(output).toHaveLength(0);
	});

	it("reports 'No files generated' when nothing was built", async () => {
		const { output, restore } = captureConsole();

		await Effect.runPromise(isolate(logBuildSummary(100)));

		restore();

		expect(output.some((l) => l.includes("No files generated"))).toBe(true);
	});

	it("reports 'all unchanged' when only unchanged files exist", async () => {
		const { output, restore } = captureConsole();

		await Effect.runPromise(
			isolate(
				Effect.gen(function* () {
					yield* Metric.incrementBy(BuildMetrics.filesTotal, 5);
					yield* Metric.incrementBy(BuildMetrics.filesUnchanged, 5);
					yield* logBuildSummary(100);
				}),
			),
		);

		restore();

		const line = output.find((l) => l.includes("all unchanged"));
		expect(line).toBeDefined();
		expect(line).toContain("5 files");
	});

	it("lists new, modified and unchanged parts together", async () => {
		const { output, restore } = captureConsole();

		await Effect.runPromise(
			isolate(
				Effect.gen(function* () {
					yield* Metric.incrementBy(BuildMetrics.filesTotal, 10);
					yield* Metric.incrementBy(BuildMetrics.filesNew, 3);
					yield* Metric.incrementBy(BuildMetrics.filesModified, 2);
					yield* Metric.incrementBy(BuildMetrics.filesUnchanged, 5);
					yield* logBuildSummary(100);
				}),
			),
		);

		restore();

		const line = output.find((l) => l.includes("10 files"));
		expect(line).toBeDefined();
		expect(line).toContain("3 new");
		expect(line).toContain("2 modified");
		expect(line).toContain("5 unchanged");
	});

	it("lists only the new part when there are no modified or unchanged files", async () => {
		const { output, restore } = captureConsole();

		await Effect.runPromise(
			isolate(
				Effect.gen(function* () {
					yield* Metric.incrementBy(BuildMetrics.filesTotal, 4);
					yield* Metric.incrementBy(BuildMetrics.filesNew, 4);
					yield* logBuildSummary(100);
				}),
			),
		);

		restore();

		const line = output.find((l) => l.includes("4 files"));
		expect(line).toBeDefined();
		expect(line).toContain("4 new");
		expect(line).not.toContain("modified");
		expect(line).not.toContain("unchanged");
	});

	it("lists only the modified part when there are no new or unchanged files", async () => {
		const { output, restore } = captureConsole();

		await Effect.runPromise(
			isolate(
				Effect.gen(function* () {
					yield* Metric.incrementBy(BuildMetrics.filesTotal, 6);
					yield* Metric.incrementBy(BuildMetrics.filesModified, 6);
					yield* logBuildSummary(100);
				}),
			),
		);

		restore();

		const line = output.find((l) => l.includes("6 files"));
		expect(line).toBeDefined();
		expect(line).toContain("6 modified");
		expect(line).not.toContain("new");
		expect(line).not.toContain("unchanged");
	});

	it("reports timed phases when phase durations are recorded", async () => {
		const { output, restore } = captureConsole();

		await Effect.runPromise(
			isolate(
				Effect.gen(function* () {
					yield* Metric.update(BuildMetrics.phaseDuration, 120);
					yield* Metric.update(BuildMetrics.phaseDuration, 300);
					yield* logBuildSummary(100);
				}),
			),
		);

		restore();

		const line = output.find((l) => l.includes("phase(s) timed"));
		expect(line).toBeDefined();
		expect(line).toContain("2 phase(s) timed");
	});

	it("warns about slow code blocks using the configured threshold", async () => {
		const { output, restore } = captureConsole();

		await Effect.runPromise(
			isolate(
				Effect.gen(function* () {
					yield* Metric.incrementBy(BuildMetrics.codeblockTotal, 10);
					yield* Metric.incrementBy(BuildMetrics.codeblockSlow, 3);
					yield* logBuildSummary(250);
				}),
			),
		);

		restore();

		const line = output.find((l) => l.includes("Code block performance"));
		expect(line).toBeDefined();
		expect(line).toContain("3 of 10");
		expect(line).toContain(">250ms");
	});

	it("reports Prettier-only errors without a Twoslash segment", async () => {
		const { output, restore } = captureConsole();

		await Effect.runPromise(
			isolate(
				Effect.gen(function* () {
					yield* Metric.incrementBy(BuildMetrics.prettierErrors, 2);
					yield* logBuildSummary(100);
				}),
			),
		);

		restore();

		const line = output.find((l) => l.includes("error(s) in code blocks"));
		expect(line).toBeDefined();
		expect(line).toContain("2 Prettier");
		expect(line).not.toContain("Twoslash");
	});

	it("reports both Twoslash and Prettier errors together", async () => {
		const { output, restore } = captureConsole();

		await Effect.runPromise(
			isolate(
				Effect.gen(function* () {
					yield* Metric.incrementBy(BuildMetrics.twoslashErrors, 1);
					yield* Metric.incrementBy(BuildMetrics.prettierErrors, 2);
					yield* logBuildSummary(100);
				}),
			),
		);

		restore();

		const line = output.find((l) => l.includes("error(s) in code blocks"));
		expect(line).toBeDefined();
		expect(line).toContain("3 error(s)");
		expect(line).toContain("1 Twoslash");
		expect(line).toContain("2 Prettier");
	});
});

describe("makeSummaryLoggerLayer", () => {
	it("formats info messages with a timestamp and no prefix at info level", async () => {
		const { output, restore } = captureConsole();

		await Effect.runPromise(Effect.provide(Effect.logInfo("plain info"), makeSummaryLoggerLayer("info")));

		restore();

		const line = output.find((l) => l.includes("plain info"));
		expect(line).toBeDefined();
		expect(line).toMatch(/^\[\d{2}:\d{2}:\d{2}\] plain info$/);
	});

	it("prefixes warnings with the warn glyph at warn level", async () => {
		const { output, restore } = captureConsole();

		await Effect.runPromise(Effect.provide(Effect.logWarning("heads up"), makeSummaryLoggerLayer("warn")));

		restore();

		const line = output.find((l) => l.includes("heads up"));
		expect(line).toBeDefined();
		expect(line).toContain("⚠️");
	});

	it("prefixes errors with the error glyph at error level", async () => {
		const { output, restore } = captureConsole();

		await Effect.runPromise(Effect.provide(Effect.logError("it broke"), makeSummaryLoggerLayer("error")));

		restore();

		const line = output.find((l) => l.includes("it broke"));
		expect(line).toBeDefined();
		expect(line).toContain("🔴");
	});

	it("suppresses info logs at error level", async () => {
		const { output, restore } = captureConsole();

		await Effect.runPromise(Effect.provide(Effect.logInfo("filtered out"), makeSummaryLoggerLayer("error")));

		restore();

		expect(output.some((l) => l.includes("filtered out"))).toBe(false);
	});

	it("maps debug level to Debug and emits debug logs", async () => {
		const { output, restore } = captureConsole();

		await Effect.runPromise(Effect.provide(Effect.logDebug("debug visible"), makeSummaryLoggerLayer("debug")));

		restore();

		expect(output.some((l) => l.includes("debug visible"))).toBe(true);
	});

	it("maps trace level to Debug and emits debug logs", async () => {
		const { output, restore } = captureConsole();

		await Effect.runPromise(Effect.provide(Effect.logDebug("trace visible"), makeSummaryLoggerLayer("trace")));

		restore();

		expect(output.some((l) => l.includes("trace visible"))).toBe(true);
	});

	it("stringifies non-string log messages", async () => {
		const { output, restore } = captureConsole();

		await Effect.runPromise(Effect.provide(Effect.logInfo({ kind: "structured" }), makeSummaryLoggerLayer("info")));

		restore();

		const line = output.find((l) => l.includes("[object Object]"));
		expect(line).toBeDefined();
		expect(line).toMatch(/^\[\d{2}:\d{2}:\d{2}\] /);
	});
});

describe("buildEventBus", () => {
	it("returns no trace sink when tracePath is null", () => {
		const { layer, trace } = buildEventBus(makeObs({ tracePath: null }));

		expect(trace).toBeNull();
		expect(layer).toBeDefined();
	});

	it("creates an eager trace sink and opens the file for an explicit path", () => {
		const tracePath = path.join(os.tmpdir(), `obs-eager-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
		try {
			const { trace } = buildEventBus(makeObs({ tracePath }), false);

			expect(trace).not.toBeNull();
			expect(fs.existsSync(tracePath)).toBe(true);
		} finally {
			fs.rmSync(tracePath, { force: true });
		}
	});

	it("creates a deferred trace sink without opening the file when traceIsDefault is true", () => {
		const tracePath = path.join(os.tmpdir(), `obs-deferred-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
		try {
			const { trace } = buildEventBus(makeObs({ tracePath }), true);

			expect(trace).not.toBeNull();
			expect(fs.existsSync(tracePath)).toBe(false);
		} finally {
			fs.rmSync(tracePath, { force: true });
		}
	});

	it("composes a json console sink without a trace sink in debug mode", () => {
		const { layer, trace } = buildEventBus(makeObs({ logLevel: "debug", json: true, tracePath: null }));

		expect(trace).toBeNull();
		expect(layer).toBeDefined();
	});
});
