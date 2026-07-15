import type { ReactElement, ReactNode } from "react";

export interface MarkdownTextProps {
	/** Markdown text with optional links */
	children: string;
}

/**
 * Renders plain text with markdown links as React elements.
 * Only supports basic markdown links: [text](url)
 */
export function MarkdownText({ children }: MarkdownTextProps): ReactElement {
	const parts = parseMarkdownLinks(children);

	return <>{parts}</>;
}

/**
 * Parse markdown links and return array of React nodes
 */
function parseMarkdownLinks(text: string): ReactNode[] {
	const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
	const parts: ReactNode[] = [];
	let lastIndex = 0;
	let key = 0;

	for (const match of text.matchAll(linkRegex)) {
		// Add text before the link
		if (match.index !== undefined && match.index > lastIndex) {
			parts.push(text.slice(lastIndex, match.index));
		}

		// Add the link
		const [fullMatch, linkText, url] = match;
		parts.push(
			<a key={key++} href={url}>
				{linkText}
			</a>,
		);

		lastIndex = (match.index ?? 0) + fullMatch.length;
	}

	// Add remaining text after last link
	if (lastIndex < text.length) {
		parts.push(text.slice(lastIndex));
	}

	return parts;
}

export default MarkdownText;
