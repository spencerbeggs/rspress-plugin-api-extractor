/**
 * Normalises an unknown value into a plain `Record<string, unknown>`.
 *
 * @remarks
 * If `data` is already a non-null object it is returned as-is (cast to the
 * record type). Otherwise the value is wrapped in an object under the key
 * `"value"`. This utility is used internally to produce a consistent shape
 * before downstream processing steps that require an object.
 *
 * @internal
 *
 * @param data - The value to normalise.
 * @returns A `Record<string, unknown>` containing the original object or a
 *   `{ value: data }` wrapper for non-object inputs.
 */
export function normalizeData(data: unknown): Record<string, unknown> {
	if (typeof data === "object" && data !== null) {
		return data as Record<string, unknown>;
	}
	return { value: data };
}
