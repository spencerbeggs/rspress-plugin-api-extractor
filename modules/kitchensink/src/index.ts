/**
 * A typed data-pipeline library for composing sources, transforms, and sinks.
 *
 * @packageDocumentation
 */

export { BatchProcessor } from "./lib/batch-processor.js";
export { Codecs } from "./lib/codecs.js";
export { DEFAULT_PIPELINE_OPTIONS, VERSION } from "./lib/constants.js";
export { DataSource } from "./lib/data-source.js";
export { DataFormat, PipelineStatus } from "./lib/enums.js";
export { CodecError, DataSourceError, PipelineError, ValidationError } from "./lib/errors.js";
export { Filters } from "./lib/filters.js";
export { createPipeline, decode, encode, validate } from "./lib/functions.js";
export type { DataSink, PipelineEvent, PipelineOptions, Transform } from "./lib/interfaces.js";
export { JsonSource } from "./lib/json-source.js";
export { Pipeline } from "./lib/pipeline.js";
export type { CodecOptions, ErrorHandler, Middleware } from "./lib/types.js";
