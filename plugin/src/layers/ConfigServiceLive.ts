import os from "node:os";
import { Effect, Layer } from "effect";
import { ConfigValidationError } from "../errors.js";
import type { ValidatedPluginConfig } from "../services/ConfigService.js";
import { ConfigService } from "../services/ConfigService.js";
import type { ApiExtractorPluginOptions } from "../types.js";

interface RspressMultiVersion {
	default: string;
	versions: string[];
}

interface RspressConfigSubset {
	multiVersion?: RspressMultiVersion;
}

/**
 * Validate plugin options and return an Effect that fails with ConfigValidationError.
 * This is the Effect-native counterpart to the sync validatePluginOptions function.
 */
function validateOptions(
	options: ApiExtractorPluginOptions,
	rspressConfig: RspressConfigSubset,
): Effect.Effect<void, ConfigValidationError> {
	return Effect.gen(function* () {
		const { api, apis } = options;
		const { multiVersion } = rspressConfig;

		if (api && apis) {
			return yield* new ConfigValidationError({
				field: "api/apis",
				reason:
					"Cannot provide both 'api' and 'apis'. Use 'api' for single-package sites or 'apis' for multi-package portals.",
			});
		}
		if (!api && !apis) {
			return yield* new ConfigValidationError({
				field: "api/apis",
				reason: "Must provide either 'api' or 'apis'.",
			});
		}

		if (apis) {
			if (apis.length === 0) {
				return yield* new ConfigValidationError({
					field: "apis",
					reason: "'apis' must contain at least one API configuration.",
				});
			}
			if (multiVersion) {
				return yield* new ConfigValidationError({
					field: "apis",
					reason:
						"multiVersion is not supported with 'apis' (multi-API mode). Use 'api' (single-API mode) for versioned documentation.",
				});
			}
			return;
		}

		if (api) {
			if (multiVersion) {
				if (!api.versions) {
					return yield* new ConfigValidationError({
						field: "api.versions",
						reason: "'versions' is required when multiVersion is active.",
					});
				}

				const pluginKeys = new Set(Object.keys(api.versions));
				const rspressKeys = new Set(multiVersion.versions);

				if (pluginKeys.size !== rspressKeys.size || ![...pluginKeys].every((k) => rspressKeys.has(k))) {
					return yield* new ConfigValidationError({
						field: "api.versions",
						reason: `api.versions keys [${[...pluginKeys].join(", ")}] must exactly match multiVersion.versions [${[...rspressKeys].join(", ")}].`,
					});
				}
			} else {
				if (api.versions) {
					yield* Effect.logWarning(
						"api.versions is provided but RSPress multiVersion is not configured. Versions will be ignored.",
					);
				}
				if (!api.model) {
					return yield* new ConfigValidationError({
						field: "api.model",
						reason: "'model' is required when multiVersion is not active.",
					});
				}
			}
		}
	});
}

/**
 * Create ConfigServiceLive from plugin options.
 * Validates options and provides the validated config.
 * This layer is not yet wired into ManagedRuntime — that comes when the build
 * program is expanded.
 */
export function ConfigServiceLive(options: ApiExtractorPluginOptions): Layer.Layer<ConfigService> {
	return Layer.succeed(ConfigService, {
		getPluginConfig: Effect.succeed({
			mode: options.apis ? "multi" : "single",
			apis: [],
			logLevel: options.logLevel ?? "info",
			pageConcurrency: options.pageConcurrency ?? os.cpus().length,
		} satisfies ValidatedPluginConfig),
		validateMultiVersion: (rspressVersions: ReadonlyArray<string>, defaultVersion: string) =>
			validateOptions(options, {
				multiVersion: { versions: [...rspressVersions], default: defaultVersion },
			}),
	});
}
