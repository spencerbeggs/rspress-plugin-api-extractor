import { Metric } from "effect";

/**
 * All build metrics as named counters/histograms.
 *
 * Note: Effect Metrics use a process-wide registry. In tests, counters
 * accumulate across test cases within the same process. Test assertions
 * should use loose matching (toContain) rather than exact count checks.
 *
 * Extracted into its own module so that `metrics-sink.ts` can import it
 * without creating a circular dependency through `ObservabilityLive.ts`
 * (which itself imports `metrics-sink.ts`).
 */
export const BuildMetrics = {
	filesTotal: Metric.counter("files.total"),
	filesNew: Metric.counter("files.new"),
	filesModified: Metric.counter("files.modified"),
	filesUnchanged: Metric.counter("files.unchanged"),
	codeblockDuration: Metric.histogram("codeblock.duration", {
		boundaries: [10, 25, 50, 100, 200, 500, 1000],
	}),
	codeblockShikiDuration: Metric.histogram("codeblock.shiki.duration", {
		boundaries: [5, 10, 25, 50, 100, 250],
	}),
	codeblockTotal: Metric.counter("codeblock.total"),
	codeblockSlow: Metric.counter("codeblock.slow"),
	twoslashErrors: Metric.counter("twoslash.errors"),
	prettierErrors: Metric.counter("prettier.errors"),
	pagesGenerated: Metric.counter("pages.generated"),
	apiVersionsLoaded: Metric.counter("api.versions.loaded"),
	externalPackagesTotal: Metric.counter("external.packages.total"),
	phaseDuration: Metric.histogram("phase.duration", {
		boundaries: [50, 100, 250, 500, 1000, 2500, 5000, 10000],
	}),
	vfsFiles: Metric.counter("vfs.files"),
	importsPrepended: Metric.counter("imports.prepended"),
	twoslashDiagnostics: Metric.counter("twoslash.diagnostics"),
	configDefaultsApplied: Metric.counter("config.defaults.applied"),
} as const;
