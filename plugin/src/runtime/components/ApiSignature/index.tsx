import type { ReactElement } from "react";
import { createElement, useMemo } from "react";
import { decodeHast } from "../../utils/decode-hast.js";
import * as RuntimeComponents from "../SignatureBlock/index.js";

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
 * Replaces SignatureBlockWrapper with a simpler component that takes plain
 * string props (no base64 encoding for code). Produces clean semantic HTML
 * that RSPress converts to LLM-readable markdown in SSG-MD mode, and renders
 * interactive Shiki-highlighted code in browser mode.
 *
 * In SSG-MD mode, renders a "Signature" heading followed by a plain
 * code block with the type signature.
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
		const { SignatureBlock } = RuntimeComponents;
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
