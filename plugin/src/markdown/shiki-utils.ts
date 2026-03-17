import type { Root } from "hast";
import type { Highlighter, ShikiTransformer } from "shiki";

/**
 * Theme input type - can be a theme name string or custom theme object
 */
type ThemeInput = string | Record<string, unknown>;

/**
 * Theme configuration for Shiki highlighting
 */
export interface ShikiThemeConfig {
	light: ThemeInput;
	dark: ThemeInput;
}

/**
 * Default Shiki theme configuration
 */
export const DEFAULT_SHIKI_THEMES: ShikiThemeConfig = {
	light: "github-light-default",
	dark: "github-dark-default",
};

/**
 * Generate a HAST (Hypertext Abstract Syntax Tree) from TypeScript code using Shiki.
 *
 * This function replaces the duplicated `generateShikiHtml` methods across page generators.
 * It produces a JSON-serializable HAST tree instead of HTML strings, which:
 * - Eliminates MDX parsing issues caused by long HTML strings with special characters
 * - Allows clean JSON serialization in generated MDX files
 * - Enables runtime rendering via `hast-util-to-jsx-runtime` without `dangerouslySetInnerHTML`
 *
 * @param code - The TypeScript code to highlight
 * @param highlighter - Shiki highlighter instance (optional, returns null if not provided)
 * @param transformers - Optional array of Shiki transformers (e.g., Twoslash, cross-linker)
 * @param enableTwoslash - If true, adds meta to trigger Twoslash directive processing
 * @param theme - Optional theme configuration (defaults to github-light/github-dark)
 * @returns A HAST root node, or null if no highlighter is provided or an error occurs
 */
export async function generateShikiHast(
	code: string,
	highlighter?: Highlighter,
	transformers?: ShikiTransformer[],
	enableTwoslash?: boolean,
	theme?: ShikiThemeConfig,
): Promise<Root | null> {
	if (!highlighter) {
		return null;
	}

	const resolvedTheme = theme ?? DEFAULT_SHIKI_THEMES;

	try {
		const options: Parameters<typeof highlighter.codeToHast>[1] = {
			lang: "typescript",
			themes: {
				light: resolvedTheme.light,
				dark: resolvedTheme.dark,
			},
			defaultColor: false,
			// Namespace CSS variables to avoid conflicts with user's default code blocks
			// This generates --api-shiki-light-* and --api-shiki-dark-* instead of --shiki-*
			cssVariablePrefix: "--api-shiki-",
			transformers: transformers || [],
		};
		// Pass meta to trigger Twoslash processing when enabled
		// This simulates the ```ts twoslash code fence meta
		if (enableTwoslash) {
			options.meta = { __raw: "twoslash" };
		}
		return await highlighter.codeToHast(code, options);
	} catch (error) {
		console.error("Failed to generate Shiki HAST:", error);
		return null;
	}
}
