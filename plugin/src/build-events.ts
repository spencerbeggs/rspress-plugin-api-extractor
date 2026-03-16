/**
 * Build events for rspress-plugin-api-extractor.
 * Uses Zod schemas with descriptions for AI agent consumption.
 *
 * @packageDocumentation
 */
import { z } from "zod";

// ============================================================================
// Base Event Schema
// ============================================================================

const BaseEvent = z.object({
	timestamp: z.number().describe("Unix timestamp in milliseconds"),
	buildId: z.string().optional().describe("Unique build identifier for correlation"),
});

// ============================================================================
// Build Lifecycle Events
// ============================================================================

/**
 * Build process started.
 *
 * AI Context: Use to track build start and configuration.
 * Severity: info
 */
export const BuildStartSchema = BaseEvent.extend({
	event: z.literal("build.start"),
	data: z.object({
		apiCount: z.number().describe("Number of APIs to process"),
		externalPackageCount: z.number().describe("Number of external packages to load"),
	}),
});

/**
 * Build process completed successfully.
 *
 * AI Context: Use to analyze build results and performance.
 * Severity: info
 */
export const BuildCompleteSchema = BaseEvent.extend({
	event: z.literal("build.complete"),
	data: z.object({
		durationMs: z.number().describe("Total build duration in milliseconds"),
		summary: z.object({
			files: z.number().describe("Total files generated"),
			pages: z.number().describe("Total pages generated"),
			errors: z.number().describe("Total errors encountered"),
		}),
	}),
});

// ============================================================================
// Loading Events
// ============================================================================

/**
 * API model loaded from file.
 *
 * AI Context: Use to track model loading and item counts.
 * Severity: debug
 */
export const ApiModelLoadedSchema = BaseEvent.extend({
	event: z.literal("api.model.loaded"),
	data: z.object({
		apiName: z.string().describe("Name of the API"),
		version: z.string().optional().describe("API version if versioned"),
		itemCount: z.number().describe("Number of API items in the model"),
		durationMs: z.number().describe("Time to load model in milliseconds"),
	}),
});

/**
 * VFS generated for a package.
 *
 * AI Context: Use to track VFS generation performance.
 * Severity: debug
 */
export const VfsGeneratedSchema = BaseEvent.extend({
	event: z.literal("vfs.generated"),
	data: z.object({
		packageName: z.string().describe("Package name"),
		fileCount: z.number().describe("Number of files in VFS"),
		durationMs: z.number().describe("Time to generate VFS in milliseconds"),
	}),
});

/**
 * External packages loaded from registry.
 *
 * AI Context: Use to track external package loading success/failure.
 * Severity: info
 */
export const ExternalPackagesLoadedSchema = BaseEvent.extend({
	event: z.literal("external.packages.loaded"),
	data: z.object({
		loaded: z.array(z.string()).describe("Successfully loaded package names"),
		failed: z.array(z.string()).describe("Failed package names"),
		durationMs: z.number().describe("Total loading time in milliseconds"),
	}),
});

/**
 * All VFS merged into combined VFS.
 *
 * AI Context: Use to track VFS merge completion.
 * Severity: debug
 */
export const VfsMergedSchema = BaseEvent.extend({
	event: z.literal("vfs.merged"),
	data: z.object({
		packageCount: z.number().describe("Number of packages merged"),
		totalFiles: z.number().describe("Total files in merged VFS"),
		durationMs: z.number().describe("Time to merge VFS in milliseconds"),
	}),
});

// ============================================================================
// Initialization Events
// ============================================================================

/**
 * Shiki highlighter initialized.
 *
 * AI Context: Use to track Shiki initialization.
 * Severity: debug
 */
export const ShikiInitCompleteSchema = BaseEvent.extend({
	event: z.literal("shiki.init.complete"),
	data: z.object({
		themes: z.array(z.string()).describe("Loaded themes"),
		languages: z.array(z.string()).describe("Loaded languages"),
		durationMs: z.number().describe("Time to initialize in milliseconds"),
	}),
});

/**
 * Twoslash initialized with VFS.
 *
 * AI Context: Use to track Twoslash initialization.
 * Severity: debug
 */
