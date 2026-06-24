import type { EventSink } from "./types.js";

// Phase 1 stub — replaced by event-derived metrics in Task 12.
export function makeMetricsSink(): EventSink {
	return { minLevel: "trace", handle: () => {} };
}
