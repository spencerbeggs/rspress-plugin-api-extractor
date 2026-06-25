import type { EventLevel, PluginEvent } from "../events.js";

export interface EventSink {
	readonly minLevel: EventLevel;
	readonly handle: (event: PluginEvent) => void;
	/**
	 * When `true`, this sink serializes event payloads (writes JSON, strings,
	 * or structured data derived from the full event). The EventBus uses this
	 * flag to compute `maxAdmitted` — only payload-capturing sinks drive the
	 * `wantsLevel` hint. Scalar-only sinks (e.g. metrics) omit this field so
	 * callers are not forced to build expensive payloads just to update a counter.
	 */
	readonly capturesPayload?: boolean;
}