export const TwoslashInitCompleteSchema = BaseEvent.extend({
	event: z.literal("twoslash.init.complete"),
	data: z.object({
		packageCount: z.number().describe("Number of packages in VFS"),
		vfsFileCount: z.number().describe("Total files in VFS"),
		durationMs: z.number().describe("Time to initialize in milliseconds"),
	}),
});

// ============================================================================
// Category Generation Events
// ============================================================================

/**
 * Category generation started.
 *
 * AI Context: Use to track category-level progress.
 * Severity: debug
 */
export const CategoryGenerationStartSchema = BaseEvent.extend({
	event: z.literal("category.generation.start"),
	data: z.object({
		category: z.string().describe("Category name"),
		itemCount: z.number().describe("Number of items in category"),
	}),
});

/**
 * Category generation completed.
 *
 * AI Context: Use to track category completion and timing.
 * Severity: debug
 */
export const CategoryGenerationCompleteSchema = BaseEvent.extend({
	event: z.literal("category.generation.complete"),
	data: z.object({
		category: z.string().describe("Category name"),
		pageCount: z.number().describe("Number of pages generated"),
		durationMs: z.number().describe("Time to generate category in milliseconds"),
	}),
});

// ============================================================================
// Page Generation Events (existing)
// ============================================================================

/**
 * Page generation started for an API item.
 *
 * AI Context: Use to track page generation progress and identify slow pages.
 * Severity: debug
 */
export const PageGenerationStartSchema = BaseEvent.extend({
	event: z.literal("page.generation.start"),
	data: z.object({
		file: z.string().describe("Output file path relative to outputDir"),
		apiItemType: z
			.enum(["Class", "Interface", "Function", "TypeAlias", "Enum", "Variable", "Namespace"])
			.describe("Type of API item being generated"),
		memberCount: z.number().describe("Number of members (methods, properties, etc.)"),
		category: z.string().describe("Category folder name"),
		apiName: z.string().optional().describe("API package name"),
		version: z.string().optional().describe("API version if versioned"),
	}),
});

/**
 * Shiki highlighter generated HAST from code.
 *
 * AI Context: Use to diagnose slow highlighting or complex HAST structures.
 * Severity: debug
 */
export const ShikiHastGeneratedSchema = BaseEvent.extend({
	event: z.literal("shiki.hast.generated"),
	data: z.object({
		codePreview: z.string().max(200).describe("First 200 chars of source code"),
		nodeCount: z.number().describe("Total HAST nodes in the tree"),
		maxDepth: z.number().describe("Maximum nesting depth of HAST tree"),
		durationMs: z.number().describe("Time to generate HAST in milliseconds"),
		blockType: z.enum(["signature", "member", "example"]).describe("Type of code block"),
		hasTwoslash: z.boolean().describe("Whether Twoslash processing was enabled"),
	}),
});

/**
 * Component props serialized for MDX embedding.
 *
 * AI Context: Use to diagnose MDX parsing issues from serialization.
 * Severity: debug
 */
export const ComponentPropsGeneratedSchema = BaseEvent.extend({
	event: z.literal("component.props.generated"),
	data: z.object({
		componentName: z.string().describe("React component name"),
		propNames: z.array(z.string()).describe("Names of props being serialized"),
		rawSize: z.number().describe("Size before JSON.stringify (bytes)"),
		serializedSize: z.number().describe("Size after JSON.stringify (bytes)"),
		escapeSequencesFound: z.number().describe("Count of escape sequences"),
	}),
});

/**
 * Serialization details for debugging MDX issues.
 *
 * AI Context: Use when MDX parsing errors occur to find problematic serialization.
 * Severity: debug
 */
export const SerializationDebugSchema = BaseEvent.extend({
	event: z.literal("serialization.debug"),
	data: z.object({
		target: z.string().describe("What is being serialized (e.g., 'hast', 'code')"),
		rawSize: z.number().describe("Size before JSON.stringify (bytes)"),
		serializedSize: z.number().describe("Size after JSON.stringify (bytes)"),
		escapePatterns: z
			.array(
				z.object({
					pattern: z.string().describe("Escape pattern found"),
					count: z.number().describe("Number of occurrences"),
				}),
			)
			.describe("Escape sequences found in output"),
		containsProblematicChars: z.boolean().describe("Contains chars that may break MDX"),
		problematicCharsPreview: z.string().optional().describe("Preview of problematic chars"),
	}),
});

