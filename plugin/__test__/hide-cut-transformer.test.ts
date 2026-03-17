import type { Element, Text } from "hast";
import type { ShikiTransformerContext } from "shiki";
import { describe, expect, it } from "vitest";
import { HideCutLinesTransformer, MemberFormatTransformer } from "../src/hide-cut-transformer.js";

// Helper to create a span line with text content
function makeLine(text: string): Element {
	return {
		type: "element",
		tagName: "span",
		properties: {},
		children: [{ type: "text", value: text } as Text],
	};
}

// Helper to create a span line with nested element children (simulating syntax highlighting)
function makeHighlightedLine(text: string): Element {
	return {
		type: "element",
		tagName: "span",
		properties: {},
		children: [
			{
				type: "element",
				tagName: "span",
				properties: { className: "token" },
				children: [{ type: "text", value: text } as Text],
			},
		],
	};
}

// Helper to call transformer code method with mock context
const callMember = (node: Element): void => {
	MemberFormatTransformer.code?.call({} as unknown as ShikiTransformerContext, node);
};
const callHideCut = (node: Element): void => {
	HideCutLinesTransformer.code?.call({} as unknown as ShikiTransformerContext, node);
};

describe("HideCutLinesTransformer", () => {
	it("should have correct name", () => {
		expect(HideCutLinesTransformer.name).toBe("hide-cut-lines");
	});

	it("should hide all lines up to and including cut directive", () => {
		const node: Element = {
			type: "element",
			tagName: "code",
			properties: {},
			children: [
				makeLine('import { Foo } from "foo";'),
				makeLine('import { Bar } from "bar";'),
				makeLine("// ---cut---"),
				makeLine("class MyClass {"),
				makeLine("  method(): void;"),
				makeLine("}"),
			],
		};

		callHideCut(node);

		const lines = node.children.filter(
			(child): child is Element => child.type === "element" && child.tagName === "span",
		);
		// Lines 0, 1, 2 (imports + cut) should be hidden
		expect(lines[0].properties?.style).toBe("display: none;");
		expect(lines[1].properties?.style).toBe("display: none;");
		expect(lines[2].properties?.style).toBe("display: none;");
		// Lines after cut should be untouched
		expect(lines[3].properties?.style).toBeUndefined();
		expect(lines[4].properties?.style).toBeUndefined();
		expect(lines[5].properties?.style).toBeUndefined();
	});

	it("should not modify anything when no cut directive is present", () => {
		const node: Element = {
			type: "element",
			tagName: "code",
			properties: {},
			children: [makeLine("class MyClass {"), makeLine("  method(): void;"), makeLine("}")],
		};

		callHideCut(node);

		const lines = node.children.filter(
			(child): child is Element => child.type === "element" && child.tagName === "span",
		);
		expect(lines[0].properties?.style).toBeUndefined();
		expect(lines[1].properties?.style).toBeUndefined();
		expect(lines[2].properties?.style).toBeUndefined();
	});

	it("should handle cut directive as first line", () => {
		const node: Element = {
			type: "element",
			tagName: "code",
			properties: {},
			children: [makeLine("// ---cut---"), makeLine("visible content")],
		};

		callHideCut(node);

		const lines = node.children.filter(
			(child): child is Element => child.type === "element" && child.tagName === "span",
		);
		expect(lines[0].properties?.style).toBe("display: none;");
		expect(lines[1].properties?.style).toBeUndefined();
	});

	it("should detect cut directive in nested/highlighted elements", () => {
		const node: Element = {
			type: "element",
			tagName: "code",
			properties: {},
			children: [
				makeHighlightedLine('import { Foo } from "foo";'),
				makeHighlightedLine("// ---cut---"),
				makeHighlightedLine("visible content"),
			],
		};

		callHideCut(node);

		const lines = node.children.filter(
			(child): child is Element => child.type === "element" && child.tagName === "span",
		);
		expect(lines[0].properties?.style).toBe("display: none;");
		expect(lines[1].properties?.style).toBe("display: none;");
		expect(lines[2].properties?.style).toBeUndefined();
	});

	it("should handle empty children", () => {
		const node: Element = {
			type: "element",
			tagName: "code",
			properties: {},
			children: [],
		};

		expect(() => callHideCut(node)).not.toThrow();
	});
});

describe("MemberFormatTransformer with cut directives", () => {
	it("should hide imports, cut, and wrapper opening when cut directive present", () => {
		const node: Element = {
			type: "element",
			tagName: "code",
			properties: {},
			children: [
				makeLine('import { Foo } from "foo";'),
				makeLine("// ---cut---"),
				makeLine("class MyClass {"),
				makeLine("  method(): void;"),
				makeLine("}"),
			],
		};

		callMember(node);

		const lines = node.children.filter(
			(child): child is Element => child.type === "element" && child.tagName === "span",
		);
		// Lines 0 (import), 1 (cut), 2 (class opening) should be hidden
		expect(lines[0].properties?.style).toBe("display: none;");
		expect(lines[1].properties?.style).toBe("display: none;");
		expect(lines[2].properties?.style).toBe("display: none;");
		// Line 3 (member) should have padding removed
		expect(lines[3].properties?.style).toBe("padding-left: 0;");
		// Line 4 (closing brace) should be hidden
		expect(lines[4].properties?.style).toBe("display: none;");
	});

	it("should handle cut directive with multiple import lines", () => {
		const node: Element = {
			type: "element",
			tagName: "code",
			properties: {},
			children: [
				makeLine('import { A } from "a";'),
				makeLine('import { B } from "b";'),
				makeLine('import { C } from "c";'),
				makeLine("// ---cut---"),
				makeLine("interface IFoo {"),
				makeLine("  bar: string;"),
				makeLine("}"),
			],
		};

		callMember(node);

		const lines = node.children.filter(
			(child): child is Element => child.type === "element" && child.tagName === "span",
		);
		// Lines 0-3 (imports + cut) and 4 (interface opening) hidden
		expect(lines[0].properties?.style).toBe("display: none;");
		expect(lines[1].properties?.style).toBe("display: none;");
		expect(lines[2].properties?.style).toBe("display: none;");
		expect(lines[3].properties?.style).toBe("display: none;");
		expect(lines[4].properties?.style).toBe("display: none;");
		// Line 5 (member) should have padding removed
		expect(lines[5].properties?.style).toBe("padding-left: 0;");
		// Line 6 (closing brace) should be hidden
		expect(lines[6].properties?.style).toBe("display: none;");
	});

	it("should handle cut directive right before wrapper (no imports)", () => {
		const node: Element = {
			type: "element",
			tagName: "code",
			properties: {},
			children: [makeLine("// ---cut---"), makeLine("class MyClass {"), makeLine("  method(): void;"), makeLine("}")],
		};

		callMember(node);

		const lines = node.children.filter(
			(child): child is Element => child.type === "element" && child.tagName === "span",
		);
		// Lines 0 (cut) and 1 (class opening) hidden
		expect(lines[0].properties?.style).toBe("display: none;");
		expect(lines[1].properties?.style).toBe("display: none;");
		// Line 2 (member) should have padding removed
		expect(lines[2].properties?.style).toBe("padding-left: 0;");
		// Line 3 (closing brace) should be hidden
		expect(lines[3].properties?.style).toBe("display: none;");
	});
});
