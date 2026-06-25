/**
 * Testing utilities for the effect-kit fixture.
 *
 * @packageDocumentation
 */
import { Schema } from "effect";

export type { AcceptanceMetrics } from "./index.js";
// Re-exports from the main entry (exercise cross-entry dedup + "Available from").
export { ActionSeverity, AgentNotFoundError, summarize } from "./index.js";

/**
 * Mock playback mode for the test harness.
 * @public
 */
export const MockMode = Schema.Literal("record", "replay");
/**
 * Mock playback mode for the test harness.
 * @public
 */
export type MockMode = Schema.Schema.Type<typeof MockMode>;

/**
 * A captured interaction used by the mock harness.
 * @public
 */
export interface MockInteraction {
	/** The recorded input payload. */
	readonly input: string;
	/** The recorded output payload. */
	readonly output: string;
}
