import type { EventLevel, PluginEvent } from "../events.js";

export interface EventSink {
	readonly minLevel: EventLevel;
	readonly handle: (event: PluginEvent) => void;
}