/**
 * MDX file written to disk.
 *
 * AI Context: Use to track file generation and identify large files.
 * Severity: info
 */
export const MDXWriteCompleteSchema = BaseEvent.extend({
	event: z.literal("mdx.write.complete"),
	data: z.object({
		filePath: z.string().describe("Absolute path to the MDX file"),
		byteSize: z.number().describe("File size in bytes"),
		lineCount: z.number().describe("Number of lines in the file"),
		status: z.enum(["new", "modified", "unchanged"]).describe("File write status"),
		durationMs: z.number().describe("Time to write file in milliseconds"),
	}),
});

// ============================================================================
// Performance Events (via callback)
// ============================================================================

/**
 * Code block took longer than threshold to process.
 *
 * AI Context: Use to identify performance bottlenecks in code highlighting.
 * Severity: warning
 */
export const CodeBlockSlowSchema = BaseEvent.extend({
	event: z.literal("code.block.slow"),
	data: z.object({
		blockType: z.string().describe("Type of code block"),
		durationMs: z.number().describe("Processing time in milliseconds"),
		file: z.string().optional().describe("File containing the slow block"),
		thresholdMs: z.number().describe("Threshold that was exceeded"),
	}),
});

// ============================================================================
// Error Events
// ============================================================================

/**
 * Build error occurred.
 *
 * AI Context: Critical for debugging build failures.
 * Severity: error
 */
export const BuildErrorSchema = BaseEvent.extend({
	event: z.literal("build.error"),
	data: z.object({
		phase: z
			.enum([
				"model.load",
				"vfs.generate",
				"shiki.init",
				"twoslash.init",
				"page.generate",
				"file.write",
				"hast.serialize",
			])
			.describe("Build phase where error occurred"),
		file: z.string().optional().describe("File path if applicable"),
		errorMessage: z.string().describe("Error message"),
		errorStack: z.string().optional().describe("Error stack trace"),
		context: z.record(z.string(), z.unknown()).optional().describe("Additional context data"),
	}),
});

/**
 * Twoslash TypeScript error in code block.
 *
 * AI Context: Use to track TypeScript errors in documentation code.
 * Severity: warning
 */
export const TwoslashErrorSchema = BaseEvent.extend({
	event: z.literal("twoslash.error"),
	data: z.object({
		file: z.string().optional().describe("File containing the error"),
		errorCode: z.string().optional().describe("TypeScript error code (e.g., TS2304)"),
		errorMessage: z.string().describe("Error message"),
		codeSnippet: z.string().describe("Code snippet that caused error"),
	}),
});

/**
 * Prettier formatting error in code block.
 *
 * AI Context: Use to track formatting errors in documentation code.
 * Severity: warning
 */
export const PrettierErrorSchema = BaseEvent.extend({
	event: z.literal("prettier.error"),
	data: z.object({
		file: z.string().optional().describe("File containing the error"),
		language: z.string().describe("Code fence language"),
		errorMessage: z.string().describe("Error message"),
		location: z
			.object({
				line: z.number().describe("Line number"),
				column: z.number().describe("Column number"),
			})
			.optional()
			.describe("Error location if available"),
	}),
});

/**
 * MDX content validation warning.
 *
 * AI Context: Use to identify MDX content that may cause parsing errors during RSPress build.
 * Severity: warning
 */
