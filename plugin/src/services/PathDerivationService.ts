import type { Effect } from "effect";
import { Context } from "effect";
import type { PathDerivationError } from "../errors.js";

export interface DerivedPath {
	readonly outputDir: string;
	readonly routeBase: string;
	readonly version: string | undefined;
	readonly locale: string | undefined;
}

export interface PathDerivationInput {
	readonly mode: "single" | "multi";
	readonly docsRoot: string;
	readonly baseRoute: string;
	readonly apiFolder: string | null;
	readonly locales: ReadonlyArray<string>;
	readonly defaultLang: string | undefined;
	readonly versions: ReadonlyArray<string>;
	readonly defaultVersion: string | undefined;
}

export interface PathDerivationServiceShape {
	readonly derivePaths: (input: PathDerivationInput) => Effect.Effect<ReadonlyArray<DerivedPath>, PathDerivationError>;

	readonly normalizeBaseRoute: (route: string) => Effect.Effect<string, PathDerivationError>;
}

export class PathDerivationService extends Context.Tag("rspress-plugin-api-extractor/PathDerivationService")<
	PathDerivationService,
	PathDerivationServiceShape
>() {}
