import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/build-program.js";

describe("buildProgram", () => {
	it("exports a function returning an Effect", () => {
		expect(typeof buildProgram).toBe("function");
		const program = buildProgram({ dryRun: true });
		expect(program).toBeDefined();
	});
});
