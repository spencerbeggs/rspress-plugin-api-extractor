import { describe, expect, it } from "vitest";
import { ApiExtractorPlugin } from "../src/plugin.js";

describe("ApiExtractorPlugin config-helper namespaces", () => {
	it("exposes api.fromDir for single-API configs", () => {
		expect(typeof ApiExtractorPlugin.api.fromDir).toBe("function");
	});

	it("exposes apis.fromDir for multi-API parent-directory scans", () => {
		expect(typeof ApiExtractorPlugin.apis.fromDir).toBe("function");
	});

	it("is still callable as the plugin factory", () => {
		expect(typeof ApiExtractorPlugin).toBe("function");
	});
});
