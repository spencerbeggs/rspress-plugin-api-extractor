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

/**
 * Build a Twoslash hover span: an outer `span.twoslash-hover` containing a
 * `span.twoslash-popup-container` (with an optional tooltip `<code>`) followed
 * by the visible text node.
 */
function twoslashHover(tooltipText: string | null, visibleText: string): Element {
	const popupChildren: ElementContent[] =
		tooltipText === null
			? []
			: [
					{
						type: "element",
						tagName: "code",
						properties: {},
						children: [{ type: "text", value: tooltipText }],
					},
				];
	return {
		type: "element",
		tagName: "span",
		properties: { class: "twoslash-hover" },
		children: [
			{
				type: "element",
				tagName: "span",
				properties: { class: "twoslash-popup-container" },
				children: popupChildren,
			},
			{ type: "text", value: visibleText },
		],
	};
}

/** Build a line span (class "line") wrapping the given children. */
function lineSpan(...children: ElementContent[]): Element {
	return {
		type: "element",
		tagName: "span",
		properties: { class: "line" },
		children,
	};
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

	describe("constructor and scope accessors", () => {
		it("should construct without args and link nothing (no current scope)", () => {
			const empty = new ShikiCrossLinker();
			const hast = makeHast([textSpan("GitInfoData")]);
			empty.transformHast(hast);
			expect(findAnchors(hast)).toHaveLength(0);
		});

		it("should link nothing when transformHast is called with an unknown scope", () => {
			const hast = makeHast([textSpan("GitInfoData")]);
			linker.transformHast(hast, "does-not-exist");
			expect(findAnchors(hast)).toHaveLength(0);
		});

		it("should use currentApiScope when no explicit scope is given to transformHast", () => {
			// beforeEach constructed with scope "test-api" -> currentApiScope is "test-api"
			const hast = makeHast([textSpan("GitInfoData")]);
			linker.transformHast(hast);
			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/interfaces/gitinfodata");
		});

		it("setApiScope should change the scope used by transformRoot", () => {
			const routes = new Map([["NewType", "/api/types/newtype"]]);
			const kinds = new Map([["NewType", "TypeAlias"]]);
			linker.reinitialize(routes, kinds, "scope-b");

			// reinitialize set currentApiScope to scope-b; flip it back to test-api
			linker.setApiScope("test-api");
			const hast = makeHast([textSpan("GitInfoData")]);
			linker.transformRoot(hast);
			expect(findAnchors(hast)).toHaveLength(1);

			// now switch to scope-b and confirm only its routes resolve
			linker.setApiScope("scope-b");
			const hastB = makeHast([textSpan("NewType")]);
			linker.transformRoot(hastB);
			const anchors = findAnchors(hastB);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/types/newtype");
		});
	});

	describe("createTransformer (deprecated no-op)", () => {
		it("should return a no-op transformer with the expected name", () => {
			const transformer = linker.createTransformer();
			expect(transformer.name).toBe("api-docs-cross-linker");
			// no hooks attached
			expect(transformer.code).toBeUndefined();
			expect(transformer.span).toBeUndefined();
		});

		it("should accept an apiScope argument for API compatibility", () => {
			const transformer = linker.createTransformer("some-scope");
			expect(transformer.name).toBe("api-docs-cross-linker");
		});
	});

	describe("transformHast structural early-returns", () => {
		it("should return the root unchanged when there is no <pre> element", () => {
			const root: Root = { type: "root", children: [] };
			const result = linker.transformHast(root, "test-api");
			expect(result).toBe(root);
			expect(findAnchors(root)).toHaveLength(0);
		});

		it("should return the root unchanged when <pre> has no <code> element", () => {
			const root: Root = {
				type: "root",
				children: [
					{
						type: "element",
						tagName: "pre",
						properties: {},
						children: [{ type: "text", value: "no code here" }],
					},
				],
			};
			const result = linker.transformHast(root, "test-api");
			expect(result).toBe(root);
			expect(findAnchors(root)).toHaveLength(0);
		});

		it("should skip non-span line children inside <code>", () => {
			const root: Root = {
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
								children: [{ type: "text", value: "leading text" }, lineSpan(textSpan("GitInfoData"))],
							},
						],
					},
				],
			};
			linker.transformHast(root, "test-api");
			// the span line should still be processed
			expect(findAnchors(root)).toHaveLength(1);
		});
	});

	describe("Phase 1 member linking via hand-built HAST", () => {
		function memberLinker(): ShikiCrossLinker {
			const routes = new Map([
				["Logger", "/api/classes/logger"],
				["Logger.addTransport", "/api/classes/logger#addtransport"],
				["Logger.flush", "/api/classes/logger#flush"],
			]);
			const kinds = new Map([
				["Logger", "Class"],
				["Logger.addTransport", "Method"],
				["Logger.flush", "Method"],
			]);
			return new ShikiCrossLinker(routes, kinds, "test-api");
		}

		it("should link a member inside a class body (scope push then match)", () => {
			const link = memberLinker();
			const hast = makeHast([textSpan("class Logger {")], [textSpan("addTransport")], [textSpan("}")]);
			link.transformHast(hast, "test-api");

			const anchors = findAnchors(hast);
			const memberLink = anchors.find((a) => a.properties?.href === "/api/classes/logger#addtransport");
			expect(memberLink).toBeDefined();
			expect(getText(memberLink as Element)).toBe("addTransport");
		});

		it("should link multiple distinct members within one scope", () => {
			const link = memberLinker();
			const hast = makeHast(
				[textSpan("class Logger {")],
				[textSpan("addTransport")],
				[textSpan("flush")],
				[textSpan("}")],
			);
			link.transformHast(hast, "test-api");

			const hrefs = findAnchors(hast).map((a) => a.properties?.href);
			expect(hrefs).toContain("/api/classes/logger#addtransport");
			expect(hrefs).toContain("/api/classes/logger#flush");
		});

		it("should preserve leading/trailing whitespace around a linked member", () => {
			const link = memberLinker();
			const hast = makeHast([textSpan("class Logger {")], [textSpan("  addTransport  ")], [textSpan("}")]);
			link.transformHast(hast, "test-api");

			const anchors = findAnchors(hast);
			const memberLink = anchors.find((a) => a.properties?.href === "/api/classes/logger#addtransport");
			expect(memberLink).toBeDefined();
			// whitespace preserved as sibling text nodes within the same span
			expect(getText(hast)).toContain("  addTransport  ");
		});

		it("should NOT link a member after the class scope is popped by a closing brace", () => {
			const link = memberLinker();
			const hast = makeHast(
				[textSpan("class Logger {")],
				[textSpan("addTransport")],
				[textSpan("}")],
				[textSpan("addTransport")],
			);
			link.transformHast(hast, "test-api");

			const memberLinks = findAnchors(hast).filter((a) => a.properties?.href === "/api/classes/logger#addtransport");
			// only the in-body declaration is linked
			expect(memberLinks).toHaveLength(1);
		});

		it("should handle nested scopes (namespace containing a class)", () => {
			const routes = new Map([
				["Outer", "/api/namespace/outer"],
				["Outer.outerFn", "/api/function/outer.outerfn"],
				["Inner.innerMethod", "/api/classes/inner#innermethod"],
			]);
			const kinds = new Map([
				["Outer", "Namespace"],
				["Outer.outerFn", "Function"],
				["Inner.innerMethod", "Method"],
			]);
			const link = new ShikiCrossLinker(routes, kinds, "test-api");

			const hast = makeHast(
				[textSpan("namespace Outer {")],
				[textSpan("class Inner {")],
				[textSpan("innerMethod")],
				[textSpan("}")],
				[textSpan("outerFn")],
				[textSpan("}")],
			);
			link.transformHast(hast, "test-api");

			const hrefs = findAnchors(hast).map((a) => a.properties?.href);
			expect(hrefs).toContain("/api/classes/inner#innermethod");
			expect(hrefs).toContain("/api/function/outer.outerfn");
		});

		it("should not push a scope when the declaration opens and closes on one line", () => {
			const link = memberLinker();
			// braces balanced on the line -> no scope pushed -> member on next line not linked
			const hast = makeHast([textSpan("class Logger {}")], [textSpan("addTransport")]);
			link.transformHast(hast, "test-api");

			const memberLinks = findAnchors(hast).filter((a) => a.properties?.href === "/api/classes/logger#addtransport");
			expect(memberLinks).toHaveLength(0);
		});

		it("should skip member spans that have more than one child", () => {
			const link = memberLinker();
			const multiChildSpan: Element = {
				type: "element",
				tagName: "span",
				properties: {},
				children: [
					{ type: "text", value: "addTransport" },
					{ type: "text", value: "extra" },
				],
			};
			const hast = makeHast([textSpan("class Logger {")], [multiChildSpan], [textSpan("}")]);
			link.transformHast(hast, "test-api");
			// not linked (span had 2 children, Phase 1 requires exactly 1)
			const memberLinks = findAnchors(hast).filter((a) => a.properties?.href === "/api/classes/logger#addtransport");
			expect(memberLinks).toHaveLength(0);
		});

		it("should skip whitespace-only member spans inside a class scope", () => {
			const link = memberLinker();
			const hast = makeHast([textSpan("class Logger {")], [textSpan("   ")], [textSpan("}")]);
			link.transformHast(hast, "test-api");
			expect(findAnchors(hast).filter((a) => a.properties?.href?.toString().includes("#"))).toHaveLength(0);
		});

		it("should not link a member name that has no route entry", () => {
			const link = memberLinker();
			const hast = makeHast([textSpan("class Logger {")], [textSpan("unknownMember")], [textSpan("}")]);
			link.transformHast(hast, "test-api");
			const memberLinks = findAnchors(hast).filter((a) => a.properties?.href?.toString().includes("logger#"));
			expect(memberLinks).toHaveLength(0);
		});
	});

	describe("Phase 2 tooltip declaration forms", () => {
		function makeNs(): ShikiCrossLinker {
			const routes = new Map([
				["Box", "/api/namespace/box"],
				["Box.make", "/api/function/box.make"],
				["Box.Options", "/api/interface/box.options"],
				["Box.Color", "/api/enum/box.color"],
				["Box.Alias", "/api/type/box.alias"],
				["Box.Inner", "/api/namespace/box.inner"],
				["Box.value", "/api/variable/box.value"],
			]);
			const kinds = new Map([
				["Box", "Namespace"],
				["Box.make", "Function"],
				["Box.Options", "Interface"],
				["Box.Color", "Enum"],
				["Box.Alias", "TypeAlias"],
				["Box.Inner", "Namespace"],
				["Box.value", "Variable"],
			]);
			return new ShikiCrossLinker(routes, kinds, "test-api");
		}

		const cases: Array<{ name: string; tooltip: string; visible: string; href: string }> = [
			{ name: "class", tooltip: "class Box.Options(", visible: "Options", href: "/api/interface/box.options" },
			{ name: "enum", tooltip: "enum Box.Color(", visible: "Color", href: "/api/enum/box.color" },
			{ name: "type", tooltip: "type Box.Alias(", visible: "Alias", href: "/api/type/box.alias" },
			{ name: "namespace", tooltip: "namespace Box.Inner(", visible: "Inner", href: "/api/namespace/box.inner" },
			{ name: "const", tooltip: "const Box.value:", visible: "value", href: "/api/variable/box.value" },
			{ name: "let", tooltip: "let Box.value:", visible: "value", href: "/api/variable/box.value" },
			{ name: "var", tooltip: "var Box.value:", visible: "value", href: "/api/variable/box.value" },
			{ name: "no-prefix method", tooltip: "Box.make(", visible: "make", href: "/api/function/box.make" },
		];

		for (const c of cases) {
			it(`should match the '${c.name}' tooltip declaration form`, () => {
				const ns = makeNs();
				const hast = makeHast([twoslashHover(c.tooltip, c.visible)]);
				ns.transformHast(hast, "test-api");
				const anchors = findAnchors(hast);
				expect(anchors).toHaveLength(1);
				expect(anchors[0].properties?.href).toBe(c.href);
				expect(getText(anchors[0])).toBe(c.visible);
			});
		}

		it("should not link a tooltip that does not match the declaration regex", () => {
			const ns = makeNs();
			// lowercase class name -> [A-Z] anchor fails
			const hast = makeHast([twoslashHover("function box.make(", "make")]);
			ns.transformHast(hast, "test-api");
			expect(findAnchors(hast)).toHaveLength(0);
		});

		it("should not link a tooltip whose member has no route", () => {
			const ns = makeNs();
			const hast = makeHast([twoslashHover("function Box.unknown(", "unknown")]);
			ns.transformHast(hast, "test-api");
			expect(findAnchors(hast)).toHaveLength(0);
		});

		it("should skip a twoslash span with no popup container code (Phase 2 no tooltip)", () => {
			const ns = makeNs();
			// tooltipText null -> empty popup container -> extractMethodInfo returns null
			const hast = makeHast([twoslashHover(null, "Box")]);
			ns.transformHast(hast, "test-api");
			// Phase 3a still links "Box" (top-level) since visible text matches
			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/namespace/box");
		});

		it("should skip an already-processed twoslash span in Phase 2", () => {
			const ns = makeNs();
			const span = twoslashHover("function Box.make(", "make");
			span.properties = { ...span.properties, "data-api-processed": "true" };
			const hast = makeHast([span]);
			ns.transformHast(hast, "test-api");
			expect(findAnchors(hast)).toHaveLength(0);
		});
	});

	describe("Phase 3 edge cases", () => {
		it("should match the longest type name first when names overlap", () => {
			const routes = new Map([
				["Hook", "/api/interfaces/hook"],
				["HookEvent", "/api/interfaces/hookevent"],
			]);
			const kinds = new Map([
				["Hook", "Interface"],
				["HookEvent", "Interface"],
			]);
			const link = new ShikiCrossLinker(routes, kinds, "test-api");

			const hast = makeHast([textSpan("handler: HookEvent")]);
			link.transformHast(hast, "test-api");
			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/interfaces/hookevent");
			expect(getText(anchors[0])).toBe("HookEvent");
		});

		it("should leave a Phase 3a twoslash span unlinked when the visible text has no route", () => {
			const hast = makeHast([twoslashHover(null, "NotAType")]);
			linker.transformHast(hast, "test-api");
			expect(findAnchors(hast)).toHaveLength(0);
		});

		it("should link references appearing in multiple separate spans on one line", () => {
			const hast = makeHast([textSpan("a: "), textSpan("GitInfoData"), textSpan(", b: "), textSpan("ShellResult")]);
			linker.transformHast(hast, "test-api");
			const hrefs = findAnchors(hast).map((a) => a.properties?.href);
			expect(hrefs).toContain("/api/interfaces/gitinfodata");
			expect(hrefs).toContain("/api/interfaces/shellresult");
		});

		it("should preserve non-text children inside a span while linking text", () => {
			const spanWithMixedChildren: Element = {
				type: "element",
				tagName: "span",
				properties: {},
				children: [
					{ type: "element", tagName: "br", properties: {}, children: [] },
					{ type: "text", value: "GitInfoData" },
				],
			};
			const hast = makeHast([spanWithMixedChildren]);
			linker.transformHast(hast, "test-api");
			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			// the <br> is preserved
			expect(spanWithMixedChildren.children.some((c) => c.type === "element" && c.tagName === "br")).toBe(true);
		});
	});

	describe("transformRoot (uses current scope) mirrors transformHast", () => {
		beforeEach(() => {
			linker.setApiScope("test-api");
		});

		it("should link a top-level type reference", () => {
			const hast = makeHast([textSpan("GitInfoData")]);
			linker.transformRoot(hast);
			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/interfaces/gitinfodata");
		});

		it("should return root unchanged when no <pre> element exists", () => {
			const root: Root = { type: "root", children: [] };
			expect(linker.transformRoot(root)).toBe(root);
		});

		it("should return root unchanged when <pre> has no <code>", () => {
			const root: Root = {
				type: "root",
				children: [{ type: "element", tagName: "pre", properties: {}, children: [] }],
			};
			expect(linker.transformRoot(root)).toBe(root);
		});

		it("should link a class member through scope tracking", () => {
			const routes = new Map([
				["Logger", "/api/classes/logger"],
				["Logger.flush", "/api/classes/logger#flush"],
			]);
			const kinds = new Map([
				["Logger", "Class"],
				["Logger.flush", "Method"],
			]);
			const link = new ShikiCrossLinker(routes, kinds, "scope-r");
			link.setApiScope("scope-r");
			const hast = makeHast([textSpan("class Logger {")], [textSpan("flush")], [textSpan("}")]);
			link.transformRoot(hast);
			const memberLink = findAnchors(hast).find((a) => a.properties?.href === "/api/classes/logger#flush");
			expect(memberLink).toBeDefined();
		});

		it("should link a Phase 2 tooltip method through current scope", () => {
			const routes = new Map([
				["Logger", "/api/classes/logger"],
				["Logger.addTransport", "/api/classes/logger#addtransport"],
			]);
			const kinds = new Map([
				["Logger", "Class"],
				["Logger.addTransport", "Method"],
			]);
			const link = new ShikiCrossLinker(routes, kinds, "scope-r2");
			link.setApiScope("scope-r2");
			const hast = makeHast([twoslashHover("Logger.addTransport(transport: T): void", "addTransport")]);
			link.transformRoot(hast);
			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/classes/logger#addtransport");
		});

		it("should link a Phase 3a twoslash hover span through current scope", () => {
			const hast = makeHast([twoslashHover(null, "GitInfoData")]);
			linker.transformRoot(hast);
			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/interfaces/gitinfodata");
		});

		it("should link nothing when current scope is empty", () => {
			const empty = new ShikiCrossLinker();
			const hast = makeHast([textSpan("GitInfoData")]);
			empty.transformRoot(hast);
			expect(findAnchors(hast)).toHaveLength(0);
		});
	});

	describe("transformSpan", () => {
		it("should link a plain text span matching a type", () => {
			const span = textSpan("GitInfoData");
			linker.transformSpan(span, 0, 0);
			const anchors = findAnchors(span);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/interfaces/gitinfodata");
			expect(anchors[0].properties?.class).toBe("api-type-link rp-link");
		});

		it("should preserve surrounding whitespace when linking a text span", () => {
			const span = textSpan(" GitInfoData ");
			linker.transformSpan(span, 0, 0);
			expect(getText(span)).toBe(" GitInfoData ");
			expect(findAnchors(span)).toHaveLength(1);
		});

		it("should do nothing for an unknown type", () => {
			const span = textSpan("Unknown");
			const before = JSON.stringify(span);
			linker.transformSpan(span, 0, 0);
			expect(JSON.stringify(span)).toBe(before);
		});

		it("should skip spans already marked data-api-processed", () => {
			const span = textSpan("GitInfoData", { "data-api-processed": "true" });
			linker.transformSpan(span, 0, 0);
			expect(findAnchors(span)).toHaveLength(0);
		});

		it("should skip a span whose first child is already an anchor", () => {
			const span: Element = {
				type: "element",
				tagName: "span",
				properties: {},
				children: [
					{
						type: "element",
						tagName: "a",
						properties: { href: "/x" },
						children: [{ type: "text", value: "GitInfoData" }],
					},
				],
			};
			linker.transformSpan(span, 0, 0);
			// still just the original anchor, not re-wrapped
			expect(findAnchors(span)).toHaveLength(1);
			expect(findAnchors(span)[0].properties?.href).toBe("/x");
		});

		it("should skip whitespace-only text spans", () => {
			const span = textSpan("   ");
			const before = JSON.stringify(span);
			linker.transformSpan(span, 0, 0);
			expect(JSON.stringify(span)).toBe(before);
		});

		it("should link a type inside a twoslash-hover first child", () => {
			const span: Element = {
				type: "element",
				tagName: "span",
				properties: {},
				children: [twoslashHover(null, "GitInfoData")],
			};
			linker.transformSpan(span, 0, 0);
			const anchors = findAnchors(span);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/interfaces/gitinfodata");
			expect(span.properties?.["data-api-processed"]).toBe("true");
		});

		it("should not mark a twoslash-hover span processed when the type has no route", () => {
			const span: Element = {
				type: "element",
				tagName: "span",
				properties: {},
				children: [twoslashHover(null, "Unknown")],
			};
			linker.transformSpan(span, 0, 0);
			expect(findAnchors(span)).toHaveLength(0);
			expect(span.properties?.["data-api-processed"]).toBeUndefined();
		});

		it("should return without linking when twoslash-hover text is whitespace only", () => {
			const span: Element = {
				type: "element",
				tagName: "span",
				properties: {},
				children: [twoslashHover(null, "   ")],
			};
			linker.transformSpan(span, 0, 0);
			expect(findAnchors(span)).toHaveLength(0);
		});

		it("should do nothing when the first child is a non-text, non-anchor, non-twoslash element", () => {
			const span: Element = {
				type: "element",
				tagName: "span",
				properties: {},
				children: [
					{ type: "element", tagName: "em", properties: {}, children: [{ type: "text", value: "GitInfoData" }] },
				],
			};
			const before = JSON.stringify(span);
			linker.transformSpan(span, 0, 0);
			expect(JSON.stringify(span)).toBe(before);
		});
	});

	describe("transformLine (Class.method patterns)", () => {
		function methodLinker(): ShikiCrossLinker {
			const routes = new Map([
				["GitInfo", "/api/classes/gitinfo"],
				["GitInfo.detect", "/api/classes/gitinfo#detect"],
				["GitInfo.detectAll", "/api/classes/gitinfo#detectall"],
			]);
			const kinds = new Map([
				["GitInfo", "Class"],
				["GitInfo.detect", "Method"],
				["GitInfo.detectAll", "Method"],
			]);
			const link = new ShikiCrossLinker(routes, kinds, "test-api");
			link.setApiScope("test-api");
			return link;
		}

		it("should link Class . method when the dot is in its own span", () => {
			const link = methodLinker();
			const line = lineSpan(textSpan("GitInfo"), textSpan("."), textSpan("detect"));
			link.transformLine(line);
			const anchors = findAnchors(line);
			const memberLink = anchors.find((a) => a.properties?.href === "/api/classes/gitinfo#detect");
			expect(memberLink).toBeDefined();
			expect(getText(memberLink as Element)).toBe("detect");
		});

		it("should link Class .method when dot and method share a span", () => {
			const link = methodLinker();
			const line = lineSpan(textSpan("GitInfo"), textSpan(".detect"));
			link.transformLine(line);
			const memberLink = findAnchors(line).find((a) => a.properties?.href === "/api/classes/gitinfo#detect");
			expect(memberLink).toBeDefined();
		});

		it("should link a method whose name is the longest matching member prefix", () => {
			const link = methodLinker();
			// methodText "detectAll" should match member "detectAll" (longest-first) not "detect"
			const line = lineSpan(textSpan("GitInfo"), textSpan(".detectAll"));
			link.transformLine(line);
			const memberLink = findAnchors(line).find((a) => a.properties?.href === "/api/classes/gitinfo#detectall");
			expect(memberLink).toBeDefined();
		});

		it("should link a method inside a twoslash-hover method span", () => {
			const link = methodLinker();
			const line = lineSpan(textSpan("GitInfo"), textSpan("."), twoslashHover(null, "detect"));
			link.transformLine(line);
			const memberLink = findAnchors(line).find((a) => a.properties?.href === "/api/classes/gitinfo#detect");
			expect(memberLink).toBeDefined();
		});

		it("should do nothing when there are no children", () => {
			const line: Element = { type: "element", tagName: "span", properties: {}, children: [] };
			expect(() => link0().transformLine(line)).not.toThrow();
			expect(findAnchors(line)).toHaveLength(0);
		});

		it("should skip an already-processed class span", () => {
			const link = methodLinker();
			const classSpan = textSpan("GitInfo", { "data-api-processed": "true" });
			const line = lineSpan(classSpan, textSpan("."), textSpan("detect"));
			link.transformLine(line);
			expect(findAnchors(line)).toHaveLength(0);
		});

		it("should skip when the first token is not a known class with members", () => {
			const link = methodLinker();
			const line = lineSpan(textSpan("Unknown"), textSpan("."), textSpan("detect"));
			link.transformLine(line);
			expect(findAnchors(line)).toHaveLength(0);
		});

		it("should skip when there is no next sibling span after the class", () => {
			const link = methodLinker();
			const line = lineSpan(textSpan("GitInfo"));
			link.transformLine(line);
			expect(findAnchors(line)).toHaveLength(0);
		});

		it("should skip when the next span does not start with a dot", () => {
			const link = methodLinker();
			const line = lineSpan(textSpan("GitInfo"), textSpan("foo"));
			link.transformLine(line);
			expect(findAnchors(line)).toHaveLength(0);
		});

		it("should skip when the method name is not a known member", () => {
			const link = methodLinker();
			const line = lineSpan(textSpan("GitInfo"), textSpan("."), textSpan("nope"));
			link.transformLine(line);
			expect(findAnchors(line)).toHaveLength(0);
		});

		it("should skip when the dot span is the last span (no method span follows)", () => {
			const link = methodLinker();
			const line = lineSpan(textSpan("GitInfo"), textSpan("."));
			link.transformLine(line);
			expect(findAnchors(line)).toHaveLength(0);
		});

		it("should resolve the class token when it is already wrapped in an anchor", () => {
			const link = methodLinker();
			const classSpan: Element = {
				type: "element",
				tagName: "span",
				properties: {},
				children: [
					{
						type: "element",
						tagName: "a",
						properties: { href: "/api/classes/gitinfo" },
						children: [{ type: "text", value: "GitInfo" }],
					},
				],
			};
			const line = lineSpan(classSpan, textSpan(".detect"));
			link.transformLine(line);
			const memberLink = findAnchors(line).find((a) => a.properties?.href === "/api/classes/gitinfo#detect");
			expect(memberLink).toBeDefined();
		});
	});

	describe("remaining branch coverage", () => {
		it("should use an empty route map when the current scope has no registered routes", () => {
			// scope set but never reinitialized -> getRoutesForCurrentScope hits the `|| new Map()` path
			linker.setApiScope("ghost-scope");
			const hast = makeHast([textSpan("GitInfoData")]);
			linker.transformRoot(hast);
			expect(findAnchors(hast)).toHaveLength(0);
		});

		it("should link a member that has a route but no kind entry (transformHast)", () => {
			const routes = new Map([
				["Logger", "/api/classes/logger"],
				["Logger.flush", "/api/classes/logger#flush"],
			]);
			const kinds = new Map([["Logger", "Class"]]); // no kind for the member
			const link = new ShikiCrossLinker(routes, kinds, "k");
			const hast = makeHast([textSpan("class Logger {")], [textSpan("flush")], [textSpan("}")]);
			link.transformHast(hast, "k");
			expect(findAnchors(hast).find((a) => a.properties?.href === "/api/classes/logger#flush")).toBeDefined();
		});

		it("should link a member with no kind entry through transformRoot", () => {
			const routes = new Map([
				["Logger", "/api/classes/logger"],
				["Logger.flush", "/api/classes/logger#flush"],
			]);
			const kinds = new Map([["Logger", "Class"]]);
			const link = new ShikiCrossLinker(routes, kinds, "k2");
			link.setApiScope("k2");
			const hast = makeHast([textSpan("class Logger {")], [textSpan("flush")], [textSpan("}")]);
			link.transformRoot(hast);
			expect(findAnchors(hast).find((a) => a.properties?.href === "/api/classes/logger#flush")).toBeDefined();
		});

		function memberFixture(): ShikiCrossLinker {
			const routes = new Map([
				["Logger", "/api/classes/logger"],
				["Logger.flush", "/api/classes/logger#flush"],
			]);
			const kinds = new Map([
				["Logger", "Class"],
				["Logger.flush", "Method"],
			]);
			return new ShikiCrossLinker(routes, kinds, "mf");
		}

		// A line whose children include a raw text node alongside the member span
		const rawTextChild: ElementContent = { type: "text", value: "  " };
		// A member span whose single child is an element (not a text node)
		const elementChildSpan: Element = {
			type: "element",
			tagName: "span",
			properties: {},
			children: [{ type: "element", tagName: "em", properties: {}, children: [{ type: "text", value: "flush" }] }],
		};

		it("should skip non-span and non-text member children in Phase 1 (transformHast)", () => {
			const link = memberFixture();
			const hast = makeHast(
				[textSpan("class Logger {")],
				[rawTextChild, elementChildSpan, textSpan("flush")],
				[textSpan("}")],
			);
			link.transformHast(hast, "mf");
			// the real member span still links; the raw-text and element-child spans are skipped
			expect(findAnchors(hast).filter((a) => a.properties?.href === "/api/classes/logger#flush")).toHaveLength(1);
		});

		it("should skip non-span and non-text member children in Phase 1 (transformRoot)", () => {
			const link = memberFixture();
			link.setApiScope("mf");
			const hast = makeHast(
				[textSpan("class Logger {")],
				[rawTextChild, elementChildSpan, textSpan("flush")],
				[textSpan("}")],
			);
			link.transformRoot(hast);
			expect(findAnchors(hast).filter((a) => a.properties?.href === "/api/classes/logger#flush")).toHaveLength(1);
		});

		// A twoslash-hover span whose tooltip matches Phase 2 but has no visible text node
		function tooltipOnlyHover(tooltip: string): Element {
			return {
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
								children: [{ type: "text", value: tooltip }],
							},
						],
					},
				],
			};
		}

		function boxLinker(scope: string): ShikiCrossLinker {
			const routes = new Map([
				["Box", "/api/namespace/box"],
				["Box.make", "/api/function/box.make"],
			]);
			const kinds = new Map([
				["Box", "Namespace"],
				["Box.make", "Function"],
			]);
			return new ShikiCrossLinker(routes, kinds, scope);
		}

		it("should skip a Phase 2 tooltip match when there is no visible text to link (transformHast)", () => {
			const link = boxLinker("p2a");
			const hast = makeHast([tooltipOnlyHover("function Box.make(")]);
			link.transformHast(hast, "p2a");
			expect(findAnchors(hast)).toHaveLength(0);
		});

		it("should skip a Phase 2 tooltip match when there is no visible text to link (transformRoot)", () => {
			const link = boxLinker("p2b");
			link.setApiScope("p2b");
			const hast = makeHast([tooltipOnlyHover("function Box.make(")]);
			link.transformRoot(hast);
			expect(findAnchors(hast)).toHaveLength(0);
		});

		// A twoslash-hover with neither a tooltip nor visible text -> Phase 3a extractText is null
		function emptyHover(): Element {
			return {
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
				],
			};
		}

		it("should skip Phase 3a twoslash spans with no extractable text (transformHast)", () => {
			const hast = makeHast([emptyHover()]);
			linker.transformHast(hast, "test-api");
			expect(findAnchors(hast)).toHaveLength(0);
		});

		it("should skip Phase 3a twoslash spans with no extractable text (transformRoot)", () => {
			linker.setApiScope("test-api");
			const hast = makeHast([emptyHover()]);
			linker.transformRoot(hast);
			expect(findAnchors(hast)).toHaveLength(0);
		});

		it("should match a Phase 2 tooltip whose code contains nested elements", () => {
			const link = boxLinker("nested");
			const nestedTooltip: Element = {
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
								children: [
									{
										type: "element",
										tagName: "span",
										properties: {},
										children: [{ type: "text", value: "function Box.make(" }],
									},
								],
							},
						],
					},
					{ type: "text", value: "make" },
				],
			};
			const hast = makeHast([nestedTooltip]);
			link.transformHast(hast, "nested");
			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/function/box.make");
		});

		it("should return null method info when a twoslash-hover span has no popup container", () => {
			// Phase 2 extractMethodInfo hits the missing-popup-container branch; nothing links
			const noPopup: Element = {
				type: "element",
				tagName: "span",
				properties: { class: "twoslash-hover" },
				children: [{ type: "text", value: "unmatched" }],
			};
			const hast = makeHast([noPopup]);
			linker.transformHast(hast, "test-api");
			expect(findAnchors(hast)).toHaveLength(0);
		});

		it("should link a type reference even when its kind is unknown (Phase 3b)", () => {
			const routes = new Map([["Solo", "/api/types/solo"]]);
			const kinds = new Map<string, string>(); // no kind entry
			const link = new ShikiCrossLinker(routes, kinds, "solo");
			const hast = makeHast([textSpan("x: Solo")]);
			link.transformHast(hast, "solo");
			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			expect(anchors[0].properties?.href).toBe("/api/types/solo");
		});

		it("should link a Phase 3a twoslash type reference with unknown kind", () => {
			const routes = new Map([["Solo", "/api/types/solo"]]);
			const kinds = new Map<string, string>();
			const link = new ShikiCrossLinker(routes, kinds, "solo2");
			const hast = makeHast([twoslashHover(null, "Solo")]);
			link.transformHast(hast, "solo2");
			expect(findAnchors(hast)[0]?.properties?.href).toBe("/api/types/solo");
		});

		it("should skip raw text nodes when linking type references within a line (Phase 3b)", () => {
			// a line span containing a bare text node alongside a real span
			const rawText: ElementContent = { type: "text", value: " plain " };
			const hast = makeHast([rawText, textSpan("GitInfoData")]);
			linker.transformHast(hast, "test-api");
			const anchors = findAnchors(hast);
			expect(anchors).toHaveLength(1);
			expect(getText(hast)).toContain(" plain ");
		});
	});

	describe("transformSpan twoslash text edge cases", () => {
		it("should return without linking when a twoslash-hover first child has no extractable text", () => {
			const span: Element = {
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
						],
					},
				],
			};
			linker.transformSpan(span, 0, 0);
			expect(findAnchors(span)).toHaveLength(0);
			expect(span.properties?.["data-api-processed"]).toBeUndefined();
		});

		it("should link a twoslash-hover type with unknown kind via transformSpan", () => {
			const routes = new Map([["Solo", "/api/types/solo"]]);
			const kinds = new Map<string, string>();
			const link = new ShikiCrossLinker(routes, kinds, "solo3");
			link.setApiScope("solo3");
			const span: Element = {
				type: "element",
				tagName: "span",
				properties: {},
				children: [twoslashHover(null, "Solo")],
			};
			link.transformSpan(span, 0, 0);
			expect(findAnchors(span)[0]?.properties?.href).toBe("/api/types/solo");
		});

		it("should link a plain text type with unknown kind via transformSpan", () => {
			const routes = new Map([["Solo", "/api/types/solo"]]);
			const kinds = new Map<string, string>();
			const link = new ShikiCrossLinker(routes, kinds, "solo4");
			link.setApiScope("solo4");
			const span = textSpan("Solo");
			link.transformSpan(span, 0, 0);
			expect(findAnchors(span)[0]?.properties?.href).toBe("/api/types/solo");
		});
	});

	describe("transformRoot duplicate-branch coverage", () => {
		it("should skip a non-span top-level line child", () => {
			const root: Root = {
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
								children: [{ type: "text", value: "raw" }, lineSpan(textSpan("GitInfoData"))],
							},
						],
					},
				],
			};
			linker.setApiScope("test-api");
			linker.transformRoot(root);
			expect(findAnchors(root)).toHaveLength(1);
		});

		it("should handle whitespace, multi-child, non-span and spaced members in one scope", () => {
			const routes = new Map([
				["Logger", "/api/classes/logger"],
				["Logger.flush", "/api/classes/logger#flush"],
			]);
			const kinds = new Map([
				["Logger", "Class"],
				["Logger.flush", "Method"],
			]);
			const link = new ShikiCrossLinker(routes, kinds, "rdup");
			link.setApiScope("rdup");

			const multiChild: Element = {
				type: "element",
				tagName: "span",
				properties: {},
				children: [
					{ type: "text", value: "a" },
					{ type: "text", value: "b" },
				],
			};
			const nonSpanEl: Element = {
				type: "element",
				tagName: "em",
				properties: {},
				children: [{ type: "text", value: "x" }],
			};

			const hast = makeHast(
				[textSpan("class Logger {")],
				[nonSpanEl, textSpan("   "), multiChild, textSpan("  flush  ")],
				[textSpan("}")],
			);
			link.transformRoot(hast);
			const memberLinks = findAnchors(hast).filter((a) => a.properties?.href === "/api/classes/logger#flush");
			expect(memberLinks).toHaveLength(1);
			// surrounding whitespace preserved
			expect(getText(hast)).toContain("  flush  ");
		});

		it("should skip already-processed twoslash spans in transformRoot Phase 2", () => {
			const routes = new Map([
				["Box", "/api/namespace/box"],
				["Box.make", "/api/function/box.make"],
			]);
			const kinds = new Map([
				["Box", "Namespace"],
				["Box.make", "Function"],
			]);
			const link = new ShikiCrossLinker(routes, kinds, "rp2");
			link.setApiScope("rp2");
			const span = twoslashHover("function Box.make(", "make");
			span.properties = { ...span.properties, "data-api-processed": "true" };
			const hast = makeHast([span]);
			link.transformRoot(hast);
			expect(findAnchors(hast)).toHaveLength(0);
		});

		it("should skip a transformRoot Phase 2 tooltip whose member has no route", () => {
			const routes = new Map([["Box", "/api/namespace/box"]]);
			const kinds = new Map([["Box", "Namespace"]]);
			const link = new ShikiCrossLinker(routes, kinds, "rp3");
			link.setApiScope("rp3");
			const hast = makeHast([twoslashHover("function Box.gone(", "gone")]);
			link.transformRoot(hast);
			expect(findAnchors(hast)).toHaveLength(0);
		});

		it("should skip non-span line children during transformRoot Phase 3b", () => {
			linker.setApiScope("test-api");
			const rawText: ElementContent = { type: "text", value: " plain " };
			const hast = makeHast([rawText, textSpan("GitInfoData")]);
			linker.transformRoot(hast);
			expect(findAnchors(hast)).toHaveLength(1);
		});

		it("should link a Phase 2 tooltip member with no kind via transformHast and transformRoot", () => {
			const routes = new Map([
				["Box", "/api/namespace/box"],
				["Box.make", "/api/function/box.make"],
			]);
			const kinds = new Map([["Box", "Namespace"]]); // no kind for Box.make
			const linkH = new ShikiCrossLinker(routes, kinds, "nk1");
			const hastH = makeHast([twoslashHover("function Box.make(", "make")]);
			linkH.transformHast(hastH, "nk1");
			expect(findAnchors(hastH)[0]?.properties?.href).toBe("/api/function/box.make");

			const linkR = new ShikiCrossLinker(routes, kinds, "nk2");
			linkR.setApiScope("nk2");
			const hastR = makeHast([twoslashHover("function Box.make(", "make")]);
			linkR.transformRoot(hastR);
			expect(findAnchors(hastR)[0]?.properties?.href).toBe("/api/function/box.make");
		});
	});

	describe("transformLine additional branches", () => {
		function methodLinker(scope: string): ShikiCrossLinker {
			const routes = new Map([
				["GitInfo", "/api/classes/gitinfo"],
				["GitInfo.detect", "/api/classes/gitinfo#detect"],
			]);
			const kinds = new Map([
				["GitInfo", "Class"],
				["GitInfo.detect", "Method"],
			]);
			const link = new ShikiCrossLinker(routes, kinds, scope);
			link.setApiScope(scope);
			return link;
		}

		it("should return early when node has no children property", () => {
			const link = methodLinker("tl0");
			const line = { type: "element", tagName: "span", properties: {} } as unknown as Element;
			expect(() => link.transformLine(line)).not.toThrow();
		});

		it("should skip non-span children while scanning a line", () => {
			const link = methodLinker("tl1");
			const rawText: ElementContent = { type: "text", value: "noise" };
			const line = lineSpan(rawText, textSpan("GitInfo"), textSpan("."), textSpan("detect"));
			link.transformLine(line);
			expect(findAnchors(line).find((a) => a.properties?.href === "/api/classes/gitinfo#detect")).toBeDefined();
		});

		it("should skip a class span that yields no extractable text", () => {
			const link = methodLinker("tl2");
			const emptyMulti: Element = {
				type: "element",
				tagName: "span",
				properties: {},
				children: [
					{ type: "text", value: "a" },
					{ type: "text", value: "b" },
				],
			};
			const line = lineSpan(emptyMulti, textSpan("."), textSpan("detect"));
			link.transformLine(line);
			expect(findAnchors(line)).toHaveLength(0);
		});

		it("should skip when the next sibling yields no extractable text", () => {
			const link = methodLinker("tl3");
			const emptyNext: Element = {
				type: "element",
				tagName: "span",
				properties: {},
				children: [
					{ type: "text", value: "a" },
					{ type: "text", value: "b" },
				],
			};
			const line = lineSpan(textSpan("GitInfo"), emptyNext);
			link.transformLine(line);
			expect(findAnchors(line)).toHaveLength(0);
		});

		it("should link a method with no kind entry and preserve trailing whitespace", () => {
			const routes = new Map([
				["GitInfo", "/api/classes/gitinfo"],
				["GitInfo.detect", "/api/classes/gitinfo#detect"],
			]);
			const kinds = new Map([["GitInfo", "Class"]]); // no kind for the method
			const link = new ShikiCrossLinker(routes, kinds, "tl4");
			link.setApiScope("tl4");
			// dot in its own span; method span text has trailing whitespace
			const line = lineSpan(textSpan("GitInfo"), textSpan("."), textSpan("detect  "));
			link.transformLine(line);
			const memberLink = findAnchors(line).find((a) => a.properties?.href === "/api/classes/gitinfo#detect");
			expect(memberLink).toBeDefined();
			expect(getText(memberLink as Element)).toBe("detect");
		});
	});
});

/** A linker with no routes, for transformLine no-op coverage. */
function link0(): ShikiCrossLinker {
	const l = new ShikiCrossLinker(new Map(), new Map(), "empty");
	l.setApiScope("empty");
	return l;
}
