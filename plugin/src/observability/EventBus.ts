import { Context, Effect, Layer, Option } from "effect";
import type { EventLevel, PluginEvent } from "./events.js";
import { LEVEL_RANK, levelOf } from "./events.js";
import type { EventSink } from "./sinks/types.js";

export interface EventBusShape {
	readonly emit: (event: PluginEvent) => Effect.Effect<void>;
	readonly wantsLevel: (level: EventLevel) => Effect.Effect<boolean>;
}

export class EventBus extends Context.Tag("rspress-plugin-api-extractor/EventBus")<EventBus, EventBusShape>() {}

function makeShape(sinks: readonly EventSink[]): EventBusShape {
	// Only sinks that serialize payloads drive the wantsLevel hint. Scalar-only
	// sinks (e.g. metrics) omit capturesPayload so callers are not forced to
	// build expensive string/JSON payloads just to update a counter.
	const maxAdmitted = sinks
		.filter((s) => s.capturesPayload === true)
		.reduce((max, s) => Math.max(max, LEVEL_RANK[s.minLevel]), -1);
	return {
		emit: (event) =>
			Effect.sync(() => {
				const rank = LEVEL_RANK[levelOf(event)];
				for (const sink of sinks) {
					if (rank <= LEVEL_RANK[sink.minLevel]) sink.handle(event);
				}
			}),
		wantsLevel: (level) => Effect.succeed(LEVEL_RANK[level] <= maxAdmitted),
	};
}

export function makeEventBusLayer(sinks: readonly EventSink[]): Layer.Layer<EventBus> {
	return Layer.succeed(EventBus, makeShape(sinks));
}

/** No sinks: every emit is a no-op, wantsLevel always false. */
export const EventBusNoop: Layer.Layer<EventBus> = makeEventBusLayer([]);

/** Emit when a bus is in context; silently no-op otherwise. */
export function emit(event: PluginEvent): Effect.Effect<void> {
	return Effect.serviceOption(EventBus).pipe(
		Effect.flatMap((maybe) => (Option.isSome(maybe) ? maybe.value.emit(event) : Effect.void)),
	);
}

/**
 * Returns true when a bus is in context and has at least one sink admitted at
 * `level`; false otherwise. R = never, safe to use anywhere emit is used.
 */
export function wantsLevel(level: EventLevel): Effect.Effect<boolean> {
	return Effect.serviceOption(EventBus).pipe(
		Effect.flatMap((maybe) => (Option.isSome(maybe) ? maybe.value.wantsLevel(level) : Effect.succeed(false))),
	);
}

/** Bind a runtime so non-Effect (sync island) callbacks can emit. */
export function makeRuntimeEmitter(runtime: {
	runSync: (effect: Effect.Effect<void>) => void;
}): (event: PluginEvent) => void {
	return (event) => runtime.runSync(emit(event));
}
