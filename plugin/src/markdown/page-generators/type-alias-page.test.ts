import type { ApiTypeAlias } from "@microsoft/api-extractor-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiParser } from "../../loader.js";
import type { LlmsPlugin, SourceConfig } from "../../schemas/index.js";
import { TypeAliasPageGenerator } from "./type-alias-page.js";

// Mock dependencies
vi.mock("../../loader.js", () => ({
	ApiParser: {
		getSummary: vi.fn(),
		getReleaseTag: vi.fn(),
		getDeprecation: vi.fn(),
		getSourceLink: vi.fn(),
		getExamples: vi.fn(),
		getSeeReferences: vi.fn(),
	},
}));

vi.mock("../cross-linker.js", () => ({
	markdownCrossLinker: {
		addCrossLinks: vi.fn((text: string) => text),
	},
}));

vi.mock("../helpers.js", () => ({
	generateFrontmatter: vi.fn((name: string, summary: string, singularName: string, apiName?: string) => {
		const title = apiName ? `${name} | ${singularName} | ${apiName}` : `${name} | ${singularName}`;
		return `---\ntitle: "${title}"\ndescription: ${summary}\n---\n\n`;
	}),
	generateAvailableFrom: vi.fn(() => ""),
	escapeMdxGenerics: vi.fn((text: string) => text),
	prepareExampleCode: vi.fn(
		(example: { language: string; code: string }, _name: string, _pkg: string, _suppress: boolean) => ({
			code: example.code,
			isTypeScript: example.language === "typescript" || example.language === "ts",
			language: example.language,
		}),
	),
	prependHiddenImports: vi.fn((code: string) => code),
	stripTwoslashDirectives: vi.fn((code: string) => code),
	formatExampleCode: vi.fn(async (code: string) => code),
}));

