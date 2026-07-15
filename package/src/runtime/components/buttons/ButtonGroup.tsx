import type { ReactElement, ReactNode } from "react";
import styles from "./index.module.css";

export interface ButtonGroupProps {
	children: ReactNode;
}

/**
 * Container for grouping multiple buttons with consistent spacing
 */
export function ButtonGroup({ children }: ButtonGroupProps): ReactElement {
	return <div className={styles.buttonGroup}>{children}</div>;
}
