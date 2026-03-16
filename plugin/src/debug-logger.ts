import fs from "node:fs";
import path from "node:path";
import type { BuildEvent, BuildEventSeverity } from "./build-events.js";
import {
	BuildEventMetadata,
	BuildEventSchema,
	createApiModelLoaded,
	createBuildComplete,
	createBuildError,
	createBuildStart,
	createCategoryGenerationComplete,
	createCategoryGenerationStart,
	createCodeBlockSlow,
	createComponentPropsGenerated,
	createExternalMessage,
	createExternalPackagesLoaded,
	createFileStatus,
	createLogMessage,
	createMDXValidationWarning,
	createMDXWriteComplete,
	createPageGenerationStart,
	createPrettierError,
	createSerializationDebug,
	createShikiHastGenerated,
	createShikiInitComplete,
	createStatsCodeBlockSummary,
	createStatsErrorSummary,
	createStatsFileSummary,
	createTimerComplete,
	createTwoslashError,
	createTwoslashInitComplete,
	createVfsGenerated,
	createVfsMerged,
} from "./build-events.js";
import type { LogLevel } from "./types.js";

/**
 * Configuration for DebugLogger.
 */
export interface DebugLoggerConfig {
	/** Log level: none, info, verbose, debug */
	logLevel?: LogLevel;
	/** Path to JSONL file for structured debug events */
	logFile?: string;
	/** Unique build identifier for correlation */
	buildId?: string;
	/** Custom event handler callback */
	onEvent?: (event: BuildEvent) => void;
}

/**
 * Summary data for file generation statistics.
 */
export interface FileStatsSummary {
	total: number;
	new: number;
	modified: number;
	unchanged: number;
	byCategory?: Record<string, number>;
}

/**
 * Summary data for code block statistics.
 */
export interface CodeBlockStatsSummary {
	total: number;
	slow: number;
	avgTimeMs: number;
	byType: Record<string, { count: number; avgMs: number }>;
	slowestMs: number;
	fastestMs: number;
}

/**
 * Summary data for Twoslash errors.
 */
export interface TwoslashErrorSummary {
	total: number;
	byCode?: Record<string, number>;
	byFile?: Record<string, number>;
}

/**
 * Summary data for Prettier errors.
 */
export interface PrettierErrorSummary {
	total: number;
	byLanguage?: Record<string, number>;
	byFile?: Record<string, number>;
}

/**
 * Timer for tracking operation duration.
 * Created via DebugLogger.startTimer() and ended via Timer.end().
 */
export class Timer {
	private startTime: number;
	private ended = false;

	constructor(
		private logger: DebugLogger,
		private operation: string,
		private context?: Record<string, unknown>,
	) {
		this.startTime = performance.now();
	}

	/**
	 * End the timer and emit a timer.complete event.
	 * @param additionalContext - Optional additional context to merge
	 * @returns Elapsed time in milliseconds
	 */
	end(additionalContext?: Record<string, unknown>): number {
		if (this.ended) {
			return 0;
		}
		this.ended = true;
		const elapsed = performance.now() - this.startTime;

		this.logger.timerComplete({
			operation: this.operation,
			durationMs: elapsed,
			context: { ...this.context, ...additionalContext },
		});

		return elapsed;
	}

	/**
	 * Get elapsed time without ending the timer.
	 * @returns Elapsed time in milliseconds
	 */
	elapsed(): number {
		return performance.now() - this.startTime;
	}
}

/**
 * Structured debug logger for API documentation generation.
 *
 * All logging flows through Zod-validated build events.
 * In debug mode, outputs raw JSON (one line per event).
 * In info/verbose mode, outputs human-readable formatted messages.
 *
 * @example Basic usage
 * ```ts
 * const debugLogger = new DebugLogger({
 *   logLevel: "debug",
 *   logFile: ".rspress/debug-events.jsonl",
 * });
 *
 * debugLogger.info("Starting build...");
 * debugLogger.pageGenerationStart({
 *   file: "class/MyClass.mdx",
 *   apiItemType: "Class",
 *   memberCount: 15,
 *   category: "class",
 * });
 *
 * debugLogger.close(); // Flush and close file stream
 * ```
 */
