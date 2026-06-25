import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { ResolvedObservability } from "../schemas/observability.js";
import { makeEventBusLayer } from "./EventBus.js";
import type { PluginEvent } from "./events.js";
import { withOp, withPhase } from "./spans.js";

const FULL_THRESHOLDS: ResolvedObservability["thresholds"] = {
	slowCodeBlock: 100,
	slowPageGeneration: 500,
	slowApiLoad: 1000,
	slowFileOperation: 50,
	slowHttpRequest: 2000,
	slowDbOperation: 100,
};

describe("withPhase", () => {
	it("emits PhaseStarted then PhaseCompleted around the effect", async () => {
		const seen: PluginEvent[] = [];
		const layer = makeEventBusLayer([{ minLevel: "trace", handle: (e) => seen.push(e) }]);
		await Effect.runPromise(
			withPhase("generate", { buildId: "b1" }, Effect.succeed(1), FULL_THRESHOLDS).pipe(Effect.provide(layer)),
		);
		expect(seen.map((e) => e._tag)).toEqual(["PhaseStarted", "PhaseCompleted"]);
	});

	it("returns the effect's value", async () => {
		const layer = makeEventBusLayer([{ minLevel: "trace", handle: () => {} }]);
		const result = await Effect.runPromise(
			withPhase("generate", { buildId: "b1" }, Effect.succeed(42), FULL_THRESHOLDS).pipe(Effect.provide(layer)),
		);
		expect(result).toBe(42);
	});

	it("emits SlowOperation when durationMs exceeds the phase threshold", async () => {
		const seen: PluginEvent[] = [];
		const layer = makeEventBusLayer([{ minLevel: "trace", handle: (e) => seen.push(e) }]);
		// Use a very low threshold so any real execution breaches it
		const thresholds: ResolvedObservability["thresholds"] = { ...FULL_THRESHOLDS, slowPageGeneration: 0 };
		await Effect.runPromise(
			withPhase("generate", { buildId: "b1" }, Effect.succeed(1), thresholds).pipe(Effect.provide(layer)),
		);
		const tags = seen.map((e) => e._tag);
		expect(tags).toContain("SlowOperation");
		expect(tags.indexOf("SlowOperation")).toBeGreaterThan(tags.indexOf("PhaseStarted"));
	});

	it("works without an EventBus in context (no-op)", async () => {
		// emit is serviceOption-based so withPhase must not fail without a bus
		await expect(
			Effect.runPromise(withPhase("generate", { buildId: "b1" }, Effect.succeed("ok"), FULL_THRESHOLDS)),
		).resolves.toBe("ok");
	});
});

describe("withOp", () => {
	it("runs the effect, returns its value, and emits no PhaseStarted/PhaseCompleted pair", async () => {
		const seen: PluginEvent[] = [];
		let runs = 0;
		const layer = makeEventBusLayer([{ minLevel: "trace", handle: (e) => seen.push(e) }]);
		const result = await Effect.runPromise(
			withOp(
				"modelLoad",
				{ buildId: "b1" },
				Effect.sync(() => {
					runs += 1;
					return "value";
				}),
				1000,
			).pipe(Effect.provide(layer)),
		);
		expect(result).toBe("value");
		expect(runs).toBe(1);
		const tags = seen.map((e) => e._tag);
		expect(tags).not.toContain("PhaseStarted");
		expect(tags).not.toContain("PhaseCompleted");
	});

	it("emits SlowOperation on a threshold=0 breach", async () => {
		const seen: PluginEvent[] = [];
		const layer = makeEventBusLayer([{ minLevel: "trace", handle: (e) => seen.push(e) }]);
		await Effect.runPromise(withOp("modelLoad", { buildId: "b1" }, Effect.succeed(1), 0).pipe(Effect.provide(layer)));
		expect(seen.map((e) => e._tag)).toContain("SlowOperation");
	});
});
