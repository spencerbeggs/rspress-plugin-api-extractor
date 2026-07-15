import fs from "node:fs";
import path from "node:path";
import type { PluginEvent } from "../events.js";
import type { EventSink } from "./types.js";

function openTracePath(p: string): void {
	fs.mkdirSync(path.dirname(p), { recursive: true });
	// Truncate any prior trace for this path.
	fs.writeFileSync(p, "");
}

/**
 * Create a JSONL trace sink.
 *
 * When `initialPath` is provided the file is opened eagerly at construction
 * (existing behaviour for an explicit `trace: "/some/path"` config).
 * When omitted the sink starts in deferred mode — events are silently dropped
 * until `setPath` is called.  This lets `plugin.ts` create the sink before
 * the RSPress `outDir` is known and then bind the real path in the `config()`
 * hook once `_config.outDir` is available.
 */
export function makeTraceSink(initialPath?: string): EventSink & { flush: () => void; setPath: (p: string) => void } {
	let currentPath: string | null = initialPath ?? null;
	if (currentPath) {
		openTracePath(currentPath);
	}
	return {
		minLevel: "trace",
		capturesPayload: true,
		handle: (event: PluginEvent) => {
			if (!currentPath) return;
			fs.appendFileSync(currentPath, `${JSON.stringify(event)}\n`);
		},
		flush: () => {
			// Synchronous appends mean nothing is buffered; flush is a no-op hook
			// kept for symmetry and future buffering.
		},
		setPath: (p: string) => {
			currentPath = p;
			openTracePath(p);
		},
	};
}
