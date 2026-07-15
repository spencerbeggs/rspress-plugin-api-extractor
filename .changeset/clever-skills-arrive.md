---
"rspress-plugin-api-extractor": minor
---

## Features

### api-docs Claude Code plugin — full capability set

The companion `api-docs` Claude Code plugin (versioned in lockstep with this package, shipped under `plugin/`) gained its complete set of model-invoked skills, an orchestrating agent, and two slash commands.

**New skills:**

- `twoslash` — the `with-api` code-fence contract and Twoslash notation reference
- `plugin-config` — the package's own configuration, theming, and model plumbing
- `doc-writer` — editorial craft: page skeletons, a review rubric, the sync workflow, and cross-linking guidance
- `rspress-core` — package-agnostic RSPress 2.x reference: routing/nav, components, frontmatter, `--rp-*` theming, i18n/multiVersion

**New agent:**

- `rspress-docs` — force-loads all four skills for end-to-end documentation work

**New commands:**

- `/api-docs:review` — review generated or hand-written docs against the rubric
- `/api-docs:sync` — sync site docs after an API change

The SessionStart orientation hook was also shortened to name the `rspress-docs` agent instead of duplicating its guidance inline.
