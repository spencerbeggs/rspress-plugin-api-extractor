/**
 * Base error class for all pipeline-related errors.
 *
 * @remarks
 * Thrown during pipeline lifecycle events such as start, run, pause, and stop.
 * Subclass this for more specific pipeline failure scenarios.
 *
 * @public
 */
export class PipelineError extends Error {
	/** Machine-readable error code identifying the failure type. */
	readonly code: string;

	constructor(message: string, code: string) {
		super(message);
		this.name = "PipelineError";
		this.code = code;
	}
}

/**
 * Error thrown when a data source encounters a read or connection failure.
 *
 * @remarks
 * Raised by {@link DataSource} implementations when the underlying data
 * cannot be accessed or parsed.
 *
 * @see DataSource
 *
 * @public
 */
export class DataSourceError extends Error {
	/** Machine-readable error code identifying the failure type. */
	readonly code: string;

	constructor(message: string, code: string) {
		super(message);
		this.name = "DataSourceError";
		this.code = code;
	}
}

/**
 * Error thrown when encoding or decoding data fails.
 *
 * @public
 */
export class CodecError extends Error {
	/** Machine-readable error code identifying the failure type. */
	readonly code: string;

	constructor(message: string, code: string) {
		super(message);
		this.name = "CodecError";
		this.code = code;
	}
}

/**
 * Error thrown when input data fails schema or constraint validation.
 *
 * @public
 */
export class ValidationError extends Error {
	/** Machine-readable error code identifying the failure type. */
	readonly code: string;

	constructor(message: string, code: string) {
		super(message);
		this.name = "ValidationError";
		this.code = code;
	}
}
