import type { PipelineOptions } from "./interfaces.js";

/**
 * Current public API version of the kitchensink package.
 *
 * @remarks
 * Follows semantic versioning. Bump this value whenever a new release is
 * cut and the public API surface changes.
 *
 * @public
 */
export const VERSION: string = "1.0.0";

/**
 * Ready-to-use default values for all {@link PipelineOptions} properties.
 *
 * @remarks
 * Spread this object into user-supplied options to fill in any omitted fields:
 *
 * ```typescript
 * import { DEFAULT_PIPELINE_OPTIONS } from "kitchensink";
 *
 * const opts: PipelineOptions = { ...DEFAULT_PIPELINE_OPTIONS, batchSize: 50 };
 * ```
 *
 * @see PipelineOptions
 *
 * @public
 */
export const DEFAULT_PIPELINE_OPTIONS: Required<PipelineOptions> = {
	batchSize: 100,
	retryCount: 3,
	timeout: 30_000,
};
