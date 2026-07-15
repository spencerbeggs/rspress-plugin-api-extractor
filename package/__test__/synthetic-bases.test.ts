import path from "node:path";
import type { ApiClass, ApiItem } from "@microsoft/api-extractor-model";
import { ApiModel } from "@microsoft/api-extractor-model";
import { describe, expect, it } from "vitest";
import { BASE_CLASS_ANCHOR, detectSyntheticBases } from "../src/synthetic-bases.js";

function loadFixtureMembers(fixture: string): readonly ApiItem[] {
	const model = new ApiModel();
	const pkg = model.loadPackage(path.join(import.meta.dirname, "..", "src", "__fixtures__", fixture));
	const entryPoint = pkg.entryPoints[0];
	if (!entryPoint) throw new Error(`fixture ${fixture} has no entry point`);
	return entryPoint.members;
}

describe("detectSyntheticBases", () => {
	it("detects an unexported base variable referenced by a class extends clause", () => {
		const members = loadFixtureMembers("synthetic-base/synthetic-base.api.json");
		const detection = detectSyntheticBases(members);

		expect(detection.bases.size).toBe(1);
		const [base] = [...detection.bases.values()];
		expect(base.baseItem.displayName).toBe("Person_base");
		expect(base.ownerClasses.map((c) => c.displayName)).toEqual(["Person"]);

		const person = members.find((m) => m.displayName === "Person" && m.kind === "Class") as ApiClass;
		expect(detection.baseByOwner.get(person)).toBe(base.baseItem);
	});

	it("does not treat exported items or classes with plain inheritance as synthetic bases", () => {
		const members = loadFixtureMembers("synthetic-base/synthetic-base.api.json");
		const detection = detectSyntheticBases(members);

		// Animal is an exported class extended by Cat — regular inheritance.
		for (const item of detection.bases.keys()) {
			expect(item.displayName).not.toBe("Animal");
			expect(item.displayName).not.toBe("Base");
		}
		const cat = members.find((m) => m.displayName === "Cat");
		const child = members.find((m) => m.displayName === "Child");
		expect(detection.baseByOwner.has(cat as ApiItem)).toBe(false);
		expect(detection.baseByOwner.has(child as ApiItem)).toBe(false);
	});

	it("tolerates dangling extends references whose base is absent from the model", () => {
		// effect-kit's AgentNotFoundError extends AgentNotFoundError_base, but the
		// base variable was not hoisted into this model.
		const members = loadFixtureMembers("effect-kit/effect-kit.api.json");
		const detection = detectSyntheticBases(members);
		expect(detection.bases.size).toBe(0);
		expect(detection.baseByOwner.size).toBe(0);
	});

	it("returns an empty detection for models without unexported items", () => {
		const members = loadFixtureMembers("example-module/example-module.api.json");
		const detection = detectSyntheticBases(members);
		expect(detection.bases.size).toBe(0);
	});

	it("exposes a stable anchor for the inline section", () => {
		// Must match the slug RSPress derives from the "## Base Class" heading.
		expect(BASE_CLASS_ANCHOR).toBe("base-class");
	});
});
