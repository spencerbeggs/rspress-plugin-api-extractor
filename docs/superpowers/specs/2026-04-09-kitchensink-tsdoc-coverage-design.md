# Kitchensink Module Redesign: Full TSDoc & API Extractor Coverage

**Date:** 2026-04-09
**Status:** Approved
**Goal:** Redesign the kitchensink demo module to exercise every TSDoc tag
and every API Extractor item kind, split into real multi-file library
structure for line number and source mapping testing.

## Domain

A typed data-pipeline library for composing sources, transforms, and
sinks. Data flows from `DataSource<T>` through `Transform<In, Out>`
stages into `DataSink<T>`, with middleware, codecs, event lifecycle,
and configuration.

This domain was chosen because it naturally exercises:

- Generics (typed data flows)
- Error handling with `@throws` (parsing, validation, I/O)
- Events via `@eventProperty` (pipeline lifecycle)
- Staged releases (`@alpha`/`@beta`/`@experimental` on codecs/transforms)
- `@defaultValue` on pipeline configuration
- Abstract/sealed/virtual/override class hierarchies (source types)
- Deprecation (`@deprecated` on v1 APIs)

## Entry Points

| Entry | Import Path | Purpose |
| ------- | ------------- | --------- |
| `.` | `kitchensink` | Core pipeline API |
| `./testing` | `kitchensink/testing` | Mock sources, test harnesses |

## File Structure

```text
modules/kitchensink/src/
  index.ts                  Re-exports from lib/, @packageDocumentation
  testing.ts                Re-exports test utilities, @packageDocumentation
  lib/
    enums.ts                PipelineStatus, DataFormat
    interfaces.ts           Transform, DataSink, PipelineOptions, PipelineEvent
    types.ts                Middleware, ErrorHandler, CodecOptions
    errors.ts               PipelineError, DataSourceError, CodecError, ValidationError
    data-source.ts          DataSource<T> abstract class
    json-source.ts          JsonSource sealed class
    pipeline.ts             Pipeline<In, Out> class
    batch-processor.ts      BatchProcessor<T> class
    codecs.ts               Codecs namespace
    filters.ts              Filters namespace
    functions.ts            createPipeline(), encode(), decode(), validate()
    constants.ts            VERSION, DEFAULT_PIPELINE_OPTIONS
    internal.ts             normalizeData() @internal helper (not re-exported)
  testing/
    mock-source.ts          MockSource<T> class
    test-pipeline.ts        TestPipeline<In, Out> class
    fixtures.ts             createMockData(), createTestSink(), TestFixture<T>
```

## TSDoc Tag Coverage Matrix

Each file is annotated with the TSDoc tags it exercises.

### Entry points

| File | Tags |
| ------ | ------ |
| `index.ts` | `@packageDocumentation` |
| `testing.ts` | `@packageDocumentation` |

### lib/enums.ts

| Export | Tags | Notes |
| -------- | ------ | ------- |
| `PipelineStatus` | `@public`, `@remarks`, `@example` | 5 members: Idle, Running, Paused, Completed, Failed |
| `DataFormat` | `@public`, `@deprecated`, `@see`, `@link` | `CSV` member deprecated with `@see Codecs.msgpack` |

### lib/interfaces.ts

| Export | Tags | Item Kinds |
| -------- | ------ | ------------ |
| `Transform<In, Out>` | `@typeParam`, `@public` | Call signature interface |
| `DataSink<T>` | `@typeParam`, `@param`, `@returns`, `@throws`, `@public`, `@remarks` | Interface with methods |
| `PipelineOptions` | `@defaultValue`, `@public`, `@remarks` | Optional properties with defaults |
| `PipelineEvent<T>` | `@eventProperty`, `@typeParam`, `@public` | Event property interface |

### lib/types.ts

