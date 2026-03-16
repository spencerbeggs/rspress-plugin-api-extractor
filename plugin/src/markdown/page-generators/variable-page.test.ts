import type { ApiVariable } from "@microsoft/api-extractor-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiParser } from "../../loader.js";
import type { LlmsPluginOptions, SourceConfig } from "../../types.js";
import { VariablePageGenerator } from "./variable-page.js";

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
	escapeMdxGenerics: vi.fn((text: string) => text),
	prepareExampleCode: vi.fn(
		(example: { language: string; code: string }, _name: string, _pkg: string, _suppress: boolean) => ({
			code: example.code,
			isTypeScript: example.language === "typescript" || example.language === "ts",
			language: example.language,
		}),
	),
	stripTwoslashDirectives: vi.fn((code: string) => code),
	formatExampleCode: vi.fn(async (code: string) => code),
}));

describe("VariablePageGenerator", () => {
	let generator: VariablePageGenerator;
	let mockApiVariable: ApiVariable;

	beforeEach(() => {
		generator = new VariablePageGenerator();
		mockApiVariable = {
			displayName: "MY_CONSTANT",
			excerpt: {
				text: "const MY_CONSTANT: string",
			},
		} as unknown as ApiVariable;

		// Reset all mocks
		vi.clearAllMocks();

		// Set default mock returns
		vi.mocked(ApiParser.getSummary).mockReturnValue("A constant value");
		vi.mocked(ApiParser.getReleaseTag).mockReturnValue("Public");
		vi.mocked(ApiParser.getDeprecation).mockReturnValue(null);
		vi.mocked(ApiParser.getSourceLink).mockReturnValue(null);
		vi.mocked(ApiParser.getExamples).mockReturnValue([]);
		vi.mocked(ApiParser.getSeeReferences).mockReturnValue([]);
	});

	describe("generate", () => {
		it("should generate basic variable page", async () => {
			const result = await generator.generate(mockApiVariable, "/api", "my-package", "variable", "test-scope");

			expect(result.routePath).toBe("/api/variable/my_constant");
			expect(result.content).toContain("# MY_CONSTANT");
			expect(result.content).toContain("A constant value");
			expect(result.content).toContain("import { SourceCode } from");
			expect(result.content).toContain("import { ParametersTable } from");
			expect(result.content).toContain("import { ApiSignature, ApiExample } from");
		});

		it("should include frontmatter with apiName", async () => {
			const result = await generator.generate(mockApiVariable, "/api", "my-package", "variable", "test-scope", "API");

			expect(result.content).toContain('title: "MY_CONSTANT | variable | API"');
		});

		it("should include frontmatter without apiName", async () => {
			const result = await generator.generate(mockApiVariable, "/api", "my-package", "variable", "test-scope");

			expect(result.content).toContain('title: "MY_CONSTANT | variable"');
		});

		it("should handle no summary", async () => {
			vi.mocked(ApiParser.getSummary).mockReturnValue("");

			const result = await generator.generate(mockApiVariable, "/api", "my-package", "variable", "test-scope");

			expect(result.content).toContain("No description available.");
		});

		it("should include deprecation warning", async () => {
			vi.mocked(ApiParser.getDeprecation).mockReturnValue({
				message: "Use NEW_CONSTANT instead",
			});

			const result = await generator.generate(mockApiVariable, "/api", "my-package", "variable", "test-scope");

			expect(result.content).toContain("> ⚠️ **Deprecated:** Use NEW_CONSTANT instead");
		});

		it("should include release tag for non-Public items", async () => {
			vi.mocked(ApiParser.getReleaseTag).mockReturnValue("Beta");

			const result = await generator.generate(mockApiVariable, "/api", "my-package", "variable", "test-scope");

			expect(result.content).toContain("`Beta`");
		});

		it("should not include release tag for Public items", async () => {
			vi.mocked(ApiParser.getReleaseTag).mockReturnValue("Public");

			const result = await generator.generate(mockApiVariable, "/api", "my-package", "variable", "test-scope");

			expect(result.content).not.toContain("`Public`");
		});

		it("should include source link toolbar", async () => {
			vi.mocked(ApiParser.getSourceLink).mockReturnValue("https://github.com/user/repo/blob/main/src/const.ts#L10");

			const result = await generator.generate(mockApiVariable, "/api", "my-package", "variable", "test-scope");

			expect(result.content).toContain('<div className="api-docs-toolbar">');
			expect(result.content).toContain('<SourceCode href="https://github.com/user/repo/blob/main/src/const.ts#L10" />');
		});

		it("should not include toolbar when no source link", async () => {
			vi.mocked(ApiParser.getSourceLink).mockReturnValue(null);

			const result = await generator.generate(mockApiVariable, "/api", "my-package", "variable", "test-scope");

			expect(result.content).not.toContain('<div className="api-docs-toolbar">');
		});

		it("should include LLMS plugin section when enabled", async () => {
			vi.mocked(ApiParser.getSourceLink).mockReturnValue("https://github.com/user/repo/blob/main/src/const.ts");
			const llmsPlugin: LlmsPluginOptions = {
				enabled: true,
				showCopyButton: true,
				showViewOptions: true,
				copyButtonText: "Copy",
				viewOptions: [],
			};

			const result = await generator.generate(
				mockApiVariable,
				"/api",
				"my-package",
				"variable",
				"test-scope",
				undefined,
				undefined,
				undefined,
				llmsPlugin,
			);

			expect(result.content).toContain('<div className="api-docs-toolbar-right">');
		});

		it("should not include LLMS plugin section when disabled", async () => {
			vi.mocked(ApiParser.getSourceLink).mockReturnValue("https://github.com/user/repo/blob/main/src/const.ts");
			const llmsPlugin: LlmsPluginOptions = {
				enabled: false,
				showCopyButton: false,
				showViewOptions: false,
				copyButtonText: "",
				viewOptions: [],
			};

			const result = await generator.generate(
				mockApiVariable,
				"/api",
				"my-package",
				"variable",
				"test-scope",
				undefined,
				undefined,
				undefined,
				llmsPlugin,
			);

			expect(result.content).not.toContain('<div className="api-docs-toolbar-right">');
		});

		it("should include signature section", async () => {
			const result = await generator.generate(mockApiVariable, "/api", "my-package", "variable", "test-scope");

			expect(result.content).toContain("<ApiSignature");
			expect(result.content).toContain("const MY_CONSTANT: string");
		});

		it("should handle missing signature", async () => {
			(mockApiVariable.excerpt as { text: string }).text = "";

			const result = await generator.generate(mockApiVariable, "/api", "my-package", "variable", "test-scope");

			expect(result.content).not.toContain("<ApiSignature");
		});

		it("should include examples section", async () => {
			vi.mocked(ApiParser.getExamples).mockReturnValue([
				{ language: "typescript", code: "import { MY_CONSTANT } from 'my-package';\nconsole.log(MY_CONSTANT);" },
				{ language: "typescript", code: "// Another example\nconst value = MY_CONSTANT;" },
			]);

			const result = await generator.generate(mockApiVariable, "/api", "my-package", "variable", "test-scope");

			expect(result.content).toContain("## Examples");
			expect(result.content).toContain("import { MY_CONSTANT } from 'my-package';");
			expect(result.content).toContain("// Another example");
		});

		it("should not include examples section when empty", async () => {
			vi.mocked(ApiParser.getExamples).mockReturnValue([]);

			const result = await generator.generate(mockApiVariable, "/api", "my-package", "variable", "test-scope");

			expect(result.content).not.toContain("## Examples");
		});

		it("should include see also section", async () => {
			vi.mocked(ApiParser.getSeeReferences).mockReturnValue([
				{ text: "See {@link OtherConstant}" },
				{ text: "See the documentation" },
			]);

			const result = await generator.generate(mockApiVariable, "/api", "my-package", "variable", "test-scope");

			expect(result.content).toContain("## See Also");
			expect(result.content).toContain("- See {@link OtherConstant}");
			expect(result.content).toContain("- See the documentation");
		});

		it("should not include see also section when empty", async () => {
			vi.mocked(ApiParser.getSeeReferences).mockReturnValue([]);

			const result = await generator.generate(mockApiVariable, "/api", "my-package", "variable", "test-scope");

			expect(result.content).not.toContain("## See Also");
		});

		it("should use suppressExampleErrors parameter", async () => {
			vi.mocked(ApiParser.getExamples).mockReturnValue([{ language: "typescript", code: "example code" }]);

			await generator.generate(
				mockApiVariable,
				"/api",
				"my-package",
				"variable",
				"test-scope",
				undefined,
				undefined,
				false,
			);

			const helpers = await import("../helpers.js");
			expect(helpers.prepareExampleCode).toHaveBeenCalledWith(
				{ language: "typescript", code: "example code" },
				"MY_CONSTANT",
				"my-package",
				false,
			);
		});

		it("should default suppressExampleErrors to true", async () => {
			vi.mocked(ApiParser.getExamples).mockReturnValue([{ language: "typescript", code: "example code" }]);

			await generator.generate(mockApiVariable, "/api", "my-package", "variable", "test-scope");

			const helpers = await import("../helpers.js");
			expect(helpers.prepareExampleCode).toHaveBeenCalledWith(
				{ language: "typescript", code: "example code" },
				"MY_CONSTANT",
				"my-package",
				true,
			);
		});

		it("should pass sourceConfig to getSourceLink", async () => {
			const sourceConfig: SourceConfig = {
				url: "https://github.com/user/repo",
				ref: "blob/main",
			};

			await generator.generate(
				mockApiVariable,
				"/api",
				"my-package",
				"variable",
				"test-scope",
				undefined,
				sourceConfig,
			);

			expect(ApiParser.getSourceLink).toHaveBeenCalledWith(mockApiVariable, sourceConfig);
		});

		it("should generate correct route path with lowercase name", async () => {
			(mockApiVariable as { displayName: string }).displayName = "MY_SPECIAL_CONSTANT";

			const result = await generator.generate(mockApiVariable, "/api", "my-package", "variable", "test-scope");

			expect(result.routePath).toBe("/api/variable/my_special_constant");
		});

		it("should handle different base routes", async () => {
			const result = await generator.generate(mockApiVariable, "/docs/api/v1", "my-package", "variable", "test-scope");

			expect(result.routePath).toBe("/docs/api/v1/variable/my_constant");
		});

		it("should format complete page with all sections", async () => {
			vi.mocked(ApiParser.getSummary).mockReturnValue("A constant value");
			vi.mocked(ApiParser.getReleaseTag).mockReturnValue("Beta");
			vi.mocked(ApiParser.getDeprecation).mockReturnValue({ message: "Deprecated message" });
			vi.mocked(ApiParser.getSourceLink).mockReturnValue("https://github.com/user/repo/blob/main/src/const.ts");
			vi.mocked(ApiParser.getExamples).mockReturnValue([{ language: "typescript", code: "example code" }]);
			vi.mocked(ApiParser.getSeeReferences).mockReturnValue([{ text: "See something" }]);

			const result = await generator.generate(mockApiVariable, "/api", "my-package", "variable", "test-scope", "API");

			expect(result.content).toContain('title: "MY_CONSTANT | variable | API"');
			expect(result.content).toContain("# MY_CONSTANT");
			expect(result.content).toContain("> ⚠️ **Deprecated:");
			expect(result.content).toContain("`Beta`");
			expect(result.content).toContain("A constant value");
			expect(result.content).toContain('<div className="api-docs-toolbar">');
			expect(result.content).toContain("<ApiSignature");
			expect(result.content).toContain("## Examples");
			expect(result.content).toContain("## See Also");
		});
	});
});
