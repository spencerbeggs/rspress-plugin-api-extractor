import { PerformanceObserver } from "node:perf_hooks";
import type { DebugLogger } from "./debug-logger.js";
import type { PerformanceThresholds } from "./types.js";

/**
 * Default performance thresholds for slow operation warnings.
 * These can be overridden via plugin configuration.
 */
export const DEFAULT_PERFORMANCE_THRESHOLDS: Required<PerformanceThresholds> = {
	slowCodeBlock: 100, // 100ms - code blocks should be fast
	slowPageGeneration: 500, // 500ms - pages can be more complex
	slowApiLoad: 1000, // 1s - API models can be large
	slowFileOperation: 50, // 50ms - file I/O should be quick
	slowHttpRequest: 2000, // 2s - network can be slow
	slowDbOperation: 100, // 100ms - SQLite should be fast
};

/**
 * Metric context for hierarchical tracking.
 * Automatically attached to measurements for grouping and analysis.
 */
export interface MetricContext {
	/** API name (e.g., "claude-binary-plugin", "@effect/schema") */
	api?: string;
	/** API version (e.g., "0.64.0", "_default") */
	version?: string;
	/** Category (e.g., "classes", "interfaces") */
	category?: string;
}

/**
 * Statistical summary of measurements.
 */
export interface MeasurementStats {
	/** Number of measurements */
	count: number;
	/** Total duration across all measurements (ms) */
	total: number;
	/** Average duration (ms) */
	avg: number;
	/** Minimum duration (ms) */
	min: number;
	/** Maximum duration (ms) */
	max: number;
}

/**
 * Hierarchical statistics grouped by context.
 */
export interface HierarchicalStats {
	/** Overall statistics across all contexts */
	overall: MeasurementStats;
	/** Statistics grouped by API name */
	byApi: Map<string, MeasurementStats>;
	/** Statistics grouped by API name and version */
	byVersion: Map<string, Map<string, MeasurementStats>>;
	/** Statistics grouped by category */
	byCategory: Map<string, MeasurementStats>;
}

/**
 * Performance monitoring manager using Node.js PerformanceObserver API.
 *
 * Provides centralized, zero-overhead performance tracking with:
 * - Automatic measurement collection via PerformanceObserver
 * - Hierarchical grouping by API/version/category
 * - Configurable slow operation thresholds
 * - Counter and gauge metrics
 *
 * @example Basic usage
 * ```ts
 * const perf = PerformanceManager.getInstance(logger);
 *
 * // Mark start and end of operation
 * perf.mark('api.load.start');
 * // ... load API ...
 * perf.mark('api.load.end');
 * perf.measure('api.load', 'api.load.start', 'api.load.end');
 *
 * // Increment counters
 * perf.increment('file.read.count');
 * perf.increment('file.read.bytes', 12345);
 *
 * // Set gauges
 * perf.set('cache.hit.rate', 0.85);
 * ```
 *
 * @example With context tracking
 * ```ts
 * perf.setContext({ api: 'my-package', version: '1.0.0' });
 * perf.mark('page.generate.start');
 * // ... generate page ...
 * perf.mark('page.generate.end');
 * perf.measure('page.generate', 'page.generate.start', 'page.generate.end');
 * // Measurement automatically tagged with api and version
 *
 * perf.clearContext('version'); // Clear version, keep api
 * ```
 */
export class PerformanceManager {
	private static instance: PerformanceManager | undefined;
	private observer: PerformanceObserver;
	private measurements: Map<string, PerformanceMeasure[]>;
	private counters: Map<string, number>;
	private gauges: Map<string, number>;
	private thresholds: Required<PerformanceThresholds>;
	private currentContext: MetricContext;