describe("TypeAliasPageGenerator", () => {
	let generator: TypeAliasPageGenerator;
	let mockApiTypeAlias: ApiTypeAlias;

	beforeEach(() => {
		generator = new TypeAliasPageGenerator();
		mockApiTypeAlias = {
			displayName: "MyType",
			excerpt: {
				text: "type MyType = string | number",
			},
		} as unknown as ApiTypeAlias;

		// Reset all mocks
		vi.clearAllMocks();

		// Set default mock returns
		vi.mocked(ApiParser.getSummary).mockReturnValue("A type alias for values");
		vi.mocked(ApiParser.getReleaseTag).mockReturnValue("Public");
		vi.mocked(ApiParser.getDeprecation).mockReturnValue(null);
		vi.mocked(ApiParser.getSourceLink).mockReturnValue(null);
		vi.mocked(ApiParser.getExamples).mockReturnValue([]);
		vi.mocked(ApiParser.getSeeReferences).mockReturnValue([]);
	});

	describe("generate", () => {
		it("should generate basic type alias page", async () => {
			const result = await generator.generate(mockApiTypeAlias, "/api", "my-package", "type", "test-scope");

			expect(result.routePath).toBe("/api/type/mytype");
			expect(result.content).toContain("# MyType");
			expect(result.content).toContain("A type alias for values");
			expect(result.content).toContain("import { SourceCode } from");
			expect(result.content).toContain("import { ParametersTable } from");
			expect(result.content).toContain("import { ApiSignature, ApiExample } from");
		});

		it("should include frontmatter with apiName", async () => {
			const result = await generator.generate(mockApiTypeAlias, "/api", "my-package", "type", "test-scope", "API");

			expect(result.content).toContain('title: "MyType | type | API"');
		});

		it("should include frontmatter without apiName", async () => {
			const result = await generator.generate(mockApiTypeAlias, "/api", "my-package", "type", "test-scope");

			expect(result.content).toContain('title: "MyType | type"');
		});

		it("should handle no summary", async () => {
			vi.mocked(ApiParser.getSummary).mockReturnValue("");

			const result = await generator.generate(mockApiTypeAlias, "/api", "my-package", "type", "test-scope");

			expect(result.content).toContain("No description available.");
		});

		it("should include deprecation warning", async () => {
			vi.mocked(ApiParser.getDeprecation).mockReturnValue({
				message: "Use NewType instead",
			});

			const result = await generator.generate(mockApiTypeAlias, "/api", "my-package", "type", "test-scope");

			expect(result.content).toContain("> ⚠️ **Deprecated:** Use NewType instead");
		});

		it("should include release tag for non-Public items", async () => {
			vi.mocked(ApiParser.getReleaseTag).mockReturnValue("Alpha");

			const result = await generator.generate(mockApiTypeAlias, "/api", "my-package", "type", "test-scope");

			expect(result.content).toContain("`Alpha`");
		});

		it("should not include release tag for Public items", async () => {
			vi.mocked(ApiParser.getReleaseTag).mockReturnValue("Public");

			const result = await generator.generate(mockApiTypeAlias, "/api", "my-package", "type", "test-scope");

			expect(result.content).not.toContain("`Public`");
		});

		it("should include source link toolbar", async () => {
			vi.mocked(ApiParser.getSourceLink).mockReturnValue("https://github.com/user/repo/blob/main/src/types.ts#L15");

			const result = await generator.generate(mockApiTypeAlias, "/api", "my-package", "type", "test-scope");

			expect(result.content).toContain('<div className="api-docs-toolbar">');
			expect(result.content).toContain('<SourceCode href="https://github.com/user/repo/blob/main/src/types.ts#L15" />');
		});

		it("should not include toolbar when no source link", async () => {
			vi.mocked(ApiParser.getSourceLink).mockReturnValue(null);

			const result = await generator.generate(mockApiTypeAlias, "/api", "my-package", "type", "test-scope");

			expect(result.content).not.toContain('<div className="api-docs-toolbar">');
		});

		it("should include LLMS plugin section when enabled", async () => {
			vi.mocked(ApiParser.getSourceLink).mockReturnValue("https://github.com/user/repo/blob/main/src/types.ts");
			const llmsPlugin: LlmsPlugin = {
				enabled: true,
				showCopyButton: true,
				showViewOptions: true,
				copyButtonText: "Copy",
				viewOptions: [],
			};

			const result = await generator.generate(
				mockApiTypeAlias,
				"/api",
				"my-package",
				"type",
				"test-scope",
				undefined,
				undefined,
				undefined,
				llmsPlugin,
			);

			expect(result.content).toContain('<div className="api-docs-toolbar-right">');
		});

		it("should not include LLMS plugin section when disabled", async () => {
			vi.mocked(ApiParser.getSourceLink).mockReturnValue("https://github.com/user/repo/blob/main/src/types.ts");
			const llmsPlugin: LlmsPlugin = {
				enabled: false,
				showCopyButton: false,
				showViewOptions: false,
				copyButtonText: "",
				viewOptions: [],
			};

			const result = await generator.generate(
				mockApiTypeAlias,
				"/api",
				"my-package",
				"type",
				"test-scope",
				undefined,
				undefined,
				undefined,
				llmsPlugin,
			);

			expect(result.content).not.toContain('<div className="api-docs-toolbar-right">');
		});

		it("should include signature section", async () => {
			const result = await generator.generate(mockApiTypeAlias, "/api", "my-package", "type", "test-scope");

			expect(result.content).toContain("<ApiSignature");
			expect(result.content).toContain("type MyType = string | number");
		});

		it("should handle missing signature", async () => {
			(mockApiTypeAlias.excerpt as { text: string }).text = "";

			const result = await generator.generate(mockApiTypeAlias, "/api", "my-package", "type", "test-scope");

			expect(result.content).not.toContain("<ApiSignature");
		});

		it("should include examples section", async () => {
			vi.mocked(ApiParser.getExamples).mockReturnValue([
				{ language: "typescript", code: "import type { MyType } from 'my-package';\nconst value: MyType = 'hello';" },
				{ language: "typescript", code: "// Another example\nconst num: MyType = 42;" },
			]);

			const result = await generator.generate(mockApiTypeAlias, "/api", "my-package", "type", "test-scope");

			expect(result.content).toContain("## Examples");
			expect(result.content).toContain("import type { MyType } from 'my-package';");
			expect(result.content).toContain("// Another example");
		});

		it("should not include examples section when empty", async () => {
			vi.mocked(ApiParser.getExamples).mockReturnValue([]);

			const result = await generator.generate(mockApiTypeAlias, "/api", "my-package", "type", "test-scope");

			expect(result.content).not.toContain("## Examples");
		});

		it("should include see also section", async () => {
			vi.mocked(ApiParser.getSeeReferences).mockReturnValue([
				{ text: "See {@link RelatedType}" },
				{ text: "See the type documentation" },
			]);

			const result = await generator.generate(mockApiTypeAlias, "/api", "my-package", "type", "test-scope");

			expect(result.content).toContain("## See Also");
			expect(result.content).toContain("- See {@link RelatedType}");
			expect(result.content).toContain("- See the type documentation");
		});

		it("should not include see also section when empty", async () => {
			vi.mocked(ApiParser.getSeeReferences).mockReturnValue([]);

			const result = await generator.generate(mockApiTypeAlias, "/api", "my-package", "type", "test-scope");

			expect(result.content).not.toContain("## See Also");
		});

		it("should use suppressExampleErrors parameter", async () => {
			vi.mocked(ApiParser.getExamples).mockReturnValue([{ language: "typescript", code: "example code" }]);

			await generator.generate(
				mockApiTypeAlias,
				"/api",
				"my-package",
				"type",
				"test-scope",
				undefined,
				undefined,
				false,
			);

			const helpers = await import("../helpers.js");
			expect(helpers.prepareExampleCode).toHaveBeenCalledWith(
				{ language: "typescript", code: "example code" },
				"MyType",
				"my-package",
				false,
			);
		});

		it("should default suppressExampleErrors to true", async () => {
			vi.mocked(ApiParser.getExamples).mockReturnValue([{ language: "typescript", code: "example code" }]);

			await generator.generate(mockApiTypeAlias, "/api", "my-package", "type", "test-scope");

			const helpers = await import("../helpers.js");
			expect(helpers.prepareExampleCode).toHaveBeenCalledWith(
				{ language: "typescript", code: "example code" },
				"MyType",
				"my-package",
				true,
			);
		});

		it("should pass sourceConfig to getSourceLink", async () => {
			const sourceConfig: SourceConfig = {
				url: "https://github.com/user/repo",
				ref: "blob/main",
			};

			await generator.generate(mockApiTypeAlias, "/api", "my-package", "type", "test-scope", undefined, sourceConfig);

			expect(ApiParser.getSourceLink).toHaveBeenCalledWith(mockApiTypeAlias, sourceConfig);
		});

		it("should generate correct route path with lowercase name", async () => {
			(mockApiTypeAlias as { displayName: string }).displayName = "MyComplexType";

			const result = await generator.generate(mockApiTypeAlias, "/api", "my-package", "type", "test-scope");

			expect(result.routePath).toBe("/api/type/mycomplextype");
		});

		it("should handle different base routes", async () => {
			const result = await generator.generate(mockApiTypeAlias, "/docs/api/v1", "my-package", "type", "test-scope");

			expect(result.routePath).toBe("/docs/api/v1/type/mytype");
		});

		it("should format complete page with all sections", async () => {
			vi.mocked(ApiParser.getSummary).mockReturnValue("A type alias");
			vi.mocked(ApiParser.getReleaseTag).mockReturnValue("Internal");
			vi.mocked(ApiParser.getDeprecation).mockReturnValue({ message: "Deprecated message" });
			vi.mocked(ApiParser.getSourceLink).mockReturnValue("https://github.com/user/repo/blob/main/src/types.ts");
			vi.mocked(ApiParser.getExamples).mockReturnValue([{ language: "typescript", code: "example code" }]);
			vi.mocked(ApiParser.getSeeReferences).mockReturnValue([{ text: "See something" }]);

			const result = await generator.generate(mockApiTypeAlias, "/api", "my-package", "type", "test-scope", "API");

			expect(result.content).toContain('title: "MyType | type | API"');
			expect(result.content).toContain("# MyType");
			expect(result.content).toContain("> ⚠️ **Deprecated:");
			expect(result.content).toContain("`Internal`");
			expect(result.content).toContain("A type alias");
			expect(result.content).toContain('<div className="api-docs-toolbar">');
			expect(result.content).toContain("<ApiSignature");
			expect(result.content).toContain("## Examples");
			expect(result.content).toContain("## See Also");
		});
	});
});
