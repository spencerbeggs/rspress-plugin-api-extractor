import type { ReactElement } from "react";
import { createElement, useMemo } from "react";
import { decodeHast } from "../../utils/decode-hast.js";
import * as RuntimeComponents from "../ExampleBlock/index.js";

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
 * Renders an example code block.
 *
 * Replaces ExampleBlockWrapper with a simpler component that takes a plain
 * code string (no base64, no HAST for code). The code should already have
 * Twoslash directives stripped.
 *
 * In SSG-MD mode, renders a plain code block with the example code.
 */
export function ApiExample({ code, hast }: ApiExampleProps): ReactElement {
	const parsedHast = useMemo(() => decodeHast(hast, "ApiExample"), [hast]);

	if (import.meta.env.SSG_MD) {
		// SSG-MD mode: Render simple HTML that RSPress converts to clean markdown
		// Use both className and lang attribute for maximum compatibility with markdown converters.
		const header = "```typescript\n";
		const footer = "\n```\n";
		return <>{`${header}${code.trim()}${footer}`}</>;
		// return (
		// 	<pre>
		// 		<code className="language-typescript" lang="typescript">
		// 			{code.trim()}
		// 		</code>
		// 	</pre>
		// );
	}

	// Browser mode: Use ExampleBlock with pre-rendered Shiki HAST
	if (parsedHast) {
		const { ExampleBlock } = RuntimeComponents;
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
