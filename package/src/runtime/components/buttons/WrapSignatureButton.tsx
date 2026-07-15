import clsx from "clsx";
import type { ReactElement } from "react";
import { UnwrapIcon } from "../icons/UnwrapIcon/index.js";
import { WrapIcon } from "../icons/WrapIcon/index.js";
import styles from "./index.module.css";

export interface WrapSignatureButtonProps {
	/** Whether line wrapping is currently enabled */
	wrapped: boolean;
	/** Callback fired when the button is clicked */
	onToggle: () => void;
}

/**
 * Wrap toggle button for API signature blocks
 * Shows wrapped/unwrapped state with distinct icons
 */
export function WrapSignatureButton({ wrapped, onToggle }: WrapSignatureButtonProps): ReactElement {
	return (
		<button
			type="button"
			className={clsx(styles.button, wrapped && "active")}
			onClick={onToggle}
			aria-label={wrapped ? "Disable line wrapping" : "Enable line wrapping"}
			title={wrapped ? "Disable wrapping" : "Enable wrapping"}
		>
			{wrapped ? <UnwrapIcon size={16} /> : <WrapIcon size={16} />}
		</button>
	);
}
