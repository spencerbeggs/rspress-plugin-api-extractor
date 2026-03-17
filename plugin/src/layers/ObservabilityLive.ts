import type { HashMap } from "effect";
import { Layer, LogLevel, Logger, Metric, MetricBoundaries } from "effect";

/**
 * All build metrics as named counters/histograms.
 * These replace the 5 ad-hoc stats collector classes.
 */
export const BuildMetrics = {
	filesTotal: Metric.counter("files.total"),
	filesNew: Metric.counter("files.new"),
	filesModified: Metric.counter("files.modified"),
	filesUnchanged: Metric.counter("files.unchanged"),
	codeblockDuration: Metric.histogram(
		"codeblock.duration",
		MetricBoundaries.fromIterable([10, 25, 50, 100, 200, 500, 1000]),
	),
	codeblockShikiDuration: Metric.histogram(
		"codeblock.shiki.duration",
		MetricBoundaries.fromIterable([5, 10, 25, 50, 100, 250]),
	),
	codeblockTotal: Metric.counter("codeblock.total"),
	codeblockSlow: Metric.counter("codeblock.slow"),
	twoslashErrors: Metric.counter("twoslash.errors"),
	prettierErrors: Metric.counter("prettier.errors"),
	pagesGenerated: Metric.counter("pages.generated"),
	apiVersionsLoaded: Metric.counter("api.versions.loaded"),
	externalPackagesTotal: Metric.counter("external.packages.total"),
} as const;

/**
 * Format a Date as HH:MM:SS for console output.
 */
function formatTime(date: Date): string {
	return date.toTimeString().slice(0, 8);
}

/**
 * Extract annotations from HashMap to a plain object.
 */
function annotationsToObject(annotations: HashMap.HashMap<string, unknown>): Record<string, unknown> {
	const obj: Record<string, unknown> = {};
	for (const [key, value] of annotations) {
		obj[key] = value;
	}
	return obj;
}

/**
 * Create a custom plugin logger for the given mode.
 * Uses a closure to capture debugMode — no mutable module state.
 */
function makePluginLogger(debugMode: boolean) {
	return Logger.make(({ logLevel, message, date, annotations }) => {
		if (debugMode) {
			// Structured JSON for LLM consumption
			const entry: Record<string, unknown> = {
				timestamp: date.getTime(),
				level: logLevel.label.toLowerCase(),
				message: typeof message === "string" ? message : String(message),
				...annotationsToObject(annotations),
			};
			console.log(JSON.stringify(entry));
		} else {
			// Human-readable with emoji prefix
			const time = formatTime(date);
			const msg = typeof message === "string" ? message : String(message);
			const prefix = logLevel._tag === "Warning" ? "\u26A0\uFE0F  " : logLevel._tag === "Error" ? "\uD83D\uDD34 " : "";
			console.log(`[${time}] ${prefix}${msg}`);
		}
	});
}

/**
 * Create the complete observability layer for the plugin.
 * Replaces the default Effect logger with a custom one and sets minimum log level.
 *
 * @param logLevel - Plugin log level from options
 */
export function PluginLoggerLayer(
	logLevel: "debug" | "verbose" | "info" | "warn" | "error" | "none" = "info",
): Layer.Layer<never> {
	const debugMode = logLevel === "debug";
	const pluginLogger = makePluginLogger(debugMode);

	const effectLogLevel = {
		debug: LogLevel.Debug,
		verbose: LogLevel.Debug,
		info: LogLevel.Info,
		warn: LogLevel.Warning,
		error: LogLevel.Error,
		none: LogLevel.None,
	}[logLevel];

	return Layer.mergeAll(Logger.replace(Logger.defaultLogger, pluginLogger), Logger.minimumLogLevel(effectLogLevel));
}
