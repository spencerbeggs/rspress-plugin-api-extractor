import { describe, expect, it } from "vitest";
import type {
	Callable,
	Constructable,
	KeysOfType,
	LogEntry,
	LogLevelMap,
	LogMeta,
	LogTransport,
	LoggerOptions,
	Result,
	StringRecord,
} from "./index.js";
import {
	AsyncTask,
	DEFAULT_LOGGER_OPTIONS,
	Formatters,
	LogLevel,
	Logger,
	TaskStatus,
	VERSION,
	Validators,
	createLogEntry,
	pickNumeric,
	runTask,
} from "./index.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

describe("LogLevel", () => {
	it("should define ordered severity values", () => {
		expect(LogLevel.Debug).toBeLessThan(LogLevel.Info);
		expect(LogLevel.Info).toBeLessThan(LogLevel.Warn);
		expect(LogLevel.Warn).toBeLessThan(LogLevel.Error);
	});
});

describe("TaskStatus", () => {
	it("should have string values", () => {
		expect(TaskStatus.Pending).toBe("pending");
		expect(TaskStatus.Running).toBe("running");
		expect(TaskStatus.Completed).toBe("completed");
		expect(TaskStatus.Cancelled).toBe("cancelled");
		expect(TaskStatus.Failed).toBe("failed");
	});
});

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

describe("Logger", () => {
	it("should create with default options", () => {
		const logger = new Logger();
		expect(logger.getTransports()).toHaveLength(0);
	});

	it("should create with custom options", () => {
		const opts: LoggerOptions = { minLevel: LogLevel.Warn, defaultSource: "test" };
		const logger = new Logger(opts);
		expect(logger).toBeDefined();
	});

	it("should add and invoke transports", () => {
		const entries: LogEntry[] = [];
		const transport: LogTransport = (entry) => entries.push(entry);
		const logger = new Logger();
		logger.addTransport(transport);
		logger.info("hello");
		expect(entries).toHaveLength(1);
		expect(entries[0].message).toBe("hello");
		expect(entries[0].level).toBe(LogLevel.Info);
	});

	it("should filter entries below minimum level", () => {
		const entries: LogEntry[] = [];
		const logger = new Logger({ minLevel: LogLevel.Warn });
		logger.addTransport((e) => entries.push(e));
		logger.debug("hidden");
		logger.info("also hidden");
		logger.warn("visible");
		expect(entries).toHaveLength(1);
		expect(entries[0].level).toBe(LogLevel.Warn);
	});

	it("should use default source when none provided", () => {
		const entries: LogEntry[] = [];
		const logger = new Logger({ defaultSource: "myapp" });
		logger.addTransport((e) => entries.push(e));
		logger.error("boom");
		expect(entries[0].meta.source).toBe("myapp");
	});

	it("should allow source override per call", () => {
		const entries: LogEntry[] = [];
		const logger = new Logger({ defaultSource: "myapp" });
		logger.addTransport((e) => entries.push(e));
		logger.info("hello", "custom-source");
		expect(entries[0].meta.source).toBe("custom-source");
	});
});

// ---------------------------------------------------------------------------
// AsyncTask
// ---------------------------------------------------------------------------

