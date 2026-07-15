import type { ReactElement, SVGProps } from "react";

export interface UnwrapIconProps extends SVGProps<SVGSVGElement> {
	/** Icon size in pixels */
	size?: number;
}

/**
 * Unwrap icon for text wrapping toggle buttons (active state)
 * Shows wrapped lines with an arrow indicating active wrap mode
 * Uses green color to indicate active state
 */
export function UnwrapIcon({ size = 16, ...props }: UnwrapIconProps): ReactElement {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			aria-label="Wrapped"
			{...props}
		>
			<title>Unwrap</title>
			<path
				fill="#22a041"
				d="M21 5H3v2h18zM3 19h7v-2H3zm0-6h15c1 0 2 .43 2 2s-1 2-2 2h-2v-2l-4 3l4 3v-2h2c2.95 0 4-1.27 4-4c0-2.72-1-4-4-4H3z"
			/>
		</svg>
	);
}
