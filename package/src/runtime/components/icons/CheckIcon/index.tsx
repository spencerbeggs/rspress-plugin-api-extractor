import type { ReactElement, SVGProps } from "react";

export interface CheckIconProps extends SVGProps<SVGSVGElement> {
	/** Icon size in pixels */
	size?: number;
}

/**
 * Check/checkmark icon for success states
 * Shows a checkmark indicating success/completion
 */
export function CheckIcon({ size = 16, ...props }: CheckIconProps): ReactElement {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" {...props}>
			<title>Copied</title>
			<path fill="currentColor" d="M21 7L9 19l-5.5-5.5l1.41-1.41L9 16.17L19.59 5.59L21 7Z" />
		</svg>
	);
}
