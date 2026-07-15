---
name: twoslash
description: Write and fix type-checked code examples in RSPress docs sites that use rspress-plugin-api-extractor. Use when adding or editing a code fence in a docs page, when a with-api block reports Twoslash/TypeScript errors, when choosing notation (^?, @errors, @noErrors, ---cut---), or when copy-button output includes unwanted lines. Do NOT use for deciding whether a snippet deserves with-api at all (editorial call - see doc-writer) or for TypeScript questions outside documentation code blocks.
---

# Twoslash

Load this skill when you are inside a documentation code fence — authoring one, editing one, or chasing a Twoslash/TypeScript error that a `with-api` block reported.

It owns three things: the fence contract itself, the notation directives you write inside a fence, and how a generated TSDoc `@example` differs from a fence you write by hand.

It does not own the editorial call of whether a snippet deserves `with-api` treatment in the first place — that judgment call happens before this skill is relevant, not inside it.

Route these adjacent decisions elsewhere:

- Whether to add `with-api` to a snippet at all is an editorial judgment — see `doc-writer`.
- Plugin configuration — `externalPackages`, `tsconfig`, Shiki theming — see `plugin-config`.
- RSPress mechanics outside code fences — routing, frontmatter, components — see `rspress-core`.

## The `with-api` contract

A fence whose meta string contains `with-api` is type-checked against the documented package's real API model and rendered with hover tooltips and cross-links to the generated reference pages.

This is the contract you are relying on every time you tell a reader "this example is real" — the type-checking is what makes that claim true, not a stylistic choice.

### Trigger, languages and scope

1. **Trigger:** the meta string on the fence must contain the literal substring `with-api` — for example, a fence opened with `ts with-api`. A fence without it is never touched by this pipeline.

2. **Supported languages:** `ts`, `typescript`, `js`, `javascript`, `node`, `tsx`, `jsx`. These are the only language tags the plugin recognizes for `with-api` processing.

3. **Unsupported languages fall back silently:** any other language tag, or a fence missing `with-api` in its meta string, is left as a plain fence — no type-checking, no hover tooltips, no error raised.

4. **Scope inference:** the API scope used for cross-linking is the path segment immediately after `docs/en/` (or `website/docs/en/`) in the file's own path.

5. **A guide outside that path shape still type-checks.** Twoslash does not need the scope for compilation — but the block loses cross-linking, because the plugin has nothing to key the type-reference lookup on.

### Errors and formatting

1. **Errors do not fail the build.** A Twoslash/TypeScript error inside a `with-api` block renders inline — the error squiggle, the message — and shows up as a warning in the build summary, not a build failure.

2. **Treat a reported error as a correctness signal**, something to fix in the example, not as a merge blocker on its own — the build already succeeded around it.

3. **Formatting:** every `with-api` block is run through Prettier before it renders.

4. **Formatting failure is non-fatal too:** if Prettier fails on a block, it falls back to your unformatted source rather than dropping the example.

> **Trap:** `typescript twoslash vfs` is dead pre-1.0 meta syntax. If you find it in an existing guide, replace it with `with-api` — the current fence contract does not recognize `twoslash` or `vfs` as meta keywords, so a block using them is silently never processed and quietly stops type-checking.

## The complete-program rule

Every `with-api` block you author must compile as a standalone program. This is what makes the type-checking meaningful — the block runs against the real API model, not a sandbox that quietly fills in gaps for you.

Think of the fence as the entire file TypeScript sees, not a snippet pasted into an already-set-up project — because that is exactly what it is.

1. **Explicit imports only.** Import every symbol you use from the documented package by name; nothing is in scope by default.

2. **No invented symbols.** If a symbol is not exported from the package, it does not exist in the block, no matter how natural it would read in the surrounding prose.

3. **No implicit setup.** There is no hidden preamble for a hand-authored fence — what is on the page is exactly what gets type-checked, top to bottom.

4. **Generated `@example` blocks work differently.** The plugin auto-inserts an `import { Thing } from "package-name"` line for a generated TSDoc example, but only when one is not already present in the source comment.

5. **Generated examples also default to `@noErrors`.** A TSDoc example is often a fragment pulled from a doc comment rather than a full program, so error suppression is applied automatically to keep fragments from failing the build.

6. **Those two defaults are generation-only.** Auto-import and `@noErrors` apply exclusively to generated `@example` output — never to a fence you write by hand in a guide.

7. **Copying a generated example forfeits its defaults.** If you paste a generated example into a hand-authored guide to build on it, you inherit none of the auto-import or `@noErrors` behavior: add the missing imports and any `@errors`/`@noErrors` annotations yourself, or the block fails to compile as written.

