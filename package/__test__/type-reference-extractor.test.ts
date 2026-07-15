import path from "node:path";
import type { ApiItem, ApiPackage } from "@microsoft/api-extractor-model";
import { ApiItemKind, ApiModel } from "@microsoft/api-extractor-model";
import { describe, expect, it } from "vitest";
import type { ImportStatement } from "../src/type-reference-extractor.js";
import { TypeReferenceExtractor } from "../src/type-reference-extractor.js";

const fixtureModel = path.join(import.meta.dirname, "../src/__fixtures__/kitchensink/kitchensink.api.json");

/**
 * Build a mock excerpt Reference token. Pass `canonicalRef: null` to simulate
 * a token whose `canonicalReference` is missing.
 */
function makeRefToken(canonicalRef: string | null, text: string): unknown {
	return {
		kind: "Reference",
		text,
		canonicalReference: canonicalRef === null ? undefined : { toString: () => canonicalRef },
	};
}

/** Build a mock non-Reference token (e.g. plain content). */
function makeContentToken(text: string): unknown {
	return { kind: "Content", text };
}

/** Build a mock excerpt wrapping the given spanned tokens. */
function makeExcerpt(tokens: unknown[]): unknown {
	return { spannedTokens: tokens };
}

/** Cast a plain object into an ApiItem for driving the extractor. */
function makeItem(props: Record<string, unknown>): ApiItem {
	return props as unknown as ApiItem;
}

/** Construct an extractor with no real package (only single-item walks are exercised). */
function makeExtractor(currentPackageName: string): TypeReferenceExtractor {
	return new TypeReferenceExtractor({} as unknown as ApiPackage, currentPackageName);
}

