import type { BlockType } from "./code-block-stats.js";
import type { DebugLogger, PrettierErrorSummary } from "./debug-logger.js";

/**
 * Individual Prettier error record
 */
interface PrettierError {
	file?: string; // Relative path from project root
	api?: string; // API/package name
	version?: string; // API version
	blockType?: BlockType; // Type of code block
	language: string; // Code fence language (ts, tsx, js, etc.)
	errorMessage: string; // Error message from Prettier
	errorLine?: number; // Line number where error occurred (if available)
	errorColumn?: number; // Column number where error occurred (if available)
	codeSnippet: string; // First 200 chars of code that caused error
}

/**
 * Error statistics by category
 */
interface ErrorStats {
	count: number;
	errors: PrettierError[];
}

/**
 * Options for PrettierErrorStatsCollector
 */
export interface PrettierErrorStatsCollectorOptions {
	/** Callback fired when an error is recorded */
	onError?: (data: {
		file?: string;
		language: string;
		errorMessage: string;
		location?: { line: number; column: number };
	}) => void;
}

/**
 * Aggregated statistics for Prettier formatting errors across all code blocks
 */
export class PrettierErrorStatsCollector {
	private errors: PrettierError[] = [];
	private currentContext?: { file?: string; api?: string; version?: string; blockType?: BlockType };
	private readonly onError?: PrettierErrorStatsCollectorOptions["onError"];

	constructor(options?: PrettierErrorStatsCollectorOptions) {
		this.onError = options?.onError;
	}

	// Track by language
	private languageStats = new Map<string, ErrorStats>();

	// Track by file
	private fileStats = new Map<string, ErrorStats>();

	// Track by API
	private apiStats = new Map<string, ErrorStats>();

	// Track by block type
	private blockTypeStats = new Map<BlockType, ErrorStats>();

	/**
	 * Set the current context for subsequent error recordings
	 * This should be called before processing each code block
	 */
	setContext(context?: { file?: string; api?: string; version?: string; blockType?: BlockType }): void {
		this.currentContext = context;
	}

	/**
	 * Clear the current context
	 * This should be called after processing each code block
	 */
	clearContext(): void {
		this.currentContext = undefined;
	}

	/**
	 * Record a Prettier formatting error
	 */
	recordError(error: unknown, code: string, language: string): void {
		const errorMsg = error instanceof Error ? error.message : String(error);

		// Try to extract line/column from Prettier error message
		// Format: "Unexpected token (line:column)" or similar
		const locationMatch = errorMsg.match(/\((\d+):(\d+)\)/);
		const errorLine = locationMatch ? Number.parseInt(locationMatch[1], 10) : undefined;
		const errorColumn = locationMatch ? Number.parseInt(locationMatch[2], 10) : undefined;

		const prettierError: PrettierError = {
			file: this.currentContext?.file,
			api: this.currentContext?.api,
			version: this.currentContext?.version,
			blockType: this.currentContext?.blockType,
			language,
			errorMessage: errorMsg,
			errorLine,
			errorColumn,
			codeSnippet: code.substring(0, 200).replace(/\n/g, " "),
		};

		this.errors.push(prettierError);

		// Track by language
		const langStats = this.languageStats.get(language) || { count: 0, errors: [] };
		langStats.count++;
		langStats.errors.push(prettierError);
		this.languageStats.set(language, langStats);

		// Track by file
		if (this.currentContext?.file) {
			const stats = this.fileStats.get(this.currentContext.file) || { count: 0, errors: [] };
			stats.count++;
			stats.errors.push(prettierError);
			this.fileStats.set(this.currentContext.file, stats);
		}

		// Track by API
		if (this.currentContext?.api) {
			const stats = this.apiStats.get(this.currentContext.api) || { count: 0, errors: [] };
			stats.count++;
			stats.errors.push(prettierError);
			this.apiStats.set(this.currentContext.api, stats);
		}

		// Track by block type
		if (this.currentContext?.blockType) {
			const stats = this.blockTypeStats.get(this.currentContext.blockType) || { count: 0, errors: [] };
			stats.count++;
			stats.errors.push(prettierError);
			this.blockTypeStats.set(this.currentContext.blockType, stats);
		}

		// Fire callback for error tracking
		this.onError?.({
			file: this.currentContext?.file,
			language,
			errorMessage: errorMsg,
			location:
				errorLine !== undefined && errorColumn !== undefined ? { line: errorLine, column: errorColumn } : undefined,
		});
	}

