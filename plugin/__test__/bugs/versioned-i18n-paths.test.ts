import { describe, expect, it } from "vitest";
import { deriveOutputPaths } from "../../src/path-derivation.js";

describe("Bug: Versioned path bypass (plugin.ts:1550)", () => {
	it("versioned + i18n produces locale x version cross-product", () => {
		const paths = deriveOutputPaths({
			mode: "single",
			docsRoot: "docs",
			baseRoute: "/",
			apiFolder: "api",
			locales: ["en", "zh"],
			defaultLang: "en",
			versions: ["v1", "v2"],
			defaultVersion: "v2",
		});

		expect(paths).toHaveLength(4);

		// v1 + en (non-default version, default locale)
		const v1en = paths.find((p) => p.version === "v1" && p.locale === "en");
		expect(v1en).toBeDefined();
		expect(v1en?.outputDir).toBe("docs/v1/en/api");
		expect(v1en?.routeBase).toBe("/v1/api");

		// v1 + zh (non-default version, non-default locale)
		const v1zh = paths.find((p) => p.version === "v1" && p.locale === "zh");
		expect(v1zh).toBeDefined();
		expect(v1zh?.outputDir).toBe("docs/v1/zh/api");
		expect(v1zh?.routeBase).toBe("/v1/zh/api");

		// v2 + en (default version, default locale)
		const v2en = paths.find((p) => p.version === "v2" && p.locale === "en");
		expect(v2en).toBeDefined();
		expect(v2en?.routeBase).toBe("/api");

		// v2 + zh (default version, non-default locale)
		const v2zh = paths.find((p) => p.version === "v2" && p.locale === "zh");
		expect(v2zh).toBeDefined();
		expect(v2zh?.routeBase).toBe("/zh/api");
	});

	it("versioned without i18n still works", () => {
		const paths = deriveOutputPaths({
			mode: "single",
			docsRoot: "docs",
			baseRoute: "/",
			apiFolder: "api",
			locales: [],
			defaultLang: undefined,
			versions: ["v1", "v2"],
			defaultVersion: "v2",
		});

		expect(paths).toHaveLength(2);
	});
});
