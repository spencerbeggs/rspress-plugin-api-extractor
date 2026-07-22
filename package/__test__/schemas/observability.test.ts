import { describe, expect, it } from "vitest";
import { resolveObservability } from "../../src/schemas/observability.js";

describe("resolveObservability", () => {
	it("defaults to info, no trace, no json", () => {
		const { resolved, deprecations } = resolveObservability({ cwd: "/o", buildId: "b1" });
		expect(resolved.logLevel).toBe("info");
		expect(resolved.json).toBe(false);
		expect(resolved.tracePath).toBeNull();
		expect(deprecations).toHaveLength(0);
	});

	it("maps verbose→debug and debug→json", () => {
		const { resolved } = resolveObservability({ observability: { logLevel: "debug" }, cwd: "/o", buildId: "b1" });
		expect(resolved.logLevel).toBe("debug");
		expect(resolved.json).toBe(true);
	});

	it("resolves trace:true to the default path", () => {
		const { resolved } = resolveObservability({ observability: { trace: true }, cwd: "/o", buildId: "b1" });
		expect(resolved.tracePath).toBe("/o/.api-docs/build/trace-b1.jsonl");
	});

	it("honors a custom trace path string", () => {
		const { resolved } = resolveObservability({
			observability: { trace: "/tmp/t.jsonl" },
			cwd: "/o",
			buildId: "b1",
		});
		expect(resolved.tracePath).toBe("/tmp/t.jsonl");
	});

	it("env > observability > legacy logLevel and flags legacy as deprecated", () => {
		const r1 = resolveObservability({ logLevel: "warn", cwd: "/o", buildId: "b1" });
		expect(r1.resolved.logLevel).toBe("warn");
		expect(r1.deprecations.map((d) => d.key)).toContain("logLevel");

		const r2 = resolveObservability({
			observability: { logLevel: "error" },
			logLevel: "warn",
			envLogLevel: "debug",
			cwd: "/o",
			buildId: "b1",
		});
		expect(r2.resolved.logLevel).toBe("debug");
	});
});

describe("resolveObservability trace path", () => {
	it("derives the default trace path under <cwd>/.api-docs", () => {
		const { resolved } = resolveObservability({
			observability: { trace: true },
			cwd: "/repo",
			buildId: "bid",
		});
		expect(resolved.tracePath).toBe("/repo/.api-docs/build/trace-bid.jsonl");
	});

	it("passes an explicit string trace path through unchanged", () => {
		const { resolved } = resolveObservability({
			observability: { trace: "/tmp/custom.jsonl" },
			cwd: "/repo",
			buildId: "bid",
		});
		expect(resolved.tracePath).toBe("/tmp/custom.jsonl");
	});
});

describe("resolveObservability progressInterval", () => {
	const base = { cwd: "/repo", buildId: "bid" };
	it("defaults to 10000ms", () => {
		expect(resolveObservability({ ...base }).resolved.progressIntervalMs).toBe(10_000);
	});
	it("disables on false", () => {
		expect(
			resolveObservability({ ...base, observability: { progressInterval: false } }).resolved.progressIntervalMs,
		).toBeNull();
	});
	it("disables on 0", () => {
		expect(
			resolveObservability({ ...base, observability: { progressInterval: 0 } }).resolved.progressIntervalMs,
		).toBeNull();
	});
	it("disables on a negative interval (no runaway negative sleep)", () => {
		expect(
			resolveObservability({ ...base, observability: { progressInterval: -5 } }).resolved.progressIntervalMs,
		).toBeNull();
	});
	it("disables on a non-finite interval (NaN or Infinity)", () => {
		expect(
			resolveObservability({ ...base, observability: { progressInterval: Number.NaN } }).resolved.progressIntervalMs,
		).toBeNull();
		expect(
			resolveObservability({ ...base, observability: { progressInterval: Number.POSITIVE_INFINITY } }).resolved
				.progressIntervalMs,
		).toBeNull();
	});
	it("converts seconds to ms", () => {
		expect(resolveObservability({ ...base, observability: { progressInterval: 5 } }).resolved.progressIntervalMs).toBe(
			5_000,
		);
	});
});
