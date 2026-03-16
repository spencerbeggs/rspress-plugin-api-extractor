import type { DebugLogger, FileStatsSummary } from "./debug-logger.js";

/**
 * Status of a generated file
 */
export type FileStatus = "new" | "unchanged" | "modified";

/**
 * Individual file generation record
 */
interface FileGeneration {
	relativePath: string; // e.g., "class/claudebinaryplugin.mdx"
	fullPath: string; // e.g., "docs/en/claude-binary-plugin/api/class/claudebinaryplugin.mdx"
	status: FileStatus;
	category?: string; // e.g., "class", "interface", "type"
	api?: string; // e.g., "claude-binary-plugin"
	version?: string; // e.g., "Claude Binary Plugin SDK" or undefined
}

/**
 * Statistics for a group of files
 */
interface FileStats {
	total: number;
	new: number;
	unchanged: number;
	modified: number;
}

/**
 * Aggregated statistics for file generation across all APIs
 */
export class FileGenerationStatsCollector {
	private files: FileGeneration[] = [];
	private stats: FileStats = {
		total: 0,
		new: 0,
		unchanged: 0,
		modified: 0,
	};

	// Track by API for breakdown
	private apiStats = new Map<string, FileStats>();

	// Track by category for breakdown
	private categoryStats = new Map<string, FileStats>();

	/**
	 * Record a generated file
	 */
	recordFile(
		relativePath: string,
		fullPath: string,
		status: FileStatus,
		context?: { category?: string; api?: string; version?: string },
	): void {
		this.files.push({
			relativePath,
			fullPath,
			status,
			category: context?.category,
			api: context?.api,
			version: context?.version,
		});

		this.stats.total++;
		this.stats[status]++;

		// Track by API
		if (context?.api) {
			const apiKey = context.version ? `${context.api} (${context.version})` : context.api;
			const stat = this.apiStats.get(apiKey) || { new: 0, unchanged: 0, modified: 0, total: 0 };
			stat[status]++;
			stat.total++;
			this.apiStats.set(apiKey, stat);
		}

		// Track by category
		if (context?.category) {
			const stat = this.categoryStats.get(context.category) || { new: 0, unchanged: 0, modified: 0, total: 0 };
			stat[status]++;
			stat.total++;
			this.categoryStats.set(context.category, stat);
		}
	}

	/**
	 * Log individual file at debug level only
	 */
	logFile(logger: DebugLogger, relativePath: string, status: FileStatus): void {
		const icon = status === "new" ? "📄" : status === "unchanged" ? "✓" : "✏️";
		const statusText = status.toUpperCase();
		logger.debug(`${icon} ${statusText}: ${relativePath}`);
	}

	/**
	 * Log summary statistics in afterBuild hook
	 */
	logSummary(logger: DebugLogger): void {
		if (this.stats.total === 0) {
			return;
		}

		const changes = this.stats.new + this.stats.modified;

		// INFO level: Brief summary
		if (changes > 0) {
			logger.info(
				`📝 Generated ${this.stats.total} files (${changes} new/modified, ${this.stats.unchanged} unchanged)`,
			);
		} else {
			logger.info(`📝 Generated ${this.stats.total} files (all unchanged)`);
		}

		// VERBOSE level: Breakdown by API
		if (this.apiStats.size > 0) {
			logger.verbose(`   By API:`);
			for (const [api, stats] of this.apiStats.entries()) {
				const apiChanges = stats.new + stats.modified;
				logger.verbose(
					`     - ${api}: ${stats.total} files (${apiChanges} new/modified, ${stats.unchanged} unchanged)`,
				);
			}
		}

		// VERBOSE level: Breakdown by category
		if (this.categoryStats.size > 0) {
			logger.verbose(`   By category:`);
			// Sort categories by name for consistent output
			const sortedCategories = Array.from(this.categoryStats.entries()).sort((a, b) => a[0].localeCompare(b[0]));
			for (const [category, stats] of sortedCategories) {
				const catChanges = stats.new + stats.modified;
				logger.verbose(
					`     - ${category}: ${stats.total} files (${catChanges} new/modified, ${stats.unchanged} unchanged)`,
				);
			}
		}

		// DEBUG level: Detailed statistics
		logger.debug(`📊 File generation statistics:`);
		logger.debug(`   Total files: ${this.stats.total}`);
		logger.debug(`   New: ${this.stats.new}`);
		logger.debug(`   Modified: ${this.stats.modified}`);
		logger.debug(`   Unchanged: ${this.stats.unchanged}`);
		logger.debug(`   Change rate: ${((changes / this.stats.total) * 100).toFixed(1)}%`);
	}

	/**
	 * Get summary statistics for structured logging.
	 */
	getSummary(): FileStatsSummary {
		// Build byCategory map
		const byCategory: Record<string, number> = {};
		for (const [category, stats] of this.categoryStats.entries()) {
			byCategory[category] = stats.total;
		}

		return {
			total: this.stats.total,
			new: this.stats.new,
			modified: this.stats.modified,
			unchanged: this.stats.unchanged,
			byCategory: Object.keys(byCategory).length > 0 ? byCategory : undefined,
		};
	}
}
