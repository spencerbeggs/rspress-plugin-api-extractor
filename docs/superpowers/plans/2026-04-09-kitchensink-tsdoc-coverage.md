# Kitchensink TSDoc Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the kitchensink module with a data-pipeline domain that exercises all 25 TSDoc tags and all API Extractor item kinds across a multi-file library structure.

**Architecture:** Multi-file library with `src/lib/` for core types and `src/testing/` for test utilities. Entry points at `src/index.ts` and `src/testing.ts` re-export from subdirectories. Each file is 50-150 lines with dense TSDoc comments. The domain models typed data pipelines (sources, transforms, sinks) with middleware, codecs, and events.

**Tech Stack:** TypeScript, API Extractor, rslib-builder, Vitest, RSPress 2.0

**Spec:** `docs/superpowers/specs/2026-04-09-kitchensink-tsdoc-coverage-design.md`

---

## Important Notes

- Every `@example` block must import from `"kitchensink"` or `"kitchensink/testing"` (never relative paths)
- Use `import type` for type-only imports (Biome enforces this)
- Use `.js` extensions on all relative imports (ESM requirement)
- The rslib-builder config (`rslib.config.ts`) outputs API models to 3 sites; no changes needed
- The `package.json` exports already point to `./src/index.ts` and `./src/testing.ts`; no changes needed
- Run `pnpm run lint:fix` after writing each file to auto-fix formatting
- When writing large files, write the complete file content. Do not use placeholders or abbreviations.

---

### Task 1: Clean old source files and create directory structure

**Files:**

- Delete: `modules/kitchensink/src/index.ts`
- Delete: `modules/kitchensink/src/testing.ts`
- Delete: `modules/kitchensink/src/index.test.ts`
- Create: `modules/kitchensink/src/lib/` (directory)
- Create: `modules/kitchensink/src/testing/` (directory)

- [ ] **Step 1: Delete old source files**

```bash
rm modules/kitchensink/src/index.ts modules/kitchensink/src/testing.ts modules/kitchensink/src/index.test.ts
```

- [ ] **Step 2: Create directory structure**

```bash
mkdir -p modules/kitchensink/src/lib modules/kitchensink/src/testing
```

- [ ] **Step 3: Commit**

```bash
git add -A modules/kitchensink/src/
git commit -m "chore(kitchensink): remove old source for TSDoc coverage redesign

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 2: Foundation types (enums, errors, types, interfaces, constants)

These files have no internal dependencies and form the foundation for everything else.

**Files:**

- Create: `modules/kitchensink/src/lib/enums.ts`
- Create: `modules/kitchensink/src/lib/errors.ts`
- Create: `modules/kitchensink/src/lib/types.ts`
- Create: `modules/kitchensink/src/lib/interfaces.ts`
- Create: `modules/kitchensink/src/lib/constants.ts`

**TSDoc tags exercised:** `@public`, `@remarks`, `@example`, `@deprecated`, `@see`, `@link`, `@typeParam`, `@param`, `@returns`, `@throws`, `@defaultValue`, `@eventProperty`

- [ ] **Step 1: Write `lib/enums.ts`**

Contains `PipelineStatus` and `DataFormat` enums. `DataFormat.CSV` is `@deprecated`. Each member gets a TSDoc comment.

Tags tested: `@public`, `@remarks`, `@example`, `@deprecated`, `@see`, `@link`

- [ ] **Step 2: Write `lib/errors.ts`**

Contains 4 error classes: `PipelineError`, `DataSourceError`, `CodecError`, `ValidationError`. Each extends `Error` with a `code` property.

Tags tested: `@public`, `@remarks`, `@see`

- [ ] **Step 3: Write `lib/types.ts`**

Contains type aliases: `Middleware<T>` (function type), `ErrorHandler` (function type), `CodecOptions` (index signature type).

Tags tested: `@typeParam`, `@param`, `@public`, `@remarks`, `@example`

Item kinds tested: Type alias, function type, index signature

- [ ] **Step 4: Write `lib/interfaces.ts`**

Contains: `Transform<In, Out>` (call signature), `DataSink<T>` (interface with methods), `PipelineOptions` (optional properties with `@defaultValue`), `PipelineEvent<T>` (event properties with `@eventProperty`).

Tags tested: `@typeParam`, `@param`, `@returns`, `@throws`, `@public`, `@remarks`, `@defaultValue`, `@eventProperty`

Item kinds tested: Call signature interface, interface methods, optional properties, event properties

- [ ] **Step 5: Write `lib/constants.ts`**

Contains `VERSION` string constant and `DEFAULT_PIPELINE_OPTIONS` object constant.

Tags tested: `@public`, `@remarks`, `@see`

Item kinds tested: Variable/constant

- [ ] **Step 6: Lint and type-check**

```bash
pnpm exec biome check --write modules/kitchensink/src/lib/
pnpm --filter kitchensink run types:check
```

- [ ] **Step 7: Commit**

```bash
git add modules/kitchensink/src/lib/enums.ts modules/kitchensink/src/lib/errors.ts modules/kitchensink/src/lib/types.ts modules/kitchensink/src/lib/interfaces.ts modules/kitchensink/src/lib/constants.ts
git commit -m "feat(kitchensink): add foundation types for data pipeline domain

