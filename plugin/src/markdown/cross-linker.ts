/**
 * Minimal shape of an API item needed for cross-linking.
 * Structural subtype of ApiItem — only the properties actually accessed.
 */
export interface CrossLinkableItem {
	readonly displayName: string;
	readonly kind: string;
	readonly members?: readonly CrossLinkableItem[];
}

/**
 * A cross-linking utility for markdown API documentation.
 *
 * This class maintains a mapping of API item names to their documentation routes,
 * enabling automatic cross-linking of type references in markdown content. It supports
 * both top-level exports and class/interface members.
 *
 * **How it works:**
 * 1. During initialization, it builds a route map from all API items in a package
 * 2. For classes and interfaces, it also maps their members (e.g., `ClassName.methodName`)
 * 3. When processing text, it replaces type names with markdown or HTML links
 *
 * **Relationships:**
 * - Initialized by {@link ApiExtractorPlugin} with categorized API items
 * - Used by page generators to add cross-links in documentation text
 * - Provides route/kind data to {@link ShikiCrossLinker} for code block linking
 *
 * **Link Formats:**
 * - Markdown: `[TypeName](/path/to/type)` - for use in .mdx content
 * - HTML: anchor tags with href - for use in JSX/components
 *
 * @example Initialization
 * ```ts
 * const crossLinker = new MarkdownCrossLinker();
 * const { routes, kinds } = crossLinker.initialize(
 *   categorizedItems,
 *   "/api/my-package",
 *   categories
 * );
 * ```
 *
 * @example Adding cross-links
 * ```ts
 * // Markdown format
 * const text = crossLinker.addCrossLinks("Returns a MyClass instance");
 * // Result: "Returns a [MyClass](/api/my-package/class/myclass) instance"
 *
 * // HTML format (for JSX)
 * const html = crossLinker.addCrossLinksHtml("Returns a MyClass instance");
 * // Result: "Returns a anchor-linked MyClass instance"
 * ```
 *
 * @see {@link ShikiCrossLinker} for code block cross-linking
 */
export class MarkdownCrossLinker {
	/**
	 * Map of API item names to their route paths for cross-linking
	 */
	private readonly apiItemRoutes: Map<string, string> = new Map();

	/**
	 * Clear all accumulated routes. Call at the start of each build.
	 */
	public clear(): void {
		this.apiItemRoutes.clear();
	}

	/**
	 * Add routes for API items. Accumulates across multiple calls.
	 * Call clear() first if starting a fresh build.
	 * @returns Object with routes map and kinds map for semantic highlighting
	 */
	public addRoutes(
		items: Record<string, CrossLinkableItem[]>,
		baseRoute: string,
		categories: Record<string, { folderName: string }>,
	): { routes: Map<string, string>; kinds: Map<string, string> } {
		const apiItemKinds = new Map<string, string>();

		// Iterate through each category and add routes for all items
		for (const [categoryKey, categoryConfig] of Object.entries(categories)) {
			const categoryItems = items[categoryKey] || [];
			for (const item of categoryItems) {
				const itemRoute = `${baseRoute}/${categoryConfig.folderName}/${item.displayName.toLowerCase()}`;
				this.apiItemRoutes.set(item.displayName, itemRoute);
				apiItemKinds.set(item.displayName, item.kind);

				// For classes and interfaces, also add routes for their members
				if ((item.kind === "Class" || item.kind === "Interface") && item.members) {
					for (const member of item.members) {
						const memberName = member.displayName;
						const memberId = this.sanitizeId(memberName);
						const fullMemberName = `${item.displayName}.${memberName}`;
						const memberRoute = `${itemRoute}#${memberId}`;
						this.apiItemRoutes.set(fullMemberName, memberRoute);
						apiItemKinds.set(fullMemberName, member.kind);
					}
				}
			}
		}

		return { routes: this.apiItemRoutes, kinds: apiItemKinds };
	}

