import { describe, expect, it, vi } from "vitest";
import { PluginEvent } from "../events.js";
import { makeConsoleSink } from "./console-sink.js";

const ctx = { buildId: "b1" };
const fixedNow = () => new Date("2026-06-24T15:23:45.000Z");

/** Capture the single console.log line produced by handling one event at `trace` level. */
function renderLine(event: PluginEvent): string {
	const sink = makeConsoleSink("trace", { now: fixedNow });
	const spy = vi.spyOn(console, "log").mockImplementation(() => {});
	sink.handle(event);
	expect(spy).toHaveBeenCalledOnce();
	const line = spy.mock.calls[0][0] as string;
	spy.mockRestore();
	return line;
}

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
		expect(parsed.timestamp).toBe(fixedNow().getTime());
		spy.mockRestore();
	});

	it("is a no-op when level is none", () => {
		const sink = makeConsoleSink("none", { now: fixedNow });
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		sink.handle(PluginEvent.BuildFailed({ ctx, level: "error", phase: "config", error: "boom" }));
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});

	it("defaults json to false and now to the wall clock", () => {
		const sink = makeConsoleSink("info");
		expect(sink.minLevel).toBe("info");
		expect(sink.capturesPayload).toBe(false);
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		sink.handle(PluginEvent.PhaseStarted({ ctx, level: "info", phase: "resolve" }));
		expect(spy).toHaveBeenCalledOnce();
		expect(spy.mock.calls[0][0]).toContain("resolve");
		spy.mockRestore();
	});

	it("reports minLevel 'error' and capturesPayload false for the 'none' sink", () => {
		const sink = makeConsoleSink("none");
		expect(sink.minLevel).toBe("error");
		expect(sink.capturesPayload).toBe(false);
	});

	it("sets capturesPayload true in json mode", () => {
		const sink = makeConsoleSink("debug", { json: true });
		expect(sink.capturesPayload).toBe(true);
	});

	describe("level prefixes (human mode)", () => {
		it("prefixes error events with the red marker", () => {
			const line = renderLine(PluginEvent.BuildFailed({ ctx, level: "error", phase: "config", error: "boom" }));
			expect(line).toContain("🔴 ");
		});

		it("prefixes warn events with the warning marker", () => {
			const line = renderLine(
				PluginEvent.ConfigCascadeWarning({ ctx, level: "warn", field: "baseRoute", chosen: "/a", ignored: ["/b"] }),
			);
			expect(line).toContain("⚠️");
		});

		it("uses no prefix for info events and includes the formatted time", () => {
			const line = renderLine(PluginEvent.PhaseStarted({ ctx, level: "info", phase: "write" }));
			expect(line).not.toContain("🔴");
			expect(line).not.toContain("⚠️");
			expect(line).toMatch(/^\[\d{2}:\d{2}:\d{2}\] → write$/);
		});
	});

	describe("render() per variant (human mode)", () => {
		it("BuildStarted singular", () => {
			expect(renderLine(PluginEvent.BuildStarted({ ctx, level: "info", mode: "prod", apiCount: 1 }))).toContain(
				"1 API)",
			);
		});

		it("BuildStarted plural", () => {
			expect(renderLine(PluginEvent.BuildStarted({ ctx, level: "info", mode: "prod", apiCount: 3 }))).toContain(
				"3 APIs)",
			);
		});

		it("PhaseStarted", () => {
			expect(renderLine(PluginEvent.PhaseStarted({ ctx, level: "info", phase: "generate" }))).toContain("→ generate");
		});

		it("PhaseCompleted", () => {
			expect(renderLine(PluginEvent.PhaseCompleted({ ctx, level: "info", phase: "write", durationMs: 12 }))).toContain(
				"✓ write (12ms)",
			);
		});

		it("BuildCompleted", () => {
			expect(
				renderLine(PluginEvent.BuildCompleted({ ctx, level: "info", durationMs: 2500, totals: { files: 4 } })),
			).toContain("2.50s");
		});

		it("BuildFailed", () => {
			expect(renderLine(PluginEvent.BuildFailed({ ctx, level: "error", phase: "resolve", error: "nope" }))).toContain(
				"Error in resolve: nope",
			);
		});

		it("SlowOperation", () => {
			expect(
				renderLine(
					PluginEvent.SlowOperation({ ctx, level: "warn", operation: "load", durationMs: 900, threshold: 500 }),
				),
			).toContain("slow load: 900ms (>500ms)");
		});

		it("ConfigCascadeWarning", () => {
			expect(
				renderLine(
					PluginEvent.ConfigCascadeWarning({ ctx, level: "warn", field: "route", chosen: "/x", ignored: ["/y", "/z"] }),
				),
			).toContain("route: using '/x', ignoring /y, /z");
		});

		it("ConfigValidationWarning with reason", () => {
			expect(
				renderLine(
					PluginEvent.ConfigValidationWarning({ ctx, level: "warn", field: "port", value: "abc", reason: "NaN" }),
				),
			).toContain("port: rejected 'abc' — NaN");
		});

		it("ConfigValidationWarning without reason", () => {
			const line = renderLine(
				PluginEvent.ConfigValidationWarning({ ctx, level: "warn", field: "port", value: "abc", reason: "" }),
			);
			expect(line).toContain("port: rejected 'abc'");
			expect(line).not.toContain("—");
		});

		it("DeprecatedConfigUsed", () => {
			expect(
				renderLine(PluginEvent.DeprecatedConfigUsed({ ctx, level: "warn", key: "old", replacement: "new" })),
			).toContain("option 'old' is deprecated; use new");
		});

		it("ModelLoaded", () => {
			expect(
				renderLine(PluginEvent.ModelLoaded({ ctx, level: "info", entryPoints: 2, itemCount: 17, durationMs: 30 })),
			).toContain("loaded model: 17 items, 2 entry point(s) (30ms)");
		});

		it("ConfigResolved", () => {
			expect(
				renderLine(
					PluginEvent.ConfigResolved({ ctx, level: "info", baseRoute: "/api", categoryCount: 5, externalCount: 1 }),
				),
			).toContain("resolved /api: 5 categories, 1 external");
		});

		it("TwoslashDiagnostic", () => {
			expect(
				renderLine(
					PluginEvent.TwoslashDiagnostic({
						ctx,
						level: "warn",
						file: "f.mdx",
						line: 3,
						col: 7,
						code: 2304,
						message: "Cannot find name",
						snippet: "x",
					}),
				),
			).toContain("Twoslash TS2304 in f.mdx:3:7: Cannot find name");
		});

		it("TwoslashCheckFailed", () => {
			expect(
				renderLine(
					PluginEvent.TwoslashCheckFailed({
						ctx,
						level: "trace",
						file: "f.mdx",
						code: 2304,
						fsMapKeys: ["a.d.ts", "b.d.ts"],
						compilerOptions: "{}",
					}),
				),
			).toContain("Twoslash check failed (TS2304) in f.mdx; 2 VFS files");
		});

		it("PageGenerated", () => {
			expect(
				renderLine(
					PluginEvent.PageGenerated({
						ctx,
						level: "info",
						item: "Pipeline",
						category: "class",
						codeblockCount: 1,
						durationMs: 8,
					}),
				),
			).toContain("page class/Pipeline (8ms)");
		});

		it("FileDecision", () => {
			expect(
				renderLine(
					PluginEvent.FileDecision({
						ctx,
						level: "debug",
						file: "class/foo.mdx",
						status: "new",
						contentHash: "a",
						frontmatterHash: "b",
						source: "snapshot",
					}),
				),
			).toContain("new: class/foo.mdx");
		});

		it("ItemSkipped", () => {
			expect(
				renderLine(PluginEvent.ItemSkipped({ ctx, level: "debug", item: "Foo", kind: "Class", reason: "no docs" })),
			).toContain('skipped Class "Foo": no docs');
		});

		it("ShikiError", () => {
			expect(renderLine(PluginEvent.ShikiError({ ctx, level: "warn", file: "f.mdx", reason: "bad lang" }))).toContain(
				"Shiki error in f.mdx: bad lang",
			);
		});

		it("PrettierError", () => {
			expect(renderLine(PluginEvent.PrettierError({ ctx, level: "warn", file: "f.mdx", reason: "syntax" }))).toContain(
				"Prettier error in f.mdx: syntax",
			);
		});

		it("LlmsPackageFilesGenerated", () => {
			expect(
				renderLine(
					PluginEvent.LlmsPackageFilesGenerated({ ctx, level: "info", dir: "kitchensink", files: ["a", "b"] }),
				),
			).toContain("llms files: kitchensink (2)");
		});

		it("TypeRegistryEvent BatchComplete renders the detail directly", () => {
			expect(
				renderLine(PluginEvent.TypeRegistryEvent({ ctx, level: "info", kind: "BatchComplete", detail: "all done" })),
			).toContain("all done");
		});

		it("TypeRegistryEvent other kind includes packageName from ctx", () => {
			const line = renderLine(
				PluginEvent.TypeRegistryEvent({
					ctx: { buildId: "b1", packageName: "zod" },
					level: "info",
					kind: "Fetch",
					detail: "downloading",
				}),
			);
			expect(line).toContain("Fetch zod downloading");
		});

		it("TypeRegistryEvent other kind falls back to empty packageName when absent", () => {
			const line = renderLine(
				PluginEvent.TypeRegistryEvent({ ctx, level: "info", kind: "Fetch", detail: "downloading" }),
			);
			expect(line).toContain("Fetch  downloading");
		});

		it("falls back to the bare tag for unhandled variants", () => {
			expect(
				renderLine(PluginEvent.CrossLinkApplied({ ctx, level: "info", from: "A", to: "B", route: "/r" })),
			).toContain("CrossLinkApplied");
		});
	});
});
