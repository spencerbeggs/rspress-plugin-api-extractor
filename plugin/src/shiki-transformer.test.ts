import type { Element, ElementContent, Root } from "hast";
import { beforeEach, describe, expect, it } from "vitest";
import { ShikiCrossLinker } from "./shiki-transformer.js";

/**
 * Build a HAST tree for testing.
 * Each inner array represents the child elements of a code line.
 */
function makeHast(...lines: ElementContent[][]): Root {
	return {
		type: "root",
		children: [
			{
				type: "element",
				tagName: "pre",
				properties: {},
				children: [
					{
						type: "element",
						tagName: "code",
						properties: {},
						children: lines.map((children) => ({
							type: "element" as const,
							tagName: "span" as const,
							properties: { class: "line" },
							children,
						})),
					},
				],
			},
		],
	};
}

/** Create a span element with a single text child */
function textSpan(text: string, props?: Record<string, string>): Element {
	return {
		type: "element",
		tagName: "span",
		properties: props || {},
		children: [{ type: "text", value: text }],
	};
}

/** Recursively find all anchor elements in a HAST tree */
function findAnchors(node: ElementContent | Root): Element[] {
	const anchors: Element[] = [];
	if (node.type === "element") {
		if (node.tagName === "a") anchors.push(node);
		for (const child of node.children) {
			anchors.push(...findAnchors(child));
		}
	}
	if (node.type === "root") {
		for (const child of node.children) {
			anchors.push(...findAnchors(child as ElementContent));
		}
	}
	return anchors;
}

/** Get text content recursively */
function getText(node: ElementContent | Root): string {
	if (node.type === "text") return node.value;
	if (node.type === "element" || node.type === "root") {
		return node.children.map((c) => getText(c as ElementContent)).join("");
	}
	return "";
}

