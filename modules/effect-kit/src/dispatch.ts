/**
 * Dispatch primitives for the effect-kit fixture.
 *
 * @packageDocumentation
 */
import { Schema } from "effect";

/** Whether dispatch runs synchronously or asynchronously. */
export const DispatchKind = Schema.Literal("sync", "async");
/** Whether dispatch runs synchronously or asynchronously. */
export type DispatchKind = Schema.Schema.Type<typeof DispatchKind>;

/** Envelope describing a single dispatch. */
export interface DispatchEnvelope {
	/** Unique dispatch id. */
	readonly id: string;
	/** Dispatch kind. */
	readonly kind: DispatchKind;
}
