import { describe, expect, it } from "vitest";
import { generateApiDocs } from "../src/build-program.js";

describe("build-program", () => {
	it("exports generateApiDocs as a function", () => {
		expect(typeof generateApiDocs).toBe("function");
	});
});
