/**
 * Tests for config-utils module - focusing on dependency extraction and version conflict resolution
 */

import { describe, expect, it } from "vitest";
import {
	extractAutoDetectedPackages,
	extractPeerDependencies,
	extractTypeUtilities,
	resolvePackageVersionConflicts,
} from "../src/config-utils.js";
import type { PackageJson } from "../src/internal-types.js";
import type { ExternalPackageSpec } from "../src/schemas/index.js";

describe("extractPeerDependencies", () => {
	it("should extract peerDependencies from package.json", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			peerDependencies: {
				zod: "^3.22.4",
				"@effect/schema": "^0.68.0",
			},
		};

		const result = extractPeerDependencies(packageJson);

		expect(result).toEqual([
			{ name: "zod", version: "^3.22.4" },
			{ name: "@effect/schema", version: "^0.68.0" },
		]);
	});

	it("should return empty array when no peerDependencies", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
		};

		const result = extractPeerDependencies(packageJson);

		expect(result).toEqual([]);
	});

	it("should return empty array when packageJson is undefined", () => {
		const result = extractPeerDependencies(undefined);

		expect(result).toEqual([]);
	});
});

describe("extractTypeUtilities", () => {
	it("should extract type-fest from devDependencies", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			devDependencies: {
				"type-fest": "^4.0.0",
				vitest: "^1.0.0",
			},
		};

		const result = extractTypeUtilities(packageJson);

		expect(result).toEqual([{ name: "type-fest", version: "^4.0.0" }]);
	});

	it("should extract ts-extras from devDependencies", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			devDependencies: {
				"ts-extras": "^0.12.0",
				vitest: "^1.0.0",
			},
		};

		const result = extractTypeUtilities(packageJson);

		expect(result).toEqual([{ name: "ts-extras", version: "^0.12.0" }]);
	});

	it("should extract both type utilities from devDependencies", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			devDependencies: {
				"type-fest": "^4.0.0",
				"ts-extras": "^0.12.0",
				vitest: "^1.0.0",
			},
		};

		const result = extractTypeUtilities(packageJson);

		expect(result).toEqual([
			{ name: "type-fest", version: "^4.0.0" },
			{ name: "ts-extras", version: "^0.12.0" },
		]);
	});

	it("should return empty array when no type utilities in devDependencies", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			devDependencies: {
				vitest: "^1.0.0",
			},
		};

		const result = extractTypeUtilities(packageJson);

		expect(result).toEqual([]);
	});

	it("should return empty array when no devDependencies", () => {
		const packageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
		};

		const result = extractTypeUtilities(packageJson);

		expect(result).toEqual([]);
	});
});

describe("extractAutoDetectedPackages", () => {
	const packageJson: PackageJson = {
		name: "test-package",
		version: "1.0.0",
		dependencies: {
			effect: "^3.0.0",
		},
		devDependencies: {
			"type-fest": "^4.0.0",
			vitest: "^1.0.0",
		},
		peerDependencies: {
			zod: "^3.22.4",
		},
	};

	it("should extract only peerDependencies and type utilities by default", () => {
		const result = extractAutoDetectedPackages(packageJson);

		expect(result).toEqual([
			{ name: "zod", version: "^3.22.4" },
			{ name: "type-fest", version: "^4.0.0" },
		]);
	});

	it("should include dependencies when option is true", () => {
		const result = extractAutoDetectedPackages(packageJson, { dependencies: true });

		expect(result).toContainEqual({ name: "effect", version: "^3.0.0" });
	});

	it("should include devDependencies when option is true", () => {
		const result = extractAutoDetectedPackages(packageJson, { devDependencies: true });

		expect(result).toContainEqual({ name: "vitest", version: "^1.0.0" });
	});

	it("should exclude peerDependencies when option is false", () => {
		const result = extractAutoDetectedPackages(packageJson, { peerDependencies: false });

		expect(result).not.toContainEqual({ name: "zod", version: "^3.22.4" });
	});

	it("should exclude autoDependencies when option is false", () => {
		const result = extractAutoDetectedPackages(packageJson, { autoDependencies: false });

		expect(result).not.toContainEqual({ name: "type-fest", version: "^4.0.0" });
	});

	it("should include all dependencies when all options are true", () => {
		const result = extractAutoDetectedPackages(packageJson, {
			dependencies: true,
			devDependencies: true,
			peerDependencies: true,
			autoDependencies: true,
		});

		expect(result).toContainEqual({ name: "effect", version: "^3.0.0" });
		expect(result).toContainEqual({ name: "vitest", version: "^1.0.0" });
		expect(result).toContainEqual({ name: "zod", version: "^3.22.4" });
		expect(result).toContainEqual({ name: "type-fest", version: "^4.0.0" });
	});

	it("should not include type utilities in devDependencies when autoDependencies is true", () => {
		const result = extractAutoDetectedPackages(packageJson, {
			devDependencies: true,
			autoDependencies: true,
		});

		// type-fest should appear only once (from autoDependencies, not from devDependencies)
		const typeFestCount = result.filter((p) => p.name === "type-fest").length;
		expect(typeFestCount).toBe(1);
	});

	it("should return empty array when all options are false", () => {
		const result = extractAutoDetectedPackages(packageJson, {
			dependencies: false,
			devDependencies: false,
			peerDependencies: false,
			autoDependencies: false,
		});

		expect(result).toEqual([]);
	});
});

