import type { DataSourceError } from "./errors.js";

/**
 * Abstract base class for all data sources in a pipeline.
 *
 * @remarks
 * Extend `DataSource` to implement a concrete data source. Subclasses must
 * override the abstract {@link DataSource.connect} and {@link DataSource.fetch}
 * methods. The {@link DataSource.disconnect} method provides a no-op default
 * that subclasses may override as needed.
 *
 * @typeParam T - The type of records produced by this data source.
 *
 * @throws {@link DataSourceError} if the underlying resource cannot be accessed.
 *
 * @see Pipeline
 *
 * @example
 * ```typescript
 * import { DataSource } from "kitchensink";
 *
 * class NumberSource extends DataSource<number> {
 * 	readonly name = "NumberSource";
 *
 * 	async connect(): Promise<void> {
 * 		// establish connection
 * 	}
 *
 * 	async fetch(): Promise<number[]> {
 * 		return [1, 2, 3];
 * 	}
 * }
 *
 * const src = new NumberSource();
 * await src.connect();
 * const records = await src.fetch();
 * src.disconnect();
 * ```
 *
 * @public
 */
export abstract class DataSource<T> {
	/**
	 * Default timeout in milliseconds applied when no explicit timeout is
	 * configured on a data source.
	 *
	 * @readonly
	 */
	static readonly DEFAULT_TIMEOUT = 30_000;

	/**
	 * Human-readable identifier for this data source, used in logs and
	 * error messages.
	 *
	 * @readonly
	 */
	abstract readonly name: string;

	/**
	 * Opens a connection to the underlying data resource.
	 *
	 * @remarks
	 * Implementations should perform all necessary initialisation here so that
	 * subsequent calls to {@link DataSource.fetch} succeed without additional
	 * setup.
	 *
	 * @returns A promise that resolves when the connection is ready.
	 *
	 * @throws {@link DataSourceError} if the connection cannot be established.
	 *
	 * @virtual
	 */
	abstract connect(): Promise<void>;

	/**
	 * Retrieves all available records from the data source.
	 *
	 * @remarks
	 * Called after a successful {@link DataSource.connect}. Implementations
	 * should return a complete snapshot of the available data at the time of the
	 * call. For large datasets consider batching inside the implementation.
	 *
	 * @returns A promise that resolves with an array of records of type `T`.
	 *
	 * @throws {@link DataSourceError} if the data cannot be read or parsed.
	 *
	 * @virtual
	 */
	abstract fetch(): Promise<T[]>;

	/**
	 * Releases any resources held by this data source.
	 *
	 * @remarks
	 * The default implementation is a no-op. Override this method to close file
	 * handles, database connections, or network sockets when the source is no
	 * longer needed.
	 */
	disconnect(): void {
		// no-op — subclasses may override to release resources
	}
}