	private constructor(
		private logger: DebugLogger,
		thresholds?: PerformanceThresholds,
	) {
		this.measurements = new Map();
		this.counters = new Map();
		this.gauges = new Map();
		this.currentContext = {};

		// Merge custom thresholds with defaults
		this.thresholds = {
			...DEFAULT_PERFORMANCE_THRESHOLDS,
			...thresholds,
		};

		// Set up PerformanceObserver
		this.observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				this.collectMeasurement(entry as PerformanceMeasure);
			}
		});
		this.observer.observe({ entryTypes: ["measure"] });

		this.logger.debug("PerformanceManager initialized");
	}

	/**
	 * Get the singleton PerformanceManager instance.
	 * Creates a new instance if one doesn't exist.
	 *
	 * @param logger - Logger instance for debug output
	 * @param thresholds - Optional custom performance thresholds
	 */
	static getInstance(logger: DebugLogger, thresholds?: PerformanceThresholds): PerformanceManager {
		if (!PerformanceManager.instance) {
			PerformanceManager.instance = new PerformanceManager(logger, thresholds);
		}
		return PerformanceManager.instance;
	}

	/**
	 * Reset the singleton instance.
	 * Useful for testing or when reconfiguring the manager.
	 */
	static resetInstance(): void {
		if (PerformanceManager.instance) {
			PerformanceManager.instance.disconnect();
			PerformanceManager.instance = undefined;
		}
	}

	/**
	 * Set the current metric context for automatic tagging.
	 * All subsequent measurements will include this context.
	 *
	 * @param context - Partial context to merge with current context
	 */
	setContext(context: Partial<MetricContext>): void {
		this.currentContext = { ...this.currentContext, ...context };
	}

	/**
	 * Clear context at a specific level.
	 *
	 * @param level - Context level to clear (api, version, or category)
	 */
	clearContext(level: "api" | "version" | "category"): void {
		if (level === "api") {
			this.currentContext = {};
		} else if (level === "version") {
			delete this.currentContext.version;
			delete this.currentContext.category;
		} else if (level === "category") {
			delete this.currentContext.category;
		}
	}

	/**
	 * Create a performance mark with automatic context tagging.
	 *
	 * @param name - Mark name
	 * @param detail - Optional additional details
	 */
	mark(name: string, detail?: unknown): void {
		const contextualDetail = {
			...(typeof detail === "object" && detail !== null ? detail : {}),
			...this.currentContext,
		};
		performance.mark(name, { detail: contextualDetail });
	}

	/**
	 * Create a performance measure between two marks.
	 *
	 * @param name - Measure name
	 * @param startMark - Start mark name
	 * @param endMark - End mark name
	 * @param detail - Optional additional details
	 */
	measure(name: string, startMark: string, endMark: string, detail?: unknown): void {
		const contextualDetail = {
			...(typeof detail === "object" && detail !== null ? detail : {}),
			...this.currentContext,
		};
		performance.measure(name, {
			start: startMark,
			end: endMark,
			detail: contextualDetail,
		});
	}

	/**
	 * Increment a counter metric.
	 *
	 * @param name - Counter name
	 * @param value - Amount to increment (default: 1)
	 */
	increment(name: string, value: number = 1): void {
		this.counters.set(name, (this.counters.get(name) || 0) + value);
	}

	/**
	 * Set a gauge metric value.
	 *
	 * @param name - Gauge name
	 * @param value - Gauge value
	 */
	set(name: string, value: number): void {
		this.gauges.set(name, value);
	}

	/**
	 * Get the value of a counter metric.
	 *
	 * @param name - Counter name
	 * @returns Counter value (0 if not found)
	 */
	getCounter(name: string): number {
		return this.counters.get(name) || 0;
	}

	/**
	 * Get the value of a gauge metric.
	 *
	 * @param name - Gauge name
	 * @returns Gauge value (undefined if not found)
	 */
	getGauge(name: string): number | undefined {
		return this.gauges.get(name);
	}

	/**
	 * Check if an operation is slow based on configured thresholds.
	 *
	 * @param operation - Operation name
	 * @param duration - Operation duration in milliseconds
	 * @returns True if the operation is considered slow
	 */
	isSlow(operation: string, duration: number): boolean {
		if (operation.startsWith("shiki.render") || operation.startsWith("code.block")) {
			return duration > this.thresholds.slowCodeBlock;
		}
		if (operation.startsWith("page.generate")) {
			return duration > this.thresholds.slowPageGeneration;
		}
		if (operation.startsWith("api.load")) {
			return duration > this.thresholds.slowApiLoad;
		}
		if (operation.startsWith("file.")) {
			return duration > this.thresholds.slowFileOperation;
		}
		if (operation.startsWith("net.http")) {
			return duration > this.thresholds.slowHttpRequest;
		}
		if (operation.startsWith("db.")) {
			return duration > this.thresholds.slowDbOperation;
		}
		return false;
	}

	/**
	 * Get slow operations from collected measurements.
	 *
	 * @param metric - Metric name to filter
	 * @returns Array of slow measurements
	 */
	getSlowOperations(metric: string): PerformanceMeasure[] {
		const entries = this.measurements.get(metric) || [];
		return entries.filter((e) => this.isSlow(metric, e.duration));
	}

	/**
	 * Get statistics for a specific metric.
	 *
	 * @param name - Metric name
	 * @returns Measurement statistics
	 */
	getStats(name: string): MeasurementStats {
		const entries = this.measurements.get(name) || [];
		return this.computeStats(entries);
	}

	/**
	 * Get hierarchical statistics for a metric grouped by context.
	 *
	 * @param metric - Metric name
	 * @returns Hierarchical statistics
	 */
	getHierarchicalStats(metric: string): HierarchicalStats {
		const entries = this.measurements.get(metric) || [];

		return {
			overall: this.computeStats(entries),
			byApi: this.groupByApi(entries),
			byVersion: this.groupByVersion(entries),
			byCategory: this.groupByCategory(entries),
		};
	}

	/**
	 * Get all measurements for a metric.
	 *
	 * @param name - Metric name
	 * @returns Array of performance measures
	 */
	getMeasurements(name: string): PerformanceMeasure[] {
		return this.measurements.get(name) || [];
	}

	/**
	 * Get all collected metrics.
	 *
	 * @returns Map of metric names to measurement arrays
	 */
	getAllMeasurements(): Map<string, PerformanceMeasure[]> {
		return new Map(this.measurements);
	}

	/**
	 * Get all counter values.
	 *
	 * @returns Map of counter names to values
	 */
	getAllCounters(): Map<string, number> {
		return new Map(this.counters);
	}

	/**
	 * Get all gauge values.
	 *
	 * @returns Map of gauge names to values
	 */
	getAllGauges(): Map<string, number> {
		return new Map(this.gauges);
	}

	/**
	 * Clear all collected data.
	 */
	clear(): void {
		this.measurements.clear();
		this.counters.clear();
		this.gauges.clear();
		performance.clearMarks();
		performance.clearMeasures();
		this.logger.debug("PerformanceManager cleared");
	}

	/**
	 * Disconnect the PerformanceObserver and clean up resources.
	 */
	disconnect(): void {
		this.observer.disconnect();
		this.clear();
		this.logger.debug("PerformanceManager disconnected");
	}

	/**
	 * Collect a measurement from the PerformanceObserver.
	 * @internal
	 */
	private collectMeasurement(entry: PerformanceMeasure): void {
		const entries = this.measurements.get(entry.name) || [];
		entries.push(entry);
		this.measurements.set(entry.name, entries);

		// Log in debug mode
		if (this.logger.isDebug()) {
			const detail = entry.detail ? ` ${JSON.stringify(entry.detail)}` : "";
			this.logger.debug(`⏱  ${entry.name}: ${entry.duration.toFixed(2)}ms${detail}`);
		}
	}

	/**
	 * Compute statistics from measurements.
	 * @internal
	 */
	private computeStats(entries: PerformanceMeasure[]): MeasurementStats {
		if (entries.length === 0) {
			return { count: 0, total: 0, avg: 0, min: 0, max: 0 };
		}

		const durations = entries.map((e) => e.duration);
		const total = durations.reduce((sum, d) => sum + d, 0);

		return {
			count: entries.length,
			total,
			avg: total / entries.length,
			min: Math.min(...durations),
			max: Math.max(...durations),
		};
	}

	/**
	 * Group measurements by API name.
	 * @internal
	 */
	private groupByApi(entries: PerformanceMeasure[]): Map<string, MeasurementStats> {
		const grouped = new Map<string, PerformanceMeasure[]>();

		for (const entry of entries) {
			const api = (entry.detail as MetricContext | undefined)?.api;
			if (api) {
				const list = grouped.get(api) || [];
				list.push(entry);
				grouped.set(api, list);
			}
		}

		return new Map(Array.from(grouped.entries()).map(([api, measures]) => [api, this.computeStats(measures)]));
	}

	/**
	 * Group measurements by API name and version.
	 * @internal
	 */
	private groupByVersion(entries: PerformanceMeasure[]): Map<string, Map<string, MeasurementStats>> {
		const grouped = new Map<string, Map<string, PerformanceMeasure[]>>();

		for (const entry of entries) {
			const api = (entry.detail as MetricContext | undefined)?.api;
			const version = (entry.detail as MetricContext | undefined)?.version;

			if (api) {
				if (!grouped.has(api)) {
					grouped.set(api, new Map());
				}

				const versionKey = version || "_default";
				const apiMap = grouped.get(api);
				if (apiMap) {
					const list = apiMap.get(versionKey) || [];
					list.push(entry);
					apiMap.set(versionKey, list);
				}
			}
		}

		return new Map(
			Array.from(grouped.entries()).map(([api, versionMap]) => [
				api,
				new Map(Array.from(versionMap.entries()).map(([version, measures]) => [version, this.computeStats(measures)])),
			]),
		);
	}

	/**
	 * Group measurements by category.
	 * @internal
	 */
	private groupByCategory(entries: PerformanceMeasure[]): Map<string, MeasurementStats> {
		const grouped = new Map<string, PerformanceMeasure[]>();

		for (const entry of entries) {
			const category = (entry.detail as MetricContext | undefined)?.category;
			if (category) {
				const list = grouped.get(category) || [];
				list.push(entry);
				grouped.set(category, list);
			}
		}

		return new Map(
			Array.from(grouped.entries()).map(([category, measures]) => [category, this.computeStats(measures)]),
		);
	}
}
