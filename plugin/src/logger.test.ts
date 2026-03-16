import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebugLogger, Timer } from "./debug-logger.js";

describe("DebugLogger", () => {
	// Mock console methods
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;
	let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
		consoleWarnSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	describe("Log Levels", () => {
		it("should not log anything when level is none", () => {
			const logger = new DebugLogger({ logLevel: "none" });

			logger.info("info message");
			logger.verbose("verbose message");
			logger.debug("debug message");
			logger.warn("warn message");
			logger.error("error message");

			expect(consoleLogSpy).not.toHaveBeenCalled();
			expect(consoleWarnSpy).not.toHaveBeenCalled();
			expect(consoleErrorSpy).not.toHaveBeenCalled();
		});

		it("should log info messages when level is info", () => {
			const logger = new DebugLogger({ logLevel: "info" });

			logger.info("info message");
			logger.verbose("verbose message");
			logger.debug("debug message");

			// In info mode, only info-level messages are shown
			// verbose and debug are filtered out
			expect(consoleLogSpy).toHaveBeenCalledTimes(1);
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("info message"));
		});

		it("should log info and verbose when level is verbose", () => {
			const logger = new DebugLogger({ logLevel: "verbose" });

			logger.info("info message");
			logger.verbose("verbose message");
			logger.debug("debug message");

			expect(consoleLogSpy).toHaveBeenCalledTimes(2);
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("info message"));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("verbose message"));
		});

		it("should output JSON when level is debug", () => {
			const logger = new DebugLogger({ logLevel: "debug" });

			logger.info("info message");
			logger.verbose("verbose message");
			logger.debug("debug message");

			// Debug mode outputs raw JSON
			expect(consoleLogSpy).toHaveBeenCalledTimes(3);
			// Each call should be valid JSON containing the message
			for (const call of consoleLogSpy.mock.calls) {
				const parsed = JSON.parse(call[0] as string);
				expect(parsed).toHaveProperty("event", "log.message");
				expect(parsed.data).toHaveProperty("message");
			}
		});

		it("should always log warnings at info level", () => {
			const logger = new DebugLogger({ logLevel: "info" });

			logger.warn("warning");

			// Warnings are logged at info level (shown in info mode)
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("warning"));
		});

		it("should always log errors at info level", () => {
			const logger = new DebugLogger({ logLevel: "info" });

			logger.error("error");

			// Errors are logged at info level (shown in info mode)
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("error"));
		});
	});

	describe("Level Checks", () => {
		it("should correctly identify silent logger", () => {
			const logger = new DebugLogger({ logLevel: "none" });

			expect(logger.isSilent()).toBe(true);
			expect(logger.isInfo()).toBe(false);
			expect(logger.isVerbose()).toBe(false);
			expect(logger.isDebug()).toBe(false);
		});

		it("should correctly identify info logger", () => {
			const logger = new DebugLogger({ logLevel: "info" });

			expect(logger.isSilent()).toBe(false);
			expect(logger.isInfo()).toBe(true);
			expect(logger.isVerbose()).toBe(false);
			expect(logger.isDebug()).toBe(false);
		});

		it("should correctly identify verbose logger", () => {
			const logger = new DebugLogger({ logLevel: "verbose" });

			expect(logger.isSilent()).toBe(false);
			expect(logger.isInfo()).toBe(true);
			expect(logger.isVerbose()).toBe(true);
			expect(logger.isDebug()).toBe(false);
		});

		it("should correctly identify debug logger", () => {
			const logger = new DebugLogger({ logLevel: "debug" });

			expect(logger.isSilent()).toBe(false);
			expect(logger.isInfo()).toBe(true);
			expect(logger.isVerbose()).toBe(true);
			expect(logger.isDebug()).toBe(true);
		});

		it("should return current log level", () => {
			const logger1 = new DebugLogger({ logLevel: "info" });
			const logger2 = new DebugLogger({ logLevel: "debug" });

			expect(logger1.getLevel()).toBe("info");
			expect(logger2.getLevel()).toBe("debug");
		});
	});

	describe("Grouping", () => {
		it("should support group and groupEnd", () => {
			const logger = new DebugLogger({ logLevel: "verbose" });

			logger.verbose("before group");
			logger.group("Group Title");
			logger.verbose("inside group");
			logger.groupEnd();
			logger.verbose("after group");

			// Group creates indented output
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("before group"));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Group Title"));
			// Inside group should have indentation (2 spaces)
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/^ {2}.*inside group/));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("after group"));
		});

		it("should handle nested groups", () => {
			const logger = new DebugLogger({ logLevel: "verbose" });

			logger.group("Level 1");
			logger.verbose("message 1");
			logger.group("Level 2");
			logger.verbose("message 2");
			logger.groupEnd();
			logger.verbose("back to level 1");
			logger.groupEnd();

			// Check for nested indentation (4 spaces for level 2)
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/^ {4}.*message 2/));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/^ {2}.*back to level 1/));
		});

		it("should not go below depth 0 when calling groupEnd", () => {
			const logger = new DebugLogger({ logLevel: "verbose" });

			logger.groupEnd(); // Should not crash
			logger.groupEnd();
			logger.verbose("message");

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("message"));
		});
	});

	describe("Build ID", () => {
		it("should generate a unique build ID", () => {
			const logger1 = new DebugLogger({ logLevel: "info" });
			const logger2 = new DebugLogger({ logLevel: "info" });

			expect(logger1.getBuildId()).toBeDefined();
			expect(logger2.getBuildId()).toBeDefined();
			expect(logger1.getBuildId()).not.toBe(logger2.getBuildId());
		});

		it("should use provided build ID", () => {
			const logger = new DebugLogger({ logLevel: "info", buildId: "custom-build-123" });

			expect(logger.getBuildId()).toBe("custom-build-123");
		});
	});
});

