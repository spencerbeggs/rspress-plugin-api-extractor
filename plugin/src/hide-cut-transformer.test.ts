import type { Element } from "hast";
import type { ShikiTransformerContext } from "shiki";
import { describe, expect, it } from "vitest";
import { MemberFormatTransformer } from "./hide-cut-transformer.js";

// Helper to call transformer code method with mock context
const callCode = (node: Element): void => {
	// biome-ignore lint/suspicious/noExplicitAny: Test mock context
	MemberFormatTransformer.code?.call({} as any as ShikiTransformerContext, node);
};

describe("MemberFormatTransformer", () => {
	it("should have correct name", () => {
		expect(MemberFormatTransformer.name).toBe("member-format");
	});

	it("should hide first and last lines for 3-line blocks", () => {
		const node: Element = {
			type: "element",
			tagName: "code",
			properties: {},
			children: [
				{ type: "element", tagName: "span", properties: {}, children: [] },
				{ type: "element", tagName: "span", properties: {}, children: [] },
				{ type: "element", tagName: "span", properties: {}, children: [] },
			],
		};

		callCode(node);

		const lines = node.children as Element[];
		expect(lines[0].properties?.style).toBe("display: none;");
		expect(lines[1].properties?.style).toBe("padding-left: 0;");
		expect(lines[2].properties?.style).toBe("display: none;");
	});

	it("should set padding-left to 0 on middle line", () => {
		const node: Element = {
			type: "element",
			tagName: "code",
			properties: {},
			children: [
				{ type: "element", tagName: "span", properties: {}, children: [] },
				{ type: "element", tagName: "span", properties: {}, children: [] },
				{ type: "element", tagName: "span", properties: {}, children: [] },
			],
		};

		callCode(node);

		const lines = node.children as Element[];
		expect(lines[1].properties?.style).toBe("padding-left: 0;");
	});

	it("should not modify blocks with fewer than 3 lines", () => {
		const node: Element = {
			type: "element",
			tagName: "code",
			properties: {},
			children: [
				{ type: "element", tagName: "span", properties: {}, children: [] },
				{ type: "element", tagName: "span", properties: {}, children: [] },
			],
		};

		callCode(node);

		const lines = node.children as Element[];
		expect(lines[0].properties?.style).toBeUndefined();
		expect(lines[1].properties?.style).toBeUndefined();
	});

	it("should hide first and last lines for blocks with more than 3 lines", () => {
		const node: Element = {
			type: "element",
			tagName: "code",
			properties: {},
			children: [
				{ type: "element", tagName: "span", properties: {}, children: [] },
				{ type: "element", tagName: "span", properties: {}, children: [] },
				{ type: "element", tagName: "span", properties: {}, children: [] },
				{ type: "element", tagName: "span", properties: {}, children: [] },
			],
		};

		callCode(node);

		const lines = node.children as Element[];
		// First line should be hidden
		expect(lines[0].properties?.style).toBe("display: none;");
		// Second line should have no padding
		expect(lines[1].properties?.style).toBe("padding-left: 0;");
		// Middle lines should not be modified
		expect(lines[2].properties?.style).toBeUndefined();
		// Last line should be hidden
		expect(lines[3].properties?.style).toBe("display: none;");
	});

	it("should preserve existing properties when adding styles", () => {
		const node: Element = {
			type: "element",
			tagName: "code",
			properties: {},
			children: [
				{ type: "element", tagName: "span", properties: { className: "line-1" }, children: [] },
				{ type: "element", tagName: "span", properties: { className: "line-2" }, children: [] },
				{ type: "element", tagName: "span", properties: { className: "line-3" }, children: [] },
			],
		};

		callCode(node);

		const lines = node.children as Element[];
		expect(lines[0].properties?.className).toBe("line-1");
		expect(lines[0].properties?.style).toBe("display: none;");
		expect(lines[1].properties?.className).toBe("line-2");
		expect(lines[1].properties?.style).toBe("padding-left: 0;");
		expect(lines[2].properties?.className).toBe("line-3");
		expect(lines[2].properties?.style).toBe("display: none;");
	});

	it("should initialize properties object if not present", () => {
		const node: Element = {
			type: "element",
			tagName: "code",
			properties: {},
			children: [
				{ type: "element", tagName: "span", properties: {}, children: [] },
				{ type: "element", tagName: "span", properties: {}, children: [] },
				{ type: "element", tagName: "span", properties: {}, children: [] },
			],
		};

		callCode(node);

		const lines = node.children as Element[];
		expect(lines[0].properties).toBeDefined();
		expect(lines[1].properties).toBeDefined();
		expect(lines[2].properties).toBeDefined();
	});

	it("should filter out non-element children", () => {
		const node: Element = {
			type: "element",
			tagName: "code",
			properties: {},
			children: [
				{ type: "text", value: "text node" },
				{ type: "element", tagName: "span", properties: {}, children: [] },
				{ type: "element", tagName: "span", properties: {}, children: [] },
				{ type: "element", tagName: "span", properties: {}, children: [] },
				{ type: "text", value: "another text node" },
			],
		};

		callCode(node);

		// Should only process the 3 span elements
		const spans = node.children.filter(
			(child): child is Element => child.type === "element" && child.tagName === "span",
		);

		expect(spans.length).toBe(3);
		expect(spans[0].properties?.style).toBe("display: none;");
		expect(spans[1].properties?.style).toBe("padding-left: 0;");
		expect(spans[2].properties?.style).toBe("display: none;");
	});

	it("should filter out non-span elements", () => {
		const node: Element = {
			type: "element",
			tagName: "code",
			properties: {},
			children: [
				{ type: "element", tagName: "div", properties: {}, children: [] },
				{ type: "element", tagName: "span", properties: {}, children: [] },
				{ type: "element", tagName: "span", properties: {}, children: [] },
				{ type: "element", tagName: "span", properties: {}, children: [] },
			],
		};

		callCode(node);

		// Should only process the 3 span elements
		const spans = node.children.filter(
			(child): child is Element => child.type === "element" && child.tagName === "span",
		);

		expect(spans.length).toBe(3);
		expect(spans[0].properties?.style).toBe("display: none;");
	});

	it("should handle empty children array", () => {
		const node: Element = {
			type: "element",
			tagName: "code",
			properties: {},
			children: [],
		};

		// Should not throw
		expect(() => callCode(node)).not.toThrow();
	});

	it("should handle node with no span children", () => {
		const node: Element = {
			type: "element",
			tagName: "code",
			properties: {},
			children: [
				{ type: "text", value: "text only" },
				{ type: "element", tagName: "div", properties: {}, children: [] },
			],
		};

		// Should not throw
		expect(() => callCode(node)).not.toThrow();
	});
});
