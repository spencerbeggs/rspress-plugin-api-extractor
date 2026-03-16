import clsx from "clsx";
import type { Root } from "hast";
import type { ReactElement } from "react";
import { useWrapToggle } from "../../hooks/useWrapToggle.js";
import { WrapSignatureButton } from "../buttons/WrapSignatureButton.js";
import { SignatureCode } from "../SignatureCode/index.js";
import { SignatureToolbar } from "../SignatureToolbar/index.js";
import styles from "./index.module.css";

export interface MemberSignatureProps {
	/** Pre-generated HAST (Hypertext Abstract Syntax Tree) from Shiki */
	hast: Root | null;
	/** Member name to display in the header */
	memberName: string;
	/** Optional ID for the anchor link */
	id?: string;
	/** Optional plain text summary to display in the toolbar */
	summary?: string;
	/** Whether this signature has parameters (affects border radius) */
	hasParameters?: boolean;
}

/**
 * Interactive member signature block with h3 header and wrap button
 * Displays syntax-highlighted TypeScript member signatures with hover tooltips
 */
export function MemberSignature({
	hast,
	memberName,
	id,
	summary,
	hasParameters = false,
}: MemberSignatureProps): ReactElement {
	// SSG-MD mode: return clean markdown instead of interactive components
	if (import.meta.env.SSG_MD) {
		// Extract signature from HAST by extracting text content
		let signature = "";
		if (hast) {
			signature = extractTextFromHast(hast);
		}

		// Extract just the member signature line (line 1 from the skeleton)
		const lines = signature.split("\n").filter((line) => line.trim());
		if (lines.length >= 2) {
			signature = lines[1].trim();
		}

		// Build markdown string
		let markdown = `### ${memberName}\n\n**Signature:** \`${signature}\``;
		if (summary) {
			markdown += `\n\n${summary}`;
		}

		return <>{markdown}</>;
	}

	// Browser mode: return interactive component
	const { wrapped, toggleWrap } = useWrapToggle();

	return (
		<div className={clsx(styles.block, hasParameters && styles.hasParameters)}>
			<SignatureToolbar
				heading={{
					text: memberName,
					id,
					level: "h3",
				}}
				summary={summary}
				buttons={<WrapSignatureButton wrapped={wrapped} onToggle={toggleWrap} />}
			/>
			<SignatureCode hast={hast} wrapped={wrapped} />
		</div>
	);
}

/**
 * Extract plain text from a HAST tree
 */
function extractTextFromHast(node: Root | Root["children"][number]): string {
	if ("value" in node && typeof node.value === "string") {
		return node.value;
	}
	if ("children" in node && Array.isArray(node.children)) {
		return node.children.map(extractTextFromHast).join("");
	}
	return "";
}

export default MemberSignature;
