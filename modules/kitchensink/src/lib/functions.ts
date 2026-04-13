import { Codecs } from "./codecs.js";
import type { DataSource } from "./data-source.js";
import { DataFormat } from "./enums.js";
import { CodecError, PipelineError, ValidationError } from "./errors.js";
import type { PipelineOptions, Transform } from "./interfaces.js";
import { Pipeline } from "./pipeline.js";

/**
 * Creates a new {@link Pipeline} connecting a data source to a transform function.
 *
 * @remarks
 * This is the primary factory function for constructing pipelines. It delegates
 * directly to {@link Pipeline.create} and forwards any provided options.
 * Use this when you want a standalone function interface rather than calling
 * the static method directly.
 *
 * {@label CREATE_PIPELINE}
 *
 * @typeParam I - The type of raw input records supplied by `source`.
 * @typeParam O - The type of transformed output records produced by `transform`.
 *
 * @param source - The {@link DataSource} that supplies raw input records.
 * @param transform - The {@link Transform} applied to each input record.
 * @param options - Optional {@link PipelineOptions} controlling batch size, retry
 *   count, and timeout behaviour.
 * @returns A fully configured `Pipeline<I, O>` ready to execute.
 *
 * @throws {@link PipelineError} if the pipeline cannot be created due to invalid
 *   configuration.
 *
 * @example
 * ```typescript
 * import { createPipeline, JsonSource } from "kitchensink";
 *
 * const pipeline = createPipeline(
 * 	new JsonSource("./data/records.json"),
 * 	(record: Record<string, unknown>) => ({ ...record, processed: true }),
 * 	{ batchSize: 50, retryCount: 2 },
 * );
 *
 * const result = await pipeline.execute({ id: 1 });
 * console.log(result); // { id: 1, processed: true }
 * ```
 *
 * @public
 */
export function createPipeline<I, O>(
	source: DataSource<I>,
	transform: Transform<I, O>,
	options?: PipelineOptions,
): Pipeline<I, O> {
	return Pipeline.create(source, transform, options);
}

/**
 * Encodes a value to a `Uint8Array` using the specified {@link DataFormat}.
 *
 * @remarks
 * Supports {@link DataFormat.JSON} and {@link DataFormat.Binary} formats.
 * JSON encoding serialises the value with `JSON.stringify` and then encodes the
 * resulting string as UTF-8 bytes. Binary encoding uses {@link Codecs.binary}
 * directly.
 *
 * @param data - The value to encode. Must be JSON-serialisable for JSON and
 *   Binary formats.
 * @param format - The {@link DataFormat} that controls the encoding strategy.
 * @returns A `Uint8Array` containing the encoded bytes.
 *
 * @throws {@link CodecError} if the format is unsupported or if serialisation
 *   fails (for example, when `data` contains circular references or `BigInt` values).
 *
 * @public
 */
export function encode(data: unknown, format: DataFormat): Uint8Array {
	switch (format) {
		case DataFormat.JSON: {
			const json = Codecs.json(data);
			return new TextEncoder().encode(json);
		}
		case DataFormat.Binary: {
			return Codecs.binary(data);
		}
		default: {
			throw new CodecError(`Unsupported encoding format: ${String(format)}`, "UNSUPPORTED_FORMAT");
		}
	}
}

/**
 * Decodes a `Uint8Array` buffer back to a typed value using the specified
 * {@link DataFormat}.
 *
 * @remarks
 * Only {@link DataFormat.JSON} is currently supported for decoding. The buffer
 * is decoded from UTF-8 bytes and then parsed with `JSON.parse`. The caller is
 * responsible for ensuring the buffer contents match the expected type `T`.
 *
 * @typeParam T - The expected type of the decoded value.
 *
 * @param buffer - The raw bytes to decode.
 * @param format - The {@link DataFormat} that was used to encode the original data.
 * @returns The decoded value cast to type `T`.
 *
 * @throws {@link CodecError} if the format is unsupported or if the buffer
 *   cannot be parsed.
 *
 * @public
 */
export function decode<T>(buffer: Uint8Array, format: DataFormat): T {
	switch (format) {
		case DataFormat.JSON: {
			const text = new TextDecoder().decode(buffer);
			return JSON.parse(text) as T;
		}
		default: {
			throw new CodecError(`Unsupported decoding format: ${String(format)}`, "UNSUPPORTED_FORMAT");
		}
	}
}

/**
 * Validates an unknown value against a schema transform and returns the
 * typed result.
 *
 * @remarks
 * The `schema` parameter is any {@link Transform} from `unknown` to `T`. If the
 * transform throws, the error is caught and re-thrown as a {@link ValidationError}
 * with the original message preserved.
 *
 * This function is useful for integrating third-party validation libraries
 * (such as Zod or Valibot parse functions) into the pipeline without spreading
 * try/catch blocks throughout application code.
 *
 * @typeParam T - The type the validated data is expected to conform to.
 *
 * @param data - The raw unknown value to validate.
 * @param schema - A {@link Transform} that parses and returns a typed `T`, or
 *   throws if the data is invalid.
 * @returns The validated and typed value `T`.
 *
 * @throws {@link ValidationError} if `schema` throws for the provided `data`.
 *
 * @example
 * ```typescript
 * import { validate } from "kitchensink";
 *
 * interface Config {
 * 	host: string;
 * 	port: number;
 * }
 *
 * function parseConfig(data: unknown): Config {
 * 	if (
 * 		typeof data !== "object" ||
 * 		data === null ||
 * 		!("host" in data) ||
 * 		!("port" in data)
 * 	) {
 * 		throw new Error("Invalid config shape");
 * 	}
 * 	return data as Config;
 * }
 *
 * const config = validate({ host: "localhost", port: 8080 }, parseConfig);
 * console.log(config.host); // "localhost"
 * ```
 *
 * @public
 */
export function validate<T>(data: unknown, schema: Transform<unknown, T>): T {
	try {
		return schema(data);
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		throw new ValidationError(`Validation failed: ${message}`, "VALIDATION_ERROR");
	}
}
