import type { ReactElement } from "react";
import { createElement, useMemo } from "react";
import { decodeHast } from "../../utils/decode-hast.js";
import * as RuntimeComponents from "../MemberSignature/index.js";

export interface ApiMemberProps {
	/** Member signature code (not wrapped in class/interface) */
	code: string;
	/** Display name for the heading */
	memberName: string;
	/** Plain text or markdown summary (not HTML, not base64) */
	summary?: string;
	/** Anchor ID */
	id?: string;
	/**
	 * Pre-generated HAST tree from Shiki (base64-encoded JSON string).
	 * Injected by the remark-api-codeblocks plugin during MDX compilation.
	 */
	hast?: string;
	/** Whether this signature has parameters (affects border radius in browser mode) */
	hasParameters?: boolean | string;
}

/**
 * Renders an individual class/interface member signature block.
 *
 * Replaces MemberSignatureWrapper with a simpler component that takes plain
 * string props. The `code` prop contains only the member signature (not
 * wrapped in a class skeleton), and `summary` is plain markdown-compatible
 * text (not HTML with `<a>` tags, not base64-encoded).
 *
 * SSG-MD output:
 * ```markdown
 * ### addTransport(transport)
 *
 * Register a [LogTransport](/api/type/logtransport) to receive future log entries.
 *
 * ```typescript
 * addTransport(transport: LogTransport): void
 * ```
 * ```
 */
export function ApiMember({ code, memberName, summary, id, hast, hasParameters }: ApiMemberProps): ReactElement {
	const parsedHast = useMemo(() => decodeHast(hast, "ApiMember"), [hast]);
	const hasParamsBoolean = typeof hasParameters === "string" ? hasParameters === "true" : !!hasParameters;

	if (import.meta.env.SSG_MD) {
		// SSG-MD mode: Render heading + summary + code block.
		// Use both className and lang attribute for maximum compatibility with markdown converters.
		const header = "```typescript\n";
		const footer = "\n```\n";
		return (
			<>
				{`### ${memberName}\n\n`}
				{summary && `${summary}\n\n`}
				{`${header}${code.trim()}${footer}`}
			</>
		);
	}

	// Browser mode: Use MemberSignature with pre-rendered Shiki HAST
	if (parsedHast) {
		const { MemberSignature } = RuntimeComponents;
		return createElement(MemberSignature, {
			hast: parsedHast,
			memberName,
			summary,
			id,
			hasParameters: hasParamsBoolean,
		});
	}

	// Fallback: plain code (no HAST available)
	return (
		<div>
			<h3 id={id}>{memberName}</h3>
			{summary && <p>{summary}</p>}
			<pre>
				<code className="language-typescript">{code.trim()}</code>
			</pre>
		</div>
	);
}

export default ApiMember;
