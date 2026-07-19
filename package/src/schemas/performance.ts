import { Effect, Schema } from "effect";

export const PerformanceThresholds = Schema.Struct({
	slowCodeBlock: Schema.Number.pipe(Schema.withDecodingDefault(Effect.succeed(500))),
	slowPageGeneration: Schema.Number.pipe(Schema.withDecodingDefault(Effect.succeed(500))),
	slowApiLoad: Schema.Number.pipe(Schema.withDecodingDefault(Effect.succeed(1000))),
	slowFileOperation: Schema.Number.pipe(Schema.withDecodingDefault(Effect.succeed(50))),
	slowHttpRequest: Schema.Number.pipe(Schema.withDecodingDefault(Effect.succeed(2000))),
	slowDbOperation: Schema.Number.pipe(Schema.withDecodingDefault(Effect.succeed(100))),
});
/**
 * Consumer-facing type uses Encoded (input shape with optional fields).
 * Schema.decode fills in defaults at runtime.
 */
export type PerformanceThresholds = typeof PerformanceThresholds.Encoded;

export const PerformanceConfig = Schema.Struct({
	thresholds: Schema.optional(PerformanceThresholds),
	showInsights: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
	trackDetailedMetrics: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
});
/**
 * Consumer-facing type uses Encoded (input shape with optional fields).
 * Schema.decode fills in defaults at runtime.
 */
export type PerformanceConfig = typeof PerformanceConfig.Encoded;
