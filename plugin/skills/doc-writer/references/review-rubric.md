# Review rubric

The severity ladder and checklist for an editorial review of a hand-written docs site. Load this when reviewing pages for quality, or before finishing a docs pass. Review only the human-authored tiers (guides, overviews, concept/example pages) — the generated `api/` tree is build output, not something you review for prose.

## Severity ladder

Rank every finding. The ladder decides what blocks a merge versus what is a note.

**Critical — the page is broken.**

- MDX syntax errors (unclosed JSX, malformed fences, invalid component use).
- A `with-api` block that fails to compile when it was meant to be a real program — the reader sees a red squiggle on code you are presenting as correct.
- Broken navigation: invalid `_meta.json`, or a `_meta.json`/hub entry pointing at a file that does not exist.

**High — the page is wrong or unreachable.**

- Missing `title` or `description` frontmatter.
- A broken cross-reference: a link or anchor that does not resolve.
- An incomplete or outdated code example (missing imports, a signature the current model contradicts).
- A dead ` ```typescript twoslash vfs ` block — silently no longer type-checking; convert to `with-api`.

**Medium — the page reads poorly.**

- Weak structure: no clear purpose, missing intro or handoff, sections out of order.
- Readability problems: passive throughout, wall-of-text, unscannable.
- A shape sketch forced into `with-api`, producing a noise error.

**Low — polish.**

- Style, tone, and wording preferences.
- Optional sections that would help but are not required.

## Checklist

Run these passes over each hand-written page. Each maps to a severity above.

### MDX and frontmatter

- Valid YAML frontmatter with `title` and a one-sentence `description`.
- A single `#` H1, then `##` → `###` with no skipped levels.
- No unclosed JSX, no malformed or unlabeled code fences.

### Code fences

- Every real, importable snippet is `with-api`; every shape sketch is a plain fence (the discipline rule).
- No `twoslash vfs` blocks remain.
- `with-api` blocks that should compile do compile; a legitimately-expected error is annotated (a `twoslash` mechanic) rather than left raw.

### Cross-references and anchors

- Internal links resolve to existing pages; anchors exist in their targets.
- Links into the generated reference use absolute routes (`/pkg/api/...`).
- **Check links by hand.** Many sites set `checkDeadLinks: false` (common on i18n sites mid-translation — see `plugin-config`), so RSPress will not catch a broken link for you. Do not assume a green build means the links resolve.

### Navigation and orphans

- Every `_meta.json` is valid JSON in array form (see `rspress-core`).
- Every entry references a file that exists; the generated `api/` dir is mounted with one `dir` entry.
- No orphaned pages — every hand-written page is reachable from `_meta.json` or a hub link.

### Content quality

- The page states its purpose up front and ends with the API-reference handoff.
- Prose is active and scannable; examples are present where they earn their place.
- Types named in prose are linked to their reference pages, not re-documented inline.

## Reporting

Group findings by severity, most severe first, each with file and line. Two things are reported as **findings, never silently fixed in place:**

- **A wrong generated reference page** — the fix is upstream (source TSDoc + model rebuild), outside this site. Name the item and what is wrong.
- **A `with-api` block that cannot be made to compile** because the package's real API does not support what the example claims — that is an API or example-design problem, surfaced with file and line, not worked around by suppressing the error.
