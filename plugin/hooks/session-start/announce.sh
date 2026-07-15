#!/bin/bash
# hooks/session-start/announce.sh — orientation hook for the api-docs plugin.
#
# Announces the plugin is active via additionalContext (a one-line pointer to
# the rspress-docs agent and its skills), and persists the standard SessionStart
# producer env vars (project dir, plugin data dir, plugin root) so a later hook
# can recover them via lib/source-session-env.sh once one exists. No reader hook
# consumes them yet — keep the API_DOCS_ namespace when one is added.
set -euo pipefail

. "$(dirname "$0")/../lib/hook-output.sh"
. "$(dirname "$0")/../lib/hook-debug.sh"

# Fail open: a hook that can't parse its envelope must not block the session.
if ! command -v jq >/dev/null 2>&1; then
	emit_noop
	exit 0
fi

hook_json="$(cat)"
session_id="$(jq -r '.session_id // empty' <<< "$hook_json")"
project_dir="${CLAUDE_PROJECT_DIR:-$(jq -r '.cwd // empty' <<< "$hook_json")}"

# Producer pattern: persist the three canonical paths as namespaced env vars,
# both to the per-session file (read by lib/source-session-env.sh in later
# hook subprocesses) and to $CLAUDE_ENV_FILE (auto-sourced into Bash-tool
# subprocesses). Skipped only if the envelope has no session_id at all.
if [ -n "$session_id" ]; then
	env_dir="${HOME}/.claude/session-env/${session_id}"
	mkdir -p "$env_dir" 2>/dev/null || true
	hook_env_file="${env_dir}/api-docs-hook.sh"

	if {
		printf 'export API_DOCS_PROJECT_DIR=%q\n' "$project_dir"
		printf 'export API_DOCS_DATA_DIR=%q\n' "${CLAUDE_PLUGIN_DATA:-}"
		printf 'export API_DOCS_PLUGIN_ROOT=%q\n' "${CLAUDE_PLUGIN_ROOT:-}"
	} > "$hook_env_file" 2>/dev/null; then
		if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
			for var in API_DOCS_PROJECT_DIR API_DOCS_DATA_DIR API_DOCS_PLUGIN_ROOT; do
				grep -q "^export ${var}=" "$CLAUDE_ENV_FILE" 2>/dev/null || \
					grep "^export ${var}=" "$hook_env_file" >> "$CLAUDE_ENV_FILE"
			done
		fi
	else
		hook_error "announce" "failed writing $hook_env_file"
	fi
fi

message='The api-docs plugin is active: for RSPress documentation work on sites using rspress-plugin-api-extractor, dispatch the rspress-docs agent (or let its skills — twoslash, plugin-config, doc-writer, rspress-core — fire on their own).'

emit_context "SessionStart" "$message"
