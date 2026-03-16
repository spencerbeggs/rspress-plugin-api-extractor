import type { AnchorHTMLAttributes, ReactElement, ReactNode } from "react";
import Markdown from "react-markdown";

export interface MarkdownContentProps {
	children: string;
}

/**
 * Custom link component that adds the rp-link class for RSPress styling
 * Filters out extra props passed by react-markdown (like `node`)
 */
function Link({
	children,
	href,
	title,
	target,
	rel,
}: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode; node?: unknown }): ReactElement {
	return (
		<a className="rp-link" href={href} title={title} target={target} rel={rel}>
			{children}
		</a>
	);
}

/**
 * Renders markdown content with RSPress-compatible link styling.
 * Wraps react-markdown and adds the `rp-link` class to all anchor tags.
 */
export function MarkdownContent({ children }: MarkdownContentProps): ReactElement {
	return <Markdown components={{ a: Link }}>{children}</Markdown>;
}

export default MarkdownContent;