Adds enums (PipelineStatus, DataFormat), error classes, type aliases
(Middleware, ErrorHandler, CodecOptions), interfaces (Transform, DataSink,
PipelineOptions, PipelineEvent), and constants. Exercises @deprecated,
@defaultValue, @eventProperty, @see, and index signature item kind.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 3: Abstract base class and sealed subclass

**Files:**

- Create: `modules/kitchensink/src/lib/data-source.ts`
- Create: `modules/kitchensink/src/lib/json-source.ts`

**TSDoc tags exercised:** `@typeParam`, `@virtual`, `@readonly`, `@throws`, `@remarks`, `@example`, `@see`, `@public`, `@sealed`, `@override`

**Item kinds:** Abstract class, abstract methods, static member, readonly property, sealed class, method override, class inheritance

- [ ] **Step 1: Write `lib/data-source.ts`**

Abstract class `DataSource<T>` with:

- Static `DEFAULT_TIMEOUT = 30_000`
- Abstract readonly `name: string`
- `@virtual` abstract methods: `connect(): Promise<void>`, `fetch(): Promise<T[]>`
- Concrete method: `disconnect(): void`
- TSDoc with `@typeParam T`, `@virtual`, `@readonly`, `@throws DataSourceError`, `@see Pipeline`, `@example` importing from `"kitchensink"`

- [ ] **Step 2: Write `lib/json-source.ts`**

Sealed class `JsonSource extends DataSource<Record<string, unknown>>` with:

- Constructor taking `filePath: string`
- `@override` of `connect()` and `fetch()`
- `@sealed` on the class
- `@throws DataSourceError` on methods
- `@see DataSource`
- `@example` importing from `"kitchensink"`

- [ ] **Step 3: Lint and type-check**

```bash
pnpm exec biome check --write modules/kitchensink/src/lib/data-source.ts modules/kitchensink/src/lib/json-source.ts
pnpm --filter kitchensink run types:check
```

- [ ] **Step 4: Commit**

```bash
git add modules/kitchensink/src/lib/data-source.ts modules/kitchensink/src/lib/json-source.ts
git commit -m "feat(kitchensink): add DataSource abstract class and JsonSource sealed class

DataSource<T> exercises @virtual, @readonly, @throws, abstract class,
static member, and abstract method item kinds. JsonSource exercises
@sealed, @override, and class inheritance.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 4: Pipeline and BatchProcessor classes

**Files:**

- Create: `modules/kitchensink/src/lib/pipeline.ts`
- Create: `modules/kitchensink/src/lib/batch-processor.ts`

**TSDoc tags exercised:** `@typeParam`, `@readonly`, `@deprecated`, `@throws`, `@experimental`, `@privateRemarks`, `@remarks`, `@example`, `@param`, `@returns`, `@link`, `@public`, `@decorator`, `@see`

**Item kinds:** Class, static factory method, getter, getter+setter, deprecated method, experimental method, class with decorator reference

- [ ] **Step 1: Write `lib/pipeline.ts`**

Class `Pipeline<In, Out>` with:

- Private fields: `_status`, `_batchSize`, `_source`, `_transform`
- Static factory: `Pipeline.create<I, O>(source, transform): Pipeline<I, O>`
- Getter: `get status(): PipelineStatus` (`@readonly`)
- Getter+setter: `get batchSize()` / `set batchSize()`
- `@deprecated` method: `process(input: In): Out` with deprecation notice linking to `execute()`
- Main method: `execute(input: In): Promise<Out>` with `@throws PipelineError`
- `@experimental` method: `parallel(inputs: In[]): Promise<Out[]>`
- `@privateRemarks` on the class explaining internal queue implementation
- Rich `@example` blocks importing from `"kitchensink"`
- `@link` references to Transform, DataSource, PipelineOptions

- [ ] **Step 2: Write `lib/batch-processor.ts`**

Class `BatchProcessor<T>` with:

- Constructor taking `pipeline: Pipeline<T, T>` and `options: PipelineOptions`
- Method: `processBatch(items: T[]): Promise<T[]>`
- `@decorator` referencing `@logged` decorator
- `@see Pipeline`
- `@example` importing from `"kitchensink"`

- [ ] **Step 3: Lint and type-check**

```bash
pnpm exec biome check --write modules/kitchensink/src/lib/pipeline.ts modules/kitchensink/src/lib/batch-processor.ts
pnpm --filter kitchensink run types:check
```

- [ ] **Step 4: Commit**

```bash
git add modules/kitchensink/src/lib/pipeline.ts modules/kitchensink/src/lib/batch-processor.ts
git commit -m "feat(kitchensink): add Pipeline and BatchProcessor classes