describe("resolvePackageVersionConflicts", () => {
	it("should deduplicate packages with same name", () => {
		const packages: ExternalPackageSpec[] = [
			{ name: "zod", version: "^3.22.4" },
			{ name: "zod", version: "^3.23.0" },
			{ name: "effect", version: "^3.0.0" },
		];

		const result = resolvePackageVersionConflicts(packages);

		expect(result).toHaveLength(2);
		expect(result).toContainEqual({ name: "effect", version: "^3.0.0" });
		// Should pick the highest version
		const zodPackage = result.find((p) => p.name === "zod");
		expect(zodPackage).toBeDefined();
	});

	it("should pick the highest version when conflicts exist", () => {
		const packages: ExternalPackageSpec[] = [
			{ name: "zod", version: "^3.22.4" },
			{ name: "zod", version: "^3.23.0" },
			{ name: "zod", version: "^3.21.0" },
		];

		const result = resolvePackageVersionConflicts(packages);

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ name: "zod", version: "^3.23.0" });
	});

	it("should handle exact versions", () => {
		const packages: ExternalPackageSpec[] = [
			{ name: "zod", version: "3.22.4" },
			{ name: "zod", version: "3.23.0" },
			{ name: "zod", version: "3.21.0" },
		];

		const result = resolvePackageVersionConflicts(packages);

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ name: "zod", version: "3.23.0" });
	});

	it("should handle mixed exact and ranged versions", () => {
		const packages: ExternalPackageSpec[] = [
			{ name: "zod", version: "^3.22.4" },
			{ name: "zod", version: "3.23.0" },
		];

		const result = resolvePackageVersionConflicts(packages);

		expect(result).toHaveLength(1);
		// Should pick 3.23.0 as it's higher
		expect(result[0]).toEqual({ name: "zod", version: "3.23.0" });
	});

	it("should handle tilde ranges", () => {
		const packages: ExternalPackageSpec[] = [
			{ name: "zod", version: "~3.22.4" },
			{ name: "zod", version: "~3.23.0" },
		];

		const result = resolvePackageVersionConflicts(packages);

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ name: "zod", version: "~3.23.0" });
	});

	it("should handle packages with no conflicts", () => {
		const packages: ExternalPackageSpec[] = [
			{ name: "zod", version: "^3.22.4" },
			{ name: "effect", version: "^3.0.0" },
			{ name: "type-fest", version: "^4.0.0" },
		];

		const result = resolvePackageVersionConflicts(packages);

		expect(result).toHaveLength(3);
		expect(result).toEqual(packages);
	});

	it("should handle multiple packages with conflicts", () => {
		const packages: ExternalPackageSpec[] = [
			{ name: "zod", version: "^3.22.4" },
			{ name: "zod", version: "^3.23.0" },
			{ name: "effect", version: "^3.0.0" },
			{ name: "effect", version: "^3.1.0" },
		];

		const result = resolvePackageVersionConflicts(packages);

		expect(result).toHaveLength(2);
		expect(result).toContainEqual({ name: "zod", version: "^3.23.0" });
		expect(result).toContainEqual({ name: "effect", version: "^3.1.0" });
	});

	it("should handle empty array", () => {
		const packages: ExternalPackageSpec[] = [];

		const result = resolvePackageVersionConflicts(packages);

		expect(result).toEqual([]);
	});

	it("should preserve original version format when resolving", () => {
		const packages: ExternalPackageSpec[] = [
			{ name: "zod", version: "^3.22.4" },
			{ name: "zod", version: "^3.23.0" },
		];

		const result = resolvePackageVersionConflicts(packages);

		// Should preserve the caret (^) in the version
		expect(result[0].version).toMatch(/^\^/);
	});
});
