/**
 * Pure functions for processing llms.txt and llms-full.txt content.
 *
 * These functions handle parsing, filtering, and generating LLMs text files
 * for per-package API documentation scopes. They have no Effect dependencies
 * and are consumed by the LLMs Effect program in afterBuild.
 */

/**
 * A parsed link entry from llms.txt format.
 *
 * @example
 * ```text
 * - [Page Title](/path/to/page): Page description
 * ```
 */
export interface LlmsTxtEntry {
	title: string;
	url: string;
	description: string | undefined;
}

/**
 * A pointer to a per-package llms.txt file, appended to the global llms.txt.
 */
export interface PackagePointer {
	name: string;
	llmsTxtUrl: string;
}

/**
 * Input for generating a per-package llms.txt index.
 */
export interface PackageLlmsTxtInput {
	name: string;
	packageName: string;
	guidePages: LlmsTxtEntry[];
	apiPages: LlmsTxtEntry[];
}

/**
 * A page with its URL and full markdown content, used for llms-full.txt generation.
 */
export interface PageContent {
	url: string;
	content: string;
}

/** Pre-compiled regex for parsing llms.txt link lines. */
const LLMS_TXT_LINE_RE = /^-\s+\[([^\]]+)\]\(([^)]+)\)(?::\s*(.+))?$/;

/**
 * Parse a single line from llms.txt format.
 *
 * Recognizes the pattern: `- [title](url): description`
 * The description portion (`: description`) is optional.
 *
 * @param line - A single line from an llms.txt file
 * @returns Parsed entry or null for non-link lines (headers, empty lines, plain text)
 */
export function parseLlmsTxtLine(line: string): LlmsTxtEntry | null {
	const trimmed = line.trim();
	if (trimmed === "") {
		return null;
	}

	// Match: - [title](url) or - [title](url): description
	const match = LLMS_TXT_LINE_RE.exec(trimmed);
	if (!match) {
		return null;
	}

	const title = match[1];
	const url = match[2];
	const rawDescription = match[3];

	return {
		title,
		url,
		description: rawDescription ? rawDescription.trim() : undefined,
	};
}

/**
 * Filter API page entries from global llms.txt content.
 *
 * Removes lines whose parsed URL is in the `apiRoutes` set.
 * Appends pointer lines for per-package llms files when `pointers` is non-empty.
 *
 * @param content - Full llms.txt content string
 * @param apiRoutes - Set of API route paths to remove
 * @param pointers - Per-package pointer entries to append
 * @returns Filtered llms.txt content
 */
export function filterLlmsTxt(content: string, apiRoutes: Set<string>, pointers: PackagePointer[]): string {
	const lines = content.split("\n");
	const filtered: string[] = [];

	for (const line of lines) {
		const entry = parseLlmsTxtLine(line);
		if (entry && apiRoutes.has(entry.url)) {
			continue;
		}
		filtered.push(line);
	}

	let result = filtered.join("\n");

	if (pointers.length > 0) {
		result += "\n\n";
		for (const pointer of pointers) {
			result += `- For ${pointer.name} API docs, see [${pointer.name} llms.txt](${pointer.llmsTxtUrl})\n`;
		}
	}

	return result;
}

/**
 * Metadata for a package scope, used to generate structured llms.txt.
 */
export interface PackageScopeInfo {
	/** Display name (e.g., "Kitchen Sink") */
	name: string;
	/** npm package name */
	packageName: string;
	/** Package version (e.g., "1.0.0") or undefined */
	version: string | undefined;
	/** Package description or undefined */
	description: string | undefined;
	/** Package-level route prefix (e.g., "/kitchensink") */
	packageRoute: string;
	/** URL to the per-package llms-api.txt */
	llmsApiTxtUrl: string;
}

/**
 * Generate a structured global llms.txt that groups pages by package scope.
 *
 * Output format:
 * ```
 * # {site title}
 *
 * ## Others
 * - [Blog Post](/blog/post.md)
 *
 * ## Packages
 *
 * ### {name} {version}
 * {description}
 * - [Guide Page](/pkg/guides/guide.md)
 * - [API Reference](/pkg/llms-api.txt)
 * ```
 *
 * @param content - Original RSPress-generated llms.txt content
 * @param apiRoutes - Set of API route paths to exclude as individual entries
 * @param packages - Package scope metadata
 * @returns Restructured llms.txt content
 */
