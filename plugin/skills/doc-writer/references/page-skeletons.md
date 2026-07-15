# Page skeletons

Structures for the four hand-written page genres, each with where its content comes from and how its code blocks should behave. Load this when starting a new page from scratch. Code-fence mechanics are `twoslash`'s; the `with-api`-vs-plain call is in the main skill's discipline rule.

All code examples below follow that rule: a snippet built from the documented package's real, importable surface is a `with-api` fence; a shape sketch is a plain fence.

## Concept page

Explains one idea — a mental model, an architecture, "how X works" — rather than a task.

1. **Opening** — what the concept is and why it matters, in one short paragraph.
2. **Understanding** — the plain explanation, no code yet.
3. **How it works** — the technical detail, with a `with-api` example that shows the concept in real types.
4. **Common patterns** — two or three ways the concept shows up in practice.
5. **Related concepts** — links to sibling concept/guide pages.
6. **API reference** — link the types named here to their generated pages.

**Content sources:** design docs (architecture sections), existing examples, the shape of the generated reference. **Code:** demonstrate the concept and show type inference; keep it minimal.

## Guide page

Walks a reader through a task, start to finish. This is the spine of the site.

1. **Introduction** — what the reader will have accomplished by the end.
2. **Prerequisites** — what must be true first (install, config, prior guide).
3. **Steps** — three to five numbered steps, each with a `with-api` block that builds on the last.
4. **Complete example** — one full, runnable `with-api` block assembling the steps.
5. **Troubleshooting** — the two or three ways this task commonly goes wrong.
6. **Next steps** — a short list ending in the API-reference handoff.

**Content sources:** the package's usage patterns, its README, real integration code. **Code:** build progressively — each step compiles on its own, and the complete example is the sum. The in-repo `sites/basic/docs/guides/getting-started.mdx` is the worked model: `title` frontmatter, a one-paragraph intro, one `## section` per step, each with a `with-api` fence carrying `^?` queries.

## Example page

Answers "how do I do X" with a single worked solution rather than a full walk-through.

1. **Scenario** — the problem, in a sentence or two.
2. **Solution** — the annotated `with-api` code that solves it.
3. **Explanation** — how the solution works, keyed to the code.
4. **Variations** — alternative approaches or parameter choices.
5. **Related examples** — links to adjacent examples and the reference.

**Content sources:** real use cases, test files, integration code. **Code:** complete and production-ready — an example page's snippet is something a reader copies wholesale, so it must run as written.

## Package-overview template

One page per package (tier 2 of the site IA). It frames the package and routes readers down into the guides and reference. The section order is load-bearing — a reader scans top to bottom deciding whether to invest.

````markdown
---
title: "@scope/package-name"
description: One standalone sentence — what the package is and who it is for.
---

# @scope/package-name

One-line statement of what the package is, then a sentence or two expanding it —
the primary export, the problem it solves.

<!-- when it is a transitive/companion package: -->
This package arrives automatically as a dependency of `@scope/parent`. Install it
directly only when <the direct-use case>.

## Features

- **`PrimaryExport`** — the one-line role of the main thing
- **Secondary helpers** — the supporting surface, named
- **Contract / re-exports** — what a consumer imports from here

## Install

```bash
npm install @scope/package-name
# or
pnpm add @scope/package-name
```

## Quick start

<the smallest real, runnable with-api block that produces a result>

## <Topic section, one per real workflow or failure mode>

Prose anchored on something a reader actually does or hits, each with a with-api
example. Order these by how early a reader needs them, not by API structure.

## Learn more

- [Guides](/package-name/guides/getting-started)
- [API reference](/package-name/api)
- [All packages](/packages)   <!-- portal only -->
````

Anchor the topic sections on **real workflows and failure modes**, not on the package's module layout — a reader arrives with a task, not a file tree. Every overview ends in the `## Learn more` handoff that includes the absolute link into the generated reference. The vitest-agent `@vitest-agent/reporter` overview is the reference implementation of this shape.

## What every hand-written page shares

- `title` + one-sentence `description` frontmatter (main skill).
- A single `#` H1 matching the title, then a clean `##` → `###` heading hierarchy (no skipped levels).
- Real, importable examples as `with-api`; shape sketches as plain fences.
- A route in (a `_meta.json` entry or a hub link) so it is not orphaned.
- A handoff into the generated reference where the page's topic meets the full API.
