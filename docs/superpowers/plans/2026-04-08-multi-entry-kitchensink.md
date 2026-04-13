# Multi-Entry Kitchensink Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `./testing` entry point to the kitchensink module to produce a multi-entry API Extractor model.

**Architecture:** Create `src/testing.ts` with re-exports from main entry plus testing utilities (MockLogger, createMockResult, TestRunner, TestHook). Update package.json exports. Build and verify the merged `.api.json`.

**Tech Stack:** TypeScript, rslib-builder (NodeLibraryBuilder), API Extractor

---

## File Map

| Action | File | Responsibility |
| --- | --- | --- |
| Modify | `modules/kitchensink/package.json` | Add `./testing` export |
| Create | `modules/kitchensink/src/testing.ts` | Testing utilities entry point |

---

### Task 1: Add the testing export to package.json

**Files:**

- Modify: `modules/kitchensink/package.json:19-21`

- [ ] **Step 1: Add the `./testing` entry to exports**

In `modules/kitchensink/package.json`, change the exports field from:

```json
"exports": {
  ".": "./src/index.ts"
}
```

To:

```json
"exports": {
  ".": "./src/index.ts",
  "./testing": "./src/testing.ts"
}
```

No other changes to package.json.

---

### Task 2: Create the testing entry point

**Files:**

- Create: `modules/kitchensink/src/testing.ts`

- [ ] **Step 1: Create `modules/kitchensink/src/testing.ts`**

Write the full file. It re-exports shared types from the main entry and
adds four new exports: `MockLogger`, `createMockResult`, `TestRunner`,
and `TestHook`.

```typescript
/**
 * \@savvy-web/example-module/testing
 *
 * Testing utilities for the example-module. Provides mock implementations
 * and test helpers that integrate with the main module's logging and
 * task systems.
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Re-exports from main entry
// ---------------------------------------------------------------------------

export { AsyncTask, LogLevel, Logger, TaskStatus } from "./index.js";
export type { LogEntry, LoggerOptions, Result, TaskOptions } from "./index.js";

// ---------------------------------------------------------------------------
// Type aliases
// ---------------------------------------------------------------------------

/**
 * A lifecycle hook function for {@link TestRunner}.
 *
 * @remarks
 * Hooks can be synchronous or asynchronous. They run before or after
 * each task execution in a {@link TestRunner} session.
 *
 * @public
 */
export type TestHook = () => void | Promise<void>;

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

/**
 * A {@link Logger} implementation that captures entries in memory.
 *
 * @remarks
 * Instead of dispatching to external transports, `MockLogger` stores
 * every emitted {@link LogEntry} in an internal array accessible
 * via {@link MockLogger.entries}. This makes it easy to assert on log
 * output in tests.
 *
 * Extends {@link Logger} so it can be used as a drop-in replacement
 * anywhere the base class is accepted.
 *
 * @example
 * ```typescript
 * import { MockLogger, LogLevel } from "kitchensink/testing";
 *
 * const logger = new MockLogger({ minLevel: LogLevel.Debug });
 * logger.info("hello");
 *
 * console.log(logger.entries.length); // 1
 * console.log(logger.entries[0].message); // "hello"
 * ```
 *
 * @public
 */
export class MockLogger extends Logger {
 private readonly _entries: LogEntry[] = [];

 /**
  * All log entries captured by this mock logger.
  *
  * @returns A read-only array of {@link LogEntry} objects
  */
 get entries(): readonly LogEntry[] {
  return this._entries;
 }

 /**
  * Create a new MockLogger.
  *
  * @param options - Configuration options -- see {@link LoggerOptions}
  */
 constructor(options: LoggerOptions = {}) {
  super(options);
  // Register an internal transport that captures all entries
  this.addTransport((entry) => {
   this._entries.push(entry);
  });
 }

 /**
  * Remove all captured entries.
  *
  * @remarks
  * Call this between test cases to reset the logger state.
  */
 clear(): void {
  this._entries.length = 0;
 }
}

/**
 * A test harness that wraps {@link AsyncTask} execution with lifecycle hooks.
 *
 * @typeParam T - The type produced by each task run
 *
 * @remarks
 * `TestRunner` maintains a history of {@link Result} objects from each
 * run and exposes the {@link TestRunner.lastStatus | last task status}
 * for assertions. Optional {@link TestHook | beforeEach} and
 * {@link TestHook | afterEach} hooks run around every execution.
 *
 * @example
 * ```typescript
 * import { TestRunner, TaskStatus } from "kitchensink/testing";
 *
 * const runner = new TestRunner({
 *   beforeEach: () => console.log("starting"),
 *   afterEach: () => console.log("done"),
 * });
 *
 * const result = await runner.run({
 *   label: "example",
 *   execute: async () => 42,
 * });
 *
 * console.log(result.ok); // true
 * console.log(result.value); // 42
 * console.log(runner.lastStatus); // TaskStatus.Completed
 * ```
 *
 * @public
 */
export class TestRunner<T = unknown> {
 private readonly _results: Result<T>[] = [];
 private _lastStatus: TaskStatus | undefined;
 private readonly beforeEach: TestHook | undefined;
 private readonly afterEach: TestHook | undefined;
 private readonly logger: MockLogger | undefined;

 /**
  * All results from previous {@link TestRunner.run} calls.
  */
 get results(): readonly Result<T>[] {
  return this._results;
 }

 /**
  * The {@link TaskStatus} of the most recent run, or `undefined` if
  * no tasks have been executed.
  */
 get lastStatus(): TaskStatus | undefined {
  return this._lastStatus;
 }

 /**
  * Create a new TestRunner.
  *
  * @param options - Runner configuration
  * @param options.beforeEach - {@link TestHook} to run before each task
  * @param options.afterEach - {@link TestHook} to run after each task
  * @param options.logger - Optional {@link MockLogger} for task diagnostics
  */
 constructor(options: {
  beforeEach?: TestHook;
  afterEach?: TestHook;
  logger?: MockLogger;
 } = {}) {
  this.beforeEach = options.beforeEach;
  this.afterEach = options.afterEach;
  this.logger = options.logger;
 }

 /**
  * Execute a task with lifecycle hooks and record the result.
  *
  * @param taskOptions - Configuration for the {@link AsyncTask} -- see
  *   {@link TaskOptions}
  * @returns The {@link Result | Result\<T\>} of the task execution
  */
 async run(taskOptions: TaskOptions<T>): Promise<Result<T>> {
  if (this.beforeEach) {
   await this.beforeEach();
  }

  const task = new AsyncTask(taskOptions, this.logger);
  const result = await task.run();

  this._results.push(result);
  this._lastStatus = task.status;

  if (this.afterEach) {
   await this.afterEach();
  }

  return result;
 }
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Create a successful {@link Result} for testing.
 *
 * @typeParam T - The type of the success value
 * @param value - The success value
 * @returns A {@link Result | Result\<T\>} with `ok: true`
 *
 * @public
 */
export function createMockResult<T>(value: T): Result<T>;

/**
 * Create a failed {@link Result} for testing.
 *
 * @param value - Must be `undefined` for the failure overload
 * @param error - The error message
 * @returns A {@link Result | Result\<never\>} with `ok: false`
 *
 * @public
 */
export function createMockResult(value: undefined, error: string): Result<never>;

/**
 * Create a mock {@link Result} for testing.
 *
 * @remarks
 * Two calling conventions:
 * - `createMockResult(value)` -- creates a success result
 * - `createMockResult(undefined, error)` -- creates a failure result
 *
 * @example
 * ```typescript
 * import { createMockResult } from "kitchensink/testing";
 *
 * const success = createMockResult(42);
 * console.log(success.ok); // true
 * console.log(success.value); // 42
 *
 * const failure = createMockResult(undefined, "something went wrong");
 * console.log(failure.ok); // false
 * console.log(failure.error); // "something went wrong"
 * ```
 *
 * @public
 */
export function createMockResult<T>(value: T | undefined, error?: string): Result<T> {
 if (error !== undefined) {
  return { ok: false, error };
 }
 return { ok: true, value: value as T };
}
```