| Export | Tags | Item Kinds |
| -------- | ------ | ------------ |
| `Middleware<T>` | `@typeParam`, `@param`, `@public`, `@remarks`, `@example` | Type alias (function type) |
| `ErrorHandler` | `@param`, `@public`, `@remarks` | Type alias (function type) |
| `CodecOptions` | `@public` | Type alias with index signature |

### lib/errors.ts

| Export | Tags | Item Kinds |
| -------- | ------ | ------------ |
| `PipelineError` | `@public`, `@remarks` | Class extending Error |
| `DataSourceError` | `@public`, `@see` | Class extending Error |
| `CodecError` | `@public` | Class extending Error |
| `ValidationError` | `@public` | Class extending Error |

### lib/data-source.ts

| Export | Tags | Item Kinds |
| -------- | ------ | ------------ |
| `DataSource<T>` | `@typeParam`, `@virtual`, `@readonly`, `@throws`, `@remarks`, `@example`, `@see`, `@public` | Abstract class, static member (`DEFAULT_TIMEOUT`), abstract methods, readonly property |

### lib/json-source.ts

| Export | Tags | Item Kinds |
| -------- | ------ | ------------ |
| `JsonSource` | `@sealed`, `@override`, `@throws`, `@see`, `@remarks`, `@example`, `@public` | Sealed class extending DataSource, overridden methods |

### lib/pipeline.ts

| Export | Tags | Item Kinds |
| -------- | ------ | ------------ |
| `Pipeline<In, Out>` | `@typeParam`, `@readonly`, `@deprecated`, `@throws`, `@experimental`, `@privateRemarks`, `@remarks`, `@example`, `@param`, `@returns`, `@link`, `@public` | Class, static factory method, getter, getter+setter, deprecated method, experimental method |

### lib/batch-processor.ts

| Export | Tags | Item Kinds |
| -------- | ------ | ------------ |
| `BatchProcessor<T>` | `@typeParam`, `@decorator`, `@see`, `@remarks`, `@example`, `@param`, `@public` | Class with decorator reference |

### lib/codecs.ts

| Export | Tags | Item Kinds |
| -------- | ------ | ------------ |
| `Codecs` namespace | `@public`, `@remarks` | Namespace |
| `Codecs.json()` | `@typeParam`, `@param`, `@returns`, `@public` | Namespace function |
| `Codecs.binary()` | `@param`, `@returns`, `@throws`, `@public` | Namespace function |
| `Codecs.streaming()` | `@alpha`, `@typeParam`, `@param`, `@returns`, `@public` | Alpha-stage API |

### lib/filters.ts

| Export | Tags | Item Kinds |
| -------- | ------ | ------------ |
| `Filters` namespace | `@public`, `@remarks` | Namespace |
| `Filters.where()` | `@typeParam`, `@param`, `@returns`, `@public`, `@example` | Namespace function |
| `Filters.take()` | `@param`, `@returns`, `@public` | Namespace function |
| `Filters.fuzzy()` | `@beta`, `@typeParam`, `@param`, `@returns`, `@public` | Beta-stage API |

### lib/functions.ts

| Export | Tags | Item Kinds |
| -------- | ------ | ------------ |
| `createPipeline()` | `@label`, `@typeParam`, `@param`, `@returns`, `@throws`, `@example`, `@link`, `@public` | Generic function with label |
| `encode()` | `@param`, `@returns`, `@throws`, `@public` | Function |
| `decode()` | `@typeParam`, `@param`, `@returns`, `@throws`, `@public` | Generic function |
| `validate()` | `@typeParam`, `@param`, `@returns`, `@throws`, `@example`, `@public` | Generic function |

### lib/constants.ts

| Export | Tags | Item Kinds |
| -------- | ------ | ------------ |
| `VERSION` | `@public`, `@remarks` | String constant |
| `DEFAULT_PIPELINE_OPTIONS` | `@public`, `@remarks`, `@see` | Object constant |

### lib/internal.ts

