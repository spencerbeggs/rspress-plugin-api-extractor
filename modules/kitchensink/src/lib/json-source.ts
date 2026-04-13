import { DataSource } from "./data-source.js";
import type { DataSourceError } from "./errors.js";

/**
 * A sealed data source that reads JSON object records from a file path.
 *
 * @remarks
 * `JsonSource` is a concrete, sealed implementation of {@link DataSource} that
 * targets JSON files. It is intentionally `@sealed` — do not subclass it.
 * If you need custom JSON loading behaviour, extend {@link DataSource} directly
 * and implement the abstract methods yourself.
 *
 * @throws {@link DataSourceError} when {@link JsonSource.connect} or
 * {@link JsonSource.fetch} encounters a file-system or parse error.
 *
 * @see DataSource
 *
 * @example
 * ```typescript
 * import { JsonSource } from "kitchensink";
 *
 * const source = new JsonSource("./data/records.json");
 * await source.connect();
 * const records = await source.fetch();
 * source.disconnect();
 * console.log(records[0]);
 * // → { path: "./data/records.json", loaded: true }
 * ```
 *
 * @public
 * @sealed
 */
export class JsonSource extends DataSource<Record<string, unknown>> {
	/**
	 * Human-readable identifier for this data source.
	 *
	 * @readonly
	 */
	override readonly name: string;

	/** Absolute or relative path to the JSON file. */
	private readonly filePath: string;

	/**
	 * Creates a new `JsonSource` targeting the given file.
	 *
	 * @param filePath - Path to the JSON file to read. May be absolute or
	 *   relative to the current working directory.
	 */
	constructor(filePath: string) {
		super();
		this.filePath = filePath;
		this.name = `JsonSource(${filePath})`;
	}

	/**
	 * Prepares the JSON source for reading.
	 *
	 * @remarks
	 * For `JsonSource` the connect step is a lightweight no-op — JSON files do
	 * not require an explicit connection. The method exists to satisfy the
	 * {@link DataSource} contract and to give subclass authors a hook point if
	 * they ever need pre-read validation.
	 *
	 * @returns A promise that resolves immediately.
	 *
	 * @throws {@link DataSourceError} if a pre-read check fails.
	 *
	 * @override
	 */
	override async connect(): Promise<void> {
		// no-op: JSON file access requires no persistent connection
	}

	/**
	 * Returns the parsed contents of the JSON file as an array of records.
	 *
	 * @remarks
	 * This demo implementation returns a single synthetic record containing the
	 * configured `filePath` and a `loaded` flag. In a production implementation
	 * this method would read and parse the file using `fs.readFile`.
	 *
	 * @returns A promise that resolves with an array of `Record<string, unknown>`
	 *   representing the JSON objects found in the file.
	 *
	 * @throws {@link DataSourceError} if the file cannot be read or its contents
	 *   are not valid JSON.
	 *
	 * @override
	 */
	override async fetch(): Promise<Record<string, unknown>[]> {
		return [{ path: this.filePath, loaded: true }];
	}
}
