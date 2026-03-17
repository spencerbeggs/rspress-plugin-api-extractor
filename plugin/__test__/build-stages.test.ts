import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type {
	FileWriteResult,
	GenerateSinglePageContext,
	GeneratedPageResult,
	WorkItem,
	WriteSingleFileContext,
} from "../src/build-stages.js";
import {
	buildPipelineForApi,
	cleanupAndCommit,
	generateSinglePage,
	prepareWorkItems,
	writeMetadata,
	writeSingleFile,
} from "../src/build-stages.js";
import { CategoryResolver } from "../src/category-resolver.js";
import { MarkdownCrossLinker } from "../src/markdown/cross-linker.js";
import { ApiModelLoader } from "../src/model-loader.js";
import { SnapshotManager } from "../src/snapshot-manager.js";
import type { CategoryConfig } from "../src/types.js";
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

describe("writeMetadata", () => {
	it("writes _meta.json files for categories with items", async () => {
		const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "meta-test-"));
		const dbPath = path.join(tmpDir, "test.db");
		const snapshotManager = new SnapshotManager(dbPath);
		const generatedFiles = new Set<string>();

		const categories: Record<string, CategoryConfig> = {
			classes: {
				folderName: "class",
				displayName: "Classes",
				singularName: "Class",
				collapsible: true,
				collapsed: true,
				overviewHeaders: [2],
			},
		};

		const results: FileWriteResult[] = [
			{
				relativePathWithExt: "class/foo.mdx",
				absolutePath: path.join(tmpDir, "class/foo.mdx"),
				status: "new",
				snapshot: {
					outputDir: tmpDir,
					filePath: "class/foo.mdx",
					publishedTime: "",
					modifiedTime: "",
					contentHash: "a",
					frontmatterHash: "b",
					buildTime: "",
				},
				categoryKey: "classes",
				label: "Foo",
				routePath: "/api/class/foo",
			},
			{
				relativePathWithExt: "class/bar.mdx",
				absolutePath: path.join(tmpDir, "class/bar.mdx"),
				status: "new",
				snapshot: {
					outputDir: tmpDir,
					filePath: "class/bar.mdx",
					publishedTime: "",
					modifiedTime: "",
					contentHash: "c",
					frontmatterHash: "d",
					buildTime: "",
				},
				categoryKey: "classes",
				label: "Bar",
				routePath: "/api/class/bar",
			},
		];

		await writeMetadata({
			fileResults: results,
			categories,
			resolvedOutputDir: tmpDir,
			snapshotManager,
			existingSnapshots: new Map(),
			buildTime: new Date().toISOString(),
			baseRoute: "/api",
			packageName: "test-package",
			generatedFiles,
		});

		// Category _meta.json should exist with sorted entries
		const metaPath = path.join(tmpDir, "class/_meta.json");
		const metaContent = JSON.parse(await fs.promises.readFile(metaPath, "utf-8"));
		expect(metaContent).toHaveLength(2);
		expect(metaContent[0].label).toBe("Bar");
		expect(metaContent[1].label).toBe("Foo");

		// Root _meta.json should exist with category dir entry
		const rootMetaPath = path.join(tmpDir, "_meta.json");
		const rootMeta = JSON.parse(await fs.promises.readFile(rootMetaPath, "utf-8"));
		expect(rootMeta).toHaveLength(1);
		expect(rootMeta[0].type).toBe("dir");
		expect(rootMeta[0].name).toBe("class");
		expect(rootMeta[0].label).toBe("Classes");

		// generatedFiles should track all metadata files
		expect(generatedFiles.has("_meta.json")).toBe(true);
		expect(generatedFiles.has("class/_meta.json")).toBe(true);
		expect(generatedFiles.has("index.mdx")).toBe(true);

		// index.mdx should have been written
		const indexPath = path.join(tmpDir, "index.mdx");
		const indexExists = await fs.promises
			.access(indexPath)
			.then(() => true)
			.catch(() => false);
		expect(indexExists).toBe(true);

		snapshotManager.close();
		await fs.promises.rm(tmpDir, { recursive: true });
	});

	it("skips writing _meta.json when content is unchanged (snapshot match)", async () => {
		const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "meta-unchanged-"));
		const dbPath = path.join(tmpDir, "test.db");
		const snapshotManager = new SnapshotManager(dbPath);

		const categories: Record<string, CategoryConfig> = {
			classes: {
				folderName: "class",
				displayName: "Classes",
				singularName: "Class",
				collapsible: true,
				collapsed: true,
				overviewHeaders: [2],
			},
		};

		const results: FileWriteResult[] = [
			{
				relativePathWithExt: "class/foo.mdx",
				absolutePath: path.join(tmpDir, "class/foo.mdx"),
				status: "unchanged",
				snapshot: {
					outputDir: tmpDir,
					filePath: "class/foo.mdx",
					publishedTime: "2024-01-01T00:00:00.000Z",
					modifiedTime: "2024-01-01T00:00:00.000Z",
					contentHash: "a",
					frontmatterHash: "b",
					buildTime: "2024-01-01T00:00:00.000Z",
				},
				categoryKey: "classes",
				label: "Foo",
				routePath: "/api/class/foo",
			},
		];

		// First write — creates the files
		const generatedFiles1 = new Set<string>();
		await writeMetadata({
			fileResults: results,
			categories,
			resolvedOutputDir: tmpDir,
			snapshotManager,
			existingSnapshots: new Map(),
			buildTime: new Date().toISOString(),
			baseRoute: "/api",
			packageName: "test-package",
			generatedFiles: generatedFiles1,
		});

		const metaPath = path.join(tmpDir, "class/_meta.json");
		const statBefore = await fs.promises.stat(metaPath);

		// Build the existingSnapshots from the snapshot manager for the second run
		const allSnapshots = snapshotManager.getSnapshotsForOutputDir(tmpDir);
		const existingSnapshots = new Map(allSnapshots.map((s) => [s.filePath, s]));

		// Second write — should be unchanged, file mtime should not change
		const generatedFiles2 = new Set<string>();
		await writeMetadata({
			fileResults: results,
			categories,
			resolvedOutputDir: tmpDir,
			snapshotManager,
			existingSnapshots,
			buildTime: new Date().toISOString(),
			baseRoute: "/api",
			packageName: "test-package",
			generatedFiles: generatedFiles2,
		});

		const statAfter = await fs.promises.stat(metaPath);
		// File should not have been rewritten (mtime unchanged)
		expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs);

		snapshotManager.close();
		await fs.promises.rm(tmpDir, { recursive: true });
	});

	it("excludes categories with no items from root _meta.json", async () => {
		const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "meta-empty-cat-"));
		const dbPath = path.join(tmpDir, "test.db");
		const snapshotManager = new SnapshotManager(dbPath);
		const generatedFiles = new Set<string>();

		const categories: Record<string, CategoryConfig> = {
			classes: {
				folderName: "class",
				displayName: "Classes",
				singularName: "Class",
				collapsible: true,
				collapsed: true,
				overviewHeaders: [2],
			},
			interfaces: {
				folderName: "interface",
				displayName: "Interfaces",
				singularName: "Interface",
				collapsible: true,
				collapsed: true,
				overviewHeaders: [2],
			},
		};

		// Only classes have results — interfaces category is empty
		const results: FileWriteResult[] = [
			{
				relativePathWithExt: "class/foo.mdx",
				absolutePath: path.join(tmpDir, "class/foo.mdx"),
				status: "new",
				snapshot: {
					outputDir: tmpDir,
					filePath: "class/foo.mdx",
					publishedTime: "",
					modifiedTime: "",
					contentHash: "a",
					frontmatterHash: "b",
					buildTime: "",
				},
				categoryKey: "classes",
				label: "Foo",
				routePath: "/api/class/foo",
			},
		];

		await writeMetadata({
			fileResults: results,
			categories,
			resolvedOutputDir: tmpDir,
			snapshotManager,
			existingSnapshots: new Map(),
			buildTime: new Date().toISOString(),
			baseRoute: "/api",
			packageName: "test-package",
			generatedFiles,
		});

		const rootMeta = JSON.parse(await fs.promises.readFile(path.join(tmpDir, "_meta.json"), "utf-8"));
		// Only "class" should appear — "interface" has no items
		expect(rootMeta).toHaveLength(1);
		expect(rootMeta[0].name).toBe("class");

		snapshotManager.close();
		await fs.promises.rm(tmpDir, { recursive: true });
	});
});

