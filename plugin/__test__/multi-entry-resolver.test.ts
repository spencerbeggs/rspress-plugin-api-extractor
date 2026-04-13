import { resolve } from "node:path";
import { ApiModel } from "@microsoft/api-extractor-model";
import { describe, expect, it } from "vitest";
import { resolveEntryPoints } from "../src/multi-entry-resolver.js";

function loadKitchensinkModel(): InstanceType<typeof ApiModel> {
	const modelPath = resolve(import.meta.dirname, "../src/__fixtures__/kitchensink/kitchensink.api.json");
	const model = new ApiModel();
	model.loadPackage(modelPath);
	return model;
}

describe("resolveEntryPoints", () => {
	it("returns all items from a single-entry model with definingEntryPoint 'default'", () => {
		const model = loadKitchensinkModel();
		const apiPackage = model.packages[0];

		const resolved = resolveEntryPoints(apiPackage);

		expect(resolved.length).toBeGreaterThan(0);

		const pipeline = resolved.find((r) => r.item.displayName === "Pipeline" && r.definingEntryPoint === "default");
		expect(pipeline).toBeDefined();
	});

	it("deduplicates re-exported items across entry points", () => {
		const model = loadKitchensinkModel();
		const apiPackage = model.packages[0];
		const resolved = resolveEntryPoints(apiPackage);

		// DataSource is exported from both main and testing (via MockSource's inheritance)
		// but only Pipeline is a direct export from default — check a default-only item
		const pipelineItems = resolved.filter((r) => r.item.displayName === "Pipeline" && r.item.kind === "Class");
		expect(pipelineItems).toHaveLength(1);
		expect(pipelineItems[0].definingEntryPoint).toBe("default");
	});

	it("includes unique items from secondary entry points", () => {
		const model = loadKitchensinkModel();
		const apiPackage = model.packages[0];
		const resolved = resolveEntryPoints(apiPackage);

		const mockSource = resolved.find((r) => r.item.displayName === "MockSource");
		expect(mockSource).toBeDefined();
		expect(mockSource?.definingEntryPoint).toBe("testing");
		expect(mockSource?.availableFrom).toEqual(["testing"]);
	});

	it("sets hasCollision false when no display name collisions exist", () => {
		const model = loadKitchensinkModel();
		const apiPackage = model.packages[0];
		const resolved = resolveEntryPoints(apiPackage);

		const collisions = resolved.filter((r) => r.hasCollision);
		expect(collisions).toHaveLength(0);
	});

	it("deduplicates availableFrom for function overloads", () => {
		const model = loadKitchensinkModel();
		const apiPackage = model.packages[0];
		const resolved = resolveEntryPoints(apiPackage);

		// createMockData has two overloads in the testing entry — availableFrom should not duplicate
		const createMockData = resolved.find((r) => r.item.displayName === "createMockData");
		expect(createMockData).toBeDefined();
		expect(createMockData?.availableFrom).toEqual(["testing"]);
	});

	it("returns items from all entry points with correct availableFrom", () => {
		const model = loadKitchensinkModel();
		const apiPackage = model.packages[0];
		const resolved = resolveEntryPoints(apiPackage);

		const testPipeline = resolved.find((r) => r.item.displayName === "TestPipeline");
		expect(testPipeline).toBeDefined();
		expect(testPipeline?.definingEntryPoint).toBe("testing");
		expect(testPipeline?.availableFrom).toEqual(["testing"]);

		// Pipeline is only in default entry
		const pipeline = resolved.filter((r) => r.item.displayName === "Pipeline");
		expect(pipeline).toHaveLength(1);
		expect(pipeline[0].availableFrom).toContain("default");
	});
});
