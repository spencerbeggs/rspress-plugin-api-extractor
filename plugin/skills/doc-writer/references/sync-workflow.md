# Sync workflow

The flow for "the API changed — now bring the prose back in line." Load this after a package's `.api.json` was rebuilt and the hand-written guides may have gone stale. The generated reference updates itself; your job is the human-authored tiers around it.

## The change signal is the plugin's own, not file mtimes

The plugin regenerates the reference on every build and classifies each page as **new**, **modified**, or **unchanged** — it rewrites only changed pages, leaves unchanged ones untouched (files and `article:modified_time` preserved), and deletes stale ones. That classification *is* your change signal; do not diff filesystem timestamps.

To see what actually changed after a model rebuild + docs build:

- The build summary reports the counts (`files.new`, `files.modified`, `files.unchanged`) — how much moved.
- `git diff` on the generated `api/` tree shows exactly which items moved: unchanged pages were not rewritten, so the diff is precisely the changed API surface. New pages are additions; deleted pages are removals.

Read that diff as your worklist. Each changed/added/removed generated page is an API surface whose surrounding prose may now be wrong.

## The flow

1. **Rebuild the model, then the docs.** A stale model produces a stale diff — see `plugin-config` for build ordering.
2. **Take the worklist** from the generated-tree diff: which items are new, modified, removed.
3. **Find the prose that references each changed item.** Grep the guide and overview tiers for the type name and the package import. Those are the pages at risk.
4. **Update the affected prose and examples.** Fix a `with-api` block whose imports or signatures the new model contradicts; update a described behavior that changed. A `with-api` block that no longer compiles against the new model is the fastest detector that prose went stale.
5. **Classify the change** and act by kind (below).
6. **Re-run the review rubric** on every page you touched (`references/review-rubric.md`).

## By change kind

| Kind | What the prose needs |
| --- | --- |
| **Non-breaking** (added optional param, new overload) | Update the example silently; fix any cross-reference. No callout. |
| **Breaking** (renamed/removed export, changed signature) | A migration note (below). Update every example. Link to the release. |
| **New API** | Consider a new guide or example page; add it to the overview's Features and a topic section; refresh the "Learn more" links. |
| **Removed API** | Remove or mark the references; suggest the replacement; leave no example importing a symbol that no longer exists. |

## The migration-note pattern

A breaking change gets a visible, self-contained note the reader cannot miss — a callout container with before/after code and a pointer to the release. The container syntax is generic RSPress (see `rspress-core`); the genre is editorial:

````markdown
:::warning Breaking change in v2
`Pipeline.create(source, fn)` replaces the removed `new Pipeline(source).map(fn)`.

Before:

```ts
const p = new Pipeline(source).map(fn);
```

After:

```ts with-api
import { Pipeline, JsonSource } from "my-library";
const p = Pipeline.create(new JsonSource("./data.json"), fn);
```

See the [v2 release notes](/changelog#v2) for the full list.
:::
````

Note the asymmetry: the **before** block is a plain fence (it references the old, removed API and cannot compile against the current model), while the **after** block is `with-api` (it is real, current code and must stay honest). This is the discipline rule applied to a migration — never mark the "before" `with-api`, or the note fails the build on code you deliberately deprecated.

On a versioned site, the migration note lives on the new version's pages; older versions keep documenting their own API. See the versioned recipe in `plugin-config`.

## Preserve editorial content

Sync touches only what the API change forces. Everything a human added on purpose stays:

- Keep custom sections, hand-written examples, and the page's voice.
- Change only the sentences and blocks that name the changed API.
- Do not regenerate or reflow a whole page because one type in it moved.

The generated reference is the churny tier by design; the guides are stable prose that should change as little as the API forced and no more.
