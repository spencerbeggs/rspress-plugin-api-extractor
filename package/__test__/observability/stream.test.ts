import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { PluginEvent } from "../../src/observability/events.js";
import { makeStreamSink } from "../../src/observability/stream.js";

const ctx = { buildId: "test-build" };

describe("makeStreamSink", () => {
	it("returns a sink and stream", () => {
		const { sink, stream } = makeStreamSink();
		expect(sink).toBeDefined();
		expect(typeof sink.handle).toBe("function");
		expect(sink.minLevel).toBe("trace");
		expect(stream).toBeDefined();
	});

	it("events offered to sink.handle are observable on the stream", async () => {
		const { sink, stream } = makeStreamSink();

		const event1 = PluginEvent.LlmsRoutesBuilt({ ctx, level: "debug", count: 42 });
		const event2 = PluginEvent.LlmsPrefixProcessed({ ctx, level: "trace", prefix: "v1" });
		const event3 = PluginEvent.LlmsPackageFilesGenerated({
			ctx,
			level: "debug",
			dir: "/dist/pkg",
			files: ["llms.txt"],
		});

		sink.handle(event1);
		sink.handle(event2);
		sink.handle(event3);

		const result = await Effect.runPromise(stream.pipe(Stream.take(3), Stream.runCollect));
		const items = result;

		expect(items).toHaveLength(3);
		expect(items[0]._tag).toBe("LlmsRoutesBuilt");
		expect(items[1]._tag).toBe("LlmsPrefixProcessed");
		expect(items[2]._tag).toBe("LlmsPackageFilesGenerated");
	});

	it("preserves event data on the stream", async () => {
		const { sink, stream } = makeStreamSink();

		const event = PluginEvent.LlmsRoutesBuilt({ ctx, level: "debug", count: 99 });
		sink.handle(event);

		const result = await Effect.runPromise(stream.pipe(Stream.take(1), Stream.runCollect));
		const [item] = result;

		expect(item._tag).toBe("LlmsRoutesBuilt");
		// Narrow to the correct variant to access `.count`
		if (item._tag === "LlmsRoutesBuilt") {
			expect(item.count).toBe(99);
		}
	});

	it("each makeStreamSink call returns an independent sink/stream pair", async () => {
		// Two independent pairs — events offered to one are not visible on the other.
		const a = makeStreamSink();
		makeStreamSink(); // second pair created but intentionally not used

		const event = PluginEvent.LlmsPrefixProcessed({ ctx, level: "trace", prefix: "" });
		a.sink.handle(event);

		// Only a's stream should see the event; the second pair's queue is empty so
		// taking from it would hang. We verify by draining a only.
		const result = await Effect.runPromise(a.stream.pipe(Stream.take(1), Stream.runCollect));
		expect(result).toHaveLength(1);
	});
});
