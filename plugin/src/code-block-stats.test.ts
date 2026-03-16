import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlockType } from "./code-block-stats.js";
import { CodeBlockStatsCollector } from "./code-block-stats.js";
import { DebugLogger } from "./debug-logger.js";

describe("CodeBlockStatsCollector", () => {
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;
	let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
		consoleWarnSpy.mockRestore();
	});

	describe("Constructor", () => {
		it("should use default slow threshold", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "info" });

			// Default threshold is 100ms, so 150ms should be slow
			collector.recordBlock(150, 100, 500);
			collector.logSummary(logger);

			// Should log warning about slow blocks
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("slow"));
		});

		it("should accept custom slow threshold", () => {
			const collector = new CodeBlockStatsCollector(200);
			const logger = new DebugLogger({ logLevel: "info" });

			// With 200ms threshold, 150ms is not slow
			collector.recordBlock(150, 100, 500);
			collector.logSummary(logger);

			// Should not log warning about slow blocks
			expect(consoleLogSpy).not.toHaveBeenCalled();
		});
	});

	describe("recordBlock", () => {
		it("should track basic statistics", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "debug" });

			collector.recordBlock(50, 40, 100);
			collector.recordBlock(75, 60, 200);
			collector.recordBlock(100, 80, 300);

			collector.logSummary(logger);

			// Check for summary output
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("3 total code blocks"));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Average: 75ms"));
		});

		it("should track twoslash blocks separately", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "debug" });

			collector.recordBlock(50, 40, 100);
			collector.recordBlock(75, 60, 200, { twoslashTime: 15 });
			collector.recordBlock(100, 80, 300, { twoslashTime: 20 });

			collector.logSummary(logger);

			// Should show twoslash statistics
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Twoslash blocks: 2"));
		});

		it("should track slowest and fastest times", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "debug" });

			collector.recordBlock(10, 8, 50);
			collector.recordBlock(150, 120, 500);
			collector.recordBlock(50, 40, 200);

			collector.logSummary(logger);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Slowest block: 150ms"));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Fastest block: 10ms"));
		});

		it("should identify slow blocks based on threshold", () => {
			const collector = new CodeBlockStatsCollector(100);
			const logger = new DebugLogger({ logLevel: "info" });

			collector.recordBlock(50, 40, 100); // Not slow
			collector.recordBlock(150, 120, 500); // Slow
			collector.recordBlock(200, 180, 1000); // Slow

			collector.logSummary(logger);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("2 of 3 blocks were slow"));
		});

		it("should track statistics by block type", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "verbose" });

			collector.recordBlock(50, 40, 100, { blockType: "signature" });
			collector.recordBlock(75, 60, 200, { blockType: "signature" });
			collector.recordBlock(100, 80, 300, { blockType: "example" });

			collector.logSummary(logger);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("signature: 2 blocks"));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("example: 1 blocks"));
		});

		it("should track twoslash time by block type", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "verbose" });

			collector.recordBlock(50, 40, 100, { blockType: "signature", twoslashTime: 10 });
			collector.recordBlock(75, 60, 200, { blockType: "signature", twoslashTime: 15 });
			collector.recordBlock(100, 80, 300, { blockType: "example" }); // No twoslash

			collector.logSummary(logger);

			// Signature should show twoslash avg, example should not
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/signature:.*twoslash/));
		});

		it("should store context for slow blocks", () => {
			const collector = new CodeBlockStatsCollector(50);
			const logger = new DebugLogger({ logLevel: "debug" });

			collector.recordBlock(100, 80, 500, {
				file: "docs/api/class.mdx",
				api: "my-api",
				version: "1.0.0",
				blockType: "signature",
			});

			collector.logSummary(logger);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("docs/api/class.mdx"));
		});
	});

	describe("logSlowBlock", () => {
		it("should log slow block with basic information", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "debug" });

			collector.logSlowBlock(logger, 150, 120, 500);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/Slow.*150ms.*shiki: 120ms.*500 chars/));
		});

		it("should include block type in log", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "debug" });

			collector.logSlowBlock(logger, 150, 120, 500, { blockType: "signature" });

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("[signature]"));
		});

		it("should include file path in log", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "debug" });

			collector.logSlowBlock(logger, 150, 120, 500, { file: "docs/api/class.mdx" });

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("docs/api/class.mdx"));
		});

		it("should include twoslash time when present", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "debug" });

			collector.logSlowBlock(logger, 150, 120, 500, { twoslashTime: 30 });

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("twoslash: 30ms"));
		});

		it("should not log below debug level", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "verbose" });

			collector.logSlowBlock(logger, 150, 120, 500);

			expect(consoleLogSpy).not.toHaveBeenCalled();
		});
	});

	describe("logSummary", () => {
		it("should not log anything when no blocks recorded", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "debug" });

			collector.logSummary(logger);

			expect(consoleLogSpy).not.toHaveBeenCalled();
		});

		describe("INFO Level", () => {
			it("should log warning when there are slow blocks", () => {
				const collector = new CodeBlockStatsCollector(50);
				const logger = new DebugLogger({ logLevel: "info" });

				collector.recordBlock(100, 80, 500);
				collector.recordBlock(150, 120, 1000);
				collector.logSummary(logger);

				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("2 of 2 blocks were slow"));
			});

			it("should not log when there are no slow blocks", () => {
				const collector = new CodeBlockStatsCollector(200);
				const logger = new DebugLogger({ logLevel: "info" });

				collector.recordBlock(50, 40, 500);
				collector.recordBlock(75, 60, 1000);
				collector.logSummary(logger);

				expect(consoleLogSpy).not.toHaveBeenCalled();
			});

			it("should calculate slow percentage correctly", () => {
				const collector = new CodeBlockStatsCollector(100);
				const logger = new DebugLogger({ logLevel: "info" });

				collector.recordBlock(50, 40, 100); // Not slow
				collector.recordBlock(150, 120, 500); // Slow
				collector.recordBlock(75, 60, 200); // Not slow
				collector.recordBlock(200, 180, 1000); // Slow

				collector.logSummary(logger);

				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("2 of 4 blocks were slow (50.0%"));
			});
		});

		describe("VERBOSE Level", () => {
			it("should log summary statistics", () => {
				const collector = new CodeBlockStatsCollector();
				const logger = new DebugLogger({ logLevel: "verbose" });

				collector.recordBlock(50, 40, 100);
				collector.recordBlock(100, 80, 200);

				collector.logSummary(logger);

				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Processed 2 total code blocks"));
				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Average: 75ms per block"));
			});

			it("should show block type breakdown", () => {
				const collector = new CodeBlockStatsCollector();
				const logger = new DebugLogger({ logLevel: "verbose" });

				collector.recordBlock(50, 40, 100, { blockType: "signature" });
				collector.recordBlock(75, 60, 200, { blockType: "example" });

				collector.logSummary(logger);

				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("By block type"));
				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/signature:.*1 blocks/));
				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/example:.*1 blocks/));
			});

			it("should show slow block count at verbose level", () => {
				const collector = new CodeBlockStatsCollector(50);
				const logger = new DebugLogger({ logLevel: "verbose" });

				collector.recordBlock(100, 80, 500);
				collector.logSummary(logger);

				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("1 slow blocks"));
			});
		});

		describe("DEBUG Level", () => {
			it("should log detailed statistics", () => {
				const collector = new CodeBlockStatsCollector();
				const logger = new DebugLogger({ logLevel: "debug" });

				collector.recordBlock(50, 40, 100);
				collector.recordBlock(100, 80, 200);

				collector.logSummary(logger);

				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Code block processing statistics"));
				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Total blocks: 2"));
				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Total time: 150ms"));
				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Average Shiki time: 60ms"));
			});

			it("should show twoslash statistics when present", () => {
				const collector = new CodeBlockStatsCollector();
				const logger = new DebugLogger({ logLevel: "debug" });

				collector.recordBlock(50, 40, 100, { twoslashTime: 10 });
				collector.recordBlock(75, 60, 200, { twoslashTime: 15 });
				collector.recordBlock(100, 80, 300); // No twoslash

				collector.logSummary(logger);

				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Twoslash blocks: 2 (66.7%)"));
				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Average Twoslash time: 13ms"));
			});

			it("should show top slowest blocks", () => {
				const collector = new CodeBlockStatsCollector(50);
				const logger = new DebugLogger({ logLevel: "debug" });

				collector.recordBlock(150, 120, 500, { file: "file1.mdx" });
				collector.recordBlock(200, 180, 1000, { file: "file2.mdx" });
				collector.recordBlock(100, 80, 300, { file: "file3.mdx" });

				collector.logSummary(logger);

				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Top 3 slowest blocks"));
				// Should be sorted by time, so file2 (200ms) should be first
				const calls = consoleLogSpy.mock.calls.map((call: unknown[]) => call[0]).join("\n");
				const file2Index = calls.indexOf("file2.mdx");
				const file1Index = calls.indexOf("file1.mdx");
				expect(file2Index).toBeLessThan(file1Index);
			});

			it("should limit to top 10 slowest blocks", () => {
				const collector = new CodeBlockStatsCollector(10);
				const logger = new DebugLogger({ logLevel: "debug" });

				// Record 15 slow blocks
				for (let i = 0; i < 15; i++) {
					collector.recordBlock(100 + i * 10, 80, 500, { file: `file${i}.mdx` });
				}

				collector.logSummary(logger);

				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Top 10 slowest blocks"));
			});
		});
	});

	describe("formatContext", () => {
		it("should prefer file path", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "debug" });

			collector.recordBlock(150, 120, 500, {
				file: "docs/api/class.mdx",
				api: "my-api",
				version: "1.0.0",
			});

			collector.logSummary(logger);

			// Should show file path, not api/version
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("docs/api/class.mdx"));
		});

		it("should format api and version when no file", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "debug" });

			collector.recordBlock(150, 120, 500, {
				api: "my-api",
				version: "1.0.0",
			});

			collector.logSummary(logger);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("[my-api/1.0.0]"));
		});

		it("should handle only api without version", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "debug" });

			collector.recordBlock(150, 120, 500, { api: "my-api" });

			collector.logSummary(logger);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("[my-api]"));
		});

		it("should return empty string when no context", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "debug" });

			collector.recordBlock(150, 120, 500);

			collector.logSummary(logger);

			// Should still log but without context info
			expect(consoleLogSpy).toHaveBeenCalled();
		});
	});

	describe("All BlockTypes", () => {
		it("should track all block types correctly", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "verbose" });

			const blockTypes: BlockType[] = ["signature", "member-signature", "example", "vfs"];

			for (const blockType of blockTypes) {
				collector.recordBlock(50, 40, 100, { blockType });
			}

			collector.logSummary(logger);

			for (const blockType of blockTypes) {
				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`${blockType}:`));
			}
		});
	});

	describe("Edge Cases", () => {
		it("should handle zero time", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "debug" });

			collector.recordBlock(0, 0, 0);

			collector.logSummary(logger);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Average: 0ms"));
		});

		it("should handle very large numbers", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "debug" });

			collector.recordBlock(99999, 88888, 1000000);

			collector.logSummary(logger);

			expect(consoleLogSpy).toHaveBeenCalled();
		});

		it("should handle single block", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "debug" });

			collector.recordBlock(50, 40, 100);

			collector.logSummary(logger);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Processed 1 total code blocks"));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Slowest block: 50ms"));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Fastest block: 50ms"));
		});

		it("should calculate averages correctly with mixed twoslash", () => {
			const collector = new CodeBlockStatsCollector();
			const logger = new DebugLogger({ logLevel: "debug" });

			collector.recordBlock(100, 80, 500, { twoslashTime: 20 });
			collector.recordBlock(50, 40, 200); // No twoslash
			collector.recordBlock(75, 60, 300, { twoslashTime: 15 });

			collector.logSummary(logger);

			// Average twoslash should be (20 + 15) / 2 = 17.5ms, not divided by 3
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringMatching(/Average Twoslash time: 1[78]ms per block \(2 blocks\)/),
			);
		});
	});
});
