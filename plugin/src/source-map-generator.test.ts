import type { ApiItem } from "@microsoft/api-extractor-model";
import { ApiModel } from "@microsoft/api-extractor-model";
import { describe, expect, it } from "vitest";
import { SourceMapGenerator } from "./source-map-generator.js";

describe("SourceMapGenerator", () => {
	const apiModel = new ApiModel();
	const apiPackage = apiModel.loadPackage(
		"/Users/spencer/workspaces/spencerbeggs/website/docs/lib/packages/claude-binary-plugin.api.json",
	);
	const entryPoint = apiPackage.entryPoints[0];

	describe("Basic functionality", () => {
		it("should create generator with package name and model path", () => {
			const generator = new SourceMapGenerator("test-package", "path/to/model.api.json");

			expect(generator).toBeDefined();
			expect(generator.getCurrentLine()).toBe(1);
		});

		it("should track current line number", () => {
			const generator = new SourceMapGenerator("test-package", "path/to/model.api.json");

			expect(generator.getCurrentLine()).toBe(1);

			generator.advanceLines(5);
			expect(generator.getCurrentLine()).toBe(6);

			generator.advanceLines();
			expect(generator.getCurrentLine()).toBe(7);
		});

		it("should add mapping for API item", () => {
			const generator = new SourceMapGenerator("test-package", "path/to/model.api.json");
			const member = entryPoint.members[0];

			generator.addMapping(member);

			const sourceMap = generator.generate();
			expect(sourceMap.declarations[1]).toBeDefined();
			expect(sourceMap.declarations[1].displayName).toBe(member.displayName);
			expect(sourceMap.declarations[1].kind).toBe(member.kind);
		});
	});

	describe("Source map generation", () => {
		it("should generate source map with correct structure", () => {
			const generator = new SourceMapGenerator("claude-binary-plugin", "docs/lib/model.api.json");

			const member1 = entryPoint.members[0];
			const member2 = entryPoint.members[1];

			generator.addMapping(member1);
			generator.advanceLines(5);

			generator.addMapping(member2);

			const sourceMap = generator.generate();

			expect(sourceMap.version).toBe(1);
			expect(sourceMap.packageName).toBe("claude-binary-plugin");
			expect(sourceMap.apiModelPath).toBe("docs/lib/model.api.json");
			expect(Object.keys(sourceMap.declarations)).toHaveLength(2);
		});

		it("should map to correct line numbers", () => {
			const generator = new SourceMapGenerator("test-package", "model.api.json");

			const member1 = entryPoint.members[0];
			generator.addMapping(member1);
			generator.advanceLines(3);

			const member2 = entryPoint.members[1];
			generator.addMapping(member2);
			generator.advanceLines(5);

			const member3 = entryPoint.members[2];
			generator.addMapping(member3);

			const sourceMap = generator.generate();

			expect(sourceMap.declarations[1]).toBeDefined();
			expect(sourceMap.declarations[4]).toBeDefined();
			expect(sourceMap.declarations[9]).toBeDefined();
		});

		it("should include source file paths", () => {
			const generator = new SourceMapGenerator("claude-binary-plugin", "model.api.json");
			const member = entryPoint.members[0];

			generator.addMapping(member);

			const sourceMap = generator.generate();
			const mapping = sourceMap.declarations[1];

			expect(mapping.file).toBeDefined();
			expect(mapping.file).toContain(".ts");
		});

		it("should include canonical references", () => {
			const generator = new SourceMapGenerator("claude-binary-plugin", "model.api.json");
			const member = entryPoint.members[0];

			generator.addMapping(member);

			const sourceMap = generator.generate();
			const mapping = sourceMap.declarations[1];

			expect(mapping.apiItem).toContain("claude-binary-plugin!");
			expect(mapping.apiItem).toContain(":");
		});
	});

	describe("JSON serialization", () => {
		it("should serialize to valid JSON", () => {
			const generator = new SourceMapGenerator("test-package", "model.api.json");
			const member = entryPoint.members[0];

			generator.addMapping(member);

			const json = generator.toJSON();

			expect(() => JSON.parse(json)).not.toThrow();

			const parsed = JSON.parse(json);
			expect(parsed.version).toBe(1);
			expect(parsed.packageName).toBe("test-package");
		});

		it("should format JSON with indentation", () => {
			const generator = new SourceMapGenerator("test-package", "model.api.json");
			const member = entryPoint.members[0];

			generator.addMapping(member);

			const json = generator.toJSON();

			expect(json).toContain("\n");
			expect(json).toContain("  ");
		});
	});

	describe("Multiple mappings", () => {
		it("should handle multiple API items", () => {
			const generator = new SourceMapGenerator("claude-binary-plugin", "model.api.json");

			// Add mappings for first 10 members
			for (let i = 0; i < 10 && i < entryPoint.members.length; i++) {
				generator.addMapping(entryPoint.members[i]);
				generator.advanceLines(3);
			}

			const sourceMap = generator.generate();
			const mappingCount = Object.keys(sourceMap.declarations).length;

			expect(mappingCount).toBe(Math.min(10, entryPoint.members.length));
		});

		it("should preserve all mapping information", () => {
			const generator = new SourceMapGenerator("test-package", "model.api.json");

			const members = entryPoint.members.slice(0, 5);
			for (const member of members) {
				generator.addMapping(member);
				generator.advanceLines(2);
			}

			const sourceMap = generator.generate();

			for (const mapping of Object.values(sourceMap.declarations)) {
				expect(mapping.file).toBeDefined();
				expect(mapping.apiItem).toBeDefined();
				expect(mapping.kind).toBeDefined();
				expect(mapping.displayName).toBeDefined();
			}
		});
	});

	describe("Edge cases", () => {
		it("should handle empty generator", () => {
			const generator = new SourceMapGenerator("test-package", "model.api.json");

			const sourceMap = generator.generate();

			expect(sourceMap.declarations).toEqual({});
			expect(Object.keys(sourceMap.declarations)).toHaveLength(0);
		});

		it("should handle missing file path", () => {
			const generator = new SourceMapGenerator("test-package", "model.api.json");

			// Create a minimal API item without fileUrlPath
			const mockItem = {
				displayName: "MockItem",
				kind: "TypeAlias",
				canonicalReference: {
					toString: () => "test!MockItem:type",
				},
			} as unknown as ApiItem;

			generator.addMapping(mockItem);

			const sourceMap = generator.generate();
			const mapping = sourceMap.declarations[1];

			expect(mapping.file).toBe("unknown");
		});

		it("should handle large line numbers", () => {
			const generator = new SourceMapGenerator("test-package", "model.api.json");

			generator.advanceLines(1000);
			generator.addMapping(entryPoint.members[0]);

			const sourceMap = generator.generate();

			expect(sourceMap.declarations[1001]).toBeDefined();
		});
	});
});
