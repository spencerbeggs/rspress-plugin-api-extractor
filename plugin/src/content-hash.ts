import { createHash } from "node:crypto";

/**
 * Normalizes content string for consistent hashing.
 *
 * Applies the following transformations:
 * - Converts all line endings to Unix-style (`\n`)
 * - Trims leading and trailing whitespace
 * - Collapses multiple consecutive blank lines to a single blank line
 *
 * @param content - The content string to normalize
 * @returns Normalized content string
 *
 * @example
 * ```typescript
 * const normalized = normalizeContent("line1\r\n\r\n\r\nline2  ");
 * // Returns: "line1\n\nline2"
 * ```
 */
export function normalizeContent(content: string): string {
	return (
		content
			// Normalize line endings to \n
			.replaceAll("\r\n", "\n")
			.replaceAll("\r", "\n")
			// Trim leading and trailing whitespace
			.trim()
			// Collapse multiple consecutive blank lines to single blank line
			.replaceAll(/\n{3,}/g, "\n\n")
	);
}

/**
 * Generates a SHA-256 hash of normalized markdown content.
 *
 * The content is normalized before hashing to ensure consistent results
 * regardless of line ending differences or trailing whitespace.
 *
 * @param content - The markdown content to hash (excluding frontmatter)
 * @returns Hexadecimal SHA-256 hash string
 *
 * @example
 * ```typescript
 * const hash = hashContent("# My Title\n\nContent here");
 * ```
 */
export function hashContent(content: string): string {
	const normalized = normalizeContent(content);
	return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Generates a SHA-256 hash of frontmatter fields.
 *
 * Excludes timestamp-related fields (`publishedTime`, `modifiedTime`, `head`,
 * `article:published_time`, `article:modified_time`) to prevent circular
 * dependencies in change detection.
 *
 * @param frontmatter - The frontmatter object to hash
 * @returns Hexadecimal SHA-256 hash string
 *
 * @remarks
 * Keys are sorted alphabetically before hashing to ensure consistent
 * results regardless of object key order.
 *
 * @example
 * ```typescript
 * const hash = hashFrontmatter({
 *   title: "My Page",
 *   description: "Page description"
 * });
 * ```
 */
export function hashFrontmatter(frontmatter: Record<string, unknown>): string {
	// Create a copy without timestamp fields and head array
	const filtered: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(frontmatter)) {
		// Skip timestamp fields and head array (contains OG tags with timestamps)
		if (
			key === "publishedTime" ||
			key === "modifiedTime" ||
			key === "head" ||
			key === "article:published_time" ||
			key === "article:modified_time"
		) {
			continue;
		}
		filtered[key] = value;
	}

	// Sort keys for consistent hashing
	const sorted = Object.keys(filtered)
		.sort()
		.reduce(
			(acc, key) => {
				acc[key] = filtered[key];
				return acc;
			},
			{} as Record<string, unknown>,
		);

	const json = JSON.stringify(sorted);
	return createHash("sha256").update(json).digest("hex");
}