## What the reader sees vs. what they copy

Display and copy are two different renderings of the same block, produced from the same source at build time.

Neither one is the "real" version and the other a derivative — both are generated outputs of the fence you wrote, just for different audiences and different purposes.

1. **The rendered display keeps every Twoslash artifact** — hover tooltips, underlines, inline type queries — the full interactive treatment a reader sees on the page.

2. **The copy button output is a separately stripped rendering.** Cut ranges are applied first, and then every remaining directive line is removed outright, so the reader never copies a `// @noErrors` line or a `^?` query.

3. **Both transformations run from the same source block.** You author one fence; the plugin derives both outputs from it — you never maintain a display version and a copy version by hand.

4. **The practical consequence is where to put boilerplate.** Hide setup you don't want the reader to see — throwaway config, unrelated imports, scaffolding — behind `// ---cut---`.

5. **A cut range disappears from both outputs at once.** It is gone from the rendered display and from the copied snippet, so the block you show and the snippet the reader takes away can differ without extra authoring effort.

## Notation quick reference

Every row below is a directive you write as a comment inside a `with-api` fence; none of them work outside one.

| Directive | Effect |
| --- | --- |
| `^?` | Reveals the inferred type of the expression on the line above the caret. |
| `^\|` | Simulates editor autocomplete at that column. |
| `^^^` | Highlights the span of characters above the carets. |
| `@errors: NNNN` | Declares an expected compiler error code so it renders as an annotation instead of a build warning. |
| `@noErrors` | Suppresses all compiler error reporting for the block. |
| `@filename: x.ts` | Starts a new virtual file within the same block. |
| `---cut---` / `---cut-before---` | Removes this line and everything above it, from both display and copy output. |
| `---cut-after---` | Removes this line and everything below it, from both display and copy output. |
| `---cut-start---` … `---cut-end---` | Removes the bracketed range, from both display and copy output. |

Every directive is written as a `//` comment. The leading `//` accepts an optional space before the directive itself — `// ^?` and `//^?` are both recognized — so match whichever style your surrounding lines already use; neither form is more correct than the other.

This table is a lookup aid, not the full contract. Full semantics, spacing edge cases, and how directives interact when combined live in `references/notation.md` — read it before reaching for a directive you have not used before.

## Common mistakes

The fastest way to lose time on a `with-api` block is one of these.

- **Using `typescript twoslash vfs` meta syntax.** It is dead pre-1.0 syntax that this plugin's fence contract does not recognize; the block silently stops being processed instead of erroring loudly, so nothing on the page tells you it happened.

- **Treating a Twoslash error as a build blocker.** It renders inline and logs a warning, not a failure — chase it down because it is wrong, not because CI is red.

- **Reusing a generated `@example` without adding imports.** The auto-import and `@noErrors` conveniences only apply to generated output; a hand-authored fence built from a copied example needs its own imports and error annotations.

- **Leaving setup boilerplate visible instead of cutting it.** Anything you do not want the reader to see or copy belongs behind `// ---cut---`, not just formatted to look unobtrusive.

- **Assuming a fence outside `docs/en/` (or `website/docs/en/`) fails to compile.** It compiles fine; it just renders without cross-linked type references, which is easy to miss when skimming a preview.

- **Assuming `^?` needs a space after `//` to work.** It doesn't: `// ^?` and `//^?` are recognized identically, so a directive that "looks wrong" spacing-wise is not why it failed to fire.

- **Assuming a Prettier formatting failure drops the example.** It doesn't — the block falls back to your unformatted source, so an oddly indented example on the page is a formatting miss, not a sign the block was skipped.

None of these is a bug in the plugin. Each one is a rule from the sections above, restated here as the mistake it produces when you forget it.

## Reference map

Load these on demand; none of them is required reading to write a first `with-api` block. Each one below answers a narrower question than this file does.

- `references/notation.md` — full directive semantics and spacing rules. Read when a directive is not behaving as this quick table implies, or you need a directive not listed above.

- `references/generated-examples.md` — how TSDoc `@example` blocks transform into rendered output. Read when a generated example looks wrong, or you are deciding what a doc comment's `@example` should contain.

- `references/recipes.md` — worked, hand-authored `with-api` examples. Read when starting a new guide block from scratch, or checking how a directive combination is meant to look end to end.

If none of the three apply — the block already compiles, renders, and copies the way you want — you are done; there is nothing further this skill needs you to read.