| Export | Tags | Item Kinds |
| -------- | ------ | ------------ |
| `normalizeData()` | `@internal`, `@param`, `@returns` | Internal function (not re-exported) |

### testing/mock-source.ts

| Export | Tags | Item Kinds |
| -------- | ------ | ------------ |
| `MockSource<T>` | `@inheritDoc`, `@override`, `@typeParam`, `@remarks`, `@example`, `@public` | Class extending abstract DataSource |

### testing/test-pipeline.ts

| Export | Tags | Item Kinds |
| -------- | ------ | ------------ |
| `TestPipeline<In, Out>` | `@typeParam`, `@readonly`, `@remarks`, `@example`, `@public` | Class extending Pipeline |

### testing/fixtures.ts

| Export | Tags | Item Kinds |
| -------- | ------ | ------------ |
| `createMockData()` | `@typeParam`, `@param`, `@returns`, `@example`, `@public` | Overloaded function (2 signatures) |
| `createTestSink()` | `@typeParam`, `@returns`, `@public` | Generic function |
| `TestFixture<T>` | `@typeParam`, `@public`, `@remarks` | Type alias |

## API Extractor Item Kind Coverage

| Item Kind | Where |
| ----------- | ------- |
| Abstract class | `DataSource<T>` |
| Sealed class | `JsonSource` |
| Class | `Pipeline`, `BatchProcessor`, error classes |
| Class inheritance | `JsonSource extends DataSource`, `MockSource extends DataSource` |
| Interface | `Transform`, `DataSink`, `PipelineOptions`, `PipelineEvent` |
| Call signature | `Transform<In, Out>` interface |
| Index signature | `CodecOptions` |
| Enum | `PipelineStatus`, `DataFormat` |
| Type alias | `Middleware<T>`, `ErrorHandler`, `CodecOptions`, `TestFixture<T>` |
| Function | `createPipeline()`, `encode()`, `decode()`, `validate()` |
| Overloaded function | `createMockData()` |
| Variable/constant | `VERSION`, `DEFAULT_PIPELINE_OPTIONS` |
| Namespace | `Codecs`, `Filters` |
| Namespace function | `Codecs.json()`, `Filters.where()`, etc. |
| Static member | `Pipeline.create()`, `DataSource.DEFAULT_TIMEOUT` |
| Getter (readonly) | `Pipeline.status` |
| Getter + setter | `Pipeline.batchSize` |
| Abstract method | `DataSource.connect()`, `DataSource.fetch()` |
| Optional property | `PipelineOptions.batchSize?`, `.retryCount?`, `.timeout?` |

## TSDoc Tag Verification Checklist

All 25 standard TSDoc tags:

- [x] `@alpha` — `Codecs.streaming()`
- [x] `@beta` — `Filters.fuzzy()`
- [x] `@decorator` — `BatchProcessor`
- [x] `@defaultValue` — `PipelineOptions` properties
- [x] `@deprecated` — `Pipeline.process()`, `DataFormat.CSV`
- [x] `@eventProperty` — `PipelineEvent` properties
- [x] `@example` — All major exports
- [x] `@experimental` — `Pipeline.parallel()`
- [x] `@inheritDoc` — `MockSource`
- [x] `@internal` — `normalizeData()`
- [x] `@label` — `createPipeline()`
- [x] `@link` — Cross-references throughout
- [x] `@override` — `JsonSource.fetch()`, `MockSource.fetch()`
- [x] `@packageDocumentation` — `index.ts`, `testing.ts`
- [x] `@param` — All functions and methods with parameters
- [x] `@privateRemarks` — `Pipeline` class
- [x] `@public` — All public exports
- [x] `@readonly` — `Pipeline.status`, `DataSource.name`
- [x] `@remarks` — Most exports with extended descriptions
- [x] `@returns` — All functions, getters
- [x] `@sealed` — `JsonSource`
- [x] `@see` — Cross-references between related types
- [x] `@throws` — `decode()`, `validate()`, `Pipeline.execute()`, etc.
- [x] `@typeParam` — All generic types and functions
- [x] `@virtual` — `DataSource.connect()`, `DataSource.fetch()`