describe("Timer", () => {
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.useFakeTimers();
		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		consoleLogSpy.mockRestore();
	});

	describe("Basic Timing", () => {
		it("should measure elapsed time", () => {
			const logger = new DebugLogger({ logLevel: "verbose" });
			const timer = logger.startTimer("Test operation");

			vi.advanceTimersByTime(50);
			const elapsed = timer.end();

			expect(elapsed).toBeCloseTo(50, 0);
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Test operation"));
		});

		it("should get elapsed time without ending timer", () => {
			const logger = new DebugLogger({ logLevel: "verbose" });
			const timer = logger.startTimer("Test");

			vi.advanceTimersByTime(10);
			const elapsed1 = timer.elapsed();

			vi.advanceTimersByTime(10);
			const elapsed2 = timer.elapsed();

			expect(elapsed2).toBeGreaterThan(elapsed1);
		});

		it("should format time in milliseconds when under 1 second", () => {
			const logger = new DebugLogger({ logLevel: "verbose" });
			const timer = logger.startTimer("Fast operation");

			vi.advanceTimersByTime(100);
			timer.end();

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/Fast operation.*100ms/));
		});

		it("should format time in seconds when over 1 second", () => {
			const logger = new DebugLogger({ logLevel: "verbose" });
			const timer = logger.startTimer("Slow operation");

			vi.advanceTimersByTime(1500);
			timer.end();

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/Slow operation.*1\.50s/));
		});
	});

	describe("Timer End Behavior", () => {
		it("should return 0 when ending an already ended timer", () => {
			const logger = new DebugLogger({ logLevel: "verbose" });
			const timer = logger.startTimer("Test");

			vi.advanceTimersByTime(10);

			const elapsed1 = timer.end();
			const elapsed2 = timer.end();

			expect(elapsed1).toBeGreaterThan(0);
			expect(elapsed2).toBe(0);
		});

		it("should not emit multiple times for already ended timer", () => {
			const logger = new DebugLogger({ logLevel: "verbose" });
			const timer = logger.startTimer("Test");

			timer.end();
			timer.end();
			timer.end();

			// Only one timer.complete event
			const timerCalls = consoleLogSpy.mock.calls.filter((call: unknown[]) => (call[0] as string).includes("Test"));
			expect(timerCalls.length).toBe(1);
		});
	});

	describe("Timer with Log Levels", () => {
		it("should not log timer output when logger is silent", () => {
			const logger = new DebugLogger({ logLevel: "none" });
			const timer = logger.startTimer("Test");

			timer.end();

			expect(consoleLogSpy).not.toHaveBeenCalled();
		});

		it("should log timer output at verbose level", () => {
			const logger = new DebugLogger({ logLevel: "verbose" });
			const timer = logger.startTimer("Test");

			timer.end();

			expect(consoleLogSpy).toHaveBeenCalled();
		});

		it("should output JSON at debug level", () => {
			const logger = new DebugLogger({ logLevel: "debug" });
			const timer = logger.startTimer("Test");

			timer.end();

			// Should output valid JSON
			const call = consoleLogSpy.mock.calls[0][0] as string;
			const parsed = JSON.parse(call);
			expect(parsed.event).toBe("timer.complete");
			expect(parsed.data.operation).toBe("Test");
		});
	});

	describe("Integration with DebugLogger", () => {
		it("should create timer via logger.startTimer", () => {
			const logger = new DebugLogger({ logLevel: "verbose" });
			const timer = logger.startTimer("Operation");

			expect(timer).toBeInstanceOf(Timer);
		});

		it("should support timer with context", () => {
			const logger = new DebugLogger({ logLevel: "debug" });
			const timer = logger.startTimer("Operation", { api: "test-api" });

			timer.end({ file: "test.mdx" });

			const call = consoleLogSpy.mock.calls[0][0] as string;
			const parsed = JSON.parse(call);
			expect(parsed.data.context).toMatchObject({
				api: "test-api",
				file: "test.mdx",
			});
		});
	});
});
