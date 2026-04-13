import type { DataSource } from "./data-source.js";
import { PipelineStatus } from "./enums.js";
import { PipelineError } from "./errors.js";
import type { PipelineOptions, Transform } from "./interfaces.js";

/**
 * A strongly-typed data pipeline that connects a {@link DataSource} to a
 * {@link Transform} and manages execution lifecycle.
 *
 * @remarks
 * `Pipeline` is the primary orchestration primitive in the kitchensink library.
 * It models the flow of data from a source through a single synchronous
 * transformation step. Use the static {@link Pipeline.create} factory instead
 * of the constructor directly to benefit from type inference on the generic
 * parameters.
 *
 * For processing arrays of inputs concurrently, see the experimental
 * {@link Pipeline.parallel} method. For deprecated batch-style access, see
 * {@link Pipeline.process}.
 *
 * @privateRemarks
 * Internally the pipeline maintains an in-memory queue that accumulates records
 * between calls to {@link Pipeline.execute}. The queue is bounded by `_batchSize`
 * and is flushed automatically when full. This detail is intentionally hidden
 * from the public API — consumers should treat each `execute` call as atomic.
 * Future iterations may expose the queue via an async iterator.
 *
 * @typeParam In - The type of raw input data accepted by the pipeline.
 * @typeParam Out - The type of transformed output data produced by the pipeline.
 *
 * @see {@link DataSource} for implementing a custom data source.
 * @see {@link Transform} for the transformation function interface.
 * @see {@link PipelineOptions} for available configuration options.
 *
 * @example
 * ```typescript
 * import { Pipeline, JsonSource, PipelineStatus } from "kitchensink";
 *
 * const source = new JsonSource("./data/records.json");
 * const pipeline = Pipeline.create(source, (record) => ({
 * 	...record,
 * 	processed: true,
 * }));
 *
 * const result = await pipeline.execute({ id: 1, name: "example" });
 * console.log(pipeline.status); // PipelineStatus.Completed
 * console.log(result); // { id: 1, name: "example", processed: true }
 * ```
 *
 * @example
 * ```typescript
 * import { Pipeline, JsonSource } from "kitchensink";
 *
 * // Configure batch size via options
 * const source = new JsonSource("./data/items.json");
 * const pipeline = Pipeline.create(
 * 	source,
 * 	(item) => String(item),
 * 	{ batchSize: 50, retryCount: 2, timeout: 5000 },
 * );
 *
 * pipeline.batchSize = 25;
 * console.log(pipeline.batchSize); // 25
 * ```
 *
 * @public
 */
export class Pipeline<In, Out> {
	/** Current execution state of the pipeline. */
	private _status: PipelineStatus;

	/** Maximum number of records per batch flush. */
	private _batchSize: number;

	/** The data source supplying raw input records. */
	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: intentional private field for API Extractor item-kind coverage
	private readonly _source: DataSource<In>;

	/** The transformation applied to each input record. */
	private readonly _transform: Transform<In, Out>;

	/**
	 * Creates a new `Pipeline` with the given source, transform, and options.
	 *
	 * @remarks
	 * Prefer {@link Pipeline.create} over this constructor for better generic
	 * type inference. The constructor is intentionally `public` to allow
	 * subclassing and dependency injection in tests.
	 *
	 * @param source - The {@link DataSource} that supplies input records.
	 * @param transform - The {@link Transform} applied to each input record.
	 * @param options - Optional {@link PipelineOptions} to configure batch size,
	 *   retry behaviour, and timeout.
	 */
	constructor(source: DataSource<In>, transform: Transform<In, Out>, options?: PipelineOptions) {
		this._source = source;
		this._transform = transform;
		this._status = PipelineStatus.Idle;
		this._batchSize = options?.batchSize ?? 100;
	}

	/**
	 * Creates a new `Pipeline` from a source and transform with full type
	 * inference on the generic parameters.
	 *
	 * @remarks
	 * This static factory is the recommended way to construct a pipeline because
	 * TypeScript can infer `I` and `O` from the arguments, avoiding explicit
	 * type annotations at the call site.
	 *
	 * @typeParam I - The input record type inferred from `source`.
	 * @typeParam O - The output record type inferred from `transform`.
	 *
	 * @param source - A {@link DataSource} instance that supplies raw records.
	 * @param transform - A {@link Transform} function that converts each `I` to `O`.
	 * @param options - Optional {@link PipelineOptions} for pipeline configuration.
	 * @returns A fully configured `Pipeline<I, O>` ready to execute.
	 *
	 * @example
	 * ```typescript
	 * import { Pipeline, JsonSource } from "kitchensink";
	 *
	 * const pipeline = Pipeline.create(
	 * 	new JsonSource("./data/records.json"),
	 * 	(record) => JSON.stringify(record),
	 * );
	 * ```
	 */
	static create<I, O>(source: DataSource<I>, transform: Transform<I, O>, options?: PipelineOptions): Pipeline<I, O> {
		return new Pipeline(source, transform, options);
	}

