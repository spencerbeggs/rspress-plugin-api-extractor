import clsx from "clsx";
import type { Root } from "hast";
import type { ReactElement } from "react";
import { hastToReact } from "../../utils/hast-renderer.js";
import styles from "./index.module.css";

export interface SignatureCodeProps {
	/** Pre-generated HAST (Hypertext Abstract Syntax Tree) from Shiki */
	hast: Root | null;
	/** Whether line wrapping is enabled */
	wrapped: boolean;
}

/**
 * Code block for displaying syntax-highlighted signatures
 * Supports wrapped and unwrapped states
 * Uses HAST for safe rendering without dangerouslySetInnerHTML
 */
export function SignatureCode({ hast, wrapped }: SignatureCodeProps): ReactElement {
	if (!hast) {
		return <div className={clsx(styles.code, wrapped && styles.wrapped)} />;
	}

	return <div className={clsx("api-doc-code", styles.code, wrapped && styles.wrapped)}>{hastToReact(hast)}</div>;
}