**Notes on the code:**

- Re-exports use `./index.js` extension per Biome's `useImportExtensions` rule
- `Result`, `LogEntry`, `LoggerOptions`, `TaskOptions` are re-exported as
  `export type` (interfaces/type aliases require verbatimModuleSyntax)
- `AsyncTask`, `Logger`, `LogLevel`, `TaskStatus` are re-exported as values
- All `@public` tags ensure items appear in the API Extractor model
- Cross-references use `{@link}` to test cross-entry linking

---

### Task 3: Build and verify the merged model

**Files:**

- None (verification only)

- [ ] **Step 1: Build the kitchensink module**

```bash
pnpm --filter kitchensink run build
```

Expected: Build succeeds with no errors. Both entry points are compiled.

- [ ] **Step 2: Verify separate output files exist**

```bash
ls modules/kitchensink/dist/npm/index.{js,d.ts} modules/kitchensink/dist/npm/testing.{js,d.ts}
```

Expected: All four files exist.

- [ ] **Step 3: Inspect the merged API model**

```bash
node -e "
const m = require('./modules/kitchensink/dist/npm/kitchensink.api.json');
console.log('Entry points:', m.members.length);
for (const ep of m.members) {
  console.log(' -', ep.canonicalReference, '(' + ep.members.length + ' members)');
}
"
```

Expected: Two entry point members. Main entry has canonical refs like
`kitchensink!LogLevel:enum`. Testing entry has refs like
`kitchensink/testing!MockLogger:class`.

- [ ] **Step 4: Verify transformed package.json exports**

```bash
cat modules/kitchensink/dist/npm/package.json | node -e "
const pkg = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
console.log(JSON.stringify(pkg.exports, null, 2));
"
```

Expected: Conditional exports with `types` and `import` conditions for
both `"."` and `"./testing"`.

- [ ] **Step 5: Verify model was copied to site directories**

```bash
ls -la sites/basic/lib/models/kitchensink/kitchensink.api.json \
       sites/i18n/lib/models/kitchensink/kitchensink.api.json \
       sites/multi/lib/models/kitchensink/kitchensink.api.json
```

Expected: All three copies exist and are the same merged model.

- [ ] **Step 6: Commit the changes**

```bash
git add modules/kitchensink/package.json modules/kitchensink/src/testing.ts
git commit -m "feat(kitchensink): add ./testing entry point for multi-entry API model testing

Adds a testing utilities entry that re-exports shared types from
the main entry and provides MockLogger, TestRunner, createMockResult,
and TestHook for exercising multi-entry point API model generation.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

Do NOT commit built artifacts (`dist/`, site model directories).
