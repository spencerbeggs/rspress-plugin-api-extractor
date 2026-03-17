import { ApiItemKind } from "@microsoft/api-extractor-model";
import { describe, expect, it } from "vitest";
import { CategoryResolver } from "./category-resolver.js";
import type { CategoryConfig, SourceConfig } from "./schemas/index.js";

describe("CategoryResolver", () => {
	const resolver = new CategoryResolver();

	describe("mergeCategories", () => {
		it("should merge two category configs", () => {
			const base: Record<string, CategoryConfig> = {
				classes: {
					displayName: "Classes",
					singularName: "Class",
					folderName: "classes",
					itemKinds: [ApiItemKind.Class],
				},
			};

			const override: Record<string, CategoryConfig> = {
				interfaces: {
					displayName: "Interfaces",
					singularName: "Interface",
					folderName: "interfaces",
					itemKinds: [ApiItemKind.Interface],
				},
			};

			const result = resolver.mergeCategories(base, override);

			expect(result).toEqual({
				classes: {
					displayName: "Classes",
					singularName: "Class",
					folderName: "classes",
					itemKinds: [ApiItemKind.Class],
				},
				interfaces: {
					displayName: "Interfaces",
					singularName: "Interface",
					folderName: "interfaces",
					itemKinds: [ApiItemKind.Interface],
				},
			});
		});

		it("should override existing categories", () => {
			const base: Record<string, CategoryConfig> = {
				classes: {
					displayName: "Classes",
					singularName: "Class",
					folderName: "classes",
					itemKinds: [ApiItemKind.Class],
				},
			};

			const override: Record<string, CategoryConfig> = {
				classes: {
					displayName: "Custom Classes",
					singularName: "Custom Class",
					folderName: "custom-classes",
					itemKinds: [ApiItemKind.Class, ApiItemKind.TypeAlias],
				},
			};

			const result = resolver.mergeCategories(base, override);

			expect(result).toEqual({
				classes: {
					displayName: "Custom Classes",
					singularName: "Custom Class",
					folderName: "custom-classes",
					itemKinds: [ApiItemKind.Class, ApiItemKind.TypeAlias],
				},
			});
		});

		it("should merge multiple configs in order", () => {
			const config1: Record<string, CategoryConfig> = {
				classes: {
					displayName: "Classes",
					singularName: "Class",
					folderName: "classes",
					itemKinds: [ApiItemKind.Class],
				},
			};

			const config2: Record<string, CategoryConfig> = {
				interfaces: {
					displayName: "Interfaces",
					singularName: "Interface",
					folderName: "interfaces",
					itemKinds: [ApiItemKind.Interface],
				},
			};

			const config3: Record<string, CategoryConfig> = {
				classes: {
					displayName: "Override Classes",
					singularName: "Override Class",
					folderName: "override-classes",
					itemKinds: [ApiItemKind.Class],
				},
			};

			const result = resolver.mergeCategories(config1, config2, config3);

			expect(result).toEqual({
				classes: {
					displayName: "Override Classes",
					singularName: "Override Class",
					folderName: "override-classes",
					itemKinds: [ApiItemKind.Class],
				},
				interfaces: {
					displayName: "Interfaces",
					singularName: "Interface",
					folderName: "interfaces",
					itemKinds: [ApiItemKind.Interface],
				},
			});
		});

		it("should handle undefined configs", () => {
			const config1: Record<string, CategoryConfig> = {
				classes: {
					displayName: "Classes",
					singularName: "Class",
					folderName: "classes",
				},
			};

			const result = resolver.mergeCategories(config1, undefined, undefined);

			expect(result).toEqual(config1);
		});

		it("should handle all undefined configs", () => {
			const result = resolver.mergeCategories(undefined, undefined, undefined);

			expect(result).toEqual({});
		});

		it("should handle empty config objects", () => {
			const result = resolver.mergeCategories({}, {}, {});

			expect(result).toEqual({});
		});

		it("should preserve itemKinds when not overridden", () => {
			const base: Record<string, CategoryConfig> = {
				classes: {
					displayName: "Classes",
					singularName: "Class",
					folderName: "classes",
					itemKinds: [ApiItemKind.Class],
				},
			};

			const override: Record<string, CategoryConfig> = {
				classes: {
					displayName: "Custom Classes",
					singularName: "Custom Class",
					folderName: "custom-classes",
					// Note: itemKinds is undefined, not an empty array
				},
			};

			const result = resolver.mergeCategories(base, override);

			// itemKinds should be preserved from base
			expect(result.classes.itemKinds).toEqual([ApiItemKind.Class]);
		});

		it("should override itemKinds when explicitly provided", () => {
			const base: Record<string, CategoryConfig> = {
				classes: {
					displayName: "Classes",
					singularName: "Class",
					folderName: "classes",
					itemKinds: [ApiItemKind.Class],
				},
			};

			const override: Record<string, CategoryConfig> = {
				classes: {
					displayName: "Classes",
					singularName: "Class",
					folderName: "classes",
					itemKinds: [ApiItemKind.Class, ApiItemKind.TypeAlias],
				},
			};

			const result = resolver.mergeCategories(base, override);

			expect(result.classes.itemKinds).toEqual([ApiItemKind.Class, ApiItemKind.TypeAlias]);
		});
	});

	describe("resolveCategoryConfig", () => {
		it("should use plugin defaults when no overrides provided", () => {
			const pluginDefaults: Record<string, CategoryConfig> = {
				classes: {
					displayName: "Classes",
					singularName: "Class",
					folderName: "classes",
					itemKinds: [ApiItemKind.Class],
				},
			};

			const result = resolver.resolveCategoryConfig(pluginDefaults);

			expect(result).toEqual(pluginDefaults);
		});

		it("should merge package categories with plugin defaults", () => {
			const pluginDefaults: Record<string, CategoryConfig> = {
				classes: {
					displayName: "Classes",
					singularName: "Class",
					folderName: "classes",
					itemKinds: [ApiItemKind.Class],
				},
			};

			const packageCategories: Record<string, CategoryConfig> = {
				errors: {
					displayName: "Errors",
					singularName: "Error",
					folderName: "errors",
					itemKinds: [ApiItemKind.Class],
				},
			};

			const result = resolver.resolveCategoryConfig(pluginDefaults, packageCategories);

			expect(result).toEqual({
				classes: {
					displayName: "Classes",
					singularName: "Class",
					folderName: "classes",
					itemKinds: [ApiItemKind.Class],
				},
				errors: {
					displayName: "Errors",
					singularName: "Error",
					folderName: "errors",
					itemKinds: [ApiItemKind.Class],
				},
			});
		});

		it("should apply version categories with highest precedence", () => {
			const pluginDefaults: Record<string, CategoryConfig> = {
				classes: {
					displayName: "Classes",
					singularName: "Class",
					folderName: "classes",
					itemKinds: [ApiItemKind.Class],
				},
			};

			const packageCategories: Record<string, CategoryConfig> = {
				classes: {
					displayName: "Package Classes",
					singularName: "Package Class",
					folderName: "pkg-classes",
					itemKinds: [ApiItemKind.Class],
				},
			};

			const versionCategories: Record<string, CategoryConfig> = {
				classes: {
					displayName: "Version Classes",
					singularName: "Version Class",
					folderName: "ver-classes",
					itemKinds: [ApiItemKind.Class, ApiItemKind.TypeAlias],
				},
			};

			const result = resolver.resolveCategoryConfig(pluginDefaults, packageCategories, versionCategories);

			// Version categories should take precedence
			expect(result).toEqual({
				classes: {
					displayName: "Version Classes",
					singularName: "Version Class",
					folderName: "ver-classes",
					itemKinds: [ApiItemKind.Class, ApiItemKind.TypeAlias],
				},
			});
		});

		it("should handle undefined package and version categories", () => {
			const pluginDefaults: Record<string, CategoryConfig> = {
				classes: {
					displayName: "Classes",
					singularName: "Class",
					folderName: "classes",
				},
			};

			const result = resolver.resolveCategoryConfig(pluginDefaults, undefined, undefined);

			expect(result).toEqual(pluginDefaults);
		});
	});

	describe("resolveSourceConfig", () => {
		it("should return undefined when no source configs provided", () => {
			const result = resolver.resolveSourceConfig(undefined, undefined);

			expect(result).toBeUndefined();
		});

		it("should use package source when no version source", () => {
			const packageSource: SourceConfig = {
				url: "https://github.com/owner/repo",
				ref: "blob/main",
			};

			const result = resolver.resolveSourceConfig(packageSource, undefined);

			expect(result).toEqual(packageSource);
		});

		it("should use version source when provided (highest precedence)", () => {
			const packageSource: SourceConfig = {
				url: "https://github.com/owner/repo",
				ref: "blob/main",
			};

			const versionSource: SourceConfig = {
				url: "https://github.com/owner/repo",
				ref: "blob/v1.0.0",
			};

			const result = resolver.resolveSourceConfig(packageSource, versionSource);

			// Version source should take precedence
			expect(result).toEqual(versionSource);
		});

		it("should use version source even when package source is undefined", () => {
			const versionSource: SourceConfig = {
				url: "https://github.com/owner/repo",
				ref: "blob/v2.0.0",
			};

			const result = resolver.resolveSourceConfig(undefined, versionSource);

			expect(result).toEqual(versionSource);
		});

		it("should handle different URL and ref combinations", () => {
			const packageSource: SourceConfig = {
				url: "https://github.com/owner/package",
				ref: "blob/main",
			};

			const versionSource: SourceConfig = {
				url: "https://github.com/different/repo",
				ref: "tree/v1.2.3",
			};

			const result = resolver.resolveSourceConfig(packageSource, versionSource);

			expect(result).toEqual({
				url: "https://github.com/different/repo",
				ref: "tree/v1.2.3",
			});
		});

		it("should handle source config without ref", () => {
			const packageSource: SourceConfig = {
				url: "https://github.com/owner/repo",
			};

			const result = resolver.resolveSourceConfig(packageSource, undefined);

			expect(result).toEqual({
				url: "https://github.com/owner/repo",
			});
		});
	});
});
