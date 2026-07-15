import { Data } from "effect";

export type EventLevel = "error" | "warn" | "info" | "debug" | "trace";

export const LEVEL_RANK: Record<EventLevel, number> = {
	error: 0,
	warn: 1,
	info: 2,
	debug: 3,
	trace: 4,
};

export interface EventContext {
	readonly buildId: string;
	readonly apiScope?: string;
	readonly packageName?: string;
	readonly version?: string;
	readonly locale?: string;
	readonly entryPoint?: string;
	readonly route?: string;
	readonly file?: string;
	readonly symbol?: string;
}

interface Base {
	readonly ctx: EventContext;
	readonly level: EventLevel;
}

export interface ImportRef {
	readonly from: string;
	readonly symbols: readonly string[];
}

export type PluginEvent = Data.TaggedEnum<{
	// Lifecycle spine
	BuildStarted: Base & { readonly mode: "dev" | "prod"; readonly apiCount: number };
	PhaseStarted: Base & { readonly phase: string };
	PhaseCompleted: Base & { readonly phase: string; readonly durationMs: number };
	BuildCompleted: Base & { readonly durationMs: number; readonly totals: Record<string, number> };
	BuildFailed: Base & { readonly phase: string; readonly error: string };
	SlowOperation: Base & { readonly operation: string; readonly durationMs: number; readonly threshold: number };

	// Config parse & merge
	OptionsDecoded: Base & { readonly mode: "api" | "apis"; readonly presentKeys: readonly string[] };
	DefaultApplied: Base & { readonly path: string; readonly value: string; readonly reason: string };
	BaseRouteResolved: Base & { readonly mode: "api" | "apis"; readonly explicit: boolean; readonly resolved: string };
	ConfigMerged: Base & { readonly key: string; readonly winner: string; readonly overridden: readonly string[] };
	ConfigCascadeWarning: Base & { readonly field: string; readonly chosen: string; readonly ignored: readonly string[] };
	ConfigValidationWarning: Base & { readonly field: string; readonly value: string; readonly reason: string };
	AutoDetectedDependencies: Base & { readonly source: "peer" | "auto"; readonly packages: readonly string[] };
	ConfigResolved: Base & { readonly baseRoute: string; readonly categoryCount: number; readonly externalCount: number };
	DeprecatedConfigUsed: Base & { readonly key: string; readonly replacement: string };

	// Model loading
	ModelLoadStarted: Base & { readonly modelPath: string };
	ModelLoaded: Base & { readonly entryPoints: number; readonly itemCount: number; readonly durationMs: number };
	ModelLoadFailed: Base & { readonly modelPath: string; readonly reason: string };

	// Type loading & VFS
	TypeRegistryEvent: Base & { readonly kind: string; readonly detail: string };
	ExternalPackageSkipped: Base & { readonly reason: string };
	VfsGenerated: Base & {
		readonly file: string;
		readonly declCount: number;
		readonly contentHash: string;
		readonly content?: string;
	};
	ImportsPrepended: Base & { readonly file: string; readonly imports: readonly ImportRef[] };
	TypeReferenceClassified: Base & { readonly packageRef: string; readonly bucket: "builtin" | "internal" | "external" };
	TsCacheCreated: Base & { readonly compilerOptions: string; readonly durationMs: number };
	VfsMerged: Base & { readonly totalFiles: number; readonly packages: readonly string[] };
	TwoslashInitialized: Base & { readonly durationMs: number; readonly vfsFileCount: number };

	// Multi-entry & routing
	EntryPointResolved: Base & { readonly itemCount: number };
	ReExportDeduplicated: Base & {
		readonly kind: string;
		readonly definingEntryPoint: string;
		readonly availableFrom: readonly string[];
	};
	RouteCandidateBuilt: Base & { readonly kind: string };
	RouteCollisionDetected: Base & { readonly items: readonly string[] };
	CrossLinkRouteRegistered: Base & { readonly name: string; readonly kind: string };

	// Page gen & code blocks
	PageGenerated: Base & {
		readonly item: string;
		readonly category: string;
		readonly codeblockCount: number;
		readonly durationMs: number;
	};
	ItemSkipped: Base & { readonly item: string; readonly kind: string; readonly reason: string };
	CodeBlockProcessed: Base & {
		readonly lang: string;
		readonly shikiMs: number;
		readonly twoslashMs: number;
		readonly totalMs: number;
		readonly slow: boolean;
	};
	TwoslashDiagnostic: Base & {
		readonly file: string;
		readonly line: number;
		readonly col: number;
		readonly code: number;
		readonly message: string;
		readonly snippet: string;
	};
	TwoslashCheckFailed: Base & {
		readonly file: string;
		readonly code: number;
		readonly fsMapKeys: readonly string[];
		readonly compilerOptions: string;
	};
	CrossLinkApplied: Base & { readonly from: string; readonly to: string; readonly route: string };
	PrettierError: Base & { readonly file: string; readonly reason: string };
	ShikiError: Base & { readonly file: string; readonly reason: string };

	// Write, snapshot & cleanup
	FileDecision: Base & {
		readonly file: string;
		readonly status: "new" | "modified" | "unchanged";
		readonly contentHash: string;
		readonly frontmatterHash: string;
		readonly source: "snapshot" | "disk-fallback";
	};
	MetadataWritten: Base & { readonly kind: string; readonly file: string; readonly status: string };
	SnapshotBatchCommitted: Base & { readonly count: number };
	StaleDeleted: Base & { readonly file: string };
	OrphanDeleted: Base & { readonly file: string };
	EmptyDirRemoved: Base & { readonly dir: string };

	// LLMs
	LlmsRoutesBuilt: Base & { readonly count: number };
	LlmsPrefixProcessed: Base & { readonly prefix: string };
	LlmsPackageFilesGenerated: Base & { readonly dir: string; readonly files: readonly string[] };
}>;

export const PluginEvent = Data.taggedEnum<PluginEvent>();

export function levelOf(event: PluginEvent): EventLevel {
	return event.level;
}
