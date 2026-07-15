---
description: Update an rspress-plugin-api-extractor docs site's prose after an API/model change
argument-hint: "[path]"
---

# Sync an API-docs site after an API change

Dispatch the `rspress-docs` agent to run its sync workflow on this RSPress site (built with `rspress-plugin-api-extractor`): the documented package's API model changed, and the hand-written guides and overviews around the generated reference may now be stale.

Hand the agent the scope — `$1` if a path is given, otherwise the whole site — and let it run its own loop. The judgment-heavy work is the agent's, not this command's: deciding what changed, which prose it affects, and how to write the migration notes. **Do not do the sync inline.**

The agent will rebuild the model and docs, read the plugin's new/modified/unchanged page classification from the generated-tree diff, find the hand-written prose the change made stale, update it (with before/after migration notes for breaking changes, preserving editorial content), validate, and report. It touches only the human-authored tiers — never the generated `api/` tree or the package source.

Launch the `rspress-docs` agent now and relay its report, keeping upstream findings (a broken `@example`, a renamed export the model no longer matches) clearly separated from the prose it fixed.
