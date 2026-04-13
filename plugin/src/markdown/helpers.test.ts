import { describe, expect, it } from "vitest";
import { escapeMdxGenerics } from "./helpers.js";

describe("escapeMdxGenerics", () => {
	it("should wrap generics in backticks", () => {
		expect(escapeMdxGenerics("Returns Promise<T>")).toBe("Returns Promise`<T>`");
	});

	it("should wrap multi-param generics in backticks", () => {
		expect(escapeMdxGenerics("Map<K, V> extends...")).toBe("Map`<K, V>` extends...");
	});

	it("should not escape generics inside backtick code spans", () => {
		expect(escapeMdxGenerics("`Pipeline<I, O>`")).toBe("`Pipeline<I, O>`");
	});

	it("should escape generics outside code spans but not inside", () => {
		expect(escapeMdxGenerics("Returns `Pipeline<I, O>` or Promise<T>")).toBe(
			"Returns `Pipeline<I, O>` or Promise`<T>`",
		);
	});

	it("should handle multiple code spans", () => {
		expect(escapeMdxGenerics("`Foo<T>` and `Bar<U>` are types")).toBe("`Foo<T>` and `Bar<U>` are types");
	});

	it("should handle code span followed by bare generic", () => {
		expect(escapeMdxGenerics("Use `Foo<T>` with Bar<U>")).toBe("Use `Foo<T>` with Bar`<U>`");
	});

	it("should handle text with no generics", () => {
		expect(escapeMdxGenerics("plain text")).toBe("plain text");
	});

	it("should handle empty string", () => {
		expect(escapeMdxGenerics("")).toBe("");
	});

	it("should handle generics with extends constraints", () => {
		expect(escapeMdxGenerics("Type<T extends string>")).toBe("Type`<T extends string>`");
	});

	it("should not escape lowercase angle brackets", () => {
		expect(escapeMdxGenerics("a < b and c > d")).toBe("a < b and c > d");
	});
});
