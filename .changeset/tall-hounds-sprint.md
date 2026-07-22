---
"rspress-plugin-api-extractor": minor
---

## Features

### Production build progress heartbeat

Large multi-API builds (hundreds of pages) used to look hung — `rspress build` would sit silent for minutes. During production builds only, the plugin now emits a periodic one-line progress update while API docs generate:

* **Resolve phase** — model/VFS loading progress, plus a per-tick delta
* **Generate phase** — `N/total APIs · pages · code-blocks · elapsed (+delta)`

Scheduling sleeps first, so a fast single-API build emits nothing. Controlled by a new option:

```typescript
apiExtractor({
  observability: {
    progressInterval: 10, // seconds; false or 0 disables
  },
})
```

### `.api-docs/build/issues.json` build issues artifact

Production builds now write a machine-readable issues file so problems can be found and fixed without scrolling console output:

```typescript
interface IssuesArtifact {
  generatedAt: string;
  package: string;
  target: string;
  warnings: Issue[];
  errors: Issue[];
  suppressed: Issue[];
}

interface Issue {
  source: string;
  level: "warn" | "error";
  text: string;
  code?: string;
  file?: string;
  line?: number;
  column?: number;
  api?: string;
}
```

It captures Twoslash diagnostics, Prettier/Shiki errors, config-validation warnings, route collisions, model-load failures, and build failures. The file is written in `afterBuild`, and best-effort on the `config()` failure path, so a fatal error still leaves an artifact behind to diagnose.

### Doc-build issues monitor

A new Claude Code plugin monitor (`plugin/monitors/watch-issues.mjs`, registered in `plugin/monitors/monitors.json`) surfaces the issue count from `.api-docs/build/issues.json` in the background.

### Route collisions and model-load failures now reported

`RouteCollisionDetected` and `ModelLoadFailed` events — previously defined but never emitted — now fire during the build, surfacing as typed `routing`/`model` issues in `issues.json` and on the console.

### File location changes

All of the plugin's on-disk artifacts now live under a single `<cwd>/.api-docs/` directory, split by lifecycle:

* `.api-docs/snapshot/api-docs.db` — the incremental-build snapshot database, **renamed** from `api-docs-snapshot.db` and **relocated** from the working-directory root. This is the one artifact a site may choose to commit, for build idempotency between CI and local.
* `.api-docs/build/` — regenerated every build and gitignored: `issues.json` and the opt-in `trace-<buildId>.jsonl`.

The database rename-and-move is graceful, not breaking: a missing database falls back to on-disk content comparison, preserving SEO timestamps and producing no spurious rewrites. No manual migration is required — delete any old `api-docs-snapshot.db`. Gitignore `.api-docs/` wholesale, or — to commit the snapshot for idempotency — gitignore `.api-docs/build/` plus the `.api-docs/snapshot/*.db-wal` / `*.db-shm` sidecars and commit `.api-docs/snapshot/`.

## Bug Fixes

* The plugin now honors RSPress's real `isProd` flag in the `config()` hook, rather than assuming production — the progress heartbeat and `issues.json` are correctly gated to production builds only.
* Fixed a YAML frontmatter parse error in the api-docs Claude Code plugin's `plugin-config` skill that caused it to load with empty metadata (and therefore never trigger).
* The `rspress-docs` agent now reaches for the `twoslash` skill first when diagnosing a Twoslash diagnostic instead of reading package or engine source, and treats diagnostics in the generated `api/` tree as upstream findings rather than edits.
