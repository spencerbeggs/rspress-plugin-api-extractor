import { describe, expect, test } from "vitest";
import { hashContent, hashFrontmatter } from "../src/content-hash.js";

describe("hashContent", () => {
	test("generates consistent hash for same content", () => {
		const content = "# Hello World\n\nThis is some markdown content.";
		const hash1 = hashContent(content);
		const hash2 = hashContent(content);

		expect(hash1).toBe(hash2);
		expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
	});

	test("generates different hash for different content", () => {
		const content1 = "# Hello World";
		const content2 = "# Hello Universe";
		const hash1 = hashContent(content1);
		const hash2 = hashContent(content2);

		expect(hash1).not.toBe(hash2);
	});

	test("is sensitive to whitespace changes", () => {
		const content1 = "Hello World";
		const content2 = "Hello  World"; // Extra space
		const hash1 = hashContent(content1);
		const hash2 = hashContent(content2);

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

		const hash1 = hashFrontmatter(frontmatter1);
		const hash2 = hashFrontmatter(frontmatter2);

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

		const hash1 = hashFrontmatter(frontmatter1);
		const hash2 = hashFrontmatter(frontmatter2);

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

		const hash1 = hashFrontmatter(frontmatter1);
		const hash2 = hashFrontmatter(frontmatter2);

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

		const hash1 = hashFrontmatter(frontmatter1);
		const hash2 = hashFrontmatter(frontmatter2);

		// Hashes should be identical because keys are sorted
		expect(hash1).toBe(hash2);
	});
});