	/**
	 * Log individual error at debug level (structured JSON for LLM consumption)
	 */
	logError(logger: DebugLogger, error: unknown, code: string, language: string): void {
		const errorMsg = error instanceof Error ? error.message : String(error);

		// Extract location from error message
		const locationMatch = errorMsg.match(/\((\d+):(\d+)\)/);
		const line = locationMatch ? locationMatch[1] : "unknown";
		const column = locationMatch ? locationMatch[2] : "unknown";

		// Output structured JSON for LLM parsing
		const errorData = {
			message: errorMsg.replace(/\n/g, " ").trim().substring(0, 200),
			language,
			line,
			column,
			file: this.currentContext?.file || "unknown",
			api: this.currentContext?.api || "unknown",
			blockType: this.currentContext?.blockType || "unknown",
			codeSnippet: code.substring(0, 100).replace(/\n/g, " "),
		};

		logger.debug(`⚠️ Prettier error: ${JSON.stringify(errorData)}`);
	}

	/**
	 * Get total error count
	 */
	getTotalErrors(): number {
		return this.errors.length;
	}

	/**
	 * Check if there are any errors
	 */
	hasErrors(): boolean {
		return this.errors.length > 0;
	}

	/**
	 * Log summary statistics in afterBuild hook
	 */
	logSummary(logger: DebugLogger): void {
		if (this.errors.length === 0) {
			logger.verbose("✨ Prettier: All code blocks formatted successfully");
			return;
		}

		// INFO level: Brief summary
		logger.info(`⚠️ Prettier errors: ${this.errors.length} formatting error(s) in code blocks`);

		// VERBOSE level: Breakdown by language
		if (this.languageStats.size > 0) {
			logger.verbose("   By language:");
			// Sort by count descending
			const sortedLangs = Array.from(this.languageStats.entries()).sort((a, b) => b[1].count - a[1].count);
			for (const [lang, stats] of sortedLangs) {
				logger.verbose(`     - ${lang}: ${stats.count} error(s)`);
			}
		}

		// VERBOSE level: Breakdown by file
		if (this.fileStats.size > 0) {
			logger.verbose("   By file:");
			// Sort by count descending
			const sortedFiles = Array.from(this.fileStats.entries()).sort((a, b) => b[1].count - a[1].count);
			for (const [file, stats] of sortedFiles) {
				logger.verbose(`     - ${file}: ${stats.count} error(s)`);
			}
		}

		// VERBOSE level: Breakdown by API
		if (this.apiStats.size > 0) {
			logger.verbose("   By API:");
			// Sort by count descending
			const sortedApis = Array.from(this.apiStats.entries()).sort((a, b) => b[1].count - a[1].count);
			for (const [api, stats] of sortedApis) {
				logger.verbose(`     - ${api}: ${stats.count} error(s)`);
			}
		}

		// VERBOSE level: Breakdown by block type
		if (this.blockTypeStats.size > 0) {
			logger.verbose("   By block type:");
			const sortedTypes = Array.from(this.blockTypeStats.entries()).sort((a, b) => b[1].count - a[1].count);
			for (const [blockType, stats] of sortedTypes) {
				logger.verbose(`     - ${blockType}: ${stats.count} error(s)`);
			}
		}

		// DEBUG level: Detailed error list
		logger.debug("📊 Prettier error details:");
		logger.debug(`   Total errors: ${this.errors.length}`);
		logger.debug(`   Languages with errors: ${this.languageStats.size}`);
		logger.debug(`   Files with errors: ${this.fileStats.size}`);
		logger.debug(`   APIs with errors: ${this.apiStats.size}`);
		logger.debug(`   Block types with errors: ${this.blockTypeStats.size}`);

		// Show first 5 errors with details
		const errorsToShow = this.errors.slice(0, 5);
		logger.debug(`   First ${errorsToShow.length} error(s):`);
		for (const error of errorsToShow) {
			const location = error.file || "unknown file";
			const position = error.errorLine ? `line ${error.errorLine}` : "unknown position";
			logger.debug(`     - ${error.language} in ${location} at ${position}`);
			logger.debug(`       ${error.errorMessage.split("\n")[0].substring(0, 100)}`);
		}

		if (this.errors.length > 5) {
			logger.debug(`   ... and ${this.errors.length - 5} more error(s)`);
		}
	}

	/**
	 * Get summary statistics for structured logging.
	 */
	getSummary(): PrettierErrorSummary {
		// Build byLanguage map
		const byLanguage: Record<string, number> = {};
		for (const [language, stats] of this.languageStats.entries()) {
			byLanguage[language] = stats.count;
		}

		// Build byFile map
		const byFile: Record<string, number> = {};
		for (const [file, stats] of this.fileStats.entries()) {
			byFile[file] = stats.count;
		}

		return {
			total: this.errors.length,
			byLanguage: Object.keys(byLanguage).length > 0 ? byLanguage : undefined,
			byFile: Object.keys(byFile).length > 0 ? byFile : undefined,
		};
	}
}
