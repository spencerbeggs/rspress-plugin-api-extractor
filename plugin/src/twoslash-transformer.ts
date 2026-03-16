import { rendererRich, transformerTwoslash } from "@shikijs/twoslash";
import type { ElementContent } from "hast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { toHast } from "mdast-util-to-hast";
import type { ShikiTransformer } from "shiki";
import type { VirtualFileSystem } from "type-registry-effect";
import type { VirtualTypeScriptEnvironment } from "type-registry-effect/node";
import type ts from "typescript";
import type { DebugLogger } from "./debug-logger.js";
import type { TwoslashErrorStatsCollector } from "./twoslash-error-stats.js";
import type { TypeResolutionCompilerOptions } from "./types.js";
import { DEFAULT_COMPILER_OPTIONS } from "./typescript-config.js";

/**
 * Module-level type routes map for resolving {@link ...} references.
 * This is set by TwoslashManager.setTypeRoutes() before initialization.
 */
let typeRoutes: Map<string, string> = new Map();

/**
 * Transform TSDoc {@link ...} syntax to markdown links or plain text.
 *
 * Handles various TSDoc link formats:
 * - `{@link TypeName}` - simple type reference
 * - `{@link TypeName | display text}` - type with pipe-separated display text
 * - `{@link TypeName display text}` - type with space-separated display text
 *
 * Also handles multiline links where the content may be split across lines.
 *
 * @param text - Text containing {@link ...} references
 * @returns Text with links transformed to markdown or plain text
 */
function transformTsDocLinks(text: string): string {
	// Match {@link ...} patterns, including multiline ([\s\S] matches newlines)
	// The content can be: TypeName, TypeName | display, or TypeName display
	return text.replace(/\{@link\s+([\s\S]*?)\}/g, (_match, content: string) => {
		// Normalize whitespace - collapse multiple spaces/newlines to single space
		const normalized = content.replace(/\s+/g, " ").trim();

		if (!normalized) {
			return "";
		}

		// Check for pipe-separated display text: "TypeName | display text"
		const pipeIndex = normalized.indexOf("|");
		let typeName: string;
		let displayText: string;

		if (pipeIndex !== -1) {
			typeName = normalized.substring(0, pipeIndex).trim();
			displayText = normalized.substring(pipeIndex + 1).trim();
		} else {
			// Check for space-separated: "TypeName display text"
			// The type name is the first word (typically PascalCase)
			const spaceIndex = normalized.indexOf(" ");
			if (spaceIndex !== -1 && /^[A-Z]/.test(normalized)) {
				// If starts with capital and has space, first word is likely the type
				typeName = normalized.substring(0, spaceIndex).trim();
				displayText = normalized.substring(spaceIndex + 1).trim();
			} else {
				// Just a type name with no display text
				typeName = normalized;
				displayText = normalized;
			}
		}

		// Look up the route for this type
		const route = typeRoutes.get(typeName);

		if (route) {
			// Found a route - create a markdown link
			return `[${displayText}](${route})`;
		}

		// No route found - just return the display text
		return displayText;
	});
}

/**
 * Process TSDoc documentation content for display in Twoslash hover popups.
 *
 * This function:
 * - Transforms {@link TypeName} references to markdown links or plain text
 * - Normalizes whitespace around links for proper inline display
 * - Removes @example blocks (including their code content)
 * - Removes the @remarks tag while keeping the body text
 * - Removes modifier tags (@public, @internal, @private, etc.)
 * - Removes @see, @param, @returns, @throws tags (these are rendered separately)
 *
 * @param docs - Raw TSDoc documentation string
 * @returns Cleaned documentation string ready for markdown rendering
 */
function processHoverDocs(docs: string): string {
	// First, transform {@link ...} references to markdown links or plain text
	let cleaned = transformTsDocLinks(docs);

	// Normalize whitespace within paragraphs - collapse multiple spaces/newlines to single space
	// This handles cases where {@link} was on its own line in the source
	// Split by double newline to preserve paragraph breaks, then normalize each paragraph
	cleaned = cleaned
		.split(/\n\n+/)
		.map((para) => para.replace(/\s+/g, " ").trim())
		.filter((para) => para.length > 0)
		.join("\n\n");

	// Remove @example blocks (match @example followed by any content until next @ tag or end)
	cleaned = cleaned.replace(/@example[\s\S]*?(?=@[a-zA-Z]|$)/g, "");

	// Remove @remarks tag but keep the body
	cleaned = cleaned.replace(/@remarks\s*/g, "");

	// Remove modifier tags
	cleaned = cleaned.replace(/@(public|internal|private|protected|readonly|sealed|virtual|override)\s*/g, "");

	// Remove @see tags (they reference other docs)
	cleaned = cleaned.replace(/@see\s+[^\n]*/g, "");

	// Remove @param, @returns, @throws tags (these are rendered separately in the UI)
	cleaned = cleaned.replace(/@(param|returns?|throws?)\s+[^\n]*/g, "");

	// Clean up multiple consecutive newlines
	cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

	return cleaned.trim();
}

