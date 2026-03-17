import { Effect, Metric } from "effect";
import { describe, expect, it, vi } from "vitest";
import { BuildMetrics, PluginLoggerLayer } from "../../src/layers/ObservabilityLive.js";

describe("PluginLoggerLayer", () => {
	it("INFO level outputs emoji-prefixed messages", async () => {
		const output: string[] = [];
		const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
			output.push(args.map(String).join(" "));
		});

		const program = Effect.gen(function* () {
			yield* Effect.log("Build started");
			yield* Effect.logWarning("Slow code block");
			yield* Effect.logError("Build failed");
		});

		await Effect.runPromise(program.pipe(Effect.provide(PluginLoggerLayer("info"))));

		spy.mockRestore();

		expect(output.some((l) => l.includes("Build started"))).toBe(true);
		expect(output.some((l) => l.includes("\u26A0\uFE0F") && l.includes("Slow code block"))).toBe(true);
		expect(output.some((l) => l.includes("\uD83D\uDD34") && l.includes("Build failed"))).toBe(true);
	});

	it("DEBUG level outputs structured JSON with annotations", async () => {
		const output: string[] = [];
		const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
			output.push(args.map(String).join(" "));
		});

		const program = Effect.gen(function* () {
			yield* Effect.log("test message").pipe(
				Effect.annotateLogs("api", "my-package"),
				Effect.annotateLogs("version", "1.0.0"),
			);
		});

		await Effect.runPromise(program.pipe(Effect.provide(PluginLoggerLayer("debug"))));

		spy.mockRestore();

		const jsonLine = output.find((l) => l.startsWith("{"));
		expect(jsonLine).toBeDefined();
		const parsed = JSON.parse(jsonLine ?? "");
		expect(parsed.message).toBe("test message");
		expect(parsed.api).toBe("my-package");
		expect(parsed.version).toBe("1.0.0");
		expect(parsed.timestamp).toBeTypeOf("number");
		expect(parsed.level).toBe("info");
	});

	it("minimum log level filters correctly", async () => {
		const output: string[] = [];
		const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
			output.push(args.map(String).join(" "));
		});

		const program = Effect.gen(function* () {
			yield* Effect.logDebug("debug msg");
			yield* Effect.log("info msg");
			yield* Effect.logWarning("warn msg");
		});

		await Effect.runPromise(program.pipe(Effect.provide(PluginLoggerLayer("warn"))));

		spy.mockRestore();

		expect(output).toHaveLength(1);
		expect(output[0]).toContain("warn msg");
	});
});

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
