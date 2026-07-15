# Twoslash Notation Reference

Every directive here is a `//` comment you write inside a `with-api` fence.
None of it works outside one — in a fence without `with-api` in its meta
string, these lines render as literal comments with no special meaning.

This file is the deep-dive companion to the notation table in `SKILL.md`.
Read it when a directive is not behaving as that table implies, or you need
one it does not list.

## Spacing rules

Twoslash recognizes two different comment shapes, and they tolerate
whitespace differently:

- **Config and cut directives** (`@name`, `@name: value`, `---cut---` and its
  siblings) accept zero or exactly one space after `//`. `// @noErrors` and
  `//@noErrors` both work. `//  @noErrors` (two spaces) does not match —
  Twoslash leaves it as a plain comment, and it silently stops doing
  anything.
- **Query, completion and highlight annotations** (`^?`, `^|`, `^^^`) accept
  any amount of whitespace after `//`. This is intentional: the whitespace is
  how you push the caret sideways to align it under a specific column on the
  line above, so `//    ^?` and `// ^?` are both normal, just pointing at
  different columns.

When a directive silently does nothing, check the space count before
anything else.

## 1. Queries

`^?` and `^|` both work by column position: the character directly under the
`^` on the annotation line is read as a column offset into the line
**directly above it**. Twoslash resolves whatever identifier or expression
sits at that column and reports on it. Line up your leading spaces
carefully — the caret has to sit under the token itself, not float in
whitespace beside it.

- `^?` prints the inferred type of the token at that column.
- `^|` simulates autocomplete at that column: Twoslash asks the language
  service for completions there, filters them by whatever prefix precedes
  the caret, and shows up to five results inline (deprecated completions are
  marked as such).

```ts with-api
// @noErrors
import { createPipeline } from "example-package";

const pipeline = createPipeline();
//    ^?

pipeline.
//       ^|
```

The first annotation reveals `pipeline`'s inferred type. The second asks for
completions on `pipeline.` — `@noErrors` is required here because a bare
trailing `.` is otherwise a syntax error, and queries do not suppress
diagnostics on their own.

## 2. Highlights

`^^^` underlines a span of the line above; add text after the carets to
attach a label instead of a bare underline. The number of `^` characters is
not decorative — it has to match the width of the span you are pointing at,
column for column.

```ts with-api
const magicNumber = 42;
//    ^^^^^^^^^^^
const answer = magicNumber * 2;
//    ^^^^^^ the doubled result
```

The first line underlines `magicNumber` with no label; the second underlines
`answer` and attaches "the doubled result" as a caption. Both forms render
via a CSS class on the underlined span — styling is left to the consuming
theme.

## 3. Config directives

Config directives are `// @name` (boolean flags) or `// @name: value`
(key/value pairs). Any TypeScript compiler option name works here exactly as
it is spelled in `tsconfig.json` — boolean options as a bare flag
(`@strict`, `@noImplicitAny`, `@exactOptionalPropertyTypes`), value options
with a colon (`@target: ES2020`, `@module: esnext`, `@lib: dom`).

`@errors` has sharper semantics than a generic flag. It declares the exact
set of TypeScript error codes this block is allowed to raise, space
separated:

```ts with-api
// @errors: 2322
const total: number = "not a number";
```

Twoslash's own check fails when the block raises an error code that is not
in this list — every diagnostic the block actually produces has to be
declared, or the check flags it as unexpected. A code you list that never
occurs is simply unused, not a failure on its own. (Within a `with-api`
block specifically, any Twoslash diagnostic — declared or not — still
renders inline as a warning rather than blocking the RSPress build; see
"Errors and formatting" in `SKILL.md`.)

`@noErrors` suppresses all diagnostic reporting for the block outright — no
codes to list, nothing gets flagged, useful for fragments that are not meant
to compile cleanly.

`@filename: name.ts` starts a new virtual file inside the same fence.
Everything from that line until the next `@filename` (or the end of the
block) belongs to that file, and Twoslash type-checks and cross-references
every file in the block together — a later file can import from an earlier
one by its filename, minus the extension.

## 4. Cut family

Twoslash always type-checks the **entire** block first, including anything
you are about to hide, and only afterward trims the output and re-offsets
every remaining query and highlight to match. Hidden code still gets
compiled and type-checked exactly like visible code — cutting only removes
it from what a reader sees and copies.

```ts with-api
import { createLogger } from "example-package";

const logger = createLogger({ level: "debug" });
// ---cut-before---
logger.info("Pipeline started");
// ---cut-after---
logger.debug("Everything from here down is hidden too");
```

The reader sees only `logger.info("Pipeline started");` — the import and
setup above `---cut-before---`, and everything below `---cut-after---`,
disappear from both the rendered page and the copy button, but all of it
still had to compile. `---cut---` is a shorthand alias for `---cut-before---`
with the same meaning.

For cutting a range out of the *middle* of a block, pair
`---cut-start---` / `---cut-end---` around it — everything between the pair
is removed, everything outside the pair stays. Multiple pairs are allowed in
one block, each cutting its own separate range.

## 5. Interaction with `with-api`

Every directive above is only ever honored inside a `with-api` fence — that
is the trigger this whole notation system is gated on. Once you are inside
one, all of it applies together: queries, highlights, config directives, and
cuts all run in the same pass.

The copy button, though, is a second, separately stripped rendering of the
same source. Cut ranges are applied first, then **every remaining directive
line is removed outright** — not just cuts, but config lines and
query/highlight annotations too. A reader copying the block never sees
`// @errors: 2322` or `//    ^?`; they only get the real code.

Written — the fence as it appears in the source guide page:

````markdown
```ts with-api
// @errors: 2322
import { createPipeline } from "example-package";

const pipeline = createPipeline();
//    ^?
const total: number = "not a number";
```
````

What the copy button produces — the same block, minus every directive line,
with no `with-api` fence around it because it is no longer notation for
Twoslash, just code to paste:

````markdown
```ts
import { createPipeline } from "example-package";

const pipeline = createPipeline();
const total: number = "not a number";
```
````

The erroring assignment stays — it is real code — but the `@errors`
declaration and the `^?` query both vanish, because they exist to talk to
Twoslash and the reader on the page, not to the code the reader takes away.
