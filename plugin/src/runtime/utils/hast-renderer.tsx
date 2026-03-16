import type { Root } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { ReactElement } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

/**
 * Convert a HAST (Hypertext Abstract Syntax Tree) root to a React element.
 *
 * This function is used to render pre-generated Shiki HAST trees at runtime,
 * avoiding the need for `dangerouslySetInnerHTML` and eliminating MDX parsing
 * issues caused by long HTML strings with special characters.
 *
 * @param hast - The HAST root node from Shiki's `codeToHast()`
 * @returns A React element representing the HAST tree
 */
export function hastToReact(hast: Root): ReactElement {
	return toJsxRuntime(hast, { Fragment, jsx, jsxs }) as ReactElement;
}
