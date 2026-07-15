import type { ApiItem } from "@microsoft/api-extractor-model";

/**
 * Source mapping entry linking a generated declaration line to its origin
 */
export interface SourceMapping {
	/** Original source file path relative to package root */
	file: string;
	/** Canonical reference to the API item */
	apiItem: string;
	/** API item kind (Class, Interface, TypeAlias, etc.) */
	kind: string;
	/** Display name of the API item */
	displayName: string;
}

/**
 * Complete source map for a generated declaration file
 */
export interface ApiSourceMap {
	/** Source map format version */
	version: 1;
	/** Package name */
	packageName: string;
	/** Path to the API Extractor model (.api.json) */
	apiModelPath: string;
	/** Map from line number to source mapping */
	declarations: Record<number, SourceMapping>;
}

/**
 * Generates source maps linking generated TypeScript declarations
 * back to their original API Extractor model and source files.
 *
 * This enables:
 * - "Go to Definition" functionality in documentation
 * - Better error messages with source file context
 * - Traceability between generated code and API model
 *
 * @example
 * ```ts
 * const generator = new SourceMapGenerator("my-package", "docs/lib/my-package.api.json");
 *
 * // Track declarations as you generate them
 * generator.addMapping(5, apiItem);
 * generator.addMapping(10, anotherItem);
 *
 * // Generate the source map
 * const sourceMap = generator.generate();
 * ```
 */
export class SourceMapGenerator {
	/** Mappings being built up during generation */
	private readonly mappings = new Map<number, SourceMapping>();

	/** Current line number in the generated file */
	private currentLine = 1;

	constructor(
		private readonly packageName: string,
		private readonly apiModelPath: string,
	) {}

	/**
	 * Get the current line number in the generated file.
	 * Used to track where we are during generation.
	 */
	public getCurrentLine(): number {
		return this.currentLine;
	}

	/**
	 * Advance the line counter by the specified number of lines.
	 * Call this when adding content to the generated file.
	 *
	 * @param count - Number of lines added (default 1)
	 */
	public advanceLines(count: number = 1): void {
		this.currentLine += count;
	}

	/**
	 * Add a source mapping for an API item at the current line.
	 *
	 * @param apiItem - The API item being declared
	 */
	public addMapping(apiItem: ApiItem): void {
		// Extract source file path
		// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic property access
		const fileUrlPath = (apiItem as any).fileUrlPath as string | undefined;
		const file = fileUrlPath || "unknown";

		// Get canonical reference
		const canonicalRef = apiItem.canonicalReference?.toString() || "unknown";

		// Create mapping
		const mapping: SourceMapping = {
			file,
			apiItem: canonicalRef,
			kind: apiItem.kind,
			displayName: apiItem.displayName,
		};

		this.mappings.set(this.currentLine, mapping);
	}

	/**
	 * Generate the complete source map.
	 *
	 * @returns Source map object ready to be serialized to JSON
	 */
	public generate(): ApiSourceMap {
		// Convert Map to plain object for JSON serialization
		const declarations: Record<number, SourceMapping> = {};
		for (const [line, mapping] of this.mappings.entries()) {
			declarations[line] = mapping;
		}

		return {
			version: 1,
			packageName: this.packageName,
			apiModelPath: this.apiModelPath,
			declarations,
		};
	}

	/**
	 * Serialize the source map to JSON string.
	 *
	 * @returns Formatted JSON string
	 */
	public toJSON(): string {
		return JSON.stringify(this.generate(), null, 2);
	}
}
