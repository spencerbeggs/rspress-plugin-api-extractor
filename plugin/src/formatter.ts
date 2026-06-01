import type { Excerpt } from "@microsoft/api-extractor-model";
import { TypeSignatureFormatter as LibTypeSignatureFormatter } from "api-extractor-llms";

/**
 * Formats TypeScript type signatures for display in documentation.
 *
 * Transforms raw API Extractor excerpt text into clean, readable signatures.
 * The core {@link TypeSignatureFormatter.format | format} algorithm is
 * inherited from the `api-extractor-llms` `TypeSignatureFormatter`; this
 * subclass adds the positional constructor and the test-only
 * {@link TypeSignatureFormatter.addLinks | addLinks} cross-link injection.
 *
 * **Relationships:**
 * - Used by all page generators ({@link ClassPageGenerator}, etc.)
 * - Works with API Extractor's `Excerpt` model
 * - Can integrate with {@link MarkdownCrossLinker} for type linking
 *
 * @example
 * ```ts
 * const formatter = new TypeSignatureFormatter();
 *
 * // Format a simple signature
 * const signature = formatter.format(apiFunction.excerpt);
 * // "function myFunc(arg: string): Promise<void>"
 *
 * // With cross-linking
 * const linked = formatter.addLinks(signature, excerpt);
 * // "function myFunc(arg: string): Promise<[MyType](/api/types/mytype)>"
 * ```
 */
export class TypeSignatureFormatter extends LibTypeSignatureFormatter {
	constructor(
		maxLineLength: number = 80,
		indent: string = "  ",
		private readonly apiItemRoutes?: Map<string, string>,
	) {
		super({ maxLineLength, indent });
	}

	/**
	 * Inject markdown cross-links into already-formatted signature text.
	 *
	 * A lower-level escape hatch kept for callers that want link injection at
	 * the formatter level; the build pipeline normally cross-links prose via
	 * MarkdownCrossLinker instead. The shared library's formatter has no
	 * equivalent, so this stays plugin-local. Covered by formatter.test.ts.
	 */
	public addLinks(text: string, excerpt: Excerpt): string {
		if (!excerpt.spannedTokens || !this.apiItemRoutes) {
			return text;
		}

		const typeReferences = new Map<string, string>();

		for (const token of excerpt.spannedTokens) {
			if (token.kind === "Reference" && token.canonicalReference) {
				// biome-ignore lint/suspicious/noExplicitAny: ExcerptToken types require dynamic property access
				const canonicalRef = (token as any).canonicalReference.toString();
				const route = this.apiItemRoutes.get(canonicalRef);

				if (route && token.text) {
					typeReferences.set(token.text.trim(), route);
				}
			}
		}

		let result = text;
		for (const [typeName, route] of typeReferences.entries()) {
			const regex = new RegExp(`\\b${this.escapeRegExp(typeName)}\\b`, "g");
			result = result.replace(regex, `[${typeName}](${route})`);
		}

		return result;
	}

	private escapeRegExp(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}
}