## Example Block Conventions

All `@example` blocks must be complete TypeScript programs:

- Import values from `"kitchensink"` (main entry)
- Import types with `import type` from `"kitchensink"`
- Import test utilities from `"kitchensink/testing"`
- Each example is self-contained and runnable
- Examples include `// @noErrors` where type inference is demonstrated
  without full context

Example pattern:

```typescript
/**
 * @example
 * ```typescript
 * import { Pipeline, JsonSource } from "kitchensink";
 * import type { PipelineOptions } from "kitchensink";
 *
 * const source = new JsonSource("data.json");
 * const pipeline = Pipeline.create(source, (data) => data);
 * await pipeline.execute({ key: "value" });
 * ```
 */
```

## CLAUDE.md Test Matrix

The kitchensink `CLAUDE.md` will include a test matrix documenting what
each file exercises, so future sessions know the coverage intent without
reading every file. Format:

```markdown
## TSDoc & API Extractor Test Matrix

| File | TSDoc Tags Tested | Item Kinds Tested |
| ------ | ------------------- | ------------------- |
| lib/data-source.ts | @virtual, @readonly, @throws, @abstract | Abstract class, static member, abstract method |
| lib/json-source.ts | @sealed, @override | Sealed class, method override |
| ... | ... | ... |
```

## Basic Site Documentation Pages

The basic site (`sites/basic/docs/`) should include hand-authored MDX
pages outside the `api/` folder that demonstrate and test the plugin's
Twoslash integration. These pages use `with-api` code blocks.

### Proposed pages

| Page | Purpose | Twoslash Directives Tested |
| ---- | ------- | -------------------------- |
| `docs/guides/getting-started.mdx` | Introduction to the pipeline library | Basic hover (`// ^?`), imports, type display |
| `docs/guides/data-sources.mdx` | Working with DataSource and JsonSource | Class instantiation, method hover, `@errors` for throws |
| `docs/guides/transforms.mdx` | Composing transforms and middleware | Function types, generics hover, `// @noErrors` |
| `docs/guides/error-handling.mdx` | Error types and recovery patterns | `// @errors` with expected TS errors, error class hover |
| `docs/guides/advanced.mdx` | Codecs, Filters, BatchProcessor | Namespace member hover, `@alpha`/`@beta` staged APIs |
| `docs/guides/testing.mdx` | Using kitchensink/testing utilities | Imports from `"kitchensink/testing"`, MockSource, fixtures |

### with-api code block format

````markdown
```typescript with-api
import { Pipeline, JsonSource } from "kitchensink";
import type { PipelineOptions } from "kitchensink";

const source = new JsonSource("data.json");
//    ^?
const pipeline = Pipeline.create(source, (data) => data);
await pipeline.execute({ key: "value" });
```
````

### Twoslash directives to cover

- `// ^?` — Type query (shows inferred type inline)
- `// @errors: NNNN` — Expected TypeScript errors
- `// @noErrors` — Suppress all errors for partial examples
- `// ---cut---` — Hide setup code above the cut line
- `// @highlight` — Highlight specific lines
- Hover on type references — Cross-links to API docs

## Scope

- Replace ALL existing code in `modules/kitchensink/src/`
- Update `modules/kitchensink/CLAUDE.md` with test matrix
- Update `modules/kitchensink/package.json` exports if needed
- The existing test file (`index.test.ts`) will need to be rewritten
  for the new domain
- Sites that consume the kitchensink model will need their generated
  docs regenerated (but no config changes since the package name and
  entry points remain the same)
- Create hand-authored MDX guide pages in `sites/basic/docs/guides/`
  that exercise `with-api` code blocks and Twoslash directives
