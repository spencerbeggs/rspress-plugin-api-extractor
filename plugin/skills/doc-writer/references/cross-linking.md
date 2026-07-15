# Cross-linking

How hand-written prose connects to the generated reference and to itself: link form, hub tables, guide↔reference bridges, and the known-issues genre. Load this when wiring pages together or building a landing/overview page. Note: inside a `with-api` code block, type references auto-cross-link — that is `twoslash`'s job; this reference is about the links you write in prose.

## Link into the reference with absolute routes

The generated pages live at stable, computed routes. Link to them with an **absolute** path from the site root, never a relative `../api/...`:

```markdown
The [Pipeline](/api/class/pipeline) class composes a source and a transform.
Its [execute](/api/class/pipeline#execute) method runs the pipeline.
```

The route shape is `{baseRoute}/{apiFolder}/{category-folder}/{item-name-lowercased}`, with class/interface members as `#member` anchors — `/api/class/pipeline`, `/my-library/api/interface/config#timeout`. The exact derivation (category folders, base-route defaults) is `plugin-config`'s; for writing links, the practical rule is: lowercase the item name, put it under its category folder, anchor members with `#`.

**Absolute, because relative breaks.** On a versioned or i18n site the same guide is served under several prefixes (`/v1/...`, `/zh/...`); a relative link resolves differently under each, an absolute one resolves the same everywhere.

When prose names a documented type, link that first mention to its reference page instead of re-explaining it. The reference is authoritative; prose borrows from it.

## Hub tables

An overview or index page routes readers with a **hub table** — a small table mapping a task or topic to the page that covers it. It turns a landing page into a directory:

```markdown
| To… | Start at |
| --- | --- |
| Build your first pipeline | [Getting started](/guides/getting-started) |
| Handle errors | [Error handling](/guides/error-handling) |
| Look up a type | [API reference](/api) |
```

A hub table is how a reader with a goal finds their entry point without scanning the sidebar. Keep the left column task-shaped ("Handle errors"), not structure-shaped ("The error module").

## Guide↔reference bridges

The two tiers point at each other in one direction each, so neither tries to be the other:

- **Guide → reference (the handoff).** A guide teaches a slice and hands off: a "Next steps"/"Learn more" list ending in `[API reference](/pkg/api)`, plus inline links on the types it names. See the main skill's handoff rule.
- **Reference → guide (upstream only).** The generated reference is build output — you cannot add links to it. A "see the guide" bridge from reference to prose therefore lives in the source TSDoc (`@see`, `{@link}`), reported as an upstream suggestion, not edited into the generated page.

So bridges you author all run guide→reference; the reverse direction is an upstream finding, never a hand-edit of the `api/` tree.

## The known-issues genre

A known-issues (or troubleshooting) page complements the reference by cataloguing **error signatures** a reader will actually paste into search — the things the generated API docs cannot cover because they are runtime symptoms, upstream quirks, or already-fixed bugs.

Key each section on the literal signature and stamp it with a **status**, so a reader knows in one glance whether it is their problem to fix:

```markdown
## `Route collision: … both resolve to /api/…`

**Status: live.** Two distinct items resolve to the same route. Rename one or
remap categories so they land in different folders — see [troubleshooting](…).

## `Cannot find name 'ZodType'` in a with-api block

**Status: resolved in config.** The external package's types were not loaded.
Add it to `externalPackages`. Not a plugin bug.

## `checkDeadLinks` passes but a link is broken

**Status: expected.** The site sets `checkDeadLinks: false`; RSPress is not
checking. Verify links by hand.
```

Status vocabulary that carries its meaning: **live** (a real current issue, here is the fix), **resolved** (fixed in a shipped release — update the package), **inherent/upstream** (a dependency's behavior, not this project's bug), **expected** (working as designed under this config), **misconception** (not actually a bug). Each section is the signature, the status, and the one action the reader takes. The vitest-agent `known-issues.mdx` page is the worked model of this genre.

## What not to do

- **No relative links into `api/`.** They break under version/locale prefixes; use absolute routes.
- **No re-documenting a type in prose.** Link its reference page; a prose copy drifts from the model on the next build.
- **No hand-added "back to guide" links in the generated tree.** That is a source-TSDoc change reported upstream, not an edit to build output.
- **No status-free known-issues entry.** An error signature with no status stamp leaves the reader unsure whether to act, wait, or ignore.
