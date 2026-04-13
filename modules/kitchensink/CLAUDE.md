# modules/kitchensink

A test fixture module that exercises every TSDoc tag and every API Extractor
item kind for documentation testing. **This is not a real library** — it is a
controlled fixture that produces API Extractor models consumed by the
`rspress-plugin-api-extractor` test sites.

## Domain

A typed data-pipeline library: `DataSource → Transform → DataSink`, with
middleware, codecs, events, and configuration. The domain is fictional but
realistic enough to produce idiomatic TSDoc.

## Entry Points

| Export | Package path | Source |
| ------ | ------------ | ------ |
| Core pipeline API | `kitchensink` | `src/index.ts` |
| Mock sources and test harnesses | `kitchensink/testing` | `src/testing.ts` |

## Build Commands

```bash
pnpm --filter kitchensink run build       # Build both entry points
pnpm --filter kitchensink run types:check # Type-check
pnpm vitest run modules/kitchensink/      # Run tests
```

## TSDoc and API Extractor Test Matrix

| File | TSDoc Tags Tested | Item Kinds Tested |
| --- | --- | --- |
| `lib/enums.ts` | `@public`, `@remarks`, `@example`, `@deprecated`, `@see`, `@link` | Enum |
| `lib/errors.ts` | `@public`, `@remarks`, `@see` | Class extending Error |
| `lib/types.ts` | `@typeParam`, `@param`, `@public`, `@remarks`, `@example` | Type alias (function type), type alias (index signature) |
| `lib/interfaces.ts` | `@typeParam`, `@param`, `@returns`, `@throws`, `@public`, `@remarks`, `@defaultValue`, `@eventProperty` | Call signature interface, interface methods, optional properties, event properties |
| `lib/constants.ts` | `@public`, `@remarks`, `@see` | Variable/constant |
| `lib/data-source.ts` | `@typeParam`, `@virtual`, `@readonly`, `@throws`, `@remarks`, `@example`, `@see`, `@public` | Abstract class, static member, abstract methods, readonly property |
| `lib/json-source.ts` | `@sealed`, `@override`, `@throws`, `@see`, `@remarks`, `@example`, `@public` | Sealed class, method override, class inheritance |
| `lib/pipeline.ts` | `@typeParam`, `@readonly`, `@deprecated`, `@throws`, `@experimental`, `@privateRemarks`, `@remarks`, `@example`, `@param`, `@returns`, `@link`, `@public` | Class, static factory, getter, getter+setter, deprecated method, experimental method |
| `lib/batch-processor.ts` | `@typeParam`, `@decorator`, `@see`, `@remarks`, `@example`, `@param`, `@public` | Class with decorator reference |
| `lib/codecs.ts` | `@alpha`, `@typeParam`, `@param`, `@returns`, `@throws`, `@public`, `@remarks` | Namespace, namespace function |
| `lib/filters.ts` | `@beta`, `@typeParam`, `@param`, `@returns`, `@public`, `@remarks`, `@example` | Namespace, namespace function |
| `lib/functions.ts` | `@label`, `@typeParam`, `@param`, `@returns`, `@throws`, `@example`, `@link`, `@public` | Generic function, function with label |
| `lib/internal.ts` | `@internal`, `@param`, `@returns` | Internal function (not exported) |
| `testing/mock-source.ts` | `@inheritDoc`, `@override`, `@typeParam`, `@example`, `@public` | Class extending abstract class |
| `testing/test-pipeline.ts` | `@typeParam`, `@readonly`, `@remarks`, `@example`, `@public` | Class extending concrete class |
| `testing/fixtures.ts` | `@typeParam`, `@param`, `@returns`, `@example`, `@public`, `@remarks` | Overloaded function, type alias |
| `index.ts` | `@packageDocumentation` | Module documentation |
| `testing.ts` | `@packageDocumentation` | Module documentation |

## Example Block Conventions

- All `@example` blocks import from `"kitchensink"` or `"kitchensink/testing"` — never relative paths
- Use `import type` for type-only imports
- Each example is self-contained (no shared state between examples)
