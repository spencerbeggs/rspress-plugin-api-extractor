import path from "node:path";
import { Effect, FileSystem } from "effect";
import type { PluginEvent } from "../events.js";
import type { EventSink } from "./types.js";

export interface Issue {
	readonly source: string;
	readonly level: "warn" | "error";
	readonly text: string;
	readonly code: string;
	readonly file: string;
	readonly line: number;
	readonly column: number;
	readonly api?: string;
}

export interface IssuesSnapshot {
	readonly warnings: Issue[];
	readonly errors: Issue[];
	readonly suppressed: Issue[];
}

function withApi(base: Omit<Issue, "api">, api: string | undefined): Issue {
	return api ? { ...base, api } : base;
}

/**
 * Map an issue-relevant event to a typed `Issue` and its bucket. Returns null
 * for events that are not build issues.
 *
 * `suppressed[]` is intentionally not produced here: no event in the current
 * stream distinguishes a diagnostic silenced by `suppressExampleErrors` /
 * `@noErrors` from one that surfaced, so the bucket is reserved (always emitted,
 * currently empty) for schema parity with the bundler artifact.
 */
export function eventToIssue(event: PluginEvent): { bucket: "warnings" | "errors"; issue: Issue } | null {
	switch (event._tag) {
		case "TwoslashDiagnostic":
			return {
				bucket: "warnings",
				issue: withApi(
					{
						source: "twoslash",
						level: "warn",
						text: event.message,
						code: `TS${event.code}`,
						file: event.file,
						line: event.line,
						column: event.col,
					},
					event.ctx.packageName,
				),
			};
		case "TwoslashCheckFailed":
			return {
				bucket: "warnings",
				issue: withApi(
					{
						source: "twoslash",
						level: "warn",
						text: `Twoslash check failed (TS${event.code})`,
						code: `TS${event.code}`,
						file: event.file,
						line: 0,
						column: 0,
					},
					event.ctx.packageName,
				),
			};
		case "PrettierError":
			return {
				bucket: "warnings",
				issue: withApi(
					{
						source: "prettier",
						level: "warn",
						text: event.reason,
						code: "prettier",
						file: event.file,
						line: 0,
						column: 0,
					},
					event.ctx.packageName,
				),
			};
		case "ShikiError":
			return {
				bucket: "warnings",
				issue: withApi(
					{ source: "shiki", level: "warn", text: event.reason, code: "shiki", file: event.file, line: 0, column: 0 },
					event.ctx.packageName,
				),
			};
		case "ConfigValidationWarning":
			return {
				bucket: "warnings",
				issue: withApi(
					{
						source: "config",
						level: "warn",
						text: `${event.field}: ${event.value}${event.reason ? ` — ${event.reason}` : ""}`,
						code: "config-validation",
						file: event.ctx.file ?? "",
						line: 0,
						column: 0,
					},
					event.ctx.packageName,
				),
			};
		case "RouteCollisionDetected":
			return {
				bucket: "errors",
				issue: withApi(
					{
						source: "routing",
						level: "error",
						text: `Route collision between: ${event.items.join(", ")}`,
						code: "route-collision",
						file: event.ctx.file ?? "",
						line: 0,
						column: 0,
					},
					event.ctx.packageName,
				),
			};
		case "ModelLoadFailed":
			return {
				bucket: "errors",
				issue: withApi(
					{
						source: "model",
						level: "error",
						text: event.reason,
						code: "model-load-failed",
						file: event.modelPath,
						line: 0,
						column: 0,
					},
					event.ctx.packageName,
				),
			};
		case "BuildFailed":
			return {
				bucket: "errors",
				issue: withApi(
					{ source: "build", level: "error", text: event.error, code: "build-failed", file: "", line: 0, column: 0 },
					event.ctx.packageName,
				),
			};
		default:
			return null;
	}
}

/**
 * Collector sink: accumulates issue events into in-memory buckets. Always-on
 * (collection is cheap); the write is gated by `isProd` in `afterBuild`.
 */
export function makeIssuesSink(): EventSink & { snapshot: () => IssuesSnapshot } {
	const warnings: Issue[] = [];
	const errors: Issue[] = [];
	const suppressed: Issue[] = [];
	return {
		minLevel: "trace",
		handle(event: PluginEvent): void {
			const mapped = eventToIssue(event);
			if (!mapped) return;
			if (mapped.bucket === "warnings") warnings.push(mapped.issue);
			else errors.push(mapped.issue);
		},
		snapshot: () => ({ warnings: [...warnings], errors: [...errors], suppressed: [...suppressed] }),
	};
}

export interface WriteIssuesOpts {
	readonly cwd: string;
	readonly packageName: string;
	readonly generatedAt: string;
}

/** Serialize an issues snapshot to `<cwd>/.api-docs/build/issues.json` (bundler schema). */
export function writeIssuesJson(
	snapshot: IssuesSnapshot,
	opts: WriteIssuesOpts,
): Effect.Effect<void, never, FileSystem.FileSystem> {
	return Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const dir = path.join(opts.cwd, ".api-docs", "build");
		yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.ignore);
		const doc = {
			generatedAt: opts.generatedAt,
			package: opts.packageName,
			target: "prod",
			warnings: snapshot.warnings,
			errors: snapshot.errors,
			suppressed: snapshot.suppressed,
		};
		yield* fs.writeFileString(path.join(dir, "issues.json"), `${JSON.stringify(doc, null, 2)}\n`).pipe(Effect.ignore);
	});
}
