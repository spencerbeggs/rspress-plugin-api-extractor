import { describe, expect, it } from "vitest";
import { deriveOutputPaths, normalizeBaseRoute, unscopedName } from "./path-derivation.js";

describe("unscopedName", () => {
	it("strips scope from scoped packages", () => {
		expect(unscopedName("@spencerbeggs/foobar")).toBe("foobar");
	});
	it("returns unscoped names as-is", () => {
		expect(unscopedName("foobar")).toBe("foobar");
	});
});

describe("normalizeBaseRoute", () => {
	it("adds leading slash", () => {
		expect(normalizeBaseRoute("foobar")).toBe("/foobar");
	});
	it("strips trailing slash", () => {
		expect(normalizeBaseRoute("/foobar/")).toBe("/foobar");
	});
	it("preserves clean routes", () => {
		expect(normalizeBaseRoute("/foobar")).toBe("/foobar");
	});
});

describe("deriveOutputPaths", () => {
	const docsRoot = "docs";

	describe("single-API mode", () => {
		it("no i18n, no versioning", () => {
			const result = deriveOutputPaths({
				mode: "single",
				docsRoot,
				baseRoute: "/",
				apiFolder: "api",
				locales: [],
				defaultLang: undefined,
				versions: [],
				defaultVersion: undefined,
			});
			expect(result).toEqual([{ outputDir: "docs/api", routeBase: "/api", version: undefined, locale: undefined }]);
		});

		it("with i18n", () => {
			const result = deriveOutputPaths({
				mode: "single",
				docsRoot,
				baseRoute: "/",
				apiFolder: "api",
				locales: ["en", "zh"],
				defaultLang: "en",
				versions: [],
				defaultVersion: undefined,
			});
			expect(result).toEqual([
				{ outputDir: "docs/en/api", routeBase: "/api", version: undefined, locale: "en" },
				{ outputDir: "docs/zh/api", routeBase: "/zh/api", version: undefined, locale: "zh" },
			]);
		});

		it("with multiVersion", () => {
			const result = deriveOutputPaths({
				mode: "single",
				docsRoot,
				baseRoute: "/",
				apiFolder: "api",
				locales: [],
				defaultLang: undefined,
				versions: ["v1", "v2"],
				defaultVersion: "v2",
			});
			expect(result).toEqual([
				{ outputDir: "docs/v1/api", routeBase: "/v1/api", version: "v1", locale: undefined },
				{ outputDir: "docs/v2/api", routeBase: "/api", version: "v2", locale: undefined },
			]);
		});

		it("with i18n + multiVersion", () => {
			const result = deriveOutputPaths({
				mode: "single",
				docsRoot,
				baseRoute: "/",
				apiFolder: "api",
				locales: ["en", "zh"],
				defaultLang: "en",
				versions: ["v1", "v2"],
				defaultVersion: "v2",
			});
			expect(result).toHaveLength(4);
			expect(result).toContainEqual({ outputDir: "docs/v2/en/api", routeBase: "/api", version: "v2", locale: "en" });
			expect(result).toContainEqual({
				outputDir: "docs/v1/zh/api",
				routeBase: "/v1/zh/api",
				version: "v1",
				locale: "zh",
			});
		});

		it("with custom baseRoute", () => {
			const result = deriveOutputPaths({
				mode: "single",
				docsRoot,
				baseRoute: "/docs",
				apiFolder: "api",
				locales: [],
				defaultLang: undefined,
				versions: [],
				defaultVersion: undefined,
			});
			expect(result).toEqual([
				{ outputDir: "docs/docs/api", routeBase: "/docs/api", version: undefined, locale: undefined },
			]);
		});

		it("with apiFolder null", () => {
			const result = deriveOutputPaths({
				mode: "single",
				docsRoot,
				baseRoute: "/",
				apiFolder: null,
				locales: [],
				defaultLang: undefined,
				versions: [],
				defaultVersion: undefined,
			});
			expect(result).toEqual([{ outputDir: "docs", routeBase: "/", version: undefined, locale: undefined }]);
		});
	});

	describe("multi-API mode", () => {
		it("derives path from baseRoute", () => {
			const result = deriveOutputPaths({
				mode: "multi",
				docsRoot,
				baseRoute: "/foobar",
				apiFolder: "api",
				locales: [],
				defaultLang: undefined,
				versions: [],
				defaultVersion: undefined,
			});
			expect(result).toEqual([
				{ outputDir: "docs/foobar/api", routeBase: "/foobar/api", version: undefined, locale: undefined },
			]);
		});

		it("with i18n", () => {
			const result = deriveOutputPaths({
				mode: "multi",
				docsRoot,
				baseRoute: "/foobar",
				apiFolder: "api",
				locales: ["en", "zh"],
				defaultLang: "en",
				versions: [],
				defaultVersion: undefined,
			});
			expect(result).toEqual([
				{ outputDir: "docs/en/foobar/api", routeBase: "/foobar/api", version: undefined, locale: "en" },
				{ outputDir: "docs/zh/foobar/api", routeBase: "/zh/foobar/api", version: undefined, locale: "zh" },
			]);
		});
	});
});
