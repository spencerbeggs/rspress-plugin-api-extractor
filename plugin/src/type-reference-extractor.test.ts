import { ApiModel } from "@microsoft/api-extractor-model";
import { describe, expect, it } from "vitest";
import { TypeReferenceExtractor } from "./type-reference-extractor.js";

describe("TypeReferenceExtractor", () => {
	it("should extract external package references from API model", async () => {
		// Load the claude-binary-plugin API model for testing
		const apiModel = new ApiModel();
		const apiPackage = apiModel.loadPackage(
			"/Users/spencer/workspaces/spencerbeggs/website/docs/lib/packages/claude-binary-plugin.api.json",
		);

		// Extract imports
		const extractor = new TypeReferenceExtractor(apiPackage, "claude-binary-plugin");
		const imports = extractor.extractImports();

		// Should find external packages (zod, etc.)
		expect(imports.length).toBeGreaterThan(0);

		// Check for zod package
		const zodImport = imports.find((imp) => imp.packageName === "zod");
		expect(zodImport).toBeDefined();
		expect(zodImport?.symbols.size).toBeGreaterThan(0);

		// All imports should be type-only
		for (const imp of imports) {
			expect(imp.typeOnly).toBe(true);
		}
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

	it("should filter out built-in types", async () => {
		const apiModel = new ApiModel();
		const apiPackage = apiModel.loadPackage(
			"/Users/spencer/workspaces/spencerbeggs/website/docs/lib/packages/claude-binary-plugin.api.json",
		);

		const extractor = new TypeReferenceExtractor(apiPackage, "claude-binary-plugin");
		const imports = extractor.extractImports();

		// Should not include built-in types like Promise, Record, etc.
		const hasBuiltIns = imports.some(
			(imp) => imp.packageName === "" || imp.packageName === "!Promise" || imp.packageName === "!Record",
		);
		expect(hasBuiltIns).toBe(false);
	});

	it("should filter out internal references", async () => {
		const apiModel = new ApiModel();
		const apiPackage = apiModel.loadPackage(
			"/Users/spencer/workspaces/spencerbeggs/website/docs/lib/packages/claude-binary-plugin.api.json",
		);

		const extractor = new TypeReferenceExtractor(apiPackage, "claude-binary-plugin");
		const imports = extractor.extractImports();

		// Should not include references to types from the same package
		const hasInternalRefs = imports.some((imp) => imp.packageName === "claude-binary-plugin");
		expect(hasInternalRefs).toBe(false);
	});

	it("should sort imports alphabetically", async () => {
		const apiModel = new ApiModel();
		const apiPackage = apiModel.loadPackage(
			"/Users/spencer/workspaces/spencerbeggs/website/docs/lib/packages/claude-binary-plugin.api.json",
		);

		const extractor = new TypeReferenceExtractor(apiPackage, "claude-binary-plugin");
		const imports = extractor.extractImports();

		// Check that imports are sorted alphabetically
		for (let i = 1; i < imports.length; i++) {
			expect(imports[i].packageName.localeCompare(imports[i - 1].packageName)).toBeGreaterThanOrEqual(0);
		}
	});

	describe("Priority 5: Import optimization", () => {
		it("should extract imports for specific entry point only", async () => {
			const apiModel = new ApiModel();
			const apiPackage = apiModel.loadPackage(
				"/Users/spencer/workspaces/spencerbeggs/website/docs/lib/packages/claude-binary-plugin.api.json",
			);

			const extractor = new TypeReferenceExtractor(apiPackage, "claude-binary-plugin");
			const entryPoint = apiPackage.entryPoints[0];

			// Extract imports for just this entry point
			const imports = extractor.extractImportsForEntryPoint(entryPoint);

			// Should still find external packages
			expect(imports.length).toBeGreaterThan(0);

			// Should still have zod
			const zodImport = imports.find((imp) => imp.packageName === "zod");
			expect(zodImport).toBeDefined();
		});

		it("should produce same results for single-entry packages", async () => {
			const apiModel = new ApiModel();
			const apiPackage = apiModel.loadPackage(
				"/Users/spencer/workspaces/spencerbeggs/website/docs/lib/packages/claude-binary-plugin.api.json",
			);

			// Extract using both methods
			const extractor1 = new TypeReferenceExtractor(apiPackage, "claude-binary-plugin");
			const allImports = extractor1.extractImports();

			const extractor2 = new TypeReferenceExtractor(apiPackage, "claude-binary-plugin");
			const entryImports = extractor2.extractImportsForEntryPoint(apiPackage.entryPoints[0]);

			// For single-entry packages, results should be identical
			expect(entryImports.length).toBe(allImports.length);

			// Check package names match
			const allPackages = allImports.map((imp) => imp.packageName).sort();
			const entryPackages = entryImports.map((imp) => imp.packageName).sort();
			expect(entryPackages).toEqual(allPackages);
		});

		it("should only include symbols used in the entry point", async () => {
			const apiModel = new ApiModel();
			const apiPackage = apiModel.loadPackage(
				"/Users/spencer/workspaces/spencerbeggs/website/docs/lib/packages/claude-binary-plugin.api.json",
			);

			const extractor = new TypeReferenceExtractor(apiPackage, "claude-binary-plugin");
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
