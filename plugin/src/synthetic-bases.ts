import type { ApiClass, ApiItem } from "@microsoft/api-extractor-model";
import { ApiExportedMixin, ApiItemKind, ExcerptTokenKind } from "@microsoft/api-extractor-model";

/**
 * Anchor id of the inline "Base Class" section rendered on the owner class
 * page. Must match the slug RSPress derives from the `## Base Class` heading
 * emitted by ClassPageGenerator.
 */
export const BASE_CLASS_ANCHOR = "base-class";

/**
 * A synthetic base declaration: an unexported item that API Extractor hoisted
 * into the model (via `includeForgottenExports`) because an exported class's
 * extends clause references it.
 *
 * TypeScript emits these for classes extending a call expression — e.g. the
 * Effect `Schema.Class`/`Data.TaggedError` patterns or mixin factories — as
 * `declare const Foo_base: ...; class Foo extends Foo_base {}`.
 */
export interface SyntheticBase {
	/** The unexported supporting declaration (usually a Variable). */
	readonly baseItem: ApiItem;
	/** Classes whose extends clause references this declaration, in model order. */
	readonly ownerClasses: readonly ApiClass[];
}

export interface SyntheticBaseDetection {
	/** Detected base declarations, keyed by the base ApiItem (identity). */
	readonly bases: ReadonlyMap<ApiItem, SyntheticBase>;
	/** Owner class -> its synthetic base declaration (identity keys). */
	readonly baseByOwner: ReadonlyMap<ApiItem, ApiItem>;
}

const EMPTY_DETECTION: SyntheticBaseDetection = {
	bases: new Map(),
	baseByOwner: new Map(),
};

/**
 * Strip the trailing meaning (`:class`, `:var`, `:function(1)`, ...) from a
 * canonical reference string so the reference token in an extends clause
 * (`example!~Person_base`) matches the declaration's canonical reference
 * (`example!~Person_base:var`).
 */
function stripMeaning(canonicalRef: string): string {
	return canonicalRef.replace(/:[a-z]+(\(\d+\))?$/i, "");
}

/** True when the item carries ApiExportedMixin and is NOT exported from its entry point. */
function isUnexported(item: ApiItem): boolean {
	return ApiExportedMixin.isBaseClassOf(item) && !item.isExported;
}

/**
 * Detect synthetic base declarations among top-level API items.
 *
 * An item qualifies when it is unexported (hoisted into the model only because
 * something references it) AND at least one class's extends clause references
 * its canonical symbol. Unexported items with no class referencing them
 * (genuine forgotten exports) are left alone, as are extends references whose
 * target is absent from the model.
 */
export function detectSyntheticBases(items: readonly ApiItem[]): SyntheticBaseDetection {
	// Index unexported items by canonical symbol (meaning stripped).
	const unexportedByRef = new Map<string, ApiItem>();
	for (const item of items) {
		if (!isUnexported(item)) continue;
		const ref = item.canonicalReference?.toString();
		if (ref) {
			unexportedByRef.set(stripMeaning(ref), item);
		}
	}
	if (unexportedByRef.size === 0) {
		return EMPTY_DETECTION;
	}

	const owners = new Map<ApiItem, ApiClass[]>();
	const baseByOwner = new Map<ApiItem, ApiItem>();

	for (const item of items) {
		if (item.kind !== ApiItemKind.Class) continue;
		const apiClass = item as ApiClass;
		const extendsType = apiClass.extendsType;
		if (!extendsType) continue;

		for (const token of extendsType.excerpt.spannedTokens) {
			if (token.kind !== ExcerptTokenKind.Reference || !token.canonicalReference) continue;
			const base = unexportedByRef.get(stripMeaning(token.canonicalReference.toString()));
			// A class cannot be its own base; the first referenced base wins.
			if (!base || base === item || baseByOwner.has(item)) continue;
			baseByOwner.set(item, base);
			const ownerList = owners.get(base);
			if (ownerList) {
				ownerList.push(apiClass);
			} else {
				owners.set(base, [apiClass]);
			}
		}
	}
	if (owners.size === 0) {
		return EMPTY_DETECTION;
	}

	const bases = new Map<ApiItem, SyntheticBase>();
	for (const [baseItem, ownerClasses] of owners) {
		bases.set(baseItem, { baseItem, ownerClasses });
	}
	return { bases, baseByOwner };
}