export const MDXValidationWarningSchema = BaseEvent.extend({
	event: z.literal("mdx.validation.warning"),
	data: z.object({
		file: z.string().describe("File path that has the issue"),
		issueType: z
			.enum(["long-line", "malformed-hast", "problematic-chars", "deep-nesting"])
			.describe("Type of MDX issue detected"),
		message: z.string().describe("Human-readable description of the issue"),
		lineNumber: z.number().optional().describe("Line number where issue occurs"),
		lineLength: z.number().optional().describe("Length of the problematic line"),
		maxRecommended: z.number().optional().describe("Recommended maximum value"),
		component: z.string().optional().describe("Component name if issue is in a component"),
		propName: z.string().optional().describe("Prop name if issue is in a prop value"),
		preview: z.string().optional().describe("Preview of problematic content"),
	}),
});

// ============================================================================
// File Status Events
// ============================================================================

/**
 * File operation status (NEW, MODIFIED, UNCHANGED).
 *
 * AI Context: Use to track file generation progress and detect patterns.
 * Severity: info (for NEW/MODIFIED) or debug (for UNCHANGED)
 */
export const FileStatusSchema = BaseEvent.extend({
	event: z.literal("file.status"),
	data: z.object({
		file: z.string().describe("Relative file path from output directory"),
		absolutePath: z.string().optional().describe("Absolute file path"),
		status: z.enum(["new", "modified", "unchanged"]).describe("File write status"),
		apiName: z.string().optional().describe("API name for disambiguation"),
		category: z.string().optional().describe("Category folder name"),
		byteSize: z.number().optional().describe("File size in bytes"),
	}),
});

// ============================================================================
// Timer Events
// ============================================================================

/**
 * Timer operation completed.
 *
 * AI Context: Use to track operation durations and identify bottlenecks.
 * Severity: debug
 */
export const TimerCompleteSchema = BaseEvent.extend({
	event: z.literal("timer.complete"),
	data: z.object({
		operation: z.string().describe("Name of the timed operation"),
		durationMs: z.number().describe("Duration in milliseconds"),
		context: z.record(z.string(), z.unknown()).optional().describe("Additional context data"),
	}),
});

// ============================================================================
// External Message Events
// ============================================================================

/**
 * Message from external system (e.g., type-registry-effect).
 * Used to capture and reformat external JSON events.
 *
 * AI Context: Use to track external system events in a unified format.
 * Severity: varies based on original event
 */
export const ExternalMessageSchema = BaseEvent.extend({
	event: z.literal("external.message"),
	data: z.object({
		source: z.string().describe("Source system (e.g., 'type-registry-effect')"),
		originalEvent: z.string().describe("Original event type"),
		message: z.string().describe("Human-readable message"),
		details: z.record(z.string(), z.unknown()).optional().describe("Original event data"),
	}),
});

/**
 * Log message event for general logging purposes.
 * Replaces direct console.log calls with structured events.
 *
 * AI Context: Use for debugging and tracing build process.
 * Severity: based on level field
 */
export const LogMessageSchema = BaseEvent.extend({
	event: z.literal("log.message"),
	data: z.object({
		level: z.enum(["debug", "info", "verbose", "warn", "error"]).describe("Log level"),
		message: z.string().describe("Log message"),
		context: z.record(z.string(), z.unknown()).optional().describe("Additional context data"),
	}),
});

// ============================================================================
// Summary Events
// ============================================================================

/**
 * File generation statistics summary.
 *
 * AI Context: Use to analyze file generation patterns.
 * Severity: info
 */
export const StatsFileSummarySchema = BaseEvent.extend({
	event: z.literal("stats.file.summary"),
	data: z.object({
		total: z.number().describe("Total files generated"),
		new: z.number().describe("New files created"),
		modified: z.number().describe("Modified files"),
		unchanged: z.number().describe("Unchanged files"),
		byCategory: z.record(z.string(), z.number()).optional().describe("Counts by category"),
	}),
});

/**
 * Code block processing statistics summary.
 *
 * AI Context: Use to analyze code block performance.
 * Severity: info
 */
export const StatsCodeBlockSummarySchema = BaseEvent.extend({
	event: z.literal("stats.codeblock.summary"),
	data: z.object({
		total: z.number().describe("Total code blocks processed"),
		slow: z.number().describe("Number of slow blocks"),
		avgTimeMs: z.number().describe("Average processing time in milliseconds"),
		byType: z
			.record(
				z.string(),
				z.object({
					count: z.number().describe("Number of blocks"),
					avgMs: z.number().describe("Average time in milliseconds"),
				}),
			)
			.describe("Statistics by block type"),
		slowestMs: z.number().describe("Slowest block time in milliseconds"),
		fastestMs: z.number().describe("Fastest block time in milliseconds"),
	}),
});