/**
 * Add rp-link class to all anchor elements in a HAST tree.
 * This enables RSPress link styling in hover popups.
 *
 * @param node - HAST node to process
 */
function addLinkClasses(node: ElementContent): void {
	if (node.type === "element") {
		if (node.tagName === "a") {
			// Add rp-link class to anchor elements
			const existing = node.properties?.class;
			if (typeof existing === "string") {
				node.properties = { ...node.properties, class: `${existing} rp-link` };
			} else {
				node.properties = { ...node.properties, class: "rp-link" };
			}
		}
		// Recursively process children
		if (node.children) {
			for (const child of node.children) {
				addLinkClasses(child as ElementContent);
			}
		}
	}
}

/**
 * Render markdown content to HAST (Hypertext Abstract Syntax Tree) elements.
 *
 * This function converts markdown strings (from TSDoc comments) into HAST nodes
 * that can be rendered in Twoslash hover popups. It uses mdast-util-from-markdown
 * to parse the markdown and mdast-util-to-hast to convert to HAST.
 *
 * TSDoc {@link ...} references are transformed to markdown links before parsing.
 * Whitespace is normalized for proper inline display.
 * Links are given the rp-link class for RSPress styling.
 *
 * @param markdown - Markdown string to render
 * @returns Array of HAST ElementContent nodes
 */
function renderMarkdown(markdown: string): ElementContent[] {
	if (!markdown || !markdown.trim()) {
		return [];
	}

	try {
		// Transform {@link ...} references before markdown parsing
		let transformed = transformTsDocLinks(markdown);

		// Normalize whitespace within paragraphs - collapse multiple spaces/newlines to single space
		// Split by double newline to preserve paragraph breaks, then normalize each paragraph
		transformed = transformed
			.split(/\n\n+/)
			.map((para) => para.replace(/\s+/g, " ").trim())
			.filter((para) => para.length > 0)
			.join("\n\n");

		// Parse markdown to MDAST
		const mdast = fromMarkdown(transformed);

		// Convert MDAST to HAST
		const hast = toHast(mdast);

		// Return the children (content) of the root node
		if (hast && "children" in hast) {
			const children = hast.children as ElementContent[];
			// Add rp-link class to all anchor elements
			for (const child of children) {
				addLinkClasses(child);
			}
			return children;
		}

		return [];
	} catch {
		// Fallback to plain text if markdown parsing fails
		return [{ type: "text", value: markdown }];
	}
}

/**
 * Tags to hide entirely in hover popups.
 * These are either redundant with the API documentation structure or add noise.
 */
const HIDDEN_TAGS = new Set([
	"example",
	"public",
	"internal",
	"private",
	"protected",
	"readonly",
	"sealed",
	"virtual",
	"override",
]);

/**
 * Render inline markdown for JSDoc tags with identifying CSS classes.
 *
 * This function wraps tag content in spans with tag-specific classes,
 * allowing CSS to selectively show/hide or style specific tags.
 *
 * @param markdown - The tag content to render
 * @param context - Context string like "tag:remarks", "tag:example", etc.
 * @returns Array of HAST ElementContent nodes
 */
