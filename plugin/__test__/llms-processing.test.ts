import { describe, expect, it } from "vitest";
import type { PackageLlmsTxtInput, PackagePointer, PageContent } from "../src/llms-processing.js";
import {
	filterLlmsFullTxt,
	filterLlmsTxt,
	generatePackageLlmsFullTxt,
	generatePackageLlmsTxt,
	parseLlmsTxtLine,
} from "../src/llms-processing.js";

describe("parseLlmsTxtLine", () => {
	it("parses a standard link with description", () => {
		const line = "- [Getting Started](/guide/getting-started): Learn how to set up the project";
		const result = parseLlmsTxtLine(line);
		expect(result).toEqual({
			title: "Getting Started",
			url: "/guide/getting-started",
			description: "Learn how to set up the project",
		});
	});

	it("parses a link without description", () => {
		const line = "- [API Reference](/api/reference)";
		const result = parseLlmsTxtLine(line);
		expect(result).toEqual({
			title: "API Reference",
			url: "/api/reference",
			description: undefined,
		});
	});

	it("returns null for header lines", () => {
		expect(parseLlmsTxtLine("# Site Title")).toBeNull();
		expect(parseLlmsTxtLine("## Section Name")).toBeNull();
	});

	it("returns null for empty lines", () => {
		expect(parseLlmsTxtLine("")).toBeNull();
		expect(parseLlmsTxtLine("   ")).toBeNull();
	});

	it("returns null for plain text lines", () => {
		expect(parseLlmsTxtLine("Some random text")).toBeNull();
	});

	it("trims description whitespace", () => {
		const line = "- [Page](/path):   Extra whitespace  ";
		const result = parseLlmsTxtLine(line);
		expect(result).toEqual({
			title: "Page",
			url: "/path",
			description: "Extra whitespace",
		});
	});

	it("handles URLs with .md extension", () => {
		const line = "- [Page](/path/to/page.md): Description";
		const result = parseLlmsTxtLine(line);
		expect(result).toEqual({
			title: "Page",
			url: "/path/to/page.md",
			description: "Description",
		});
	});

	it("handles description with colons", () => {
		const line = "- [Config](/config): Options: timeout, retries, and more";
		const result = parseLlmsTxtLine(line);
		expect(result).toEqual({
			title: "Config",
			url: "/config",
			description: "Options: timeout, retries, and more",
		});
	});
});

describe("filterLlmsTxt", () => {
	const sampleContent = [
		"# My Site",
		"",
		"## Guide",
		"",
		"- [Getting Started](/guide/getting-started): Setup instructions",
		"- [Advanced](/guide/advanced): Advanced usage",
		"",
		"## API",
		"",
		"- [MyClass](/api/classes/myclass): MyClass reference",
		"- [MyFunction](/api/functions/myfunction): MyFunction reference",
		"",
	].join("\n");

	it("removes lines whose URL is in apiRoutes", () => {
		const apiRoutes = new Set(["/api/classes/myclass", "/api/functions/myfunction"]);
		const result = filterLlmsTxt(sampleContent, apiRoutes, []);
		expect(result).not.toContain("MyClass");
		expect(result).not.toContain("MyFunction");
		expect(result).toContain("Getting Started");
		expect(result).toContain("Advanced");
	});

	it("keeps lines whose URL is not in apiRoutes", () => {
		const apiRoutes = new Set(["/api/classes/myclass"]);
		const result = filterLlmsTxt(sampleContent, apiRoutes, []);
		expect(result).toContain("MyFunction");
		expect(result).toContain("Getting Started");
	});

	it("appends pointer lines when pointers array is non-empty", () => {
		const apiRoutes = new Set(["/api/classes/myclass", "/api/functions/myfunction"]);
		const pointers: PackagePointer[] = [{ name: "my-package", llmsTxtUrl: "/api/my-package/llms.txt" }];
		const result = filterLlmsTxt(sampleContent, apiRoutes, pointers);
		expect(result).toContain("- For my-package API docs, see [my-package llms.txt](/api/my-package/llms.txt)");
	});

	it("does not append pointers section when pointers array is empty", () => {
		const apiRoutes = new Set<string>();
		const result = filterLlmsTxt(sampleContent, apiRoutes, []);
		expect(result).not.toContain("For ");
		expect(result).not.toContain("API docs, see");
	});

	it("preserves headers and empty lines for non-filtered sections", () => {
		const apiRoutes = new Set<string>();
		const result = filterLlmsTxt(sampleContent, apiRoutes, []);
		expect(result).toContain("# My Site");
		expect(result).toContain("## Guide");
	});

	it("handles content with no matching API routes", () => {
		const apiRoutes = new Set(["/nonexistent/route"]);
		const result = filterLlmsTxt(sampleContent, apiRoutes, []);
		expect(result).toContain("MyClass");
		expect(result).toContain("MyFunction");
	});
});

