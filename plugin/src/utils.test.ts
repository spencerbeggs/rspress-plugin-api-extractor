import { describe, expect, it } from "vitest";
import { parallelLimit } from "./utils.js";

describe("parallelLimit", () => {
	describe("Concurrency Control", () => {
		it("should execute tasks with limit less than items length", async () => {
			const items = [1, 2, 3, 4, 5];
			const results = await parallelLimit(items, 2, async (num) => num * 2);

			expect(results).toEqual([2, 4, 6, 8, 10]);
		});

		it("should execute tasks with limit greater than items length", async () => {
			const items = [1, 2, 3];
			const results = await parallelLimit(items, 10, async (num) => num * 2);

			expect(results).toEqual([2, 4, 6]);
		});

		it("should execute tasks with limit equal to items length", async () => {
			const items = [1, 2, 3];
			const results = await parallelLimit(items, 3, async (num) => num * 2);

			expect(results).toEqual([2, 4, 6]);
		});

		it("should execute tasks with limit of 1 (sequential)", async () => {
			const items = [1, 2, 3, 4];
			const results = await parallelLimit(items, 1, async (num) => num + 10);

			expect(results).toEqual([11, 12, 13, 14]);
		});
	});

	describe("Result Order", () => {
		it("should maintain result order when tasks complete at different times", async () => {
			const items = [100, 50, 10, 5];
			const results = await parallelLimit(items, 2, async (delay) => {
				await new Promise((resolve) => setTimeout(resolve, delay));
				return delay;
			});

			expect(results).toEqual([100, 50, 10, 5]);
		});

		it("should maintain result order with limit of 1", async () => {
			const items = [30, 10, 20];
			const results = await parallelLimit(items, 1, async (delay) => {
				await new Promise((resolve) => setTimeout(resolve, delay));
				return delay * 2;
			});

			expect(results).toEqual([60, 20, 40]);
		});

		it("should maintain result order with varying execution times", async () => {
			const items = [1, 2, 3, 4, 5];
			const results = await parallelLimit(items, 3, async (num) => {
				// Later numbers complete faster
				const delay = (6 - num) * 10;
				await new Promise((resolve) => setTimeout(resolve, delay));
				return num * 10;
			});

			expect(results).toEqual([10, 20, 30, 40, 50]);
		});
	});

	describe("Edge Cases", () => {
		it("should handle empty array", async () => {
			const results = await parallelLimit([], 2, async (num: number) => num * 2);

			expect(results).toEqual([]);
		});

		it("should handle single item", async () => {
			const results = await parallelLimit([5], 2, async (num) => num * 3);

			expect(results).toEqual([15]);
		});

		it("should handle async functions that return different types", async () => {
			const items = ["a", "b", "c"];
			const results = await parallelLimit(items, 2, async (str) => str.toUpperCase());

			expect(results).toEqual(["A", "B", "C"]);
		});

		it("should handle objects as items", async () => {
			const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
			const results = await parallelLimit(items, 2, async (obj) => ({ ...obj, processed: true }));

			expect(results).toEqual([
				{ id: 1, processed: true },
				{ id: 2, processed: true },
				{ id: 3, processed: true },
			]);
		});
	});

	describe("Error Handling", () => {
		it("should reject if any task throws an error", async () => {
			const items = [1, 2, 3, 4];
			const promise = parallelLimit(items, 2, async (num) => {
				if (num === 3) {
					throw new Error("Task 3 failed");
				}
				return num * 2;
			});

			await expect(promise).rejects.toThrow("Task 3 failed");
		});

		it("should reject on first error even with multiple failures", async () => {
			const items = [1, 2, 3, 4, 5];
			const promise = parallelLimit(items, 3, async (num) => {
				await new Promise((resolve) => setTimeout(resolve, num * 10));
				if (num === 2 || num === 4) {
					throw new Error(`Task ${num} failed`);
				}
				return num;
			});

			await expect(promise).rejects.toThrow(/Task \d failed/);
		});
	});

	describe("Concurrency Verification", () => {
		it("should respect concurrency limit", async () => {
			let currentlyExecuting = 0;
			let maxConcurrent = 0;
			const limit = 3;

			const items = Array.from({ length: 10 }, (_, i) => i);

			await parallelLimit(items, limit, async (num) => {
				currentlyExecuting++;
				maxConcurrent = Math.max(maxConcurrent, currentlyExecuting);

				await new Promise((resolve) => setTimeout(resolve, 10));

				currentlyExecuting--;
				return num;
			});

			expect(maxConcurrent).toBeLessThanOrEqual(limit);
			expect(currentlyExecuting).toBe(0);
		});

		it("should not exceed limit even with fast tasks", async () => {
			let currentlyExecuting = 0;
			let maxConcurrent = 0;
			const limit = 2;

			const items = Array.from({ length: 100 }, (_, i) => i);

			await parallelLimit(items, limit, async (num) => {
				currentlyExecuting++;
				maxConcurrent = Math.max(maxConcurrent, currentlyExecuting);

				// Very fast tasks (no delay)
				currentlyExecuting--;
				return num;
			});

			expect(maxConcurrent).toBeLessThanOrEqual(limit);
		});
	});

	describe("Return Type Inference", () => {
		it("should infer return type correctly for numbers", async () => {
			const results = await parallelLimit([1, 2, 3], 2, async (num) => num * 2);

			// TypeScript should infer results as number[]
			const sum: number = results.reduce((a, b) => a + b, 0);
			expect(sum).toBe(12);
		});

		it("should infer return type correctly for strings", async () => {
			const results = await parallelLimit(["a", "b"], 1, async (str) => str.toUpperCase());

			// TypeScript should infer results as string[]
			const joined: string = results.join("");
			expect(joined).toBe("AB");
		});

		it("should handle mixed types correctly", async () => {
			interface Item {
				id: number;
				name: string;
			}

			const items: Item[] = [
				{ id: 1, name: "a" },
				{ id: 2, name: "b" },
			];

			const results = await parallelLimit(items, 2, async (item) => item.name);

			// TypeScript should infer results as string[]
			expect(results).toEqual(["a", "b"]);
		});
	});
});