describe("MarkdownCrossLinker accumulation", () => {
	const categories = { classes: { folderName: "class" } };

	it("addRoutes accumulates routes across multiple calls", () => {
		const linker = new MarkdownCrossLinker();

		linker.addRoutes({ classes: [{ displayName: "Foo", kind: "Class", members: [] }] }, "/api1", categories);
		linker.addRoutes({ classes: [{ displayName: "Bar", kind: "Class", members: [] }] }, "/api2", categories);

		// Both routes should be present
		const result = linker.addCrossLinks("Returns a Foo or Bar instance");
		expect(result).toContain("[Foo](/api1/class/foo)");
		expect(result).toContain("[Bar](/api2/class/bar)");
	});

	it("clear removes all accumulated routes", () => {
		const linker = new MarkdownCrossLinker();
		linker.addRoutes({ classes: [{ displayName: "Foo", kind: "Class", members: [] }] }, "/api1", categories);

		linker.clear();

		const result = linker.addCrossLinks("Returns a Foo instance");
		expect(result).toBe("Returns a Foo instance");
	});

	it("initialize clears then adds (backward compat)", () => {
		const linker = new MarkdownCrossLinker();
		linker.addRoutes({ classes: [{ displayName: "Foo", kind: "Class", members: [] }] }, "/api1", categories);

		// initialize should clear Foo and add Bar
		linker.initialize({ classes: [{ displayName: "Bar", kind: "Class", members: [] }] }, "/api2", categories);

		const result = linker.addCrossLinks("Returns a Foo or Bar instance");
		expect(result).not.toContain("[Foo]");
		expect(result).toContain("[Bar](/api2/class/bar)");
	});
});

