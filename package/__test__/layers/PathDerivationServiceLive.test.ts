import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { PathDerivationServiceLive } from "../../src/layers/PathDerivationServiceLive.js";
import { PathDerivationService } from "../../src/services/PathDerivationService.js";

describe("PathDerivationServiceLive", () => {
	it("derives paths for single API, no i18n, no versioning", async () => {
		const program = Effect.gen(function* () {
			const service = yield* PathDerivationService;
			const paths = yield* service.derivePaths({
				mode: "single",
				docsRoot: "docs",
				baseRoute: "/",
				apiFolder: "api",
				locales: [],
				defaultLang: undefined,
				versions: [],
				defaultVersion: undefined,
			});
			expect(paths).toHaveLength(1);
			expect(paths[0]).toEqual({
				outputDir: "docs/api",
				routeBase: "/api",
				version: undefined,
				locale: undefined,
			});
		});

		await Effect.runPromise(program.pipe(Effect.provide(PathDerivationServiceLive)));
	});

	it("derives paths for versioned + i18n (bug fix validation)", async () => {
		const program = Effect.gen(function* () {
			const service = yield* PathDerivationService;
			const paths = yield* service.derivePaths({
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
			const v1zh = paths.find((p) => p.version === "v1" && p.locale === "zh");
			expect(v1zh).toBeDefined();
			expect(v1zh?.routeBase).toBe("/v1/zh/api");
		});

		await Effect.runPromise(program.pipe(Effect.provide(PathDerivationServiceLive)));
	});

	it("normalizes root route", async () => {
		const program = Effect.gen(function* () {
			const service = yield* PathDerivationService;
			const result = yield* service.normalizeBaseRoute("/");
			expect(result).toBe("/");
		});

		await Effect.runPromise(program.pipe(Effect.provide(PathDerivationServiceLive)));
	});

	it("normalizes empty string to root", async () => {
		const program = Effect.gen(function* () {
			const service = yield* PathDerivationService;
			const result = yield* service.normalizeBaseRoute("");
			expect(result).toBe("/");
		});

		await Effect.runPromise(program.pipe(Effect.provide(PathDerivationServiceLive)));
	});
});
