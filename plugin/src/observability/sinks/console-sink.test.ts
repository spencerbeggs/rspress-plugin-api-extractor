import { describe, expect, it, vi } from "vitest";
import { PluginEvent } from "../events.js";
import { makeConsoleSink } from "./console-sink.js";

const ctx = { buildId: "b1" };
const fixedNow = () => new Date("2026-06-24T15:23:45.000Z");

describe("makeConsoleSink", () => {
	it("drops events below the configured level", () => {
		const sink = makeConsoleSink("info", { now: fixedNow });
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		sink.handle(PluginEvent.CrossLinkApplied({ ctx, level: "trace", from: "A", to: "B", route: "/r" }));
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});

	it("renders an at-level event in human mode", () => {
		const sink = makeConsoleSink("info", { now: fixedNow });
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		sink.handle(PluginEvent.PhaseCompleted({ ctx, level: "info", phase: "generate", durationMs: 42 }));
		expect(spy).toHaveBeenCalledOnce();
		expect(spy.mock.calls[0][0]).toContain("generate");
		spy.mockRestore();
	});

	it("emits one JSON line in json mode", () => {
		const sink = makeConsoleSink("debug", { json: true, now: fixedNow });
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		sink.handle(PluginEvent.PhaseStarted({ ctx, level: "info", phase: "config" }));
		const parsed = JSON.parse(spy.mock.calls[0][0] as string);
		expect(parsed._tag).toBe("PhaseStarted");
		expect(parsed.phase).toBe("config");
		spy.mockRestore();
	});

	it("is a no-op when level is none", () => {
		const sink = makeConsoleSink("none", { now: fixedNow });
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		sink.handle(PluginEvent.BuildFailed({ ctx, level: "error", phase: "config", error: "boom" }));
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});
});
