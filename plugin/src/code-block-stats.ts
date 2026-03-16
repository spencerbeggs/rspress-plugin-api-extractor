import type { CodeBlockStatsSummary, DebugLogger } from "./debug-logger.js";

/**
 * Type of code block being processed
 */
export type BlockType = "signature" | "member-signature" | "example" | "vfs" | "with-api";

/**
 * Individual code block processing statistics
 */
interface BlockStat {
	time: number;
	shikiTime: number;
	twoslashTime?: number;
	chars: number;
	file?: string;
	api?: string;
	version?: string;
	blockType?: BlockType;
}

/**
 * Options for CodeBlockStatsCollector
 */
export interface CodeBlockStatsCollectorOptions {
	/** Time threshold (in ms) to consider a block "slow" (default: 100ms) */
	slowThreshold?: number;
	/** Callback fired when a slow block is detected */
	onSlowBlock?: (data: { blockType: string; durationMs: number; file?: string; thresholdMs: number }) => void;
}

/**
 * Aggregated statistics for code block processing across all files
 */
export class CodeBlockStatsCollector {
	private totalBlocks = 0;
	private twoslashBlocks = 0; // Track blocks that actually used Twoslash
	private slowBlocks = 0;
	private totalTime = 0;
	private shikiTime = 0;
	private twoslashTime = 0;
	private slowestTime = 0;
	private fastestTime = Number.POSITIVE_INFINITY;
	private slowBlockDetails: BlockStat[] = [];
	// Track stats by block type
	private blockTypeStats = new Map<
		BlockType,
		{ count: number; twoslashCount: number; totalTime: number; shikiTime: number; twoslashTime: number }
	>();
	private readonly slowThreshold: number;
	private readonly onSlowBlock?: CodeBlockStatsCollectorOptions["onSlowBlock"];

	/**
	 * @param options - Options or slow threshold (backwards compatible)
	 */
	constructor(options?: number | CodeBlockStatsCollectorOptions) {
		if (typeof options === "number") {
			// Backwards compatible: number is slowThreshold
			this.slowThreshold = options;
		} else {
			this.slowThreshold = options?.slowThreshold ?? 100;
			this.onSlowBlock = options?.onSlowBlock;
		}
	}

	/**
	 * Record statistics for a processed code block
	 */
	recordBlock(
		time: number,
		shikiTime: number,
		chars: number,
		context?: {
			file?: string;
			api?: string;
			version?: string;
			blockType?: BlockType;
			twoslashTime?: number;
		},
	): void {
		this.totalBlocks++;
		this.totalTime += time;
		this.shikiTime += shikiTime;
		if (context?.twoslashTime) {
			this.twoslashBlocks++;
			this.twoslashTime += context.twoslashTime;
		}
		this.slowestTime = Math.max(this.slowestTime, time);
		this.fastestTime = Math.min(this.fastestTime, time);

		// Track stats by block type
		if (context?.blockType) {
			const stats = this.blockTypeStats.get(context.blockType) || {
				count: 0,
				twoslashCount: 0,
				totalTime: 0,
				shikiTime: 0,
				twoslashTime: 0,
			};
			stats.count++;
			stats.totalTime += time;
			stats.shikiTime += shikiTime;
			if (context.twoslashTime) {
				stats.twoslashCount++;
				stats.twoslashTime += context.twoslashTime;
			}
			this.blockTypeStats.set(context.blockType, stats);
		}

		// Track slow blocks (>slowThreshold)
		if (time > this.slowThreshold) {
			this.slowBlocks++;
			this.slowBlockDetails.push({
				time,
				shikiTime,
				twoslashTime: context?.twoslashTime,
				chars,
				file: context?.file,
				api: context?.api,
				version: context?.version,
				blockType: context?.blockType,
			});

			// Fire callback for slow blocks
			this.onSlowBlock?.({
				blockType: context?.blockType || "unknown",
				durationMs: time,
				file: context?.file,
				thresholdMs: this.slowThreshold,
			});
		}
	}

	/**
	 * Log inline message for a slow block at debug level
	 */
	logSlowBlock(
		logger: DebugLogger,
		time: number,
		shikiTime: number,
		chars: number,
		context?: {
			file?: string;
			api?: string;
			version?: string;
			blockType?: BlockType;
			twoslashTime?: number;
		},
	): void {
		const blockTypeStr = context?.blockType ? `[${context.blockType}] ` : "";
		const contextStr = this.formatContext(context);
		const twoslashStr = context?.twoslashTime ? `, twoslash: ${context.twoslashTime.toFixed(0)}ms` : "";
		logger.debug(
			`⏱️  Slow ${blockTypeStr}${contextStr}: ${time.toFixed(0)}ms (shiki: ${shikiTime.toFixed(0)}ms${twoslashStr}, ${chars} chars)`,
		);
	}

