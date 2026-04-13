import type { DataSink } from "../lib/interfaces.js";
import type { MockSource } from "./mock-source.js";
import type { TestPipeline } from "./test-pipeline.js";

/**
 * Generates an array of `count` mock items of type `T`.
 *
 * @typeParam T - The type of items to generate.
 * @param count - The number of items to generate.
 * @returns An array of `count` empty objects cast as `T`.
 *
 * @public
 */
export function createMockData<T>(count: number): T[];

/**
 * Generates an array of `count` copies of `template`.
 *
 * @typeParam T - The type of items to generate.
 * @param count - The number of items to generate.
 * @param template - The template object to copy for each item.
 * @returns An array of `count` shallow copies of `template`.
 *
 * @example
 * ```typescript
 * import { createMockData } from "kitchensink/testing";
 *
 * const items = createMockData(3, { id: 0, active: true });
 * console.log(items);
 * // [{ id: 0, active: true }, { id: 0, active: true }, { id: 0, active: true }]
 * ```
 *
 * @public
 */
export function createMockData<T>(count: number, template: T): T[];

/**
 * Implementation of the `createMockData` overloads.
 *
 * @internal
 */
export function createMockData<T>(count: number, template?: T): T[] {
	return Array.from({ length: count }, () => (template !== undefined ? ({ ...(template as object) } as T) : ({} as T)));
}

/**
 * Creates a {@link DataSink} implementation that captures every written
 * record into an in-memory array for inspection in tests.
 *
 * @typeParam T - The type of data accepted by the sink.
 * @returns A `DataSink<T>` augmented with a `captured` array containing
 *   all records written so far.
 *
 * @public
 */
export function createTestSink<T>(): DataSink<T> & { captured: T[] } {
	const captured: T[] = [];

	return {
		name: "TestSink",
		captured,
		async write(data: T): Promise<void> {
			captured.push(data);
		},
		async close(): Promise<void> {
			// no-op
		},
	};
}

/**
 * A composite test fixture that combines a {@link MockSource}, a test sink,
 * and a {@link TestPipeline} into a single convenience object.
 *
 * @remarks
 * Use `TestFixture` when you need to wire up a complete pipeline in a test
 * case without repeating boilerplate. All three members share the same
 * element type `T`, making it straightforward to assert on data flowing
 * from source through pipeline to sink.
 *
 * @typeParam T - The element type flowing through the fixture.
 *
 * @public
 */
export interface TestFixture<T> {
	/** The mock data source supplying input records. */
	source: MockSource<T>;
	/** The capturing sink that collects pipeline outputs. */
	sink: DataSink<T> & { captured: T[] };
	/** The instrumented pipeline that logs every execution. */
	pipeline: TestPipeline<T, T>;
}
