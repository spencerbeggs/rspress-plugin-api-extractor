import type { BlockType } from "./code-block-stats.js";
import type { DebugLogger, TwoslashErrorSummary } from "./debug-logger.js";

/**
 * Individual Twoslash error record
 */
interface TwoslashError {
	file?: string; // Relative path from project root
	api?: string; // API/package name
	version?: string; // API version/name
	blockType?: BlockType; // Type of code block
	errorMessage: string; // Error message from Twoslash
	errorCode?: string; // TypeScript error code (e.g., "2440")
	codeSnippet: string; // First 200 chars of code that caused error
	stack?: string; // Stack trace (first few lines)
}

/**
 * Error statistics by category
 */
interface ErrorStats {
	count: number;
	errors: TwoslashError[];
}

/**
 * Options for TwoslashErrorStatsCollector
 */
export interface TwoslashErrorStatsCollectorOptions {
	/** Callback fired when an error is recorded */
	onError?: (data: { file?: string; errorCode?: string; errorMessage: string; codeSnippet: string }) => void;
}

/**
 * Aggregated statistics for Twoslash errors across all code blocks
 */
export class TwoslashErrorStatsCollector {
	private errors: TwoslashError[] = [];
	private currentContext?: { file?: string; api?: string; version?: string; blockType?: BlockType };
	private readonly onError?: TwoslashErrorStatsCollectorOptions["onError"];

	constructor(options?: TwoslashErrorStatsCollectorOptions) {
		this.onError = options?.onError;
	}

	// Track by error code
	private errorCodeStats = new Map<string, ErrorStats>();

	// Track by file
	private fileStats = new Map<string, ErrorStats>();

	// Track by API
	private apiStats = new Map<string, ErrorStats>();

	// Track by API version (nested: api -> version -> stats)
	private versionStats = new Map<string, Map<string, ErrorStats>>();

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
	 * Record a Twoslash error (called from onTwoslashError callback)
	 */
	recordError(error: unknown, code: string): void {
		const errorMsg = error instanceof Error ? error.message : String(error);
		const stack = error instanceof Error ? error.stack : undefined;

		// Extract TypeScript error codes from the message (e.g., "2440", "2304")
		const errorCodeMatch = errorMsg.match(/\b(\d{4})\b/);
		const errorCode = errorCodeMatch?.[1];

		const twoslashError: TwoslashError = {
			file: this.currentContext?.file,
			api: this.currentContext?.api,
			version: this.currentContext?.version,
			blockType: this.currentContext?.blockType,
			errorMessage: errorMsg,
			errorCode,
			codeSnippet: code.substring(0, 200).replace(/\n/g, " "),
			stack: stack?.split("\n").slice(0, 3).join("\n"),
		};

		this.errors.push(twoslashError);

		// Track by error code
		if (errorCode) {
			const stats = this.errorCodeStats.get(errorCode) || { count: 0, errors: [] };
			stats.count++;
			stats.errors.push(twoslashError);
			this.errorCodeStats.set(errorCode, stats);
		}

		// Track by file
		if (this.currentContext?.file) {
			const stats = this.fileStats.get(this.currentContext.file) || { count: 0, errors: [] };
			stats.count++;
			stats.errors.push(twoslashError);
			this.fileStats.set(this.currentContext.file, stats);
		}

		// Track by API
		if (this.currentContext?.api) {
			const stats = this.apiStats.get(this.currentContext.api) || { count: 0, errors: [] };
			stats.count++;
			stats.errors.push(twoslashError);
			this.apiStats.set(this.currentContext.api, stats);
		}

		// Track by API version
		if (this.currentContext?.api && this.currentContext?.version) {
			const api = this.currentContext.api;
			const version = this.currentContext.version;

			// Get or create version map for this API
			let apiVersionMap = this.versionStats.get(api);
			if (!apiVersionMap) {
				apiVersionMap = new Map();
				this.versionStats.set(api, apiVersionMap);
			}

			// Get or create stats for this version
			const stats = apiVersionMap.get(version) || { count: 0, errors: [] };
			stats.count++;
			stats.errors.push(twoslashError);
			apiVersionMap.set(version, stats);
		}

		// Fire callback for error tracking
		this.onError?.({
			file: this.currentContext?.file,
			errorCode,
			errorMessage: errorMsg,
			codeSnippet: code.substring(0, 200).replace(/\n/g, " "),
		});
	}

