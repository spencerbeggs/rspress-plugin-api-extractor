/**
 * Effect-based fixture exercising the Schema companion pattern (a `const` and a
 * `type` sharing a name) plus a variety of API item kinds.
 *
 * @packageDocumentation
 */
import { Schema } from "effect";

/**
 * Severity of a remediation action.
 * @public
 */
export const ActionSeverity = Schema.Literals(["low", "medium", "high"]);
/**
 * Severity of a remediation action.
 * @public
 */
export type ActionSeverity = typeof ActionSeverity.Type;

/**
 * The kind of actor that produced an event.
 * @public
 */
export const ActorType = Schema.Literals(["agent", "human", "system"]);
/**
 * The kind of actor that produced an event.
 * @public
 */
export type ActorType = typeof ActorType.Type;

/**
 * Lifecycle phase of a run.
 * @public
 */
export const RunPhase = Schema.Literals(["setup", "active", "teardown"]);
/**
 * Lifecycle phase of a run.
 * @public
 */
export type RunPhase = typeof RunPhase.Type;

/**
 * Acceptance metrics for a completed run.
 * @public
 */
export interface AcceptanceMetrics {
	/** Number of checks that passed. */
	readonly passed: number;
	/** Number of checks that failed. */
	readonly failed: number;
}

/**
 * Error raised when an agent cannot be located.
 * @public
 */
export class AgentNotFoundError extends Schema.TaggedErrorClass<AgentNotFoundError>()("AgentNotFoundError", {
	agentId: Schema.String,
}) {}

/**
 * Branded identifier for a run.
 * @public
 */
export type RunId = string;

/**
 * Summarize acceptance metrics into a short human string.
 * @public
 */
export function summarize(metrics: AcceptanceMetrics): string {
	return `${metrics.passed} passed, ${metrics.failed} failed`;
}

/**
 * Output channel for dispatched results.
 * @public
 */
export enum OutputChannel {
	Terminal = 0,
	Json = 1,
	Silent = 2,
}
