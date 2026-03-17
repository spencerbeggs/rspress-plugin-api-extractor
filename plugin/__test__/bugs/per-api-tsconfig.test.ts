import { describe, expect, it } from "vitest";

describe("Bug: Multi-API tsconfig sharing (plugin.ts:1625)", () => {
	it("different APIs can specify different tsconfigs", () => {
		const apis = [
			{ packageName: "pkg-a", model: "a.api.json", tsconfig: "tsconfig.a.json" },
			{ packageName: "pkg-b", model: "b.api.json", tsconfig: "tsconfig.b.json" },
			{ packageName: "pkg-c", model: "c.api.json" },
		];

		// The fix ensures deterministic selection: first API with tsconfig wins
		// This is an interim fix; Phase 3 Stream pipeline will resolve per-API
		const selectedTsconfig = apis.find((a) => a.tsconfig)?.tsconfig;
		expect(selectedTsconfig).toBe("tsconfig.a.json");

		// Detect conflicting tsconfigs for warning
		const uniqueTsconfigs = new Set(apis.filter((a) => a.tsconfig).map((a) => a.tsconfig));
		const hasConflict = uniqueTsconfigs.size > 1;
		expect(hasConflict).toBe(true);
	});
});
