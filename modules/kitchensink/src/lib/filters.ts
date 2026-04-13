import type { Transform } from "./interfaces.js";

/**
 * A collection of higher-order functions for filtering and slicing arrays.
 *
 * @remarks
 * `Filters` groups composable array-filtering helpers under a single namespace.
 * Each function returns a {@link Transform} that can be composed into a
 * pipeline stage or applied directly to an array. Functions are generic so
 * they preserve the item type through the filter step.
 *
 * @public
 */
export namespace Filters {
	/**
	 * Returns a {@link Transform} that filters an array to the items matching
	 * `predicate`.
	 *
	 * @remarks
	 * The returned transform delegates to `Array.prototype.filter`, so it
	 * preserves the original order of matching items and never mutates the
	 * input array.
	 *
	 * @typeParam T - The type of items in the array.
	 *
	 * @param predicate - A function that returns `true` for items to keep.
	 * @returns A {@link Transform} that accepts a `T[]` and returns a filtered `T[]`.
	 *
	 * @example
	 * ```typescript
	 * import { Filters } from "kitchensink";
	 *
	 * const onlyEven = Filters.where<number>((n) => n % 2 === 0);
	 * console.log(onlyEven([1, 2, 3, 4, 5])); // [2, 4]
	 * ```
	 *
	 * @public
	 */
	export function where<T>(predicate: (item: T) => boolean): Transform<T[], T[]> {
		return (items) => items.filter(predicate);
	}

	/**
	 * Returns a {@link Transform} that limits an array to at most `count` items.
	 *
	 * @remarks
	 * The returned transform delegates to `Array.prototype.slice` so it
	 * never mutates the input array. If `count` exceeds the array length the
	 * entire array is returned unchanged.
	 *
	 * @typeParam T - The type of items in the array.
	 *
	 * @param count - The maximum number of items to retain.
	 * @returns A {@link Transform} that accepts a `T[]` and returns the first
	 *   `count` elements as a new `T[]`.
	 *
	 * @public
	 */
	export function take<T>(count: number): Transform<T[], T[]> {
		return (items) => items.slice(0, count);
	}

	/**
	 * Returns a {@link Transform} that keeps only items whose `key` property
	 * contains `pattern` as a substring.
	 *
	 * @remarks
	 * The property value is converted to a string via `String()` before the
	 * substring check, so the filter works on any property type. The match is
	 * case-sensitive.
	 *
	 * This function is part of the staged fuzzy-search API and may change
	 * in a future minor release before it is promoted to stable.
	 *
	 * @beta
	 *
	 * @typeParam T - The type of items in the array.
	 *
	 * @param pattern - The substring to search for within the property value.
	 * @param key - The property key on each item to inspect.
	 * @returns A {@link Transform} that accepts a `T[]` and returns the items
	 *   whose `key` property contains `pattern`.
	 *
	 * @public
	 */
	export function fuzzy<T>(pattern: string, key: keyof T): Transform<T[], T[]> {
		return (items) => items.filter((item) => String(item[key]).includes(pattern));
	}
}
