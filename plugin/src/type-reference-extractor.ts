import type { ApiEntryPoint, ApiItem, ApiPackage, Excerpt } from "@microsoft/api-extractor-model";
import { ApiItemKind } from "@microsoft/api-extractor-model";

/**
 * Represents a type reference extracted from an API item.
 * Contains information about where the type comes from and how to import it.
 */
export interface TypeReference {
	/**
	 * The symbol name to import (e.g., "ZodType", "Effect")
	 */
	symbolName: string;

	/**
	 * The package name (e.g., "zod", "@effect/schema")
	 * Empty string for built-in TypeScript types
	 */
	packageName: string;

	/**
	 * The canonical reference from API Extractor
	 * Format: "packageName!symbolName:kind"
	 */
	canonicalReference: string;

	/**
	 * Whether this is a built-in TypeScript type (Promise, Record, etc.)
	 */
	isBuiltIn: boolean;

	/**
	 * Whether this reference is from the current package being documented
	 */
	isInternal: boolean;
}

/**
 * Import statement to be generated for a package
 */
export interface ImportStatement {
	/**
	 * Package name to import from
	 */
	packageName: string;

	/**
	 * Named imports from this package
	 */
	symbols: Set<string>;

	/**
	 * Whether to use type-only import
	 */
	typeOnly: boolean;
}

/**
 * Extracts type references from API Extractor models to generate import statements.
 *
 * This class analyzes API items and their excerpt tokens to identify external type
 * references that need to be imported in the generated TypeScript declaration files.
 *
 * **How it works:**
 * 1. Walks through all API items (classes, interfaces, functions, etc.)
 * 2. Extracts type references from excerpt tokens
 * 3. Filters out built-in types and internal references
 * 4. Groups external references by package
 * 5. Generates `import type` statements
 *
 * **Reference Types:**
 * - **Built-in:** TypeScript types like `Promise`, `Record`, `NonNullable` (skipped)
 * - **Internal:** References to types in the same package (skipped)
 * - **External:** References to types from npm packages (imported)
 *
 * **Canonical Reference Format:**
 * API Extractor uses canonical references like:
 * - `"zod!ZodType:interface"` → External reference to `zod` package
 * - `"mypackage!MyType:type"` → Internal reference (same package)
 * - `"!Promise:interface"` → Built-in TypeScript type
 * - `"!\"node:buffer\".__global.Buffer:interface"` → Node.js built-in (treated as built-in)
 *
 * @example
 * ```ts
 * const extractor = new TypeReferenceExtractor(apiPackage, "my-package");
 * const imports = extractor.extractImports();
 *
 * for (const stmt of imports) {
 *   console.log(`import type { ${[...stmt.symbols].join(", ")} } from "${stmt.packageName}";`);
 * }
 * // Output:
 * // import type { ZodType } from "zod";
 * // import type { Effect } from "@effect/schema";
 * ```
 */
export class TypeReferenceExtractor {
	/**
	 * All type references found in the API package
	 */
	private readonly references = new Map<string, TypeReference>();

	constructor(
		private readonly apiPackage: ApiPackage,
		private readonly currentPackageName: string,
	) {}

	/**
	 * Extract all type references from the API package and generate import statements.
	 * Returns an array of import statements grouped by package.
	 */
	public extractImports(): ImportStatement[] {
		// Walk through all API items and extract references
		this.walkApiPackage();

		return this.generateImportStatements();
	}

	/**
	 * Extract type references for a specific entry point only.
	 * This enables per-entry-point import optimization for multi-entry packages.
	 *
	 * @param entryPoint - The specific entry point to extract imports for
	 * @returns Import statements containing only types used in this entry point
	 */
	public extractImportsForEntryPoint(entryPoint: ApiEntryPoint): ImportStatement[] {
		// Clear any previous references
		this.references.clear();

		// Walk only the specified entry point
		for (const member of entryPoint.members) {
			this.walkApiItem(member);
		}

		return this.generateImportStatements();
	}

	/**
	 * Extract type references for a single API item.
	 * This enables generating imports for individual signatures.
	 *
	 * @param apiItem - The specific API item to extract imports for
	 * @returns Import statements containing only types used in this item
	 */
	public extractImportsForApiItem(apiItem: ApiItem): ImportStatement[] {
		// Clear any previous references
		this.references.clear();

		// Walk only the specified item
		this.walkApiItem(apiItem);

		return this.generateImportStatements();
	}

	/**
	 * Generate import statements from collected references.
	 * Used by both extractImports() and extractImportsForEntryPoint().
	 */
	private generateImportStatements(): ImportStatement[] {
		// Group references by package
		const packageMap = new Map<string, Set<string>>();

		for (const ref of this.references.values()) {
			// Skip built-in types and internal references
			if (ref.isBuiltIn || ref.isInternal) {
				continue;
			}

			// Add to package map
			if (!packageMap.has(ref.packageName)) {
				packageMap.set(ref.packageName, new Set());
			}
			packageMap.get(ref.packageName)?.add(ref.symbolName);
		}

		// Convert to import statements
		const imports: ImportStatement[] = [];
		for (const [packageName, symbols] of packageMap.entries()) {
			imports.push({
				packageName,
				symbols,
				typeOnly: true, // Always use type-only imports for declaration files
			});
		}

		// Sort imports alphabetically by package name
		imports.sort((a, b) => a.packageName.localeCompare(b.packageName));

		return imports;
	}

