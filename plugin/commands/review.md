---
description: Editorially review an rspress-plugin-api-extractor docs site against the doc-writer review rubric
argument-hint: "[path]"
---

# Review an API-docs site

Review the human-authored documentation of this RSPress site (built with `rspress-plugin-api-extractor`) for editorial quality.

**Scope:** `$1` if a path is given (a file or directory); otherwise the site's hand-written docs tree (guides, overviews, concept/example pages). Never review the plugin-generated `api/` tree as prose — it is build output. Only verify that links pointing *into* it resolve.

**Standard:** Load the `doc-writer` skill and apply its review rubric (`references/review-rubric.md`) as the authority. That reference owns the severity ladder and the pass checklist — follow it rather than inventing criteria, and do not restate it here. For a large, multi-page site, dispatch the `rspress-docs` agent to run the rubric instead of reviewing inline.

**Watch the two things a green build hides:** many sites set `checkDeadLinks: false`, so verify links by hand; and a wrong generated reference page or a broken TSDoc `@example` is an **upstream finding** (fixed in the documented package's source, not the site), never a site edit.

**Report** findings grouped by severity, most severe first, each with file and line. End with a one-line summary: counts per severity and the single highest-priority action.