describe("cleanupAndCommit", () => {
	it("batch upserts snapshots for written files only", async () => {
		const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "cleanup-test-"));
		const dbPath = path.join(tmpDir, "test.db");
		const snapshotManager = new SnapshotManager(dbPath);

		const buildTime = new Date().toISOString();
		const results: FileWriteResult[] = [
			{
				relativePathWithExt: "class/foo.mdx",
				absolutePath: path.join(tmpDir, "class/foo.mdx"),
				status: "new",
				snapshot: {
					outputDir: tmpDir,
					filePath: "class/foo.mdx",
					publishedTime: buildTime,
					modifiedTime: buildTime,
					contentHash: "abc",
					frontmatterHash: "def",
					buildTime,
				},
				categoryKey: "classes",
				label: "Foo",
				routePath: "/api/class/foo",
			},
			{
				relativePathWithExt: "class/bar.mdx",
				absolutePath: path.join(tmpDir, "class/bar.mdx"),
				status: "unchanged",
				snapshot: {
					outputDir: tmpDir,
					filePath: "class/bar.mdx",
					publishedTime: buildTime,
					modifiedTime: buildTime,
					contentHash: "ghi",
					frontmatterHash: "jkl",
					buildTime,
				},
				categoryKey: "classes",
				label: "Bar",
				routePath: "/api/class/bar",
			},
		];

		await cleanupAndCommit({
			fileResults: results,
			snapshotManager,
			resolvedOutputDir: tmpDir,
			generatedFiles: new Set(["class/foo.mdx", "class/bar.mdx"]),
		});

		// Only written file should have a snapshot (not unchanged)
		const snapshots = snapshotManager.getSnapshotsForOutputDir(tmpDir);
		expect(snapshots.length).toBe(1);
		expect(snapshots[0].filePath).toBe("class/foo.mdx");

		snapshotManager.close();
		await fs.promises.rm(tmpDir, { recursive: true });
	});

	it("deletes orphaned files not in generatedFiles set", async () => {
		const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "orphan-test-"));
		const dbPath = path.join(tmpDir, "test.db");
		const snapshotManager = new SnapshotManager(dbPath);

		const orphanDir = path.join(tmpDir, "class");
		await fs.promises.mkdir(orphanDir, { recursive: true });
		await fs.promises.writeFile(path.join(orphanDir, "orphan.mdx"), "old content");

		await cleanupAndCommit({
			fileResults: [],
			snapshotManager,
			resolvedOutputDir: tmpDir,
			generatedFiles: new Set(),
		});

		const exists = await fs.promises
			.access(path.join(orphanDir, "orphan.mdx"))
			.then(() => true)
			.catch(() => false);
		expect(exists).toBe(false);

		snapshotManager.close();
		await fs.promises.rm(tmpDir, { recursive: true });
	});
});