describe("filterLlmsFullTxt", () => {
	const sampleFullContent = [
		"---",
		"url: /guide/getting-started",
		"---",
		"",
		"# Getting Started",
		"",
		"Setup instructions here.",
		"",
		"",
		"---",
		"url: /api/classes/myclass",
		"---",
		"",
		"# MyClass",
		"",
		"MyClass reference content.",
		"",
		"",
		"---",
		"url: /api/functions/myfunction",
		"---",
		"",
		"# MyFunction",
		"",
		"MyFunction reference content.",
	].join("\n");

	it("removes sections whose URL matches an API route", () => {
		const apiRoutes = new Set(["/api/classes/myclass", "/api/functions/myfunction"]);
		const result = filterLlmsFullTxt(sampleFullContent, apiRoutes);
		expect(result).not.toContain("MyClass");
		expect(result).not.toContain("MyFunction");
	});

	it("preserves sections whose URL does not match", () => {
		const apiRoutes = new Set(["/api/classes/myclass"]);
		const result = filterLlmsFullTxt(sampleFullContent, apiRoutes);
		expect(result).toContain("Getting Started");
		expect(result).toContain("MyFunction");
	});

	it("preserves frontmatter for remaining sections", () => {
		const apiRoutes = new Set(["/api/classes/myclass", "/api/functions/myfunction"]);
		const result = filterLlmsFullTxt(sampleFullContent, apiRoutes);
		expect(result).toContain("---\nurl: /guide/getting-started\n---");
	});

	it("handles multi-section content correctly", () => {
		const apiRoutes = new Set<string>();
		const result = filterLlmsFullTxt(sampleFullContent, apiRoutes);
		expect(result).toContain("Getting Started");
		expect(result).toContain("MyClass");
		expect(result).toContain("MyFunction");
	});

	it("handles empty input", () => {
		const result = filterLlmsFullTxt("", new Set<string>());
		expect(result).toBe("");
	});

	it("removes all sections when all match", () => {
		const apiRoutes = new Set(["/guide/getting-started", "/api/classes/myclass", "/api/functions/myfunction"]);
		const result = filterLlmsFullTxt(sampleFullContent, apiRoutes);
		expect(result.trim()).toBe("");
	});
});

describe("generatePackageLlmsTxt", () => {
	it("generates both guides and API sections", () => {
		const input: PackageLlmsTxtInput = {
			name: "My Package",
			packageName: "my-package",
			guidePages: [{ title: "Getting Started", url: "/api/my-package/guide/getting-started", description: "Setup" }],
			apiPages: [
				{ title: "MyClass", url: "/api/my-package/classes/myclass", description: "A class" },
				{ title: "MyFunction", url: "/api/my-package/functions/myfunction", description: undefined },
			],
		};
		const result = generatePackageLlmsTxt(input);
		expect(result).toContain("# My Package");
		expect(result).toContain("> API documentation for the my-package package");
		expect(result).toContain("## Guides");
		expect(result).toContain("- [Getting Started](/api/my-package/guide/getting-started): Setup");
		expect(result).toContain("## API Reference");
		expect(result).toContain("- [MyClass](/api/my-package/classes/myclass): A class");
		expect(result).toContain("- [MyFunction](/api/my-package/functions/myfunction)");
	});

	it("omits Guides section when guidePages is empty", () => {
		const input: PackageLlmsTxtInput = {
			name: "My Package",
			packageName: "my-package",
			guidePages: [],
			apiPages: [{ title: "MyClass", url: "/api/classes/myclass", description: "A class" }],
		};
		const result = generatePackageLlmsTxt(input);
		expect(result).toContain("# My Package");
		expect(result).toContain("> API documentation for the my-package package");
		expect(result).not.toContain("## Guides");
		expect(result).toContain("## API Reference");
	});

	it("omits API Reference section when apiPages is empty", () => {
		const input: PackageLlmsTxtInput = {
			name: "My Package",
			packageName: "my-package",
			guidePages: [{ title: "Intro", url: "/intro", description: "Introduction" }],
			apiPages: [],
		};
		const result = generatePackageLlmsTxt(input);
		expect(result).toContain("## Guides");
		expect(result).not.toContain("## API Reference");
	});

	it("formats entries without description correctly", () => {
		const input: PackageLlmsTxtInput = {
			name: "Pkg",
			packageName: "pkg",
			guidePages: [],
			apiPages: [{ title: "Func", url: "/api/func", description: undefined }],
		};
		const result = generatePackageLlmsTxt(input);
		expect(result).toContain("- [Func](/api/func)");
		expect(result).not.toContain("- [Func](/api/func):");
	});

	it("generates heading and description when both sections are empty", () => {
		const input: PackageLlmsTxtInput = {
			name: "Empty",
			packageName: "empty",
			guidePages: [],
			apiPages: [],
		};
		const result = generatePackageLlmsTxt(input);
		expect(result).toContain("# Empty");
		expect(result).toContain("> API documentation for the empty package");
		expect(result).not.toContain("## Guides");
		expect(result).not.toContain("## API Reference");
	});
});

describe("generatePackageLlmsFullTxt", () => {
	it("concatenates pages with frontmatter delimiters", () => {
		const pages: PageContent[] = [
			{ url: "/api/classes/myclass", content: "# MyClass\n\nMyClass content." },
			{ url: "/api/functions/myfunc", content: "# MyFunction\n\nMyFunction content." },
		];
		const result = generatePackageLlmsFullTxt(pages);
		expect(result).toContain("---\nurl: /api/classes/myclass\n---");
		expect(result).toContain("# MyClass\n\nMyClass content.");
		expect(result).toContain("---\nurl: /api/functions/myfunc\n---");
		expect(result).toContain("# MyFunction\n\nMyFunction content.");
	});

	it("handles empty array", () => {
		const result = generatePackageLlmsFullTxt([]);
		expect(result).toBe("");
	});

	it("handles single page", () => {
		const pages: PageContent[] = [{ url: "/page", content: "# Page\n\nContent." }];
		const result = generatePackageLlmsFullTxt(pages);
		expect(result).toContain("---\nurl: /page\n---");
		expect(result).toContain("# Page\n\nContent.");
	});

	it("separates sections with blank lines", () => {
		const pages: PageContent[] = [
			{ url: "/a", content: "Content A" },
			{ url: "/b", content: "Content B" },
		];
		const result = generatePackageLlmsFullTxt(pages);
		// Sections should be separated by double newlines
		const sections = result.split("\n\n\n---\nurl:");
		expect(sections.length).toBe(2);
	});
});
