import type { ApiClass, ApiInterface, ApiItem } from "@microsoft/api-extractor-model";
import { ApiItemKind } from "@microsoft/api-extractor-model";
import { describe, expect, it } from "vitest";
import { ApiParser } from "./loader.js";
import type { SourceConfig } from "./schemas/index.js";

/**
 * Tests for ApiParser static class
 *
 * Note: Many methods in ApiParser rely on instanceof checks with API Extractor classes,
 * which are difficult to mock properly. These tests focus on methods that can be tested
 * without complex mocking.
 *
 * Tested methods (14 tests):
 * - getSourceLink (7 tests) - Constructs GitHub source links
 * - getInheritance (6 tests) - Extracts class/interface inheritance
 * - getReleaseTag (1 test) - Gets release tag with default fallback
 *
 * Untested methods (require complex instanceof mocking):
 * - hasModifierTag - Requires ApiDocumentedItem instanceof check
 * - categorizeApiItems - Requires ApiDocumentedItem for modifier tags
 * - getSummary - Requires ApiDocumentedItem instanceof check
 * - getParams - Requires ApiDocumentedItem instanceof check
 * - getReturns - Requires ApiDocumentedItem instanceof check
 * - getExamples - Requires ApiDocumentedItem instanceof check
 * - getDeprecation - Requires ApiDocumentedItem instanceof check
 * - getSeeReferences - Requires ApiDocumentedItem instanceof check
 */

describe("ApiParser", () => {
	describe("getSourceLink", () => {
		it("should construct source link with file path and line number", () => {
			const mockItem = {
				fileUrlPath: "src/index.ts",
				fileLineNumber: 42,
			} as unknown as ApiItem;

			const sourceConfig: SourceConfig = {
				url: "https://github.com/owner/repo",
				ref: "blob/main",
			};

			const result = ApiParser.getSourceLink(mockItem, sourceConfig);

			expect(result).toBe("https://github.com/owner/repo/blob/main/src/index.ts#L42");
		});

		it("should construct source link without line number", () => {
			const mockItem = {
				fileUrlPath: "src/utils.ts",
			} as unknown as ApiItem;

			const sourceConfig: SourceConfig = {
				url: "https://github.com/owner/repo",
				ref: "blob/main",
			};

			const result = ApiParser.getSourceLink(mockItem, sourceConfig);

			expect(result).toBe("https://github.com/owner/repo/blob/main/src/utils.ts");
		});

		it("should default to blob/main when ref not specified", () => {
			const mockItem = {
				fileUrlPath: "src/types.ts",
			} as unknown as ApiItem;

			const sourceConfig: SourceConfig = {
				url: "https://github.com/owner/repo",
			};

			const result = ApiParser.getSourceLink(mockItem, sourceConfig);

			expect(result).toBe("https://github.com/owner/repo/blob/main/src/types.ts");
		});

		it("should handle custom ref like tags", () => {
			const mockItem = {
				fileUrlPath: "src/api.ts",
				fileLineNumber: 10,
			} as unknown as ApiItem;

			const sourceConfig: SourceConfig = {
				url: "https://github.com/owner/repo",
				ref: "blob/v1.0.0",
			};

			const result = ApiParser.getSourceLink(mockItem, sourceConfig);

			expect(result).toBe("https://github.com/owner/repo/blob/v1.0.0/src/api.ts#L10");
		});

		it("should return null when no source config", () => {
			const mockItem = {
				fileUrlPath: "src/index.ts",
			} as unknown as ApiItem;

			expect(ApiParser.getSourceLink(mockItem, undefined)).toBeNull();
		});

		it("should return null when no file path", () => {
			const mockItem = {} as unknown as ApiItem;

			const sourceConfig: SourceConfig = {
				url: "https://github.com/owner/repo",
			};

			expect(ApiParser.getSourceLink(mockItem, sourceConfig)).toBeNull();
		});

		it("should fallback to filePath property when fileUrlPath not available", () => {
			const mockItem = {
				filePath: "src/fallback.ts",
				line: 25,
			} as unknown as ApiItem;

			const sourceConfig: SourceConfig = {
				url: "https://github.com/owner/repo",
				ref: "blob/develop",
			};

			const result = ApiParser.getSourceLink(mockItem, sourceConfig);

			expect(result).toBe("https://github.com/owner/repo/blob/develop/src/fallback.ts#L25");
		});
	});

	describe("getInheritance", () => {
		it("should extract extends type from a class", () => {
			const mockClass = {
				kind: ApiItemKind.Class,
				extendsType: {
					excerpt: { text: "BaseClass" },
				},
			} as unknown as ApiClass;

			const result = ApiParser.getInheritance(mockClass);

			expect(result.extends).toEqual(["BaseClass"]);
			expect(result.implements).toBeUndefined();
		});

		it("should extract implements types from a class", () => {
			const mockClass = {
				kind: ApiItemKind.Class,
				implementsTypes: [{ excerpt: { text: "IFoo" } }, { excerpt: { text: "IBar" } }],
			} as unknown as ApiClass;

			const result = ApiParser.getInheritance(mockClass);

			expect(result.extends).toBeUndefined();
			expect(result.implements).toEqual(["IFoo", "IBar"]);
		});

		it("should extract both extends and implements from a class", () => {
			const mockClass = {
				kind: ApiItemKind.Class,
				extendsType: {
					excerpt: { text: "BaseClass" },
				},
				implementsTypes: [{ excerpt: { text: "IFoo" } }],
			} as unknown as ApiClass;

			const result = ApiParser.getInheritance(mockClass);

			expect(result.extends).toEqual(["BaseClass"]);
			expect(result.implements).toEqual(["IFoo"]);
		});

		it("should extract extends types from an interface", () => {
			const mockInterface = {
				kind: ApiItemKind.Interface,
				extendsTypes: [{ excerpt: { text: "IBase" } }, { excerpt: { text: "IOther" } }],
			} as unknown as ApiInterface;

			const result = ApiParser.getInheritance(mockInterface);

			expect(result.extends).toEqual(["IBase", "IOther"]);
			expect(result.implements).toBeUndefined();
		});

		it("should return empty object for class with no inheritance", () => {
			const mockClass = {
				kind: ApiItemKind.Class,
			} as unknown as ApiClass;

			const result = ApiParser.getInheritance(mockClass);

			expect(result).toEqual({});
		});

		it("should return empty object for interface with no inheritance", () => {
			const mockInterface = {
				kind: ApiItemKind.Interface,
			} as unknown as ApiInterface;

			const result = ApiParser.getInheritance(mockInterface);

			expect(result).toEqual({});
		});
	});

	describe("getReleaseTag", () => {
		it("should return Public as default when item doesn't have release tag", () => {
			const mockItem = {} as unknown as ApiItem;

			const result = ApiParser.getReleaseTag(mockItem);

			expect(result).toBe("Public");
		});
	});
});
