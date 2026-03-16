import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DebugLogger } from "./debug-logger.js";
import { FileGenerationStatsCollector } from "./file-generation-stats.js";

describe("FileGenerationStatsCollector", () => {
	let collector: FileGenerationStatsCollector;
	let mockLogger: DebugLogger;

	beforeEach(() => {
		collector = new FileGenerationStatsCollector();
		mockLogger = {
			info: vi.fn(),
			verbose: vi.fn(),
			debug: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		} as unknown as DebugLogger;
	});

	describe("recordFile", () => {
		it("should record a new file", () => {
			collector.recordFile("class/myclass.mdx", "/docs/api/class/myclass.mdx", "new");

			collector.logSummary(mockLogger);

			expect(mockLogger.info).toHaveBeenCalledWith("📝 Generated 1 files (1 new/modified, 0 unchanged)");
		});

		it("should record an unchanged file", () => {
			collector.recordFile("class/myclass.mdx", "/docs/api/class/myclass.mdx", "unchanged");

			collector.logSummary(mockLogger);

			expect(mockLogger.info).toHaveBeenCalledWith("📝 Generated 1 files (all unchanged)");
		});

		it("should record a modified file", () => {
			collector.recordFile("class/myclass.mdx", "/docs/api/class/myclass.mdx", "modified");

			collector.logSummary(mockLogger);

			expect(mockLogger.info).toHaveBeenCalledWith("📝 Generated 1 files (1 new/modified, 0 unchanged)");
		});

		it("should record multiple files with mixed statuses", () => {
			collector.recordFile("class/class1.mdx", "/docs/api/class/class1.mdx", "new");
			collector.recordFile("class/class2.mdx", "/docs/api/class/class2.mdx", "unchanged");
			collector.recordFile("class/class3.mdx", "/docs/api/class/class3.mdx", "modified");
			collector.recordFile("interface/interface1.mdx", "/docs/api/interface/interface1.mdx", "unchanged");

			collector.logSummary(mockLogger);

			expect(mockLogger.info).toHaveBeenCalledWith("📝 Generated 4 files (2 new/modified, 2 unchanged)");
		});

		it("should track files by API", () => {
			collector.recordFile("class/class1.mdx", "/docs/api/class/class1.mdx", "new", {
				api: "my-api",
			});
			collector.recordFile("class/class2.mdx", "/docs/api/class/class2.mdx", "unchanged", {
				api: "my-api",
			});

			collector.logSummary(mockLogger);

			expect(mockLogger.verbose).toHaveBeenCalledWith("   By API:");
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - my-api: 2 files (1 new/modified, 1 unchanged)");
		});

		it("should track files by API with version", () => {
			collector.recordFile("class/class1.mdx", "/docs/api/class/class1.mdx", "new", {
				api: "my-api",
				version: "v1.0.0",
			});
			collector.recordFile("class/class2.mdx", "/docs/api/class/class2.mdx", "unchanged", {
				api: "my-api",
				version: "v1.0.0",
			});

			collector.logSummary(mockLogger);

			expect(mockLogger.verbose).toHaveBeenCalledWith("     - my-api (v1.0.0): 2 files (1 new/modified, 1 unchanged)");
		});

		it("should track files by category", () => {
			collector.recordFile("class/class1.mdx", "/docs/api/class/class1.mdx", "new", {
				category: "class",
			});
			collector.recordFile("class/class2.mdx", "/docs/api/class/class2.mdx", "unchanged", {
				category: "class",
			});
			collector.recordFile("interface/interface1.mdx", "/docs/api/interface/interface1.mdx", "modified", {
				category: "interface",
			});

			collector.logSummary(mockLogger);

			expect(mockLogger.verbose).toHaveBeenCalledWith("   By category:");
			// Categories sorted alphabetically
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - class: 2 files (1 new/modified, 1 unchanged)");
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - interface: 1 files (1 new/modified, 0 unchanged)");
		});

		it("should sort categories alphabetically", () => {
			collector.recordFile("type/type1.mdx", "/docs/api/type/type1.mdx", "new", { category: "type" });
			collector.recordFile("class/class1.mdx", "/docs/api/class/class1.mdx", "new", { category: "class" });
			collector.recordFile("interface/int1.mdx", "/docs/api/interface/int1.mdx", "new", {
				category: "interface",
			});

			collector.logSummary(mockLogger);

			// Get all verbose calls related to categories
			const verboseCalls = (mockLogger.verbose as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]);
			const categoryCallsIndex = verboseCalls.indexOf("   By category:");
			const categoryCalls = verboseCalls.slice(categoryCallsIndex + 1, categoryCallsIndex + 4);

			// Should be sorted: class, interface, type
			expect(categoryCalls[0]).toContain("class");
			expect(categoryCalls[1]).toContain("interface");
			expect(categoryCalls[2]).toContain("type");
		});

		it("should track files with all context fields", () => {
			collector.recordFile("class/class1.mdx", "/docs/api/class/class1.mdx", "new", {
				category: "class",
				api: "my-api",
				version: "v1.0.0",
			});

			collector.logSummary(mockLogger);

			expect(mockLogger.verbose).toHaveBeenCalledWith("   By API:");
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - my-api (v1.0.0): 1 files (1 new/modified, 0 unchanged)");
			expect(mockLogger.verbose).toHaveBeenCalledWith("   By category:");
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - class: 1 files (1 new/modified, 0 unchanged)");
		});

		it("should accumulate stats correctly for multiple files in same category", () => {
			collector.recordFile("class/class1.mdx", "/docs/api/class/class1.mdx", "new", { category: "class" });
			collector.recordFile("class/class2.mdx", "/docs/api/class/class2.mdx", "unchanged", {
				category: "class",
			});
			collector.recordFile("class/class3.mdx", "/docs/api/class/class3.mdx", "modified", { category: "class" });

			collector.logSummary(mockLogger);

			expect(mockLogger.verbose).toHaveBeenCalledWith("     - class: 3 files (2 new/modified, 1 unchanged)");
		});

		it("should accumulate stats correctly for multiple files in same API", () => {
			collector.recordFile("class/class1.mdx", "/docs/api/class/class1.mdx", "new", { api: "api1" });
			collector.recordFile("class/class2.mdx", "/docs/api/class/class2.mdx", "unchanged", { api: "api1" });
			collector.recordFile("class/class3.mdx", "/docs/api/class/class3.mdx", "modified", { api: "api1" });

			collector.logSummary(mockLogger);

			expect(mockLogger.verbose).toHaveBeenCalledWith("     - api1: 3 files (2 new/modified, 1 unchanged)");
		});
	});

	describe("logFile", () => {
		it("should log new file with correct icon and status", () => {
			collector.logFile(mockLogger, "class/myclass.mdx", "new");

			expect(mockLogger.debug).toHaveBeenCalledWith("📄 NEW: class/myclass.mdx");
		});

		it("should log unchanged file with correct icon and status", () => {
			collector.logFile(mockLogger, "class/myclass.mdx", "unchanged");

			expect(mockLogger.debug).toHaveBeenCalledWith("✓ UNCHANGED: class/myclass.mdx");
		});

		it("should log modified file with correct icon and status", () => {
			collector.logFile(mockLogger, "class/myclass.mdx", "modified");

			expect(mockLogger.debug).toHaveBeenCalledWith("✏️ MODIFIED: class/myclass.mdx");
		});
	});

	describe("logSummary", () => {
		it("should not log anything when no files recorded", () => {
			collector.logSummary(mockLogger);

			expect(mockLogger.info).not.toHaveBeenCalled();
			expect(mockLogger.verbose).not.toHaveBeenCalled();
			expect(mockLogger.debug).not.toHaveBeenCalled();
		});

		it("should log info level with total and changes", () => {
			collector.recordFile("class/class1.mdx", "/docs/api/class/class1.mdx", "new");
			collector.recordFile("class/class2.mdx", "/docs/api/class/class2.mdx", "unchanged");

			collector.logSummary(mockLogger);

			expect(mockLogger.info).toHaveBeenCalledWith("📝 Generated 2 files (1 new/modified, 1 unchanged)");
		});

		it("should log info level when all files unchanged", () => {
			collector.recordFile("class/class1.mdx", "/docs/api/class/class1.mdx", "unchanged");
			collector.recordFile("class/class2.mdx", "/docs/api/class/class2.mdx", "unchanged");

			collector.logSummary(mockLogger);

			expect(mockLogger.info).toHaveBeenCalledWith("📝 Generated 2 files (all unchanged)");
		});

		it("should log verbose level API breakdown", () => {
			collector.recordFile("class/class1.mdx", "/docs/api/class/class1.mdx", "new", { api: "api1" });

			collector.logSummary(mockLogger);

			expect(mockLogger.verbose).toHaveBeenCalledWith("   By API:");
		});

		it("should log verbose level category breakdown", () => {
			collector.recordFile("class/class1.mdx", "/docs/api/class/class1.mdx", "new", { category: "class" });

			collector.logSummary(mockLogger);

			expect(mockLogger.verbose).toHaveBeenCalledWith("   By category:");
		});

		it("should log debug level detailed statistics", () => {
			collector.recordFile("class/class1.mdx", "/docs/api/class/class1.mdx", "new");
			collector.recordFile("class/class2.mdx", "/docs/api/class/class2.mdx", "unchanged");
			collector.recordFile("class/class3.mdx", "/docs/api/class/class3.mdx", "modified");

			collector.logSummary(mockLogger);

			expect(mockLogger.debug).toHaveBeenCalledWith("📊 File generation statistics:");
			expect(mockLogger.debug).toHaveBeenCalledWith("   Total files: 3");
			expect(mockLogger.debug).toHaveBeenCalledWith("   New: 1");
			expect(mockLogger.debug).toHaveBeenCalledWith("   Modified: 1");
			expect(mockLogger.debug).toHaveBeenCalledWith("   Unchanged: 1");
			expect(mockLogger.debug).toHaveBeenCalledWith("   Change rate: 66.7%");
		});

		it("should calculate change rate correctly", () => {
			// 2 new, 1 modified, 1 unchanged = 75% change rate
			collector.recordFile("file1.mdx", "/docs/file1.mdx", "new");
			collector.recordFile("file2.mdx", "/docs/file2.mdx", "new");
			collector.recordFile("file3.mdx", "/docs/file3.mdx", "modified");
			collector.recordFile("file4.mdx", "/docs/file4.mdx", "unchanged");

			collector.logSummary(mockLogger);

			expect(mockLogger.debug).toHaveBeenCalledWith("   Change rate: 75.0%");
		});

		it("should handle 0% change rate", () => {
			collector.recordFile("file1.mdx", "/docs/file1.mdx", "unchanged");
			collector.recordFile("file2.mdx", "/docs/file2.mdx", "unchanged");

			collector.logSummary(mockLogger);

			expect(mockLogger.debug).toHaveBeenCalledWith("   Change rate: 0.0%");
		});

		it("should handle 100% change rate", () => {
			collector.recordFile("file1.mdx", "/docs/file1.mdx", "new");
			collector.recordFile("file2.mdx", "/docs/file2.mdx", "modified");

			collector.logSummary(mockLogger);

			expect(mockLogger.debug).toHaveBeenCalledWith("   Change rate: 100.0%");
		});
	});

	describe("complex scenarios", () => {
		it("should handle multiple APIs and categories", () => {
			// API 1 with 2 files
			collector.recordFile("class/class1.mdx", "/docs/api1/class/class1.mdx", "new", {
				api: "api1",
				category: "class",
			});
			collector.recordFile("interface/int1.mdx", "/docs/api1/interface/int1.mdx", "unchanged", {
				api: "api1",
				category: "interface",
			});

			// API 2 with 2 files
			collector.recordFile("class/class2.mdx", "/docs/api2/class/class2.mdx", "modified", {
				api: "api2",
				category: "class",
			});
			collector.recordFile("type/type1.mdx", "/docs/api2/type/type1.mdx", "new", {
				api: "api2",
				category: "type",
			});

			collector.logSummary(mockLogger);

			// Overall stats
			expect(mockLogger.info).toHaveBeenCalledWith("📝 Generated 4 files (3 new/modified, 1 unchanged)");

			// API breakdown
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - api1: 2 files (1 new/modified, 1 unchanged)");
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - api2: 2 files (2 new/modified, 0 unchanged)");

			// Category breakdown (sorted)
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - class: 2 files (2 new/modified, 0 unchanged)");
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - interface: 1 files (0 new/modified, 1 unchanged)");
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - type: 1 files (1 new/modified, 0 unchanged)");
		});

		it("should track versioned and non-versioned APIs separately", () => {
			collector.recordFile("file1.mdx", "/docs/file1.mdx", "new", {
				api: "my-api",
			});
			collector.recordFile("file2.mdx", "/docs/file2.mdx", "new", {
				api: "my-api",
				version: "v1.0.0",
			});
			collector.recordFile("file3.mdx", "/docs/file3.mdx", "new", {
				api: "my-api",
				version: "v2.0.0",
			});

			collector.logSummary(mockLogger);

			// Should have 3 separate entries
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - my-api: 1 files (1 new/modified, 0 unchanged)");
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - my-api (v1.0.0): 1 files (1 new/modified, 0 unchanged)");
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - my-api (v2.0.0): 1 files (1 new/modified, 0 unchanged)");
		});
	});
});
