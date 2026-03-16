/**
 * Helper utilities for generating markdown API documentation.
 *
 * This module provides shared utility functions used by the page generators
 * for common tasks like preparing Twoslash examples, generating frontmatter,
 * escaping special characters, and sanitizing IDs.
 *
 * @module helpers
 */

import type { DebugLogger } from "../debug-logger.js";
import type { PrettierErrorStatsCollector } from "../prettier-error-stats.js";
import { formatCode } from "../prettier-formatter.js";
import { classifyCutDirective, isTwoslashDirective } from "../twoslash-patterns.js";
import type { ImportStatement } from "../type-reference-extractor.js";
import { TypeReferenceExtractor } from "../type-reference-extractor.js";

/**
 * Prepare example code for Twoslash rendering.
 *
 * Prepares the code with imports and error directives but does NOT render HTML.
 * Use this for raw markdown output or as input to pre-rendering.
 *
 * @param example - The example with language and code
 * @param apiItemName - The name of the API item being documented
 * @param packageName - The package name for imports
 * @param suppressErrors - Whether to suppress all TypeScript errors (default: true)
 * @returns Object with prepared code and whether it's TypeScript
 */
export function prepareExampleCode(
	example: { language: string; code: string },
	apiItemName: string,
	packageName: string,
	suppressErrors: boolean = true,
): { code: string; isTypeScript: boolean; language: string } {
	const { language, code } = example;

	// Only process TypeScript/JavaScript examples with VFS support
	const isTypeScript = language === "typescript" || language === "ts" || language === "javascript" || language === "js";

	if (!isTypeScript) {
		return { code, isTypeScript: false, language };
	}

	// Add import line for the package at the top if not already present
	// Check for both single and double quotes since TSDoc examples may use either
	const importLine = `import { ${apiItemName} } from "${packageName}";`;
	const hasImport = code.includes(`from "${packageName}"`) || code.includes(`from '${packageName}'`);
	const finalCode = hasImport ? code : `${importLine}\n${code}`;

	// Add @noErrors directive if error suppression is enabled
	const errorDirective = suppressErrors ? "// @noErrors\n" : "";

	return { code: `${errorDirective}${finalCode}`, isTypeScript: true, language: "typescript" };
}

/**
 * Sanitize a display name to create a URL-safe HTML ID.
 *
 * Converts a display name (e.g., method or property name) into a valid
 * HTML ID suitable for anchor links. Handles special characters, quotes,
 * and optionally adds a prefix for disambiguation.
 *
 * @param displayName - The original display name
 * @param prefix - Optional prefix to add (e.g., "static-property")
 * @returns URL-safe ID string
 *
 * @example
 * ```ts
 * sanitizeId("myMethod");        // "mymethod"
 * sanitizeId("get value");       // "get-value"
 * sanitizeId("run", "static");   // "static-run"
 * ```
 */
