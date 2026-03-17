import type { Layer } from "effect";
import { Effect } from "effect";

/**
 * Run an Effect program and return the result as a Promise.
 */
export function runTest<A, E>(effect: Effect.Effect<A, E, never>): Promise<A> {
	return Effect.runPromise(effect);
}

/**
 * Run an Effect program with a provided layer.
 */
export function runTestWithLayer<A, E, R>(effect: Effect.Effect<A, E, R>, layer: Layer.Layer<R>): Promise<A> {
	return Effect.runPromise(effect.pipe(Effect.provide(layer)));
}
