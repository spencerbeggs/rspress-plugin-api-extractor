import type { Excerpt, ExcerptToken } from "@microsoft/api-extractor-model";
import { describe, expect, it } from "vitest";
import { TypeSignatureFormatter } from "./formatter.js";

// Helper to create mock Excerpt
function createExcerpt(text: string, tokens?: ExcerptToken[]): Excerpt {
	return {
		text,
		spannedTokens: tokens || [],
		tokenRange: { startIndex: 0, endIndex: tokens?.length || 0 },
	} as unknown as Excerpt;
}

// Helper to create mock ExcerptToken
function createToken(text: string, kind: string = "Content"): ExcerptToken {
	return {
		text,
		kind,
	} as ExcerptToken;
}

describe("TypeSignatureFormatter", () => {
	describe("Constructor", () => {
		it("should use default values", () => {
			const formatter = new TypeSignatureFormatter();
			const excerpt = createExcerpt("type Foo = string");

			expect(formatter.format(excerpt)).toBe("type Foo = string");
		});

		it("should accept custom max line length", () => {
			const formatter = new TypeSignatureFormatter(40);
			const tokens = [
				createToken("type"),
				createToken("VeryLongTypeName"),
				createToken("="),
				createToken("string"),
				createToken("|"),
				createToken("number"),
				createToken("|"),
				createToken("boolean"),
			];
			const excerpt = createExcerpt("", tokens);

			const result = formatter.format(excerpt);
			// Should break at union operators when line exceeds 40 chars
			expect(result.includes("\n")).toBe(true);
		});

		it("should accept custom indent", () => {
			const formatter = new TypeSignatureFormatter(20, "    ");
			const tokens = [createToken("type Foo = string"), createToken("|"), createToken("number")];
			const excerpt = createExcerpt("", tokens);

			const result = formatter.format(excerpt);
			if (result.includes("\n")) {
				expect(result.includes("    ")).toBe(true);
			}
		});
	});

	describe("stripExportDeclare", () => {
		it("should remove export keyword", () => {
			const formatter = new TypeSignatureFormatter();
			const excerpt = createExcerpt("export type Foo = string");

			expect(formatter.format(excerpt)).toBe("type Foo = string");
		});

		it("should remove declare keyword", () => {
			const formatter = new TypeSignatureFormatter();
			const excerpt = createExcerpt("declare type Foo = string");

			expect(formatter.format(excerpt)).toBe("type Foo = string");
		});

		it("should remove export declare combination", () => {
			const formatter = new TypeSignatureFormatter();
			const excerpt = createExcerpt("export declare type Foo = string");

			expect(formatter.format(excerpt)).toBe("type Foo = string");
		});

		it("should handle export declare with varying whitespace", () => {
			const formatter = new TypeSignatureFormatter();
			const excerpt = createExcerpt("export  declare  type Foo = string");

			const result = formatter.format(excerpt);
			expect(result.startsWith("type ")).toBe(true);
		});

		it("should strip from first token when using spanned tokens", () => {
			const formatter = new TypeSignatureFormatter();
			const tokens = [createToken("export interface"), createToken("Foo"), createToken("{ }")];
			const excerpt = createExcerpt("", tokens);

			const result = formatter.format(excerpt);
			expect(result.replace(/\s+/g, " ")).toContain("interface Foo { }".replace(/\s+/g, " "));
		});

		it("should not remove export from middle of text", () => {
			const formatter = new TypeSignatureFormatter();
			const excerpt = createExcerpt("type Foo = { export: boolean }");

			const result = formatter.format(excerpt);
			expect(result).toContain("export:");
		});
	});

	describe("format - Simple Types", () => {
		it("should format simple type alias", () => {
			const formatter = new TypeSignatureFormatter();
			const tokens = [createToken("type"), createToken("Foo"), createToken("="), createToken("string")];
			const excerpt = createExcerpt("", tokens);

			expect(formatter.format(excerpt)).toBe("type Foo = string");
		});

		it("should format interface", () => {
			const formatter = new TypeSignatureFormatter();
			const tokens = [
				createToken("interface"),
				createToken("User"),
				createToken("{"),
				createToken("name"),
				createToken(":"),
				createToken("string"),
				createToken("}"),
			];
			const excerpt = createExcerpt("", tokens);

			const result = formatter.format(excerpt);
			expect(result).toContain("interface User");
			expect(result).toContain("name: string");
		});

		it("should handle empty tokens", () => {
			const formatter = new TypeSignatureFormatter();
			const tokens = [
				createToken("type"),
				createToken(""),
				createToken("Foo"),
				createToken("="),
				createToken("number"),
			];
			const excerpt = createExcerpt("", tokens);

			expect(formatter.format(excerpt)).toBe("type Foo = number");
		});

		it("should handle whitespace-only tokens", () => {
			const formatter = new TypeSignatureFormatter();
			const tokens = [
				createToken("type"),
				createToken("  "),
				createToken("Bar"),
				createToken("="),
				createToken("boolean"),
			];
			const excerpt = createExcerpt("", tokens);

			expect(formatter.format(excerpt)).toBe("type Bar = boolean");
		});
	});

	describe("format - Union and Intersection Types", () => {
		it("should format short union types on one line", () => {
			const formatter = new TypeSignatureFormatter();
			const tokens = [
				createToken("type"),
				createToken("ID"),
				createToken("="),
				createToken("string"),
				createToken("|"),
				createToken("number"),
			];
			const excerpt = createExcerpt("", tokens);

			const result = formatter.format(excerpt);
			expect(result.replace(/\s+/g, " ")).toContain("type ID = string | number".replace(/\s+/g, " "));
		});

		it("should break long union types across multiple lines", () => {
			const formatter = new TypeSignatureFormatter(40);
			const tokens = [
				createToken("type"),
				createToken("VeryLongTypeName"),
				createToken("="),
				createToken("VeryLongType1"),
				createToken("|"),
				createToken("VeryLongType2"),
				createToken("|"),
				createToken("VeryLongType3"),
			];
			const excerpt = createExcerpt("", tokens);

			const result = formatter.format(excerpt);
			expect(result.includes("\n")).toBe(true);
		});

		it("should not break union types inside nested structures", () => {
			const formatter = new TypeSignatureFormatter(40);
			const tokens = [
				createToken("type"),
				createToken("Foo"),
				createToken("="),
				createToken("{"),
				createToken("a"),
				createToken(":"),
				createToken("string"),
				createToken("|"),
				createToken("number"),
				createToken("}"),
			];
			const excerpt = createExcerpt("", tokens);

			const result = formatter.format(excerpt);
			// Union inside braces should not trigger line break
			expect(result.split("\n").length).toBeLessThan(3);
		});

		it("should format intersection types", () => {
			const formatter = new TypeSignatureFormatter();
			const tokens = [
				createToken("type"),
				createToken("Combined"),
				createToken("="),
				createToken("A"),
				createToken("&"),
				createToken("B"),
			];
			const excerpt = createExcerpt("", tokens);

			expect(formatter.format(excerpt)).toBe("type Combined = A & B");
		});

		it("should break long intersection types", () => {
			const formatter = new TypeSignatureFormatter(40);
			const tokens = [
				createToken("type"),
				createToken("VeryLongIntersection"),
				createToken("="),
				createToken("TypeA"),
				createToken("&"),
				createToken("TypeB"),
				createToken("&"),
				createToken("TypeC"),
			];
			const excerpt = createExcerpt("", tokens);

			const result = formatter.format(excerpt);
			expect(result.includes("\n")).toBe(true);
		});
	});

	describe("format - Bracket Tracking", () => {
		it("should track curly brace depth", () => {
			const formatter = new TypeSignatureFormatter();
			const tokens = [
				createToken("type"),
				createToken("Obj"),
				createToken("="),
				createToken("{"),
				createToken("nested"),
				createToken(":"),
				createToken("{"),
				createToken("value"),
				createToken(":"),
				createToken("string"),
				createToken("}"),
				createToken("}"),
			];
			const excerpt = createExcerpt("", tokens);

			const result = formatter.format(excerpt);
			expect(result).toContain("nested: { value: string }");
		});

		it("should track square bracket depth", () => {
			const formatter = new TypeSignatureFormatter();
			const tokens = [
				createToken("type"),
				createToken("Arr"),
				createToken("="),
				createToken("["),
				createToken("string"),
				createToken(","),
				createToken("number"),
				createToken("]"),
			];
			const excerpt = createExcerpt("", tokens);

			const result = formatter.format(excerpt);
			expect(result.replace(/\s+/g, " ")).toContain("type Arr = [string, number]".replace(/\s+/g, " "));
		});

		it("should track parenthesis depth", () => {
			const formatter = new TypeSignatureFormatter();
			const tokens = [
				createToken("type"),
				createToken("Fn"),
				createToken("="),
				createToken("("),
				createToken("x"),
				createToken(":"),
				createToken("number"),
				createToken(")"),
				createToken("=>"),
				createToken("void"),
			];
			const excerpt = createExcerpt("", tokens);

			const result = formatter.format(excerpt);
			expect(result.replace(/\s+/g, " ")).toContain("type Fn = (x: number) => void".replace(/\s+/g, " "));
		});
	});

	describe("format - Spacing Rules", () => {
		it("should add space after equals sign", () => {
			const formatter = new TypeSignatureFormatter();
			const tokens = [createToken("type"), createToken("Foo"), createToken("="), createToken("string")];
			const excerpt = createExcerpt("", tokens);

			const result = formatter.format(excerpt);
			expect(result).toContain("= string");
		});

		it("should add space after colon", () => {
			const formatter = new TypeSignatureFormatter();
			const tokens = [createToken("{"), createToken("key"), createToken(":"), createToken("value"), createToken("}")];
			const excerpt = createExcerpt("", tokens);

			const result = formatter.format(excerpt);
			expect(result).toContain("key: value");
		});

		it("should not add space before comma", () => {
			const formatter = new TypeSignatureFormatter();
			const tokens = [createToken("["), createToken("a"), createToken(","), createToken("b"), createToken("]")];
			const excerpt = createExcerpt("", tokens);

			const result = formatter.format(excerpt);
			expect(result.replace(/\s+/g, " ")).toContain("[a, b]".replace(/\s+/g, " "));
		});

		it("should not add space inside empty brackets", () => {
			const formatter = new TypeSignatureFormatter();
			const tokens = [createToken("type"), createToken("Obj"), createToken("="), createToken("{"), createToken("}")];
			const excerpt = createExcerpt("", tokens);

			const result = formatter.format(excerpt);
			expect(result).toBe("type Obj = {}");
		});

		it("should not add space before closing brackets", () => {
			const formatter = new TypeSignatureFormatter();
			const tokens = [createToken("["), createToken("string"), createToken("]")];
			const excerpt = createExcerpt("", tokens);

			const result = formatter.format(excerpt);
			expect(result.replace(/\s+/g, " ")).toContain("[string]".replace(/\s+/g, " "));
		});

		it("should handle generics without spaces", () => {
			const formatter = new TypeSignatureFormatter();
			const tokens = [
				createToken("type"),
				createToken("Generic"),
				createToken("<"),
				createToken("T"),
				createToken(">"),
				createToken("="),
				createToken("T"),
			];
			const excerpt = createExcerpt("", tokens);

			const result = formatter.format(excerpt);
			expect(result).toContain("Generic<T>");
			expect(result).toContain("=");
			expect(result).toContain("T");
		});

		it("should add space after optional marker", () => {
			const formatter = new TypeSignatureFormatter();
			const tokens = [createToken("{"), createToken("key"), createToken("?:"), createToken("string"), createToken("}")];
			const excerpt = createExcerpt("", tokens);

			const result = formatter.format(excerpt);
			expect(result).toContain("key?: string");
		});
	});

	describe("format - Fallback to Plain Text", () => {
		it("should handle excerpts without spanned tokens", () => {
			const formatter = new TypeSignatureFormatter();
			const excerpt = createExcerpt("export type Foo = string");

			expect(formatter.format(excerpt)).toBe("type Foo = string");
		});

		it("should handle excerpts with empty spanned tokens array", () => {
			const formatter = new TypeSignatureFormatter();
			const excerpt = createExcerpt("declare interface Bar { }", []);

			expect(formatter.format(excerpt)).toBe("interface Bar { }");
		});
	});

	describe("addLinks", () => {
		it("should return text unchanged when no api routes provided", () => {
			const formatter = new TypeSignatureFormatter();
			const excerpt = createExcerpt("type Foo = Bar");
			const text = "type Foo = Bar";

			expect(formatter.addLinks(text, excerpt)).toBe(text);
		});

		it("should return text unchanged when excerpt has no tokens", () => {
			const routes = new Map([["Bar", "/api/bar"]]);
			const formatter = new TypeSignatureFormatter(80, "  ", routes);
			const excerpt = createExcerpt("type Foo = Bar");
			const text = "type Foo = Bar";

			expect(formatter.addLinks(text, excerpt)).toBe(text);
		});

		it("should add links to type references", () => {
			const routes = new Map([["!Bar:interface", "/api/interface/bar"]]);
			const formatter = new TypeSignatureFormatter(80, "  ", routes);

			// Create a reference token
			const refToken = {
				text: "Bar",
				kind: "Reference",
				canonicalReference: {
					toString: () => "!Bar:interface",
				},
			} as unknown as ExcerptToken;

			const tokens = [createToken("type Foo ="), refToken];
			const excerpt = createExcerpt("", tokens);
			const text = "type Foo = Bar";

			const result = formatter.addLinks(text, excerpt);
			expect(result.replace(/\s+/g, " ")).toContain("type Foo = [Bar](/api/interface/bar)".replace(/\s+/g, " "));
		});

		it("should handle multiple type references", () => {
			const routes = new Map([
				["!TypeA:interface", "/api/interface/typea"],
				["!TypeB:interface", "/api/interface/typeb"],
			]);
			const formatter = new TypeSignatureFormatter(80, "  ", routes);

			const refTokenA = {
				text: "TypeA",
				kind: "Reference",
				canonicalReference: { toString: () => "!TypeA:interface" },
			} as unknown as ExcerptToken;

			const refTokenB = {
				text: "TypeB",
				kind: "Reference",
				canonicalReference: { toString: () => "!TypeB:interface" },
			} as unknown as ExcerptToken;

			const tokens = [createToken("type Foo ="), refTokenA, createToken(" |"), refTokenB];
			const excerpt = createExcerpt("", tokens);
			const text = "type Foo = TypeA | TypeB";

			const result = formatter.addLinks(text, excerpt);
			expect(result.replace(/\s+/g, " ")).toContain(
				"type Foo = [TypeA](/api/interface/typea) | [TypeB](/api/interface/typeb)".replace(/\s+/g, " "),
			);
		});

		it("should use word boundaries to avoid partial matches", () => {
			const routes = new Map([["!Bar:interface", "/api/interface/bar"]]);
			const formatter = new TypeSignatureFormatter(80, "  ", routes);

			const refToken = {
				text: "Bar",
				kind: "Reference",
				canonicalReference: { toString: () => "!Bar:interface" },
			} as unknown as ExcerptToken;

			const tokens = [createToken("type FooBar ="), refToken];
			const excerpt = createExcerpt("", tokens);
			const text = "type FooBar = Bar";

			const result = formatter.addLinks(text, excerpt);
			// Should link "Bar" but not "Bar" in "FooBar"
			expect(result.replace(/\s+/g, " ")).toContain("type FooBar = [Bar](/api/interface/bar)".replace(/\s+/g, " "));
		});

		it("should escape special regex characters in type names", () => {
			const routes = new Map([["!Type$A:interface", "/api/interface/type-a"]]);
			const formatter = new TypeSignatureFormatter(80, "  ", routes);

			const refToken = {
				text: "Type$A",
				kind: "Reference",
				canonicalReference: { toString: () => "!Type$A:interface" },
			} as unknown as ExcerptToken;

			const tokens = [createToken("type Foo ="), refToken];
			const excerpt = createExcerpt("", tokens);
			const text = "type Foo = Type$A";

			const result = formatter.addLinks(text, excerpt);
			expect(result.replace(/\s+/g, " ")).toContain("type Foo = [Type$A](/api/interface/type-a)".replace(/\s+/g, " "));
		});

		it("should handle tokens without canonical references", () => {
			const routes = new Map([["!Bar:interface", "/api/interface/bar"]]);
			const formatter = new TypeSignatureFormatter(80, "  ", routes);

			const refToken = {
				text: "Bar",
				kind: "Reference",
				// No canonicalReference
			} as unknown as ExcerptToken;

			const tokens = [createToken("type Foo ="), refToken];
			const excerpt = createExcerpt("", tokens);
			const text = "type Foo = Bar";

			const result = formatter.addLinks(text, excerpt);
			// Should not add link when canonicalReference is missing
			expect(result.replace(/\s+/g, " ")).toContain("type Foo = Bar".replace(/\s+/g, " "));
		});

		it("should skip tokens that are not references", () => {
			const routes = new Map([["content", "/api/content"]]);
			const formatter = new TypeSignatureFormatter(80, "  ", routes);

			const tokens = [createToken("type Foo ="), createToken("string")];
			const excerpt = createExcerpt("", tokens);
			const text = "type Foo = string";

			const result = formatter.addLinks(text, excerpt);
			expect(result.replace(/\s+/g, " ")).toContain("type Foo = string".replace(/\s+/g, " "));
		});
	});

	describe("Integration - Format and Add Links", () => {
		it("should format and add links together", () => {
			const routes = new Map([["!User:interface", "/api/interface/user"]]);
			const formatter = new TypeSignatureFormatter(80, "  ", routes);

			const refToken = {
				text: "User",
				kind: "Reference",
				canonicalReference: { toString: () => "!User:interface" },
			} as unknown as ExcerptToken;

			const tokens = [
				createToken("export type"),
				createToken("UserList"),
				createToken("="),
				refToken,
				createToken("[]"),
			];
			const excerpt = createExcerpt("", tokens);

			const formatted = formatter.format(excerpt);
			expect(formatted).toContain("type UserList");
			expect(formatted).toContain("User[]");

			const linked = formatter.addLinks(formatted, excerpt);
			expect(linked).toContain("[User](/api/interface/user)");
			expect(linked).toContain("[]");
		});
	});
});