function renderMarkdownInline(markdown: string, context: string): ElementContent[] {
	// Extract tag name from context (e.g., "tag:remarks" -> "remarks")
	const tagName = context.startsWith("tag:") ? context.slice(4) : "";

	// For hidden tags, return an empty marker element that CSS can target
	if (HIDDEN_TAGS.has(tagName)) {
		return [
			{
				type: "element",
				tagName: "span",
				properties: { class: `twoslash-tag-hidden twoslash-tag-${tagName}` },
				children: [],
			},
		];
	}

	// For other tags (remarks, param, returns, etc.), render the markdown content
	// wrapped in an identifying span
	const children = renderMarkdown(markdown);
	return [
		{
			type: "element",
			tagName: "span",
			properties: { class: `twoslash-tag-content twoslash-tag-${tagName}` },
			children,
		},
	];
}
/**
 * Singleton manager for the Twoslash transformer, enabling type-aware documentation.
 *
 * The TwoslashManager initializes and manages a Shiki transformer that provides
 * TypeScript IntelliSense features (hover types, error highlighting, completions)
 * in documentation code blocks. It uses a virtual file system (VFS) to provide
 * type definitions without requiring actual file system access.
 *
 * **How it works:**
 * 1. Plugin initializes the manager with a VFS containing all package type definitions
 * 2. Code blocks marked with `twoslash` are processed by the transformer
 * 3. TypeScript language services provide hover information and error checking
 * 4. Results are rendered as HTML with interactive hover popups
 *
 * **VFS Integration:**
 * The VFS is populated by {@link TypeRegistryLoader} with:
 * - The documented package's own type definitions (from API Extractor)
 * - External package types (fetched via type-registry-effect)
 *
 * **Error Handling:**
 * TypeScript errors in code blocks are captured (not thrown) and:
 * - Recorded in {@link TwoslashErrorStatsCollector} for aggregate reporting
 * - Logged inline at DEBUG level via {@link Logger}
 * - Displayed in the rendered output as error annotations
 *
 * **Relationships:**
 * - Initialized by {@link ApiExtractorPlugin} in the beforeBuild hook
 * - Receives VFS from {@link TypeRegistryLoader}
 * - Works with {@link TwoslashErrorStatsCollector} for error tracking
 * - The transformer is used by page generators for rendering code blocks
 *
 * @example
 * ```ts
 * const manager = TwoslashManager.getInstance();
 * manager.initialize(vfs, errorStats, logger);
 *
 * const transformer = manager.getTransformer();
 * // Use transformer with Shiki highlighter
 * ```
 *
 * @see {@link TypeRegistryLoader} for VFS generation
 * @see {@link TwoslashErrorStatsCollector} for error tracking
 */
export class TwoslashManager {
	private static instance: TwoslashManager | null = null;

	/**
	 * Twoslash transformer instance
	 */
	private transformer: ShikiTransformer | null = null;

	/**
	 * Error stats collector instance
	 */
	private errorStatsCollector: TwoslashErrorStatsCollector | null = null;

	/**
	 * Logger instance for inline error reporting
	 */
	private logger: DebugLogger | null = null;

	/**
	 * Private constructor to enforce singleton pattern
	 */
	private constructor() {}

	/**
	 * Get the singleton instance of TwoslashManager
	 */
	public static getInstance(): TwoslashManager {
		if (!TwoslashManager.instance) {
			TwoslashManager.instance = new TwoslashManager();
		}
		return TwoslashManager.instance;
	}

