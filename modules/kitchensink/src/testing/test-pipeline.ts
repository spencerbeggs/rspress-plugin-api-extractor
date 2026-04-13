import { Pipeline } from "../lib/pipeline.js";

/**
 * A test-instrumented subclass of {@link Pipeline} that records every
 * input/output pair produced by {@link TestPipeline.execute}.
 *
 * @remarks
 * `TestPipeline` extends `Pipeline` to provide observability into pipeline
 * execution without modifying production code. Each successful call to
 * {@link TestPipeline.execute} appends an entry to {@link TestPipeline.executionLog},
 * making it straightforward to assert on the exact sequence of inputs and
 * outputs in test suites.
 *
 * The log is never cleared automatically — reset it between test cases by
 * replacing the pipeline instance or by splicing the array directly.
 *
 * @typeParam In - The type of raw input data accepted by the pipeline.
 * @typeParam Out - The type of transformed output data produced by the pipeline.
 *
 * @example
 * ```typescript
 * import { Pipeline } from "kitchensink";
 * import { MockSource, TestPipeline } from "kitchensink/testing";
 *
 * const source = new MockSource("numbers", [1, 2, 3]);
 * const pipeline = new TestPipeline(source, (n: number) => n * 2);
 *
 * await pipeline.execute(4);
 * await pipeline.execute(5);
 *
 * console.log(pipeline.executionLog);
 * // [{ input: 4, output: 8 }, { input: 5, output: 10 }]
 * ```
 *
 * @public
 */
export class TestPipeline<In, Out> extends Pipeline<In, Out> {
	/**
	 * An ordered log of every input/output pair processed by this pipeline
	 * instance. Each entry is appended after a successful call to
	 * {@link TestPipeline.execute}.
	 *
	 * @readonly
	 */
	readonly executionLog: Array<{ input: In; output: Out }> = [];

	/**
	 * Executes the pipeline transform for a single input record and appends the
	 * result to {@link TestPipeline.executionLog}.
	 *
	 * @override
	 * @param input - The input record to process.
	 * @returns A promise that resolves with the transformed output.
	 */
	override async execute(input: In): Promise<Out> {
		const output = await super.execute(input);
		this.executionLog.push({ input, output });
		return output;
	}
}