describe("generateSinglePage", () => {
	it("generates a page result with valid hashes", async () => {
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

		const ctx: GenerateSinglePageContext = {
			existingSnapshots: new Map(),
			baseRoute: "/example-module",
			packageName: "example-module",
			apiScope: "example-module",
			buildTime: new Date().toISOString(),
			resolvedOutputDir: "/tmp/nonexistent-dir",
		};

		const result = await generateSinglePage(workItems[0], ctx);
		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
		expect(result.frontmatterHash).toMatch(/^[a-f0-9]{64}$/);
		expect(result.relativePathWithExt).toMatch(/\.mdx$/);
		expect(result.bodyContent.length).toBeGreaterThan(0);
	});

	it("returns null for unsupported item kinds", async () => {
		const fakeItem = { displayName: "Test", kind: 999 } as WorkItem["item"];
		const workItem: WorkItem = {
			item: fakeItem,
			categoryKey: "classes",
			categoryConfig: {
				folderName: "class",
				displayName: "Classes",
				singularName: "Class",
			} as WorkItem["categoryConfig"],
		};

		const ctx: GenerateSinglePageContext = {
			existingSnapshots: new Map(),
			baseRoute: "/test",
			packageName: "test",
			apiScope: "test",
			buildTime: new Date().toISOString(),
			resolvedOutputDir: "/tmp/nonexistent-dir",
		};

		const result = await generateSinglePage(workItem, ctx);
		expect(result).toBeNull();
	});

	it("marks unchanged when snapshot hashes match", async () => {
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
		const ctx: GenerateSinglePageContext = {
			existingSnapshots: new Map(),
			baseRoute: "/example-module",
			packageName: "example-module",
			apiScope: "example-module",
			buildTime,
			resolvedOutputDir: "/tmp/nonexistent-dir",
		};

		const first = await generateSinglePage(workItems[0], ctx);
		if (!first) throw new Error("Expected result");

		const snapshots = new Map();
		snapshots.set(first.relativePathWithExt, {
			outputDir: "/tmp/nonexistent-dir",
			filePath: first.relativePathWithExt,
			publishedTime: "2025-01-01T00:00:00.000Z",
			modifiedTime: "2025-01-01T00:00:00.000Z",
			contentHash: first.contentHash,
			frontmatterHash: first.frontmatterHash,
			buildTime,
		});

		const second = await generateSinglePage(workItems[0], {
			...ctx,
			existingSnapshots: snapshots,
		});
		expect(second).not.toBeNull();
		if (!second) throw new Error("Expected second result to be non-null");
		expect(second.isUnchanged).toBe(true);
		expect(second.publishedTime).toBe("2025-01-01T00:00:00.000Z");
	});
});

