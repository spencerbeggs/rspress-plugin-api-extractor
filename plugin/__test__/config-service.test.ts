import { describe, expect, it } from "vitest";
import type { ResolvedApiConfig, ResolvedBuildContext, RspressConfigSubset } from "../src/services/ConfigService.js";

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
		void ctx.snapshotManager;
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