	/**
	 * Log summary statistics at the end of the build
	 */
	logSummary(logger: DebugLogger): void {
		if (this.totalBlocks === 0) {
			return;
		}

		const avgTime = this.totalTime / this.totalBlocks;
		const avgShikiTime = this.shikiTime / this.totalBlocks;
		// Only calculate Twoslash average for blocks that actually used Twoslash
		const avgTwoslashTime = this.twoslashBlocks > 0 ? this.twoslashTime / this.twoslashBlocks : 0;

		// INFO level: Only show if there were slow blocks
		if (this.slowBlocks > 0) {
			const slowPercent = ((this.slowBlocks / this.totalBlocks) * 100).toFixed(1);
			logger.info(
				`⚠️  Code block performance: ${this.slowBlocks} of ${this.totalBlocks} blocks were slow (${slowPercent}%, >${this.slowThreshold}ms)`,
			);
		}

		// VERBOSE level: Show summary statistics
		logger.verbose(`✨ Processed ${this.totalBlocks} total code blocks across all API documentation`);
		if (this.slowBlocks > 0) {
			logger.verbose(`   ⚠️  ${this.slowBlocks} slow blocks (>${this.slowThreshold}ms)`);
		}
		logger.verbose(`   ⏱️  Average: ${avgTime.toFixed(0)}ms per block`);

		// Show block type breakdown at verbose level
		if (this.blockTypeStats.size > 0) {
			logger.verbose(`   By block type:`);
			for (const [blockType, stats] of this.blockTypeStats.entries()) {
				const avgTypeTime = stats.count > 0 ? stats.totalTime / stats.count : 0;
				// Only calculate Twoslash average for blocks that actually used Twoslash
				const avgTypeTwoslash = stats.twoslashCount > 0 ? stats.twoslashTime / stats.twoslashCount : 0;
				const twoslashStr = avgTypeTwoslash > 0 ? `, twoslash ${avgTypeTwoslash.toFixed(0)}ms` : "";
				logger.verbose(`     - ${blockType}: ${stats.count} blocks, avg ${avgTypeTime.toFixed(0)}ms${twoslashStr}`);
			}
		}

		// DEBUG level: Show detailed breakdown
		logger.debug(`📊 Code block processing statistics (all files):`);
		logger.debug(`   Total blocks: ${this.totalBlocks}`);
		if (this.twoslashBlocks > 0) {
			logger.debug(
				`   Twoslash blocks: ${this.twoslashBlocks} (${((this.twoslashBlocks / this.totalBlocks) * 100).toFixed(1)}%)`,
			);
		}
		logger.debug(`   Total time: ${this.totalTime.toFixed(0)}ms`);
		logger.debug(`   Average time: ${avgTime.toFixed(0)}ms per block`);
		logger.debug(`   Average Shiki time: ${avgShikiTime.toFixed(0)}ms per block`);
		if (avgTwoslashTime > 0) {
			logger.debug(
				`   Average Twoslash time: ${avgTwoslashTime.toFixed(0)}ms per block (${this.twoslashBlocks} blocks)`,
			);
		}
		logger.debug(`   Slowest block: ${this.slowestTime.toFixed(0)}ms`);
		logger.debug(`   Fastest block: ${this.fastestTime.toFixed(0)}ms`);

		if (this.slowBlocks > 0) {
			logger.debug(`   Slow blocks: ${this.slowBlocks} (${((this.slowBlocks / this.totalBlocks) * 100).toFixed(1)}%)`);

			// Show top 10 slowest blocks
			const topSlow = this.slowBlockDetails.sort((a, b) => b.time - a.time).slice(0, 10);
			logger.debug(`   Top ${topSlow.length} slowest blocks:`);
			for (const block of topSlow) {
				const blockTypeStr = block.blockType ? `[${block.blockType}] ` : "";
				const contextStr = this.formatContext(block);
				logger.debug(
					`     - ${block.time.toFixed(0)}ms (shiki: ${block.shikiTime.toFixed(0)}ms, ${block.chars} chars) ${blockTypeStr}${contextStr}`,
				);
			}
		}
	}

	/**
	 * Format context string for logging
	 */
	private formatContext(context?: { file?: string; api?: string; version?: string }): string {
		if (!context) {
			return "";
		}

		// File path is already relative from project root, so just show it
		if (context.file) {
			return ` ${context.file}`;
		}

		// Fallback to api/version if file is not available
		const parts: string[] = [];
		if (context.api) {
			parts.push(context.api);
		}
		if (context.version) {
			parts.push(context.version);
		}

		return parts.length > 0 ? ` [${parts.join("/")}]` : "";
	}

	/**
	 * Get summary statistics for structured logging.
	 */
	getSummary(): CodeBlockStatsSummary {
		const avgTimeMs = this.totalBlocks > 0 ? this.totalTime / this.totalBlocks : 0;

		// Build byType map
		const byType: Record<string, { count: number; avgMs: number }> = {};
		for (const [blockType, stats] of this.blockTypeStats.entries()) {
			byType[blockType] = {
				count: stats.count,
				avgMs: stats.count > 0 ? stats.totalTime / stats.count : 0,
			};
		}

		return {
			total: this.totalBlocks,
			slow: this.slowBlocks,
			avgTimeMs,
			byType,
			slowestMs: this.slowestTime === 0 ? 0 : this.slowestTime,
			fastestMs: this.fastestTime === Number.POSITIVE_INFINITY ? 0 : this.fastestTime,
		};
	}
}