Pipeline<In, Out> exercises @deprecated, @experimental, @privateRemarks,
@readonly, static factory, getter/setter, and @throws. BatchProcessor
exercises @decorator reference.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 5: Namespaces (Codecs and Filters)

**Files:**

- Create: `modules/kitchensink/src/lib/codecs.ts`
- Create: `modules/kitchensink/src/lib/filters.ts`

**TSDoc tags exercised:** `@alpha`, `@beta`, `@typeParam`, `@param`, `@returns`, `@throws`, `@public`, `@remarks`, `@example`

**Item kinds:** Namespace, namespace function

- [ ] **Step 1: Write `lib/codecs.ts`**

Namespace `Codecs` with:

- `json<T>(data: T): string` — JSON serialization
- `binary(data: unknown): Uint8Array` — binary encoding, `@throws CodecError`
- `streaming<T>(source: DataSource<T>): AsyncIterable<Uint8Array>` — `@alpha` stage API
- Interface `CodecOptions` with index signature `[key: string]: unknown`

- [ ] **Step 2: Write `lib/filters.ts`**

Namespace `Filters` with:

- `where<T>(predicate: (item: T) => boolean): Transform<T[], T[]>` — with `@example`
- `take<T>(count: number): Transform<T[], T[]>`
- `fuzzy<T>(pattern: string, key: keyof T): Transform<T[], T[]>` — `@beta` stage API

- [ ] **Step 3: Lint and type-check**

```bash
pnpm exec biome check --write modules/kitchensink/src/lib/codecs.ts modules/kitchensink/src/lib/filters.ts
pnpm --filter kitchensink run types:check
```

- [ ] **Step 4: Commit**

```bash
git add modules/kitchensink/src/lib/codecs.ts modules/kitchensink/src/lib/filters.ts
git commit -m "feat(kitchensink): add Codecs and Filters namespaces

Codecs exercises @alpha on streaming(). Filters exercises @beta on
fuzzy(). Both exercise namespace and namespace function item kinds.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 6: Standalone functions and internal helper

**Files:**

- Create: `modules/kitchensink/src/lib/functions.ts`
- Create: `modules/kitchensink/src/lib/internal.ts`

**TSDoc tags exercised:** `@label`, `@typeParam`, `@param`, `@returns`, `@throws`, `@example`, `@link`, `@public`, `@internal`

**Item kinds:** Generic function, function with label

- [ ] **Step 1: Write `lib/functions.ts`**

Contains:

- `createPipeline<I, O>(source, transform, options?): Pipeline<I, O>` — `@label CREATE_PIPELINE`, `@throws PipelineError`, `@link` to Transform and PipelineOptions
- `encode(data: unknown, format: DataFormat): Uint8Array` — `@throws CodecError`
- `decode<T>(buffer: Uint8Array, format: DataFormat): T` — `@throws CodecError`
- `validate<T>(data: unknown, schema: Transform<unknown, T>): T` — `@throws ValidationError`, `@example`

- [ ] **Step 2: Write `lib/internal.ts`**

Contains `normalizeData(data: unknown): Record<string, unknown>` with `@internal` tag. This function is NOT re-exported from index.ts.

- [ ] **Step 3: Lint and type-check**

```bash
pnpm exec biome check --write modules/kitchensink/src/lib/functions.ts modules/kitchensink/src/lib/internal.ts
pnpm --filter kitchensink run types:check
```

- [ ] **Step 4: Commit**

```bash
git add modules/kitchensink/src/lib/functions.ts modules/kitchensink/src/lib/internal.ts
git commit -m "feat(kitchensink): add standalone functions and internal helper

