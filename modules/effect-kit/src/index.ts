/**
 * Effect-based fixture exercising the Schema companion pattern (a `const` and a
 * `type` sharing a name) plus a variety of API item kinds.
 *
 * @packageDocumentation
 */
import { Schema } from "effect";

/** Severity of a remediation action. */
export const ActionSeverity = Schema.Literal("low", "medium", "high");
/** Severity of a remediation action. */
export type ActionSeverity = Schema.Schema.Type<typeof ActionSeverity>;

/** The kind of actor that produced an event. */
export const ActorType = Schema.Literal("agent", "human", "system");
/** The kind of actor that produced an event. */
export type ActorType = Schema.Schema.Type<typeof ActorType>;

/** Lifecycle phase of a run. */
export const RunPhase = Schema.Literal("setup", "active", "teardown");
/** Lifecycle phase of a run. */
export type RunPhase = Schema.Schema.Type<typeof RunPhase>;

/** Acceptance metrics for a completed run. */
export interface AcceptanceMetrics {
	/** Number of checks that passed. */
	readonly passed: number;
	/** Number of checks that failed. */
	readonly failed: number;
}

/** Error raised when an agent cannot be located. */
export class AgentNotFoundError extends Schema.TaggedError<AgentNotFoundError>()("AgentNotFoundError", {
	agentId: Schema.String,
}) {}

/** Branded identifier for a run. */
export type RunId = string;

/** Summarize acceptance metrics into a short human string. */
export function summarize(metrics: AcceptanceMetrics): string {
	return `${metrics.passed} passed, ${metrics.failed} failed`;
}

/** Output channel for dispatched results. */
export enum OutputChannel {
	Terminal = 0,
	Json = 1,
	Silent = 2,
}
