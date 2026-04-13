import type { DataSource } from "./data-source.js";
import { CodecError } from "./errors.js";

/**
 * A collection of utility functions for encoding and serialising data.
 *
 * @remarks
 * `Codecs` groups related encoding helpers under a single namespace so they
 * can be imported together without polluting the top-level module scope.
 * All functions operate on arbitrary data and produce portable representations
 * suitable for storage or transmission.
 *
 * @public
 */
export namespace Codecs {
	/**
	 * Serialises a value to a JSON string.
	 *
	 * @remarks
	 * Uses `JSON.stringify` internally. The output is a standard JSON string
	 * that can be parsed back with `JSON.parse`.
	 *
	 * @typeParam T - The type of the value to serialise.
	 *
	 * @param data - The value to convert to JSON.
	 * @returns A JSON string representation of `data`.
	 *
	 * @public
	 */
	export function json<T>(data: T): string {
		return JSON.stringify(data);
	}

	/**
	 * Encodes a value to a `Uint8Array` using UTF-8 binary encoding.
	 *
	 * @remarks
	 * The value is first serialised to JSON and then encoded to bytes via
	 * `TextEncoder`. The resulting buffer is suitable for writing to a file,
	 * sending over a network socket, or storing in a binary data store.
	 *
	 * @param data - The value to encode.
	 * @returns A `Uint8Array` containing the UTF-8 encoded JSON bytes.
	 *
	 * @throws {@link CodecError} if the value cannot be serialised to JSON
	 *   (for example, when it contains circular references or `BigInt` values).
	 *
	 * @public
	 */
	export function binary(data: unknown): Uint8Array {
		try {
			return new TextEncoder().encode(JSON.stringify(data));
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : String(cause);
			throw new CodecError(`Failed to encode value to binary: ${message}`, "ENCODE_ERROR");
		}
	}

	/**
	 * Returns an async iterable that streams encoded chunks from a
	 * {@link DataSource}.
	 *
	 * @remarks
	 * Each record fetched from `source` is individually encoded via
	 * {@link Codecs.binary} and yielded as a `Uint8Array` chunk. The source
	 * is connected before streaming begins and disconnected once all records
	 * have been yielded.
	 *
	 * This function is part of the staged streaming API and is not yet
	 * production-ready. The interface may change in a future minor release.
	 *
	 * @alpha
	 *
	 * @typeParam T - The type of records produced by the data source.
	 *
	 * @param source - A {@link DataSource} that supplies the records to encode.
	 * @returns An `AsyncIterable<Uint8Array>` that yields one encoded chunk per
	 *   record fetched from `source`.
	 *
	 * @public
	 */
	export async function* streaming<T>(source: DataSource<T>): AsyncIterable<Uint8Array> {
		await source.connect();
		try {
			const records = await source.fetch();
			for (const record of records) {
				yield binary(record);
			}
		} finally {
			source.disconnect();
		}
	}
}
