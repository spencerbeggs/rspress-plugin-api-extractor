/**
 * Twoslash directive detection patterns.
 *
 * These regexes mirror the upstream Twoslash source at:
 * https://github.com/twoslashes/twoslash/blob/main/packages/twoslash/src/regexp.ts
 *
 * All patterns allow an optional space after `//` (e.g., both `// @noErrors`
 * and `//@noErrors` are valid Twoslash syntax).
 */

/**
 * Config directives: boolean flags and key-value pairs.
 *
 * Upstream: `reConfigBoolean` + `reConfigValue` + `reFilenamesMakers`
 *
 * @example
 * ```
 * // @noErrors
 * //@strict
 * // @errors: 2304
 * // @target: ES2020
 * // @filename: example.ts
 * ```
 */
export const RE_CONFIG = /^\/\/\s?@\w+/;

/**
 * Annotation markers: query, completion, and highlight markers.
 *
 * Upstream: `reAnnonateMarkers` — `/^\s*\/\/\s*\^(\?|\||\^+)( .*)?$/gm`
 *
 * These are positioned under code lines with `^` characters for alignment.
 * After `line.trim()`, leading whitespace is removed but internal spaces
 * between `//` and `^` are preserved.
 *
 * @example
 * ```
 * // ^? — query (show type info)
 * //    ^? — query with alignment spaces
 * // ^| — completion (show autocomplete)
 * // ^^^ — highlight range
 * // ^^^^ description text
 * ```
 */
export const RE_ANNOTATION = /^\/\/\s*\^[?|^]/;

/**
 * Cut directives: control which code is visible in output.
 *
 * Upstream: `reCutBefore`, `reCutAfter`, `reCutStart`, `reCutEnd`
 *
 * @example
 * ```
 * // ---cut---
 * //---cut-before---
 * // ---cut-after---
 * // ---cut-start---
 * // ---cut-end---
 * ```
 */
export const RE_CUT = /^\/\/\s?---cut/;

/**
 * Test whether a trimmed line is any Twoslash directive.
 *
 * Covers all directive types: config flags, config values, filename markers,
 * annotation markers (query/completion/highlight), and cut directives.
 *
 * @param trimmedLine - The line with leading/trailing whitespace removed
 * @returns true if the line is a Twoslash directive
 */
export function isTwoslashDirective(trimmedLine: string): boolean {
	return RE_CONFIG.test(trimmedLine) || RE_ANNOTATION.test(trimmedLine) || RE_CUT.test(trimmedLine);
}

/**
 * Test whether a trimmed line is a cut directive.
 *
 * @param trimmedLine - The line with leading/trailing whitespace removed
 * @returns true if the line is a Twoslash cut directive
 */
export function isCutDirective(trimmedLine: string): boolean {
	return RE_CUT.test(trimmedLine);
}

/**
 * Classify a cut directive line.
 *
 * @param trimmedLine - The line with leading/trailing whitespace removed
 * @returns The cut type, or null if not a cut directive
 */
export function classifyCutDirective(trimmedLine: string): "cut-before" | "cut-after" | "cut-start" | "cut-end" | null {
	if (/^\/\/\s?---cut(-before)?---$/.test(trimmedLine)) return "cut-before";
	if (/^\/\/\s?---cut-after---$/.test(trimmedLine)) return "cut-after";
	if (/^\/\/\s?---cut-start---$/.test(trimmedLine)) return "cut-start";
	if (/^\/\/\s?---cut-end---$/.test(trimmedLine)) return "cut-end";
	return null;
}
