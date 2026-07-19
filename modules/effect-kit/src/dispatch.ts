/**
 * Dispatch primitives for the effect-kit fixture.
 *
 * @packageDocumentation
 */
import { Schema } from "effect";

/**
 * Whether dispatch runs synchronously or asynchronously.
 * @public
 */
export const DispatchKind = Schema.Literals(["sync", "async"]);
/**
 * Whether dispatch runs synchronously or asynchronously.
 * @public
 */
export type DispatchKind = typeof DispatchKind.Type;

/**
 * Envelope describing a single dispatch.
 * @public
 */
export interface DispatchEnvelope {
	/** Unique dispatch id. */
	readonly id: string;
	/** Dispatch kind. */
	readonly kind: DispatchKind;
}
