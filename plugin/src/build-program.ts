import { Effect } from "effect";

export interface BuildProgramOptions {
	readonly dryRun?: boolean;
}

/**
 * Top-level Effect program for the plugin build.
 *
 * Phase 1: Returns a no-op effect (existing logic stays in plugin.ts).
 * Phase 2: Will contain the full Stream pipeline.
 */
export function buildProgram(_options: BuildProgramOptions = {}): Effect.Effect<void> {
	return Effect.log("Build program initialized (Phase 1 skeleton)");
}
