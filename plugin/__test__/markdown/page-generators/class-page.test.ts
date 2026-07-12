import path from "node:path";
import type { ApiClass, ApiItem } from "@microsoft/api-extractor-model";
import { ApiModel } from "@microsoft/api-extractor-model";
import { describe, expect, it } from "vitest";
import { ClassPageGenerator } from "../../../src/markdown/page-generators/class-page.js";

function loadFixtureMembers(): readonly ApiItem[] {
	const model = new ApiModel();
	const pkg = model.loadPackage(
		path.join(
			import.meta.dirname,
			"..",
			"..",
			"..",
			"src",
			"__fixtures__",
			"synthetic-base",
			"synthetic-base.api.json",
		),
	);
	const entryPoint = pkg.entryPoints[0];
	if (!entryPoint) throw new Error("fixture has no entry point");
	return entryPoint.members;
}

describe("ClassPageGenerator synthetic base section", () => {
	it("renders an inline Base Class section when a synthetic base is provided", async () => {
		const members = loadFixtureMembers();
		const person = members.find((m) => m.displayName === "Person" && m.kind === "Class") as ApiClass;
		const personBase = members.find((m) => m.displayName === "Person_base") as ApiItem;

		const generator = new ClassPageGenerator();
		const { routePath, content } = await generator.generate(
			person,
			"/api",
			"example",
			"Class",
			"example",
			undefined,
			undefined,
			true,
			undefined,
			undefined,
			personBase,
		);

		expect(routePath).toBe("/api/class/person");
		expect(content).toContain("## Base Class");
		expect(content).toContain(
			"`Person` extends `Person_base`, a compiler-generated declaration that is not exported from `example`.",
		);
		// The base declaration's signature is rendered as an ApiSignature block
		expect(content).toContain("Person_base: Schema.Class<Person");
		// Section appears after the class signature and before member sections
		expect(content.indexOf("## Base Class")).toBeLessThan(content.indexOf("## Static Properties"));
	});

	it("renders no Base Class section without a synthetic base", async () => {
		const members = loadFixtureMembers();
		const cat = members.find((m) => m.displayName === "Cat" && m.kind === "Class") as ApiClass;

		const generator = new ClassPageGenerator();
		const { content } = await generator.generate(cat, "/api", "example", "Class", "example");

		expect(content).not.toContain("## Base Class");
	});
});
