import type { PipelineOptions } from "./interfaces.js";
// biome-ignore lint/style/useImportType: Pipeline is used at runtime via this._pipeline.execute() and this._pipeline.batchSize
import { Pipeline } from "./pipeline.js";

/**
 * Processes arrays of items in batches by delegating to an underlying
 * {@link Pipeline} instance.
 *
 * @remarks
 * `BatchProcessor` is a thin orchestration wrapper around `Pipeline` that
 * accepts a pre-configured pipeline and applies it to every element of an
 * input array. It is suitable for workloads where all items share the same
 * transformation logic but need to be submitted together as a logical unit.
 *
 * The class is decorated with `@logged` (see `{@decorator logged}` below),
 * which instruments each method call with entry/exit log lines in production
 * deployments. The decorator is applied at the class level to cover all public
 * methods uniformly.
 *
 * @decorator `logged` — instruments all public methods with structured
 *   entry/exit logging. The `logged` decorator is defined in the application
 *   runtime layer and is not part of this library's public API surface.
 *
 * @typeParam T - The type of items to process. Both the pipeline input and
 *   output are constrained to this same type, making `BatchProcessor` suited
 *   to in-place transformation workflows such as normalisation or enrichment.
 *
 * @see {@link Pipeline} for the underlying single-item execution primitive.
 * @see {@link PipelineOptions} for configuration options accepted by the
 *   constructor.
 *
 * @example
 * ```typescript
 * import { BatchProcessor, Pipeline, JsonSource } from "kitchensink";
 *
 * const pipeline = Pipeline.create(
 * 	new JsonSource("./data/records.json"),
 * 	(record: Record<string, unknown>) => ({ ...record, processed: true }),
 * );
 *
 * const processor = new BatchProcessor(pipeline, { batchSize: 25 });
 * const results = await processor.processBatch([
 * 	{ id: 1, value: "alpha" },
 * 	{ id: 2, value: "beta" },
 * 	{ id: 3, value: "gamma" },
 * ]);
 * console.log(results[0]); // { id: 1, value: "alpha", processed: true }
 * ```
 *
 * @public
 */
export class BatchProcessor<T> {
	/** The pipeline used to transform each individual item. */
	private readonly _pipeline: Pipeline<T, T>;

	/** Configuration options governing batch execution behaviour. */
	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: intentional private field for API Extractor item-kind coverage
	private readonly _options: PipelineOptions;

	/**
	 * Creates a new `BatchProcessor` backed by the given pipeline.
	 *
	 * @param pipeline - A {@link Pipeline} configured to transform items of type
	 *   `T`. The same pipeline instance is reused for every item in every batch,
	 *   so it must be safe to call {@link Pipeline.execute} multiple times.
	 * @param options - {@link PipelineOptions} that influence how batches are
	 *   processed. Currently `batchSize` is forwarded to the pipeline when
	 *   present; other options are reserved for future use.
	 */
	constructor(pipeline: Pipeline<T, T>, options: PipelineOptions) {
		this._pipeline = pipeline;
		this._options = options;

		if (options.batchSize !== undefined) {
			this._pipeline.batchSize = options.batchSize;
		}
	}

	/**
	 * Processes an array of items through the underlying pipeline and returns
	 * the transformed results in the same order.
	 *
	 * @remarks
	 * Each item is submitted to {@link Pipeline.execute} individually. The method
	 * uses `Promise.all` internally, so all items are in-flight concurrently. A
	 * single item failure causes the entire batch to reject with a
	 * `PipelineError`.
	 *
	 * The `batchSize` from {@link PipelineOptions} is applied to the underlying
	 * pipeline but does not chunk the `items` array — all items are always
	 * submitted in one `Promise.all` call.
	 *
	 * @param items - The array of items to process.
	 * @returns A promise that resolves with an array of transformed items in
	 *   input order.
	 *
	 * @throws {@link PipelineError} if any item's transformation fails.
	 *
	 * @example
	 * ```typescript
	 * import { BatchProcessor, Pipeline, JsonSource } from "kitchensink";
	 *
	 * const pipeline = Pipeline.create(
	 * 	new JsonSource("./data/numbers.json"),
	 * 	(n: number) => n * 10,
	 * );
	 *
	 * const processor = new BatchProcessor(pipeline, { batchSize: 10 });
	 * const results = await processor.processBatch([1, 2, 3]);
	 * console.log(results); // [10, 20, 30]
	 * ```
	 */
	async processBatch(items: T[]): Promise<T[]> {
		return Promise.all(items.map((item) => this._pipeline.execute(item)));
	}
}