createPipeline() exercises @label. normalizeData() exercises @internal.
encode/decode/validate exercise @throws with specific error types.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 7: Main entry point (index.ts)

**Files:**

- Create: `modules/kitchensink/src/index.ts`

**TSDoc tags exercised:** `@packageDocumentation`

- [ ] **Step 1: Write `src/index.ts`**

Re-exports all public API from `lib/` modules. Uses `export type` for type-only exports. Includes `@packageDocumentation` tag with a description of the data pipeline library.

Exports:

- From `lib/enums.js`: `PipelineStatus`, `DataFormat`
- From `lib/errors.js`: all 4 error classes
- From `lib/types.js`: `Middleware`, `ErrorHandler` (type-only), `CodecOptions` (type-only)
- From `lib/interfaces.js`: `Transform`, `DataSink`, `PipelineOptions`, `PipelineEvent` (type-only)
- From `lib/constants.js`: `VERSION`, `DEFAULT_PIPELINE_OPTIONS`
- From `lib/data-source.js`: `DataSource`
- From `lib/json-source.js`: `JsonSource`
- From `lib/pipeline.js`: `Pipeline`
- From `lib/batch-processor.js`: `BatchProcessor`
- From `lib/codecs.js`: `Codecs`
- From `lib/filters.js`: `Filters`
- From `lib/functions.js`: `createPipeline`, `encode`, `decode`, `validate`

Note: `lib/internal.ts` (`normalizeData`) is intentionally NOT exported.

- [ ] **Step 2: Type-check**

```bash
pnpm --filter kitchensink run types:check
```

- [ ] **Step 3: Commit**

```bash
git add modules/kitchensink/src/index.ts
git commit -m "feat(kitchensink): add main entry point with re-exports

Re-exports all public API from lib/ modules. Uses @packageDocumentation
for module-level docs. Internal helpers are intentionally excluded.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 8: Testing utilities and testing entry point

**Files:**

- Create: `modules/kitchensink/src/testing/mock-source.ts`
- Create: `modules/kitchensink/src/testing/test-pipeline.ts`
- Create: `modules/kitchensink/src/testing/fixtures.ts`
- Create: `modules/kitchensink/src/testing.ts`

**TSDoc tags exercised:** `@inheritDoc`, `@override`, `@typeParam`, `@readonly`, `@remarks`, `@example`, `@public`, `@packageDocumentation`

**Item kinds:** Class extending abstract class, overloaded function, class extending concrete class

- [ ] **Step 1: Write `testing/mock-source.ts`**

Class `MockSource<T> extends DataSource<T>` with:

- Constructor taking `name: string` and `data: T[]`
- `@inheritDoc` from DataSource for the class-level docs
- `@override` on `connect()` (no-op) and `fetch()` (returns stored data)
- `@example` importing from `"kitchensink/testing"`

- [ ] **Step 2: Write `testing/test-pipeline.ts`**

Class `TestPipeline<In, Out> extends Pipeline<In, Out>` with:

- `@readonly` property `executionLog: Array<{ input: In; output: Out }>`
- Override of `execute()` to capture input/output pairs
- `@example` importing from `"kitchensink/testing"` and `"kitchensink"`

- [ ] **Step 3: Write `testing/fixtures.ts`**

Contains:

- Overloaded `createMockData<T>()`: two signatures (count-based and template-based)
- `createTestSink<T>(): DataSink<T> & { captured: T[] }`
- Type alias `TestFixture<T>` combining MockSource, DataSink, and TestPipeline

- [ ] **Step 4: Write `src/testing.ts`**

Re-exports from `testing/` modules with `@packageDocumentation`.

- [ ] **Step 5: Lint and type-check**

```bash
pnpm exec biome check --write modules/kitchensink/src/testing/ modules/kitchensink/src/testing.ts
pnpm --filter kitchensink run types:check
```

- [ ] **Step 6: Commit**

```bash
git add modules/kitchensink/src/testing/ modules/kitchensink/src/testing.ts
git commit -m "feat(kitchensink): add testing utilities and entry point

