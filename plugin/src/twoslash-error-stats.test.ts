import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BlockType } from "./code-block-stats.js";
import type { DebugLogger } from "./debug-logger.js";
import { TwoslashErrorStatsCollector } from "./twoslash-error-stats.js";

describe("TwoslashErrorStatsCollector", () => {
	let collector: TwoslashErrorStatsCollector;
	let mockLogger: DebugLogger;

	beforeEach(() => {
		collector = new TwoslashErrorStatsCollector();
		mockLogger = {
			info: vi.fn(),
			verbose: vi.fn(),
			debug: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		} as unknown as DebugLogger;
	});

	describe("context management", () => {
		it("should set context", () => {
			collector.setContext({
				file: "src/index.ts",
				api: "my-api",
				version: "v1.0.0",
				blockType: "signature",
			});

			// Record an error to verify context was set
			collector.recordError(new Error("Error 2440: Type error"), "const x: string = 123;");

			expect(collector.getTotalErrors()).toBe(1);
		});

		it("should clear context", () => {
			collector.setContext({ file: "src/index.ts" });
			collector.clearContext();

			// Record error after clearing context
			collector.recordError(new Error("Error 2304: Cannot find name"), "console.log(foo);");

			collector.logSummary(mockLogger);

			// Should not have file in breakdown since context was cleared
			expect(mockLogger.verbose).not.toHaveBeenCalledWith(expect.stringContaining("src/index.ts"));
		});

		it("should handle undefined context", () => {
			collector.setContext(undefined);

			collector.recordError(new Error("Error 2304: Cannot find name"), "console.log(foo);");

			expect(collector.getTotalErrors()).toBe(1);
		});
	});

	describe("recordError", () => {
		it("should record error with full context", () => {
			collector.setContext({
				file: "src/types.ts",
				api: "my-api",
				version: "v1.0.0",
				blockType: "example",
			});

			collector.recordError(
				new Error("Error 2440: Type 'number' is not assignable to type 'string'"),
				"const x: string = 123;",
			);

			expect(collector.getTotalErrors()).toBe(1);
		});

		it("should record error without context", () => {
			collector.recordError(new Error("Error 2304: Cannot find name 'foo'"), "console.log(foo);");

			expect(collector.getTotalErrors()).toBe(1);
		});

		it("should extract TypeScript error code from message", () => {
			collector.recordError(
				new Error("Error 2440: Type 'number' is not assignable to type 'string'"),
				"const x: string = 123;",
			);

			collector.logSummary(mockLogger);

			expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining("TS2440"));
		});

		it("should handle errors without TypeScript error codes", () => {
			collector.recordError(new Error("Some generic error"), "const x = 123;");

			collector.logSummary(mockLogger);

			// Should still record the error
			expect(mockLogger.info).toHaveBeenCalledWith("🔴 Twoslash errors: 1 error(s) in code blocks");
		});

		it("should handle non-Error objects", () => {
			collector.recordError("String error message", "const x = 123;");

			expect(collector.getTotalErrors()).toBe(1);
		});

		it("should truncate code snippets to 200 characters", () => {
			const longCode = "const x = 1;\n".repeat(50); // Much longer than 200 chars

			collector.recordError(new Error("Error 2304: Error"), longCode);

			collector.logError(mockLogger, new Error("Error 2304: Error"), longCode);

			const debugCall = (mockLogger.debug as ReturnType<typeof vi.fn>).mock.calls[0][0];
			const errorData = JSON.parse(debugCall.substring(debugCall.indexOf("{")));

			expect(errorData.codeSnippet.length).toBeLessThanOrEqual(200);
		});

		it("should replace newlines in code snippets", () => {
			collector.recordError(new Error("Error 2304: Error"), "const x = 1;\nconst y = 2;");

			collector.logError(mockLogger, new Error("Error 2304: Error"), "const x = 1;\nconst y = 2;");

			const debugCall = (mockLogger.debug as ReturnType<typeof vi.fn>).mock.calls[0][0];
			const errorData = JSON.parse(debugCall.substring(debugCall.indexOf("{")));

			expect(errorData.codeSnippet).not.toContain("\n");
		});

		it("should record multiple errors", () => {
			collector.recordError(new Error("Error 2440: Error 1"), "const x: string = 123;");
			collector.recordError(new Error("Error 2304: Error 2"), "console.log(foo);");
			collector.recordError(new Error("Error 2345: Error 3"), "function test() {}");

			expect(collector.getTotalErrors()).toBe(3);
		});
	});

	describe("tracking by error code", () => {
		it("should track errors by error code", () => {
			collector.recordError(new Error("Error 2440: Type error 1"), "const x: string = 123;");
			collector.recordError(new Error("Error 2440: Type error 2"), "const y: string = 456;");
			collector.recordError(new Error("Error 2304: Cannot find name"), "console.log(foo);");

			collector.logSummary(mockLogger);

			expect(mockLogger.verbose).toHaveBeenCalledWith("   By error code:");
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - TS2440: 2 occurrence(s)");
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - TS2304: 1 occurrence(s)");
		});

		it("should sort error codes by count descending", () => {
			collector.recordError(new Error("Error 2304: Error 1"), "console.log(foo);");
			collector.recordError(new Error("Error 2440: Error 2"), "const x: string = 123;");
			collector.recordError(new Error("Error 2440: Error 3"), "const y: string = 456;");
			collector.recordError(new Error("Error 2440: Error 4"), "const z: string = 789;");

			collector.logSummary(mockLogger);

			const verboseCalls = (mockLogger.verbose as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]);
			const errorCodeIndex = verboseCalls.indexOf("   By error code:");

			// TS2440 (3 occurrences) should come before TS2304 (1 occurrence)
			expect(verboseCalls[errorCodeIndex + 1]).toContain("TS2440: 3");
			expect(verboseCalls[errorCodeIndex + 2]).toContain("TS2304: 1");
		});
	});

	describe("tracking by file", () => {
		it("should track errors by file", () => {
			collector.setContext({ file: "src/types.ts" });
			collector.recordError(new Error("Error 2440: Error"), "const x: string = 123;");

			collector.setContext({ file: "src/utils.ts" });
			collector.recordError(new Error("Error 2304: Error"), "console.log(foo);");
			collector.recordError(new Error("Error 2345: Error"), "function test() {}");

			collector.logSummary(mockLogger);

			expect(mockLogger.verbose).toHaveBeenCalledWith("   By file:");
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - src/utils.ts: 2 error(s)");
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - src/types.ts: 1 error(s)");
		});

		it("should sort files by count descending", () => {
			collector.setContext({ file: "src/a.ts" });
			collector.recordError(new Error("Error 2304: Error"), "code");

			collector.setContext({ file: "src/b.ts" });
			collector.recordError(new Error("Error 2440: Error 1"), "code");
			collector.recordError(new Error("Error 2440: Error 2"), "code");
			collector.recordError(new Error("Error 2440: Error 3"), "code");

			collector.logSummary(mockLogger);

			const verboseCalls = (mockLogger.verbose as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]);
			const fileIndex = verboseCalls.indexOf("   By file:");

			// src/b.ts (3 errors) should come before src/a.ts (1 error)
			expect(verboseCalls[fileIndex + 1]).toContain("src/b.ts: 3");
			expect(verboseCalls[fileIndex + 2]).toContain("src/a.ts: 1");
		});

		it("should not track file when context has no file", () => {
			collector.setContext({ api: "my-api" }); // No file
			collector.recordError(new Error("Error 2440: Error"), "const x: string = 123;");

			collector.logSummary(mockLogger);

			expect(mockLogger.verbose).not.toHaveBeenCalledWith(expect.stringContaining("By file:"));
		});
	});

	describe("tracking by API", () => {
		it("should track errors by API", () => {
			collector.setContext({ api: "api1" });
			collector.recordError(new Error("Error 2440: Error"), "const x: string = 123;");

			collector.setContext({ api: "api2" });
			collector.recordError(new Error("Error 2304: Error"), "console.log(foo);");
			collector.recordError(new Error("Error 2345: Error"), "function test() {}");

			collector.logSummary(mockLogger);

			expect(mockLogger.verbose).toHaveBeenCalledWith("   By API:");
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - api2: 2 error(s)");
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - api1: 1 error(s)");
		});

		it("should sort APIs by count descending", () => {
			collector.setContext({ api: "api-a" });
			collector.recordError(new Error("Error 2304: Error"), "code");

			collector.setContext({ api: "api-b" });
			collector.recordError(new Error("Error 2440: Error 1"), "code");
			collector.recordError(new Error("Error 2440: Error 2"), "code");

			collector.logSummary(mockLogger);

			const verboseCalls = (mockLogger.verbose as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]);
			const apiIndex = verboseCalls.indexOf("   By API:");

			// api-b (2 errors) should come before api-a (1 error)
			expect(verboseCalls[apiIndex + 1]).toContain("api-b: 2");
			expect(verboseCalls[apiIndex + 2]).toContain("api-a: 1");
		});

		it("should not track API when context has no API", () => {
			collector.setContext({ file: "src/index.ts" }); // No API
			collector.recordError(new Error("Error 2440: Error"), "const x: string = 123;");

			collector.logSummary(mockLogger);

			expect(mockLogger.verbose).not.toHaveBeenCalledWith(expect.stringContaining("By API:"));
		});
	});

	describe("tracking by API version", () => {
		it("should track errors by API version", () => {
			collector.setContext({ api: "my-api", version: "v1.0.0" });
			collector.recordError(new Error("Error 2440: Error"), "const x: string = 123;");

			collector.setContext({ api: "my-api", version: "v2.0.0" });
			collector.recordError(new Error("Error 2304: Error"), "console.log(foo);");
			collector.recordError(new Error("Error 2345: Error"), "function test() {}");

			collector.logSummary(mockLogger);

			expect(mockLogger.verbose).toHaveBeenCalledWith("   By API version:");
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - my-api:");
			expect(mockLogger.verbose).toHaveBeenCalledWith("       • v2.0.0: 2 error(s)");
			expect(mockLogger.verbose).toHaveBeenCalledWith("       • v1.0.0: 1 error(s)");
		});

		it("should track multiple APIs with versions", () => {
			collector.setContext({ api: "api1", version: "v1.0.0" });
			collector.recordError(new Error("Error 2440: Error"), "code");

			collector.setContext({ api: "api2", version: "v1.0.0" });
			collector.recordError(new Error("Error 2304: Error"), "code");

			collector.logSummary(mockLogger);

			expect(mockLogger.verbose).toHaveBeenCalledWith("     - api1:");
			expect(mockLogger.verbose).toHaveBeenCalledWith("       • v1.0.0: 1 error(s)");
			expect(mockLogger.verbose).toHaveBeenCalledWith("     - api2:");
		});

		it("should sort API names alphabetically", () => {
			collector.setContext({ api: "zod", version: "v3.0.0" });
			collector.recordError(new Error("Error 2440: Error"), "code");

			collector.setContext({ api: "effect", version: "v3.0.0" });
			collector.recordError(new Error("Error 2304: Error"), "code");

			collector.logSummary(mockLogger);

			const verboseCalls = (mockLogger.verbose as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]);
			const versionIndex = verboseCalls.indexOf("   By API version:");

			// effect should come before zod (alphabetically)
			expect(verboseCalls[versionIndex + 1]).toContain("effect:");
			expect(verboseCalls[versionIndex + 3]).toContain("zod:");
		});

		it("should sort versions by count descending within each API", () => {
			collector.setContext({ api: "my-api", version: "v1.0.0" });
			collector.recordError(new Error("Error 2440: Error"), "code");

			collector.setContext({ api: "my-api", version: "v2.0.0" });
			collector.recordError(new Error("Error 2304: Error 1"), "code");
			collector.recordError(new Error("Error 2304: Error 2"), "code");
			collector.recordError(new Error("Error 2304: Error 3"), "code");

			collector.logSummary(mockLogger);

			const verboseCalls = (mockLogger.verbose as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]);
			const apiIndex = verboseCalls.indexOf("     - my-api:");

			// v2.0.0 (3 errors) should come before v1.0.0 (1 error)
			expect(verboseCalls[apiIndex + 1]).toContain("v2.0.0: 3");
			expect(verboseCalls[apiIndex + 2]).toContain("v1.0.0: 1");
		});

		it("should not track version when context has no version", () => {
			collector.setContext({ api: "my-api" }); // No version
			collector.recordError(new Error("Error 2440: Error"), "const x: string = 123;");

			collector.logSummary(mockLogger);

			expect(mockLogger.verbose).not.toHaveBeenCalledWith(expect.stringContaining("By API version:"));
		});

		it("should not track version when context has no API", () => {
			collector.setContext({ version: "v1.0.0" }); // No API
			collector.recordError(new Error("Error 2440: Error"), "const x: string = 123;");

			collector.logSummary(mockLogger);

			expect(mockLogger.verbose).not.toHaveBeenCalledWith(expect.stringContaining("By API version:"));
		});
	});

	describe("logError", () => {
		it("should log error with structured JSON", () => {
			collector.setContext({
				file: "src/index.ts",
				api: "my-api",
				version: "v1.0.0",
			});

			collector.logError(mockLogger, new Error("Error 2440: Type error"), "const x: string = 123;");

			const debugCall = (mockLogger.debug as ReturnType<typeof vi.fn>).mock.calls[0][0];

			expect(debugCall).toContain("🔴 Twoslash error:");
			expect(debugCall).toContain('"code":"TS2440"');
			expect(debugCall).toContain('"file":"src/index.ts"');
			expect(debugCall).toContain('"api":"my-api"');
			expect(debugCall).toContain('"version":"v1.0.0"');
		});

		it("should handle errors without TypeScript error codes", () => {
			collector.logError(mockLogger, new Error("Generic error"), "const x = 123;");

			const debugCall = (mockLogger.debug as ReturnType<typeof vi.fn>).mock.calls[0][0];

			expect(debugCall).toContain('"code":"unknown"');
		});

		it("should use 'unknown' for missing context fields", () => {
			// No context set
			collector.logError(mockLogger, new Error("Error 2304: Error"), "console.log(foo);");

			const debugCall = (mockLogger.debug as ReturnType<typeof vi.fn>).mock.calls[0][0];

			expect(debugCall).toContain('"file":"unknown"');
			expect(debugCall).toContain('"api":"unknown"');
			expect(debugCall).toContain('"version":"unknown"');
		});

		it("should include stack trace", () => {
			const error = new Error("Error 2440: Type error");

			collector.logError(mockLogger, error, "const x: string = 123;");

			const debugCall = (mockLogger.debug as ReturnType<typeof vi.fn>).mock.calls[0][0];

			expect(debugCall).toContain('"stack"');
		});

		it("should replace newlines in stack trace with pipe separator", () => {
			const error = new Error("Error 2440: Type error");

			collector.logError(mockLogger, error, "const x: string = 123;");

			const debugCall = (mockLogger.debug as ReturnType<typeof vi.fn>).mock.calls[0][0];
			const errorData = JSON.parse(debugCall.substring(debugCall.indexOf("{")));

			if (errorData.stack) {
				expect(errorData.stack).not.toContain("\n");
				expect(errorData.stack).toContain(" | ");
			}
		});
	});

	describe("getTotalErrors", () => {
		it("should return 0 when no errors recorded", () => {
			expect(collector.getTotalErrors()).toBe(0);
		});

		it("should return correct count after recording errors", () => {
			collector.recordError(new Error("Error 2440: Error 1"), "code");
			collector.recordError(new Error("Error 2304: Error 2"), "code");
			collector.recordError(new Error("Error 2345: Error 3"), "code");

			expect(collector.getTotalErrors()).toBe(3);
		});
	});

	describe("logSummary", () => {
		it("should not log anything when no errors recorded", () => {
			collector.logSummary(mockLogger);

			expect(mockLogger.info).not.toHaveBeenCalled();
			expect(mockLogger.verbose).not.toHaveBeenCalled();
			expect(mockLogger.debug).not.toHaveBeenCalled();
		});

		it("should log INFO level summary", () => {
			collector.recordError(new Error("Error 2440: Error 1"), "code");
			collector.recordError(new Error("Error 2304: Error 2"), "code");

			collector.logSummary(mockLogger);

			expect(mockLogger.info).toHaveBeenCalledWith("🔴 Twoslash errors: 2 error(s) in code blocks");
		});

		it("should log VERBOSE level breakdowns", () => {
			collector.setContext({ file: "src/index.ts", api: "my-api" });
			collector.recordError(new Error("Error 2440: Error"), "code");

			collector.logSummary(mockLogger);

			expect(mockLogger.verbose).toHaveBeenCalledWith("   By error code:");
			expect(mockLogger.verbose).toHaveBeenCalledWith("   By file:");
			expect(mockLogger.verbose).toHaveBeenCalledWith("   By API:");
		});

		it("should log DEBUG level statistics", () => {
			collector.setContext({ file: "src/index.ts", api: "my-api" });
			collector.recordError(new Error("Error 2440: Error"), "code");

			collector.logSummary(mockLogger);

			expect(mockLogger.debug).toHaveBeenCalledWith("📊 Twoslash error details:");
			expect(mockLogger.debug).toHaveBeenCalledWith("   Total errors: 1");
			expect(mockLogger.debug).toHaveBeenCalledWith("   Unique error codes: 1");
			expect(mockLogger.debug).toHaveBeenCalledWith("   Files with errors: 1");
			expect(mockLogger.debug).toHaveBeenCalledWith("   APIs with errors: 1");
		});

		it("should show first 5 errors in DEBUG output", () => {
			for (let i = 0; i < 10; i++) {
				collector.setContext({ file: `src/file${i}.ts` });
				collector.recordError(new Error(`TS2440: Error ${i}`), `code ${i}`);
			}

			collector.logSummary(mockLogger);

			expect(mockLogger.debug).toHaveBeenCalledWith("   First 5 error(s):");
			expect(mockLogger.debug).toHaveBeenCalledWith("   ... and 5 more error(s)");
		});

		it("should not show 'more errors' message when 5 or fewer errors", () => {
			for (let i = 0; i < 3; i++) {
				collector.recordError(new Error(`TS2440: Error ${i}`), `code ${i}`);
			}

			collector.logSummary(mockLogger);

			expect(mockLogger.debug).not.toHaveBeenCalledWith(expect.stringContaining("more error(s)"));
		});

		it("should handle errors with multiline messages", () => {
			collector.setContext({ file: "src/index.ts" });
			collector.recordError(new Error("Error 2440: Line 1\nLine 2\nLine 3"), "code");

			collector.logSummary(mockLogger);

			// Should only show first line in detailed error list
			const debugCalls = (mockLogger.debug as ReturnType<typeof vi.fn>).mock.calls;
			const errorMessageCall = debugCalls.find((call) => call[0].includes("Line 1"));

			expect(errorMessageCall).toBeDefined();
			expect(errorMessageCall?.[0]).not.toContain("Line 2");
		});
	});

	describe("blockType context", () => {
		it("should record blockType in context", () => {
			const blockTypes: BlockType[] = ["signature", "example", "member-signature"];

			for (const blockType of blockTypes) {
				collector.setContext({ blockType });
				collector.recordError(new Error(`TS2440: Error in ${blockType}`), `code for ${blockType}`);
			}

			expect(collector.getTotalErrors()).toBe(3);
		});
	});

	describe("edge cases", () => {
		it("should handle empty error message", () => {
			collector.recordError(new Error(""), "const x = 123;");

			expect(collector.getTotalErrors()).toBe(1);
		});

		it("should handle empty code snippet", () => {
			collector.recordError(new Error("Error 2440: Error"), "");

			collector.logSummary(mockLogger);

			expect(mockLogger.info).toHaveBeenCalledWith("🔴 Twoslash errors: 1 error(s) in code blocks");
		});

		it("should handle very long error messages", () => {
			const longMessage = `TS2440: ${"x".repeat(1000)}`;

			collector.recordError(new Error(longMessage), "code");

			collector.logError(mockLogger, new Error(longMessage), "code");

			const debugCall = (mockLogger.debug as ReturnType<typeof vi.fn>).mock.calls[0][0];

			expect(debugCall).toBeDefined();
		});

		it("should handle error codes in different formats", () => {
			collector.recordError(new Error("Error 2440: Error"), "code"); // Standard format
			collector.recordError(new Error("Error 2304 occurred"), "code"); // Code in middle
			collector.recordError(new Error("Error code: 2345"), "code"); // Code with prefix

			collector.logSummary(mockLogger);

			// All should extract error codes
			expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining("TS2440"));
			expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining("TS2304"));
			expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining("TS2345"));
		});
	});
});
