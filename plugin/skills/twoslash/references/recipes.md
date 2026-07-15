# Twoslash Recipes

Worked, hand-authored `with-api` fences. Read this when starting a new
guide block from scratch, or checking how a directive combination is meant
to look end to end. Every fence below is shown exactly as it appears in the
source guide page — the outer 4-backtick wrapper is there only so you can
see the fence's own opening line (```` ```ts with-api ````); it is not part
of what you'd paste.

Each recipe imports from `@modules/kitchensink`, the fixture module this
repo's own docs sites document. Swap the import path for whatever package
your site documents — the notation and transforms described here apply
regardless of which package is behind them. See `notation.md` for full
directive semantics and `SKILL.md` for the fence contract these recipes
all follow (explicit imports, no invented symbols, no implicit setup).

## Quick start: two type queries

A first block in a guide usually exists to prove a claim — "here's what
you get back" — so it leans on `^?` rather than prose.

````markdown
```ts with-api
import { Pipeline, JsonSource } from "@modules/kitchensink";

const source = new JsonSource("./data/records.json");
//    ^?

const pipeline = Pipeline.create(source, (record: Record<string, unknown>) => ({
  ...record,
  processed: true,
}));
//  ^?
```
````

Why this shape: two queries, one per statement, let the reader confirm
both halves of the claim — the source's type and the pipeline's inferred
generic parameters — without reading the library's own type declarations.

## Hiding setup with `---cut---`

Later sections in a guide often need to re-establish objects a reader has
already seen. Showing that construction again is noise; hiding it keeps
the block focused on the one line that's new.

````markdown
```ts with-api
import { Pipeline, JsonSource } from "@modules/kitchensink";

const source = new JsonSource("./data/orders.json");
const toSummary = (order: { id: number; total: number }) => ({
  id: order.id,
  total: order.total,
});
const pipeline = Pipeline.create(source, toSummary);
// ---cut---
const summary = await pipeline.execute({ id: 7, total: 42 });
//    ^?
```
````

Why this shape: the import, source, transform, and pipeline construction
all still compile and type-check — Twoslash sees the whole file — but
`---cut---` hides that setup from both the rendered page and the copy
button, so the reader's eye (and clipboard) lands on `pipeline.execute`.

## A deliberate type error

Sometimes the point of a block is the error itself — showing what the
type system catches. `@errors` turns that error into a labeled annotation
instead of a raw build warning.

````markdown
```ts with-api
// @errors: 2322
import type { PipelineOptions } from "@modules/kitchensink";

const opts: PipelineOptions = { batchSize: "fifty", retryCount: 2, timeout: 5000 };
```
````

Why this shape: `batchSize` is typed `number`, so assigning the string
`"fifty"` is a genuine `TS2322` assignment-type mismatch — declaring it
up front tells Twoslash this specific code is expected, so it renders as
an annotated error rather than an undeclared one.

## A fragment that isn't meant to compile cleanly

Not every block is a full program by intent — sometimes you're
illustrating a shape (a higher-order function, a partial call) where
forcing every type to resolve would mean padding the example with
irrelevant scaffolding. `@noErrors` is the tool for that, used sparingly.

````markdown
```ts with-api
// @noErrors
import type { Transform } from "@modules/kitchensink";

function withLogging<T, O>(transform: Transform<T, O>): Transform<T, O> {
  return (input) => {
    console.log("input:", input);
    const output = transform(input);
    //    ^?
    console.log("output:", output);
    return output;
  };
}

const loggedDouble = withLogging<number, number>((n) => n * 2);
const result = loggedDouble(21);
//    ^?
```
````

Why this shape: the block demonstrates a generic wrapping pattern rather
than a call against real data, so suppressing errors keeps the focus on
the two `^?` queries instead of on satisfying every inferred constraint.

## A multi-step example with `@filename`

Splitting an example across virtual files shows how a piece of code you'd
factor out in a real project — a reusable transform, a shared config —
composes with the rest of the program, instead of flattening everything
into one file.

````markdown
```ts with-api
// @filename: transforms.ts
import type { Transform } from "@modules/kitchensink";

export const double: Transform<number, number> = (n) => n * 2;

// @filename: main.ts
import { Pipeline, JsonSource } from "@modules/kitchensink";
import { double } from "./transforms";

const pipeline = Pipeline.create(new JsonSource("./data/numbers.json"), double);
const result = await pipeline.execute(21);
//    ^?
```
````

Why this shape: `main.ts` imports `double` from `./transforms` by
filename, minus the extension — Twoslash type-checks both virtual files
together, so the cross-file import resolves exactly as it would in a real
multi-file project, and the final query confirms what the composed
pipeline actually returns.
