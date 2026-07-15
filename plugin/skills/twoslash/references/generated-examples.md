# Generated TSDoc Example Transforms

This file covers a different code path than `recipes.md`. `recipes.md` is
about fences you write by hand in a guide page. This file is about what
happens automatically to an `@example` block inside a TSDoc comment when the
plugin renders that symbol's generated API reference page.

Read this when a generated example on an API page looks different from what
you wrote in the doc comment, or when you are deciding what an `@example`
block should contain in the first place.

## What gets transformed

Every `@example` tag in a TSDoc comment becomes its own rendered code block
on the generated page, wrapped as an `ApiExample` component. A doc comment
with three `@example` tags produces three independent blocks — each one is
transformed on its own, against its own code, not as a group.

Only TypeScript/JavaScript examples are touched: the fenced code block's
language must be `typescript`, `ts`, `javascript`, or `js`. Any other
language on an `@example` fence — `bash`, `json`, `text`, or no language at
all — passes through completely untouched. No import is added, no error
directive is added, and the content is rendered exactly as written in the
source comment.

## Import injection

For a TypeScript/JavaScript example, the plugin prepends one line:

```typescript
import { <ApiItemName> } from "<packageName>";
```

`<ApiItemName>` is the name of the symbol the doc comment belongs to —
the class, function, interface, or other item whose TSDoc block contains
the `@example`. `<packageName>` is the documented package's own name.

The import is skipped, not added, when the example's code already contains
`from "<packageName>"` or `from '<packageName>'` anywhere in its text
(both quote styles are checked, since TSDoc examples are free-form and
authors reach for either). This check only looks for an import from the
package at all — it does not verify that the specific item being
documented is one of the imported symbols. If your `@example` already
imports a different symbol from the same package, no import line is added,
and if the example also uses the documented item itself without importing
it directly, that reference is unresolved.

The practical consequence: write most `@example` blocks with no import at
all. The plugin adds the one import you need. Only write your own import
line when the example needs additional symbols beyond the item being
documented, or imports something with a different local name.

## Error suppression default

Every generated TypeScript/JavaScript example also gets `// @noErrors`
prepended, ahead of the import line, so the rendered block begins:

```typescript
// @noErrors
import { <ApiItemName> } from "<packageName>";
// ...the rest of your @example code, unmodified
```

This default exists because a TSDoc `@example` is frequently a fragment —
a call shown in isolation, without the surrounding setup a full program
would need — rather than a standalone compilable file. Suppressing errors
by default means an incomplete fragment renders cleanly instead of
producing a wall of diagnostics on every reference page.

This default is controlled per API by the plugin's `errors.example` option.
Leaving it unset, or setting `errors: { example: "suppress" }`, keeps the
default `@noErrors` behavior. Setting `errors: { example: "show" }` turns
suppression off for that API's generated examples, so any real type error
in an `@example` renders inline instead of being hidden — useful once your
`@example` blocks are written as complete, compilable snippets and you want
type errors in them to surface rather than disappear.

## Signature blocks use a related but separate mechanism

Generated signature blocks — the `ApiSignature` rendering of a class,
interface, function, or type alias declaration itself, not its `@example`
— have their own import problem: the declaration may reference a type
owned by an external package (for instance a function returning a type
from a peer dependency). Those blocks get their required imports prepended
too, but hidden behind a `---cut---` line rather than left visible, since
they are implementation plumbing the reader does not need to see to read
the signature. This is a different transform from the one described above:
it runs on the item's own declaration text, not on `@example` code, and it
hides its import rather than showing it. See `import-generation-system.md`
in the design docs if you need the full mechanics of how those imports are
discovered.

## Practical consequences for package authors

- Most `@example` blocks in your TSDoc comments need no import line at all
  — write the call you want to demonstrate and let the plugin add the
  import for the item being documented.
- A loose, fragment-style `@example` does not fail a docs build by default.
  It renders with `@noErrors` unless the API's `errors.example` option is
  set to `"show"`.
- Non-TypeScript `@example` fences (shell commands, JSON output, plain
  text) are never touched — write them exactly as you want them to appear.
- Copying a generated example into a hand-authored guide fence forfeits
  both defaults — see `SKILL.md`'s "What the reader sees vs. what they
  copy" section and `recipes.md` for what a hand-authored block needs
  instead.
