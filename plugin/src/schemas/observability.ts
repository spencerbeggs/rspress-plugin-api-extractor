import { Schema } from "effect";
import { PerformanceThresholds } from "./performance.js";

export const EventLevelSchema = Schema.Literal("none", "error", "warn", "info", "debug", "trace", "verbose");
export type EventLevelInput = Schema.Schema.Type<typeof EventLevelSchema>;

export const ObservabilityConfig = Schema.mutable(
	Schema.Struct({
		logLevel: Schema.optional(EventLevelSchema),
		trace: Schema.optional(Schema.Union(Schema.Boolean, Schema.String)),
		thresholds: Schema.optional(PerformanceThresholds),
	}),
);
export type ObservabilityConfig = Schema.Schema.Encoded<typeof ObservabilityConfig>;

export type EventLevel = "error" | "warn" | "info" | "debug" | "trace";

export interface ResolvedObservability {
	readonly logLevel: EventLevel | "none";
	readonly json: boolean;
	readonly tracePath: string | null;
	readonly thresholds: {
		slowCodeBlock: number;
		slowPageGeneration: number;
		slowApiLoad: number;
		slowFileOperation: number;
		slowHttpRequest: number;
		slowDbOperation: number;
	};
}

const DEFAULT_THRESHOLDS: ResolvedObservability["thresholds"] = {
	slowCodeBlock: 100,
	slowPageGeneration: 500,
	slowApiLoad: 1000,
	slowFileOperation: 50,
	slowHttpRequest: 2000,
	slowDbOperation: 100,
};

function normalizeLevel(value: string | undefined): EventLevel | "none" | undefined {
	if (value === undefined) return undefined;
	if (value === "verbose") return "debug";
	return value as EventLevel | "none";
}

export interface ResolveObservabilityInput {
	readonly observability?: ObservabilityConfig;
	readonly logLevel?: string;
	readonly performance?: { thresholds?: Partial<ResolvedObservability["thresholds"]> };
	readonly envLogLevel?: string;
	readonly outDir: string;
	readonly buildId: string;
}

export function resolveObservability(input: ResolveObservabilityInput): {
	resolved: ResolvedObservability;
	deprecations: Array<{ key: string; replacement: string }>;
} {
	const deprecations: Array<{ key: string; replacement: string }> = [];
	if (input.logLevel !== undefined) deprecations.push({ key: "logLevel", replacement: "observability.logLevel" });
	if (input.performance !== undefined)
		deprecations.push({ key: "performance", replacement: "observability.thresholds" });

	const level =
		normalizeLevel(input.envLogLevel) ??
		normalizeLevel(input.observability?.logLevel) ??
		normalizeLevel(input.logLevel) ??
		"info";

	const traceOpt = input.observability?.trace;
	const tracePath =
		typeof traceOpt === "string"
			? traceOpt
			: traceOpt === true
				? `${input.outDir}/.api-extractor/trace-${input.buildId}.jsonl`
				: null;

	const merged = {
		...DEFAULT_THRESHOLDS,
		...(input.performance?.thresholds ?? {}),
		...(input.observability?.thresholds ?? {}),
	};

	const thresholds: ResolvedObservability["thresholds"] = {
		slowCodeBlock: merged.slowCodeBlock ?? DEFAULT_THRESHOLDS.slowCodeBlock,
		slowPageGeneration: merged.slowPageGeneration ?? DEFAULT_THRESHOLDS.slowPageGeneration,
		slowApiLoad: merged.slowApiLoad ?? DEFAULT_THRESHOLDS.slowApiLoad,
		slowFileOperation: merged.slowFileOperation ?? DEFAULT_THRESHOLDS.slowFileOperation,
		slowHttpRequest: merged.slowHttpRequest ?? DEFAULT_THRESHOLDS.slowHttpRequest,
		slowDbOperation: merged.slowDbOperation ?? DEFAULT_THRESHOLDS.slowDbOperation,
	};

	return {
		resolved: { logLevel: level, json: level === "debug", tracePath, thresholds },
		deprecations,
	};
}
