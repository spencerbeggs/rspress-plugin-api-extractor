import { describe, expect, it } from "vitest";
import { TwoslashErrorStatsCollector } from "../../src/twoslash-error-stats.js";

describe("Bug: Twoslash error context clobbering (plugin.ts:575)", () => {
	it("recordError with explicit context overrides shared state", () => {
		const stats = new TwoslashErrorStatsCollector();

		// Simulate shared state pointing to wrong file
		stats.setContext({ file: "wrong-file.mdx", api: "wrong-api" });

		// Record error with explicit context (simulating per-worker context)
		stats.recordError(new Error("TS2440: Import conflicts"), "import { Foo } from 'bar';", {
			file: "correct-file.mdx",
			api: "correct-api",
			version: "1.0.0",
		});

		const summary = stats.getSummary();
		expect(summary.total).toBe(1);

		// Error should be attributed to the explicit context, not the shared state
		expect(summary.byFile?.["correct-file.mdx"]).toBe(1);
		expect(summary.byFile?.["wrong-file.mdx"]).toBeUndefined();
	});

	it("recordError falls back to shared context when no explicit context", () => {
		const stats = new TwoslashErrorStatsCollector();
		stats.setContext({ file: "shared-file.mdx", api: "shared-api" });

		// No explicit context — uses shared state (backward compatibility)
		stats.recordError(new Error("TS2304: Cannot find name"), "const x: Missing = 1;");

		const summary = stats.getSummary();
		expect(summary.byFile?.["shared-file.mdx"]).toBe(1);
	});
});

// Prettier error context clobbering tests removed:
// PrettierErrorStatsCollector replaced by Effect Metric.counter("prettier.errors")