export function sanitizeId(displayName: string, prefix: string = ""): string {
	const baseName = displayName
		// Remove quotes
		.replace(/["']/g, "")
		// Replace spaces and other special chars with hyphens
		.replace(/[^\w-]/g, "-")
		// Remove leading/trailing hyphens
		.replace(/^-+|-+$/g, "")
		// Lowercase for consistency
		.toLowerCase();

	return prefix ? `${prefix}-${baseName}` : baseName;
}

/**
 * Escape a YAML string value by handling special characters.
 *
 * Normalizes whitespace and wraps strings in double quotes if they contain
 * characters that could break YAML parsing (colons, quotes, hashes, pipes,
 * brackets, braces, Unicode characters, etc.).
 *
 * @param value - The string value to escape
 * @returns YAML-safe string
 *
 * @example
 * ```ts
 * escapeYamlString("Hello World");           // "Hello World"
 * escapeYamlString("Type: string");          // "\"Type: string\""
 * escapeYamlString("He said \"hello\"");     // "\"He said \\\"hello\\\"\""
 * escapeYamlString("@pkg/name。:");          // "\"@pkg/name。:\""
 * ```
 */
export function escapeYamlString(value: string): string {
	// Normalize whitespace
	const cleaned = value
		.replace(/[\r\n]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	// Check if string needs quoting:
	// 1. Contains YAML special characters: : # | > & * ! % @ ` [ ] { } , ? -
	// 2. Contains quotes
	// 3. Contains non-ASCII Unicode characters (like Chinese period 。)
	// 4. Starts/ends with whitespace (after trim, this won't happen)
	// 5. Looks like a number, boolean, or null
	const needsQuoting =
		/["':#|>&*!%@`[\]{},?-]/.test(cleaned) || // Special YAML characters
		/[\u0080-\uFFFF]/.test(cleaned) || // Non-ASCII Unicode (U+0080 and above)
		/^(true|false|null|~|yes|no|on|off)$/i.test(cleaned) || // YAML literals
		/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(cleaned); // Numbers

	if (needsQuoting) {
		// Escape any double quotes and backslashes in the string
		const escaped = cleaned.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		return `"${escaped}"`;
	}

	return cleaned;
}

/**
 * Escape generic type parameters in MDX by wrapping them in backticks.
 *
 * Prevents MDX from interpreting `<T>`, `<TEnv>`, etc. as JSX tags by
 * wrapping them in inline code backticks.
 *
 * @param text - The text containing generic type parameters
 * @returns Text with generics wrapped in backticks
 *
 * @example
 * ```ts
 * escapeMdxGenerics("Returns Promise<T>");        // "Returns Promise`<T>`"
 * escapeMdxGenerics("Map<K, V> extends...");      // "Map`<K, V>` extends..."
 * ```
 */
export function escapeMdxGenerics(text: string): string {
	return text.replace(
		/<([A-Z][A-Za-z0-9_]*(?:\s+extends\s+[^>]+)?(?:,\s*[A-Z][A-Za-z0-9_]*(?:\s+extends\s+[^>]+)?)*)>/g,
		"`<$1>`",
	);
}

/**
 * Build a structured page title for API documentation.
 *
 * Creates a title in the format: `{entityName} | {singularName} | API | {apiName}`
 *
 * @param entityName - The specific entity name (e.g., "MyClass")
 * @param singularName - The category singular name (e.g., "Class")
 * @param apiName - Optional API/package display name
 * @returns Formatted page title
 *
 * @example
 * ```ts
 * buildPageTitle("MyClass", "Class", "My Package");
 * // Returns: "MyClass | Class | API | My Package"
 * ```
 */
function buildPageTitle(entityName: string, singularName: string, apiName?: string): string {
	const parts = [entityName, singularName, "API"];
	if (apiName) {
		parts.push(apiName);
	}
	return parts.join(" | ");
}

/**
 * Generate markdown frontmatter with optional Open Graph metadata.
 *
 * Creates YAML frontmatter for MDX files including title, description,
 * and comprehensive Open Graph meta tags for social sharing.
 *
 * @param entityName - The specific entity name (e.g., "MyClass")
 * @param description - Page description for SEO
 * @param singularName - The category singular name (e.g., "Class")
 * @param apiName - Optional API/package display name
 * @param ogMetadata - Optional Open Graph metadata for social sharing
 * @returns YAML frontmatter string
 *
 * @example
 * ```ts
 * const frontmatter = generateFrontmatter(
 *   "MyClass",
 *   "A utility class for...",
 *   "Class",
 *   "My Package"
 * );
 * // Returns:
 * // ---
 * // title: MyClass | Class | API | My Package
 * // description: A utility class for...
 * // ---
 * ```
 */
export function generateFrontmatter(
	entityName: string,
	description: string,
	singularName: string,
	apiName?: string,
	ogMetadata?: import("../types.js").OpenGraphMetadata,
): string {
	const title = buildPageTitle(entityName, singularName, apiName);

	// Build head array for OG tags
	const headEntries: [string, Record<string, string>][] = [];

	if (ogMetadata) {
		// Canonical URL
		headEntries.push(["meta", { property: "og:url", content: `${ogMetadata.siteUrl}${ogMetadata.pageRoute}` }]);

		// OG Type
		headEntries.push(["meta", { property: "og:type", content: ogMetadata.ogType }]);

		// OG Description
		headEntries.push(["meta", { property: "og:description", content: ogMetadata.description }]);

		// OG Image metadata
		if (ogMetadata.ogImage) {
			headEntries.push(["meta", { property: "og:image", content: ogMetadata.ogImage.url }]);

			if (ogMetadata.ogImage.secureUrl) {
				headEntries.push(["meta", { property: "og:image:secure_url", content: ogMetadata.ogImage.secureUrl }]);
			}

			if (ogMetadata.ogImage.type) {
				headEntries.push(["meta", { property: "og:image:type", content: ogMetadata.ogImage.type }]);
			}

			if (ogMetadata.ogImage.width) {
				headEntries.push(["meta", { property: "og:image:width", content: String(ogMetadata.ogImage.width) }]);
			}

			if (ogMetadata.ogImage.height) {
				headEntries.push(["meta", { property: "og:image:height", content: String(ogMetadata.ogImage.height) }]);
			}

			if (ogMetadata.ogImage.alt) {
				headEntries.push(["meta", { property: "og:image:alt", content: ogMetadata.ogImage.alt }]);
			}
		}

		// Article metadata
		headEntries.push(["meta", { property: "article:published_time", content: ogMetadata.publishedTime }]);
		headEntries.push(["meta", { property: "article:modified_time", content: ogMetadata.modifiedTime }]);
		headEntries.push(["meta", { property: "article:section", content: ogMetadata.section }]);

		// Article tags
		for (const tag of ogMetadata.tags) {
			headEntries.push(["meta", { property: "article:tag", content: tag }]);
		}
	}

	// Build YAML frontmatter
	let frontmatter = `---\ntitle: ${escapeYamlString(title)}\n`;
	frontmatter += `description: ${escapeYamlString(description)}\n`;

	if (headEntries.length > 0) {
		frontmatter += "head:\n";
		for (const [tag, attrs] of headEntries) {
			frontmatter += `  - - ${tag}\n`;
			frontmatter += "    - ";
			const attrPairs = Object.entries(attrs).map(([key, value]) => `${key}: ${escapeYamlString(value)}`);
			frontmatter += attrPairs.join("\n      ");
			frontmatter += "\n";
		}
	}

	frontmatter += "---\n\n";
	return frontmatter;
}

/**
 * Strip Twoslash directives from code for display purposes.
 *
 * Removes Twoslash directive comments like `// @noErrors`, `// @errors: 2304`,
 * `// @filename: ...`, etc. from code so users see clean output and don't
 * copy directives when using the copy button.
 *
 * Also handles cut directives:
 * - `// ---cut---` - Removes this line and all lines before it
 * - `// ---cut-before---` - Same as ---cut---
 * - `// ---cut-after---` - Removes this line and all lines after it
 *
 * @param code - The code containing Twoslash directives
 * @returns Code with Twoslash directives removed
 *
 * @example
 * ```ts
 * const display = stripTwoslashDirectives("// @noErrors\nconst x = 1;");
 * // Returns: "const x = 1;"
 * ```
 */
export function stripTwoslashDirectives(code: string): string {
	const lines = code.split("\n");

	// Find cut directive indices using upstream-compatible regex patterns.
	// Handles both spaced (`// ---cut---`) and unspaced (`//---cut---`) variants,
	// as well as cut-start/cut-end range markers.
	let cutBeforeIndex = -1;
	let cutAfterIndex = -1;
	const cutRanges: Array<[start: number, end: number]> = [];
	const cutStartStack: number[] = [];

	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		const cutType = classifyCutDirective(trimmed);
		if (cutType === "cut-before") {
			cutBeforeIndex = i;
		} else if (cutType === "cut-after") {
			cutAfterIndex = i;
		} else if (cutType === "cut-start") {
			cutStartStack.push(i);
		} else if (cutType === "cut-end") {
			const startIdx = cutStartStack.pop();
			if (startIdx !== undefined) {
				cutRanges.push([startIdx, i]);
			}
		}
	}

	// Apply cut-before: remove everything up to and including the cut line
	let filteredLines = lines;
	if (cutBeforeIndex >= 0) {
		filteredLines = filteredLines.slice(cutBeforeIndex + 1);
		// Adjust subsequent indices
		if (cutAfterIndex >= 0) {
			cutAfterIndex = cutAfterIndex - cutBeforeIndex - 1;
		}
		for (const range of cutRanges) {
			range[0] -= cutBeforeIndex + 1;
			range[1] -= cutBeforeIndex + 1;
		}
	}

	// Apply cut-after: remove everything from the cut line onwards
	if (cutAfterIndex >= 0) {
		filteredLines = filteredLines.slice(0, cutAfterIndex);
	}

	// Build a set of line indices to exclude from cut-start/cut-end ranges
	const excludedLines = new Set<number>();
	for (const [start, end] of cutRanges) {
		for (let i = start; i <= end; i++) {
			if (i >= 0 && i < filteredLines.length) {
				excludedLines.add(i);
			}
		}
	}

	// Filter out cut-start/cut-end ranges and remaining directive lines.
	// Uses the shared isTwoslashDirective() which covers:
	// - Config: // @noErrors, //@strict, // @errors: 2304, // @filename: foo.ts
	// - Annotations: // ^?, //   ^?, // ^|, // ^^^, // ^^^^ description
	// - Cut: // ---cut---, //---cut-before---, etc.
	return filteredLines
		.filter((line, i) => {
			if (excludedLines.has(i)) return false;
			const trimmed = line.trim();
			if (isTwoslashDirective(trimmed)) return false;
			return true;
		})
		.join("\n")
		.trim();
}

/**
 * Format import statements with cut directive for hidden imports.
 *
 * Prepends import statements followed by `// ---cut---` so Twoslash can
 * resolve the types but the imports are hidden from rendered output.
 *
 * @param imports - Import statements to format
 * @returns Formatted import block with cut directive, or empty string if no imports
 *
 * @example
 * ```ts
 * const imports = [{ packageName: "zod", symbols: new Set(["ZodType"]), typeOnly: true }];
 * const block = formatImportsWithCut(imports);
 * // Returns:
 * // import type { ZodType } from "zod";
 * // // ---cut---
 * ```
 */
export function formatImportsWithCut(imports: ImportStatement[]): string {
	if (imports.length === 0) {
		return "";
	}
	const formatted = TypeReferenceExtractor.formatImports(imports);
	return `${formatted.join("\n")}\n// ---cut---\n`;
}

/**
 * Prepend hidden imports to code using the Twoslash cut directive.
 *
 * This enables type resolution for external types while hiding the import
 * statements from rendered output. The existing `stripTwoslashDirectives()`
 * function handles removing the cut block for clipboard copying.
 *
 * @param code - The code to prepend imports to
 * @param imports - Import statements to add
 * @returns Code with imports prepended (if any), or original code if no imports
 *
 * @example
 * ```ts
 * const code = "function foo(): RsbuildPlugin";
 * const imports = [{ packageName: "@rsbuild/core", symbols: new Set(["RsbuildPlugin"]), typeOnly: true }];
 * const result = prependHiddenImports(code, imports);
 * // Returns:
 * // import type { RsbuildPlugin } from "@rsbuild/core";
 * // // ---cut---
 * // function foo(): RsbuildPlugin
 * ```
 */
export function prependHiddenImports(code: string, imports: ImportStatement[]): string {
	const importBlock = formatImportsWithCut(imports);
	return importBlock ? importBlock + code : code;
}

/**
 * Format example code using Prettier for consistent styling.
 *
 * Wraps the Prettier formatter with error handling and context tracking.
 * If formatting fails, returns the original code (fallthrough behavior).
 *
 * @param code - The code to format
 * @param language - The code fence language (e.g., "typescript", "ts")
 * @param context - Optional context for error tracking
 * @param prettierErrorStats - Optional error stats collector
 * @param logger - Optional logger for debug output
 * @returns The formatted code (or original if formatting fails)
 */
export async function formatExampleCode(
	code: string,
	language: string,
	context?: { file?: string; api?: string; blockType?: string },
	prettierErrorStats?: PrettierErrorStatsCollector,
	logger?: DebugLogger,
): Promise<string> {
	// Set context for error tracking if provided
	if (prettierErrorStats && context) {
		prettierErrorStats.setContext({
			file: context.file,
			api: context.api,
			blockType: context.blockType as "with-api" | "example" | undefined,
		});
	}

	const result = await formatCode(code, language, prettierErrorStats, logger);

	// Clear context after formatting
	if (prettierErrorStats) {
		prettierErrorStats.clearContext();
	}

	return result.code;
}
