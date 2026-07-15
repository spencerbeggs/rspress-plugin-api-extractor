import { Effect, Layer } from "effect";
import { deriveOutputPaths, normalizeBaseRoute } from "../path-derivation.js";
import { PathDerivationService } from "../services/PathDerivationService.js";

export const PathDerivationServiceLive = Layer.succeed(PathDerivationService, {
	derivePaths: (input) =>
		Effect.succeed(
			deriveOutputPaths({
				...input,
				locales: [...input.locales],
				versions: [...input.versions],
			}),
		),
	normalizeBaseRoute: (route) => Effect.succeed(normalizeBaseRoute(route)),
});