/** Flatten import statements into a `package -> sorted symbols` map for assertions. */
function importMap(imports: ImportStatement[]): Record<string, string[]> {
	const result: Record<string, string[]> = {};
	for (const imp of imports) {
		result[imp.packageName] = Array.from(imp.symbols).sort();
	}
	return result;
}

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

	describe("Reference classification (extractImportsForApiItem)", () => {
		it("imports an external reference", () => {
			const extractor = makeExtractor("my-package");
			const item = makeItem({
				kind: ApiItemKind.Class,
				excerpt: makeExcerpt([makeRefToken("zod!ZodType:interface", "ZodType")]),
			});

			const imports = extractor.extractImportsForApiItem(item);

			expect(importMap(imports)).toEqual({ zod: ["ZodType"] });
		});

		it("filters out a built-in reference with an empty package name", () => {
			const extractor = makeExtractor("my-package");
			const item = makeItem({
				kind: ApiItemKind.Class,
				excerpt: makeExcerpt([makeRefToken("!Promise:interface", "Promise")]),
			});

			const imports = extractor.extractImportsForApiItem(item);

			expect(imports).toEqual([]);
		});

		it("filters out a built-in reference with a quoted package name (node: builtin)", () => {
			const extractor = makeExtractor("my-package");
			const item = makeItem({
				kind: ApiItemKind.Class,
				excerpt: makeExcerpt([makeRefToken('"node:buffer"!Buffer:interface', "Buffer")]),
			});

			const imports = extractor.extractImportsForApiItem(item);

			expect(imports).toEqual([]);
		});

		it("filters out an internal reference (same package)", () => {
			const extractor = makeExtractor("my-package");
			const item = makeItem({
				kind: ApiItemKind.Class,
				excerpt: makeExcerpt([makeRefToken("my-package!MyType:type", "MyType")]),
			});

			const imports = extractor.extractImportsForApiItem(item);

			expect(imports).toEqual([]);
		});

		it("imports the namespace root for a namespaced token", () => {
			const extractor = makeExtractor("my-package");
			// Token text is namespaced ("Schema.Struct"); the reconstructed declaration
			// body preserves the qualified form verbatim, so the binding that must be in
			// scope is the namespace ROOT ("Schema"), not the leaf member ("Struct").
			// Importing the leaf leaves "Schema" undefined and collapses `typeof X.Type`
			// companion types to an error type (false TS2353). Canonical symbol differs to
			// prove the dotted token-text branch (not the canonical name) is used.
			const item = makeItem({
				kind: ApiItemKind.Class,
				excerpt: makeExcerpt([makeRefToken("effect!IGNORED:interface", "Schema.Struct")]),
			});

			const imports = extractor.extractImportsForApiItem(item);

			expect(importMap(imports)).toEqual({ effect: ["Schema"] });
		});

		it("dedupes multiple members of the same namespace to a single root import", () => {
			const extractor = makeExtractor("my-package");
			const item = makeItem({
				kind: ApiItemKind.Class,
				excerpt: makeExcerpt([
					makeRefToken("effect!A:interface", "Schema.Struct"),
					makeRefToken("effect!B:interface", "Schema.optional"),
					makeRefToken("effect!C:interface", "Schema.Literal"),
				]),
			});

			const imports = extractor.extractImportsForApiItem(item);

			expect(importMap(imports)).toEqual({ effect: ["Schema"] });
		});

		it("uses the canonical symbol name when the token text is not namespaced", () => {
			const extractor = makeExtractor("my-package");
			const item = makeItem({
				kind: ApiItemKind.Class,
				excerpt: makeExcerpt([makeRefToken("zod!ZodType:interface", "ZodType")]),
			});

			const imports = extractor.extractImportsForApiItem(item);

			expect(importMap(imports)).toEqual({ zod: ["ZodType"] });
		});

		it("handles a canonical reference with no kind suffix (no colon)", () => {
			const extractor = makeExtractor("my-package");
			const item = makeItem({
				kind: ApiItemKind.Class,
				excerpt: makeExcerpt([makeRefToken("zod!ZodNoKind", "ZodNoKind")]),
			});

			const imports = extractor.extractImportsForApiItem(item);

			expect(importMap(imports)).toEqual({ zod: ["ZodNoKind"] });
		});

		it("skips a malformed canonical reference with no exclamation mark", () => {
			const extractor = makeExtractor("my-package");
			const item = makeItem({
				kind: ApiItemKind.Class,
				excerpt: makeExcerpt([
					makeRefToken("noexclamationhere", "Bogus"),
					makeRefToken("zod!ZodType:interface", "ZodType"),
				]),
			});

			const imports = extractor.extractImportsForApiItem(item);

			// The malformed token is skipped; the valid one still resolves.
			expect(importMap(imports)).toEqual({ zod: ["ZodType"] });
		});

		it("skips a Reference token whose canonicalReference is missing", () => {
			const extractor = makeExtractor("my-package");
			const item = makeItem({
				kind: ApiItemKind.Class,
				excerpt: makeExcerpt([makeRefToken(null, "NoCanonical"), makeRefToken("zod!ZodType:interface", "ZodType")]),
			});

			const imports = extractor.extractImportsForApiItem(item);

			expect(importMap(imports)).toEqual({ zod: ["ZodType"] });
		});

		it("skips non-Reference tokens", () => {
			const extractor = makeExtractor("my-package");
			const item = makeItem({
				kind: ApiItemKind.Class,
				excerpt: makeExcerpt([
					makeContentToken("Promise<"),
					makeRefToken("zod!ZodType:interface", "ZodType"),
					makeContentToken(">"),
				]),
			});

			const imports = extractor.extractImportsForApiItem(item);

			expect(importMap(imports)).toEqual({ zod: ["ZodType"] });
		});

		it("returns no imports for an excerpt with empty spanned tokens", () => {
			const extractor = makeExtractor("my-package");
			const item = makeItem({ kind: ApiItemKind.Class, excerpt: makeExcerpt([]) });

			expect(extractor.extractImportsForApiItem(item)).toEqual([]);
		});

		it("returns no imports for an item with no excerpt at all", () => {
			const extractor = makeExtractor("my-package");
			const item = makeItem({ kind: ApiItemKind.Class });

			expect(extractor.extractImportsForApiItem(item)).toEqual([]);
		});
	});

	describe("Excerpt selection (getExcerpt)", () => {
		it("reads a type alias's typeExcerpt", () => {
			const extractor = makeExtractor("my-package");
			const item = makeItem({
				kind: ApiItemKind.TypeAlias,
				typeExcerpt: makeExcerpt([makeRefToken("zod!ZodType:interface", "ZodType")]),
			});

			expect(importMap(extractor.extractImportsForApiItem(item))).toEqual({ zod: ["ZodType"] });
		});

		it("reads a property's propertyTypeExcerpt", () => {
			const extractor = makeExtractor("my-package");
			const item = makeItem({
				kind: ApiItemKind.Property,
				propertyTypeExcerpt: makeExcerpt([makeRefToken("zod!ZodNumber:interface", "ZodNumber")]),
			});

			expect(importMap(extractor.extractImportsForApiItem(item))).toEqual({ zod: ["ZodNumber"] });
		});

		it("reads a property signature's propertyTypeExcerpt", () => {
			const extractor = makeExtractor("my-package");
			const item = makeItem({
				kind: ApiItemKind.PropertySignature,
				propertyTypeExcerpt: makeExcerpt([makeRefToken("zod!ZodString:interface", "ZodString")]),
			});

			expect(importMap(extractor.extractImportsForApiItem(item))).toEqual({ zod: ["ZodString"] });
		});

		it("reads a function's returnTypeExcerpt", () => {
			const extractor = makeExtractor("my-package");
			const item = makeItem({
				kind: ApiItemKind.Function,
				returnTypeExcerpt: makeExcerpt([makeRefToken("rxjs!Observable:interface", "Observable")]),
			});

			expect(importMap(extractor.extractImportsForApiItem(item))).toEqual({ rxjs: ["Observable"] });
		});
	});

	describe("Container walking (walkApiItem)", () => {
		it("recursively extracts references from child members", () => {
			const extractor = makeExtractor("my-package");
			const parent = makeItem({
				kind: ApiItemKind.Class,
				excerpt: makeExcerpt([makeRefToken("zod!ZodType:interface", "ZodType")]),
				members: [
					makeItem({
						kind: ApiItemKind.Property,
						propertyTypeExcerpt: makeExcerpt([makeRefToken("rxjs!Observable:interface", "Observable")]),
					}),
				],
			});

			expect(importMap(extractor.extractImportsForApiItem(parent))).toEqual({
				rxjs: ["Observable"],
				zod: ["ZodType"],
			});
		});

		it("tolerates a members property that is not an array", () => {
			const extractor = makeExtractor("my-package");
			const item = makeItem({
				kind: ApiItemKind.Class,
				excerpt: makeExcerpt([makeRefToken("zod!ZodType:interface", "ZodType")]),
				members: "not-an-array",
			});

			expect(importMap(extractor.extractImportsForApiItem(item))).toEqual({ zod: ["ZodType"] });
		});
	});

	describe("Deduplication and sorting", () => {
		it("deduplicates references that share a canonical reference", () => {
			const extractor = makeExtractor("my-package");
			const item = makeItem({
				kind: ApiItemKind.Class,
				excerpt: makeExcerpt([
					makeRefToken("zod!ZodType:interface", "ZodType"),
					makeRefToken("zod!ZodType:interface", "ZodType"),
				]),
			});

			const imports = extractor.extractImportsForApiItem(item);

			expect(imports).toHaveLength(1);
			expect(Array.from(imports[0].symbols)).toEqual(["ZodType"]);
		});

		it("groups symbols by package and sorts packages alphabetically", () => {
			const extractor = makeExtractor("my-package");
			const item = makeItem({
				kind: ApiItemKind.Class,
				excerpt: makeExcerpt([
					makeRefToken("zod!ZodType:interface", "ZodType"),
					makeRefToken("@effect/schema!Schema:interface", "Schema"),
					makeRefToken("zod!ZodNumber:interface", "ZodNumber"),
				]),
			});

			const imports = extractor.extractImportsForApiItem(item);

			expect(imports.map((imp) => imp.packageName)).toEqual(["@effect/schema", "zod"]);
			expect(importMap(imports)).toEqual({
				"@effect/schema": ["Schema"],
				zod: ["ZodNumber", "ZodType"],
			});
		});
	});

	describe("formatImports", () => {
		it("returns an empty array for no imports", () => {
			expect(TypeReferenceExtractor.formatImports([])).toEqual([]);
		});

		it("emits a plain (non-type-only) import when typeOnly is false", () => {
			const statements = TypeReferenceExtractor.formatImports([
				{ packageName: "lodash", symbols: new Set(["merge"]), typeOnly: false },
			]);

			expect(statements).toEqual(['import { merge } from "lodash";']);
		});
	});
});
