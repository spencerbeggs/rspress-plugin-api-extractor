import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FileWriteResult, GeneratedPageResult, WorkItem } from "../src/build-stages.js";
import { prepareWorkItems } from "../src/build-stages.js";
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
