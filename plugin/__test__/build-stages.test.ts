import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FileWriteResult, GeneratedPageResult, WorkItem } from "../src/build-stages.js";
import { generatePages, prepareWorkItems } from "../src/build-stages.js";
import { CategoryResolver } from "../src/category-resolver.js";
import { ApiModelLoader } from "../src/model-loader.js";
import { DEFAULT_CATEGORIES } from "../src/types.js";

describe("build-stages types", () => {
	it("WorkItem has required fields", () => {
		const item = {} as WorkItem;
		void item.item;
		void item.categoryKey;
		void item.categoryConfig;
		void item.namespaceMember;
		expect(true).toBe(true);
	});

	it("GeneratedPageResult has required fields", () => {
		const result = {} as GeneratedPageResult;
		void result.workItem;
		void result.content;
		void result.bodyContent;
		void result.frontmatter;
		void result.contentHash;
		void result.frontmatterHash;
		void result.routePath;
		void result.relativePathWithExt;
		void result.publishedTime;
		void result.modifiedTime;
		void result.isUnchanged;
		expect(true).toBe(true);
	});

	it("FileWriteResult has required fields", () => {
		const result = {} as FileWriteResult;
		void result.relativePathWithExt;
		void result.absolutePath;
		void result.status;
		void result.snapshot;
		void result.categoryKey;
		void result.label;
		void result.routePath;
		expect(true).toBe(true);
	});
});

describe("prepareWorkItems", () => {
	it("returns work items and cross-link data from fixture API model", async () => {
		const modelPath = path.join(import.meta.dirname, "../src/__fixtures__/example-module/example-module.api.json");
		const { apiPackage } = await ApiModelLoader.loadApiModel(modelPath);
		const resolver = new CategoryResolver();
		const categories = resolver.mergeCategories(DEFAULT_CATEGORIES, undefined);

		const result = prepareWorkItems({
			apiPackage,
			categories,
			baseRoute: "/example-module",
			packageName: "example-module",
		});

		expect(result.workItems.length).toBeGreaterThan(0);
		for (const wi of result.workItems) {
			expect(wi.item).toBeDefined();
			expect(wi.categoryKey).toBeTruthy();
			expect(wi.categoryConfig).toBeDefined();
		}
		expect(result.crossLinkData.routes.size).toBeGreaterThan(0);
		expect(result.crossLinkData.kinds.size).toBeGreaterThan(0);
	});

	it("returns empty arrays for empty categories", async () => {
		const modelPath = path.join(import.meta.dirname, "../src/__fixtures__/example-module/example-module.api.json");
		const { apiPackage } = await ApiModelLoader.loadApiModel(modelPath);
		const result = prepareWorkItems({
			apiPackage,
			categories: {},
			baseRoute: "/test",
			packageName: "test",
		});
		expect(result.workItems).toHaveLength(0);
		expect(result.crossLinkData.routes.size).toBe(0);
	});
});

describe("generatePages", () => {
	it("generates page results with valid hashes for fixture model", async () => {
		const modelPath = path.join(import.meta.dirname, "../src/__fixtures__/example-module/example-module.api.json");
		const { apiPackage } = await ApiModelLoader.loadApiModel(modelPath);
		const resolver = new CategoryResolver();
		const categories = resolver.mergeCategories(DEFAULT_CATEGORIES, undefined);
		const { workItems } = prepareWorkItems({
			apiPackage,
			categories,
			baseRoute: "/example-module",
			packageName: "example-module",
		});

		const subset = workItems.slice(0, 3);
		const results = await generatePages({
			workItems: subset,
			existingSnapshots: new Map(),
			baseRoute: "/example-module",
			packageName: "example-module",
			apiScope: "example-module",
			buildTime: new Date().toISOString(),
			resolvedOutputDir: "/tmp/test-output-nonexistent",
			pageConcurrency: 2,
		});

		expect(results.length).toBe(subset.length);
		for (const r of results) {
			if (r === null) continue;
			expect(r.contentHash).toMatch(/^[a-f0-9]{64}$/);
			expect(r.frontmatterHash).toMatch(/^[a-f0-9]{64}$/);
			expect(r.relativePathWithExt).toMatch(/\.mdx$/);
			expect(r.bodyContent.length).toBeGreaterThan(0);
		}
	});

	it("marks unchanged pages when snapshot hashes match", async () => {
		const modelPath = path.join(import.meta.dirname, "../src/__fixtures__/example-module/example-module.api.json");
		const { apiPackage } = await ApiModelLoader.loadApiModel(modelPath);
		const resolver = new CategoryResolver();
		const categories = resolver.mergeCategories(DEFAULT_CATEGORIES, undefined);
		const { workItems } = prepareWorkItems({
			apiPackage,
			categories,
			baseRoute: "/example-module",
			packageName: "example-module",
		});

		const buildTime = new Date().toISOString();
		const subset = workItems.slice(0, 1);

		const firstResults = await generatePages({
			workItems: subset,
			existingSnapshots: new Map(),
			baseRoute: "/example-module",
			packageName: "example-module",
			apiScope: "example-module",
			buildTime,
			resolvedOutputDir: "/tmp/test-output-nonexistent",
			pageConcurrency: 1,
		});

		const firstResult = firstResults[0];
		if (!firstResult) throw new Error("Expected result");

		const snapshots = new Map();
		snapshots.set(firstResult.relativePathWithExt, {
			outputDir: "/tmp/test-output-nonexistent",
			filePath: firstResult.relativePathWithExt,
			publishedTime: "2025-01-01T00:00:00.000Z",
			modifiedTime: "2025-01-01T00:00:00.000Z",
			contentHash: firstResult.contentHash,
			frontmatterHash: firstResult.frontmatterHash,
			buildTime,
		});

		const secondResults = await generatePages({
			workItems: subset,
			existingSnapshots: snapshots,
			baseRoute: "/example-module",
			packageName: "example-module",
			apiScope: "example-module",
			buildTime,
			resolvedOutputDir: "/tmp/test-output-nonexistent",
			pageConcurrency: 1,
		});

		const secondResult = secondResults[0];
		if (!secondResult) throw new Error("Expected second result to be non-null");
		expect(secondResult.isUnchanged).toBe(true);
		expect(secondResult.publishedTime).toBe("2025-01-01T00:00:00.000Z");
	});
});
