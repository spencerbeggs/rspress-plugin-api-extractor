import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { EventBus, makeEventBusLayer } from "./EventBus.js";
import { PluginEvent } from "./events.js";
import type { EventSink } from "./sinks/types.js";

const ctx = { buildId: "b1" };

function recordingSink(minLevel: EventSink["minLevel"]): { sink: EventSink; seen: PluginEvent[] } {
	const seen: PluginEvent[] = [];
	return { sink: { minLevel, handle: (e) => seen.push(e) }, seen };
}

describe("EventBus", () => {
	it("fans out an event to every sink synchronously", async () => {
		const a = recordingSink("trace");
		const b = recordingSink("trace");
		const layer = makeEventBusLayer([a.sink, b.sink]);
		await Effect.runPromise(
			Effect.gen(function* () {
				const bus = yield* EventBus;
				yield* bus.emit(PluginEvent.PhaseStarted({ ctx, level: "info", phase: "config" }));
			}).pipe(Effect.provide(layer)),
		);
		expect(a.seen).toHaveLength(1);
		expect(b.seen).toHaveLength(1);
		expect(a.seen[0]._tag).toBe("PhaseStarted");
	});

	it("wantsLevel is true only when some sink admits the level", async () => {
		const a = recordingSink("info");
		const layer = makeEventBusLayer([a.sink]);
		const [info, trace] = await Effect.runPromise(
			Effect.gen(function* () {
				const bus = yield* EventBus;
				return [yield* bus.wantsLevel("info"), yield* bus.wantsLevel("trace")] as const;
			}).pipe(Effect.provide(layer)),
		);
		expect(info).toBe(true);
		expect(trace).toBe(false);
	});
});
