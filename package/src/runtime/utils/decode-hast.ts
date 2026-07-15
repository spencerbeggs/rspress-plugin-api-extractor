/* v8 ignore start -- React utility, requires browser/React test environment */
import type { Root } from "hast";

/**
 * Decode a HAST value that may be base64-encoded, plain JSON, or already parsed.
 *
 * Supports multiple input formats:
 * - Root object (direct HAST) - returned as-is
 * - Base64-encoded JSON string (from serializeHastForMdx)
 * - Plain JSON string (legacy format)
 *
 * @param hast - The HAST value to decode
 * @param componentName - Optional component name for warning messages
 * @returns Parsed HAST Root or null if decoding fails
 */
export function decodeHast(hast: Root | string | null | undefined, componentName?: string): Root | null {
	if (!hast) return null;
	if (typeof hast !== "string") return hast;

	try {
		// Try base64 decode first (new format from serializeHastForMdx)
		// Base64 strings contain only [A-Za-z0-9+/=]
		if (/^[A-Za-z0-9+/=]+$/.test(hast) && hast.length > 20) {
			// Decode base64 to UTF-8 using TextDecoder (atob only handles Latin-1)
			const binaryString = atob(hast);
			const bytes = Uint8Array.from(binaryString, (char) => char.charCodeAt(0));
			const json = new TextDecoder("utf-8").decode(bytes);
			return JSON.parse(json) as Root;
		}
		// Fall back to plain JSON (legacy format)
		return JSON.parse(hast) as Root;
	} catch {
		const name = componentName ? `${componentName}: ` : "";
		console.warn(`${name}Failed to decode HAST`);
		return null;
	}
}
