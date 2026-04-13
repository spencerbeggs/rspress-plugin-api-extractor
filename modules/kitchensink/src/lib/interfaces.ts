import type { PipelineError } from "./errors.js";

/**
 * A callable interface that transforms a value from one type to another.
 *
 * @remarks
 * Implement this interface to define a single-argument conversion step
 * that can be composed into a pipeline stage.
 *
 * @typeParam In - The input value type.
 * @typeParam Out - The output value type.
 *
 * @public
 */
export interface Transform<In, Out> {
	/**
	 * Transforms `input` into the output type.
	 *
	 * @param input - The value to transform.
	 * @returns The transformed value.
	 */
	// biome-ignore lint/style/useShorthandFunctionType: intentional call-signature interface for API Extractor item-kind coverage
	(input: In): Out;
}

/**
 * A writable destination for pipeline output data.
 *
 * @remarks
 * Implementations are responsible for managing the lifecycle of the
 * underlying resource (file handle, network socket, database connection).
 * Always call {@link DataSink.close} when finished writing.
 *
 * @typeParam T - The type of data accepted by this sink.
 *
 * @public
 */
export interface DataSink<T> {
	/** Unique display name for this sink, used in logs and diagnostics. */
	readonly name: string;

	/**
	 * Writes a single data record to this sink.
	 *
	 * @param data - The record to write.
	 * @returns A promise that resolves when the write is committed.
	 * @throws {@link PipelineError} if the sink is closed or the write fails.
	 */
	write(data: T): Promise<void>;

	/**
	 * Flushes any buffered data and releases the underlying resource.
	 *
	 * @returns A promise that resolves when the sink is fully closed.
	 */
	close(): Promise<void>;
}

/**
 * Configuration options controlling pipeline execution behaviour.
 *
 * @remarks
 * All properties are optional. Omitted values fall back to their documented
 * defaults, which are also exported as {@link DEFAULT_PIPELINE_OPTIONS}.
 *
 * @public
 */
export interface PipelineOptions {
	/**
	 * Maximum number of records to accumulate before flushing to the sink.
	 *
	 * @defaultValue 100
	 */
	batchSize?: number;

	/**
	 * Number of times a failed stage should be retried before the pipeline
	 * transitions to the {@link PipelineStatus.Failed} state.
	 *
	 * @defaultValue 3
	 */
	retryCount?: number;

	/**
	 * Maximum time in milliseconds to wait for a single batch to complete
	 * before treating it as a timeout failure.
	 *
	 * @defaultValue 30000
	 */
	timeout?: number;
}

/**
 * Event callbacks that observe significant moments in a pipeline's lifecycle.
 *
 * @remarks
 * Attach handlers to receive notifications without coupling to the pipeline
 * implementation. All handlers are optional.
 *
 * @typeParam T - The type of data produced by the pipeline.
 *
 * @public
 */
export interface PipelineEvent<T> {
	/**
	 * Fired immediately after the pipeline transitions to the Running state.
	 *
	 * @eventProperty
	 */
	onStart?: () => void;

	/**
	 * Fired when the pipeline finishes successfully with its final result.
	 *
	 * @param result - The aggregated output produced by the pipeline run.
	 * @eventProperty
	 */
	onComplete?: (result: T) => void;

	/**
	 * Fired when an unrecoverable error halts the pipeline.
	 *
	 * @param error - The error that caused the pipeline to stop.
	 * @eventProperty
	 */
	onError?: (error: Error) => void;
}
