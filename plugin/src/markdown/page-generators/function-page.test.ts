import type { ApiFunction } from "@microsoft/api-extractor-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiParser } from "../../loader.js";
import type { LlmsPlugin, SourceConfig } from "../../schemas/index.js";
import { FunctionPageGenerator } from "./function-page.js";

// Mock dependencies
vi.mock("../../loader.js", () => ({
	ApiParser: {
		getSummary: vi.fn(),
		getReleaseTag: vi.fn(),
		getDeprecation: vi.fn(),
		getSourceLink: vi.fn(),
		getParams: vi.fn(),
		getReturns: vi.fn(),
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

describe("FunctionPageGenerator", () => {
	let generator: FunctionPageGenerator;
	let mockApiFunction: ApiFunction;

	beforeEach(() => {
		generator = new FunctionPageGenerator();
		mockApiFunction = {
			displayName: "myFunction",
			excerpt: {
				text: "function myFunction(arg: string): number",
			},
		} as unknown as ApiFunction;

		// Reset all mocks
		vi.clearAllMocks();

		// Set default mock returns
		vi.mocked(ApiParser.getSummary).mockReturnValue("A useful function");
		vi.mocked(ApiParser.getReleaseTag).mockReturnValue("Public");
		vi.mocked(ApiParser.getDeprecation).mockReturnValue(null);
		vi.mocked(ApiParser.getSourceLink).mockReturnValue(null);
		vi.mocked(ApiParser.getParams).mockReturnValue([]);
		vi.mocked(ApiParser.getReturns).mockReturnValue(null);
		vi.mocked(ApiParser.getExamples).mockReturnValue([]);
		vi.mocked(ApiParser.getSeeReferences).mockReturnValue([]);
	});

	describe("generate", () => {
		it("should generate basic function page", async () => {
			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			expect(result.routePath).toBe("/api/function/myfunction");
			expect(result.content).toContain("# myFunction");
			expect(result.content).toContain("A useful function");
			expect(result.content).toContain("import { SourceCode } from");
			expect(result.content).toContain("import { ParametersTable } from");
			expect(result.content).toContain("import { ApiSignature, ApiExample } from");
		});

		it("should include frontmatter with apiName", async () => {
			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope", "API");

			expect(result.content).toContain('title: "myFunction | function | API"');
		});

		it("should include frontmatter without apiName", async () => {
			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			expect(result.content).toContain('title: "myFunction | function"');
		});

		it("should handle no summary", async () => {
			vi.mocked(ApiParser.getSummary).mockReturnValue("");

			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			expect(result.content).toContain("No description available.");
		});

		it("should include deprecation warning", async () => {
			vi.mocked(ApiParser.getDeprecation).mockReturnValue({
				message: "Use newFunction instead",
			});

			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			expect(result.content).toContain("> ⚠️ **Deprecated:** Use newFunction instead");
		});

		it("should include release tag for non-Public items", async () => {
			vi.mocked(ApiParser.getReleaseTag).mockReturnValue("Beta");

			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			expect(result.content).toContain("`Beta`");
		});

		it("should not include release tag for Public items", async () => {
			vi.mocked(ApiParser.getReleaseTag).mockReturnValue("Public");

			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			expect(result.content).not.toContain("`Public`");
		});

		it("should include source link toolbar", async () => {
			vi.mocked(ApiParser.getSourceLink).mockReturnValue("https://github.com/user/repo/blob/main/src/utils.ts#L20");

			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			expect(result.content).toContain('<div className="api-docs-toolbar">');
			expect(result.content).toContain('<SourceCode href="https://github.com/user/repo/blob/main/src/utils.ts#L20" />');
		});

		it("should not include toolbar when no source link", async () => {
			vi.mocked(ApiParser.getSourceLink).mockReturnValue(null);

			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			expect(result.content).not.toContain('<div className="api-docs-toolbar">');
		});

		it("should include LLMS plugin section when enabled", async () => {
			vi.mocked(ApiParser.getSourceLink).mockReturnValue("https://github.com/user/repo/blob/main/src/utils.ts");
			const llmsPlugin: LlmsPlugin = {
				enabled: true,
				showCopyButton: true,
				showViewOptions: true,
				copyButtonText: "Copy",
				viewOptions: [],
			};

			const result = await generator.generate(
				mockApiFunction,
				"/api",
				"my-package",
				"function",
				"test-scope",
				undefined,
				undefined,
				undefined,
				llmsPlugin,
			);

			expect(result.content).toContain('<div className="api-docs-toolbar-right">');
		});

		it("should not include LLMS plugin section when disabled", async () => {
			vi.mocked(ApiParser.getSourceLink).mockReturnValue("https://github.com/user/repo/blob/main/src/utils.ts");
			const llmsPlugin: LlmsPlugin = {
				enabled: false,
				showCopyButton: false,
				showViewOptions: false,
				copyButtonText: "",
				viewOptions: [],
			};

			const result = await generator.generate(
				mockApiFunction,
				"/api",
				"my-package",
				"function",
				"test-scope",
				undefined,
				undefined,
				undefined,
				llmsPlugin,
			);

			expect(result.content).not.toContain('<div className="api-docs-toolbar-right">');
		});

		it("should include signature section", async () => {
			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			expect(result.content).toContain("<ApiSignature");
			expect(result.content).toContain("function myFunction(arg: string): number");
		});

		it("should handle missing signature", async () => {
			(mockApiFunction.excerpt as { text: string }).text = "";

			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			expect(result.content).not.toContain("<ApiSignature");
		});

		it("should include parameters section", async () => {
			vi.mocked(ApiParser.getParams).mockReturnValue([
				{ name: "input", description: "The input string" },
				{ name: "options", description: "Configuration options" },
			]);

			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			expect(result.content).toContain("<ParametersTable parameters={");
			expect(result.content).toContain("hasParameters={true}");
			expect(result.content).toContain('"name":"input"');
			expect(result.content).toContain('"description":"The input string"');
			expect(result.content).toContain('"name":"options"');
			expect(result.content).toContain('"description":"Configuration options"');
		});

		it("should not include parameters section when empty", async () => {
			vi.mocked(ApiParser.getParams).mockReturnValue([]);

			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			expect(result.content).not.toContain("<ParametersTable");
			expect(result.content).toContain("hasParameters={false}");
		});

		it("should include returns section", async () => {
			vi.mocked(ApiParser.getReturns).mockReturnValue({
				description: "The result value as a number",
			});

			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			expect(result.content).toContain("## Returns");
			expect(result.content).toContain("The result value as a number");
		});

		it("should not include returns section when null", async () => {
			vi.mocked(ApiParser.getReturns).mockReturnValue(null);

			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			expect(result.content).not.toContain("## Returns");
		});

		it("should include examples section", async () => {
			vi.mocked(ApiParser.getExamples).mockReturnValue([
				{
					language: "typescript",
					code: "import { myFunction } from 'my-package';\nconst result = myFunction('test');",
				},
				{ language: "typescript", code: "// Another example\nmyFunction('hello');" },
			]);

			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			expect(result.content).toContain("## Examples");
			expect(result.content).toContain("import { myFunction } from 'my-package';");
			expect(result.content).toContain("// Another example");
		});

		it("should not include examples section when empty", async () => {
			vi.mocked(ApiParser.getExamples).mockReturnValue([]);

			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			expect(result.content).not.toContain("## Examples");
		});

		it("should include see also section", async () => {
			vi.mocked(ApiParser.getSeeReferences).mockReturnValue([
				{ text: "See {@link relatedFunction}" },
				{ text: "See the function documentation" },
			]);

			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			expect(result.content).toContain("## See Also");
			expect(result.content).toContain("- See {@link relatedFunction}");
			expect(result.content).toContain("- See the function documentation");
		});

		it("should not include see also section when empty", async () => {
			vi.mocked(ApiParser.getSeeReferences).mockReturnValue([]);

			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			expect(result.content).not.toContain("## See Also");
		});

		it("should use suppressExampleErrors parameter", async () => {
			vi.mocked(ApiParser.getExamples).mockReturnValue([{ language: "typescript", code: "example code" }]);

			await generator.generate(
				mockApiFunction,
				"/api",
				"my-package",
				"function",
				"test-scope",
				undefined,
				undefined,
				false,
			);

			const helpers = await import("../helpers.js");
			expect(helpers.prepareExampleCode).toHaveBeenCalledWith(
				{ language: "typescript", code: "example code" },
				"myFunction",
				"my-package",
				false,
			);
		});

		it("should default suppressExampleErrors to true", async () => {
			vi.mocked(ApiParser.getExamples).mockReturnValue([{ language: "typescript", code: "example code" }]);

			await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			const helpers = await import("../helpers.js");
			expect(helpers.prepareExampleCode).toHaveBeenCalledWith(
				{ language: "typescript", code: "example code" },
				"myFunction",
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
				mockApiFunction,
				"/api",
				"my-package",
				"function",
				"test-scope",
				undefined,
				sourceConfig,
			);

			expect(ApiParser.getSourceLink).toHaveBeenCalledWith(mockApiFunction, sourceConfig);
		});

		it("should generate correct route path with lowercase name", async () => {
			(mockApiFunction as { displayName: string }).displayName = "mySpecialFunction";

			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope");

			expect(result.routePath).toBe("/api/function/myspecialfunction");
		});

		it("should handle different base routes", async () => {
			const result = await generator.generate(mockApiFunction, "/docs/api/v1", "my-package", "function", "test-scope");

			expect(result.routePath).toBe("/docs/api/v1/function/myfunction");
		});

		it("should format complete page with all sections", async () => {
			vi.mocked(ApiParser.getSummary).mockReturnValue("A function");
			vi.mocked(ApiParser.getReleaseTag).mockReturnValue("Internal");
			vi.mocked(ApiParser.getDeprecation).mockReturnValue({ message: "Deprecated message" });
			vi.mocked(ApiParser.getSourceLink).mockReturnValue("https://github.com/user/repo/blob/main/src/utils.ts");
			vi.mocked(ApiParser.getParams).mockReturnValue([{ name: "arg", description: "An argument" }]);
			vi.mocked(ApiParser.getReturns).mockReturnValue({ description: "The return value" });
			vi.mocked(ApiParser.getExamples).mockReturnValue([{ language: "typescript", code: "example code" }]);
			vi.mocked(ApiParser.getSeeReferences).mockReturnValue([{ text: "See something" }]);

			const result = await generator.generate(mockApiFunction, "/api", "my-package", "function", "test-scope", "API");

			expect(result.content).toContain('title: "myFunction | function | API"');
			expect(result.content).toContain("# myFunction");
			expect(result.content).toContain("> ⚠️ **Deprecated:");
			expect(result.content).toContain("`Internal`");
			expect(result.content).toContain("A function");
			expect(result.content).toContain('<div className="api-docs-toolbar">');
			expect(result.content).toContain("<ApiSignature");
			expect(result.content).toContain("<ParametersTable");
			expect(result.content).toContain("## Returns");
			expect(result.content).toContain("## Examples");
			expect(result.content).toContain("## See Also");
		});
	});
});
