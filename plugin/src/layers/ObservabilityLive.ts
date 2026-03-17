import type { Layer } from "effect";
import { LogLevel, Logger, Metric, MetricBoundaries } from "effect";

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
	codeblockSlow: Metric.counter("codeblock.slow"),
	twoslashErrors: Metric.counter("twoslash.errors"),
	prettierErrors: Metric.counter("prettier.errors"),
	pagesGenerated: Metric.counter("pages.generated"),
} as const;

/**
 * Create the Logger layer for the plugin.
 *
 * @param logLevel - Plugin log level from options
 */
export function PluginLoggerLive(
	logLevel: "debug" | "verbose" | "info" | "warn" | "error" = "info",
): Layer.Layer<never> {
	const effectLogLevel = {
		debug: LogLevel.Debug,
		verbose: LogLevel.Debug,
		info: LogLevel.Info,
		warn: LogLevel.Warning,
		error: LogLevel.Error,
	}[logLevel];

	return Logger.minimumLogLevel(effectLogLevel);
}