MockSource exercises @inheritDoc and @override. TestPipeline exercises
class extension. createMockData() exercises function overloads.
TestFixture exercises type alias composition.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 9: Unit tests

**Files:**

- Create: `modules/kitchensink/src/index.test.ts`

Tests should verify the runtime behavior of the new module. The primary purpose of the kitchensink is documentation testing, but basic runtime tests ensure the types and implementations are consistent.

- [ ] **Step 1: Write unit tests**

Test groups:

1. **Enums** — PipelineStatus members, DataFormat members
2. **Error classes** — construction, instanceof checks, error codes
3. **DataSource / JsonSource** — instantiation, connect/fetch behavior
4. **Pipeline** — create static factory, status getter, batchSize getter/setter, execute, deprecated process, experimental parallel
5. **BatchProcessor** — processBatch
6. **Codecs** — json(), binary()
7. **Filters** — where(), take()
8. **Functions** — createPipeline(), encode/decode roundtrip, validate()
9. **Constants** — VERSION is string, DEFAULT_PIPELINE_OPTIONS shape
10. **Testing utilities** — MockSource, TestPipeline, createMockData (both overloads), createTestSink

- [ ] **Step 2: Run tests**

```bash
pnpm vitest run modules/kitchensink/
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add modules/kitchensink/src/index.test.ts
git commit -m "test(kitchensink): add unit tests for data pipeline module

Covers all exported types, classes, functions, and testing utilities.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 10: CLAUDE.md with test matrix

**Files:**

- Create: `modules/kitchensink/CLAUDE.md`

- [ ] **Step 1: Write CLAUDE.md**

Include:

- Module purpose (TSDoc/API Extractor coverage testing)
- Domain summary (data pipeline)
- Entry points (`.` and `./testing`)
- Build commands
- **TSDoc & API Extractor Test Matrix** — table mapping every file to the TSDoc tags and item kinds it exercises (from the spec)
- Example block conventions

- [ ] **Step 2: Commit**

```bash
git add modules/kitchensink/CLAUDE.md
git commit -m "docs(kitchensink): add CLAUDE.md with TSDoc test matrix

Documents the purpose of each source file and which TSDoc tags and
API Extractor item kinds it is designed to exercise.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 11: Build and verify API model

- [ ] **Step 1: Build the kitchensink module**

```bash
pnpm --filter kitchensink run build
```

This generates the `.api.json` model and copies it to the 3 site model directories.

Expected: Build succeeds with no errors.

- [ ] **Step 2: Verify the API model was generated**

```bash
ls -la sites/basic/lib/models/kitchensink/kitchensink.api.json
```

Expected: File exists and was recently modified.

- [ ] **Step 3: Build the basic site to regenerate API docs**

```bash
pnpm --filter basic run build
```

Expected: Build succeeds. The plugin regenerates all API documentation pages from the new model.

- [ ] **Step 4: Verify generated docs**

```bash
ls sites/basic/docs/api/class/
ls sites/basic/docs/api/enum/
ls sites/basic/docs/api/function/
ls sites/basic/docs/api/interface/
ls sites/basic/docs/api/type/
ls sites/basic/docs/api/namespace/
ls sites/basic/docs/api/variable/
```

Expected: New files matching the pipeline domain exports (Pipeline, DataSource, JsonSource, BatchProcessor, PipelineStatus, DataFormat, etc.)

- [ ] **Step 5: Commit generated docs**

```bash
git add sites/basic/docs/api/ sites/basic/lib/models/
git commit -m "chore(kitchensink): regenerate API docs from new data pipeline model

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 12: Basic site guide pages — Getting Started

**Files:**

- Create: `sites/basic/docs/guides/getting-started.mdx`
- Create: `sites/basic/docs/guides/_meta.json`

- [ ] **Step 1: Write `_meta.json` for guides navigation**

```json
[
  { "type": "file", "name": "getting-started", "label": "Getting Started" },
  { "type": "file", "name": "data-sources", "label": "Data Sources" },
  { "type": "file", "name": "transforms", "label": "Transforms" },
  { "type": "file", "name": "error-handling", "label": "Error Handling" },
  { "type": "file", "name": "advanced", "label": "Advanced" },
  { "type": "file", "name": "testing", "label": "Testing" }
]
```

- [ ] **Step 2: Write `getting-started.mdx`**

Introduction page with `with-api` code blocks demonstrating:

- Basic imports and pipeline creation
- `// ^?` type queries on variables
- Hover on type references (cross-links to API docs)

