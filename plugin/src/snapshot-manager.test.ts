import fs, { promises as fsPromises } from "node:fs";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { afterEach, beforeEach, describe, expect, it, test } from "vitest";
import { SnapshotManager } from "./snapshot-manager.js";

describe("SnapshotManager", () => {
	let tempDir: string;
	let dbPath: string;
	let manager: SnapshotManager;

	beforeEach(() => {
		// Create temporary directory for test database
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-test-"));
		dbPath = path.join(tempDir, "test.db");
		manager = new SnapshotManager(dbPath);
	});

	afterEach(() => {
		// Clean up
		manager.close();
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	describe("hashContent", () => {
		test("generates consistent hash for same content", () => {
			const content = "# Hello World\n\nThis is some markdown content.";
			const hash1 = SnapshotManager.hashContent(content);
			const hash2 = SnapshotManager.hashContent(content);

			expect(hash1).toBe(hash2);
			expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
		});

		test("generates different hash for different content", () => {
			const content1 = "# Hello World";
			const content2 = "# Hello Universe";
			const hash1 = SnapshotManager.hashContent(content1);
			const hash2 = SnapshotManager.hashContent(content2);

			expect(hash1).not.toBe(hash2);
		});

		test("is sensitive to whitespace changes", () => {
			const content1 = "Hello World";
			const content2 = "Hello  World"; // Extra space
			const hash1 = SnapshotManager.hashContent(content1);
			const hash2 = SnapshotManager.hashContent(content2);

			expect(hash1).not.toBe(hash2);
		});
	});

	describe("hashFrontmatter", () => {
		test("excludes timestamp fields from hash", () => {
			const frontmatter1 = {
				title: "My Page",
				description: "A test page",
				publishedTime: "2024-01-01T00:00:00.000Z",
				modifiedTime: "2024-01-01T00:00:00.000Z",
			};

			const frontmatter2 = {
				title: "My Page",
				description: "A test page",
				publishedTime: "2024-12-31T23:59:59.999Z", // Different timestamps
				modifiedTime: "2024-12-31T23:59:59.999Z",
			};

			const hash1 = SnapshotManager.hashFrontmatter(frontmatter1);
			const hash2 = SnapshotManager.hashFrontmatter(frontmatter2);

			// Hashes should be identical because timestamps are excluded
			expect(hash1).toBe(hash2);
		});

		test("excludes head array with OG timestamps from hash", () => {
			const frontmatter1 = {
				title: "My Page",
				head: [
					["meta", { property: "article:published_time", content: "2024-01-01T00:00:00.000Z" }],
					["meta", { property: "article:modified_time", content: "2024-01-01T00:00:00.000Z" }],
				],
			};

			const frontmatter2 = {
				title: "My Page",
				head: [
					["meta", { property: "article:published_time", content: "2024-12-31T23:59:59.999Z" }],
					["meta", { property: "article:modified_time", content: "2024-12-31T23:59:59.999Z" }],
				],
			};

			const hash1 = SnapshotManager.hashFrontmatter(frontmatter1);
			const hash2 = SnapshotManager.hashFrontmatter(frontmatter2);

			// Hashes should be identical because head array is excluded
			expect(hash1).toBe(hash2);
		});

		test("detects changes in non-timestamp fields", () => {
			const frontmatter1 = {
				title: "My Page",
				description: "Original description",
				publishedTime: "2024-01-01T00:00:00.000Z",
				modifiedTime: "2024-01-01T00:00:00.000Z",
			};

			const frontmatter2 = {
				title: "My Page",
				description: "Updated description", // Changed
				publishedTime: "2024-01-01T00:00:00.000Z",
				modifiedTime: "2024-01-01T00:00:00.000Z",
			};

			const hash1 = SnapshotManager.hashFrontmatter(frontmatter1);
			const hash2 = SnapshotManager.hashFrontmatter(frontmatter2);

			// Hashes should be different because description changed
			expect(hash1).not.toBe(hash2);
		});

		test("produces consistent hash regardless of field order", () => {
			const frontmatter1 = {
				title: "My Page",
				description: "A test page",
				author: "John Doe",
			};

			const frontmatter2 = {
				author: "John Doe",
				description: "A test page",
				title: "My Page",
			};

			const hash1 = SnapshotManager.hashFrontmatter(frontmatter1);
			const hash2 = SnapshotManager.hashFrontmatter(frontmatter2);

			// Hashes should be identical because keys are sorted
			expect(hash1).toBe(hash2);
		});
	});

	describe("snapshot lifecycle", () => {
		const outputDir = "/docs/api";
		const buildTime1 = "2024-01-01T10:00:00.000Z";
		const buildTime2 = "2024-01-02T10:00:00.000Z";
		const buildTime3 = "2024-01-03T10:00:00.000Z";

		test("first build: creates new snapshot with matching timestamps", () => {
			const filePath = "classes/MyClass.mdx";
			const contentHash = "hash-content-1";
			const frontmatterHash = "hash-frontmatter-1";

			manager.upsertSnapshot({
				outputDir,
				filePath,
				publishedTime: buildTime1,
				modifiedTime: buildTime1,
				contentHash,
				frontmatterHash,
				buildTime: buildTime1,
			});

			const snapshots = manager.getSnapshotsForOutputDir(outputDir);
			expect(snapshots).toHaveLength(1);
			expect(snapshots[0]).toMatchObject({
				filePath,
				publishedTime: buildTime1,
				modifiedTime: buildTime1,
				contentHash,
				frontmatterHash,
			});
		});

		test("second build with no changes: preserves both timestamps", () => {
			const filePath = "classes/MyClass.mdx";
			const contentHash = "hash-content-1";
			const frontmatterHash = "hash-frontmatter-1";

			// First build
			manager.upsertSnapshot({
				outputDir,
				filePath,
				publishedTime: buildTime1,
				modifiedTime: buildTime1,
				contentHash,
				frontmatterHash,
				buildTime: buildTime1,
			});

			// Second build - same hashes (unchanged)
			manager.upsertSnapshot({
				outputDir,
				filePath,
				publishedTime: buildTime1, // Preserved
				modifiedTime: buildTime1, // Preserved
				contentHash, // Same
				frontmatterHash, // Same
				buildTime: buildTime2,
			});

			const snapshots = manager.getSnapshotsForOutputDir(outputDir);
			expect(snapshots).toHaveLength(1);
			expect(snapshots[0]).toMatchObject({
				filePath,
				publishedTime: buildTime1, // Still original
				modifiedTime: buildTime1, // Still original
				contentHash,
				frontmatterHash,
			});
		});

		test("content changed: preserves published time, updates modified time", () => {
			const filePath = "classes/MyClass.mdx";
			const contentHash1 = "hash-content-1";
			const contentHash2 = "hash-content-2";
			const frontmatterHash = "hash-frontmatter-1";

			// First build
			manager.upsertSnapshot({
				outputDir,
				filePath,
				publishedTime: buildTime1,
				modifiedTime: buildTime1,
				contentHash: contentHash1,
				frontmatterHash,
				buildTime: buildTime1,
			});

			// Second build - content changed
			manager.upsertSnapshot({
				outputDir,
				filePath,
				publishedTime: buildTime1, // Preserved
				modifiedTime: buildTime2, // Updated
				contentHash: contentHash2, // Changed
				frontmatterHash, // Same
				buildTime: buildTime2,
			});

			const snapshots = manager.getSnapshotsForOutputDir(outputDir);
			expect(snapshots).toHaveLength(1);
			expect(snapshots[0]).toMatchObject({
				filePath,
				publishedTime: buildTime1, // Original
				modifiedTime: buildTime2, // Updated
				contentHash: contentHash2,
				frontmatterHash,
			});
		});

		test("frontmatter changed: preserves published time, updates modified time", () => {
			const filePath = "classes/MyClass.mdx";
			const contentHash = "hash-content-1";
			const frontmatterHash1 = "hash-frontmatter-1";
			const frontmatterHash2 = "hash-frontmatter-2";

			// First build
			manager.upsertSnapshot({
				outputDir,
				filePath,
				publishedTime: buildTime1,
				modifiedTime: buildTime1,
				contentHash,
				frontmatterHash: frontmatterHash1,
				buildTime: buildTime1,
			});

			// Second build - frontmatter changed (e.g., description updated)
			manager.upsertSnapshot({
				outputDir,
				filePath,
				publishedTime: buildTime1, // Preserved
				modifiedTime: buildTime2, // Updated
				contentHash, // Same
				frontmatterHash: frontmatterHash2, // Changed
				buildTime: buildTime2,
			});

			const snapshots = manager.getSnapshotsForOutputDir(outputDir);
			expect(snapshots).toHaveLength(1);
			expect(snapshots[0]).toMatchObject({
				filePath,
				publishedTime: buildTime1, // Original
				modifiedTime: buildTime2, // Updated
				contentHash,
				frontmatterHash: frontmatterHash2,
			});
		});

		test("multiple changes over time: published time never changes", () => {
			const filePath = "classes/MyClass.mdx";

			// Build 1: Initial creation
			manager.upsertSnapshot({
				outputDir,
				filePath,
				publishedTime: buildTime1,
				modifiedTime: buildTime1,
				contentHash: "hash-1",
				frontmatterHash: "hash-fm-1",
				buildTime: buildTime1,
			});

			// Build 2: Content changed
			manager.upsertSnapshot({
				outputDir,
				filePath,
				publishedTime: buildTime1, // Preserved
				modifiedTime: buildTime2, // Updated
				contentHash: "hash-2",
				frontmatterHash: "hash-fm-1",
				buildTime: buildTime2,
			});

			// Build 3: Frontmatter changed
			manager.upsertSnapshot({
				outputDir,
				filePath,
				publishedTime: buildTime1, // Still preserved
				modifiedTime: buildTime3, // Updated again
				contentHash: "hash-2",
				frontmatterHash: "hash-fm-2",
				buildTime: buildTime3,
			});

			const snapshots = manager.getSnapshotsForOutputDir(outputDir);
			expect(snapshots).toHaveLength(1);
			expect(snapshots[0]).toMatchObject({
				filePath,
				publishedTime: buildTime1, // Never changed!
				modifiedTime: buildTime3, // Latest modification
			});
		});
	});

	describe("cleanupStaleFiles", () => {
		const outputDir = "/docs/api";
		const buildTime = "2024-01-01T10:00:00.000Z";

		test("removes files that are no longer generated", () => {
			// First build generates 3 files
			manager.upsertSnapshot({
				outputDir,
				filePath: "classes/ClassA.mdx",
				publishedTime: buildTime,
				modifiedTime: buildTime,
				contentHash: "hash-1",
				frontmatterHash: "hash-fm-1",
				buildTime,
			});

			manager.upsertSnapshot({
				outputDir,
				filePath: "classes/ClassB.mdx",
				publishedTime: buildTime,
				modifiedTime: buildTime,
				contentHash: "hash-2",
				frontmatterHash: "hash-fm-2",
				buildTime,
			});

			manager.upsertSnapshot({
				outputDir,
				filePath: "interfaces/InterfaceA.mdx",
				publishedTime: buildTime,
				modifiedTime: buildTime,
				contentHash: "hash-3",
				frontmatterHash: "hash-fm-3",
				buildTime,
			});

			expect(manager.getSnapshotsForOutputDir(outputDir)).toHaveLength(3);

			// Second build only generates 2 files (ClassB was removed from source)
			const currentFiles = new Set(["classes/ClassA.mdx", "interfaces/InterfaceA.mdx"]);

			const staleFiles = manager.cleanupStaleFiles(outputDir, currentFiles);

			expect(staleFiles).toEqual(["classes/ClassB.mdx"]);
			expect(manager.getSnapshotsForOutputDir(outputDir)).toHaveLength(2);
		});

		test("removes no files when all are still generated", () => {
			manager.upsertSnapshot({
				outputDir,
				filePath: "classes/ClassA.mdx",
				publishedTime: buildTime,
				modifiedTime: buildTime,
				contentHash: "hash-1",
				frontmatterHash: "hash-fm-1",
				buildTime,
			});

			const currentFiles = new Set(["classes/ClassA.mdx"]);
			const staleFiles = manager.cleanupStaleFiles(outputDir, currentFiles);

			expect(staleFiles).toEqual([]);
			expect(manager.getSnapshotsForOutputDir(outputDir)).toHaveLength(1);
		});

		test("removes all files when none are generated", () => {
			manager.upsertSnapshot({
				outputDir,
				filePath: "classes/ClassA.mdx",
				publishedTime: buildTime,
				modifiedTime: buildTime,
				contentHash: "hash-1",
				frontmatterHash: "hash-fm-1",
				buildTime,
			});

			const currentFiles = new Set<string>([]);
			const staleFiles = manager.cleanupStaleFiles(outputDir, currentFiles);

			expect(staleFiles).toEqual(["classes/ClassA.mdx"]);
			expect(manager.getSnapshotsForOutputDir(outputDir)).toHaveLength(0);
		});
	});

	describe("multiple output directories", () => {
		const buildTime = "2024-01-01T10:00:00.000Z";

		test("isolates snapshots by output directory", () => {
			// Add snapshots for different output directories
			manager.upsertSnapshot({
				outputDir: "/docs/api-v1",
				filePath: "classes/MyClass.mdx",
				publishedTime: buildTime,
				modifiedTime: buildTime,
				contentHash: "hash-1",
				frontmatterHash: "hash-fm-1",
				buildTime,
			});

			manager.upsertSnapshot({
				outputDir: "/docs/api-v2",
				filePath: "classes/MyClass.mdx",
				publishedTime: buildTime,
				modifiedTime: buildTime,
				contentHash: "hash-2",
				frontmatterHash: "hash-fm-2",
				buildTime,
			});

			const v1Snapshots = manager.getSnapshotsForOutputDir("/docs/api-v1");
			const v2Snapshots = manager.getSnapshotsForOutputDir("/docs/api-v2");

			expect(v1Snapshots).toHaveLength(1);
			expect(v2Snapshots).toHaveLength(1);
			expect(v1Snapshots[0].contentHash).toBe("hash-1");
			expect(v2Snapshots[0].contentHash).toBe("hash-2");
		});

		test("cleanup only affects specified output directory", () => {
			manager.upsertSnapshot({
				outputDir: "/docs/api-v1",
				filePath: "classes/MyClass.mdx",
				publishedTime: buildTime,
				modifiedTime: buildTime,
				contentHash: "hash-1",
				frontmatterHash: "hash-fm-1",
				buildTime,
			});

			manager.upsertSnapshot({
				outputDir: "/docs/api-v2",
				filePath: "classes/MyClass.mdx",
				publishedTime: buildTime,
				modifiedTime: buildTime,
				contentHash: "hash-2",
				frontmatterHash: "hash-fm-2",
				buildTime,
			});

			// Clean up v1 (no current files)
			const staleFiles = manager.cleanupStaleFiles("/docs/api-v1", new Set());

			expect(staleFiles).toEqual(["classes/MyClass.mdx"]);
			expect(manager.getSnapshotsForOutputDir("/docs/api-v1")).toHaveLength(0);
			expect(manager.getSnapshotsForOutputDir("/docs/api-v2")).toHaveLength(1); // Unchanged
		});
	});

	describe("realistic workflow simulation", () => {
		const outputDir = "/docs/api";

		test("simulates three builds with various changes", () => {
			const buildTime1 = "2024-01-01T10:00:00.000Z";
			const buildTime2 = "2024-01-02T10:00:00.000Z";
			const buildTime3 = "2024-01-03T10:00:00.000Z";

			// Build 1: Initial creation of 3 files
			const file1Content = "# MyClass\n\nA class implementation.";
			const file1Frontmatter = { title: "MyClass", description: "A class" };
			const file1ContentHash1 = SnapshotManager.hashContent(file1Content);
			const file1FrontmatterHash1 = SnapshotManager.hashFrontmatter(file1Frontmatter);

			const file2Content = "# MyInterface\n\nAn interface definition.";
			const file2Frontmatter = { title: "MyInterface", description: "An interface" };
			const file2ContentHash1 = SnapshotManager.hashContent(file2Content);
			const file2FrontmatterHash1 = SnapshotManager.hashFrontmatter(file2Frontmatter);

			const file3Content = "# MyFunction\n\nA function.";
			const file3Frontmatter = { title: "MyFunction", description: "A function" };
			const file3ContentHash1 = SnapshotManager.hashContent(file3Content);
			const file3FrontmatterHash1 = SnapshotManager.hashFrontmatter(file3Frontmatter);

			manager.upsertSnapshot({
				outputDir,
				filePath: "classes/MyClass.mdx",
				publishedTime: buildTime1,
				modifiedTime: buildTime1,
				contentHash: file1ContentHash1,
				frontmatterHash: file1FrontmatterHash1,
				buildTime: buildTime1,
			});

			manager.upsertSnapshot({
				outputDir,
				filePath: "interfaces/MyInterface.mdx",
				publishedTime: buildTime1,
				modifiedTime: buildTime1,
				contentHash: file2ContentHash1,
				frontmatterHash: file2FrontmatterHash1,
				buildTime: buildTime1,
			});

			manager.upsertSnapshot({
				outputDir,
				filePath: "functions/MyFunction.mdx",
				publishedTime: buildTime1,
				modifiedTime: buildTime1,
				contentHash: file3ContentHash1,
				frontmatterHash: file3FrontmatterHash1,
				buildTime: buildTime1,
			});

			let snapshots = manager.getSnapshotsForOutputDir(outputDir);
			expect(snapshots).toHaveLength(3);
			expect(snapshots.every((s) => s.publishedTime === buildTime1)).toBe(true);
			expect(snapshots.every((s) => s.modifiedTime === buildTime1)).toBe(true);

			// Build 2: MyClass content changed, MyInterface unchanged, MyFunction description changed
			const file1ContentUpdated = "# MyClass\n\nA class implementation with more details.";
			const file1ContentHash2 = SnapshotManager.hashContent(file1ContentUpdated);

			const file3FrontmatterUpdated = { title: "MyFunction", description: "A utility function" };
			const file3FrontmatterHash2 = SnapshotManager.hashFrontmatter(file3FrontmatterUpdated);

			// Get previous snapshots
			const prevSnapshots = new Map(snapshots.map((s) => [s.filePath, s]));

			// MyClass: content changed
			const file1Prev = prevSnapshots.get("classes/MyClass.mdx");
			if (!file1Prev) throw new Error("Expected MyClass snapshot to exist");
			const file1Changed = file1Prev.contentHash !== file1ContentHash2;
			manager.upsertSnapshot({
				outputDir,
				filePath: "classes/MyClass.mdx",
				publishedTime: file1Prev.publishedTime, // Preserve
				modifiedTime: file1Changed ? buildTime2 : file1Prev.modifiedTime, // Update
				contentHash: file1ContentHash2,
				frontmatterHash: file1FrontmatterHash1,
				buildTime: buildTime2,
			});

			// MyInterface: unchanged
			const file2Prev = prevSnapshots.get("interfaces/MyInterface.mdx");
			if (!file2Prev) throw new Error("Expected MyInterface snapshot to exist");
			manager.upsertSnapshot({
				outputDir,
				filePath: "interfaces/MyInterface.mdx",
				publishedTime: file2Prev.publishedTime, // Preserve
				modifiedTime: file2Prev.modifiedTime, // Preserve
				contentHash: file2ContentHash1,
				frontmatterHash: file2FrontmatterHash1,
				buildTime: buildTime2,
			});

			// MyFunction: frontmatter changed
			const file3Prev = prevSnapshots.get("functions/MyFunction.mdx");
			if (!file3Prev) throw new Error("Expected MyFunction snapshot to exist");
			const file3Changed = file3Prev.frontmatterHash !== file3FrontmatterHash2;
			manager.upsertSnapshot({
				outputDir,
				filePath: "functions/MyFunction.mdx",
				publishedTime: file3Prev.publishedTime, // Preserve
				modifiedTime: file3Changed ? buildTime2 : file3Prev.modifiedTime, // Update
				contentHash: file3ContentHash1,
				frontmatterHash: file3FrontmatterHash2,
				buildTime: buildTime2,
			});

			snapshots = manager.getSnapshotsForOutputDir(outputDir);
			expect(snapshots).toHaveLength(3);

			const class1 = snapshots.find((s) => s.filePath === "classes/MyClass.mdx");
			if (!class1) throw new Error("Expected MyClass snapshot to exist");
			expect(class1.publishedTime).toBe(buildTime1); // Preserved
			expect(class1.modifiedTime).toBe(buildTime2); // Updated

			const interface1 = snapshots.find((s) => s.filePath === "interfaces/MyInterface.mdx");
			if (!interface1) throw new Error("Expected MyInterface snapshot to exist");
			expect(interface1.publishedTime).toBe(buildTime1); // Preserved
			expect(interface1.modifiedTime).toBe(buildTime1); // Unchanged!

			const func1 = snapshots.find((s) => s.filePath === "functions/MyFunction.mdx");
			if (!func1) throw new Error("Expected MyFunction snapshot to exist");
			expect(func1.publishedTime).toBe(buildTime1); // Preserved
			expect(func1.modifiedTime).toBe(buildTime2); // Updated

			// Build 3: Remove MyFunction, add new MyType, MyClass unchanged
			const file4Content = "# MyType\n\nA type alias.";
			const file4Frontmatter = { title: "MyType", description: "A type" };
			const file4ContentHash = SnapshotManager.hashContent(file4Content);
			const file4FrontmatterHash = SnapshotManager.hashFrontmatter(file4Frontmatter);

			const currentFiles = new Set(["classes/MyClass.mdx", "interfaces/MyInterface.mdx", "types/MyType.mdx"]);

			// Clean up stale files first
			const staleFiles = manager.cleanupStaleFiles(outputDir, currentFiles);
			expect(staleFiles).toEqual(["functions/MyFunction.mdx"]);

			// Get remaining snapshots
			snapshots = manager.getSnapshotsForOutputDir(outputDir);
			const prevSnapshots3 = new Map(snapshots.map((s) => [s.filePath, s]));

			// MyClass: unchanged
			const file1Prev3 = prevSnapshots3.get("classes/MyClass.mdx");
			if (!file1Prev3) throw new Error("Expected MyClass snapshot to exist");
			manager.upsertSnapshot({
				outputDir,
				filePath: "classes/MyClass.mdx",
				publishedTime: file1Prev3.publishedTime,
				modifiedTime: file1Prev3.modifiedTime,
				contentHash: file1ContentHash2,
				frontmatterHash: file1FrontmatterHash1,
				buildTime: buildTime3,
			});

			// MyInterface: unchanged
			const file2Prev3 = prevSnapshots3.get("interfaces/MyInterface.mdx");
			if (!file2Prev3) throw new Error("Expected MyInterface snapshot to exist");
			manager.upsertSnapshot({
				outputDir,
				filePath: "interfaces/MyInterface.mdx",
				publishedTime: file2Prev3.publishedTime,
				modifiedTime: file2Prev3.modifiedTime,
				contentHash: file2ContentHash1,
				frontmatterHash: file2FrontmatterHash1,
				buildTime: buildTime3,
			});

			// MyType: new file
			manager.upsertSnapshot({
				outputDir,
				filePath: "types/MyType.mdx",
				publishedTime: buildTime3, // New
				modifiedTime: buildTime3, // New
				contentHash: file4ContentHash,
				frontmatterHash: file4FrontmatterHash,
				buildTime: buildTime3,
			});

			snapshots = manager.getSnapshotsForOutputDir(outputDir);
			expect(snapshots).toHaveLength(3);

			const class3 = snapshots.find((s) => s.filePath === "classes/MyClass.mdx");
			if (!class3) throw new Error("Expected MyClass snapshot to exist");
			expect(class3.publishedTime).toBe(buildTime1); // Original
			expect(class3.modifiedTime).toBe(buildTime2); // From build 2

			const interface3 = snapshots.find((s) => s.filePath === "interfaces/MyInterface.mdx");
			if (!interface3) throw new Error("Expected MyInterface snapshot to exist");
			expect(interface3.publishedTime).toBe(buildTime1); // Original
			expect(interface3.modifiedTime).toBe(buildTime1); // Never changed!

			const type3 = snapshots.find((s) => s.filePath === "types/MyType.mdx");
			if (!type3) throw new Error("Expected MyType snapshot to exist");
			expect(type3.publishedTime).toBe(buildTime3); // New file
			expect(type3.modifiedTime).toBe(buildTime3); // New file
		});
	});

	describe("Disk Fallback Logic", () => {
		let outputDir: string;

		beforeEach(async () => {
			// Create output directory for fallback tests
			outputDir = path.join(tempDir, "docs");
			await fsPromises.mkdir(outputDir, { recursive: true });
		});

		describe("MDX File Fallback", () => {
			it("should preserve timestamps when file content matches", async () => {
				// Arrange: Create existing file with timestamps
				const publishedTime = "2024-01-01T00:00:00.000Z";
				const modifiedTime = "2024-06-15T12:00:00.000Z";
				const content = "Test content";
				const frontmatter = {
					title: "Test Page",
					description: "Test description",
					head: [
						["meta", { property: "article:published_time", content: publishedTime }],
						["meta", { property: "article:modified_time", content: modifiedTime }],
					],
				};

				const existingFile = matter.stringify(content, frontmatter);
				const filePath = path.join(outputDir, "test.mdx");
				await fsPromises.writeFile(filePath, existingFile);

				// Act: Read file and simulate fallback logic
				const existingContent = await fsPromises.readFile(filePath, "utf-8");
				const { data: existingFrontmatter, content: existingBody } = matter(existingContent);
				const existingContentHash = SnapshotManager.hashContent(existingBody);
				const existingFrontmatterHash = SnapshotManager.hashFrontmatter(existingFrontmatter);

				// Simulate new content being identical
				const newContentHash = SnapshotManager.hashContent(content);
				const newFrontmatterHash = SnapshotManager.hashFrontmatter(frontmatter);

				// Assert: Hashes should match
				expect(existingContentHash).toBe(newContentHash);
				expect(existingFrontmatterHash).toBe(newFrontmatterHash);

				// Verify timestamps can be extracted
				const extractedPublished = existingFrontmatter.head?.find(
					([_tag, attrs]: [string, Record<string, string>]) => attrs.property === "article:published_time",
				)?.[1]?.content;
				const extractedModified = existingFrontmatter.head?.find(
					([_tag, attrs]: [string, Record<string, string>]) => attrs.property === "article:modified_time",
				)?.[1]?.content;

				expect(extractedPublished).toBe(publishedTime);
				expect(extractedModified).toBe(modifiedTime);
			});

			it("should detect changes in content", async () => {
				// Arrange: Create existing file
				const content = "Original content";
				const frontmatter = {
					title: "Test Page",
					head: [
						["meta", { property: "article:published_time", content: "2024-01-01T00:00:00.000Z" }],
						["meta", { property: "article:modified_time", content: "2024-06-15T12:00:00.000Z" }],
					],
				};

				const existingFile = matter.stringify(content, frontmatter);
				const filePath = path.join(outputDir, "test.mdx");
				await fsPromises.writeFile(filePath, existingFile);

				// Act: Compare with changed content
				const existingContent = await fsPromises.readFile(filePath, "utf-8");
				const { data: existingFrontmatter, content: existingBody } = matter(existingContent);
				const existingContentHash = SnapshotManager.hashContent(existingBody);

				const newContent = "Modified content";
				const newContentHash = SnapshotManager.hashContent(newContent);

				// Assert: Hashes should differ
				expect(existingContentHash).not.toBe(newContentHash);

				// Frontmatter hash should be same (timestamps excluded)
				const existingFrontmatterHash = SnapshotManager.hashFrontmatter(existingFrontmatter);
				const newFrontmatterHash = SnapshotManager.hashFrontmatter(frontmatter);
				expect(existingFrontmatterHash).toBe(newFrontmatterHash);
			});

			it("should detect changes in frontmatter (excluding timestamps)", async () => {
				// Arrange: Create existing file
				const content = "Test content";
				const originalFrontmatter = {
					title: "Original Title",
					description: "Original description",
					head: [
						["meta", { property: "article:published_time", content: "2024-01-01T00:00:00.000Z" }],
						["meta", { property: "article:modified_time", content: "2024-06-15T12:00:00.000Z" }],
					],
				};

				const existingFile = matter.stringify(content, originalFrontmatter);
				const filePath = path.join(outputDir, "test.mdx");
				await fsPromises.writeFile(filePath, existingFile);

				// Act: Compare with changed frontmatter
				const existingContent = await fsPromises.readFile(filePath, "utf-8");
				const { data: existingFrontmatter } = matter(existingContent);
				const existingFrontmatterHash = SnapshotManager.hashFrontmatter(existingFrontmatter);

				const newFrontmatter = {
					title: "Updated Title",
					description: "Original description",
					head: [
						["meta", { property: "article:published_time", content: "2024-01-01T00:00:00.000Z" }],
						["meta", { property: "article:modified_time", content: "2024-12-01T00:00:00.000Z" }], // Different timestamp
					],
				};
				const newFrontmatterHash = SnapshotManager.hashFrontmatter(newFrontmatter);

				// Assert: Frontmatter hashes should differ (title changed)
				expect(existingFrontmatterHash).not.toBe(newFrontmatterHash);
			});

			it("should ignore timestamp-only changes in frontmatter", async () => {
				// Arrange: Create existing file
				const content = "Test content";
				const originalFrontmatter = {
					title: "Test Title",
					description: "Test description",
					head: [
						["meta", { property: "article:published_time", content: "2024-01-01T00:00:00.000Z" }],
						["meta", { property: "article:modified_time", content: "2024-06-15T12:00:00.000Z" }],
					],
				};

				const existingFile = matter.stringify(content, originalFrontmatter);
				const filePath = path.join(outputDir, "test.mdx");
				await fsPromises.writeFile(filePath, existingFile);

				// Act: Compare with same frontmatter but different timestamps
				const existingContent = await fsPromises.readFile(filePath, "utf-8");
				const { data: existingFrontmatter } = matter(existingContent);
				const existingFrontmatterHash = SnapshotManager.hashFrontmatter(existingFrontmatter);

				const newFrontmatter = {
					title: "Test Title",
					description: "Test description",
					head: [
						["meta", { property: "article:published_time", content: "2024-01-01T00:00:00.000Z" }],
						["meta", { property: "article:modified_time", content: "2024-12-01T00:00:00.000Z" }], // Different timestamp
					],
				};
				const newFrontmatterHash = SnapshotManager.hashFrontmatter(newFrontmatter);

				// Assert: Frontmatter hashes should be same (timestamps excluded from hash)
				expect(existingFrontmatterHash).toBe(newFrontmatterHash);
			});
		});

		describe("_meta.json File Fallback", () => {
			it("should detect no changes when JSON content matches (different formatting)", async () => {
				// Arrange: Create existing file with compact formatting
				const existingData = {
					type: "section-header",
					label: "API Reference",
					overviewHeaders: [2],
				};
				const existingContent = JSON.stringify(existingData, null, 2); // 2 spaces
				const filePath = path.join(outputDir, "_meta.json");
				await fsPromises.writeFile(filePath, existingContent);

				// Act: Compare with same content but different formatting
				const newData = {
					type: "section-header",
					label: "API Reference",
					overviewHeaders: [2],
				};
				const newContent = JSON.stringify(newData, null, "\t"); // tabs

				// Normalize both sides
				const existingFileContent = await fsPromises.readFile(filePath, "utf-8");
				const existingParsed = JSON.parse(existingFileContent);
				const normalizedExisting = JSON.stringify(existingParsed, null, "\t");
				const normalizedNew = newContent;

				// Assert: Normalized content should match
				expect(normalizedExisting).toBe(normalizedNew);
			});

			it("should detect changes in JSON content", async () => {
				// Arrange: Create existing file
				const existingData = {
					type: "section-header",
					label: "API Reference",
					overviewHeaders: [2],
				};
				const existingContent = JSON.stringify(existingData, null, "\t");
				const filePath = path.join(outputDir, "_meta.json");
				await fsPromises.writeFile(filePath, existingContent);

				// Act: Compare with changed content
				const newData = {
					type: "section-header",
					label: "API Documentation", // Changed
					overviewHeaders: [2],
				};
				const newContent = JSON.stringify(newData, null, "\t");

				// Normalize both sides
				const existingFileContent = await fsPromises.readFile(filePath, "utf-8");
				const existingParsed = JSON.parse(existingFileContent);
				const normalizedExisting = JSON.stringify(existingParsed, null, "\t");
				const normalizedNew = newContent;

				// Assert: Normalized content should differ
				expect(normalizedExisting).not.toBe(normalizedNew);
			});

			it("should handle array formatting variations", async () => {
				// Arrange: Create existing file with compact array
				const existingData = {
					overviewHeaders: [2],
				};
				const existingContent = JSON.stringify(existingData, null, "\t");
				const filePath = path.join(outputDir, "_meta.json");
				await fsPromises.writeFile(filePath, existingContent);

				// Act: Manually create content with expanded array formatting
				const manualContent = `{
	"overviewHeaders": [
		2
	]
}`;
				await fsPromises.writeFile(filePath, manualContent);

				// Compare with compact formatting
				const newData = {
					overviewHeaders: [2],
				};
				const newContent = JSON.stringify(newData, null, "\t");

				// Normalize both sides
				const existingFileContent = await fsPromises.readFile(filePath, "utf-8");
				const existingParsed = JSON.parse(existingFileContent);
				const normalizedExisting = JSON.stringify(existingParsed, null, "\t");
				const normalizedNew = newContent;

				// Assert: Should match after normalization
				expect(normalizedExisting).toBe(normalizedNew);
			});

			it("should handle complex nested structures", async () => {
				// Arrange: Create existing file with complex structure
				const existingData = [
					{
						type: "section-header",
						label: "Classes",
					},
					{
						type: "file",
						name: "MyClass",
						label: "MyClass",
						overviewHeaders: [2, 3],
					},
				];
				const existingContent = JSON.stringify(existingData, null, 2); // 2 spaces
				const filePath = path.join(outputDir, "_meta.json");
				await fsPromises.writeFile(filePath, existingContent);

				// Act: Compare with same content but tab formatting
				const newData = [
					{
						type: "section-header",
						label: "Classes",
					},
					{
						type: "file",
						name: "MyClass",
						label: "MyClass",
						overviewHeaders: [2, 3],
					},
				];
				const newContent = JSON.stringify(newData, null, "\t"); // tabs

				// Normalize both sides
				const existingFileContent = await fsPromises.readFile(filePath, "utf-8");
				const existingParsed = JSON.parse(existingFileContent);
				const normalizedExisting = JSON.stringify(existingParsed, null, "\t");
				const normalizedNew = newContent;

				// Assert: Should match after normalization
				expect(normalizedExisting).toBe(normalizedNew);
			});
		});

		describe("File Existence Detection", () => {
			it("should detect non-existent file", async () => {
				// Act: Check for file that doesn't exist
				const filePath = path.join(outputDir, "nonexistent.mdx");
				const exists = await fsPromises
					.access(filePath)
					.then(() => true)
					.catch(() => false);

				// Assert: Should be false
				expect(exists).toBe(false);
			});

			it("should detect existing file", async () => {
				// Arrange: Create file
				const filePath = path.join(outputDir, "exists.mdx");
				await fsPromises.writeFile(filePath, "content");

				// Act: Check for file existence
				const exists = await fsPromises
					.access(filePath)
					.then(() => true)
					.catch(() => false);

				// Assert: Should be true
				expect(exists).toBe(true);
			});
		});

		describe("Timestamp Extraction", () => {
			it("should extract timestamps from head array in frontmatter", async () => {
				// Arrange: Create file with timestamps in head array
				const publishedTime = "2024-01-01T00:00:00.000Z";
				const modifiedTime = "2024-06-15T12:00:00.000Z";
				const frontmatter: { title: string; head: [string, Record<string, string>][] } = {
					title: "Test",
					head: [
						["meta", { property: "og:title", content: "Test" }],
						["meta", { property: "article:published_time", content: publishedTime }],
						["meta", { property: "article:modified_time", content: modifiedTime }],
						["meta", { property: "og:description", content: "Test description" }],
					],
				};

				// Act: Extract timestamps
				const extractedPublished = frontmatter.head.find(
					([_tag, attrs]) => attrs.property === "article:published_time",
				)?.[1]?.content;
				const extractedModified = frontmatter.head.find(
					([_tag, attrs]) => attrs.property === "article:modified_time",
				)?.[1]?.content;

				// Assert: Should extract correct timestamps
				expect(extractedPublished).toBe(publishedTime);
				expect(extractedModified).toBe(modifiedTime);
			});

			it("should handle missing timestamps gracefully", async () => {
				// Arrange: Create frontmatter without timestamps
				const frontmatter: { title: string; head: [string, Record<string, string>][] } = {
					title: "Test",
					head: [["meta", { property: "og:title", content: "Test" }]],
				};

				// Act: Attempt to extract timestamps
				const extractedPublished = frontmatter.head.find(
					([_tag, attrs]) => attrs.property === "article:published_time",
				)?.[1]?.content;
				const extractedModified = frontmatter.head.find(
					([_tag, attrs]) => attrs.property === "article:modified_time",
				)?.[1]?.content;

				// Assert: Should be undefined
				expect(extractedPublished).toBeUndefined();
				expect(extractedModified).toBeUndefined();
			});

			it("should use fallback when timestamps are missing", async () => {
				// Arrange: Simulate fallback logic
				const buildTime = "2024-12-01T00:00:00.000Z";
				const frontmatter: { title: string; head: [string, Record<string, string>][] } = {
					title: "Test",
					head: [["meta", { property: "og:title", content: "Test" }]],
				};

				// Act: Extract with fallback
				const extractedPublished =
					frontmatter.head.find(([_tag, attrs]) => attrs.property === "article:published_time")?.[1]?.content ||
					buildTime;
				const extractedModified =
					frontmatter.head.find(([_tag, attrs]) => attrs.property === "article:modified_time")?.[1]?.content ||
					buildTime;

				// Assert: Should use fallback
				expect(extractedPublished).toBe(buildTime);
				expect(extractedModified).toBe(buildTime);
			});
		});
	});
});