describe("AsyncTask", () => {
	it("should start in Pending status", () => {
		const task = new AsyncTask({ label: "test", execute: async () => 42 });
		expect(task.status).toBe(TaskStatus.Pending);
		expect(task.label).toBe("test");
	});

	it("should complete successfully", async () => {
		const task = new AsyncTask({ label: "ok", execute: async () => "done" });
		const result = await task.run();
		expect(result.ok).toBe(true);
		expect(result.value).toBe("done");
		expect(task.status).toBe(TaskStatus.Completed);
	});

	it("should capture failures", async () => {
		const task = new AsyncTask({
			label: "fail",
			execute: async () => {
				throw new Error("oops");
			},
		});
		const result = await task.run();
		expect(result.ok).toBe(false);
		expect(result.error).toBe("oops");
		expect(task.status).toBe(TaskStatus.Failed);
	});

	it("should cancel when pending", () => {
		const task = new AsyncTask({ label: "cancel-me", execute: async () => 1 });
		expect(task.cancel()).toBe(true);
		expect(task.status).toBe(TaskStatus.Cancelled);
	});

	it("should not cancel when already running", async () => {
		const task = new AsyncTask({
			label: "busy",
			execute: () => new Promise((resolve) => setTimeout(() => resolve(1), 50)),
		});
		const promise = task.run();
		expect(task.cancel()).toBe(false);
		await promise;
	});

	it("should timeout when configured", async () => {
		const task = new AsyncTask({
			label: "slow",
			execute: () => new Promise((resolve) => setTimeout(() => resolve(1), 500)),
			timeoutMs: 10,
		});
		const result = await task.run();
		expect(result.ok).toBe(false);
		expect(result.error).toContain("Timeout");
	});

	it("should integrate with Logger", async () => {
		const entries: LogEntry[] = [];
		const logger = new Logger();
		logger.addTransport((e) => entries.push(e));
		const task = new AsyncTask({ label: "logged", execute: async () => "ok", logLevel: LogLevel.Debug }, logger);
		await task.run();
		expect(entries.length).toBeGreaterThanOrEqual(2); // created + started + completed
	});
});

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

describe("createLogEntry", () => {
	it("should create a well-formed LogEntry", () => {
		const entry = createLogEntry(LogLevel.Info, "test", "src");
		expect(entry.level).toBe(LogLevel.Info);
		expect(entry.message).toBe("test");
		expect(entry.meta.source).toBe("src");
		expect(typeof entry.meta.timestamp).toBe("number");
	});
});

describe("runTask", () => {
	it("should run and return Result", async () => {
		const result = await runTask({ label: "quick", execute: async () => 99 });
		expect(result).toEqual({ ok: true, value: 99 });
	});
});

