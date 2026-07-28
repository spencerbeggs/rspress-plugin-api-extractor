import type { FC } from "react";

export const TestComponent: FC<{ code: string }> = ({ code }) => {
	if (import.meta.env.SSG_MD) {
		// SSG-MD mode: Render simple HTML that RSPress converts to clean markdown
		// Use both className and lang attribute for maximum compatibility with markdown converters.
		const header = "```typescript\n";
		const footer = "\n```\n";
		return <>{`${header}${code.trim()}${footer}`}</>;
	}
};
