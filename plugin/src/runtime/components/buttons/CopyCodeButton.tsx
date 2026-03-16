import clsx from "clsx";
import type { ReactElement } from "react";
import { useCallback, useState } from "react";
import { CheckIcon } from "../icons/CheckIcon/index.js";
import { CopyIcon } from "../icons/CopyIcon/index.js";
import styles from "./index.module.css";

export interface CopyCodeButtonProps {
	/** The code to copy to clipboard */
	code: string;
}

/**
 * Copy code button for code blocks
 * Shows copy icon, changes to checkmark on success
 */
export function CopyCodeButton({ code }: CopyCodeButtonProps): ReactElement {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(code);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Fallback for older browsers or when clipboard API is unavailable
			const textarea = document.createElement("textarea");
			textarea.value = code;
			textarea.style.position = "fixed";
			textarea.style.opacity = "0";
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand("copy");
			document.body.removeChild(textarea);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	}, [code]);

	return (
		<button
			type="button"
			className={clsx(styles.button, copied && "active")}
			onClick={handleCopy}
			aria-label={copied ? "Copied!" : "Copy code"}
			title={copied ? "Copied!" : "Copy code"}
		>
			{copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
		</button>
	);
}
