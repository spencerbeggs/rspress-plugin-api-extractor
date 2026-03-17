import { Effect, Layer, Logger, Metric } from "effect";
import { describe, expect, it } from "vitest";
import { BuildMetrics, PluginLoggerLive } from "../../src/layers/ObservabilityLive.js";

describe("ObservabilityLive", () => {
	it("PluginLoggerLive respects minimum log level", async () => {
		const captured: string[] = [];
		const testLogger = Logger.make(({ message }) => {
			captured.push(String(message));
		});
		const layer = Layer.mergeAll(Logger.replace(Logger.defaultLogger, testLogger), PluginLoggerLive("warn"));

		const program = Effect.gen(function* () {
			yield* Effect.logDebug("debug msg");
			yield* Effect.logInfo("info msg");
			yield* Effect.logWarning("warn msg");
			yield* Effect.logError("error msg");
		});

		await Effect.runPromise(program.pipe(Effect.provide(layer)));
		// Only warn and error should appear
		expect(captured).toHaveLength(2);
		expect(captured[0]).toContain("warn msg");
		expect(captured[1]).toContain("error msg");
	});

	it("BuildMetrics counters can be incremented", async () => {
		const program = Effect.gen(function* () {
			yield* Metric.increment(BuildMetrics.filesNew);
			yield* Metric.increment(BuildMetrics.filesNew);
			yield* Metric.increment(BuildMetrics.filesModified);
			// No assertion needed -- just verify no errors
		});

		await Effect.runPromise(program);
	});

	it("BuildMetrics histogram records values", async () => {
		const program = Effect.gen(function* () {
			yield* Metric.update(BuildMetrics.codeblockDuration, 42);
			yield* Metric.update(BuildMetrics.codeblockDuration, 150);
		});

		await Effect.runPromise(program);
	});
});
