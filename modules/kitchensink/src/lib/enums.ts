/**
 * Represents the current execution state of a data pipeline.
 *
 * @remarks
 * Used throughout the pipeline lifecycle to track progress and control flow.
 * Transitions follow: Idle → Running → Paused/Completed/Failed.
 *
 * @example
 * ```typescript
 * import { PipelineStatus } from "kitchensink";
 *
 * function isPipelineActive(status: PipelineStatus): boolean {
 * 	return status === PipelineStatus.Running || status === PipelineStatus.Paused;
 * }
 * ```
 *
 * @public
 */
export enum PipelineStatus {
	/** Pipeline is idle and ready to start. */
	Idle = "idle",

	/** Pipeline is actively processing data. */
	Running = "running",

	/** Pipeline has been temporarily suspended. */
	Paused = "paused",

	/** Pipeline finished successfully. */
	Completed = "completed",

	/** Pipeline terminated due to an error. */
	Failed = "failed",
}

/**
 * Serialization formats supported by the codec system.
 *
 * @remarks
 * Used when configuring a codec for data encoding and decoding.
 *
 * @see {@link Codecs} for codec implementations for each format.
 *
 * @example
 * ```typescript
 * import { DataFormat } from "kitchensink";
 *
 * const format: DataFormat = DataFormat.JSON;
 * ```
 *
 * @public
 */
export enum DataFormat {
	/** JSON text encoding. */
	JSON = "json",

	/**
	 * Comma-separated values encoding.
	 *
	 * @deprecated Use {@link DataFormat.JSON} or {@link DataFormat.MessagePack} instead.
	 * @see {@link Codecs.streaming} for the recommended streaming alternative.
	 */
	CSV = "csv",

	/** Raw binary encoding. */
	Binary = "binary",

	/** MessagePack binary encoding. */
	MessagePack = "msgpack",
}