- [ ] **Step 3: Commit**

```bash
git add sites/basic/docs/guides/
git commit -m "docs(basic): add getting started guide with Twoslash examples

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 13: Basic site guide — Data Sources

**Files:**

- Create: `sites/basic/docs/guides/data-sources.mdx`

- [ ] **Step 1: Write `data-sources.mdx`**

Demonstrates working with `DataSource` and `JsonSource`:

- Class instantiation and method calls
- `// ^?` on method return types
- `// ---cut---` to hide setup code
- Hover on `DataSource`, `JsonSource` (cross-links to API docs)

- [ ] **Step 2: Commit**

```bash
git add sites/basic/docs/guides/data-sources.mdx
git commit -m "docs(basic): add data sources guide with Twoslash examples

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 14: Basic site guide — Transforms

**Files:**

- Create: `sites/basic/docs/guides/transforms.mdx`

- [ ] **Step 1: Write `transforms.mdx`**

Demonstrates composing transforms and middleware:

- Function type hover on `Transform<In, Out>`
- Generics display with `// ^?`
- `// @noErrors` for partial examples
- Middleware composition patterns

- [ ] **Step 2: Commit**

```bash
git add sites/basic/docs/guides/transforms.mdx
git commit -m "docs(basic): add transforms guide with Twoslash examples

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 15: Basic site guide — Error Handling

**Files:**

- Create: `sites/basic/docs/guides/error-handling.mdx`

- [ ] **Step 1: Write `error-handling.mdx`**

Demonstrates error types and recovery:

- Error class hierarchy hover
- `// @errors: NNNN` for expected TypeScript errors
- Try/catch patterns with typed errors
- `@throws` documentation visible on hover

- [ ] **Step 2: Commit**

```bash
git add sites/basic/docs/guides/error-handling.mdx
git commit -m "docs(basic): add error handling guide with Twoslash examples

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 16: Basic site guide — Advanced

**Files:**

- Create: `sites/basic/docs/guides/advanced.mdx`

- [ ] **Step 1: Write `advanced.mdx`**

Demonstrates Codecs, Filters, and BatchProcessor:

- Namespace member hover (`Codecs.json`, `Filters.where`)
- `@alpha`/`@beta` staged API visibility
- BatchProcessor with `@decorator` reference
- `// @highlight` on key lines

- [ ] **Step 2: Commit**

```bash
git add sites/basic/docs/guides/advanced.mdx
git commit -m "docs(basic): add advanced guide with Twoslash examples

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 17: Basic site guide — Testing

**Files:**

- Create: `sites/basic/docs/guides/testing.mdx`

- [ ] **Step 1: Write `testing.mdx`**

Demonstrates `kitchensink/testing` utilities:

- Imports from `"kitchensink/testing"`
- `MockSource` usage with `// ^?`
- `TestPipeline` for assertion patterns
- `createMockData()` overloads
- `createTestSink()` with captured data

- [ ] **Step 2: Commit**

```bash
git add sites/basic/docs/guides/testing.mdx
git commit -m "docs(basic): add testing guide with Twoslash examples

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 18: Update basic site navigation and final verification

**Files:**

- Modify: `sites/basic/docs/_meta.json` (add guides section)

- [ ] **Step 1: Add guides to site navigation**

Update the root `_meta.json` to include a guides directory entry alongside the api directory.

- [ ] **Step 2: Start dev server and verify**

```bash
NO_OPEN=1 pnpm dev:basic
```

Verify:

- API docs render correctly at `/api/`
- Guide pages render at `/guides/getting-started`, etc.
- `with-api` code blocks show syntax highlighting
- Twoslash hover tooltips display type information
- Cross-links from code blocks navigate to API doc pages

- [ ] **Step 3: Commit navigation changes**

```bash
git add sites/basic/docs/_meta.json
git commit -m "docs(basic): add guides navigation to site

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] `pnpm --filter kitchensink run build` succeeds
- [ ] `pnpm vitest run modules/kitchensink/` all tests pass
- [ ] `pnpm --filter kitchensink run types:check` no type errors
- [ ] `pnpm run lint` no Biome errors in kitchensink
- [ ] All 25 TSDoc tags are exercised (cross-check against spec checklist)
- [ ] All API Extractor item kinds are present in the generated `.api.json`
- [ ] Basic site builds and renders with `pnpm --filter basic run build`
- [ ] Guide pages display correctly with Twoslash hover tooltips
