import { describe, expect, it } from "vitest";
import { ApiExtractorPlugin } from "./plugin.js";

describe("ApiExtractorPlugin.api namespace", () => {
	it("exposes fromFolder and fromModelsDir", () => {
		expect(typeof ApiExtractorPlugin.api.fromFolder).toBe("function");
		expect(typeof ApiExtractorPlugin.api.fromModelsDir).toBe("function");
	});

	it("is still callable as the plugin factory", () => {
		expect(typeof ApiExtractorPlugin).toBe("function");
	});
});