describe("writeSingleFile", () => {
	it("writes a changed file to disk and returns correct result", async () => {
		const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "write-single-"));

		const page: GeneratedPageResult = {
			workItem: {
				item: { displayName: "Foo" } as GeneratedPageResult["workItem"]["item"],
				categoryKey: "classes",
				categoryConfig: {
					folderName: "class",
					displayName: "Classes",
					singularName: "Class",
				} as GeneratedPageResult["workItem"]["categoryConfig"],
			},
			content: "---\ntitle: Foo\n---\n# Foo\n",
			bodyContent: "# Foo\n",
			frontmatter: { title: "Foo" },
			contentHash: "abc123",
			frontmatterHash: "def456",
			routePath: "/example-module/class/foo",
			relativePathWithExt: "class/foo.mdx",
			publishedTime: "2025-01-01T00:00:00.000Z",
			modifiedTime: "2025-01-01T00:00:00.000Z",
			isUnchanged: false,
		};

		const ctx: WriteSingleFileContext = {
			resolvedOutputDir: tmpDir,
			buildTime: new Date().toISOString(),
		};

		const result = await writeSingleFile(page, ctx);
		expect(result.status).toBe("new");
		expect(result.snapshot.contentHash).toBe("abc123");
		expect(result.snapshot.frontmatterHash).toBe("def456");
		expect(result.snapshot.filePath).toBe("class/foo.mdx");
		expect(result.label).toBe("Foo");
		expect(result.categoryKey).toBe("classes");

		const exists = await fs.promises
			.access(result.absolutePath)
			.then(() => true)
			.catch(() => false);
		expect(exists).toBe(true);

		await fs.promises.rm(tmpDir, { recursive: true });
	});

	it("skips write for unchanged files", async () => {
		const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "write-single-"));

		const page: GeneratedPageResult = {
			workItem: {
				item: { displayName: "Bar" } as GeneratedPageResult["workItem"]["item"],
				categoryKey: "classes",
				categoryConfig: {
					folderName: "class",
					displayName: "Classes",
					singularName: "Class",
				} as GeneratedPageResult["workItem"]["categoryConfig"],
			},
			content: "---\ntitle: Bar\n---\n# Bar\n",
			bodyContent: "# Bar\n",
			frontmatter: { title: "Bar" },
			contentHash: "abc",
			frontmatterHash: "def",
			routePath: "/example-module/class/bar",
			relativePathWithExt: "class/bar.mdx",
			publishedTime: "2025-01-01T00:00:00.000Z",
			modifiedTime: "2025-01-01T00:00:00.000Z",
			isUnchanged: true,
		};

		const ctx: WriteSingleFileContext = {
			resolvedOutputDir: tmpDir,
			buildTime: new Date().toISOString(),
		};

		const result = await writeSingleFile(page, ctx);
		expect(result.status).toBe("unchanged");

		const exists = await fs.promises
			.access(result.absolutePath)
			.then(() => true)
			.catch(() => false);
		expect(exists).toBe(false);

		await fs.promises.rm(tmpDir, { recursive: true });
	});
});

describe("Stream pipeline (native)", () => {
	it("streams items through generate → write → fold", async () => {
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

		const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "native-stream-"));

		const program = buildPipelineForApi({
			workItems,
			baseRoute: "/example-module",
			packageName: "example-module",
			apiScope: "example-module",
			buildTime: new Date().toISOString(),
			resolvedOutputDir: tmpDir,
			pageConcurrency: 2,
			existingSnapshots: new Map(),
		});

		const results = await Effect.runPromise(program);

		expect(results.length).toBe(workItems.length);
		const written = results.filter((r) => r.status !== "unchanged");
		expect(written.length).toBeGreaterThan(0);

		for (const r of written) {
			const exists = await fs.promises
				.access(r.absolutePath)
				.then(() => true)
				.catch(() => false);
			expect(exists).toBe(true);
		}

		await fs.promises.rm(tmpDir, { recursive: true });
	});

	it("includes unchanged files in results when snapshots match", async () => {
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

		const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "native-stream-2-"));
		const buildTime = new Date().toISOString();

		// First run: all new
		const firstResults = await Effect.runPromise(
			buildPipelineForApi({
				workItems,
				baseRoute: "/example-module",
				packageName: "example-module",
				apiScope: "example-module",
				buildTime,
				resolvedOutputDir: tmpDir,
				pageConcurrency: 2,
				existingSnapshots: new Map(),
			}),
		);

		// Build snapshot map
		const snapshots = new Map<string, (typeof firstResults)[number]["snapshot"]>();
		for (const r of firstResults) {
			snapshots.set(r.snapshot.filePath, r.snapshot);
		}

		// Second run: all unchanged
		const secondResults = await Effect.runPromise(
			buildPipelineForApi({
				workItems,
				baseRoute: "/example-module",
				packageName: "example-module",
				apiScope: "example-module",
				buildTime,
				resolvedOutputDir: tmpDir,
				pageConcurrency: 2,
				existingSnapshots: snapshots,
			}),
		);

		// ALL items must still appear (not filtered)
		expect(secondResults.length).toBe(workItems.length);
		const unchanged = secondResults.filter((r) => r.status === "unchanged");
		expect(unchanged.length).toBe(workItems.length);

		await fs.promises.rm(tmpDir, { recursive: true });
	});
});
