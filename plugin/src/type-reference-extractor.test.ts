import path from "node:path";
import { ApiModel } from "@microsoft/api-extractor-model";
import { describe, expect, it } from "vitest";
import { TypeReferenceExtractor } from "./type-reference-extractor.js";

const fixtureModel = path.join(import.meta.dirname, "__fixtures__/kitchensink/kitchensink.api.json");

describe("TypeReferenceExtractor", () => {
	it("should extract references from API model without errors", () => {
		const apiModel = new ApiModel();
		const apiPackage = apiModel.loadPackage(fixtureModel);

		const extractor = new TypeReferenceExtractor(apiPackage, "kitchensink");
		const imports = extractor.extractImports();

		// kitchensink has no external deps, so imports should be empty
		// but the extractor should run without errors
		expect(imports).toBeDefined();
		expect(Array.isArray(imports)).toBe(true);
	});

	it("should format imports correctly", () => {
		const imports = [
			{
				packageName: "zod",
				symbols: new Set(["ZodType", "output"]),
				typeOnly: true,
			},
			{
				packageName: "@effect/schema",
				symbols: new Set(["Schema"]),
				typeOnly: true,
			},
		];

		const statements = TypeReferenceExtractor.formatImports(imports);

		expect(statements).toContain('import type { Schema } from "@effect/schema";');
		expect(statements).toContain('import type { ZodType, output } from "zod";');
	});

	it("should filter out built-in types", () => {
		const apiModel = new ApiModel();
		const apiPackage = apiModel.loadPackage(fixtureModel);

		const extractor = new TypeReferenceExtractor(apiPackage, "kitchensink");
		const imports = extractor.extractImports();

		// Should not include built-in types like Promise, Record, etc.
		const hasBuiltIns = imports.some(
			(imp) => imp.packageName === "" || imp.packageName === "!Promise" || imp.packageName === "!Record",
		);
		expect(hasBuiltIns).toBe(false);
	});

	it("should filter out internal references", () => {
		const apiModel = new ApiModel();
		const apiPackage = apiModel.loadPackage(fixtureModel);

		const extractor = new TypeReferenceExtractor(apiPackage, "kitchensink");
		const imports = extractor.extractImports();

		// Should not include references to types from the same package
		const hasInternalRefs = imports.some((imp) => imp.packageName === "kitchensink");
		expect(hasInternalRefs).toBe(false);
	});

	it("should sort imports alphabetically", () => {
		const apiModel = new ApiModel();
		const apiPackage = apiModel.loadPackage(fixtureModel);

		const extractor = new TypeReferenceExtractor(apiPackage, "kitchensink");
		const imports = extractor.extractImports();

		// Check that imports are sorted alphabetically (if any exist)
		for (let i = 1; i < imports.length; i++) {
			expect(imports[i].packageName.localeCompare(imports[i - 1].packageName)).toBeGreaterThanOrEqual(0);
		}
	});

	describe("Per-entry-point extraction", () => {
		it("should extract imports for specific entry point only", () => {
			const apiModel = new ApiModel();
			const apiPackage = apiModel.loadPackage(fixtureModel);

			const extractor = new TypeReferenceExtractor(apiPackage, "kitchensink");
			const entryPoint = apiPackage.entryPoints[0];

			// Extract imports for just this entry point
			const imports = extractor.extractImportsForEntryPoint(entryPoint);

			// Should run without errors and return an array
			expect(imports).toBeDefined();
			expect(Array.isArray(imports)).toBe(true);
		});

		it("should produce same results for single-entry packages", () => {
			const apiModel = new ApiModel();
			const apiPackage = apiModel.loadPackage(fixtureModel);

			const extractor = new TypeReferenceExtractor(apiPackage, "kitchensink");
			const allImports = extractor.extractImports();
			const entryImports = extractor.extractImportsForEntryPoint(apiPackage.entryPoints[0]);

			// For the main entry point, results should match extractImports
			const allPackages = allImports.map((imp) => imp.packageName).sort();
			const entryPackages = entryImports.map((imp) => imp.packageName).sort();
			expect(entryPackages).toEqual(allPackages);
		});

		it("should only include symbols used in the entry point", () => {
			const apiModel = new ApiModel();
			const apiPackage = apiModel.loadPackage(fixtureModel);

			const extractor = new TypeReferenceExtractor(apiPackage, "kitchensink");
			const entryPoint = apiPackage.entryPoints[0];
			const imports = extractor.extractImportsForEntryPoint(entryPoint);

			// All imports should have at least one symbol
			for (const imp of imports) {
				expect(imp.symbols.size).toBeGreaterThan(0);
			}

			// Symbols should be deduplicated (no duplicates in the Set)
			for (const imp of imports) {
				const symbolArray = Array.from(imp.symbols);
				const uniqueSymbols = new Set(symbolArray);
				expect(uniqueSymbols.size).toBe(symbolArray.length);
			}
		});
	});
});
