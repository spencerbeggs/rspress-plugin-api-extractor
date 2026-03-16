import type { ReactElement, SVGProps } from "react";

export interface CopyIconProps extends SVGProps<SVGSVGElement> {
	/** Icon size in pixels */
	size?: number;
}

/**
 * Copy icon for copy code buttons
 * Shows two overlapping rectangles indicating copy/duplicate
 */
export function CopyIcon({ size = 16, ...props }: CopyIconProps): ReactElement {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" {...props}>
			<title>Copy</title>
			<path
				fill="currentColor"
				d="M19 21H8V7h11m0-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2m-3-4H4a2 2 0 0 0-2 2v14h2V3h12V1Z"
			/>
		</svg>
	);
}
