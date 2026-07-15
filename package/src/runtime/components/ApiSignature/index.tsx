import type { ReactElement } from "react";
import { createElement, useMemo } from "react";
import { decodeHast } from "../../utils/decode-hast.js";
import { SignatureBlock } from "../SignatureBlock/index.js";

/**
 * Props for the {@link ApiSignature} component used in generated MDX pages.
 *
 * @public
 */
export interface ApiSignatureProps {
	/** Display code (clean, no Twoslash directives) */
	code: string;
	/** Section heading (default: "Signature") */
	heading?: string;
	/** Anchor ID (default: "signature") */
	id?: string;
	/**
	 * Pre-generated HAST tree from Shiki (base64-encoded JSON string).
	 * Injected by the remark-api-codeblocks plugin during MDX compilation.
	 */
	hast?: string;
	/** Whether this signature has parameters (affects border radius in browser mode) */
	hasParameters?: boolean | string;
	/** Whether this signature has members table below (affects border radius in browser mode) */
	hasMembers?: boolean | string;
}

/**
 * Renders a full API type signature block.
 *
 * In browser mode renders an interactive Shiki-highlighted code block.
 * In SSG-MD mode renders a plain fenced code block for LLM consumption.
 *
 * @param props - {@link ApiSignatureProps}
 * @public
 */
export function ApiSignature({
	code,
	heading: _heading = "Signature",
	id: _id = "signature",
	hast,
	hasParameters,
	hasMembers,
}: ApiSignatureProps): ReactElement {
	const parsedHast = useMemo(() => decodeHast(hast, "ApiSignature"), [hast]);
	const hasParamsBoolean = typeof hasParameters === "string" ? hasParameters === "true" : !!hasParameters;
	const hasMembersBoolean = typeof hasMembers === "string" ? hasMembers === "true" : !!hasMembers;
	// Either parameters or members below means we need connected styling
	const hasTableBelow = hasParamsBoolean || hasMembersBoolean;

	if (import.meta.env.SSG_MD) {
		// SSG-MD mode: Render just the code block. The heading is output by the page
		// generator as markdown to ensure proper spacing (JSX whitespace is ignored).
		// Use both className and lang attribute for maximum compatibility with markdown converters.
		const header = "```typescript\n";
		const footer = "\n```\n";
		return <>{`${header}${code.trim()}${footer}`}</>;
	}

	// Browser mode: Use SignatureBlock with pre-rendered Shiki HAST
	// The heading is output by the page generator as markdown (## Signature)
	if (parsedHast) {
		return createElement(SignatureBlock, { hast: parsedHast, hasParameters: hasTableBelow });
	}

	// Fallback: plain code (no HAST available)
	// The heading is output by the page generator as markdown (## Signature)
	return (
		<pre>
			<code className="language-typescript">{code.trim()}</code>
		</pre>
	);
}

export default ApiSignature;
