import type { Effect } from "effect";
import { Context } from "effect";
import type { ShikiTransformer } from "shiki";
import type { TwoslashProcessingError } from "../errors.js";

export interface ShikiServiceShape {
	readonly highlightCode: (
		code: string,
		lang: string,
		transformers?: ReadonlyArray<ShikiTransformer>,
		meta?: Record<string, string>,
	) => Effect.Effect<string, TwoslashProcessingError>;

	readonly getCrossLinkerTransformer: Effect.Effect<ShikiTransformer>;
}

export class ShikiService extends Context.Tag("rspress-plugin-api-extractor/ShikiService")<
	ShikiService,
	ShikiServiceShape
>() {}
