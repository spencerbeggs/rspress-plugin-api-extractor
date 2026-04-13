import clsx from "clsx";
import type { Root } from "hast";
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
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
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const handleMouseOver = (e: Event): void => {
			const target = e.target as HTMLElement;
			const hover = target.closest?.(".twoslash-hover");
			if (!hover) return;

			const popup = hover.querySelector(".twoslash-popup-container") as HTMLElement | null;
			if (!popup) return;

			const hoverRect = hover.getBoundingClientRect();
			const containerWidth = container.getBoundingClientRect().width;

			popup.style.setProperty("--popup-top", `${hoverRect.bottom + 4}px`);
			popup.style.setProperty("--popup-left", `${hoverRect.left}px`);
			popup.style.setProperty("--popup-max-width", `${containerWidth * 0.75}px`);
		};

		container.addEventListener("mouseover", handleMouseOver);
		return () => container.removeEventListener("mouseover", handleMouseOver);
	}, []);

	if (!hast) {
		return <div ref={containerRef} className={clsx(styles.code, wrapped && styles.wrapped)} />;
	}

	return (
		<div ref={containerRef} className={clsx("api-doc-code", styles.code, wrapped && styles.wrapped)}>
			{hastToReact(hast)}
		</div>
	);
}
