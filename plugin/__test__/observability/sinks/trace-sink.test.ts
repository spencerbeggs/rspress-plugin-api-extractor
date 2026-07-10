import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PluginEvent } from "../../../src/observability/events.js";
import { makeTraceSink } from "../../../src/observability/sinks/trace-sink.js";

const ctx = { buildId: "b1" };
let dir: string | undefined;

afterEach(() => {
	if (dir) fs.rmSync(dir, { recursive: true, force: true });
	dir = undefined;
});

describe("makeTraceSink", () => {
	it("writes one JSONL line per event and admits all levels", () => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-"));
		const file = path.join(dir, "nested", "trace.jsonl");
		const sink = makeTraceSink(file);
		expect(sink.minLevel).toBe("trace");
		sink.handle(PluginEvent.PhaseStarted({ ctx, level: "info", phase: "config" }));
		sink.handle(
			PluginEvent.TwoslashDiagnostic({
				ctx,
				level: "warn",
				file: "a.ts",
				line: 1,
				col: 2,
				code: 2353,
				message: "x",
				snippet: "y",
			}),
		);
		sink.flush();
		const lines = fs.readFileSync(file, "utf8").trim().split("\n");
		expect(lines).toHaveLength(2);
		expect(JSON.parse(lines[0])._tag).toBe("PhaseStarted");
		expect(JSON.parse(lines[1]).code).toBe(2353);
	});
});