	/**
	 * The current execution state of this pipeline.
	 *
	 * @remarks
	 * Reflects the last state transition triggered by {@link Pipeline.execute} or
	 * {@link Pipeline.parallel}. Starts as {@link PipelineStatus.Idle} and
	 * advances through Running → Completed (or Failed on error).
	 *
	 * @readonly
	 */
	get status(): PipelineStatus {
		return this._status;
	}

	/**
	 * The maximum number of records accumulated before a batch is flushed.
	 *
	 * @remarks
	 * Defaults to `100` unless overridden via {@link PipelineOptions.batchSize}
	 * at construction time. Setting this value affects subsequent execute calls
	 * but does not flush any in-progress batch.
	 */
	get batchSize(): number {
		return this._batchSize;
	}

	/**
	 * Sets the maximum number of records per batch.
	 *
	 * @param value - A positive integer. Values less than `1` are clamped to `1`.
	 */
	set batchSize(value: number) {
		this._batchSize = Math.max(1, value);
	}

	/**
	 * Synchronously applies the pipeline transform to a single input and returns
	 * the output.
	 *
	 * @remarks
	 * This method bypasses the async execution lifecycle — it does not update
	 * {@link Pipeline.status} and does not throw {@link PipelineError} on failure.
	 * Migrate call sites to {@link Pipeline.execute} which provides proper
	 * lifecycle management and error handling.
	 *
	 * @deprecated Use {@link Pipeline.execute} instead. This method will be
	 *   removed in a future major version.
	 *
	 * @param input - The input record to transform.
	 * @returns The transformed output record.
	 */
	process(input: In): Out {
		return this._transform(input);
	}

	/**
	 * Asynchronously executes the pipeline transform for a single input record,
	 * managing the full execution lifecycle.
	 *
	 * @remarks
	 * Transitions the pipeline through:
	 * 1. {@link PipelineStatus.Running} — immediately on invocation.
	 * 2. {@link PipelineStatus.Completed} — after the transform succeeds.
	 * 3. {@link PipelineStatus.Failed} — if the transform throws.
	 *
	 * Concurrent calls to `execute` are supported but each call manages its own
	 * status transition independently.
	 *
	 * @param input - The input record to process.
	 * @returns A promise that resolves with the transformed output.
	 *
	 * @throws {@link PipelineError} if the transform function throws or if the
	 *   pipeline is in a terminal {@link PipelineStatus.Failed} state.
	 *
	 * @example
	 * ```typescript
	 * import { Pipeline, JsonSource, PipelineError } from "kitchensink";
	 *
	 * const pipeline = Pipeline.create(
	 * 	new JsonSource("./data.json"),
	 * 	(record) => ({ ...record, transformed: true }),
	 * );
	 *
	 * try {
	 * 	const result = await pipeline.execute({ id: 42 });
	 * 	console.log(result); // { id: 42, transformed: true }
	 * } catch (err) {
	 * 	if (err instanceof PipelineError) {
	 * 		console.error("Pipeline failed:", err.code, err.message);
	 * 	}
	 * }
	 * ```
	 */
	async execute(input: In): Promise<Out> {
		this._status = PipelineStatus.Running;
		try {
			const result = this._transform(input);
			this._status = PipelineStatus.Completed;
			return result;
		} catch (cause) {
			this._status = PipelineStatus.Failed;
			const message = cause instanceof Error ? cause.message : String(cause);
			throw new PipelineError(`Pipeline execution failed: ${message}`, "EXECUTE_ERROR");
		}
	}

	/**
	 * Executes the pipeline transform over an array of inputs concurrently,
	 * returning a promise that resolves with all outputs in input order.
	 *
	 * @remarks
	 * Each input is processed via an independent call to {@link Pipeline.execute},
	 * so individual failures throw {@link PipelineError} and short-circuit the
	 * entire batch via `Promise.all` semantics. For fault-tolerant parallel
	 * processing, use `Promise.allSettled` on individual `execute` calls instead.
	 *
	 * @experimental This API is not yet stable and may change in a future minor
	 *   release without a major version bump.
	 *
	 * @param inputs - An array of input records to process in parallel.
	 * @returns A promise that resolves with an array of transformed outputs in the
	 *   same order as `inputs`.
	 *
	 * @throws {@link PipelineError} if any individual execution fails.
	 *
	 * @example
	 * ```typescript
	 * import { Pipeline, JsonSource } from "kitchensink";
	 *
	 * const pipeline = Pipeline.create(
	 * 	new JsonSource("./data.json"),
	 * 	(n: number) => n * 2,
	 * );
	 *
	 * const results = await pipeline.parallel([1, 2, 3, 4, 5]);
	 * console.log(results); // [2, 4, 6, 8, 10]
	 * ```
	 */
	async parallel(inputs: In[]): Promise<Out[]> {
		return Promise.all(inputs.map((input) => this.execute(input)));
	}
}
