import { Schema } from "effect";

export const PerformanceThresholds = Schema.mutable(
	Schema.Struct({
		slowCodeBlock: Schema.optionalWith(Schema.Number, { default: () => 100 }),
		slowPageGeneration: Schema.optionalWith(Schema.Number, { default: () => 500 }),
		slowApiLoad: Schema.optionalWith(Schema.Number, { default: () => 1000 }),
		slowFileOperation: Schema.optionalWith(Schema.Number, { default: () => 50 }),
		slowHttpRequest: Schema.optionalWith(Schema.Number, { default: () => 2000 }),
		slowDbOperation: Schema.optionalWith(Schema.Number, { default: () => 100 }),
	}),
);
/**
 * Consumer-facing type uses Encoded (input shape with optional fields).
 * Schema.decode fills in defaults at runtime.
 */
export type PerformanceThresholds = Schema.Schema.Encoded<typeof PerformanceThresholds>;

export const PerformanceConfig = Schema.mutable(
	Schema.Struct({
		thresholds: Schema.optional(PerformanceThresholds),
		showInsights: Schema.optionalWith(Schema.Boolean, { default: () => true }),
		trackDetailedMetrics: Schema.optionalWith(Schema.Boolean, { default: () => false }),
	}),
);
/**
 * Consumer-facing type uses Encoded (input shape with optional fields).
 * Schema.decode fills in defaults at runtime.
 */
export type PerformanceConfig = Schema.Schema.Encoded<typeof PerformanceConfig>;
