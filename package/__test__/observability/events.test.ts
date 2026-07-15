import { describe, expect, it } from "vitest";
import { LEVEL_RANK, PluginEvent, levelOf } from "../../src/observability/events.js";

const ctx = { buildId: "b1" };

describe("events", () => {
	it("ranks levels error<warn<info<debug<trace", () => {
		expect(LEVEL_RANK.error).toBeLessThan(LEVEL_RANK.warn);
		expect(LEVEL_RANK.info).toBeLessThan(LEVEL_RANK.debug);
		expect(LEVEL_RANK.debug).toBeLessThan(LEVEL_RANK.trace);
	});

	it("constructs a tagged event carrying ctx + level", () => {
		const e = PluginEvent.PhaseStarted({ ctx, level: "info", phase: "config" });
		expect(e._tag).toBe("PhaseStarted");
		expect(levelOf(e)).toBe("info");
		expect(e.ctx.buildId).toBe("b1");
	});

	it("provides tag guards via $is and discriminated access", () => {
		const e = PluginEvent.TwoslashDiagnostic({
			ctx,
			level: "warn",
			file: "a.ts",
			line: 1,
			col: 2,
			code: 2353,
			message: "x",
			snippet: "y",
		});
		// Effect's Data.taggedEnum().$match requires EXHAUSTIVE cases (no `_`
		// wildcard). Use $is guards / a switch on `_tag` for partial matching.
		expect(PluginEvent.$is("TwoslashDiagnostic")(e)).toBe(true);
		expect(PluginEvent.$is("PhaseStarted")(e)).toBe(false);
		expect(e.code).toBe(2353);
	});
});
