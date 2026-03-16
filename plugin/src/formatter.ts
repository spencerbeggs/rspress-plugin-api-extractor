import type { Excerpt } from "@microsoft/api-extractor-model";

/**
 * Formats TypeScript type signatures for display in documentation.
 *
 * This class transforms raw API Extractor excerpt text into clean, readable
 * signatures suitable for documentation. It handles spacing between tokens,
 * removes `export` and `declare` keywords, and optionally adds cross-links
 * to referenced types.
 *
 * **Processing Steps:**
 * 1. Extract text from API Extractor Excerpt tokens
 * 2. Strip `export` and `declare` keywords for cleaner display
 * 3. Apply proper spacing between tokens (operators, brackets, etc.)
 * 4. Optionally break long union/intersection types across lines
 * 5. Optionally add markdown links to referenced types
 *
 * **Token Spacing Rules:**
 * - Space before/after union (`|`) and intersection (`&`) operators
 * - Space after colons in type annotations
 * - Space before opening braces after identifiers
 * - No space before generic angle brackets
 * - Proper spacing in object literal types
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
export class TypeSignatureFormatter {
	constructor(
		private readonly maxLineLength: number = 80,
		private readonly indent: string = "  ",
		private readonly apiItemRoutes?: Map<string, string>,
	) {}

	/**
	 * Format a complex type signature with line breaks for better readability.
	 * Removes `export` and `declare` keywords for cleaner signatures.
	 */
	public format(excerpt: Excerpt): string {
		// If no spanned tokens, fall back to plain text and strip export/declare
		if (!excerpt.spannedTokens || excerpt.spannedTokens.length === 0) {
			return this.stripExportDeclare(excerpt.text);
		}

		const tokens = excerpt.spannedTokens;
		let currentLine = "";
		const lines: string[] = [];
		let bracketDepth = 0;

		let lastTokenText = "";

		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			let tokenText = token.text;

			// Strip export/declare from the beginning of tokens
			if (i === 0) {
				tokenText = this.stripExportDeclare(tokenText);
			}

			// Skip empty tokens
			if (tokenText.trim() === "") {
				continue;
			}

			// Track bracket depth for nested types
			if (tokenText === "{" || tokenText === "[" || tokenText === "(") {
				bracketDepth++;
			} else if (tokenText === "}" || tokenText === "]" || tokenText === ")") {
				bracketDepth--;
			}

			// Check if this is a union or intersection operator
			const isUnion = tokenText.trim() === "|";
			const isIntersection = tokenText.trim() === "&";
			const isOperator = isUnion || isIntersection;

			// Add spacing before token if needed
			if (lastTokenText && this.needsSpaceBefore(lastTokenText, tokenText)) {
				currentLine += " ";
			}

			// Add token to current line
			currentLine += tokenText;
			lastTokenText = tokenText;

			// Break line after union/intersection operators if:
			// 1. We're at top level (bracketDepth === 0)
			// 2. Current line exceeds max length
			// 3. This is not the last token
			if (isOperator && bracketDepth === 0 && currentLine.length > this.maxLineLength && i < tokens.length - 1) {
				lines.push(currentLine.trimEnd());
				currentLine = this.indent;
			}
		}

		// Add remaining content
		if (currentLine.trim()) {
			lines.push(currentLine.trimEnd());
		}

		// If we only have one line or didn't break anywhere, reconstruct with proper spacing
		if (lines.length <= 1) {
			// Reconstruct from tokens to ensure proper spacing
			let result = "";
			let lastNonEmptyTokenText = "";

			for (let i = 0; i < tokens.length; i++) {
				const token = tokens[i];
				let tokenText = token.text;

				// Strip export/declare from the first token
				if (i === 0) {
					tokenText = this.stripExportDeclare(tokenText);
				}

				// Skip empty tokens
				if (tokenText.trim() === "") {
					continue;
				}

				// Add space before token if needed (using last non-empty token)
				if (lastNonEmptyTokenText && this.needsSpaceBefore(lastNonEmptyTokenText, tokenText)) {
					result += " ";
				}

				result += tokenText;
				lastNonEmptyTokenText = tokenText;
			}

			return result.trimStart();
		}

		// Apply strip as final safety check
		return this.stripExportDeclare(lines.join("\n"));
	}

	/**
	 * Add cross-links to type references in formatted text.
	 */
	public addLinks(text: string, excerpt: Excerpt): string {
		if (!excerpt.spannedTokens || !this.apiItemRoutes) {
			return text;
		}

		// Build a map of type names to their routes from the tokens
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

		// Replace type names with markdown links
		let result = text;
		for (const [typeName, route] of typeReferences.entries()) {
			// Use word boundaries to avoid partial matches
			const regex = new RegExp(`\\b${this.escapeRegExp(typeName)}\\b`, "g");
			result = result.replace(regex, `[${typeName}](${route})`);
		}

		return result;
	}

	/**
	 * Strip export and declare keywords from a signature
	 * Handles various combinations: export, declare, export declare
	 */
	private stripExportDeclare(text: string): string {
		// Remove leading whitespace to ensure ^ matches work correctly
		const trimmed = text.trim();

		// Handle all combinations of export/declare at the start
		let result = trimmed
			// Remove "export declare " combination
			.replace(/^export\s+declare\s+/i, "")
			// Remove standalone "export "
			.replace(/^export\s+/i, "")
			// Remove standalone "declare "
			.replace(/^declare\s+/i, "");

		// Handle any remaining export/declare in the middle (shouldn't happen but be safe)
		result = result
			.replace(/\bexport\s+declare\s+/gi, "")
			.replace(/\bexport\s+/gi, "")
			.replace(/\bdeclare\s+/gi, "");

		return result;
	}

	/**
	 * Determine if a space is needed between two tokens
	 */
	private needsSpaceBefore(prevText: string, currentText: string): boolean {
		// Don't add space if previous token already ends with whitespace
		if (/\s$/.test(prevText)) return false;

		// Don't add space if current token starts with whitespace
		if (/^\s/.test(currentText)) return false;

		// No space before angle brackets (for generics like Pick<T>)
		if (currentText.trim().startsWith("<")) return false;

		// No space before commas, semicolons, or colons
		if (currentText.trim().match(/^[,;]/)) return false;

		// Add space after comma (for [string, number])
		if (prevText.trim().endsWith(",")) return true;

		// Add space before and after equals sign (for type Foo = Bar)
		if (currentText.trim() === "=" || currentText.trim().startsWith("=")) return true;
		if (prevText.trim().endsWith("=")) return true;

		// Add space before and after union/intersection operators (for A | B and A & B)
		if (currentText.trim() === "|" || currentText.trim() === "&") return true;
		if (prevText.trim() === "|" || prevText.trim() === "&") return true;

		// Add space after opening brace (unless followed by closing brace) for { key: value }
		if (prevText.trim() === "{" && currentText.trim() !== "}") return true;

		// Add space before closing brace (unless preceded by opening brace) for { key: value }
		if (currentText.trim() === "}" && prevText.trim() !== "{") return true;

		// No space after opening parentheses/brackets or before closing ones
		if (prevText.trim().match(/^[[(]$/)) return false;
		if (currentText.trim().match(/^[\])]$/)) return false;

		// Add space after colon (for type annotations like "data: Type")
		if (prevText.trim().endsWith(":")) return true;

		// Add space after optional marker (for "data?: Type")
		if (prevText.trim().endsWith("?:")) return true;

		// Add space before colon if previous token is not punctuation
		if (currentText.trim().startsWith(":") && !prevText.trim().match(/[,;:?]$/)) return false;

		// Add space before opening brace when preceded by alphanumeric (for interface Foo {})
		if (currentText.trim().startsWith("{") && /[a-zA-Z0-9_>]$/.test(prevText.trim())) return true;

		// Default: add space between alphanumeric tokens
		const prevEndsAlphanumeric = /[a-zA-Z0-9_>]$/.test(prevText.trim());
		const currentStartsAlphanumeric = /^[a-zA-Z0-9_<]/.test(currentText.trim());

		return prevEndsAlphanumeric && currentStartsAlphanumeric;
	}

	/**
	 * Escape special regex characters in a string
	 */
	private escapeRegExp(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}
}