	/**
	 * Initialize the cross-link map with all API items.
	 * @deprecated Use clear() + addRoutes() instead.
	 * @returns Object with routes map and kinds map for semantic highlighting
	 */
	public initialize(
		items: Record<string, CrossLinkableItem[]>,
		baseRoute: string,
		categories: Record<string, { folderName: string }>,
	): { routes: Map<string, string>; kinds: Map<string, string> } {
		this.clear();
		return this.addRoutes(items, baseRoute, categories);
	}

	/**
	 * Set routes directly from pre-built route maps (e.g., from prepareWorkItems).
	 * Replaces all existing routes.
	 */
	public setRoutes(routes: Map<string, string>): void {
		this.apiItemRoutes.clear();
		for (const [name, route] of routes) {
			this.apiItemRoutes.set(name, route);
		}
	}

	/**
	 * Add cross-links to type references in code (markdown format).
	 *
	 * Skips matches inside backtick code spans and existing markdown links.
	 */
	public addCrossLinks(text: string): string {
		let result = text;

		// Sort by length descending to match longer names first (e.g., "HookEvent" before "Hook")
		const sortedNames = Array.from(this.apiItemRoutes.keys()).sort((a, b) => b.length - a.length);

		for (const name of sortedNames) {
			const route = this.apiItemRoutes.get(name);
			if (!route) continue;

			// Match the type name when it's a standalone word (not part of another word)
			// Also match when followed by generic brackets, array brackets, or type operators
			const regex = new RegExp(`\\b${name}\\b(?![a-zA-Z])`, "g");

			result = result.replace(regex, (match, offset: number) => {
				const beforeMatch = result.substring(0, offset);
				// Don't linkify if it's already in a markdown link
				if (beforeMatch.endsWith("](") || beforeMatch.endsWith("[")) {
					return match;
				}
				// Don't linkify inside backtick code spans
				const backtickCount = (beforeMatch.match(/`/g) || []).length;
				if (backtickCount % 2 === 1) {
					return match;
				}
				return `[${match}](${route})`;
			});
		}

		return result;
	}

	/**
	 * Add cross-links to type references in code (HTML format)
	 * Use this when the text will be rendered as HTML (e.g., in React components)
	 */
	public addCrossLinksHtml(text: string): string {
		let result = text;

		// Sort by length descending to match longer names first (e.g., "HookEvent" before "Hook")
		const sortedNames = Array.from(this.apiItemRoutes.keys()).sort((a, b) => b.length - a.length);

		for (const name of sortedNames) {
			const route = this.apiItemRoutes.get(name);
			if (!route) continue;

			// Match the type name when it's a standalone word (not part of another word)
			// Also match when followed by generic brackets, array brackets, or type operators
			const regex = new RegExp(`\\b${name}\\b(?![a-zA-Z])`, "g");

			result = result.replace(regex, (match, offset: number) => {
				// Don't linkify if it's already in an HTML link
				const beforeMatch = result.substring(0, offset);
				if (beforeMatch.includes("<a") && !beforeMatch.includes("</a>")) {
					return match;
				}
				return `<a href="${route}">${match}</a>`;
			});
		}

		return result;
	}

	/**
	 * Sanitize a display name to create a valid HTML ID
	 * Converts to lowercase, replaces spaces/special chars with hyphens
	 */
	private sanitizeId(displayName: string, prefix: string = ""): string {
		const sanitized = displayName
			.toLowerCase()
			// Replace spaces and special characters with hyphens
			.replace(/[\s_]+/g, "-")
			// Remove any remaining special characters except hyphens
			.replace(/[^a-z0-9-]/g, "")
			// Remove leading/trailing hyphens
			.replace(/^-+|-+$/g, "");

		return prefix ? `${prefix}-${sanitized}` : sanitized;
	}
}

/**
 * Module-level instance used by internal generator functions.
 * External callers should create their own instance or use this one.
 */
export const markdownCrossLinker: MarkdownCrossLinker = new MarkdownCrossLinker();
