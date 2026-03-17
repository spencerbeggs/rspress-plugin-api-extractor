import { Effect, Metric } from "effect";
import { format } from "prettier";
import { addLogicalBlankLines } from "./code-post-processor.js";
import type { DebugLogger } from "./debug-logger.js";
import { BuildMetrics } from "./layers/ObservabilityLive.js";

/**
 * Map code fence languages to Prettier parsers
 */
const LANGUAGE_TO_PARSER: Record<string, string> = {
	typescript: "typescript",
	ts: "typescript",
	tsx: "typescript",
	javascript: "babel",
	js: "babel",
	jsx: "babel",
	node: "babel",
};

/**
 * Default Prettier options for consistent formatting
 */
const PRETTIER_OPTIONS = {
	printWidth: 80,
	tabWidth: 2,
	useTabs: false,
	semi: true,
	singleQuote: false,
	trailingComma: "es5" as const,
	bracketSpacing: true,
	arrowParens: "always" as const,
};

/**
 * Result of formatting code with Prettier
 */
export interface FormatResult {
	/** The formatted code (or original if formatting failed) */
	code: string;
	/** Whether formatting was successful */
	success: boolean;
	/** Error message if formatting failed */
	error?: string;
	/** Time taken to format in milliseconds */
	formatTime: number;
}

/**
 * Format code using Prettier
 *
 * @param code - The code to format
 * @param language - The code fence language (e.g., "typescript", "ts", "js")
 * @param logger - Optional logger for debug output
 * @returns FormatResult with formatted code and metadata
 */
export async function formatCode(code: string, language: string, logger?: DebugLogger): Promise<FormatResult> {
	const start = performance.now();

	// Get the appropriate parser for the language
	const parser = LANGUAGE_TO_PARSER[language.toLowerCase()];
	if (!parser) {
		// Unsupported language, return original code
		return {
			code,
			success: true, // Not an error, just unsupported
			formatTime: performance.now() - start,
		};
	}

	try {
		const formatted = await format(code, {
			...PRETTIER_OPTIONS,
			parser,
		});

		const formatTime = performance.now() - start;
		const postProcessed = addLogicalBlankLines(formatted.trim());

		logger?.debug(`✨ Prettier formatted ${code.length} chars in ${formatTime.toFixed(1)}ms`);

		return {
			code: postProcessed,
			success: true,
			formatTime,
		};
	} catch (error) {
		const formatTime = performance.now() - start;
		const errorMsg = error instanceof Error ? error.message : String(error);

		// Increment Prettier error counter
		Effect.runSync(Metric.increment(BuildMetrics.prettierErrors));

		logger?.debug(`⚠️ Prettier error: ${errorMsg.split("\n")[0]}`);

		// Return original code on error (fallthrough behavior)
		return {
			code,
			success: false,
			error: errorMsg,
			formatTime,
		};
	}
}

/**
 * Check if a language is supported for Prettier formatting
 */
export function isPrettierSupported(language: string): boolean {
	return language.toLowerCase() in LANGUAGE_TO_PARSER;
}

/**
 * Get the Prettier parser for a language
 */
export function getPrettierParser(language: string): string | undefined {
	return LANGUAGE_TO_PARSER[language.toLowerCase()];
}
