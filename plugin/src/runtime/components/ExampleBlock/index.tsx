import type { Root } from "hast";
import type { ReactElement } from "react";
import { useWrapToggle } from "../../hooks/useWrapToggle.js";
import { ButtonGroup } from "../buttons/ButtonGroup.js";
import { CopyCodeButton } from "../buttons/CopyCodeButton.js";
import { WrapSignatureButton } from "../buttons/WrapSignatureButton.js";
import { SignatureCode } from "../SignatureCode/index.js";
import { SignatureToolbar } from "../SignatureToolbar/index.js";
import styles from "./index.module.css";

export interface ExampleBlockProps {
	/** Pre-generated HAST (Hypertext Abstract Syntax Tree) from Shiki */
	hast: Root | null;
	/** The code for copy functionality (optional for backwards compatibility) */
	code?: string;
}

/**
 * Code block for examples - displays syntax-highlighted code without a heading
 * Similar to SignatureBlock but without the "Signature" header
 * Includes both copy and wrap buttons in the toolbar
 */
export function ExampleBlock({ hast, code }: ExampleBlockProps): ReactElement {
	const { wrapped, toggleWrap } = useWrapToggle();

	return (
		<div className={styles.block}>
			<SignatureToolbar
				buttons={
					<ButtonGroup>
						{code && <CopyCodeButton code={code} />}
						<WrapSignatureButton wrapped={wrapped} onToggle={toggleWrap} />
					</ButtonGroup>
				}
			/>
			<SignatureCode hast={hast} wrapped={wrapped} />
		</div>
	);
}

export default ExampleBlock;
