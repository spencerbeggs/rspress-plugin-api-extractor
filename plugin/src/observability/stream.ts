import { Effect, Queue, Stream } from "effect";
import type { PluginEvent } from "./events.js";
import type { EventSink } from "./sinks/types.js";

/**
 * A programmatic Stream tee for the event bus.
 *
 * `makeStreamSink` creates an `EventSink` backed by a bounded sliding
 * `Queue<PluginEvent>` (capacity 1024). When the queue is full the oldest
 * entry is silently dropped — this path carries no lossless guarantee.
 *
 * The companion `stream` drains events from that queue. Consumers can use
 * `Stream.take(n)` + `Stream.runCollect` for buffered reads or
 * `Stream.runForEach` for a continuous tap.
 *
 * Wiring into the live plugin layer is deferred; export the sink from
 * `makeStreamSink` and compose it with `makeEventBusLayer` at the call site
 * when needed.
 */
export interface StreamSink {
	readonly sink: EventSink;
	readonly stream: Stream.Stream<PluginEvent>;
}

/**
 * Create a new independent sink / stream pair backed by a sliding queue.
 * Each call returns a fresh, isolated pair — safe to call multiple times.
 */
export function makeStreamSink(): StreamSink {
	const queue = Effect.runSync(Queue.sliding<PluginEvent>(1024));

	const sink: EventSink = {
		minLevel: "trace",
		capturesPayload: true,
		handle(event: PluginEvent): void {
			// Queue.offer on a sliding queue never suspends — it drops the oldest
			// entry when full — so Effect.runSync is safe here.
			Effect.runSync(Queue.offer(queue, event));
		},
	};

	const stream = Stream.fromQueue(queue);

	return { sink, stream };
}
