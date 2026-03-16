import clsx from "clsx";
import type { ReactElement, ReactNode } from "react";
import { MarkdownContent } from "../MarkdownContent/index.js";
import styles from "./index.module.css";

export interface SignatureToolbarHeading {
	/** Heading text */
	text: string;
	/** Anchor ID for permalinks */
	id?: string;
	/** Heading level (h2 or h3) */
	level: "h2" | "h3";
	/** Additional CSS classes for the heading */
	className?: string;
}

export interface SignatureToolbarProps {
	/** Optional heading configuration */
	heading?: SignatureToolbarHeading;
	/** Optional summary text (supports markdown links) to display below heading */
	summary?: string;
	/** Buttons to display in the toolbar */
	buttons: ReactNode;
}

/**
 * Toolbar for signature blocks
 * Displays optional heading, summary, and action buttons
 */
export function SignatureToolbar({ heading, summary, buttons }: SignatureToolbarProps): ReactElement {
	const renderHeading = (): ReactElement | null => {
		if (!heading) return null;

		const HeadingTag = heading.level;
		const headingClasses =
			heading.className ||
			clsx("rp-toc-include", styles.memberHeading, heading.level === "h2" && styles.memberHeadingH2);

		return (
			<HeadingTag id={heading.id} className={headingClasses}>
				{heading.id && (
					<a href={`#${heading.id}`} className="rp-header-anchor rp-link" tabIndex={-1} aria-label="Permalink">
						#
					</a>
				)}
				{heading.text}
			</HeadingTag>
		);
	};

	const renderSummary = (): ReactElement | null => {
		if (!summary) return null;
		return (
			<div className={styles.summary}>
				<MarkdownContent>{summary}</MarkdownContent>
			</div>
		);
	};

	// If we have a heading, use the two-column layout
	if (heading) {
		return (
			<div className={styles.toolbar}>
				<div className={styles.toolbarLeft}>
					{renderHeading()}
					{renderSummary()}
				</div>
				<div className={styles.buttons}>{buttons}</div>
			</div>
		);
	}

	// No heading, just buttons aligned to the right
	return <div className={styles.toolbar}>{buttons}</div>;
}
