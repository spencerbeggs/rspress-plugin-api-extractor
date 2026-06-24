import fs from "node:fs";
import path from "node:path";
import type { PluginEvent } from "../events.js";
import type { EventSink } from "./types.js";

export function makeTraceSink(filePath: string): EventSink & { flush: () => void } {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	// Truncate any prior trace for this path at construction.
	fs.writeFileSync(filePath, "");
	return {
		minLevel: "trace",
		capturesPayload: true,
		handle: (event: PluginEvent) => {
			fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`);
		},
		flush: () => {
			// Synchronous appends mean nothing is buffered; flush is a no-op hook
			// kept for symmetry and future buffering.
		},
	};
}