describe("shiki-transformer", () => {
	let linker: ShikiCrossLinker;

	beforeEach(() => {
		const routes = new Map([
			["GitInfoData", "/api/interfaces/gitinfodata"],
			["ClaudeAccountInfo", "/api/classes/claudeaccountinfo"],
			["ShellResult", "/api/interfaces/shellresult"],
		]);
		const kinds = new Map([
			["GitInfoData", "Interface"],
			["ClaudeAccountInfo", "Class"],
			["ShellResult", "Interface"],
		]);
		linker = new ShikiCrossLinker(routes, kinds, "test-api");
	});

	describe("Phase 3: type reference cross-linking via transformHast", () => {
		it("should transform a span with matching text to a link", () => {
			const hast = makeHast([textSpan("GitInfoData")]);
			linker.transformHast(hast, "test-api");

			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/interfaces/gitinfodata");
			expect(anchors[0].properties?.class).toBe("api-type-link");
			expect(getText(anchors[0])).toBe("GitInfoData");
		});

		it("should split text at type reference boundaries preserving surrounding text", () => {
			const hast = makeHast([textSpan("options: GitInfoData")]);
			linker.transformHast(hast, "test-api");

			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/interfaces/gitinfodata");
			expect(getText(anchors[0])).toBe("GitInfoData");

			// Full line text preserved
			expect(getText(hast)).toContain("options: ");
			expect(getText(hast)).toContain("GitInfoData");
		});

		it("should link multiple type references in a single text node", () => {
			const hast = makeHast([textSpan("Map<GitInfoData, ShellResult>")]);
			linker.transformHast(hast, "test-api");

			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(2);
			expect(anchors[0].properties?.href).toBe("/api/interfaces/gitinfodata");
			expect(getText(anchors[0])).toBe("GitInfoData");
			expect(anchors[1].properties?.href).toBe("/api/interfaces/shellresult");
			expect(getText(anchors[1])).toBe("ShellResult");
		});

		it("should not transform text that doesn't match any API item", () => {
			const hast = makeHast([textSpan("UnknownType")]);
			const before = JSON.stringify(hast);
			linker.transformHast(hast, "test-api");
			expect(JSON.stringify(hast)).toBe(before);
		});

		it("should not transform whitespace-only text nodes", () => {
			const hast = makeHast([textSpan("   ")]);
			const before = JSON.stringify(hast);
			linker.transformHast(hast, "test-api");
			expect(JSON.stringify(hast)).toBe(before);
		});

		it("should handle text with leading whitespace matching API item", () => {
			// "word boundary" (\b) still matches at the boundary between space and letter
			const hast = makeHast([textSpan(" ShellResult")]);
			linker.transformHast(hast, "test-api");

			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/interfaces/shellresult");
			expect(getText(anchors[0])).toBe("ShellResult");

			// Leading space preserved in surrounding text
			expect(getText(hast)).toContain(" ShellResult");
		});

		it("should not double-process already processed spans", () => {
			const hast = makeHast([textSpan("GitInfoData", { "data-api-processed": "true" })]);
			linker.transformHast(hast, "test-api");

			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(0);
		});

		it("should not match dotted member names in Phase 3", () => {
			const routes = new Map([
				["Logger", "/api/classes/logger"],
				["Logger.log", "/api/classes/logger#log"],
			]);
			const kinds = new Map([
				["Logger", "Class"],
				["Logger.log", "Method"],
			]);
			const scopedLinker = new ShikiCrossLinker(routes, kinds, "test-api");

			// "log" alone should NOT be linked (dotted names filtered out)
			const hast = makeHast([textSpan("log")]);
			scopedLinker.transformHast(hast, "test-api");

			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(0);
		});

		it("should add api-type-link class for underline styling", () => {
			const hast = makeHast([textSpan("ClaudeAccountInfo")]);
			linker.transformHast(hast, "test-api");

			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			// Token colors are now handled by Shiki's theme CSS variables
			// Only api-type-link is needed for underline text decoration
			expect(anchors[0].properties?.class).toBe("api-type-link");
		});

		it("should link Twoslash hover spans in Phase 3a", () => {
			const twoslashSpan: Element = {
				type: "element",
				tagName: "span",
				properties: { class: "twoslash-hover" },
				children: [
					{
						type: "element",
						tagName: "span",
						properties: { class: "twoslash-popup-container" },
						children: [],
					},
					{ type: "text", value: "GitInfoData" },
				],
			};

			const hast = makeHast([twoslashSpan]);
			linker.transformHast(hast, "test-api");

			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/interfaces/gitinfodata");
			expect(getText(anchors[0])).toBe("GitInfoData");
		});

		it("should skip spans containing Twoslash elements in Phase 3b", () => {
			const outerSpan: Element = {
				type: "element",
				tagName: "span",
				properties: {},
				children: [
					{
						type: "element",
						tagName: "span",
						properties: { class: "twoslash-hover" },
						children: [
							{
								type: "element",
								tagName: "span",
								properties: { class: "twoslash-popup-container" },
								children: [],
							},
							{ type: "text", value: "GitInfoData" },
						],
					},
				],
			};

			const hast = makeHast([outerSpan]);
			linker.transformHast(hast, "test-api");

			// Phase 3a should link the inner twoslash-hover span
			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);

			// The outer span should NOT have data-api-processed from Phase 3b
			expect(outerSpan.properties?.["data-api-processed"]).toBeUndefined();
		});
	});

	describe("reinitialize", () => {
		it("should use new scope routes after reinitialize", () => {
			const routes = new Map([["NewType", "/api/types/newtype"]]);
			const kinds = new Map([["NewType", "TypeAlias"]]);
			linker.reinitialize(routes, kinds, "new-test-api");

			// Old route (test-api scope) should still work with explicit scope
			const oldHast = makeHast([textSpan("GitInfoData")]);
			linker.transformHast(oldHast, "test-api");
			expect(findAnchors(oldHast)).toHaveLength(1);

			// New route should work with the new scope
			const newHast = makeHast([textSpan("NewType")]);
			linker.transformHast(newHast, "new-test-api");
			const anchors = findAnchors(newHast);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/types/newtype");

			// Old type should NOT work under the new scope
			const crossHast = makeHast([textSpan("GitInfoData")]);
			linker.transformHast(crossHast, "new-test-api");
			expect(findAnchors(crossHast)).toHaveLength(0);
		});
	});

	describe("class method linking (Phase 1)", () => {
		it("should link method names within class declarations", async () => {
			const { codeToHast, createCssVariablesTheme } = await import("shiki");
			const routes = new Map([
				["ClaudeBinaryPlugin", "/api/classes/claudebinaryplugin"],
				["ClaudeBinaryPlugin.build", "/api/classes/claudebinaryplugin#build"],
				["ClaudeBinaryPlugin.create", "/api/classes/claudebinaryplugin#create"],
				["ClaudeBinaryPlugin.test", "/api/classes/claudebinaryplugin#test"],
				["GitInfo", "/api/classes/gitinfo"],
				["GitInfo.detect", "/api/classes/gitinfo#detect"],
			]);
			const kinds = new Map([
				["ClaudeBinaryPlugin", "Class"],
				["ClaudeBinaryPlugin.build", "Method"],
				["ClaudeBinaryPlugin.create", "Method"],
				["ClaudeBinaryPlugin.test", "Method"],
				["GitInfo", "Class"],
				["GitInfo.detect", "Method"],
			]);
			const methodLinker = new ShikiCrossLinker(routes, kinds, "test-api");

			const code = `class ClaudeBinaryPlugin {
    static build(x: any): void;
}`;

			const cssVariablesTheme = createCssVariablesTheme({
				name: "css-variables",
				variablePrefix: "--shiki-",
				variableDefaults: {},
				fontStyle: true,
			});

			const hast = await codeToHast(code, {
				lang: "typescript",
				theme: cssVariablesTheme,
			});

			methodLinker.transformHast(hast, "test-api");

			const anchors = findAnchors(hast);
			const buildLink = anchors.find((a) => a.properties?.href === "/api/classes/claudebinaryplugin#build");
			expect(buildLink).toBeDefined();
			if (buildLink) {
				expect(getText(buildLink)).toBe("build");
			}
		});

		it("should link all method names in class signatures", async () => {
			const { codeToHast, createCssVariablesTheme } = await import("shiki");
			const routes = new Map([
				["ClaudeBinaryPlugin", "/api/classes/claudebinaryplugin"],
				["ClaudeBinaryPlugin.build", "/api/classes/claudebinaryplugin#build"],
				["ClaudeBinaryPlugin.create", "/api/classes/claudebinaryplugin#create"],
				["ClaudeBinaryPlugin.test", "/api/classes/claudebinaryplugin#test"],
			]);
			const kinds = new Map([
				["ClaudeBinaryPlugin", "Class"],
				["ClaudeBinaryPlugin.build", "Method"],
				["ClaudeBinaryPlugin.create", "Method"],
				["ClaudeBinaryPlugin.test", "Method"],
			]);
			const methodLinker = new ShikiCrossLinker(routes, kinds, "test-api");

			const code = `class ClaudeBinaryPlugin {
    static build(plugin: ClaudeBinaryPlugin): Promise<PluginBuildResult>;
    static create(config: PluginConfig): ClaudeBinaryPlugin;
    test(): PluginTester;
}`;

			const cssVariablesTheme = createCssVariablesTheme({
				name: "css-variables",
				variablePrefix: "--shiki-",
				variableDefaults: {},
				fontStyle: true,
			});

			const hast = await codeToHast(code, {
				lang: "typescript",
				theme: cssVariablesTheme,
			});

			methodLinker.transformHast(hast, "test-api");

			const anchors = findAnchors(hast);
			const hrefs = anchors.map((a) => a.properties?.href);
			expect(hrefs).toContain("/api/classes/claudebinaryplugin#build");
			expect(hrefs).toContain("/api/classes/claudebinaryplugin#create");
			expect(hrefs).toContain("/api/classes/claudebinaryplugin#test");
		});

		it("should reset class context when reaching closing brace", async () => {
			const { codeToHast, createCssVariablesTheme } = await import("shiki");
			const routes = new Map([
				["ClaudeBinaryPlugin", "/api/classes/claudebinaryplugin"],
				["ClaudeBinaryPlugin.build", "/api/classes/claudebinaryplugin#build"],
			]);
			const kinds = new Map([
				["ClaudeBinaryPlugin", "Class"],
				["ClaudeBinaryPlugin.build", "Method"],
			]);
			const methodLinker = new ShikiCrossLinker(routes, kinds, "test-api");

			const code = `class ClaudeBinaryPlugin {
    static build(x: any): void;
}

// Call build outside the class - should NOT link this
const result = build();`;

			const cssVariablesTheme = createCssVariablesTheme({
				name: "css-variables",
				variablePrefix: "--shiki-",
				variableDefaults: {},
				fontStyle: true,
			});

			const hast = await codeToHast(code, {
				lang: "typescript",
				theme: cssVariablesTheme,
			});

			methodLinker.transformHast(hast, "test-api");

			// The method declaration inside the class should be linked
			// but "build" outside the class should NOT be (it's a dotted name, excluded from Phase 3)
			const anchors = findAnchors(hast);
			const buildMethodLinks = anchors.filter((a) => a.properties?.href === "/api/classes/claudebinaryplugin#build");
			expect(buildMethodLinks).toHaveLength(1);
		});
	});

	describe("namespace member cross-linking", () => {
		it("Phase 1: should link member names within namespace declarations", async () => {
			const { codeToHast, createCssVariablesTheme } = await import("shiki");
			const routes = new Map([
				["Formatters", "/api/namespace/formatters"],
				["Formatters.formatEntry", "/api/function/formatters.formatentry"],
				["Formatters.FormatOptions", "/api/interface/formatters.formatoptions"],
				["Formatters.Style", "/api/enum/formatters.style"],
			]);
			const kinds = new Map([
				["Formatters", "Namespace"],
				["Formatters.formatEntry", "Function"],
				["Formatters.FormatOptions", "Interface"],
				["Formatters.Style", "Enum"],
			]);
			const nsLinker = new ShikiCrossLinker(routes, kinds, "test-api");

			const code = `namespace Formatters {
    function formatEntry(entry: any): string;
    interface FormatOptions { }
    enum Style { }
}`;

			const cssVariablesTheme = createCssVariablesTheme({
				name: "css-variables",
				variablePrefix: "--shiki-",
				variableDefaults: {},
				fontStyle: true,
			});

			const hast = await codeToHast(code, {
				lang: "typescript",
				theme: cssVariablesTheme,
			});

			nsLinker.transformHast(hast, "test-api");

			const anchors = findAnchors(hast);
			const hrefs = anchors.map((a) => a.properties?.href);
			expect(hrefs).toContain("/api/function/formatters.formatentry");
			expect(hrefs).toContain("/api/interface/formatters.formatoptions");
			expect(hrefs).toContain("/api/enum/formatters.style");
		});

		it("Phase 1: should reset namespace context at closing brace", async () => {
			const { codeToHast, createCssVariablesTheme } = await import("shiki");
			const routes = new Map([
				["Formatters", "/api/namespace/formatters"],
				["Formatters.formatEntry", "/api/function/formatters.formatentry"],
			]);
			const kinds = new Map([
				["Formatters", "Namespace"],
				["Formatters.formatEntry", "Function"],
			]);
			const nsLinker = new ShikiCrossLinker(routes, kinds, "test-api");

			const code = `namespace Formatters {
    function formatEntry(entry: any): string;
}

// Outside namespace - should NOT link
const x = formatEntry();`;

			const cssVariablesTheme = createCssVariablesTheme({
				name: "css-variables",
				variablePrefix: "--shiki-",
				variableDefaults: {},
				fontStyle: true,
			});

			const hast = await codeToHast(code, {
				lang: "typescript",
				theme: cssVariablesTheme,
			});

			nsLinker.transformHast(hast, "test-api");

			const anchors = findAnchors(hast);
			const formatEntryLinks = anchors.filter((a) => a.properties?.href === "/api/function/formatters.formatentry");
			// Only the declaration inside namespace should be linked
			expect(formatEntryLinks).toHaveLength(1);
		});

		it("Phase 2: tooltip regex should match 'function Namespace.member(' pattern", () => {
			// Build a Twoslash hover span with tooltip text "function Formatters.formatEntry(…)"
			const twoslashSpan: Element = {
				type: "element",
				tagName: "span",
				properties: { class: "twoslash-hover" },
				children: [
					{
						type: "element",
						tagName: "span",
						properties: { class: "twoslash-popup-container" },
						children: [
							{
								type: "element",
								tagName: "code",
								properties: {},
								children: [{ type: "text", value: "function Formatters.formatEntry(entry: LogEntry): string" }],
							},
						],
					},
					{ type: "text", value: "formatEntry" },
				],
			};

			const routes = new Map([
				["Formatters", "/api/namespace/formatters"],
				["Formatters.formatEntry", "/api/function/formatters.formatentry"],
			]);
			const kinds = new Map([
				["Formatters", "Namespace"],
				["Formatters.formatEntry", "Function"],
			]);
			const nsLinker = new ShikiCrossLinker(routes, kinds, "test-api");

			const hast = makeHast([twoslashSpan]);
			nsLinker.transformHast(hast, "test-api");

			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/function/formatters.formatentry");
			expect(getText(anchors[0])).toBe("formatEntry");
		});

		it("Phase 2: tooltip regex should match 'interface Namespace.Type' pattern", () => {
			const twoslashSpan: Element = {
				type: "element",
				tagName: "span",
				properties: { class: "twoslash-hover" },
				children: [
					{
						type: "element",
						tagName: "span",
						properties: { class: "twoslash-popup-container" },
						children: [
							{
								type: "element",
								tagName: "code",
								properties: {},
								children: [{ type: "text", value: "interface Formatters.FormatOptions(" }],
							},
						],
					},
					{ type: "text", value: "FormatOptions" },
				],
			};

			const routes = new Map([
				["Formatters", "/api/namespace/formatters"],
				["Formatters.FormatOptions", "/api/interface/formatters.formatoptions"],
			]);
			const kinds = new Map([
				["Formatters", "Namespace"],
				["Formatters.FormatOptions", "Interface"],
			]);
			const nsLinker = new ShikiCrossLinker(routes, kinds, "test-api");

			const hast = makeHast([twoslashSpan]);
			nsLinker.transformHast(hast, "test-api");

			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/interface/formatters.formatoptions");
			expect(getText(anchors[0])).toBe("FormatOptions");
		});

		it("Phase 2: tooltip regex should match '(property) Namespace.prop:' pattern", () => {
			const twoslashSpan: Element = {
				type: "element",
				tagName: "span",
				properties: { class: "twoslash-hover" },
				children: [
					{
						type: "element",
						tagName: "span",
						properties: { class: "twoslash-popup-container" },
						children: [
							{
								type: "element",
								tagName: "code",
								properties: {},
								children: [{ type: "text", value: "(property) Formatters.Style:" }],
							},
						],
					},
					{ type: "text", value: "Style" },
				],
			};

			const routes = new Map([
				["Formatters", "/api/namespace/formatters"],
				["Formatters.Style", "/api/enum/formatters.style"],
			]);
			const kinds = new Map([
				["Formatters", "Namespace"],
				["Formatters.Style", "Enum"],
			]);
			const nsLinker = new ShikiCrossLinker(routes, kinds, "test-api");

			const hast = makeHast([twoslashSpan]);
			nsLinker.transformHast(hast, "test-api");

			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/enum/formatters.style");
			expect(getText(anchors[0])).toBe("Style");
		});

		it("Phase 2: existing class method tooltip should still work", () => {
			const twoslashSpan: Element = {
				type: "element",
				tagName: "span",
				properties: { class: "twoslash-hover" },
				children: [
					{
						type: "element",
						tagName: "span",
						properties: { class: "twoslash-popup-container" },
						children: [
							{
								type: "element",
								tagName: "code",
								properties: {},
								children: [{ type: "text", value: "Logger.addTransport(transport: Transport): void" }],
							},
						],
					},
					{ type: "text", value: "addTransport" },
				],
			};

			const routes = new Map([
				["Logger", "/api/classes/logger"],
				["Logger.addTransport", "/api/classes/logger#addtransport"],
			]);
			const kinds = new Map([
				["Logger", "Class"],
				["Logger.addTransport", "Method"],
			]);
			const existingLinker = new ShikiCrossLinker(routes, kinds, "test-api");

			const hast = makeHast([twoslashSpan]);
			existingLinker.transformHast(hast, "test-api");

			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/classes/logger#addtransport");
			expect(getText(anchors[0])).toBe("addTransport");
		});

		it("Phase 3: should link unqualified PascalCase namespace member types", () => {
			// Simulate Change 1: FormatOptions is registered as both qualified and unqualified
			const routes = new Map([
				["Formatters", "/api/namespace/formatters"],
				["Formatters.FormatOptions", "/api/interface/formatters.formatoptions"],
				["FormatOptions", "/api/interface/formatters.formatoptions"], // unqualified PascalCase
				["LogEntry", "/api/interface/logentry"],
			]);
			const kinds = new Map([
				["Formatters", "Namespace"],
				["Formatters.FormatOptions", "Interface"],
				["FormatOptions", "Interface"],
				["LogEntry", "Interface"],
			]);
			const nsLinker = new ShikiCrossLinker(routes, kinds, "test-api");

			const hast = makeHast([textSpan("options?: FormatOptions")]);
			nsLinker.transformHast(hast, "test-api");

			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/interface/formatters.formatoptions");
			expect(getText(anchors[0])).toBe("FormatOptions");
		});
	});
});