	/**
	 * Log individual error at debug level (structured JSON for LLM consumption)
	 */
	logError(logger: DebugLogger, error: unknown, code: string): void {
		const errorMsg = error instanceof Error ? error.message : String(error);
		const stack = error instanceof Error ? error.stack : undefined;

		// Extract TypeScript error code from message
		const errorCodeMatch = errorMsg.match(/\b(\d{4})\b/);
		const errorCode = errorCodeMatch?.[1];

		// Output structured JSON for LLM parsing
		const errorData = {
			message: errorMsg.replace(/\n/g, " ").trim(),
			code: errorCode ? `TS${errorCode}` : "unknown",
			file: this.currentContext?.file || "unknown",
			api: this.currentContext?.api || "unknown",
			version: this.currentContext?.version || "unknown",
			codeSnippet: code.substring(0, 200).replace(/\n/g, " "),
			stack: stack?.split("\n").slice(0, 3).join(" | "),
		};

		logger.debug(`🔴 Twoslash error: ${JSON.stringify(errorData)}`);
	}

	/**
	 * Get total error count
	 */
	getTotalErrors(): number {
		return this.errors.length;
	}

	/**
	 * Log summary statistics in afterBuild hook
	 */
	logSummary(logger: DebugLogger): void {
		if (this.errors.length === 0) {
			return;
		}

		// INFO level: Brief summary
		logger.info(`🔴 Twoslash errors: ${this.errors.length} error(s) in code blocks`);

		// VERBOSE level: Breakdown by error code
		if (this.errorCodeStats.size > 0) {
			logger.verbose(`   By error code:`);
			// Sort by count descending
			const sortedCodes = Array.from(this.errorCodeStats.entries()).sort((a, b) => b[1].count - a[1].count);
			for (const [code, stats] of sortedCodes) {
				logger.verbose(`     - TS${code}: ${stats.count} occurrence(s)`);
			}
		}

		// VERBOSE level: Breakdown by file
		if (this.fileStats.size > 0) {
			logger.verbose(`   By file:`);
			// Sort by count descending
			const sortedFiles = Array.from(this.fileStats.entries()).sort((a, b) => b[1].count - a[1].count);
			for (const [file, stats] of sortedFiles) {
				logger.verbose(`     - ${file}: ${stats.count} error(s)`);
			}
		}

		// VERBOSE level: Breakdown by API
		if (this.apiStats.size > 0) {
			logger.verbose(`   By API:`);
			// Sort by count descending
			const sortedApis = Array.from(this.apiStats.entries()).sort((a, b) => b[1].count - a[1].count);
			for (const [api, stats] of sortedApis) {
				logger.verbose(`     - ${api}: ${stats.count} error(s)`);
			}
		}

		// VERBOSE level: Breakdown by API version
		if (this.versionStats.size > 0) {
			logger.verbose(`   By API version:`);
			// Sort APIs alphabetically for readability
			const sortedApiVersions = Array.from(this.versionStats.entries()).sort((a, b) => a[0].localeCompare(b[0]));
			for (const [api, versionMap] of sortedApiVersions) {
				logger.verbose(`     - ${api}:`);
				// Sort versions by count descending
				const sortedVersions = Array.from(versionMap.entries()).sort((a, b) => b[1].count - a[1].count);
				for (const [version, stats] of sortedVersions) {
					logger.verbose(`       • ${version}: ${stats.count} error(s)`);
				}
			}
		}

		// DEBUG level: Detailed error list
		logger.debug(`📊 Twoslash error details:`);
		logger.debug(`   Total errors: ${this.errors.length}`);
		logger.debug(`   Unique error codes: ${this.errorCodeStats.size}`);
		logger.debug(`   Files with errors: ${this.fileStats.size}`);
		logger.debug(`   APIs with errors: ${this.apiStats.size}`);
		logger.debug(`   API versions with errors: ${this.versionStats.size}`);

		// Show first 5 errors with details
		const errorsToShow = this.errors.slice(0, 5);
		logger.debug(`   First ${errorsToShow.length} error(s):`);
		for (const error of errorsToShow) {
			const location = error.file || "unknown file";
			const errorCode = error.errorCode ? `TS${error.errorCode}` : "unknown code";
			logger.debug(`     - ${errorCode} in ${location}`);
			logger.debug(`       ${error.errorMessage.split("\n")[0]}`);
		}

		if (this.errors.length > 5) {
			logger.debug(`   ... and ${this.errors.length - 5} more error(s)`);
		}
	}

	/**
	 * Get summary statistics for structured logging.
	 */
	getSummary(): TwoslashErrorSummary {
		// Build byCode map
		const byCode: Record<string, number> = {};
		for (const [code, stats] of this.errorCodeStats.entries()) {
			byCode[code] = stats.count;
		}

		// Build byFile map
		const byFile: Record<string, number> = {};
		for (const [file, stats] of this.fileStats.entries()) {
			byFile[file] = stats.count;
		}

		return {
			total: this.errors.length,
			byCode: Object.keys(byCode).length > 0 ? byCode : undefined,
			byFile: Object.keys(byFile).length > 0 ? byFile : undefined,
		};
	}
}
