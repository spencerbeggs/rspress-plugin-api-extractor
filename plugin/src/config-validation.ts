import { ConfigValidationError } from "./errors.js";
import type { ApiExtractorPluginOptions } from "./types.js";

interface RspressMultiVersion {
	default: string;
	versions: string[];
}

interface RspressConfigSubset {
	multiVersion?: RspressMultiVersion;
}

export function validatePluginOptions(
	options: ApiExtractorPluginOptions,
	rspressConfig: RspressConfigSubset,
	warn: (msg: string) => void = console.warn,
): void {
	const { api, apis } = options;
	const { multiVersion } = rspressConfig;

	if (api && apis) {
		throw new ConfigValidationError({
			field: "api/apis",
			reason:
				"Cannot provide both 'api' and 'apis'. Use 'api' for single-package sites or 'apis' for multi-package portals.",
		});
	}
	if (!api && !apis) {
		throw new ConfigValidationError({
			field: "api/apis",
			reason: "Must provide either 'api' or 'apis'.",
		});
	}

	if (apis) {
		if (apis.length === 0) {
			throw new ConfigValidationError({
				field: "apis",
				reason: "'apis' must contain at least one API configuration.",
			});
		}
		if (multiVersion) {
			throw new ConfigValidationError({
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
				throw new ConfigValidationError({
					field: "api.versions",
					reason:
						"'versions' is required when multiVersion is active. Each version in multiVersion.versions must have a corresponding entry.",
				});
			}

			const pluginKeys = new Set(Object.keys(api.versions));
			const rspressKeys = new Set(multiVersion.versions);

			if (pluginKeys.size !== rspressKeys.size || ![...pluginKeys].every((k) => rspressKeys.has(k))) {
				throw new ConfigValidationError({
					field: "api.versions",
					reason: `api.versions keys [${[...pluginKeys].join(", ")}] must exactly match multiVersion.versions [${[...rspressKeys].join(", ")}].`,
				});
			}
		} else {
			if (api.versions) {
				warn("api.versions is provided but RSPress multiVersion is not configured. Versions will be ignored.");
			}
			if (!api.model) {
				throw new ConfigValidationError({
					field: "api.model",
					reason: "'model' is required when multiVersion is not active.",
				});
			}
		}
	}
}
