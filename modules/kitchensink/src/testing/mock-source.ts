import { DataSource } from "../lib/data-source.js";

/**
 * {@inheritDoc DataSource}
 *
 * @typeParam T - The type of records held by this mock source.
 *
 * @example
 * ```typescript
 * import { MockSource } from "kitchensink/testing";
 *
 * const source = new MockSource("users", [
 * 	{ id: 1, name: "Alice" },
 * 	{ id: 2, name: "Bob" },
 * ]);
 *
 * await source.connect();
 * const records = await source.fetch();
 * console.log(records); // [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]
 * source.disconnect();
 * ```
 *
 * @public
 */
export class MockSource<T> extends DataSource<T> {
	/**
	 * Human-readable identifier for this mock source, used in logs and
	 * error messages.
	 *
	 * @readonly
	 */
	readonly name: string;

	/** The fixed data array returned by {@link MockSource.fetch}. */
	private readonly _data: T[];

	/**
	 * Creates a new `MockSource` with the given name and data.
	 *
	 * @param name - A human-readable identifier for this source.
	 * @param data - The records that {@link MockSource.fetch} will return.
	 */
	constructor(name: string, data: T[]) {
		super();
		this.name = name;
		this._data = data;
	}

	/**
	 * No-op connection — `MockSource` holds its data in memory and requires
	 * no external resource setup.
	 *
	 * @override
	 * @returns A promise that resolves immediately.
	 */
	override async connect(): Promise<void> {
		// no-op — data is already in memory
	}

	/**
	 * Returns the fixed data array supplied at construction time.
	 *
	 * @override
	 * @returns A promise that resolves with a shallow copy of the stored records.
	 */
	override async fetch(): Promise<T[]> {
		return [...this._data];
	}
}
