import type { ApiClass, ApiInterface, ApiItem, ApiNamespace, ApiPackage } from "@microsoft/api-extractor-model";
import { ApiDocumentedItem, ApiItemKind } from "@microsoft/api-extractor-model";
import type { DocNode } from "@microsoft/tsdoc";
import {
	extractPlainText as libExtractPlainText,
	getDeprecation as libGetDeprecation,
	getExamples as libGetExamples,
	getParams as libGetParams,
	getReleaseTag as libGetReleaseTag,
	getReturns as libGetReturns,
	getSummary as libGetSummary,
	hasModifierTag as libHasModifierTag,
} from "api-extractor-llms";
import type { ResolvedEntryItem } from "./multi-entry-resolver.js";
import type { PluginEvent } from "./observability/events.js";
import { PluginEvent as PE } from "./observability/events.js";
import type { CategoryConfig, SourceConfig } from "./schemas/index.js";

/** Module-level emitter injected by plugin.ts at startup. */
let emitEvent: (event: PluginEvent) => void = () => {};
export function setLoaderEventEmitter(fn: (event: PluginEvent) => void): void {
	emitEvent = fn;
}

/**
 * Represents a member of a namespace with its parent namespace context.
 */
export interface NamespaceMember {
	/** The API item (class, interface, function, etc.) */
	item: ApiItem;
	/** The parent namespace */
	namespace: ApiNamespace;
	/** Qualified name including namespace prefix (e.g., "MathUtils.Vector") */
	qualifiedName: string;
}

/**
 * Parser for extracting and analyzing information from API Extractor models and TSDoc comments
 */
export class ApiParser {
	/**
	 * Private constructor to prevent instantiation
	 */
	private constructor() {
		// This class should only be used for its static methods
	}

	/**
	 * Check if an API item has a custom modifier tag
	 */
	public static hasModifierTag(item: ApiItem, tagName: string): boolean {
		return libHasModifierTag(item, tagName);
	}

	/**
	 * Extract all API items from a package (or resolved entry items) and categorize them based on configuration.
	 *
	 * When passed a `ResolvedEntryItem[]`, uses the items directly (multi-entry support).
	 * When passed an `ApiPackage`, reads from `entryPoints[0]` (legacy single-entry behavior).
	 */
	public static categorizeApiItems(
		source: ApiPackage | ResolvedEntryItem[],
		categories: Record<string, CategoryConfig>,
	): Record<string, ApiItem[]> {
		// Initialize empty arrays for each category
		const items: Record<string, ApiItem[]> = {};
		for (const categoryKey of Object.keys(categories)) {
			items[categoryKey] = [];
		}

		// Extract the flat list of API items from the source
		let members: readonly ApiItem[];
		if (Array.isArray(source)) {
			members = source.map((r) => r.item);
		} else {
			const entryPoint = source.entryPoints[0];
			if (!entryPoint) {
				return items;
			}
			members = entryPoint.members;
		}

		// Sort categories: those with tsdocModifier first (higher priority)
		const sortedCategories = Object.entries(categories).sort((a, b) => {
			const [, configA] = a;
			const [, configB] = b;
			// Categories with tsdocModifier come first
			if (configA.tsdocModifier && !configB.tsdocModifier) return -1;
			if (!configA.tsdocModifier && configB.tsdocModifier) return 1;
			return 0;
		});

		// Categorize each member
		for (const member of members) {
			let categorized = false;

			// Check each category's rules (sorted by priority)
			for (const [categoryKey, config] of sortedCategories) {
				// First check TSDoc modifier (takes precedence)
				if (config.tsdocModifier && ApiParser.hasModifierTag(member, config.tsdocModifier)) {
					items[categoryKey].push(member);
					categorized = true;
					break;
				}

				// Then check item kind
				if (config.itemKinds?.includes(member.kind)) {
					items[categoryKey].push(member);
					categorized = true;
					break;
				}
			}

			// Emit event if item wasn't categorized (suppressed in test environments)
			if (!categorized && typeof process !== "undefined" && !process.env.VITEST) {
				emitEvent(
					PE.ItemSkipped({
						ctx: { buildId: "" },
						item: member.displayName,
						kind: String(member.kind),
						reason: "uncategorized",
						level: "warn",
					}),
				);
			}
		}

		return items;
	}

	/**
	 * Extract all members from namespaces in a package (or resolved entry items).
	 * Returns a flat list of namespace members with their qualified names.
	 *
	 * When passed a `ResolvedEntryItem[]`, scans those items for namespaces (multi-entry support).
	 * When passed an `ApiPackage`, reads from `entryPoints[0]` (legacy single-entry behavior).
	 *
	 * @param source - The API package or resolved entry items to extract from
	 * @returns Array of namespace members with qualified names
	 */
	public static extractNamespaceMembers(source: ApiPackage | ResolvedEntryItem[]): NamespaceMember[] {
		const members: NamespaceMember[] = [];

		// Extract the flat list of top-level items from the source
		let topLevelItems: readonly ApiItem[];
		if (Array.isArray(source)) {
			topLevelItems = source.map((r) => r.item);
		} else {
			const entryPoint = source.entryPoints[0];
			if (!entryPoint) {
				return members;
			}
			topLevelItems = entryPoint.members;
		}

		// Find all namespaces in the top-level items
		for (const item of topLevelItems) {
			if (item.kind === ApiItemKind.Namespace) {
				const namespace = item as ApiNamespace;
				// Extract members from this namespace
				for (const member of namespace.members) {
					members.push({
						item: member,
						namespace,
						qualifiedName: `${namespace.displayName}.${member.displayName}`,
					});
				}
			}
		}

		return members;
	}

