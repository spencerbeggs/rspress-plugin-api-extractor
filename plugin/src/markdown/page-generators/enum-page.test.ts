import type { ApiEnum, ApiEnumMember } from "@microsoft/api-extractor-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiParser } from "../../loader.js";
import type { LlmsPluginOptions, SourceConfig } from "../../types.js";
import { EnumPageGenerator } from "./enum-page.js";

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

describe("EnumPageGenerator", () => {
	let generator: EnumPageGenerator;
	let mockApiEnum: ApiEnum;

	beforeEach(() => {
		generator = new EnumPageGenerator();
		mockApiEnum = {
			displayName: "Status",
			excerpt: {
				text: "enum Status { Active, Inactive }",
			},
			members: [],
		} as unknown as ApiEnum;

		// Reset all mocks
		vi.clearAllMocks();

		// Set default mock returns
		vi.mocked(ApiParser.getSummary).mockReturnValue("Status enumeration");
		vi.mocked(ApiParser.getReleaseTag).mockReturnValue("Public");
		vi.mocked(ApiParser.getDeprecation).mockReturnValue(null);
		vi.mocked(ApiParser.getSourceLink).mockReturnValue(null);
		vi.mocked(ApiParser.getExamples).mockReturnValue([]);
		vi.mocked(ApiParser.getSeeReferences).mockReturnValue([]);
	});

	describe("generate", () => {
		it("should generate basic enum page", async () => {
			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope");

			expect(result.routePath).toBe("/api/enum/status");
			expect(result.content).toContain("# Status");
			expect(result.content).toContain("Status enumeration");
			expect(result.content).toContain("import { SourceCode } from");
			expect(result.content).toContain("import { EnumMembersTable } from");
			expect(result.content).toContain("import { ApiSignature, ApiExample } from");
		});

		it("should include frontmatter with apiName", async () => {
			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope", "API");

			expect(result.content).toContain('title: "Status | enum | API"');
		});

		it("should include frontmatter without apiName", async () => {
			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope");

			expect(result.content).toContain('title: "Status | enum"');
		});

		it("should handle no summary", async () => {
			vi.mocked(ApiParser.getSummary).mockReturnValue("");

			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope");

			expect(result.content).toContain("No description available.");
		});

		it("should include deprecation warning", async () => {
			vi.mocked(ApiParser.getDeprecation).mockReturnValue({
				message: "Use NewStatus instead",
			});

			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope");

			expect(result.content).toContain("> ⚠️ **Deprecated:** Use NewStatus instead");
		});

		it("should include release tag for non-Public items", async () => {
			vi.mocked(ApiParser.getReleaseTag).mockReturnValue("Beta");

			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope");

			expect(result.content).toContain("`Beta`");
		});

		it("should not include release tag for Public items", async () => {
			vi.mocked(ApiParser.getReleaseTag).mockReturnValue("Public");

			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope");

			expect(result.content).not.toContain("`Public`");
		});

		it("should include source link toolbar", async () => {
			vi.mocked(ApiParser.getSourceLink).mockReturnValue("https://github.com/user/repo/blob/main/src/enums.ts#L10");

			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope");

			expect(result.content).toContain('<div className="api-docs-toolbar">');
			expect(result.content).toContain('<SourceCode href="https://github.com/user/repo/blob/main/src/enums.ts#L10" />');
		});

		it("should not include toolbar when no source link", async () => {
			vi.mocked(ApiParser.getSourceLink).mockReturnValue(null);

			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope");

			expect(result.content).not.toContain('<div className="api-docs-toolbar">');
		});

		it("should include LLMS plugin section when enabled", async () => {
			vi.mocked(ApiParser.getSourceLink).mockReturnValue("https://github.com/user/repo/blob/main/src/enums.ts");
			const llmsPlugin: LlmsPluginOptions = {
				enabled: true,
				showCopyButton: true,
				showViewOptions: true,
				copyButtonText: "Copy",
				viewOptions: [],
			};

			const result = await generator.generate(
				mockApiEnum,
				"/api",
				"my-package",
				"enum",
				"test-scope",
				undefined,
				undefined,
				undefined,
				llmsPlugin,
			);

			expect(result.content).toContain('<div className="api-docs-toolbar-right">');
		});

		it("should not include LLMS plugin section when disabled", async () => {
			vi.mocked(ApiParser.getSourceLink).mockReturnValue("https://github.com/user/repo/blob/main/src/enums.ts");
			const llmsPlugin: LlmsPluginOptions = {
				enabled: false,
				showCopyButton: false,
				showViewOptions: false,
				copyButtonText: "",
				viewOptions: [],
			};

			const result = await generator.generate(
				mockApiEnum,
				"/api",
				"my-package",
				"enum",
				"test-scope",
				undefined,
				undefined,
				undefined,
				llmsPlugin,
			);

			expect(result.content).not.toContain('<div className="api-docs-toolbar-right">');
		});

		it("should include signature section with full enum skeleton", async () => {
			// Add members to the mock enum
			(mockApiEnum as unknown as { members: ApiEnumMember[] }).members = [
				{ displayName: "Active" } as ApiEnumMember,
				{ displayName: "Inactive" } as ApiEnumMember,
			];

			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope");

			expect(result.content).toContain("<ApiSignature");
			expect(result.content).toContain("enum Status {");
			expect(result.content).toContain("Active,");
			expect(result.content).toContain("Inactive");
		});

		it("should handle enum with no members", async () => {
			(mockApiEnum as unknown as { members: ApiEnumMember[] }).members = [];

			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope");

			// Should still show enum declaration even with no members
			expect(result.content).toContain("<ApiSignature");
			expect(result.content).toContain("enum Status {");
		});

		it("should include members table using EnumMembersTable component", async () => {
			// Mock getSummary to return different values for different calls
			let callCount = 0;
			vi.mocked(ApiParser.getSummary).mockImplementation((item: unknown) => {
				if (callCount === 0) {
					callCount++;
					return "Status enumeration";
				}
				const member = item as ApiEnumMember;
				return member.displayName === "Active" ? "The active state" : "The inactive state";
			});

			(mockApiEnum as unknown as { members: ApiEnumMember[] }).members = [
				{ displayName: "Active" } as ApiEnumMember,
				{ displayName: "Inactive" } as ApiEnumMember,
			];

			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope");

			// Members table should be adjacent to signature (no ## Members heading)
			expect(result.content).not.toContain("## Members");
			expect(result.content).toContain("<EnumMembersTable members={");
			expect(result.content).toContain('"name":"Active"');
			expect(result.content).toContain('"description":"The active state"');
			expect(result.content).toContain('"name":"Inactive"');
			expect(result.content).toContain('"description":"The inactive state"');
			// Signature should have hasMembers={true}
			expect(result.content).toContain("hasMembers={true}");
		});

		it("should handle members without descriptions", async () => {
			vi.mocked(ApiParser.getSummary).mockImplementation((item: unknown) => {
				// Return summary for enum, empty for members
				if ((item as ApiEnum).members) {
					return "Status enumeration";
				}
				return "";
			});

			(mockApiEnum as unknown as { members: ApiEnumMember[] }).members = [{ displayName: "Active" } as ApiEnumMember];

			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope");

			expect(result.content).toContain('"name":"Active"');
			expect(result.content).toContain('"description":""');
		});

		it("should not include members table when empty", async () => {
			(mockApiEnum as unknown as { members: ApiEnumMember[] }).members = [];

			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope");

			expect(result.content).not.toContain("<EnumMembersTable");
			// Signature should have hasMembers={false}
			expect(result.content).toContain("hasMembers={false}");
		});

		it("should include examples section", async () => {
			vi.mocked(ApiParser.getExamples).mockReturnValue([
				{ language: "typescript", code: "import { Status } from 'my-package';\nconst status = Status.Active;" },
				{ language: "typescript", code: "// Another example\nif (status === Status.Inactive) { }" },
			]);

			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope");

			expect(result.content).toContain("## Examples");
			expect(result.content).toContain("import { Status } from 'my-package';");
			expect(result.content).toContain("// Another example");
		});

		it("should not include examples section when empty", async () => {
			vi.mocked(ApiParser.getExamples).mockReturnValue([]);

			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope");

			expect(result.content).not.toContain("## Examples");
		});

		it("should include see also section", async () => {
			vi.mocked(ApiParser.getSeeReferences).mockReturnValue([
				{ text: "See {@link RelatedEnum}" },
				{ text: "See the enum documentation" },
			]);

			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope");

			expect(result.content).toContain("## See Also");
			expect(result.content).toContain("- See {@link RelatedEnum}");
			expect(result.content).toContain("- See the enum documentation");
		});

		it("should not include see also section when empty", async () => {
			vi.mocked(ApiParser.getSeeReferences).mockReturnValue([]);

			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope");

			expect(result.content).not.toContain("## See Also");
		});

		it("should use suppressExampleErrors parameter", async () => {
			vi.mocked(ApiParser.getExamples).mockReturnValue([{ language: "typescript", code: "example code" }]);

			await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope", undefined, undefined, false);

			const helpers = await import("../helpers.js");
			expect(helpers.prepareExampleCode).toHaveBeenCalledWith(
				{ language: "typescript", code: "example code" },
				"Status",
				"my-package",
				false,
			);
		});

		it("should default suppressExampleErrors to true", async () => {
			vi.mocked(ApiParser.getExamples).mockReturnValue([{ language: "typescript", code: "example code" }]);

			await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope");

			const helpers = await import("../helpers.js");
			expect(helpers.prepareExampleCode).toHaveBeenCalledWith(
				{ language: "typescript", code: "example code" },
				"Status",
				"my-package",
				true,
			);
		});

		it("should pass sourceConfig to getSourceLink", async () => {
			const sourceConfig: SourceConfig = {
				url: "https://github.com/user/repo",
				ref: "blob/main",
			};

			await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope", undefined, sourceConfig);

			expect(ApiParser.getSourceLink).toHaveBeenCalledWith(mockApiEnum, sourceConfig);
		});

		it("should generate correct route path with lowercase name", async () => {
			(mockApiEnum as { displayName: string }).displayName = "MySpecialStatus";

			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope");

			expect(result.routePath).toBe("/api/enum/myspecialstatus");
		});

		it("should handle different base routes", async () => {
			const result = await generator.generate(mockApiEnum, "/docs/api/v1", "my-package", "enum", "test-scope");

			expect(result.routePath).toBe("/docs/api/v1/enum/status");
		});

		it("should format complete page with all sections", async () => {
			vi.mocked(ApiParser.getSummary).mockReturnValue("An enum");
			vi.mocked(ApiParser.getReleaseTag).mockReturnValue("Alpha");
			vi.mocked(ApiParser.getDeprecation).mockReturnValue({ message: "Deprecated message" });
			vi.mocked(ApiParser.getSourceLink).mockReturnValue("https://github.com/user/repo/blob/main/src/enums.ts");
			vi.mocked(ApiParser.getExamples).mockReturnValue([{ language: "typescript", code: "example code" }]);
			vi.mocked(ApiParser.getSeeReferences).mockReturnValue([{ text: "See something" }]);
			(mockApiEnum as unknown as { members: ApiEnumMember[] }).members = [{ displayName: "Active" } as ApiEnumMember];

			const result = await generator.generate(mockApiEnum, "/api", "my-package", "enum", "test-scope", "API");

			expect(result.content).toContain('title: "Status | enum | API"');
			expect(result.content).toContain("# Status");
			expect(result.content).toContain("> ⚠️ **Deprecated:");
			expect(result.content).toContain("`Alpha`");
			expect(result.content).toContain("An enum");
			expect(result.content).toContain('<div className="api-docs-toolbar">');
			expect(result.content).toContain("<ApiSignature");
			expect(result.content).toContain("hasMembers={true}");
			expect(result.content).toContain("<EnumMembersTable");
			expect(result.content).toContain("## Examples");
			expect(result.content).toContain("## See Also");
		});
	});
});
