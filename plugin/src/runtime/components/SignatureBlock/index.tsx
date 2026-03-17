import clsx from "clsx";
import type { Root } from "hast";
import type { ReactElement } from "react";
import { useWrapToggle } from "../../hooks/useWrapToggle.js";
import { WrapSignatureButton } from "../buttons/WrapSignatureButton.js";
import { SignatureCode } from "../SignatureCode/index.js";
import { SignatureToolbar } from "../SignatureToolbar/index.js";
import styles from "./index.module.css";

export interface SignatureBlockProps {
	/** Pre-generated HAST (Hypertext Abstract Syntax Tree) from Shiki */
	hast: Root | null;
	/** Optional heading text to display in the toolbar */
	heading?: string;
	/** Optional ID for the heading anchor link */
	id?: string;
	/** Whether this signature has parameters (affects border radius) */
	hasParameters?: boolean;
}

/**
 * Interactive signature block with wrap button
 * Displays syntax-highlighted TypeScript signatures with hover tooltips
 */
export function SignatureBlock({
	hast,
	heading = "Signature",
	id = "signature",
	hasParameters = false,
}: SignatureBlockProps): ReactElement {
	const { wrapped, toggleWrap } = useWrapToggle();

	return (
		<div className={clsx(styles.block, hasParameters && styles.hasParameters)}>
			<SignatureToolbar
				{...(heading && id
					? {
							heading: {
								text: heading,
								id,
								level: "h2" as const,
							},
						}
					: {})}
				buttons={<WrapSignatureButton wrapped={wrapped} onToggle={toggleWrap} />}
			/>
			<SignatureCode hast={hast} wrapped={wrapped} />
		</div>
	);
}

export default SignatureBlock;
