import type { Effect } from "effect";
import { Context } from "effect";

export interface CrossLinkData {
	readonly routes: Map<string, string>;
	readonly kinds: Map<string, string>;
}

export interface CrossLinkerServiceShape {
	readonly registerItems: (data: CrossLinkData, apiScope: string) => Effect.Effect<void>;

	readonly generateInlineCodeLinks: (text: string) => Effect.Effect<string>;

	readonly getCrossLinkData: Effect.Effect<CrossLinkData>;
}

export class CrossLinkerService extends Context.Tag("rspress-plugin-api-extractor/CrossLinkerService")<
	CrossLinkerService,
	CrossLinkerServiceShape
>() {}
