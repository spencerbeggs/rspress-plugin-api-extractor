import type { ReactElement, SVGProps } from "react";

export interface WrapIconProps extends SVGProps<SVGSVGElement> {
	/** Icon size in pixels */
	size?: number;
}

/**
 * Wrap icon for text wrapping toggle buttons
 * Shows lines with an arrow indicating text will wrap
 */
export function WrapIcon({ size = 16, ...props }: WrapIconProps): ReactElement {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" {...props}>
			<title>Wrap</title>
			<path fill="currentColor" d="M16 7H3V5h13v2M3 19h13v-2H3v2m19-7l-4-3v2H3v2h15v2l4-3Z" />
		</svg>
	);
}
