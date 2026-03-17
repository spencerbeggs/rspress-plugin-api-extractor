/* v8 ignore start -- React hook, requires React test environment */
import { useState } from "react";

export interface UseWrapToggleReturn {
	/** Whether wrapping is currently enabled */
	wrapped: boolean;
	/** Toggle the wrapped state */
	toggleWrap: () => void;
}

/**
 * Hook for managing code/signature wrapping state
 * Provides a boolean state and toggle function
 *
 * @returns Object with wrapped state and toggleWrap function
 *
 * @example
 * ```tsx
 * const { wrapped, toggleWrap } = useWrapToggle();
 *
 * return (
 *   <div>
 *     <button onClick={toggleWrap}>Toggle Wrap</button>
 *     <pre className={wrapped ? 'wrapped' : ''}>...</pre>
 *   </div>
 * );
 * ```
 */
export function useWrapToggle(): UseWrapToggleReturn {
	const [wrapped, setWrapped] = useState(false);

	const toggleWrap = (): void => {
		setWrapped(!wrapped);
	};

	return { wrapped, toggleWrap };
}
