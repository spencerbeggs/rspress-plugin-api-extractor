import async from "async";

/**
 * Execute tasks with bounded parallelism using async.queue.
 *
 * Uses a queue-based approach for better throughput - work starts immediately
 * as slots become available, with no overhead from Promise.race.
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
	if (items.length === 0) {
		return [];
	}

	const results: R[] = new Array(items.length);

	return new Promise((resolve, reject) => {
		let hasError = false;

		// Create a queue that processes items with bounded concurrency
		const queue = async.queue<{ item: T; index: number }>(async (task) => {
			if (hasError) return; // Skip if we've already errored
			const result = await fn(task.item);
			results[task.index] = result;
		}, limit);

		// Handle errors
		queue.error((err) => {
			if (!hasError) {
				hasError = true;
				queue.kill();
				reject(err);
			}
		});

		// Resolve when queue is drained
		queue.drain(() => {
			if (!hasError) {
				resolve(results);
			}
		});

		// Push all items to the queue
		for (let i = 0; i < items.length; i++) {
			queue.push({ item: items[i], index: i });
		}
	});
}
