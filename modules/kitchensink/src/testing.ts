/**
 * Testing utilities for the kitchensink data pipeline library.
 *
 * @packageDocumentation
 */

export { DataSource } from "./lib/data-source.js";
export { PipelineStatus } from "./lib/enums.js";
export type { DataSink, PipelineOptions, Transform } from "./lib/interfaces.js";
export { Pipeline } from "./lib/pipeline.js";
export type { TestFixture } from "./testing/fixtures.js";
export { createMockData, createTestSink } from "./testing/fixtures.js";
export { MockSource } from "./testing/mock-source.js";
export { TestPipeline } from "./testing/test-pipeline.js";