export class DebugLogger {
	private fileStream: fs.WriteStream | null = null;
	private readonly buildId: string;
	private readonly logLevel: LogLevel;
	private groupDepth = 0;

	constructor(private readonly config: DebugLoggerConfig = {}) {
		this.logLevel = config.logLevel ?? "info";
		this.buildId = config.buildId ?? `build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

		if (config.logFile) {
			const logDir = path.dirname(config.logFile);
			fs.mkdirSync(logDir, { recursive: true });
			// Overwrite the file each build (flags: "w")
			this.fileStream = fs.createWriteStream(config.logFile, { flags: "w" });
		}
	}

	/**
	 * Get the build ID for this debug session.
	 */
	getBuildId(): string {
		return this.buildId;
	}

	/**
	 * Get the current log level.
	 */
	getLevel(): LogLevel {
		return this.logLevel;
	}

	/**
	 * Check if the logger is completely silent.
	 */
	isSilent(): boolean {
		return this.logLevel === "none";
	}

	/**
	 * Check if info-level logging is enabled.
	 */
	isInfo(): boolean {
		return this.shouldLog("info");
	}

	/**
	 * Check if verbose-level logging is enabled.
	 */
	isVerbose(): boolean {
		return this.shouldLog("verbose");
	}

	/**
	 * Check if debug-level logging is enabled.
	 */
	isDebug(): boolean {
		return this.shouldLog("debug");
	}

	/**
	 * Check if a log level is enabled.
	 */
	private shouldLog(targetLevel: Exclude<LogLevel, "none">): boolean {
		if (this.logLevel === "none") {
			return false;
		}
		if (this.logLevel === "debug") {
			return true;
		}
		if (this.logLevel === "verbose") {
			return targetLevel !== "debug";
		}
		// info level
		return targetLevel === "info";
	}

	/**
	 * Map event severity to log level.
	 */
	private severityToLogLevel(severity: BuildEventSeverity): Exclude<LogLevel, "none"> {
		switch (severity) {
			case "error":
			case "warning":
				return "info"; // Always show errors and warnings at info level
			case "info":
				return "info";
			case "debug":
				return "debug";
		}
	}

	/**
	 * Emit a validated build event.
	 */
	private emit(event: BuildEvent): void {
		const eventWithBuildId = { ...event, buildId: this.buildId };
		// Validate the event
		BuildEventSchema.parse(eventWithBuildId);

		// Write JSONL to file
		if (this.fileStream) {
			this.fileStream.write(`${JSON.stringify(eventWithBuildId)}\n`);
		}

		// Determine effective log level for filtering
		// Special cases: log.message uses data.level, timer.complete uses verbose
		let logLevel: Exclude<LogLevel, "none">;
		if (event.event === "log.message" && "level" in event.data) {
			// log.message uses data.level directly (map "warn" to info for display)
			const level = event.data.level as string;
			logLevel = level === "warn" || level === "error" ? "info" : (level as Exclude<LogLevel, "none">);
		} else if (event.event === "timer.complete") {
			// Timers are shown at verbose level
			logLevel = "verbose";
		} else {
			// Use metadata severity mapped to log level
			const metadata = BuildEventMetadata[event.event as keyof typeof BuildEventMetadata];
			const severity = metadata?.severity ?? "info";
			logLevel = this.severityToLogLevel(severity);
		}

		// Console output based on log level
		if (this.shouldLog(logLevel)) {
			if (this.logLevel === "debug") {
				// Debug mode: output raw JSON (same as JSONL)
				console.log(JSON.stringify(eventWithBuildId));
			} else {
				// Info/verbose mode: output human-readable formatted message
				this.consoleOutput(eventWithBuildId);
			}
		}

		// Custom handler
		this.config.onEvent?.(eventWithBuildId);
	}

	/**
	 * Format a duration in milliseconds for display.
	 */
	private formatDuration(ms: number): string {
		if (ms < 1000) {
			return `${ms.toFixed(0)}ms`;
		}
		return `${(ms / 1000).toFixed(2)}s`;
	}

	/**
	 * Get indentation based on group depth.
	 */
	private getIndent(): string {
		return "  ".repeat(this.groupDepth);
	}

	/**
	 * Output human-readable log based on event type.
	 */
	private consoleOutput(event: BuildEvent): void {
		const time = new Date(event.timestamp).toISOString().slice(11, 23);
		const prefix = `[${time}]`;
		const indent = this.getIndent();

		switch (event.event) {
			// Build lifecycle
			case "build.start":
				console.log(
					`${indent}${prefix} 🚀 Build started: ${event.data.apiCount} APIs, ${event.data.externalPackageCount} external packages`,
				);
				break;
			case "build.complete":
				console.log(
					`${indent}${prefix} ✅ Build complete: ${event.data.summary.files} files, ${event.data.summary.pages} pages (${this.formatDuration(event.data.durationMs)})`,
				);
				break;

			// Loading
			case "api.model.loaded":
				console.log(
					`${indent}${prefix} 📦 API loaded: ${event.data.apiName}${event.data.version ? `@${event.data.version}` : ""} (${event.data.itemCount} items, ${this.formatDuration(event.data.durationMs)})`,
				);
				break;
			case "vfs.generated":
				console.log(
					`${indent}${prefix} 📁 VFS: ${event.data.packageName} (${event.data.fileCount} files, ${this.formatDuration(event.data.durationMs)})`,
				);
				break;
			case "external.packages.loaded":
				console.log(
					`${indent}${prefix} 📦 External packages: ${event.data.loaded.length} loaded, ${event.data.failed.length} failed (${this.formatDuration(event.data.durationMs)})`,
				);
				break;
			case "vfs.merged":
				console.log(
					`${indent}${prefix} 📁 VFS merged: ${event.data.packageCount} packages, ${event.data.totalFiles} files (${this.formatDuration(event.data.durationMs)})`,
				);
				break;

			// Initialization
			case "shiki.init.complete":
				console.log(
					`${indent}${prefix} 🎨 Shiki: ${event.data.themes.length} themes, ${event.data.languages.length} langs (${this.formatDuration(event.data.durationMs)})`,
				);
				break;
			case "twoslash.init.complete":
				console.log(
					`${indent}${prefix} 🔧 Twoslash: ${event.data.packageCount} packages, ${event.data.vfsFileCount} files (${this.formatDuration(event.data.durationMs)})`,
				);
				break;

			// Category generation
			case "category.generation.start":
				console.log(`${indent}${prefix} 📂 Category start: ${event.data.category} (${event.data.itemCount} items)`);
				break;
			case "category.generation.complete":
				console.log(
					`${indent}${prefix} 📂 Category done: ${event.data.category} (${event.data.pageCount} pages, ${this.formatDuration(event.data.durationMs)})`,
				);
				break;

			// Page generation
			case "page.generation.start":
				console.log(
					`${indent}${prefix} 📝 Page: ${event.data.apiName ? `${event.data.apiName}/` : ""}${event.data.file} (${event.data.apiItemType}, ${event.data.memberCount} members)`,
				);
				break;
			case "shiki.hast.generated":
				console.log(
					`${indent}${prefix} 🌳 HAST: ${event.data.blockType} (${event.data.nodeCount} nodes, depth ${event.data.maxDepth}, ${this.formatDuration(event.data.durationMs)})`,
				);
				break;
			case "component.props.generated":
				console.log(`${indent}${prefix} ⚙️  Props: ${event.data.componentName} (${event.data.serializedSize} bytes)`);
				break;
			case "serialization.debug":
				console.log(`${indent}${prefix} 📦 Serialize: ${event.data.target} (${event.data.serializedSize} bytes)`);
				if (event.data.containsProblematicChars) {
					console.warn(`${indent}   ⚠️  Problematic chars: ${event.data.problematicCharsPreview}`);
				}
				break;
			case "mdx.write.complete": {
				const statusIcon = event.data.status === "new" ? "📄" : event.data.status === "modified" ? "✏️" : "✓";
				console.log(
					`${indent}${prefix} ${statusIcon} ${event.data.status.toUpperCase()} ${path.basename(event.data.filePath)} (${event.data.byteSize} bytes)`,
				);
				break;
			}

			// File status
			case "file.status": {
				const icon = event.data.status === "new" ? "📄" : event.data.status === "modified" ? "✏️" : "✓";
				const apiPrefix = event.data.apiName ? `${event.data.apiName}/` : "";
				console.log(`${indent}${prefix} ${icon} ${event.data.status.toUpperCase()}: ${apiPrefix}${event.data.file}`);
				break;
			}

			// Timer
			case "timer.complete":
				console.log(`${indent}${prefix} ⏱  ${event.data.operation}: ${this.formatDuration(event.data.durationMs)}`);
				break;

			// External messages
			case "external.message":
				console.log(`${indent}${prefix} 🔌 [${event.data.source}] ${event.data.message}`);
				break;

			// Log messages
			case "log.message": {
				const levelIcon =
					event.data.level === "error"
						? "❌"
						: event.data.level === "warn"
							? "⚠️"
							: event.data.level === "info"
								? "ℹ️"
								: event.data.level === "verbose"
									? "📢"
									: "🐛";
				console.log(`${indent}${prefix} ${levelIcon} ${event.data.message}`);
				break;
			}

			// Performance
			case "code.block.slow":
				console.warn(
					`${indent}${prefix} ⚠️  Slow block: ${event.data.blockType} (${this.formatDuration(event.data.durationMs)} > ${this.formatDuration(event.data.thresholdMs)})${event.data.file ? ` in ${event.data.file}` : ""}`,
				);
				break;

			// Errors
			case "build.error":
				console.error(`${indent}${prefix} ❌ [${event.data.phase}] ${event.data.errorMessage}`);
				break;
			case "twoslash.error":
				console.warn(
					`${indent}${prefix} ⚠️  Twoslash: ${event.data.errorCode || "unknown"} in ${event.data.file || "unknown"}`,
				);
				break;
			case "prettier.error":
				console.warn(
					`${indent}${prefix} ⚠️  Prettier: ${event.data.language} in ${event.data.file || "unknown"}${event.data.location ? ` at ${event.data.location.line}:${event.data.location.column}` : ""}`,
				);
				break;
			case "mdx.validation.warning":
				console.warn(
					`${indent}${prefix} ⚠️  MDX: ${event.data.issueType} in ${event.data.file}${event.data.lineNumber ? ` (line ${event.data.lineNumber})` : ""}`,
				);
				if (event.data.message) {
					console.warn(`${indent}   ${event.data.message}`);
				}
				break;

			// Summaries
			case "stats.file.summary":
				console.log(
					`${indent}${prefix} 📊 Files: ${event.data.total} total (${event.data.new} new, ${event.data.modified} modified, ${event.data.unchanged} unchanged)`,
				);
				break;
			case "stats.codeblock.summary":
				console.log(
					`${indent}${prefix} 📊 Code blocks: ${event.data.total} total, ${event.data.slow} slow, avg ${this.formatDuration(event.data.avgTimeMs)}`,
				);
				break;
			case "stats.error.summary":
				if (event.data.twoslash.total > 0 || event.data.prettier.total > 0) {
					console.log(
						`${indent}${prefix} 📊 Errors: ${event.data.twoslash.total} twoslash, ${event.data.prettier.total} prettier`,
					);
				}
				break;
		}
	}

	// ============================================================================
	// Log Group Support
	// ============================================================================

	/**
	 * Start a log group (increases indentation for nested logs).
	 */
	group(title: string): void {
		this.verbose(title);
		this.groupDepth++;
	}

	/**
	 * End a log group (decreases indentation).
	 */
	groupEnd(): void {
		if (this.groupDepth > 0) {
			this.groupDepth--;
		}
	}

	// ============================================================================
	// Generic Log Methods (replacing Logger class)
	// ============================================================================

	/**
	 * Log an info-level message.
	 */
	info(message: string, context?: Record<string, unknown>): void {
		this.emit(createLogMessage({ level: "info", message, context }, this.buildId));
	}

	/**
	 * Log a verbose-level message.
	 */
	verbose(message: string, context?: Record<string, unknown>): void {
		this.emit(createLogMessage({ level: "verbose", message, context }, this.buildId));
	}

	/**
	 * Log a debug-level message.
	 */
	debug(message: string, context?: Record<string, unknown>): void {
		this.emit(createLogMessage({ level: "debug", message, context }, this.buildId));
	}

	/**
	 * Log a warning message.
	 */
	warn(message: string, context?: Record<string, unknown>): void {
		this.emit(createLogMessage({ level: "warn", message, context }, this.buildId));
	}

	/**
	 * Log an error message.
	 */
	error(message: string, context?: Record<string, unknown>): void {
		this.emit(createLogMessage({ level: "error", message, context }, this.buildId));
	}

	/**
	 * Start a timer for tracking operation duration.
	 */
	startTimer(operation: string, context?: Record<string, unknown>): Timer {
		return new Timer(this, operation, context);
	}

	// ============================================================================
	// Analysis Utilities
	// ============================================================================

	/**
	 * Analyze HAST tree structure to count nodes and max depth.
	 */
	private analyzeHast(hast: unknown): { nodeCount: number; maxDepth: number } {
		let nodeCount = 0;
		let maxDepth = 0;

		const traverse = (node: unknown, depth: number): void => {
			if (!node || typeof node !== "object") return;
			nodeCount++;
			maxDepth = Math.max(maxDepth, depth);
			const n = node as { children?: unknown[] };
			if (Array.isArray(n.children)) {
				for (const child of n.children) traverse(child, depth + 1);
			}
		};

		traverse(hast, 0);
		return { nodeCount, maxDepth };
	}

	/**
	 * Analyze escape patterns in serialized output.
	 */
	private analyzeEscapePatterns(serialized: string): Array<{ pattern: string; count: number }> {
		const patterns: Record<string, number> = {};
		const escapeRegex = /\\[nrtfb"\\]/g;
		for (const match of serialized.matchAll(escapeRegex)) {
			patterns[match[0]] = (patterns[match[0]] || 0) + 1;
		}
		return Object.entries(patterns).map(([pattern, count]) => ({ pattern, count }));
	}

	// ============================================================================
	// Build Lifecycle Events
	// ============================================================================

	/**
	 * Log the start of the build process.
	 */
	buildStart(data: { apiCount: number; externalPackageCount: number }): void {
		this.emit(createBuildStart(data, this.buildId));
	}

	/**
	 * Log the completion of the build process.
	 */
	buildComplete(data: { durationMs: number; summary: { files: number; pages: number; errors: number } }): void {
		this.emit(createBuildComplete(data, this.buildId));
	}

	// ============================================================================
	// Loading Events
	// ============================================================================

	/**
	 * Log API model loading.
	 */
	apiModelLoaded(data: { apiName: string; version?: string; itemCount: number; durationMs: number }): void {
		this.emit(createApiModelLoaded(data, this.buildId));
	}

	/**
	 * Log VFS generation for a package.
	 */
	vfsGenerated(data: { packageName: string; fileCount: number; durationMs: number }): void {
		this.emit(createVfsGenerated(data, this.buildId));
	}

	/**
	 * Log external packages loading results.
	 */
	externalPackagesLoaded(data: { loaded: string[]; failed: string[]; durationMs: number }): void {
		this.emit(createExternalPackagesLoaded(data, this.buildId));
	}

	/**
	 * Log VFS merge completion.
	 */
	vfsMerged(data: { packageCount: number; totalFiles: number; durationMs: number }): void {
		this.emit(createVfsMerged(data, this.buildId));
	}

	// ============================================================================
	// Initialization Events
	// ============================================================================

	/**
	 * Log Shiki highlighter initialization.
	 */
	shikiInitComplete(data: { themes: string[]; languages: string[]; durationMs: number }): void {
		this.emit(createShikiInitComplete(data, this.buildId));
	}

	/**
	 * Log Twoslash initialization.
	 */
	twoslashInitComplete(data: { packageCount: number; vfsFileCount: number; durationMs: number }): void {
		this.emit(createTwoslashInitComplete(data, this.buildId));
	}

	// ============================================================================
	// Category Generation Events
	// ============================================================================

	/**
	 * Log the start of category generation.
	 */
	categoryGenerationStart(data: { category: string; itemCount: number }): void {
		this.emit(createCategoryGenerationStart(data, this.buildId));
	}

	/**
	 * Log the completion of category generation.
	 */
	categoryGenerationComplete(data: { category: string; pageCount: number; durationMs: number }): void {
		this.emit(createCategoryGenerationComplete(data, this.buildId));
	}

	// ============================================================================
	// Page Generation Events
	// ============================================================================

	/**
	 * Log the start of page generation.
	 */
	pageGenerationStart(data: {
		file: string;
		apiItemType: "Class" | "Interface" | "Function" | "TypeAlias" | "Enum" | "Variable" | "Namespace";
		memberCount: number;
		category: string;
		apiName?: string;
		version?: string;
	}): void {
		this.emit(createPageGenerationStart(data, this.buildId));
	}

	/**
	 * Log HAST generation from Shiki highlighter.
	 */
	shikiHastGenerated(data: {
		code: string;
		hast: unknown;
		blockType: "signature" | "member" | "example";
		durationMs: number;
		hasTwoslash: boolean;
	}): void {
		const { nodeCount, maxDepth } = this.analyzeHast(data.hast);
		this.emit(
			createShikiHastGenerated(
				{
					codePreview: data.code.slice(0, 200),
					nodeCount,
					maxDepth,
					durationMs: data.durationMs,
					blockType: data.blockType,
					hasTwoslash: data.hasTwoslash,
				},
				this.buildId,
			),
		);
	}

	/**
	 * Log component props generation.
	 */
	componentPropsGenerated(data: { componentName: string; propNames: string[]; value: unknown }): void {
		const serialized = JSON.stringify(data.value);
		const rawSize = typeof data.value === "string" ? data.value.length : JSON.stringify(data.value).length;
		const escapeRegex = /\\[nrtfb"\\]/g;
		const escapeMatches = serialized.match(escapeRegex);
		const escapeSequencesFound = escapeMatches ? escapeMatches.length : 0;

		this.emit(
			createComponentPropsGenerated(
				{
					componentName: data.componentName,
					propNames: data.propNames,
					rawSize,
					serializedSize: serialized.length,
					escapeSequencesFound,
				},
				this.buildId,
			),
		);
	}

	/**
	 * Log serialization debug information.
	 */
	serializationDebug(data: { target: string; value: unknown }): void {
		const serialized = JSON.stringify(data.value);
		const escapePatterns = this.analyzeEscapePatterns(serialized);

		const problematicRegex = /[{}<>`]/g;
		const matches = serialized.match(problematicRegex);
		const containsProblematicChars = !!matches && matches.length > 0;

