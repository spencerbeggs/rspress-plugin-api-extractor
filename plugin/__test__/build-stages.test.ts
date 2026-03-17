import { describe, expect, it } from "vitest";
import type { FileWriteResult, GeneratedPageResult, WorkItem } from "../src/build-stages.js";

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
