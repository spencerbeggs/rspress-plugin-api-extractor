import { VitestConfig } from "@savvy-web/vitest";

export default VitestConfig.create(
	{
		coverage: VitestConfig.COVERAGE_LEVELS.none,
		coverageTargets: VitestConfig.COVERAGE_LEVELS.strict,
	},
	(config) => ({
		...config,
		test: {
			...config.test,
			server: {
				...config.test?.server,
				// Inline api-extractor-llms so vi.mock("node:fs") propagates
				// into the library's named imports (needed for model-loader tests).
				deps: { inline: ["api-extractor-llms"] },
			},
		},
	}),
);
