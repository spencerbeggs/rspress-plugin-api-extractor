import { Schema } from "effect";

export const PerformanceThresholds = Schema.Struct({
	slowCodeBlock: Schema.optionalWith(Schema.Number, { default: () => 100 }),
	slowPageGeneration: Schema.optionalWith(Schema.Number, { default: () => 500 }),
	slowApiLoad: Schema.optionalWith(Schema.Number, { default: () => 1000 }),
	slowFileOperation: Schema.optionalWith(Schema.Number, { default: () => 50 }),
	slowHttpRequest: Schema.optionalWith(Schema.Number, { default: () => 2000 }),
	slowDbOperation: Schema.optionalWith(Schema.Number, { default: () => 100 }),
});
export type PerformanceThresholds = Schema.Schema.Type<typeof PerformanceThresholds>;

export const PerformanceConfig = Schema.Struct({
	thresholds: Schema.optional(PerformanceThresholds),
	showInsights: Schema.optionalWith(Schema.Boolean, { default: () => true }),
	trackDetailedMetrics: Schema.optionalWith(Schema.Boolean, { default: () => false }),
});
export type PerformanceConfig = Schema.Schema.Type<typeof PerformanceConfig>;
