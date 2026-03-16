import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DebugLogger } from "./debug-logger.js";
import { PerformanceManager } from "./performance-manager.js";

describe("PerformanceManager", () => {
	let logger: DebugLogger;
	let perfManager: PerformanceManager;

	beforeEach(() => {
		// Create logger instance with none level to suppress all output during tests
		logger = new DebugLogger({ logLevel: "none" });

		// Reset singleton before each test
		PerformanceManager.resetInstance();

		// Get fresh instance
		perfManager = PerformanceManager.getInstance(logger);
	});

	afterEach(() => {
		// Clean up after each test
		perfManager.clear();
		PerformanceManager.resetInstance();
	});

	describe("Singleton Pattern", () => {
		it("should return the same instance when called multiple times", () => {
			const instance1 = PerformanceManager.getInstance(logger);
			const instance2 = PerformanceManager.getInstance(logger);
			expect(instance1).toBe(instance2);
		});

		it("should create new instance after reset", () => {
			const instance1 = PerformanceManager.getInstance(logger);
			PerformanceManager.resetInstance();
			const instance2 = PerformanceManager.getInstance(logger);
			expect(instance1).not.toBe(instance2);
		});
	});

	describe("Mark and Measure", () => {
		it("should create performance marks", () => {
			perfManager.mark("test.start");
			perfManager.mark("test.end");

			// Marks should be created in the global performance API
			const marks = performance.getEntriesByType("mark");
			const testMarks = marks.filter((m) => m.name.startsWith("test."));
			expect(testMarks.length).toBeGreaterThanOrEqual(2);
		});

		it("should create performance measurements", async () => {
			perfManager.mark("operation.start");

			// Simulate some work
			await new Promise((resolve) => setTimeout(resolve, 10));

			perfManager.mark("operation.end");
			perfManager.measure("operation.duration", "operation.start", "operation.end");

			// Wait for PerformanceObserver to collect the measurement
			await new Promise((resolve) => setTimeout(resolve, 50));

			const measurements = perfManager.getMeasurements("operation.duration");
			expect(measurements.length).toBe(1);
			expect(measurements[0].duration).toBeGreaterThan(0);
		});

		it("should attach context to marks and measures", async () => {
			perfManager.setContext({ api: "test-api", version: "1.0.0" });
			perfManager.mark("contextual.start");
			perfManager.mark("contextual.end");
			perfManager.measure("contextual.operation", "contextual.start", "contextual.end");

			// Wait for PerformanceObserver
			await new Promise((resolve) => setTimeout(resolve, 50));

			const measurements = perfManager.getMeasurements("contextual.operation");
			expect(measurements.length).toBe(1);
			expect(measurements[0].detail).toMatchObject({
				api: "test-api",
				version: "1.0.0",
			});
		});
	});

	describe("Context Management", () => {
		it("should set and merge context", () => {
			perfManager.setContext({ api: "my-api" });
			perfManager.setContext({ version: "2.0.0" });

			perfManager.mark("test");
			const marks = performance.getEntriesByName("test");
			const latestMark = marks[marks.length - 1];
			expect((latestMark as PerformanceMark).detail).toMatchObject({
				api: "my-api",
				version: "2.0.0",
			});
		});

		it("should clear context at different levels", () => {
			perfManager.setContext({ api: "my-api", version: "1.0.0", category: "classes" });

			// Clear category level
			perfManager.clearContext("category");
			perfManager.mark("test1");
			let marks = performance.getEntriesByName("test1");
			let latestMark = marks[marks.length - 1];
			expect((latestMark as PerformanceMark).detail).toMatchObject({
				api: "my-api",
				version: "1.0.0",
			});
			expect((latestMark as PerformanceMark).detail).not.toHaveProperty("category");

			// Clear version level (also clears category)
			perfManager.setContext({ category: "interfaces" });
			perfManager.clearContext("version");
			perfManager.mark("test2");
			marks = performance.getEntriesByName("test2");
			latestMark = marks[marks.length - 1];
			expect((latestMark as PerformanceMark).detail).toMatchObject({ api: "my-api" });
			expect((latestMark as PerformanceMark).detail).not.toHaveProperty("version");
			expect((latestMark as PerformanceMark).detail).not.toHaveProperty("category");

			// Clear API level (clears everything)
			perfManager.setContext({ version: "2.0.0", category: "types" });
			perfManager.clearContext("api");
			perfManager.mark("test3");
			marks = performance.getEntriesByName("test3");
			latestMark = marks[marks.length - 1];
			expect((latestMark as PerformanceMark).detail).toEqual({});
		});
	});

	describe("Counters", () => {
		it("should increment counters", () => {
			perfManager.increment("file.reads");
			perfManager.increment("file.reads");
			perfManager.increment("file.reads", 3);

			expect(perfManager.getCounter("file.reads")).toBe(5);
		});

		it("should return 0 for non-existent counter", () => {
			expect(perfManager.getCounter("non.existent")).toBe(0);
		});

		it("should track multiple counters independently", () => {
			perfManager.increment("counter.a", 10);
			perfManager.increment("counter.b", 20);

			expect(perfManager.getCounter("counter.a")).toBe(10);
			expect(perfManager.getCounter("counter.b")).toBe(20);
		});
	});

	describe("Gauges", () => {
		it("should set and get gauge values", () => {
			perfManager.set("cache.hit.rate", 0.85);
			expect(perfManager.getGauge("cache.hit.rate")).toBe(0.85);
		});

		it("should return undefined for non-existent gauge", () => {
			expect(perfManager.getGauge("non.existent")).toBeUndefined();
		});

		it("should overwrite gauge values", () => {
			perfManager.set("memory.usage", 100);
			perfManager.set("memory.usage", 200);

			expect(perfManager.getGauge("memory.usage")).toBe(200);
		});
	});

	describe("Slow Operation Detection", () => {
		it("should detect slow code blocks", () => {
			expect(perfManager.isSlow("code.block.render", 150)).toBe(true);
			expect(perfManager.isSlow("code.block.render", 50)).toBe(false);
		});

		it("should detect slow page generation", () => {
			expect(perfManager.isSlow("page.generate.index", 600)).toBe(true);
			expect(perfManager.isSlow("page.generate.index", 200)).toBe(false);
		});

		it("should detect slow API loads", () => {
			expect(perfManager.isSlow("api.load.model", 1500)).toBe(true);
			expect(perfManager.isSlow("api.load.model", 500)).toBe(false);
		});

		it("should detect slow file operations", () => {
			expect(perfManager.isSlow("file.write", 100)).toBe(true);
			expect(perfManager.isSlow("file.write", 20)).toBe(false);
		});

		it("should detect slow HTTP requests", () => {
			expect(perfManager.isSlow("net.http.fetch", 2500)).toBe(true);
			expect(perfManager.isSlow("net.http.fetch", 1000)).toBe(false);
		});

		it("should detect slow DB operations", () => {
			expect(perfManager.isSlow("db.query", 150)).toBe(true);
			expect(perfManager.isSlow("db.query", 50)).toBe(false);
		});

		it("should use custom thresholds", () => {
			PerformanceManager.resetInstance();
			const customPerfManager = PerformanceManager.getInstance(logger, {
				slowCodeBlock: 200,
				slowPageGeneration: 1000,
			});

			expect(customPerfManager.isSlow("code.block.render", 150)).toBe(false);
			expect(customPerfManager.isSlow("code.block.render", 250)).toBe(true);
			expect(customPerfManager.isSlow("page.generate.index", 800)).toBe(false);
			expect(customPerfManager.isSlow("page.generate.index", 1200)).toBe(true);

			customPerfManager.disconnect();
		});
	});

	describe("Statistics", () => {
		it("should compute basic statistics", async () => {
			// Create multiple measurements
			for (let i = 0; i < 5; i++) {
				perfManager.mark(`test.${i}.start`);
				await new Promise((resolve) => setTimeout(resolve, 10 + i * 5));
				perfManager.mark(`test.${i}.end`);
				perfManager.measure("test.operation", `test.${i}.start`, `test.${i}.end`);
			}

			// Wait for PerformanceObserver
			await new Promise((resolve) => setTimeout(resolve, 50));

			const stats = perfManager.getStats("test.operation");
			expect(stats.count).toBe(5);
			expect(stats.total).toBeGreaterThan(0);
			expect(stats.avg).toBeGreaterThan(0);
			expect(stats.min).toBeGreaterThan(0);
			expect(stats.max).toBeGreaterThan(stats.min);
			expect(stats.avg).toBeCloseTo(stats.total / stats.count, 1);
		});

		it("should return zero stats for non-existent metric", () => {
			const stats = perfManager.getStats("non.existent");
			expect(stats).toEqual({
				count: 0,
				total: 0,
				avg: 0,
				min: 0,
				max: 0,
			});
		});
	});

	describe("Hierarchical Statistics", () => {
		it("should group statistics by API", async () => {
			// Create measurements for different APIs
			perfManager.setContext({ api: "api-a" });
			perfManager.mark("op.a1.start");
			await new Promise((resolve) => setTimeout(resolve, 10));
			perfManager.mark("op.a1.end");
			perfManager.measure("page.generate", "op.a1.start", "op.a1.end");

			perfManager.setContext({ api: "api-b" });
			perfManager.mark("op.b1.start");
			await new Promise((resolve) => setTimeout(resolve, 10));
			perfManager.mark("op.b1.end");
			perfManager.measure("page.generate", "op.b1.start", "op.b1.end");

			// Wait for PerformanceObserver
			await new Promise((resolve) => setTimeout(resolve, 50));

			const hierarchicalStats = perfManager.getHierarchicalStats("page.generate");

			expect(hierarchicalStats.overall.count).toBe(2);
			expect(hierarchicalStats.byApi.size).toBe(2);
			expect(hierarchicalStats.byApi.get("api-a")?.count).toBe(1);
			expect(hierarchicalStats.byApi.get("api-b")?.count).toBe(1);
		});

		it("should group statistics by version", async () => {
			perfManager.setContext({ api: "my-api", version: "1.0.0" });
			perfManager.mark("v1.start");
			await new Promise((resolve) => setTimeout(resolve, 10));
			perfManager.mark("v1.end");
			perfManager.measure("api.load", "v1.start", "v1.end");

			perfManager.setContext({ api: "my-api", version: "2.0.0" });
			perfManager.mark("v2.start");
			await new Promise((resolve) => setTimeout(resolve, 10));
			perfManager.mark("v2.end");
			perfManager.measure("api.load", "v2.start", "v2.end");

			// Wait for PerformanceObserver
			await new Promise((resolve) => setTimeout(resolve, 50));

			const hierarchicalStats = perfManager.getHierarchicalStats("api.load");

			expect(hierarchicalStats.byVersion.size).toBe(1);
			expect(hierarchicalStats.byVersion.get("my-api")?.size).toBe(2);
			expect(hierarchicalStats.byVersion.get("my-api")?.get("1.0.0")?.count).toBe(1);
			expect(hierarchicalStats.byVersion.get("my-api")?.get("2.0.0")?.count).toBe(1);
		});

		it("should group statistics by category", async () => {
			perfManager.setContext({ api: "my-api", category: "classes" });
			perfManager.mark("class.start");
			await new Promise((resolve) => setTimeout(resolve, 10));
			perfManager.mark("class.end");
			perfManager.measure("page.generate", "class.start", "class.end");

			perfManager.setContext({ api: "my-api", category: "interfaces" });
			perfManager.mark("interface.start");
			await new Promise((resolve) => setTimeout(resolve, 10));
			perfManager.mark("interface.end");
			perfManager.measure("page.generate", "interface.start", "interface.end");

			// Wait for PerformanceObserver
			await new Promise((resolve) => setTimeout(resolve, 50));

			const hierarchicalStats = perfManager.getHierarchicalStats("page.generate");

			expect(hierarchicalStats.byCategory.size).toBe(2);
			expect(hierarchicalStats.byCategory.get("classes")?.count).toBe(1);
			expect(hierarchicalStats.byCategory.get("interfaces")?.count).toBe(1);
		});

		it("should handle measurements without context", async () => {
			// Measurement without context
			perfManager.mark("no-ctx.start");
			await new Promise((resolve) => setTimeout(resolve, 10));
			perfManager.mark("no-ctx.end");
			perfManager.measure("test.metric", "no-ctx.start", "no-ctx.end");

			// Wait for PerformanceObserver
			await new Promise((resolve) => setTimeout(resolve, 50));

			const hierarchicalStats = perfManager.getHierarchicalStats("test.metric");

			expect(hierarchicalStats.overall.count).toBe(1);
			expect(hierarchicalStats.byApi.size).toBe(0);
			expect(hierarchicalStats.byVersion.size).toBe(0);
			expect(hierarchicalStats.byCategory.size).toBe(0);
		});
	});

	describe("Slow Operations Filtering", () => {
		it("should return only slow operations", async () => {
			// Create fast and slow operations
			perfManager.mark("fast.start");
			await new Promise((resolve) => setTimeout(resolve, 5));
			perfManager.mark("fast.end");
			perfManager.measure("code.block.render", "fast.start", "fast.end");

			perfManager.mark("slow.start");
			await new Promise((resolve) => setTimeout(resolve, 150));
			perfManager.mark("slow.end");
			perfManager.measure("code.block.render", "slow.start", "slow.end");

			// Wait for PerformanceObserver
			await new Promise((resolve) => setTimeout(resolve, 50));

			const slowOps = perfManager.getSlowOperations("code.block.render");
			expect(slowOps.length).toBe(1);
			expect(slowOps[0].duration).toBeGreaterThan(100);
		});
	});

	describe("Clear and Disconnect", () => {
		it("should clear all measurements, counters, and gauges", async () => {
			// Add some data
			perfManager.increment("counter", 5);
			perfManager.set("gauge", 100);
			perfManager.mark("test.start");
			perfManager.mark("test.end");
			perfManager.measure("test.metric", "test.start", "test.end");

			// Wait for PerformanceObserver
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Clear
			perfManager.clear();

			// Verify everything is cleared
			expect(perfManager.getCounter("counter")).toBe(0);
			expect(perfManager.getGauge("gauge")).toBeUndefined();
			expect(perfManager.getMeasurements("test.metric")).toEqual([]);
			expect(performance.getEntriesByName("test.start")).toEqual([]);
			expect(performance.getEntriesByName("test.end")).toEqual([]);
		});

		it("should disconnect observer and clear data", async () => {
			perfManager.increment("counter", 10);
			perfManager.set("gauge", 50);

			perfManager.disconnect();

			// Verify data is cleared
			expect(perfManager.getCounter("counter")).toBe(0);
			expect(perfManager.getGauge("gauge")).toBeUndefined();
		});
	});

	describe("Data Retrieval", () => {
		it("should get all measurements", async () => {
			perfManager.mark("metric1.start");
			perfManager.mark("metric1.end");
			perfManager.measure("metric1", "metric1.start", "metric1.end");

			perfManager.mark("metric2.start");
			perfManager.mark("metric2.end");
			perfManager.measure("metric2", "metric2.start", "metric2.end");

			// Wait for PerformanceObserver
			await new Promise((resolve) => setTimeout(resolve, 50));

			const allMeasurements = perfManager.getAllMeasurements();
			expect(allMeasurements.size).toBeGreaterThanOrEqual(2);
			expect(allMeasurements.has("metric1")).toBe(true);
			expect(allMeasurements.has("metric2")).toBe(true);
		});

		it("should get all counters", () => {
			perfManager.increment("counter.a", 5);
			perfManager.increment("counter.b", 10);
			perfManager.increment("counter.c", 15);

			const allCounters = perfManager.getAllCounters();
			expect(allCounters.size).toBe(3);
			expect(allCounters.get("counter.a")).toBe(5);
			expect(allCounters.get("counter.b")).toBe(10);
			expect(allCounters.get("counter.c")).toBe(15);
		});

		it("should get all gauges", () => {
			perfManager.set("gauge.a", 1.5);
			perfManager.set("gauge.b", 2.5);
			perfManager.set("gauge.c", 3.5);

			const allGauges = perfManager.getAllGauges();
			expect(allGauges.size).toBe(3);
			expect(allGauges.get("gauge.a")).toBe(1.5);
			expect(allGauges.get("gauge.b")).toBe(2.5);
			expect(allGauges.get("gauge.c")).toBe(3.5);
		});
	});
});
