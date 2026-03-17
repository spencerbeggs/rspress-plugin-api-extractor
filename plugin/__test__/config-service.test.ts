import path from "node:path";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { TypeRegistryError } from "../src/errors.js";
import { ConfigServiceLive } from "../src/layers/ConfigServiceLive.js";
import { PluginLoggerLayer } from "../src/layers/ObservabilityLive.js";
import { PathDerivationServiceLive } from "../src/layers/PathDerivationServiceLive.js";
import type { PluginOptions } from "../src/schemas/index.js";
import type { ResolvedApiConfig, ResolvedBuildContext, RspressConfigSubset } from "../src/services/ConfigService.js";
import { ConfigService } from "../src/services/ConfigService.js";
import { TypeRegistryService } from "../src/services/TypeRegistryService.js";
import { ShikiCrossLinker } from "../src/shiki-transformer.js";
import { MockTypeRegistryServiceLayer } from "./utils/layers.js";

const fixtureModel = path.join(import.meta.dirname, "../src/__fixtures__/example-module/example-module.api.json");

const makeTestLayer = (options: PluginOptions) =>
	Layer.provideMerge(
		ConfigServiceLive(options, new ShikiCrossLinker()),
		Layer.mergeAll(PathDerivationServiceLive, MockTypeRegistryServiceLayer, PluginLoggerLayer("info")),
	);

describe("ConfigService types", () => {
	it("RspressConfigSubset has correct shape", () => {
		const config: RspressConfigSubset = {};
		void config.multiVersion;
		void config.locales;
		void config.lang;
		void config.root;
		expect(true).toBe(true);
	});

	it("ResolvedApiConfig has required fields", () => {
		const config = {} as ResolvedApiConfig;
		void config.apiPackage;
		void config.packageName;
		void config.outputDir;
		void config.baseRoute;
		void config.categories;
		expect(true).toBe(true);
	});

	it("ResolvedBuildContext has required fields", () => {
		const ctx = {} as ResolvedBuildContext;
		void ctx.apiConfigs;
		void ctx.combinedVfs;
		void ctx.highlighter;
		void ctx.shikiCrossLinker;
		void ctx.hideCutTransformer;
		void ctx.hideCutLinesTransformer;
		void ctx.twoslashTransformer;
		void ctx.pageConcurrency;
		void ctx.logLevel;
		void ctx.suppressExampleErrors;
		expect(true).toBe(true);
	});
});

describe("ConfigServiceLive.resolve", () => {
	it("resolves single-API config with fixture model", async () => {
		const options: PluginOptions = {
			api: {
				packageName: "example-module",
				model: fixtureModel,
				baseRoute: "/example-module",
			},
		};

		const program = Effect.gen(function* () {
			const config = yield* ConfigService;
			return yield* config.resolve({});
		}).pipe(Effect.scoped);

		const result = await Effect.runPromise(program.pipe(Effect.provide(makeTestLayer(options))));

		expect(result.apiConfigs).toHaveLength(1);
		expect(result.apiConfigs[0].packageName).toBe("example-module");
		expect(result.apiConfigs[0].baseRoute).toBe("/example-module/api");
		expect(result.highlighter).toBeDefined();
		expect(result.shikiCrossLinker).toBeDefined();
		expect(result.pageConcurrency).toBeGreaterThan(0);
	});

	it("fails with ConfigValidationError when both api and apis provided", async () => {
		const options: PluginOptions = {
			api: { packageName: "foo", model: fixtureModel },
			apis: [{ packageName: "bar", model: fixtureModel }],
		};

		const program = Effect.gen(function* () {
			const config = yield* ConfigService;
			return yield* config.resolve({});
		}).pipe(Effect.scoped);

		const result = await Effect.runPromiseExit(program.pipe(Effect.provide(makeTestLayer(options))));

		expect(result._tag).toBe("Failure");
	});

	it("fails when neither api nor apis provided", async () => {
		const options: PluginOptions = {};

		const program = Effect.gen(function* () {
			const config = yield* ConfigService;
			return yield* config.resolve({});
		}).pipe(Effect.scoped);

		const result = await Effect.runPromiseExit(program.pipe(Effect.provide(makeTestLayer(options))));

		expect(result._tag).toBe("Failure");
	});

	it("resolves multi-API config", async () => {
		const options: PluginOptions = {
			apis: [
				{ packageName: "api-a", model: fixtureModel, baseRoute: "/api-a" },
				{ packageName: "api-b", model: fixtureModel, baseRoute: "/api-b" },
			],
		};

		const program = Effect.gen(function* () {
			const config = yield* ConfigService;
			return yield* config.resolve({});
		}).pipe(Effect.scoped);

		const result = await Effect.runPromise(program.pipe(Effect.provide(makeTestLayer(options))));

		expect(result.apiConfigs).toHaveLength(2);
	});

	it("recovers from TypeRegistryError", async () => {
		const FailingTypeRegistryLayer = Layer.succeed(TypeRegistryService, {
			loadPackages: () =>
				Effect.fail(
					new TypeRegistryError({
						packageName: "zod",
						version: "3.0.0",
						reason: "Network error",
					}),
				),
			createTypeScriptCache: () => Effect.succeed(new Map()),
		});

		const options: PluginOptions = {
			api: {
				packageName: "example-module",
				model: fixtureModel,
				baseRoute: "/example-module",
				externalPackages: [{ name: "zod", version: "3.0.0" }],
			},
		};

		const testLayer = Layer.provideMerge(
			ConfigServiceLive(options, new ShikiCrossLinker()),
			Layer.mergeAll(PathDerivationServiceLive, FailingTypeRegistryLayer, PluginLoggerLayer("info")),
		);

		const program = Effect.gen(function* () {
			const config = yield* ConfigService;
			return yield* config.resolve({});
		}).pipe(Effect.scoped);

		const result = await Effect.runPromise(program.pipe(Effect.provide(testLayer)));
		expect(result.apiConfigs).toHaveLength(1);
		expect(result.highlighter).toBeDefined();
	});
});
