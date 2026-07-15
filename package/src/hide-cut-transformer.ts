import type { Element, Text } from "hast";
import type { ShikiTransformer } from "shiki";

/**
 * Extract text content from a HAST line element.
 *
 * @param line - The line element to extract text from
 * @returns The text content of the line
 */
function extractLineText(line: Element): string {
	let text = "";
	for (const child of line.children) {
		if (child.type === "text") {
			text += (child as Text).value;
		} else if (child.type === "element" && "children" in child) {
			// Recursively extract text from nested elements (e.g., syntax highlighting spans)
			for (const grandchild of child.children) {
				if (grandchild.type === "text") {
					text += (grandchild as Text).value;
				}
			}
		}
	}
	return text;
}

/**
 * Shiki transformer that hides cut directive and all preceding lines.
 *
 * This transformer is used for full signature blocks (class/interface skeletons)
 * where we want to hide hidden imports but keep the full signature visible.
 *
 * When `// ---cut---` is present:
 * - All lines before and including the cut directive are hidden
 * - Everything after the cut directive remains visible
 *
 * If no cut directive is found, no changes are made.
 */
export const HideCutLinesTransformer: ShikiTransformer = {
	name: "hide-cut-lines",
	code(node: Element): void {
		// Get all line elements
		const lines = node.children.filter(
			(child): child is Element => child.type === "element" && child.tagName === "span",
		);

		// Find cut directive
		let cutIndex = -1;
		for (let i = 0; i < lines.length; i++) {
			const text = extractLineText(lines[i]);
			if (text.trim() === "// ---cut---") {
				cutIndex = i;
				break;
			}
		}

		// If cut directive found, hide all lines up to and including it
		if (cutIndex >= 0) {
			for (let i = 0; i <= cutIndex; i++) {
				lines[i].properties = lines[i].properties || {};
				lines[i].properties.style = "display: none;";
			}
		}
	},
};

/**
 * Shiki transformer that formats member signature blocks for display.
 *
 * Member signature blocks are generated with a 3-line structure:
 * - Line 0: class/interface opening (e.g., `class Foo {`)
 * - Line 1+: member signature (may span multiple lines)
 * - Line N: closing brace (`}`)
 *
 * This transformer:
 * - Detects `// ---cut---` directive and hides all preceding lines
 * - Hides the first line (class/interface wrapper) if no cut directive
 * - Removes left padding from the first visible member signature line
 * - Hides the closing brace
 *
 * When `// ---cut---` is present:
 * - All lines before and including the cut directive are hidden
 * - The wrapper opening line after the cut is also hidden
 * - Padding is removed from the first visible content line
 *
 * Only applies to blocks with 3+ lines to avoid affecting regular code blocks.
 */
export const MemberFormatTransformer: ShikiTransformer = {
	name: "member-format",
	code(node: Element): void {
		// Get all line elements
		const lines = node.children.filter(
			(child): child is Element => child.type === "element" && child.tagName === "span",
		);

		// Only apply to member signature blocks (3+ lines)
		if (lines.length < 3) {
			return;
		}

		// Find cut directive
		let cutIndex = -1;
		for (let i = 0; i < lines.length; i++) {
			const text = extractLineText(lines[i]);
			if (text.trim() === "// ---cut---") {
				cutIndex = i;
				break;
			}
		}

		if (cutIndex >= 0) {
			// Hide imports + cut line + wrapper opening (line after cut)
			for (let i = 0; i <= cutIndex + 1; i++) {
				lines[i].properties = lines[i].properties || {};
				lines[i].properties.style = "display: none;";
			}
			// Remove padding from first visible line (line after wrapper opening)
			if (cutIndex + 2 < lines.length) {
				lines[cutIndex + 2].properties = lines[cutIndex + 2].properties || {};
				lines[cutIndex + 2].properties.style = "padding-left: 0;";
			}
		} else {
			// No cut directive - existing behavior
			// Hide first line (class/interface opening)
			lines[0].properties = lines[0].properties || {};
			lines[0].properties.style = "display: none;";

			// Set first member line (line 1) to have no left padding
			lines[1].properties = lines[1].properties || {};
			lines[1].properties.style = "padding-left: 0;";
		}

		// Always hide last line (closing brace)
		const lastIndex = lines.length - 1;
		lines[lastIndex].properties = lines[lastIndex].properties || {};
		lines[lastIndex].properties.style = "display: none;";
	},
};
