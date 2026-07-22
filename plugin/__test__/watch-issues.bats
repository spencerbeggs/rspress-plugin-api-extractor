#!/usr/bin/env bats

setup() {
	MONITOR="${BATS_TEST_DIRNAME}/../monitors/watch-issues.mjs"
	FIXTURE="$(mktemp -d)"
	mkdir -p "${FIXTURE}/.api-docs/build"
}

teardown() {
	rm -rf "${FIXTURE}"
}

@test "reports a non-zero doc issue count in --once mode" {
	cat > "${FIXTURE}/.api-docs/build/issues.json" <<'JSON'
{ "generatedAt": "t", "package": "@site/x", "target": "prod",
  "warnings": [ { "source": "twoslash", "level": "warn", "text": "Cannot find name 'Z'.", "code": "TS2304", "file": "a.mdx", "line": 1, "column": 1 } ],
  "errors": [], "suppressed": [] }
JSON
	run env CLAUDE_PROJECT_DIR="${FIXTURE}" node "${MONITOR}" --once
	[ "$status" -eq 0 ]
	[[ "$output" == *"@site/x has 1 doc-build issue in prod"* ]]
}

@test "is silent when there are zero issues" {
	cat > "${FIXTURE}/.api-docs/build/issues.json" <<'JSON'
{ "generatedAt": "t", "package": "@site/x", "target": "prod", "warnings": [], "errors": [], "suppressed": [] }
JSON
	run env CLAUDE_PROJECT_DIR="${FIXTURE}" node "${MONITOR}" --once
	[ "$status" -eq 0 ]
	[ -z "$output" ]
}