		let problematicCharsPreview: string | undefined;
		if (containsProblematicChars) {
			const idx = serialized.search(problematicRegex);
			problematicCharsPreview = serialized.slice(Math.max(0, idx - 20), idx + 30);
		}

		this.emit(
			createSerializationDebug(
				{
					target: data.target,
					rawSize: serialized.length,
					serializedSize: serialized.length,
					escapePatterns,
					containsProblematicChars,
					problematicCharsPreview,
				},
				this.buildId,
			),
		);
	}

	/**
	 * Log MDX file write completion.
	 */
	mdxWriteComplete(data: {
		filePath: string;
		content: string;
		status: "new" | "modified" | "unchanged";
		durationMs: number;
	}): void {
		const lineCount = data.content.split("\n").length;
		this.emit(
			createMDXWriteComplete(
				{
					filePath: data.filePath,
					byteSize: Buffer.byteLength(data.content, "utf-8"),
					lineCount,
					status: data.status,
					durationMs: data.durationMs,
				},
				this.buildId,
			),
		);
	}

	// ============================================================================
	// File Status Events
	// ============================================================================

	/**
	 * Log file operation status.
	 */
	fileStatus(data: {
		file: string;
		absolutePath?: string;
		status: "new" | "modified" | "unchanged";
		apiName?: string;
		category?: string;
		byteSize?: number;
	}): void {
		this.emit(createFileStatus(data, this.buildId));
	}

	// ============================================================================
	// Timer Events
	// ============================================================================

	/**
	 * Log timer completion.
	 */
	timerComplete(data: { operation: string; durationMs: number; context?: Record<string, unknown> }): void {
		this.emit(createTimerComplete(data, this.buildId));
	}

	// ============================================================================
	// External Message Events
	// ============================================================================

	/**
	 * Log a message from an external system (e.g., type-registry-effect).
	 */
	externalMessage(data: {
		source: string;
		originalEvent: string;
		message: string;
		details?: Record<string, unknown>;
	}): void {
		this.emit(createExternalMessage(data, this.buildId));
	}

	// ============================================================================
	// Performance Events (via callback)
	// ============================================================================

	/**
	 * Log a slow code block.
	 */
	codeBlockSlow(data: { blockType: string; durationMs: number; file?: string; thresholdMs: number }): void {
		this.emit(createCodeBlockSlow(data, this.buildId));
	}

	// ============================================================================
	// Error Events
	// ============================================================================

	/**
	 * Log a build error.
	 */
	buildError(data: {
		phase:
			| "model.load"
			| "vfs.generate"
			| "shiki.init"
			| "twoslash.init"
			| "page.generate"
			| "file.write"
			| "hast.serialize";
		file?: string;
		error: Error;
		context?: Record<string, unknown>;
	}): void {
		this.emit(
			createBuildError(
				{
					phase: data.phase,
					file: data.file,
					errorMessage: data.error.message,
					errorStack: data.error.stack,
					context: data.context,
				},
				this.buildId,
			),
		);
	}

	/**
	 * Log a Twoslash error.
	 */
	twoslashError(data: { file?: string; errorCode?: string; errorMessage: string; codeSnippet: string }): void {
		this.emit(createTwoslashError(data, this.buildId));
	}

	/**
	 * Log a Prettier error.
	 */
	prettierError(data: {
		file?: string;
		language: string;
		errorMessage: string;
		location?: { line: number; column: number };
	}): void {
		this.emit(createPrettierError(data, this.buildId));
	}

	// ============================================================================
	// Summary Events
	// ============================================================================

	/**
	 * Log file generation statistics summary.
	 */
	fileStatsSummary(summary: FileStatsSummary): void {
		this.emit(createStatsFileSummary(summary, this.buildId));
	}

	/**
	 * Log code block statistics summary.
	 */
	codeBlockStatsSummary(summary: CodeBlockStatsSummary): void {
		this.emit(createStatsCodeBlockSummary(summary, this.buildId));
	}

	/**
	 * Log error statistics summary.
	 */
	errorStatsSummary(summary: { twoslash: TwoslashErrorSummary; prettier: PrettierErrorSummary }): void {
		this.emit(createStatsErrorSummary(summary, this.buildId));
	}

	// ============================================================================
	// MDX Validation Events
	// ============================================================================

	/**
	 * Validate MDX content and log any warnings.
	 * Call this after generating MDX content but before writing to disk.
	 *
	 * @param file - Path to the MDX file (for logging)
	 * @param content - The full MDX content
	 * @param options - Optional configuration
	 * @returns Array of issues found (empty if no issues)
	 */
	validateMDXContent(
		file: string,
		content: string,
		options: {
			maxLineLength?: number;
			maxHastDepth?: number;
		} = {},
	): Array<{ issueType: string; message: string }> {
		const maxLineLength = options.maxLineLength ?? 15000;
		const maxHastDepth = options.maxHastDepth ?? 20;
		const issues: Array<{ issueType: string; message: string }> = [];

		const lines = content.split("\n");

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineNumber = i + 1;

			// Check for extremely long lines
			if (line.length > maxLineLength) {
				const issue = {
					issueType: "long-line" as const,
					message: `Line ${lineNumber} is ${line.length} characters (max recommended: ${maxLineLength})`,
				};
				issues.push(issue);

				// Try to identify which component has the long line
				const componentMatch = line.match(/<(\w+Wrapper|SignatureBlock\w*|ExampleBlock\w*)/);
				const componentName = componentMatch?.[1];

				this.emit(
					createMDXValidationWarning(
						{
							file,
							issueType: "long-line",
							message: issue.message,
							lineNumber,
							lineLength: line.length,
							maxRecommended: maxLineLength,
							component: componentName,
							preview: `${line.slice(0, 100)}...`,
						},
						this.buildId,
					),
				);
			}

			// Check for HAST with deep nesting (potential for complex parsing)
			if (line.includes("hast={")) {
				const hastMatch = line.match(/hast=\{("[^"]*")\}/);
				if (hastMatch) {
					try {
						const hastStr = JSON.parse(hastMatch[1]);
						const hast = JSON.parse(hastStr);
						const { maxDepth } = this.analyzeHast(hast);

						if (maxDepth > maxHastDepth) {
							const issue = {
								issueType: "deep-nesting" as const,
								message: `HAST has depth ${maxDepth} (max recommended: ${maxHastDepth})`,
							};
							issues.push(issue);

							this.emit(
								createMDXValidationWarning(
									{
										file,
										issueType: "deep-nesting",
										message: issue.message,
										lineNumber,
										maxRecommended: maxHastDepth,
									},
									this.buildId,
								),
							);
						}
					} catch {
						// HAST parsing failed - might indicate malformed content
					}
				}
			}

			// Check for malformed HAST patterns (element with value property)
			if (line.includes('"type":"element","value":')) {
				const issue = {
					issueType: "malformed-hast" as const,
					message: "HAST element node has 'value' property (should only be on text nodes)",
				};
				issues.push(issue);

				this.emit(
					createMDXValidationWarning(
						{
							file,
							issueType: "malformed-hast",
							message: issue.message,
							lineNumber,
							preview: line.slice(line.indexOf('"type":"element","value":'), 100),
						},
						this.buildId,
					),
				);
			}
		}

		return issues;
	}

	/**
	 * Log a single MDX validation warning.
	 */
	mdxValidationWarning(data: {
		file: string;
		issueType: "long-line" | "malformed-hast" | "problematic-chars" | "deep-nesting";
		message: string;
		lineNumber?: number;
		lineLength?: number;
		maxRecommended?: number;
		component?: string;
		propName?: string;
		preview?: string;
	}): void {
		this.emit(createMDXValidationWarning(data, this.buildId));
	}

	/**
	 * Close the file stream and flush any pending writes.
	 * Returns a Promise that resolves when all buffered data has been written.
	 */
	close(): Promise<void> {
		return new Promise((resolve) => {
			if (this.fileStream) {
				this.fileStream.end(() => {
					this.fileStream = null;
					resolve();
				});
			} else {
				resolve();
			}
		});
	}
}
