import { describe, expect, it } from "vitest";
import { resolveObservability } from "../../src/schemas/observability.js";

describe("resolveObservability", () => {
	it("defaults to info, no trace, no json", () => {
		const { resolved, deprecations } = resolveObservability({ outDir: "/o", buildId: "b1" });
		expect(resolved.logLevel).toBe("info");
		expect(resolved.json).toBe(false);
		expect(resolved.tracePath).toBeNull();
		expect(deprecations).toHaveLength(0);
	});

	it("maps verbose→debug and debug→json", () => {
		const { resolved } = resolveObservability({ observability: { logLevel: "debug" }, outDir: "/o", buildId: "b1" });
		expect(resolved.logLevel).toBe("debug");
		expect(resolved.json).toBe(true);
	});

	it("resolves trace:true to the default path", () => {
		const { resolved } = resolveObservability({ observability: { trace: true }, outDir: "/o", buildId: "b1" });
		expect(resolved.tracePath).toBe("/o/.api-extractor/trace-b1.jsonl");
	});

	it("honors a custom trace path string", () => {
		const { resolved } = resolveObservability({
			observability: { trace: "/tmp/t.jsonl" },
			outDir: "/o",
			buildId: "b1",
		});
		expect(resolved.tracePath).toBe("/tmp/t.jsonl");
	});

	it("env > observability > legacy logLevel and flags legacy as deprecated", () => {
		const r1 = resolveObservability({ logLevel: "warn", outDir: "/o", buildId: "b1" });
		expect(r1.resolved.logLevel).toBe("warn");
		expect(r1.deprecations.map((d) => d.key)).toContain("logLevel");

		const r2 = resolveObservability({
			observability: { logLevel: "error" },
			logLevel: "warn",
			envLogLevel: "debug",
			outDir: "/o",
			buildId: "b1",
		});
		expect(r2.resolved.logLevel).toBe("debug");
	});
});
