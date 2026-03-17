import type { ApiClass, ApiInterface, ApiItem, ApiNamespace, ApiPackage } from "@microsoft/api-extractor-model";
import { ApiDocumentedItem, ApiItemKind, ApiReleaseTagMixin, ReleaseTag } from "@microsoft/api-extractor-model";
import type { DocNode } from "@microsoft/tsdoc";
import type { CategoryConfig, SourceConfig } from "./schemas/index.js";

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
		if (item instanceof ApiDocumentedItem) {
			const tsdoc = item.tsdocComment;
			if (tsdoc?.modifierTagSet) {
				// biome-ignore lint/suspicious/noExplicitAny: TSDoc modifier tags require dynamic property access
				const modifierTags = (tsdoc.modifierTagSet as any).nodes || [];
				for (const tag of modifierTags) {
					// biome-ignore lint/suspicious/noExplicitAny: TSDoc tag requires dynamic property access
					if ((tag as any).tagName === `@${tagName}`) {
						return true;
					}
				}
			}
		}
		return false;
	}

	/**
	 * Extract all API items from a package and categorize them based on configuration
	 */
	public static categorizeApiItems(
		apiPackage: ApiPackage,
		categories: Record<string, CategoryConfig>,
	): Record<string, ApiItem[]> {
		// Initialize empty arrays for each category
		const items: Record<string, ApiItem[]> = {};
		for (const categoryKey of Object.keys(categories)) {
			items[categoryKey] = [];
		}

		// Get the entry point (there's typically only one)
		const entryPoint = apiPackage.entryPoints[0];
		if (!entryPoint) {
			return items;
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
		for (const member of entryPoint.members) {
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

			// Log warning if item wasn't categorized
			if (!categorized) {
				console.warn(`⚠️  API item "${member.displayName}" (kind: ${member.kind}) not categorized`);
			}
		}

		return items;
	}

	/**
	 * Extract all members from namespaces in a package.
	 * Returns a flat list of namespace members with their qualified names.
	 *
	 * @param apiPackage - The API package to extract from
	 * @returns Array of namespace members with qualified names
	 */
	public static extractNamespaceMembers(apiPackage: ApiPackage): NamespaceMember[] {
		const members: NamespaceMember[] = [];

		const entryPoint = apiPackage.entryPoints[0];
		if (!entryPoint) {
			return members;
		}

		// Find all namespaces in the entry point
		for (const item of entryPoint.members) {
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
	 * Recursively extract plain text from a TSDoc DocNode tree
	 */
	private static extractPlainText(node: DocNode): string {
		const parts: string[] = [];

		// Use any to access node-specific properties dynamically
		// biome-ignore lint/suspicious/noExplicitAny: TSDoc node types require dynamic property access
		const nodeAny = node as any;

		// Handle different node types
		if (node.kind === "PlainText") {
			// DocPlainText has a text property
			return nodeAny.text || "";
		}

		if (node.kind === "SoftBreak") {
			return " ";
		}

		if (node.kind === "CodeSpan") {
			// DocCodeSpan has a code property
			return `\`${nodeAny.code || ""}\``;
		}

		if (node.kind === "LinkTag") {
			// DocLinkTag - extract the link text or code destination
			if (nodeAny.linkText) {
				return ApiParser.extractPlainText(nodeAny.linkText);
			}
			if (nodeAny.codeDestination?.memberReferences?.[0]?.memberIdentifier) {
				return nodeAny.codeDestination.memberReferences[0].memberIdentifier.identifier || "";
			}
			return "";
		}

		// For nodes with children, recursively extract text
		if (node.getChildNodes && typeof node.getChildNodes === "function") {
			const children = node.getChildNodes();
			for (const child of children) {
				const childText = ApiParser.extractPlainText(child);
				if (childText) {
					parts.push(childText);
				}
			}
		}

		return parts.join("");
	}

	/**
	 * Get the summary text from an API item's TSDoc comment
	 */
	public static getSummary(item: ApiItem): string {
		if (item instanceof ApiDocumentedItem) {
			const tsdoc = item.tsdocComment;
			if (tsdoc?.summarySection) {
				// Extract plain text from the summary section's DocNode tree
				const summary = ApiParser.extractPlainText(tsdoc.summarySection);
				// Clean up any extra whitespace and newlines
				return summary.replace(/\s+/g, " ").trim();
			}
		}
		return "";
	}

	/**
	 * Get the release tag (public, beta, alpha, internal) from an API item
	 */
	public static getReleaseTag(item: ApiItem): string {
		if (ApiReleaseTagMixin.isBaseClassOf(item)) {
			const releaseTag = item.releaseTag;
			switch (releaseTag) {
				case ReleaseTag.Public:
					return "Public";
				case ReleaseTag.Beta:
					return "Beta";
				case ReleaseTag.Alpha:
					return "Alpha";
				case ReleaseTag.Internal:
					return "Internal";
				default:
					return "Public";
			}
		}
		return "Public";
	}

	/**
	 * Get parameter documentation from an API item's TSDoc comment
	 */
	public static getParams(item: ApiItem): Array<{ name: string; type?: string; description: string }> {
		const paramList: Array<{ name: string; type?: string; description: string }> = [];

		// Extract parameter types from excerpt if available
		const paramTypes = new Map<string, string>();
		// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic property access
		const parameters = (item as any).parameters;
		if (parameters && Array.isArray(parameters)) {
			for (const param of parameters) {
				// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic property access
				const paramExcerpt = (param as any).parameterTypeExcerpt;
				if (paramExcerpt?.text) {
					// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic property access
					const paramName = (param as any).name || "";
					paramTypes.set(paramName, paramExcerpt.text.trim());
				}
			}
		}

		// Extract parameter descriptions from TSDoc
		if (item instanceof ApiDocumentedItem) {
			const tsdoc = item.tsdocComment;
			if (tsdoc?.params) {
				// Iterate through param blocks
				for (const paramBlock of tsdoc.params.blocks) {
					// biome-ignore lint/suspicious/noExplicitAny: TSDoc param block requires dynamic property access
					const paramAny = paramBlock as any;
					const paramName = paramAny.parameterName || "";
					const description = ApiParser.extractPlainText(paramAny.content);

					paramList.push({
						name: paramName,
						type: paramTypes.get(paramName),
						description: description.replace(/\s+/g, " ").trim(),
					});
				}

				return paramList;
			}
		}

		// If no TSDoc params but we have parameter types, return them with empty descriptions
		if (paramTypes.size > 0) {
			for (const [name, type] of paramTypes.entries()) {
				paramList.push({
					name,
					type,
					description: "",
				});
			}
		}

		return paramList;
	}

	/**
	 * Get return value documentation from an API item's TSDoc comment
	 */
	public static getReturns(item: ApiItem): { description: string } | null {
		if (item instanceof ApiDocumentedItem) {
			const tsdoc = item.tsdocComment;
			if (tsdoc?.returnsBlock) {
				// biome-ignore lint/suspicious/noExplicitAny: TSDoc returns block requires dynamic property access
				const returnsAny = tsdoc.returnsBlock as any;
				const description = ApiParser.extractPlainText(returnsAny.content);

				return {
					description: description.replace(/\s+/g, " ").trim(),
				};
			}
		}
		return null;
	}

	/**
	 * Get code examples from an API item's TSDoc comment
	 */
	public static getExamples(item: ApiItem): Array<{ language: string; code: string }> {
		if (item instanceof ApiDocumentedItem) {
			const tsdoc = item.tsdocComment;
			const examples: Array<{ language: string; code: string }> = [];

			// Iterate through custom blocks looking for @example tags
			// biome-ignore lint/suspicious/noExplicitAny: TSDoc custom blocks require dynamic property access
			for (const customBlock of (tsdoc?.customBlocks as any) || []) {
				// biome-ignore lint/suspicious/noExplicitAny: TSDoc block tag requires dynamic property access
				const blockTag = (customBlock as any).blockTag;

				// Check if this is an @example block
				if (blockTag?.tagNameWithUpperCase === "@EXAMPLE") {
					// The content is a DocSection with child nodes
					// biome-ignore lint/suspicious/noExplicitAny: TSDoc content requires dynamic property access
					const content = (customBlock as any).content;

					// Look for DocFencedCode nodes
					// biome-ignore lint/suspicious/noExplicitAny: TSDoc nodes require dynamic property access
					for (const node of (content as any).nodes || []) {
						if (node.kind === "FencedCode") {
							// biome-ignore lint/suspicious/noExplicitAny: TSDoc fenced code requires dynamic property access
							const fencedCode = node as any;
							examples.push({
								language: fencedCode.language || "typescript",
								code: fencedCode.code || "",
							});
						}
					}

					// If no fenced code blocks found, extract plain text as fallback
					if (examples.length === 0) {
						const text = ApiParser.extractPlainText(content);
						if (text.trim()) {
							examples.push({
								language: "typescript",
								code: text.trim(),
							});
						}
					}
				}
			}

			return examples;
		}
		return [];
	}

	/**
	 * Get deprecation message from an API item's TSDoc comment
	 */
	public static getDeprecation(item: ApiItem): { message: string } | null {
		if (item instanceof ApiDocumentedItem) {
			const tsdoc = item.tsdocComment;
			if (tsdoc?.deprecatedBlock) {
				// biome-ignore lint/suspicious/noExplicitAny: TSDoc deprecated block requires dynamic property access
				const deprecatedAny = tsdoc.deprecatedBlock as any;
				const message = ApiParser.extractPlainText(deprecatedAny.content);

				return {
					message: message.replace(/\s+/g, " ").trim(),
				};
			}
		}
		return null;
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
