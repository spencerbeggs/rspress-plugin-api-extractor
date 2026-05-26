import type { ApiItem, ApiPackage } from "@microsoft/api-extractor-model";

/**
 * A resolved API item with entry point metadata for deduplication.
 */
export interface ResolvedEntryItem {
	/** The API item from the model */
	readonly item: ApiItem;
	/** Which entry point defines this item (canonical owner) */
	readonly definingEntryPoint: string;
	/** All entry points that export this item (includes re-exports) */
	readonly availableFrom: string[];
}

/**
 * Derive an entry point name from its display name in the API model.
 *
 * - Empty string (main entry "." in package.json) maps to "default"
 * - Named entries (e.g., "testing") keep their name
 */
function getEntryPointName(displayName: string): string {
	return displayName === "" ? "default" : displayName;
}

/**
 * Create a stable identity key for an API item based on its display name and kind.
 * Used to detect re-exports across entry points.
 */
function itemKey(item: ApiItem): string {
	return `${item.displayName}::${item.kind}`;
}

/**
 * Resolve all entry points from an API package into a flat list of
 * deduplicated items.
 *
 * - Re-exported items (same displayName + kind across entries) are
 *   deduplicated to a single entry with availableFrom listing all
 *   entry points. The defining entry point prefers "default".
 * - Items with different kinds but the same displayName (e.g. the
 *   Effect const + type companion pattern) remain as separate entries.
 *
 * @param apiPackage - The merged API package with 1+ entry points
 * @returns Flat array of resolved items
 */
export function resolveEntryPoints(apiPackage: ApiPackage): ResolvedEntryItem[] {
	// Step 1: Collect all items grouped by key, tracking which entry points export them
	const itemsByKey = new Map<
		string,
		Array<{
			item: ApiItem;
			entryPointName: string;
		}>
	>();

	for (const entryPoint of apiPackage.entryPoints) {
		const epName = getEntryPointName(entryPoint.displayName);
		for (const member of entryPoint.members) {
			const key = itemKey(member);
			const existing = itemsByKey.get(key) || [];
			existing.push({ item: member, entryPointName: epName });
			itemsByKey.set(key, existing);
		}
	}

	// Step 2: For each key, build intermediate results
	interface IntermediateResult {
		item: ApiItem;
		definingEntryPoint: string;
		availableFrom: string[];
	}
	const intermediate: IntermediateResult[] = [];

	for (const [, entries] of itemsByKey) {
		if (entries.length === 1) {
			const { item, entryPointName } = entries[0];
			intermediate.push({
				item,
				definingEntryPoint: entryPointName,
				availableFrom: [entryPointName],
			});
		} else {
			// Multiple entries with same key — deduplicate, preferring "default"
			const definingEntry = entries.find((e) => e.entryPointName === "default") || entries[0];
			const allEntryPoints = [...new Set(entries.map((e) => e.entryPointName))];
			intermediate.push({
				item: definingEntry.item,
				definingEntryPoint: definingEntry.entryPointName,
				availableFrom: allEntryPoints,
			});
		}
	}

	// Step 3: Build final results
	return intermediate.map((r) => ({
		item: r.item,
		definingEntryPoint: r.definingEntryPoint,
		availableFrom: r.availableFrom,
	}));
}