/**
 * Error statistics summary.
 *
 * AI Context: Use to analyze error patterns.
 * Severity: info
 */
export const StatsErrorSummarySchema = BaseEvent.extend({
	event: z.literal("stats.error.summary"),
	data: z.object({
		twoslash: z.object({
			total: z.number().describe("Total Twoslash errors"),
			byCode: z.record(z.string(), z.number()).optional().describe("Counts by error code"),
			byFile: z.record(z.string(), z.number()).optional().describe("Counts by file"),
		}),
		prettier: z.object({
			total: z.number().describe("Total Prettier errors"),
			byLanguage: z.record(z.string(), z.number()).optional().describe("Counts by language"),
			byFile: z.record(z.string(), z.number()).optional().describe("Counts by file"),
		}),
	}),
});

// ============================================================================
// Discriminated Union
// ============================================================================

/**
 * Union of all build events.
 * Use the `event` field to discriminate between event types.
 */
export const BuildEventSchema = z.discriminatedUnion("event", [
	// Build lifecycle
	BuildStartSchema,
	BuildCompleteSchema,
	// Loading
	ApiModelLoadedSchema,
	VfsGeneratedSchema,
	ExternalPackagesLoadedSchema,
	VfsMergedSchema,
	// Initialization
	ShikiInitCompleteSchema,
	TwoslashInitCompleteSchema,
	// Category generation
	CategoryGenerationStartSchema,
	CategoryGenerationCompleteSchema,
	// Page generation
	PageGenerationStartSchema,
	ShikiHastGeneratedSchema,
	ComponentPropsGeneratedSchema,
	SerializationDebugSchema,
	MDXWriteCompleteSchema,
	// File operations
	FileStatusSchema,
	// Timers
	TimerCompleteSchema,
	// External messages
	ExternalMessageSchema,
	LogMessageSchema,
	// Performance
	CodeBlockSlowSchema,
	// Errors
	BuildErrorSchema,
	TwoslashErrorSchema,
	PrettierErrorSchema,
	MDXValidationWarningSchema,
	// Summaries
	StatsFileSummarySchema,
	StatsCodeBlockSummarySchema,
	StatsErrorSummarySchema,
]);

// ============================================================================
// Event Metadata (for AI consumption)
// ============================================================================

/**
 * Metadata for each event type, providing AI context.
 */
