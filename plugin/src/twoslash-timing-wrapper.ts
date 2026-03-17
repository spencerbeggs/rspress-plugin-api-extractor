import type { ShikiTransformer } from "shiki";

/**
 * Wraps a Twoslash transformer to measure execution time
 */
export function createTwoslashTimingWrapper(
	twoslashTransformer: ShikiTransformer,
	onTiming: (duration: number) => void,
): ShikiTransformer {
	const wrapper: ShikiTransformer = {
		...twoslashTransformer,
		name: `${twoslashTransformer.name}-timing-wrapper`,
	};
	// Wrap the preprocess hook to measure timing
	if (twoslashTransformer.preprocess) {
		const originalPreprocess = twoslashTransformer.preprocess;
		wrapper.preprocess = function (
			code: string,
			options: Parameters<NonNullable<ShikiTransformer["preprocess"]>>[1],
		): string | undefined {
			const start = performance.now();
			const result = originalPreprocess.call(this, code, options);
			const duration = performance.now() - start;
			onTiming(duration);
			// Convert void to undefined for type compatibility
			return result ?? undefined;
		};
	}
	return wrapper;
}