export function generateStructuredLlmsTxt(
	content: string,
	apiRoutes: Set<string>,
	packages: PackageScopeInfo[],
): string {
	const lines = content.split("\n");

	// Extract the title (first # heading)
	let title = "";
	for (const line of lines) {
		if (line.startsWith("# ")) {
			title = line;
			break;
		}
	}

	// Parse all link entries, excluding API pages
	const allEntries: LlmsTxtEntry[] = [];
	for (const line of lines) {
		const entry = parseLlmsTxtLine(line);
		if (entry && !apiRoutes.has(entry.url)) {
			allEntries.push(entry);
		}
	}

	// Partition entries into "others" and per-package groups
	const packageEntries = new Map<string, LlmsTxtEntry[]>();
	const others: LlmsTxtEntry[] = [];

	for (const entry of allEntries) {
		let matched = false;
		for (const pkg of packages) {
			const base = pkg.packageRoute.endsWith("/") ? pkg.packageRoute : `${pkg.packageRoute}/`;
			if (entry.url.startsWith(base) || entry.url === pkg.packageRoute) {
				const existing = packageEntries.get(pkg.packageName) ?? [];
				existing.push(entry);
				packageEntries.set(pkg.packageName, existing);
				matched = true;
				break;
			}
		}
		if (!matched) {
			others.push(entry);
		}
	}

	// Build structured output
	const output: string[] = [];

	if (title) {
		output.push(title);
		output.push("");
	}

	// Others section
	if (others.length > 0) {
		output.push("## Others");
		output.push("");
		for (const entry of others) {
			output.push(formatEntry(entry));
		}
		output.push("");
	}

	// Packages section
	const packagesWithEntries = packages.filter((pkg) => (packageEntries.get(pkg.packageName)?.length ?? 0) > 0);
	if (packagesWithEntries.length > 0) {
		output.push("## Packages");
		output.push("");

		for (const pkg of packagesWithEntries) {
			const versionSuffix = pkg.version ? ` ${pkg.version}` : "";
			output.push(`### ${pkg.name}${versionSuffix}`);
			output.push("");
			if (pkg.description) {
				output.push(pkg.description);
				output.push("");
			}
			const entries = packageEntries.get(pkg.packageName) ?? [];
			for (const entry of entries) {
				output.push(formatEntry(entry));
			}
			output.push(`- [API Reference](${pkg.llmsApiTxtUrl})`);
			output.push("");
		}
	}

	return output.join("\n");
}

/**
 * Parse llms-full.txt content into sections delimited by frontmatter blocks.
 *
 * Each section has the format:
 * ```
 * ---
 * url: /path/to/page
 * ---
 *
 * Content here...
 * ```
 */
function parseSections(content: string): Array<{ url: string; raw: string }> {
	if (content.trim() === "") {
		return [];
	}

	const sections: Array<{ url: string; raw: string }> = [];
	// Split on frontmatter boundaries: ---\nurl: ...\n---
	const frontmatterPattern = /^---\nurl:\s*(.+)\n---$/gm;
	let match = frontmatterPattern.exec(content);

	// Collect all frontmatter positions
	const boundaries: Array<{ url: string; start: number; fmEnd: number }> = [];
	while (match !== null) {
		boundaries.push({
			url: match[1].trim(),
			start: match.index,
			fmEnd: match.index + match[0].length,
		});
		match = frontmatterPattern.exec(content);
	}

	for (let i = 0; i < boundaries.length; i++) {
		const boundary = boundaries[i];
		const nextStart = i + 1 < boundaries.length ? boundaries[i + 1].start : content.length;
		const sectionContent = content.slice(boundary.start, nextStart);
		sections.push({
			url: boundary.url,
			raw: sectionContent.trimEnd(),
		});
	}

	return sections;
}

/**
 * Filter API page content sections from global llms-full.txt.
 *
 * Sections are delimited by `---\nurl: {path}\n---` frontmatter blocks.
 * Removes entire sections whose URL matches a known API route.
 *
 * @param content - Full llms-full.txt content string
 * @param apiRoutes - Set of API route paths to remove
 * @returns Filtered llms-full.txt content
 */
export function filterLlmsFullTxt(content: string, apiRoutes: Set<string>): string {
	if (content.trim() === "") {
		return "";
	}

	const sections = parseSections(content);
	const kept = sections.filter((section) => !apiRoutes.has(section.url));

	if (kept.length === 0) {
		return "";
	}

	return kept.map((section) => section.raw).join("\n\n\n");
}

/**
 * Format a single llms.txt link entry.
 */
function formatEntry(entry: LlmsTxtEntry): string {
	if (entry.description) {
		return `- [${entry.title}](${entry.url}): ${entry.description}`;
	}
	return `- [${entry.title}](${entry.url})`;
}

/**
 * Generate a per-package llms.txt index.
 *
 * Output format:
 * ```
 * # {name}
 *
 * ## Guides
 *
 * - [Guide Title](/path): Description
 *
 * ## API Reference
 *
 * - [ApiItem](/path): Description
 * ```
 *
 * Sections with no entries are omitted.
 *
 * @param input - Package name, guide pages, and API pages
 * @returns Generated llms.txt content
 */
export function generatePackageLlmsTxt(input: PackageLlmsTxtInput): string {
	const parts: string[] = [`# ${input.name}`, "", `> API documentation for the ${input.packageName} package`];

	if (input.guidePages.length > 0) {
		parts.push("");
		parts.push("## Guides");
		parts.push("");
		for (const page of input.guidePages) {
			parts.push(formatEntry(page));
		}
	}

	if (input.apiPages.length > 0) {
		parts.push("");
		parts.push("## API Reference");
		parts.push("");
		for (const page of input.apiPages) {
			parts.push(formatEntry(page));
		}
	}

	parts.push("");
	return parts.join("\n");
}

/**
 * Concatenate page contents with frontmatter delimiters.
 *
 * Used for llms-full.txt, llms-docs.txt, and llms-api.txt generation
 * (pass different page sets for each).
 *
 * Output format:
 * ```
 * ---
 * url: /path/to/page
 * ---
 *
 * Content here...
 *
 *
 * ---
 * url: /path/to/next
 * ---
 *
 * More content...
 * ```
 *
 * @param pages - Array of page URLs and their markdown content
 * @returns Concatenated content with frontmatter delimiters
 */
export function generatePackageLlmsFullTxt(pages: PageContent[]): string {
	if (pages.length === 0) {
		return "";
	}

	const sections: string[] = [];
	for (const page of pages) {
		sections.push(`---\nurl: ${page.url}\n---\n\n${page.content}`);
	}

	return sections.join("\n\n\n");
}
