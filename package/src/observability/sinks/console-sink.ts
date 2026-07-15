import type { EventLevel, PluginEvent } from "../events.js";
import { LEVEL_RANK, levelOf } from "../events.js";
import type { EventSink } from "./types.js";

function formatTime(date: Date): string {
	return date.toTimeString().slice(0, 8);
}

/**
 * One-line human-readable summary of an event. Uses a switch on `_tag` (not
 * `PluginEvent.$match`, whose Effect signature requires EXHAUSTIVE cases with
 * no `_` wildcard). TypeScript narrows `event` to the variant in each case.
 * Extend per _tag as needed; the `default` arm renders the bare tag.
 */
function render(event: PluginEvent): string {
	switch (event._tag) {
		case "BuildStarted":
			return `Generating API documentation (${event.apiCount} API${event.apiCount === 1 ? "" : "s"})…`;
		case "PhaseStarted":
			return `→ ${event.phase}`;
		case "PhaseCompleted":
			return `✓ ${event.phase} (${event.durationMs}ms)`;
		case "BuildCompleted":
			return `API documentation complete (${(event.durationMs / 1000).toFixed(2)}s)`;
		case "BuildFailed":
			return `Error in ${event.phase}: ${event.error}`;
		case "SlowOperation":
			return `slow ${event.operation}: ${event.durationMs}ms (>${event.threshold}ms)`;
		case "ConfigCascadeWarning":
			return `${event.field}: using '${event.chosen}', ignoring ${event.ignored.join(", ")}`;
		case "ConfigValidationWarning":
			return `${event.field}: rejected '${event.value}'${event.reason ? ` — ${event.reason}` : ""}`;
		case "DeprecatedConfigUsed":
			return `option '${event.key}' is deprecated; use ${event.replacement}`;
		case "ModelLoaded":
			return `loaded model: ${event.itemCount} items, ${event.entryPoints} entry point(s) (${event.durationMs}ms)`;
		case "ConfigResolved":
			return `resolved ${event.baseRoute}: ${event.categoryCount} categories, ${event.externalCount} external`;
		case "TwoslashDiagnostic":
			return `Twoslash TS${event.code} in ${event.file}:${event.line}:${event.col}: ${event.message}`;
		case "TwoslashCheckFailed":
			return `Twoslash check failed (TS${event.code}) in ${event.file}; ${event.fsMapKeys.length} VFS files`;
		case "PageGenerated":
			return `page ${event.category}/${event.item} (${event.durationMs}ms)`;
		case "FileDecision":
			return `${event.status}: ${event.file}`;
		case "ItemSkipped":
			return `skipped ${event.kind} "${event.item}": ${event.reason}`;
		case "ShikiError":
			return `Shiki error in ${event.file}: ${event.reason}`;
		case "PrettierError":
			return `Prettier error in ${event.file}: ${event.reason}`;
		case "LlmsPackageFilesGenerated":
			return `llms files: ${event.dir} (${event.files.length})`;
		case "TypeRegistryEvent":
			return event.kind === "BatchComplete"
				? event.detail
				: `${event.kind} ${event.ctx.packageName ?? ""} ${event.detail}`.trim();
		default:
			return event._tag;
	}
}

export function makeConsoleSink(
	logLevel: EventLevel | "none",
	opts: { json?: boolean; now?: () => Date } = {},
): EventSink {
	const now = opts.now ?? (() => new Date());
	const json = opts.json ?? false;
	// "none" → a sink that admits nothing.
	const minLevel: EventLevel = logLevel === "none" ? "error" : logLevel;
	const threshold = logLevel === "none" ? -1 : LEVEL_RANK[minLevel];

	return {
		minLevel,
		capturesPayload: json,
		handle: (event) => {
			if (LEVEL_RANK[levelOf(event)] > threshold) return;
			if (json) {
				console.log(JSON.stringify({ timestamp: now().getTime(), ...event }));
				return;
			}
			const level = levelOf(event);
			const prefix = level === "error" ? "🔴 " : level === "warn" ? "⚠️  " : "";
			console.log(`[${formatTime(now())}] ${prefix}${render(event)}`);
		},
	};
}