describe("pickNumeric", () => {
	it("should extract only numeric properties", () => {
		const obj = { name: "test", count: 42, active: true, score: 99 };
		const result = pickNumeric(obj);
		expect(result).toEqual({ count: 42, score: 99 });
	});

	it("should return empty object when no numbers", () => {
		const obj = { a: "x", b: true };
		expect(pickNumeric(obj)).toEqual({});
	});
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("constants", () => {
	it("VERSION should be a string", () => {
		expect(typeof VERSION).toBe("string");
	});

	it("DEFAULT_LOGGER_OPTIONS should have expected defaults", () => {
		expect(DEFAULT_LOGGER_OPTIONS.minLevel).toBe(LogLevel.Info);
		expect(DEFAULT_LOGGER_OPTIONS.defaultSource).toBe("example-module");
	});
});

// ---------------------------------------------------------------------------
// Formatters namespace
// ---------------------------------------------------------------------------

describe("Formatters", () => {
	describe("levelLabel", () => {
		it("should map all LogLevel values", () => {
			expect(Formatters.levelLabel(LogLevel.Debug)).toBe("DEBUG");
			expect(Formatters.levelLabel(LogLevel.Info)).toBe("INFO");
			expect(Formatters.levelLabel(LogLevel.Warn)).toBe("WARN");
			expect(Formatters.levelLabel(LogLevel.Error)).toBe("ERROR");
		});
	});

	describe("formatEntry", () => {
		const entry: LogEntry = {
			level: LogLevel.Info,
			message: "hello",
			meta: { timestamp: 1000, source: "test" },
		};

		it("should produce compact format by default", () => {
			const out = Formatters.formatEntry(entry);
			expect(out).toContain("[INFO]");
			expect(out).toContain("hello");
			expect(out).toContain("test");
		});

		it("should produce verbose format", () => {
			const out = Formatters.formatEntry(entry, { style: Formatters.Style.Verbose });
			expect(out).toContain("message: hello");
			expect(out).toContain("source: test");
		});

		it("should respect includeTimestamp=false", () => {
			const out = Formatters.formatEntry(entry, { includeTimestamp: false });
			expect(out).not.toContain("1000");
		});
	});

	describe("formatDuration", () => {
		it("should format milliseconds", () => {
			expect(Formatters.formatDuration(42)).toBe("42ms");
		});

		it("should format seconds", () => {
			expect(Formatters.formatDuration(1500)).toBe("1.50s");
		});
	});

	describe("formatResult", () => {
		it("should format success", () => {
			const r: Result<number> = { ok: true, value: 42 };
			expect(Formatters.formatResult(r)).toBe("ok: 42");
		});

		it("should format failure", () => {
			const r: Result<number> = { ok: false, error: "bad" };
			expect(Formatters.formatResult(r)).toBe("error: bad");
		});
	});
});

// ---------------------------------------------------------------------------
// Validators namespace
// ---------------------------------------------------------------------------

describe("Validators", () => {
	describe("isNonEmpty", () => {
		it("should pass for non-empty string", () => {
			expect(Validators.isNonEmpty("hello").valid).toBe(true);
		});

		it("should fail for empty string", () => {
			expect(Validators.isNonEmpty("").valid).toBe(false);
		});
	});

	describe("isInRange", () => {
		it("should pass when in range", () => {
			expect(Validators.isInRange(5, 1, 10).valid).toBe(true);
		});

		it("should pass at boundaries", () => {
			expect(Validators.isInRange(1, 1, 10).valid).toBe(true);
			expect(Validators.isInRange(10, 1, 10).valid).toBe(true);
		});

		it("should fail when out of range", () => {
			expect(Validators.isInRange(0, 1, 10).valid).toBe(false);
			expect(Validators.isInRange(11, 1, 10).valid).toBe(false);
		});
	});

	describe("validateAll", () => {
		it("should run all validators", () => {
			const results = Validators.validateAll("hello", [
				Validators.isNonEmpty,
				(v) => ({ valid: v.length < 10, message: "length check" }),
			]);
			expect(results).toHaveLength(2);
			expect(results.every((r) => r.valid)).toBe(true);
		});

		it("should log results when logger provided", () => {
			const entries: LogEntry[] = [];
			const logger = new Logger();
			logger.addTransport((e) => entries.push(e));

			Validators.validateAll("", [Validators.isNonEmpty], logger);
			expect(entries).toHaveLength(1);
			expect(entries[0].level).toBe(LogLevel.Warn);
		});
	});
});

// ---------------------------------------------------------------------------
// Signature interfaces
// ---------------------------------------------------------------------------

describe("signature interfaces", () => {
	it("Callable — assign function, invoke, check return", () => {
		const parse: Callable = (input: string) => Number.parseFloat(input);
		expect(parse("3.14")).toBeCloseTo(3.14);
		expect(parse("42")).toBe(42);
	});

	it("Constructable — assign class, construct, check result", () => {
		const Factory: Constructable = class {
			ok: boolean;
			value: string;
			constructor(label: string) {
				this.ok = true;
				this.value = label;
			}
		} as unknown as Constructable;

		const result = new Factory("hello");
		expect(result.ok).toBe(true);
		expect(result.value).toBe("hello");
	});

	it("LogLevelMap — assign object, check values", () => {
		const levels: LogLevelMap = {
			database: LogLevel.Warn,
			http: LogLevel.Debug,
		};
		expect(levels.database).toBe(LogLevel.Warn);
		expect(levels.http).toBe(LogLevel.Debug);
	});
});

// ---------------------------------------------------------------------------
// Type-level checks (compile-time only – no runtime assertions needed)
// ---------------------------------------------------------------------------

describe("type aliases", () => {
	it("KeysOfType should narrow keys correctly (runtime proxy)", () => {
		interface Sample {
			a: number;
			b: string;
			c: number;
		}
		// This is really a compile-time check, but we verify the runtime shape
		type NumKeys = KeysOfType<Sample, number>;
		const key: NumKeys = "a"; // would fail to compile if wrong
		expect(key).toBe("a");
	});

	it("StringRecord should be assignable", () => {
		const rec: StringRecord = { key: "val", num: 1, flag: true };
		expect(rec.key).toBe("val");
	});

	it("LogMeta should accept tags", () => {
		const meta: LogMeta = { timestamp: 0, source: "test", tags: ["a", "b"] };
		expect(meta.tags).toHaveLength(2);
	});
});
