import type { ReactElement } from "react";
import { createElement, useMemo } from "react";
import { decodeHast } from "../../utils/decode-hast.js";
import { ExampleBlock } from "../ExampleBlock/index.js";

/**
 * Props for the {@link ApiExample} component used in generated MDX pages.
 *
 * @public
 */
export interface ApiExampleProps {
	/** Example code (no Twoslash directives) */
	code: string;
	/**
	 * Pre-generated HAST tree from Shiki (base64-encoded JSON string).
	 * Injected by the remark-api-codeblocks plugin during MDX compilation.
	 */
	hast?: string;
}

/**
 * Renders an example code block in generated API documentation pages.
 *
 * In browser mode renders a Shiki-highlighted code block with copy and wrap
 * controls. In SSG-MD mode renders a plain fenced code block.
 *
 * @param props - {@link ApiExampleProps}
 * @public
 */
export function ApiExample({ code, hast }: ApiExampleProps): ReactElement {
	const parsedHast = useMemo(() => decodeHast(hast, "ApiExample"), [hast]);

	if (import.meta.env.SSG_MD) {
		// SSG-MD mode: Render simple HTML that RSPress converts to clean markdown
		// Use both className and lang attribute for maximum compatibility with markdown converters.
		const header = "```typescript\n";
		const footer = "\n```\n";
		return <>{`${header}${code.trim()}${footer}`}</>;
	}

	// Browser mode: Use ExampleBlock with pre-rendered Shiki HAST
	if (parsedHast) {
		return createElement(ExampleBlock, { hast: parsedHast, code: code.trim() });
	}

	// Fallback: plain code (no HAST available)
	return (
		<pre>
			<code className="language-typescript">{code.trim()}</code>
		</pre>
	);
}

export default ApiExample;
