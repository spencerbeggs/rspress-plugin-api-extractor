import type { ApiClass, ApiInterface, ApiItem, ApiPackage } from "@microsoft/api-extractor-model";
import type { NamespaceMember } from "./loader.js";
import { ApiParser } from "./loader.js";
import type { CategoryConfig } from "./types.js";

export interface WorkItem {
	readonly item: ApiItem;
	readonly categoryKey: string;
	readonly categoryConfig: CategoryConfig;
	readonly namespaceMember?: NamespaceMember;
}

export interface GeneratedPageResult {
	readonly workItem: WorkItem;
	readonly content: string;
	readonly bodyContent: string;
	readonly frontmatter: Record<string, unknown>;
	readonly contentHash: string;
	readonly frontmatterHash: string;
	readonly routePath: string;
	readonly relativePathWithExt: string;
	readonly publishedTime: string;
	readonly modifiedTime: string;
	readonly isUnchanged: boolean;
}

export interface CrossLinkData {
	readonly routes: Map<string, string>;
	readonly kinds: Map<string, string>;
}

export interface FileSnapshot {
	readonly outputDir: string;
	readonly filePath: string;
	readonly publishedTime: string;
	readonly modifiedTime: string;
	readonly contentHash: string;
	readonly frontmatterHash: string;
	readonly buildTime: string;
}

export interface FileWriteResult {
	readonly relativePathWithExt: string;
	readonly absolutePath: string;
	readonly status: "new" | "modified" | "unchanged";
	readonly snapshot: FileSnapshot;
	readonly categoryKey: string;
	readonly label: string;
	readonly routePath: string;
}

export interface PrepareWorkItemsInput {
	readonly apiPackage: ApiPackage;
	readonly categories: Record<string, CategoryConfig>;
	readonly baseRoute: string;
	readonly packageName: string;
}

export interface PrepareWorkItemsResult {
	readonly workItems: WorkItem[];
	readonly crossLinkData: CrossLinkData;
}

/**
 * Sanitize a display name to create a valid HTML ID.
 * Mirrors the logic in MarkdownCrossLinker.sanitizeId().
 */
function sanitizeId(displayName: string): string {
	return displayName
		.toLowerCase()
		.replace(/[\s_]+/g, "-")
		.replace(/[^a-z0-9-]/g, "")
		.replace(/^-+|-+$/g, "");
}

/**
 * Prepare the flat list of WorkItems to process and the cross-link data maps.
 *
 * This function:
 * 1. Categorizes API items from the model
 * 2. Builds cross-link routes and kinds maps (replicating MarkdownCrossLinker.initialize())
 * 3. Extracts namespace members and adds their routes (with collision detection)
 * 4. Flattens all items into a single WorkItem[]
 *
 * NOTE: This function does NOT call the markdownCrossLinker singleton. The caller
 * is responsible for passing the returned crossLinkData to the cross-linker and
 * Shiki cross-linker as needed.
 */
export function prepareWorkItems(input: PrepareWorkItemsInput): PrepareWorkItemsResult {
	const { apiPackage, categories, baseRoute } = input;

	// 1. Categorize API items by category key
	const items = ApiParser.categorizeApiItems(apiPackage, categories);

	// 2. Build cross-link routes and kinds maps directly
	//    (mirrors MarkdownCrossLinker.initialize() logic)
	const routes = new Map<string, string>();
	const kinds = new Map<string, string>();

	for (const [categoryKey, categoryConfig] of Object.entries(categories)) {
		const categoryItems = items[categoryKey] || [];
		for (const item of categoryItems) {
			const itemRoute = `${baseRoute}/${categoryConfig.folderName}/${item.displayName.toLowerCase()}`;
			routes.set(item.displayName, itemRoute);
			kinds.set(item.displayName, item.kind);

			// For classes and interfaces, also add routes for their members
			if (item.kind === "Class" || item.kind === "Interface") {
				const itemWithMembers = item as ApiClass | ApiInterface;
				for (const member of itemWithMembers.members) {
					const memberName = member.displayName;
					const memberId = sanitizeId(memberName);
					const fullMemberName = `${item.displayName}.${memberName}`;
					const memberRoute = `${itemRoute}#${memberId}`;
					routes.set(fullMemberName, memberRoute);
					kinds.set(fullMemberName, member.kind);
				}
			}
		}
	}

	// 3. Extract namespace members and add their routes with collision detection
	const namespaceMembers = ApiParser.extractNamespaceMembers(apiPackage);

	// Track unqualified names to detect collisions across namespaces
	const unqualifiedNameCounts = new Map<string, number>();
	for (const nsMember of namespaceMembers) {
		const name = nsMember.item.displayName;
		unqualifiedNameCounts.set(name, (unqualifiedNameCounts.get(name) || 0) + 1);
	}

	for (const nsMember of namespaceMembers) {
		const categoryEntry = Object.entries(categories).find(([, config]) =>
			config.itemKinds?.includes(nsMember.item.kind),
		);
		if (!categoryEntry) continue;
		const [, categoryConfig] = categoryEntry;

		const qualifiedRoute = `${baseRoute}/${categoryConfig.folderName}/${nsMember.qualifiedName.toLowerCase()}`;

		// Always add qualified name (e.g., "Formatters.FormatOptions")
		routes.set(nsMember.qualifiedName, qualifiedRoute);
		kinds.set(nsMember.qualifiedName, nsMember.item.kind);

		// Add unqualified PascalCase name if no collision and not already present
		const displayName = nsMember.item.displayName;
		const isPascalCase = /^[A-Z]/.test(displayName);
		if (isPascalCase && (unqualifiedNameCounts.get(displayName) || 0) <= 1 && !routes.has(displayName)) {
			routes.set(displayName, qualifiedRoute);
			kinds.set(displayName, nsMember.item.kind);
		}
	}

	// 4. Flatten all items into a single WorkItem[]
	const workItems: WorkItem[] = [];

	for (const [categoryKey, categoryConfig] of Object.entries(categories)) {
		const categoryItems = items[categoryKey] || [];
		for (const item of categoryItems) {
			workItems.push({ item, categoryKey, categoryConfig });
		}
	}

	// Add namespace members as work items
	for (const nsMember of namespaceMembers) {
		const categoryEntry = Object.entries(categories).find(([, config]) =>
			config.itemKinds?.includes(nsMember.item.kind),
		);
		if (categoryEntry) {
			const [categoryKey, categoryConfig] = categoryEntry;
			workItems.push({
				item: nsMember.item,
				categoryKey,
				categoryConfig,
				namespaceMember: nsMember,
			});
		}
	}

	return {
		workItems,
		crossLinkData: { routes, kinds },
	};
}