export const BuildEventMetadata = {
	"build.start": {
		description: "Build process started",
		aiContext: "Use to track build start and configuration",
		severity: "info" as const,
	},
	"build.complete": {
		description: "Build process completed successfully",
		aiContext: "Use to analyze build results and performance",
		severity: "info" as const,
	},
	"api.model.loaded": {
		description: "API model loaded from file",
		aiContext: "Use to track model loading and item counts",
		severity: "debug" as const,
	},
	"vfs.generated": {
		description: "VFS generated for a package",
		aiContext: "Use to track VFS generation performance",
		severity: "debug" as const,
	},
	"external.packages.loaded": {
		description: "External packages loaded from registry",
		aiContext: "Use to track external package loading success/failure",
		severity: "info" as const,
	},
	"vfs.merged": {
		description: "All VFS merged into combined VFS",
		aiContext: "Use to track VFS merge completion",
		severity: "debug" as const,
	},
	"shiki.init.complete": {
		description: "Shiki highlighter initialized",
		aiContext: "Use to track Shiki initialization",
		severity: "debug" as const,
	},
	"twoslash.init.complete": {
		description: "Twoslash initialized with VFS",
		aiContext: "Use to track Twoslash initialization",
		severity: "debug" as const,
	},
	"category.generation.start": {
		description: "Category generation started",
		aiContext: "Use to track category-level progress",
		severity: "debug" as const,
	},
	"category.generation.complete": {
		description: "Category generation completed",
		aiContext: "Use to track category completion and timing",
		severity: "debug" as const,
	},
	"page.generation.start": {
		description: "Page generation started for an API item",
		aiContext: "Use to track page generation progress and identify slow pages",
		severity: "debug" as const,
	},
	"shiki.hast.generated": {
		description: "Shiki highlighter generated HAST from code",
		aiContext: "Use to diagnose slow highlighting or complex HAST structures",
		severity: "debug" as const,
	},
	"component.props.generated": {
		description: "Component props serialized for MDX embedding",
		aiContext: "Use to diagnose MDX parsing issues from serialization",
		severity: "debug" as const,
	},
	"serialization.debug": {
		description: "Serialization details for debugging MDX issues",
		aiContext: "Use when MDX parsing errors occur to find problematic serialization",
		severity: "debug" as const,
	},
	"mdx.write.complete": {
		description: "MDX file written to disk",
		aiContext: "Use to track file generation and identify large files",
		severity: "info" as const,
	},
	"code.block.slow": {
		description: "Code block took longer than threshold to process",
		aiContext: "Use to identify performance bottlenecks in code highlighting",
		severity: "warning" as const,
	},
	"build.error": {
		description: "Build error occurred",
		aiContext: "Critical for debugging build failures",
		severity: "error" as const,
	},
	"twoslash.error": {
		description: "Twoslash TypeScript error in code block",
		aiContext: "Use to track TypeScript errors in documentation code",
		severity: "warning" as const,
	},
	"prettier.error": {
		description: "Prettier formatting error in code block",
		aiContext: "Use to track formatting errors in documentation code",
		severity: "warning" as const,
	},
	"mdx.validation.warning": {
		description: "MDX content validation warning",
		aiContext: "Use to identify MDX content that may cause parsing errors during RSPress build",
		severity: "warning" as const,
	},
	"stats.file.summary": {
		description: "File generation statistics summary",
		aiContext: "Use to analyze file generation patterns",
		severity: "info" as const,
	},
	"stats.codeblock.summary": {
		description: "Code block processing statistics summary",
		aiContext: "Use to analyze code block performance",
		severity: "info" as const,
	},
	"stats.error.summary": {
		description: "Error statistics summary",
		aiContext: "Use to analyze error patterns",
		severity: "info" as const,
	},
	"file.status": {
		description: "File operation status (NEW, MODIFIED, UNCHANGED)",
		aiContext: "Use to track file generation progress and detect patterns",
		severity: "info" as const,
	},
	"timer.complete": {
		description: "Timer operation completed",
		aiContext: "Use to track operation durations and identify bottlenecks",
		severity: "debug" as const,
	},
	"external.message": {
		description: "Message from external system",
		aiContext: "Use to track external system events in a unified format",
		severity: "info" as const,
	},
	"log.message": {
		description: "Log message event",
		aiContext: "Use for debugging and tracing build process",
		severity: "debug" as const,
	},
} as const;

// ============================================================================
// Type Exports
// ============================================================================

