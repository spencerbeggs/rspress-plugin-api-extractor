---
name: doc-writer
description: Write, review, and organize the human-authored prose around a generated API reference on an rspress-plugin-api-extractor site. Use when authoring or editing a guide, concept, example, or package-overview page; deciding a site's information architecture and sidebar mount (guides spine + overview + generated api tree); setting page frontmatter (title, one-sentence description); deciding whether a code snippet earns a with-api fence versus a plain fence; writing a migration note for a breaking API change; cross-linking prose into the generated reference; or running an editorial review of a docs site. Do NOT use for the mechanics inside a with-api fence — notation, @errors, ---cut---, why a block will not compile (see twoslash); for ApiExtractorPlugin configuration, routes, theming or model plumbing (see plugin-config); or for generic RSPress routing, _nav.json, components, or frontmatter fields beyond title/description (see rspress-core).
---

# doc-writer

Load this skill when you are writing or editing the **human-authored** documentation on a site built with `rspress-plugin-api-extractor` — the guides, overviews, concept and example pages a person writes by hand — or reviewing a site's prose for quality. It owns the editorial craft: what to write, how to structure it, and when a code snippet earns a live `with-api` fence.

It does not touch the generated reference tree (that is build output — see below) and it does not own code-fence mechanics.

Route these adjacent decisions elsewhere:

- The mechanics **inside** a `with-api` fence — notation (`^?`, `@errors`, `---cut---`), why a block fails to compile, what strips on copy — see `twoslash`. This skill decides *whether* a snippet gets `with-api`; `twoslash` handles it once you have.
- `ApiExtractorPlugin` configuration — options, routes, `--api-*` theming, model plumbing — see `plugin-config`.
- Generic RSPress mechanics — `_nav.json`, sidebar field semantics, built-in components, frontmatter fields beyond `title`/`description` — see `rspress-core`.

## Boundary: looks similar, is not

This skill and `twoslash` both concern code examples, so they read as one job. They are not.

- **doc-writer owns the editorial *when*:** does this snippet deserve to be a live, type-checked `with-api` block at all? That is a judgment about honesty and audience, made before any fence exists.
- **twoslash owns the *how*:** given that a block is `with-api`, what notation goes in it, why it compiles or fails, what the reader copies.

Decide with this skill; author with `twoslash`. A snippet that should stay a plain illustrative fence never reaches `twoslash` at all.

## Site information architecture

A site built with this plugin has three tiers. Keep them distinct; readers navigate down through them.

1. **A guide spine** — hand-written pages that teach the package by task (getting started, then one page per real workflow). This is where a reader lands and learns.
2. **A per-package overview** — one page that frames the package: what it is, why it exists, install, a quick start, and the topic sections that link into the guides and reference. On a portal, one overview per package.
3. **The generated reference** — the plugin-owned `api/` tree, one page per API item. You link *into* it; you never author *inside* it.

Mount the three tiers in the site's **root `_meta.json`** (array form — see `rspress-core`) with one entry each:

```json
[
  { "type": "file", "name": "index", "label": "Home" },
  { "type": "dir", "name": "guides", "label": "Guides", "collapsible": true, "collapsed": false },
  { "type": "dir", "name": "api", "label": "API Reference", "collapsible": true, "collapsed": true }
]
```

The `api` dir entry is the only place you touch the generated tree — it mounts the plugin's output into the sidebar. Everything under it is build output.

## The generated tree is read-only

The plugin rewrites changed pages under `api/` and deletes stale ones on every build, so any hand-edit there is silently reverted. The API prose comes from the documented package's TSDoc. When the reference is wrong, the fix is upstream — the source comment and a model rebuild — reported as a finding, never patched in the generated MDX. Your editorial work lives entirely in tiers 1 and 2.

## Frontmatter convention

Every hand-written page carries two frontmatter fields and, usually, no more:

- `title` — the page's short title (also the sidebar/tab label).
- `description` — one sentence, written to stand alone as an Open Graph / search snippet. Say what the page gives the reader, in a full sentence, not a keyword list.

```yaml
---
title: Getting started
description: Create a pipeline, run it, and inspect its status — the core kitchensink workflow end to end.
---
```

Fields beyond these two (layout, hero, `pageType`) are generic RSPress frontmatter — see `rspress-core`.

## The with-api discipline rule

This is the editorial call this skill exists to make.

- **Real, importable code gets `with-api`.** If a snippet imports from the documented package and a reader could run it, mark the fence `with-api` so it is type-checked against the real API model and stays honest as the package changes. This is the default for any example built from the package's public surface.
- **Shape sketches stay plain fences.** Pseudo-code, a JSON/config fragment, a partial signature written to illustrate a shape, or a snippet that references symbols the package does not export — none of these should compile, so none should be `with-api`. A plain ` ```ts ` fence is correct; forcing `with-api` onto them produces noise errors that erode trust in the ones that matter.

The test is one question: *should this compile against the real package?* Yes → `with-api` (then hand off to `twoslash`). No → plain fence. Never reach for `with-api` to make a non-program "look rigorous"; a red squiggle on a snippet that was never meant to run is worse than a plain fence.

> **Trap:** ` ```typescript twoslash vfs ` is dead pre-1.0 syntax. If you find it while editing or reviewing an existing page, it is a broken block silently no longer type-checking — replace the meta with `with-api`. The mechanics belong to `twoslash`; flagging it is editorial.

## The API-reference handoff

A guide or overview teaches a slice; the generated reference is the authority for everything. Close hand-written pages by handing the reader off to it, so prose and reference stay in their lanes:

- End a guide with a "Next steps" / "Learn more" list that includes an absolute link into the reference (`[API reference](/my-library/api)`).
- When prose names a type it does not fully document, link that mention to its generated page rather than re-documenting it inline.

This keeps guides short and lets the reference carry exhaustive detail — the two never compete to be the source of truth. Link construction and the hub-table pattern are in `references/cross-linking.md`.

## Common mistakes

- **Hand-editing a generated `api/` page.** It is reverted on the next build; the fix is the source TSDoc plus a model rebuild, raised as a finding.
- **Forcing `with-api` onto a shape sketch.** A snippet that was never meant to compile earns a red squiggle that trains readers to distrust the examples that are real. Plain fence.
- **Leaving a `twoslash vfs` block in an edited page.** Dead syntax — it silently stopped type-checking. Convert to `with-api`.
- **Re-documenting a type inline instead of linking to its reference page.** Prose drifts from the model; link the mention and let the generated page be authoritative.
- **A guide with no handoff.** A reader who finishes the prose should be pointed at the reference, not left at a dead end.
- **A `description` that is a keyword list, not a sentence.** It ships as the OG/search snippet; write it to read as one standalone sentence.
- **Orphaned pages.** A page not reachable from `_meta.json` or a hub link is invisible; every hand-written page needs a route in.

## Reference map

Load on demand; none is required to write a first page. Each answers a narrower question than this file.

- `references/page-skeletons.md` — the Concept / Guide / Example page structures with content-source mapping, and the package-overview template.
- `references/review-rubric.md` — the editorial-review severity ladder (Critical → Low) and the pass checklist.
- `references/sync-workflow.md` — the "the API changed, update the prose" flow grounded on the plugin's snapshot statuses, with the migration-note pattern.
- `references/cross-linking.md` — absolute route links, hub tables, guide↔reference bridges, and the known-issues genre (status-stamped error signatures).
