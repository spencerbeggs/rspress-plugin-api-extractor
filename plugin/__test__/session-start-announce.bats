#!/usr/bin/env bats
# __test__/session-start-announce.bats — coverage for the api-docs plugin's
# hooks/session-start/announce.sh orientation hook.

setup() {
	PLUGIN_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
	SCRIPT="$PLUGIN_ROOT/hooks/session-start/announce.sh"
	FIXTURE="$PLUGIN_ROOT/hooks/fixtures/sessionstart.startup.json"

	# Redirect $HOME so the producer-pattern env-file write lands in a
	# throwaway dir instead of the real ~/.claude/session-env/.
	export HOME="$BATS_TEST_TMPDIR/home"
	mkdir -p "$HOME"
}

@test "announce.sh emits a SessionStart additionalContext message on the happy path" {
	run bash "$SCRIPT" < "$FIXTURE"

	[ "$status" -eq 0 ]
	[ "$(jq -r '.hookSpecificOutput.hookEventName' <<< "$output")" = "SessionStart" ]

	local ctx
	ctx="$(jq -r '.hookSpecificOutput.additionalContext' <<< "$output")"
	[[ "$ctx" == *"api-docs"* ]]
}

@test "announce.sh persists the namespaced session-env producer vars" {
	run bash "$SCRIPT" < "$FIXTURE"

	[ "$status" -eq 0 ]

	local env_file="$HOME/.claude/session-env/test-session-startup/api-docs-hook.sh"
	[ -f "$env_file" ]
	grep -q "^export API_DOCS_PROJECT_DIR=" "$env_file"
	grep -q "^export API_DOCS_DATA_DIR=" "$env_file"
	grep -q "^export API_DOCS_PLUGIN_ROOT=" "$env_file"
}

@test "announce.sh fails open with a plain no-op when jq is unavailable" {
	local no_jq_bin="$BATS_TEST_TMPDIR/no-jq-bin"
	mkdir -p "$no_jq_bin"
	ln -sf "$(command -v dirname)" "$no_jq_bin/dirname"
	local bash_bin
	bash_bin="$(command -v bash)"

	PATH="$no_jq_bin" run "$bash_bin" "$SCRIPT" < "$FIXTURE"

	[ "$status" -eq 0 ]
	# hook-output.sh warns on stderr at source time when jq is missing, and
	# `run` folds stderr into $output — assert on the last line, not $output.
	[ "${lines[-1]}" = "{}" ]
}