export type BuildStart = z.infer<typeof BuildStartSchema>;
export type BuildComplete = z.infer<typeof BuildCompleteSchema>;
export type ApiModelLoaded = z.infer<typeof ApiModelLoadedSchema>;
export type VfsGenerated = z.infer<typeof VfsGeneratedSchema>;
export type ExternalPackagesLoaded = z.infer<typeof ExternalPackagesLoadedSchema>;
export type VfsMerged = z.infer<typeof VfsMergedSchema>;
export type ShikiInitComplete = z.infer<typeof ShikiInitCompleteSchema>;
export type TwoslashInitComplete = z.infer<typeof TwoslashInitCompleteSchema>;
export type CategoryGenerationStart = z.infer<typeof CategoryGenerationStartSchema>;
export type CategoryGenerationComplete = z.infer<typeof CategoryGenerationCompleteSchema>;
export type PageGenerationStart = z.infer<typeof PageGenerationStartSchema>;
export type ShikiHastGenerated = z.infer<typeof ShikiHastGeneratedSchema>;
export type ComponentPropsGenerated = z.infer<typeof ComponentPropsGeneratedSchema>;
export type SerializationDebug = z.infer<typeof SerializationDebugSchema>;
export type MDXWriteComplete = z.infer<typeof MDXWriteCompleteSchema>;
export type CodeBlockSlow = z.infer<typeof CodeBlockSlowSchema>;
export type BuildError = z.infer<typeof BuildErrorSchema>;
export type TwoslashError = z.infer<typeof TwoslashErrorSchema>;
export type PrettierError = z.infer<typeof PrettierErrorSchema>;
export type MDXValidationWarning = z.infer<typeof MDXValidationWarningSchema>;
export type StatsFileSummary = z.infer<typeof StatsFileSummarySchema>;
export type StatsCodeBlockSummary = z.infer<typeof StatsCodeBlockSummarySchema>;
export type StatsErrorSummary = z.infer<typeof StatsErrorSummarySchema>;
export type FileStatus = z.infer<typeof FileStatusSchema>;
export type TimerComplete = z.infer<typeof TimerCompleteSchema>;
export type ExternalMessage = z.infer<typeof ExternalMessageSchema>;
export type LogMessage = z.infer<typeof LogMessageSchema>;
export type BuildEvent = z.infer<typeof BuildEventSchema>;

export type BuildEventType = BuildEvent["event"];
export type BuildEventSeverity = "debug" | "info" | "warning" | "error";

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a BuildStart event.
 */
