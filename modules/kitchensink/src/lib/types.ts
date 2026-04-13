/**
 * A middleware function that intercepts data flowing through a pipeline stage.
 *
 * @remarks
 * Middleware functions receive a value and a `next` continuation. They may
 * transform the data before or after calling `next`, or short-circuit the
 * chain by returning a value directly.
 *
 * @typeParam T - The type of data being processed.
 *
 * @param data - The current data value entering this middleware.
 * @param next - Continuation function that passes data to the next middleware.
 *
 * @example
 * ```typescript
 * import type { Middleware } from "kitchensink";
 *
 * const logger: Middleware<string> = (data, next) => {
 * 	console.log("before:", data);
 * 	const result = next(data);
 * 	console.log("after:", result);
 * 	return result;
 * };
 * ```
 *
 * @public
 */
export type Middleware<T> = (data: T, next: (data: T) => T) => T;

/**
 * A callback invoked when an unrecoverable error propagates out of a pipeline stage.
 *
 * @remarks
 * Error handlers should not rethrow. Use them to log, report, or perform
 * cleanup actions on failure.
 *
 * @param error - The error that was thrown.
 *
 * @public
 */
export type ErrorHandler = (error: Error) => void;

/**
 * An open-ended options bag for codec configuration.
 *
 * @remarks
 * Codec implementations may extend this type with their own typed properties.
 * Unknown keys are permitted to allow forward-compatible configuration.
 *
 * @public
 */
// biome-ignore lint/style/useConsistentTypeDefinitions: intentional index-signature type alias for API Extractor item-kind coverage
export type CodecOptions = { [key: string]: unknown };
