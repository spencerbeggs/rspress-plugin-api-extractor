import { VitestConfig } from "@savvy-web/vitest";

export default VitestConfig.create(({ projects, coverage, reporters }) => ({
	test: {
		reporters,
		projects: projects.map((p) => p.toConfig()),
		coverage: {
			provider: "v8",
			...coverage,
			thresholds: {
				...coverage.thresholds,
				// Branch coverage is lower due to complex conditional logic in
				// ConfigServiceLive (versioned/multi-API modes), build-stages
				// (snapshot fallback paths), and page generators (member type dispatch).
				// These branches are tested via integration tests in build-stages.test.ts
				// and config-service.test.ts, but not every path is hit individually.
				branches: 70,
			},
			exclude: [
				...(coverage.exclude ?? []),
				// Re-export barrels with no testable logic
				"**/index.ts",
				// Type-only definitions (no runtime code)
				"**/internal-types.ts",
				// Service interfaces (Context.Tag only)
				"**/services/ConfigService.ts",
				"**/services/CrossLinkerService.ts",
				"**/services/PageGeneratorService.ts",
				"**/services/PathDerivationService.ts",
				"**/services/ShikiService.ts",
				"**/services/SnapshotService.ts",
				"**/services/TypeRegistryService.ts",
				// RSPress integration (requires RSPress runtime)
				"**/plugin.ts",
				"**/remark-api-codeblocks.ts",
				"**/remark-with-api.ts",
				// React runtime (requires React/browser test environment)
				"**/runtime/**",
				// Integration-only files requiring full Shiki/RSPress/network setup
				"**/layers/TypeRegistryServiceLive.ts",
				"**/shiki-transformer.ts",
				"**/markdown/shiki-utils.ts",
				// Test fixtures and debug utilities
				"**/__fixtures__/**",
				"**/api-extracted-package.dump.ts",
			],
		},
	},
}));