	/**
	 * Generate import statement strings from ImportStatement objects.
	 * Returns an array of formatted import statements.
	 */
	public static formatImports(imports: ImportStatement[]): string[] {
		const statements: string[] = [];

		for (const stmt of imports) {
			// Sort symbols alphabetically
			const sortedSymbols = Array.from(stmt.symbols).sort();

			// Format as import statement
			const importKeyword = stmt.typeOnly ? "import type" : "import";
			const symbols = sortedSymbols.join(", ");
			const statement = `${importKeyword} { ${symbols} } from "${stmt.packageName}";`;

			statements.push(statement);
		}

		return statements;
	}

	/**
	 * Walk through the entire API package and extract all type references
	 */
	private walkApiPackage(): void {
		// Process all entry points
		for (const entryPoint of this.apiPackage.entryPoints) {
			// Process all members in the entry point
			for (const member of entryPoint.members) {
				this.walkApiItem(member);
			}
		}
	}

	/**
	 * Recursively walk through an API item and its children to extract type references
	 */
	private walkApiItem(apiItem: ApiItem): void {
		// Extract references from this item's excerpt
		this.extractFromExcerpt(apiItem);

		// Process child members for containers (classes, interfaces, etc.)
		if ("members" in apiItem) {
			// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic property access
			const members = (apiItem as any).members as ApiItem[];
			if (Array.isArray(members)) {
				for (const member of members) {
					this.walkApiItem(member);
				}
			}
		}
	}

	/**
	 * Extract type references from an API item using its excerpt
	 */
	private extractFromExcerpt(apiItem: ApiItem): void {
		// Get the excerpt based on API item kind
		const excerpt = this.getExcerpt(apiItem);
		if (!excerpt) {
			return;
		}

		// Extract references from excerpt tokens
		this.extractFromExcerptTokens(excerpt);
	}

	/**
	 * Get the appropriate excerpt from an API item based on its kind
	 */
	private getExcerpt(apiItem: ApiItem): Excerpt | null {
		// Most API items have an 'excerpt' property
		// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic property access
		const item = apiItem as any;

		// Primary excerpt for most items
		if (item.excerpt) {
			return item.excerpt as Excerpt;
		}

		// Type aliases have typeExcerpt
		if (apiItem.kind === ApiItemKind.TypeAlias && item.typeExcerpt) {
			return item.typeExcerpt as Excerpt;
		}

		// Property types
		if (
			(apiItem.kind === ApiItemKind.Property || apiItem.kind === ApiItemKind.PropertySignature) &&
			item.propertyTypeExcerpt
		) {
			return item.propertyTypeExcerpt as Excerpt;
		}

		// Return types for functions and methods
		if (item.returnTypeExcerpt) {
			return item.returnTypeExcerpt as Excerpt;
		}

		return null;
	}

	/**
	 * Extract type references from excerpt tokens
	 */
	private extractFromExcerptTokens(excerpt: Excerpt): void {
		if (!excerpt.spannedTokens || excerpt.spannedTokens.length === 0) {
			return;
		}

		for (const token of excerpt.spannedTokens) {
			// Only process Reference tokens
			if (token.kind !== "Reference") {
				continue;
			}

			// Extract canonical reference
			// biome-ignore lint/suspicious/noExplicitAny: ExcerptToken types require dynamic property access
			const tokenAny = token as any;
			const canonicalRef = tokenAny.canonicalReference?.toString();

			if (!canonicalRef || typeof canonicalRef !== "string") {
				continue;
			}

			// Parse the canonical reference to extract package and symbol name
			const ref = this.parseCanonicalReference(canonicalRef, token.text);

			// Store the reference (deduplicated by canonical reference)
			if (ref) {
				this.references.set(ref.canonicalReference, ref);
			}
		}
	}

	/**
	 * Parse a canonical reference string to extract type reference information.
	 *
	 * Canonical reference format: "packageName!symbolName:kind"
	 * Examples:
	 * - "zod!ZodType:interface" → External reference
	 * - "mypackage!MyType:type" → Internal reference
	 * - "!Promise:interface" → Built-in type
	 * - "!\"node:buffer\".__global.Buffer:interface" → Node.js built-in
	 */
	private parseCanonicalReference(canonicalRef: string, symbolText: string): TypeReference | null {
		// Split by "!" to separate package name from symbol
		const exclamationIndex = canonicalRef.indexOf("!");
		if (exclamationIndex === -1) {
			return null;
		}

		const packagePart = canonicalRef.substring(0, exclamationIndex);
		const rest = canonicalRef.substring(exclamationIndex + 1);

		// Split by ":" to separate symbol from kind
		const colonIndex = rest.indexOf(":");
		const symbolFromCanonical = colonIndex !== -1 ? rest.substring(0, colonIndex) : rest;

		// Determine if this is a built-in type
		const isBuiltIn = packagePart === "" || packagePart.startsWith('"');

		// Determine if this is an internal reference (same package)
		const isInternal = packagePart === this.currentPackageName;

		// Clean up the symbol name:
		// 1. For namespaced references (e.g., "z.ZodType"), extract just the type name
		// 2. For direct references, use the canonical symbol name
		let symbolName: string;
		if (symbolText.includes(".")) {
			// Extract the part after the last dot (e.g., "z.ZodType" → "ZodType")
			const parts = symbolText.split(".");
			symbolName = parts[parts.length - 1].trim();
		} else {
			// Use the canonical symbol name (cleaner than token text)
			symbolName = symbolFromCanonical.trim();
		}

		return {
			symbolName,
			packageName: packagePart,
			canonicalReference: canonicalRef,
			isBuiltIn,
			isInternal,
		};
	}
}
