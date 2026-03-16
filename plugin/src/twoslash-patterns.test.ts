import { describe, expect, it } from "vitest";
import { classifyCutDirective, isTwoslashDirective } from "./twoslash-patterns.js";

describe("isTwoslashDirective", () => {
	describe("config boolean directives", () => {
		it("should detect // @noErrors", () => {
			expect(isTwoslashDirective("// @noErrors")).toBe(true);
		});

		it("should detect //@noErrors (no space)", () => {
			expect(isTwoslashDirective("//@noErrors")).toBe(true);
		});

		it("should detect // @strict", () => {
			expect(isTwoslashDirective("// @strict")).toBe(true);
		});
	});

	describe("config value directives", () => {
		it("should detect // @errors: 2304", () => {
			expect(isTwoslashDirective("// @errors: 2304")).toBe(true);
		});

		it("should detect //@target: ES2020 (no space)", () => {
			expect(isTwoslashDirective("//@target: ES2020")).toBe(true);
		});

		it("should detect // @filename: example.ts", () => {
			expect(isTwoslashDirective("// @filename: example.ts")).toBe(true);
		});
	});

	describe("annotation markers", () => {
		it("should detect // ^? (query marker)", () => {
			expect(isTwoslashDirective("// ^?")).toBe(true);
		});

		it("should detect //   ^? (query with alignment spaces)", () => {
			expect(isTwoslashDirective("//   ^?")).toBe(true);
		});

		it("should detect // ^? - description text", () => {
			expect(isTwoslashDirective("// ^? - description text")).toBe(true);
		});

		it("should detect // ^| (completion marker)", () => {
			expect(isTwoslashDirective("// ^|")).toBe(true);
		});

		it("should detect //    ^| (completion with spaces)", () => {
			expect(isTwoslashDirective("//    ^|")).toBe(true);
		});

		it("should detect // ^^^ (highlight marker)", () => {
			expect(isTwoslashDirective("// ^^^")).toBe(true);
		});

		it("should detect // ^^^^ description (highlight with text)", () => {
			expect(isTwoslashDirective("// ^^^^ description")).toBe(true);
		});

		it("should detect //      ^^^^ (highlight with alignment)", () => {
			expect(isTwoslashDirective("//      ^^^^")).toBe(true);
		});
	});

	describe("cut directives", () => {
		it("should detect // ---cut---", () => {
			expect(isTwoslashDirective("// ---cut---")).toBe(true);
		});

		it("should detect //---cut--- (no space)", () => {
			expect(isTwoslashDirective("//---cut---")).toBe(true);
		});

		it("should detect // ---cut-before---", () => {
			expect(isTwoslashDirective("// ---cut-before---")).toBe(true);
		});

		it("should detect // ---cut-after---", () => {
			expect(isTwoslashDirective("// ---cut-after---")).toBe(true);
		});

		it("should detect // ---cut-start---", () => {
			expect(isTwoslashDirective("// ---cut-start---")).toBe(true);
		});

		it("should detect // ---cut-end---", () => {
			expect(isTwoslashDirective("// ---cut-end---")).toBe(true);
		});

		it("should detect //---cut-start--- (no space)", () => {
			expect(isTwoslashDirective("//---cut-start---")).toBe(true);
		});
	});

	describe("non-directives", () => {
		it("should not match regular comments", () => {
			expect(isTwoslashDirective("// Create a logger")).toBe(false);
		});

		it("should not match regular code", () => {
			expect(isTwoslashDirective("const x = 1;")).toBe(false);
		});

		it("should not match empty string", () => {
			expect(isTwoslashDirective("")).toBe(false);
		});

		it("should not match comment with @ in text (not at start)", () => {
			expect(isTwoslashDirective("// email@example.com")).toBe(false);
		});

		it("should not match comment with caret in text", () => {
			expect(isTwoslashDirective("// x ^ y")).toBe(false);
		});
	});
});

describe("classifyCutDirective", () => {
	it("should classify // ---cut---", () => {
		expect(classifyCutDirective("// ---cut---")).toBe("cut-before");
	});

	it("should classify //---cut--- (no space)", () => {
		expect(classifyCutDirective("//---cut---")).toBe("cut-before");
	});

	it("should classify // ---cut-before---", () => {
		expect(classifyCutDirective("// ---cut-before---")).toBe("cut-before");
	});

	it("should classify // ---cut-after---", () => {
		expect(classifyCutDirective("// ---cut-after---")).toBe("cut-after");
	});

	it("should classify //---cut-after--- (no space)", () => {
		expect(classifyCutDirective("//---cut-after---")).toBe("cut-after");
	});

	it("should classify // ---cut-start---", () => {
		expect(classifyCutDirective("// ---cut-start---")).toBe("cut-start");
	});

	it("should classify // ---cut-end---", () => {
		expect(classifyCutDirective("// ---cut-end---")).toBe("cut-end");
	});

	it("should return null for non-cut directives", () => {
		expect(classifyCutDirective("// @noErrors")).toBeNull();
	});

	it("should return null for regular comments", () => {
		expect(classifyCutDirective("// Just a comment")).toBeNull();
	});
});
