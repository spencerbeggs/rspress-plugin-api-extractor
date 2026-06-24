import { Effect } from "effect";
import type { ResolvedObservability } from "../schemas/observability.js";
import { emit } from "./EventBus.js";
import type { EventContext } from "./events.js";
import { PluginEvent } from "./events.js";

/**
 * Maps phase names to threshold keys in ResolvedObservability["thresholds"].
 * Used by withPhase to determine the breach threshold for a given phase.
 */
export const PHASE_THRESHOLD_KEY: Record<string, keyof ResolvedObservability["thresholds"]> = {
	modelLoad: "slowApiLoad",
	resolve: "slowApiLoad",
	generate: "slowPageGeneration",
	write: "slowFileOperation",
	cleanup: "slowDbOperation",
};

/**
 * Wrap an Effect in a phase span.
 *
 * Emits PhaseStarted before the effect runs, measures wall-clock duration,
 * emits PhaseCompleted after, and emits SlowOperation when the duration
 * exceeds the threshold mapped for this phase (defaulting to slowApiLoad).
 *
 * R type is unchanged: emit() is serviceOption-based (R = never), so adding
 * the span/events adds zero requirements to the caller.
 */
export function withPhase<A, E, R>(
	phase: string,
	ctx: EventContext,
	effect: Effect.Effect<A, E, R>,
	thresholds: ResolvedObservability["thresholds"],
): Effect.Effect<A, E, R> {
	return Effect.gen(function* () {
		yield* emit(PluginEvent.PhaseStarted({ ctx, level: "debug", phase }));
		const start = performance.now();
		const result = yield* Effect.withSpan(`phase.${phase}`)(effect);
		const elapsed = performance.now() - start;
		const durationMs = Math.round(elapsed);
		yield* emit(PluginEvent.PhaseCompleted({ ctx, level: "debug", phase, durationMs }));

		const thresholdKey = PHASE_THRESHOLD_KEY[phase] ?? "slowApiLoad";
		const threshold = thresholds[thresholdKey];
		if (elapsed >= threshold) {
			yield* emit(
				PluginEvent.SlowOperation({
					ctx,
					level: "warn",
					operation: `phase.${phase}`,
					durationMs,
					threshold,
				}),
			);
		}

		return result;
	}) as Effect.Effect<A, E, R>;
}

/**
 * Wrap an Effect in an operation span (no PhaseStarted/PhaseCompleted pair).
 *
 * Measures wall-clock duration, wraps in Effect.withSpan, and emits
 * SlowOperation on threshold breach. Use for sub-operations within a phase.
 */
export function withOp<A, E, R>(
	operation: string,
	ctx: EventContext,
	effect: Effect.Effect<A, E, R>,
	threshold: number,
): Effect.Effect<A, E, R> {
	return Effect.gen(function* () {
		const start = performance.now();
		const result = yield* Effect.withSpan(`op.${operation}`)(effect);
		const elapsed = performance.now() - start;
		const durationMs = Math.round(elapsed);

		if (elapsed >= threshold) {
			yield* emit(
				PluginEvent.SlowOperation({
					ctx,
					level: "warn",
					operation,
					durationMs,
					threshold,
				}),
			);
		}

		return result;
	}) as Effect.Effect<A, E, R>;
}
