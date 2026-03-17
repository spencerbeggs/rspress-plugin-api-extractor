/**
 * Execute tasks with bounded parallelism using native Promises.
 *
 * @param items - Array of items to process
 * @param limit - Maximum number of concurrent executions
 * @param fn - Async function to execute for each item
 * @returns Promise resolving to array of results in original order
 *
 * @example
 * ```typescript
 * const results = await parallelLimit(
 *   [1, 2, 3, 4, 5],
 *   2, // Max 2 concurrent
 *   async (num) => num * 2
 * );
 * // results: [2, 4, 6, 8, 10]
 * ```
 */
export async function parallelLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	if (items.length === 0) return [];

	const results: R[] = new Array(items.length);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		while (nextIndex < items.length) {
			const index = nextIndex++;
			results[index] = await fn(items[index]);
		}
	}

	const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
	await Promise.all(workers);
	return results;
}
