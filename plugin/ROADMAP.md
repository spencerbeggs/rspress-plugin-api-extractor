# api-docs Roadmap

Long-term plan for the api-docs Claude Code plugin — the documentation-craft
companion to `rspress-plugin-api-extractor`. The design spec behind this
roadmap lives in the monorepo at
`docs/superpowers/specs/2026-07-14-api-docs-plugin-design.md`.

The plugin is versioned in lockstep with the npm package; a change here ships
with the package release train.

## Phase 1 — Foundations

- [x] Plugin scaffold: manifest, SessionStart orientation hook, bats tests
- [x] `skills/twoslash/` — full skill (with-api fence contract + notation,
      generated-example transforms, recipes)
- [x] Gate stubs: `skills/rspress-core/`, `skills/plugin-config/`,
      `skills/doc-writer/`
- [x] `skills/plugin-config/` — full content (config reference, five recipes,
      model plumbing, `--api-*` theming, llms, troubleshooting)
- [x] `skills/doc-writer/` — full content (page skeletons, review rubric,
      sync workflow, cross-linking)
- [x] `skills/rspress-core/` — full content (routing/nav, components,
      frontmatter, `--rp-*` theming, i18n/multiVersion; deploy stub)

## Phase 1b — The agent

- [x] `agents/rspress-docs.md` — force-loads all four skills via frontmatter
      `skills:`; orient → match conventions → write → validate → report;
      explicit boundaries (no TSDoc/package-source edits, no generated-tree
      edits). Built only after all four skills have real content.
- [x] Shorten the SessionStart hook message to one line naming the agent
      (the message is a per-session tax for every user).

## Phase 2 — Workflows

- [x] `/api-docs:review [path]` — thin command delegating to the doc-writer
      review rubric
- [x] `/api-docs:sync` — thin command front-door handing off to the agent
- [ ] Site scaffolding — agent-invoked (needs the orient step); standalone
      command only if a fast path is wanted later
- [ ] Dogfood pass over the first consumer sites as validation

## Phase 3 — Expansion (stubs)

- [ ] Deploy guides: GitHub Pages, Cloudflare (`rspress-core/references/deploy.md`)
- [ ] Search (Algolia), RSS, sitemap composition guidance
- [ ] Open Graph image pipeline guidance
- [ ] i18n authoring deep-dive (translation workflow, not just config)
- [ ] Versioned-docs authoring deep-dive (migration-note genre)
- [ ] Vendored-upstream tier: teach skills to consult vendored rspress/shiki/
      twoslash sources when a repo has them
- [ ] Upstream investigation: generated cross-links vs RSPress
      `checkDeadLinks` so sites can stop disabling it