	/**
	 * Initialize the Twoslash transformer with a TypeScript environment cache.
	 * This enables type-aware documentation with hover information and IntelliSense.
	 *
	 * @param vfs - Virtual file system mapping file paths to .d.ts content
	 * @param errorStatsCollector - Optional collector for tracking Twoslash errors
	 * @param logger - Optional logger for inline error reporting
	 * @param tsEnvCache - TypeScript virtual environment cache for reusing language services
	 * @param compilerOptions - TypeScript compiler options for Twoslash (defaults to DEFAULT_COMPILER_OPTIONS)
	 */
	public initialize(
		vfs: VirtualFileSystem,
		errorStatsCollector?: TwoslashErrorStatsCollector,
		logger?: DebugLogger,
		tsEnvCache?: Map<string, VirtualTypeScriptEnvironment>,
		compilerOptions?: TypeResolutionCompilerOptions,
	): void {
		this.errorStatsCollector = errorStatsCollector || null;
		this.logger = logger || null;
		// Convert VFS Map to record for Twoslash extraFiles
		const extraFiles: Record<string, string> = {};
		for (const [path, content] of vfs.entries()) {
			extraFiles[path] = content;
		}

		// Use provided compiler options or fall back to defaults
		const resolvedOptions = compilerOptions ?? DEFAULT_COMPILER_OPTIONS;

		// Create the transformer with virtual file system
		this.transformer = transformerTwoslash({
			renderer: rendererRich({
				// Custom hover info processor that preserves namespace/interface hovers
				// The default processor removes lines like "interface Foo" or "namespace Bar"
				// which causes hovers to be skipped for non-generic interfaces and namespaces
				processHoverInfo: (info: string): string => {
					// Remove the (alias) prefix and import lines, but keep interface/namespace declarations
					return info
						.replace(/^\(([\w-]+)\)\s+/gm, "") // Remove "(alias) " prefix
						.replace(/\nimport .*$/gm, "") // Remove "import X" lines
						.trim();
				},
				// Process TSDoc documentation to remove @example blocks and format for display
				processHoverDocs,
				// Render markdown content in hover popups
				renderMarkdown,
				renderMarkdownInline,
			}),
			// Pass TypeScript environment cache for reusing language services across code blocks
			cache: tsEnvCache,
			twoslashOptions: {
				// Pass the virtual file system to Twoslash via extraFiles
				extraFiles, // Provide all our type declaration files
				// Cast to ts.CompilerOptions for compatibility with Twoslash's expected type
				compilerOptions: resolvedOptions as ts.CompilerOptions,
				// Allow TypeScript errors to be rendered as annotations without throwing
				// Users can still use @noErrors to suppress errors, or @errors: XXXX to expect specific errors
				handbookOptions: {
					noErrorValidation: true,
				},
			},
			// Only run on code blocks explicitly marked with 'twoslash'
			explicitTrigger: true,
			// Don't throw errors for TypeScript errors in examples
			// Documentation examples may be intentionally incomplete
			throws: false,
			// Log when transforming
			onTwoslashError: (error: unknown, code: string): void => {
				// Record error in stats collector if available
				if (this.errorStatsCollector) {
					this.errorStatsCollector.recordError(error, code);

					// Log inline at DEBUG level if logger is available
					if (this.logger) {
						this.errorStatsCollector.logError(this.logger, error, code);
					}
				} else if (this.logger) {
					// Fallback to logger if no collector but logger available
					const errorMsg = error instanceof Error ? error.message : String(error);
					const stack = error instanceof Error ? error.stack : undefined;
					this.logger.debug(`🔴 Twoslash error: ${errorMsg}`);
					if (stack) {
						this.logger.debug(`   Stack: ${stack.split("\n").slice(0, 3).join("\n   ")}`);
					}
					this.logger.debug(`   Code (first 200 chars): ${code.substring(0, 200).replace(/\n/g, " ")}`);
				} else {
					// Ultimate fallback to console logging if no collector or logger
					const errorMsg = error instanceof Error ? error.message : String(error);
					const stack = error instanceof Error ? error.stack : undefined;
					console.error("🔴 Twoslash error:", errorMsg);
					if (stack) {
						console.error("   Stack:", stack.split("\n").slice(0, 3).join("\n   "));
					}
					console.error("   Code (first 200 chars):", code.substring(0, 200).replace(/\n/g, " "));
				}
			},
		});

		if (this.logger) {
			this.logger.verbose(`✅ Twoslash transformer initialized with ${vfs.size} type definition files`);
		}
	}

	/**
	 * Get the initialized Twoslash transformer.
	 * Returns null if not initialized.
	 */
	public getTransformer(): ShikiTransformer | null {
		return this.transformer;
	}

	/**
	 * Clear the Twoslash transformer (useful for testing or reinitializing)
	 */
	public clear(): void {
		this.transformer = null;
	}

	/**
	 * Reset the singleton instance (useful for testing)
	 */
	public static reset(): void {
		TwoslashManager.instance = null;
	}

	/**
	 * Set the type routes map for resolving {@link ...} references in hover docs.
	 * This should be called before initialize() to enable type linking.
	 *
	 * @param routes - Map of type names to their documentation URLs
	 */
	public static setTypeRoutes(routes: Map<string, string>): void {
		typeRoutes = routes;
	}

	/**
	 * Add routes to the existing type routes map.
	 * Useful for adding routes from multiple packages.
	 *
	 * @param routes - Map of type names to their documentation URLs
	 */
	public static addTypeRoutes(routes: Map<string, string>): void {
		for (const [name, route] of routes) {
			typeRoutes.set(name, route);
		}
	}

	/**
	 * Clear the type routes map (useful for testing)
	 */
	public static clearTypeRoutes(): void {
		typeRoutes.clear();
	}
}