export function createBuildStart(data: BuildStart["data"], buildId?: string): BuildStart {
	return BuildStartSchema.parse({
		event: "build.start",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a BuildComplete event.
 */
export function createBuildComplete(data: BuildComplete["data"], buildId?: string): BuildComplete {
	return BuildCompleteSchema.parse({
		event: "build.complete",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create an ApiModelLoaded event.
 */
export function createApiModelLoaded(data: ApiModelLoaded["data"], buildId?: string): ApiModelLoaded {
	return ApiModelLoadedSchema.parse({
		event: "api.model.loaded",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a VfsGenerated event.
 */
export function createVfsGenerated(data: VfsGenerated["data"], buildId?: string): VfsGenerated {
	return VfsGeneratedSchema.parse({
		event: "vfs.generated",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create an ExternalPackagesLoaded event.
 */
export function createExternalPackagesLoaded(
	data: ExternalPackagesLoaded["data"],
	buildId?: string,
): ExternalPackagesLoaded {
	return ExternalPackagesLoadedSchema.parse({
		event: "external.packages.loaded",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a VfsMerged event.
 */
export function createVfsMerged(data: VfsMerged["data"], buildId?: string): VfsMerged {
	return VfsMergedSchema.parse({
		event: "vfs.merged",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a ShikiInitComplete event.
 */
export function createShikiInitComplete(data: ShikiInitComplete["data"], buildId?: string): ShikiInitComplete {
	return ShikiInitCompleteSchema.parse({
		event: "shiki.init.complete",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a TwoslashInitComplete event.
 */
export function createTwoslashInitComplete(data: TwoslashInitComplete["data"], buildId?: string): TwoslashInitComplete {
	return TwoslashInitCompleteSchema.parse({
		event: "twoslash.init.complete",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a CategoryGenerationStart event.
 */
export function createCategoryGenerationStart(
	data: CategoryGenerationStart["data"],
	buildId?: string,
): CategoryGenerationStart {
	return CategoryGenerationStartSchema.parse({
		event: "category.generation.start",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a CategoryGenerationComplete event.
 */
export function createCategoryGenerationComplete(
	data: CategoryGenerationComplete["data"],
	buildId?: string,
): CategoryGenerationComplete {
	return CategoryGenerationCompleteSchema.parse({
		event: "category.generation.complete",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a PageGenerationStart event.
 */
export function createPageGenerationStart(data: PageGenerationStart["data"], buildId?: string): PageGenerationStart {
	return PageGenerationStartSchema.parse({
		event: "page.generation.start",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a ShikiHastGenerated event.
 */
export function createShikiHastGenerated(data: ShikiHastGenerated["data"], buildId?: string): ShikiHastGenerated {
	return ShikiHastGeneratedSchema.parse({
		event: "shiki.hast.generated",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a ComponentPropsGenerated event.
 */
export function createComponentPropsGenerated(
	data: ComponentPropsGenerated["data"],
	buildId?: string,
): ComponentPropsGenerated {
	return ComponentPropsGeneratedSchema.parse({
		event: "component.props.generated",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a SerializationDebug event.
 */
export function createSerializationDebug(data: SerializationDebug["data"], buildId?: string): SerializationDebug {
	return SerializationDebugSchema.parse({
		event: "serialization.debug",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create an MDXWriteComplete event.
 */
export function createMDXWriteComplete(data: MDXWriteComplete["data"], buildId?: string): MDXWriteComplete {
	return MDXWriteCompleteSchema.parse({
		event: "mdx.write.complete",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a CodeBlockSlow event.
 */
export function createCodeBlockSlow(data: CodeBlockSlow["data"], buildId?: string): CodeBlockSlow {
	return CodeBlockSlowSchema.parse({
		event: "code.block.slow",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a BuildError event.
 */
export function createBuildError(data: BuildError["data"], buildId?: string): BuildError {
	return BuildErrorSchema.parse({
		event: "build.error",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a TwoslashError event.
 */
export function createTwoslashError(data: TwoslashError["data"], buildId?: string): TwoslashError {
	return TwoslashErrorSchema.parse({
		event: "twoslash.error",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a PrettierError event.
 */
export function createPrettierError(data: PrettierError["data"], buildId?: string): PrettierError {
	return PrettierErrorSchema.parse({
		event: "prettier.error",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create an MDXValidationWarning event.
 */
export function createMDXValidationWarning(data: MDXValidationWarning["data"], buildId?: string): MDXValidationWarning {
	return MDXValidationWarningSchema.parse({
		event: "mdx.validation.warning",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a StatsFileSummary event.
 */
export function createStatsFileSummary(data: StatsFileSummary["data"], buildId?: string): StatsFileSummary {
	return StatsFileSummarySchema.parse({
		event: "stats.file.summary",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a StatsCodeBlockSummary event.
 */
export function createStatsCodeBlockSummary(
	data: StatsCodeBlockSummary["data"],
	buildId?: string,
): StatsCodeBlockSummary {
	return StatsCodeBlockSummarySchema.parse({
		event: "stats.codeblock.summary",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a StatsErrorSummary event.
 */
export function createStatsErrorSummary(data: StatsErrorSummary["data"], buildId?: string): StatsErrorSummary {
	return StatsErrorSummarySchema.parse({
		event: "stats.error.summary",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a FileStatus event.
 */
export function createFileStatus(data: FileStatus["data"], buildId?: string): FileStatus {
	return FileStatusSchema.parse({
		event: "file.status",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a TimerComplete event.
 */
export function createTimerComplete(data: TimerComplete["data"], buildId?: string): TimerComplete {
	return TimerCompleteSchema.parse({
		event: "timer.complete",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create an ExternalMessage event.
 */
export function createExternalMessage(data: ExternalMessage["data"], buildId?: string): ExternalMessage {
	return ExternalMessageSchema.parse({
		event: "external.message",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

/**
 * Create a LogMessage event.
 */
export function createLogMessage(data: LogMessage["data"], buildId?: string): LogMessage {
	return LogMessageSchema.parse({
		event: "log.message",
		timestamp: Date.now(),
		buildId,
		data,
	});
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Parse and validate a build event from unknown input.
 */
export function parseBuildEvent(input: unknown): BuildEvent {
	return BuildEventSchema.parse(input);
}

/**
 * Safely parse a build event, returning null on failure.
 */
export function safeParseBuildEvent(input: unknown): BuildEvent | null {
	const result = BuildEventSchema.safeParse(input);
	return result.success ? result.data : null;
}

/**
 * Get metadata for a build event type.
 */
export function getEventMetadata(
	eventType: BuildEventType,
): (typeof BuildEventMetadata)[keyof typeof BuildEventMetadata] {
	return BuildEventMetadata[eventType as keyof typeof BuildEventMetadata];
}
