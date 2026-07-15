# plugin/CLAUDE.md

The **api-docs Claude Code plugin** for this monorepo.

**Do not confuse this with the npm package.** The publishable RSPress plugin
(`rspress-plugin-api-extractor`) lives in `package/`, not here. This folder is
not a pnpm workspace, is not in `pnpm-workspace.yaml`, and is not built by Turbo.

## Status

Phase 1, 1b, and 2 complete: ships four model-invoked skills under `skills/`, the `rspress-docs` agent (`agents/rspress-docs.md`), and two slash commands under `commands/`, alongside the manifest and a one-line SessionStart orientation hook that names the agent. Each skill is a `SKILL.md` gate plus essentials with a `references/` folder loaded on demand. The `rspress-docs` agent force-loads all four skills via frontmatter `skills:` and runs an orient → match → write → validate → report workflow; it never edits package source/TSDoc or the generated `api/` tree (those become findings). The commands are thin front-doors: `/api-docs:review [path]` loads the `doc-writer` skill and applies its review rubric (escalating to the agent for large sites); `/api-docs:sync [path]` dispatches the agent to run its sync workflow after an API/model change.

| Skill | Owns |
| ----- | ---- |
| `twoslash` | The `with-api` code-fence contract, Twoslash notation, generated-example transforms (references: `notation`, `generated-examples`, `recipes`) |
| `plugin-config` | The `rspress-plugin-api-extractor` package's own configuration, theming, and `.api.json` model plumbing (references: `config-reference`, `recipes`, `model-plumbing`, `theming`, `llms`, `troubleshooting`) |
| `doc-writer` | Editorial craft — page skeletons, review rubric, sync workflow, cross-linking; the `with-api` editorial discipline (references: `page-skeletons`, `review-rubric`, `sync-workflow`, `cross-linking`) |
| `rspress-core` | Package-agnostic RSPress 2.x craft — routing/nav, components, frontmatter, `--rp-*` theming, i18n/multiVersion (references: `routing-nav`, `components`, `frontmatter`, `theming`, `i18n-multiversion`, `deploy`) |

Remaining: an optional standalone scaffolding command (scaffolding is agent-invoked by design for now) and a dogfood validation pass over consumer sites.

Roadmap: `ROADMAP.md`. Design spec: `docs/superpowers/specs/2026-07-14-api-docs-plugin-design.md`.

## Distribution & Versioning

Distributed from the **spencerbeggs/bot marketplace**. The plugin is versioned
in **lockstep** with `rspress-plugin-api-extractor`: in `.changeset/config.json`
the package lists `plugin/**` under `additionalScopes` and bumps
`plugin/.claude-plugin/plugin.json` (`$.version`) via `versionFiles`, so CI keeps
the manifest version equal to the package version. **There is no separate
changeset target for this plugin — a change under `plugin/` gets a changeset for
`rspress-plugin-api-extractor`.**

## Layout

| Path | Purpose |
| ---- | ------- |
| `.claude-plugin/plugin.json` | Plugin manifest (name `api-docs`) |
| `agents/rspress-docs.md` | Docs-authoring subagent; force-loads all four skills |
| `commands/*.md` | Slash commands `/api-docs:review` and `/api-docs:sync` |
| `skills/<skill>/SKILL.md` | Model-invoked skill gate + essentials (see Status) |
| `skills/<skill>/references/` | Deep-dive reference docs loaded on demand |
| `ROADMAP.md` | Phased build-out plan for the plugin |
| `hooks/hooks.json` | Hook registration (SessionStart → `announce.sh`) |
| `hooks/session-start/announce.sh` | Orientation hook |
| `hooks/lib/hook-output.sh` | `emit_noop` / `emit_allow` / `emit_deny` / `emit_context` |
| `hooks/lib/hook-debug.sh` | `hook_error` / `hook_debug` |
| `hooks/fixtures/` | Hook envelope fixtures for tests |
| `__test__/*.bats` | bats coverage for the hooks |

## Conventions

- **Fail open.** A hook that cannot parse its envelope must `emit_noop` and exit
  `0` — never block the session. `announce.sh` does this when `jq` is missing.
- **Emit through `hooks/lib/`.** Do not hand-roll hook JSON; use `emit_context`
  and friends so the output envelope stays valid.
- **Producer pattern.** `announce.sh` persists `API_DOCS_PROJECT_DIR`,
  `API_DOCS_DATA_DIR`, and `API_DOCS_PLUGIN_ROOT` to the per-session env file and
  `$CLAUDE_ENV_FILE`. No reader hook consumes them yet; keep the `API_DOCS_`
  namespace when one is added.
- Reference paths inside hooks via `${CLAUDE_PLUGIN_ROOT}`, not relative guesses.

## Commands

```bash
pnpm claude          # Load this plugin (claude --plugin-dir=plugin)
bats plugin/__test__ # Run the hook tests (bats, not Vitest)
```