	/**
	 * Extract plain text from a TSDoc DocNode tree (prose form).
	 *
	 * Delegates to api-extractor-llms `extractPlainText`. Used internally for
	 * `@see` reference text, where `{@link}` targets are flattened to display text.
	 */
	private static extractPlainText(node: DocNode): string {
		return libExtractPlainText(node);
	}

	/**
	 * Get the summary text from an API item's TSDoc comment
	 */
	public static getSummary(item: ApiItem): string {
		return libGetSummary(item);
	}

	/**
	 * Get the release tag (public, beta, alpha, internal) from an API item
	 */
	public static getReleaseTag(item: ApiItem): string {
		return libGetReleaseTag(item);
	}

	/**
	 * Get parameter documentation from an API item's TSDoc comment
	 */
	public static getParams(item: ApiItem): Array<{ name: string; type?: string; description: string }> {
		return libGetParams(item);
	}

	/**
	 * Get return value documentation from an API item's TSDoc comment
	 */
	public static getReturns(item: ApiItem): { description: string } | null {
		return libGetReturns(item);
	}

	/**
	 * Get code examples from an API item's TSDoc comment
	 */
	public static getExamples(item: ApiItem): Array<{ language: string; code: string }> {
		return libGetExamples(item);
	}

	/**
	 * Get deprecation message from an API item's TSDoc comment
	 */
	public static getDeprecation(item: ApiItem): { message: string } | null {
		return libGetDeprecation(item);
	}

	/**
	 * Get inheritance information from a class or interface
	 */
	public static getInheritance(item: ApiClass | ApiInterface): {
		extends?: string[];
		implements?: string[];
	} {
		const result: { extends?: string[]; implements?: string[] } = {};

		if (item.kind === ApiItemKind.Class) {
			const apiClass = item as ApiClass;

			// Get base class
			// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic property access
			if ((apiClass as any).extendsType) {
				// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic property access
				const extendsType = (apiClass as any).extendsType;
				result.extends = [extendsType.excerpt.text];
			}

			// Get implemented interfaces
			// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic property access
			const implementsTypes = (apiClass as any).implementsTypes || [];
			if (implementsTypes.length > 0) {
				// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic property access
				result.implements = implementsTypes.map((type: any) => type.excerpt.text);
			}
		} else if (item.kind === ApiItemKind.Interface) {
			const apiInterface = item as ApiInterface;

			// Get extended interfaces
			// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic property access
			const extendsTypes = (apiInterface as any).extendsTypes || [];
			if (extendsTypes.length > 0) {
				// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic property access
				result.extends = extendsTypes.map((type: any) => type.excerpt.text);
			}
		}

		return result;
	}

	/**
	 * Get see also references from an API item's TSDoc comment
	 */
	public static getSeeReferences(item: ApiItem): Array<{ text: string }> {
		if (item instanceof ApiDocumentedItem) {
			const tsdoc = item.tsdocComment;
			const references: Array<{ text: string }> = [];

			// biome-ignore lint/suspicious/noExplicitAny: TSDoc see blocks require dynamic property access
			for (const seeBlock of (tsdoc?.seeBlocks as any) || []) {
				// biome-ignore lint/suspicious/noExplicitAny: TSDoc content requires dynamic property access
				const content = (seeBlock as any).content;
				const text = ApiParser.extractPlainText(content);

				if (text.trim()) {
					references.push({
						text: text.replace(/\s+/g, " ").trim(),
					});
				}
			}

			return references;
		}
		return [];
	}

	/**
	 * Get source code link for an API item
	 * @param item - The API item
	 * @param sourceConfig - Source configuration with repository URL and ref
	 * @returns Source code URL with line number, or null if not available
	 */
	public static getSourceLink(item: ApiItem, sourceConfig?: SourceConfig): string | null {
		if (!sourceConfig) {
			return null;
		}

		// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic property access
		const itemAny = item as any;

		// API Extractor stores fileUrlPath directly on the item, not in a sourceLocation object
		const filePath = itemAny.fileUrlPath || itemAny.filePath;
		if (!filePath) {
			return null;
		}

		// Get line number if available
		const lineNumber = itemAny.fileLineNumber || itemAny.line;

		// Construct the base URL with ref (default to "blob/main")
		const ref = sourceConfig.ref || "blob/main";
		const baseUrl = `${sourceConfig.url}/${ref}`;

		// Construct the GitHub URL
		if (lineNumber) {
			return `${baseUrl}/${filePath}#L${lineNumber}`;
		}

		return `${baseUrl}/${filePath}`;
	}
}
