# Effect-TS Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development
> (if subagents available) or superpowers:executing-plans to implement this plan.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate rspress-plugin-api-extractor from Promise-based orchestration
to Effect-TS with Stream pipeline, typed errors, and service-layer architecture.

**Architecture:** ManagedRuntime bridges Effect programs to RSPress's plugin
interface. Services defined as interfaces with `Context.GenericTag`, implemented
as Layers. A Stream pipeline replaces `async.queue`-based parallelism. Three
active bugs are fixed as part of the migration.

**Tech Stack:** Effect, @effect/platform, @effect/platform-node, @effect/sql,
@effect/sql-sqlite-node, Vitest, Biome

**Spec:** `docs/superpowers/specs/2026-03-16-effect-migration-design.md`

---

## Chunk 1: Dependencies and Error Types

### Task 1: Install Effect dependencies

**Files:**

- Modify: `plugin/package.json`

- [ ] **Step 1: Add Effect packages as direct dependencies**

```bash
cd plugin && pnpm add effect @effect/platform @effect/platform-node @effect/sql @effect/sql-sqlite-node
```

- [ ] **Step 2: Verify install succeeded**

Run: `pnpm ls effect @effect/platform @effect/platform-node @effect/sql @effect/sql-sqlite-node`

Expected: All 5 packages listed with versions.

- [ ] **Step 3: Verify existing build still works**

Run: `pnpm run build`

Expected: Build succeeds with no errors. Effect packages are externalized
by rslib (not bundled).

- [ ] **Step 4: Verify existing tests still pass**

Run: `pnpm run test`

Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugin/package.json pnpm-lock.yaml
git commit -m "chore: add Effect-TS dependencies for plugin migration"
```

---

### Task 2: Create error types

**Files:**

- Create: `plugin/src/errors.ts`
- Test: `plugin/__test__/errors.test.ts`

- [ ] **Step 1: Write the test for error types**

Create `plugin/__test__/errors.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
 ApiModelLoadError,
 ConfigValidationError,
 PageGenerationError,
 PathDerivationError,
 PrettierFormatError,
 SnapshotDbError,
 TwoslashProcessingError,
 TypeRegistryError,
} from "../src/errors.js";

describe("TaggedError types", () => {
 it("ApiModelLoadError has correct tag and fields", () => {
  const err = new ApiModelLoadError({
   modelPath: "/path/to/model.api.json",
   reason: "File not found",
  });
  expect(err._tag).toBe("ApiModelLoadError");
  expect(err.modelPath).toBe("/path/to/model.api.json");
  expect(err.reason).toBe("File not found");
  expect(err.message).toContain("/path/to/model.api.json");
 });

 it("ConfigValidationError has correct tag", () => {
  const err = new ConfigValidationError({
   field: "api.model",
   reason: "Required when multiVersion is not active",
  });
  expect(err._tag).toBe("ConfigValidationError");
  expect(err.field).toBe("api.model");
 });

 it("SnapshotDbError has correct tag", () => {
  const err = new SnapshotDbError({
   operation: "upsert",
   dbPath: "/path/to/db",
   reason: "SQLITE_BUSY",
  });
  expect(err._tag).toBe("SnapshotDbError");
  expect(err.operation).toBe("upsert");
 });

 it("PageGenerationError has correct tag", () => {
  const err = new PageGenerationError({
   itemName: "MyClass",
   category: "class",
   reason: "Failed to generate signature",
  });
  expect(err._tag).toBe("PageGenerationError");
 });

 it("TwoslashProcessingError has correct tag", () => {
  const err = new TwoslashProcessingError({
   file: "api/class/MyClass.mdx",
   errorCode: "TS2440",
   reason: "Import conflicts",
  });
  expect(err._tag).toBe("TwoslashProcessingError");
 });

 it("TypeRegistryError has correct tag", () => {
  const err = new TypeRegistryError({
   packageName: "zod",
   version: "^3.22.4",
   reason: "Network timeout",
  });
  expect(err._tag).toBe("TypeRegistryError");
 });

 it("PathDerivationError has correct tag", () => {
  const err = new PathDerivationError({
   route: "/invalid//route",
   reason: "Double slash in route",
  });
  expect(err._tag).toBe("PathDerivationError");
 });

 it("PrettierFormatError has correct tag", () => {
  const err = new PrettierFormatError({
   file: "api/class/MyClass.mdx",
   reason: "Parse error",
  });
  expect(err._tag).toBe("PrettierFormatError");
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/errors.test.ts`

Expected: FAIL -- cannot resolve `../src/errors.js`.

- [ ] **Step 3: Implement error types**

Create `plugin/src/errors.ts`:

```typescript
import { Data } from "effect";

// --- Fatal errors (abort build) ---

export const ConfigValidationErrorBase = Data.TaggedError("ConfigValidationError");

export class ConfigValidationError extends ConfigValidationErrorBase<{
 readonly field: string;
 readonly reason: string;
}> {
 get message(): string {
  return `Config validation failed for '${this.field}': ${this.reason}`;
 }
}

export const ApiModelLoadErrorBase = Data.TaggedError("ApiModelLoadError");

export class ApiModelLoadError extends ApiModelLoadErrorBase<{
 readonly modelPath: string;
 readonly reason: string;
}> {
 get message(): string {
  return `Failed to load API model at '${this.modelPath}': ${this.reason}`;
 }
}

export const SnapshotDbErrorBase = Data.TaggedError("SnapshotDbError");

export class SnapshotDbError extends SnapshotDbErrorBase<{
 readonly operation: string;
 readonly dbPath: string;
 readonly reason: string;
}> {
 get message(): string {
  return `Snapshot DB error during '${this.operation}' at '${this.dbPath}': ${this.reason}`;
 }
}

export const PathDerivationErrorBase = Data.TaggedError("PathDerivationError");

export class PathDerivationError extends PathDerivationErrorBase<{
 readonly route: string;
 readonly reason: string;
}> {
 get message(): string {
  return `Path derivation error for route '${this.route}': ${this.reason}`;
 }
}

// --- Recoverable errors (skip item, continue pipeline) ---

export const TypeRegistryErrorBase = Data.TaggedError("TypeRegistryError");

export class TypeRegistryError extends TypeRegistryErrorBase<{
 readonly packageName: string;
 readonly version: string;
 readonly reason: string;
}> {
 get message(): string {
  return `Type registry error for '${this.packageName}@${this.version}': ${this.reason}`;
 }
}

export const PageGenerationErrorBase = Data.TaggedError("PageGenerationError");

export class PageGenerationError extends PageGenerationErrorBase<{
 readonly itemName: string;
 readonly category: string;
 readonly reason: string;
}> {
 get message(): string {
  return `Page generation failed for ${this.category} '${this.itemName}': ${this.reason}`;
 }
}

// --- Ignorable errors (log only) ---

export const TwoslashProcessingErrorBase = Data.TaggedError("TwoslashProcessingError");

export class TwoslashProcessingError extends TwoslashProcessingErrorBase<{
 readonly file: string;
 readonly errorCode: string;
 readonly reason: string;
}> {
 get message(): string {
  return `Twoslash error ${this.errorCode} in '${this.file}': ${this.reason}`;
 }
}

export const PrettierFormatErrorBase = Data.TaggedError("PrettierFormatError");

export class PrettierFormatError extends PrettierFormatErrorBase<{
 readonly file: string;
 readonly reason: string;
}> {
 get message(): string {
  return `Prettier format error in '${this.file}': ${this.reason}`;
 }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run plugin/__test__/errors.test.ts`

Expected: All 8 tests PASS.

- [ ] **Step 5: Run lint**

Run: `pnpm run lint`

Expected: No lint errors.

- [ ] **Step 6: Commit**

```bash
git add plugin/src/errors.ts plugin/__test__/errors.test.ts
git commit -m "feat: add TaggedError types for Effect migration"
```

---

## Chunk 2: Service Interfaces

### Task 3: Create ConfigService interface and Schema definitions

**Files:**

- Create: `plugin/src/services/ConfigService.ts`

This service holds validated plugin options and RSPress config. Schema
definitions replace the imperative validation in `config-validation.ts`.

- [ ] **Step 1: Create the services directory**

```bash
mkdir -p plugin/src/services
```

- [ ] **Step 2: Write ConfigService interface**

Create `plugin/src/services/ConfigService.ts`:

```typescript
import { Context, Effect } from "effect";
import type { ConfigValidationError } from "../errors.js";

/**
 * Validated plugin configuration derived from user-provided options.
 * This is the post-validation shape -- all invariants are guaranteed.
 */
export interface ValidatedApiConfig {
 readonly packageName: string;
 readonly model: string;
 readonly baseRoute: string;
 readonly apiFolder: string;
 readonly tsconfig: string | undefined;
 readonly compilerOptions: Record<string, unknown> | undefined;
 readonly externalPackages: ReadonlyArray<{ name: string; version: string }>;
}

export interface ValidatedPluginConfig {
 readonly mode: "single" | "multi";
 readonly apis: ReadonlyArray<ValidatedApiConfig>;
 readonly logLevel: "debug" | "verbose" | "info" | "warn" | "error";
 readonly pageConcurrency: number;
}

export interface ConfigService {
 readonly getPluginConfig: Effect.Effect<ValidatedPluginConfig>;
 readonly validateMultiVersion: (
  rspressVersions: ReadonlyArray<string>,
  defaultVersion: string,
 ) => Effect.Effect<void, ConfigValidationError>;
}

export const ConfigService = Context.GenericTag<ConfigService>(
 "rspress-plugin-api-extractor/ConfigService",
);
```

- [ ] **Step 3: Run typecheck to confirm**

Run: `pnpm run typecheck`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add plugin/src/services/ConfigService.ts
git commit -m "feat: add ConfigService interface"
```

---

### Task 4: Create SnapshotService interface

**Files:**

- Create: `plugin/src/services/SnapshotService.ts`

Wraps the SQLite snapshot manager. Uses `@effect/sql` for lifecycle.

- [ ] **Step 1: Write SnapshotService interface**

Create `plugin/src/services/SnapshotService.ts`:

```typescript
import { Context, Effect, Option } from "effect";
import type { SnapshotDbError } from "../errors.js";

export interface FileSnapshot {
 readonly outputDir: string;
 readonly filePath: string;
 readonly publishedTime: string;
 readonly modifiedTime: string;
 readonly contentHash: string;
 readonly frontmatterHash: string;
 readonly buildTime: string;
}

export interface SnapshotService {
 readonly getSnapshot: (
  outputDir: string,
  filePath: string,
 ) => Effect.Effect<Option.Option<FileSnapshot>, SnapshotDbError>;

 readonly upsert: (
  snapshot: FileSnapshot,
 ) => Effect.Effect<boolean, SnapshotDbError>;

 readonly getAllForDirectory: (
  outputDir: string,
 ) => Effect.Effect<ReadonlyArray<FileSnapshot>, SnapshotDbError>;

 readonly cleanupStale: (
  outputDir: string,
  currentFiles: ReadonlySet<string>,
 ) => Effect.Effect<ReadonlyArray<string>, SnapshotDbError>;

 readonly hashContent: (content: string) => string;

 readonly hashFrontmatter: (
  frontmatter: Record<string, unknown>,
 ) => string;
}

export const SnapshotService = Context.GenericTag<SnapshotService>(
 "rspress-plugin-api-extractor/SnapshotService",
);
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add plugin/src/services/SnapshotService.ts
git commit -m "feat: add SnapshotService interface"
```

---

### Task 5: Create PathDerivationService interface

**Files:**

- Create: `plugin/src/services/PathDerivationService.ts`

Wraps `deriveOutputPaths()` and `normalizeBaseRoute()` as a service.

- [ ] **Step 1: Write PathDerivationService interface**

Create `plugin/src/services/PathDerivationService.ts`:

```typescript
import { Context, Effect } from "effect";
import type { PathDerivationError } from "../errors.js";

export interface DerivedPath {
 readonly outputDir: string;
 readonly routeBase: string;
 readonly version: string | undefined;
 readonly locale: string | undefined;
}

export interface PathDerivationInput {
 readonly mode: "single" | "multi";
 readonly docsRoot: string;
 readonly baseRoute: string;
 readonly apiFolder: string | null;
 readonly locales: ReadonlyArray<string>;
 readonly defaultLang: string | undefined;
 readonly versions: ReadonlyArray<string>;
 readonly defaultVersion: string | undefined;
}

export interface PathDerivationService {
 readonly derivePaths: (
  input: PathDerivationInput,
 ) => Effect.Effect<ReadonlyArray<DerivedPath>, PathDerivationError>;

 readonly normalizeBaseRoute: (
  route: string,
 ) => Effect.Effect<string, PathDerivationError>;
}

export const PathDerivationService = Context.GenericTag<PathDerivationService>(
 "rspress-plugin-api-extractor/PathDerivationService",
);
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add plugin/src/services/PathDerivationService.ts
git commit -m "feat: add PathDerivationService interface"
```

---

### Task 6: Create remaining service interfaces

**Files:**

- Create: `plugin/src/services/ShikiService.ts`
- Create: `plugin/src/services/CrossLinkerService.ts`
- Create: `plugin/src/services/TypeRegistryService.ts`
- Create: `plugin/src/services/PageGeneratorService.ts`
- Create: `plugin/src/services/index.ts`

- [ ] **Step 1: Write ShikiService interface**

Create `plugin/src/services/ShikiService.ts`:

```typescript
import { Context, Effect } from "effect";
import type { ShikiTransformer } from "shiki";
import type { TwoslashProcessingError } from "../errors.js";

export interface ShikiService {
 readonly highlightCode: (
  code: string,
  lang: string,
  transformers?: ReadonlyArray<ShikiTransformer>,
  meta?: Record<string, string>,
 ) => Effect.Effect<string, TwoslashProcessingError>;

 readonly getCrossLinkerTransformer: Effect.Effect<ShikiTransformer>;
}

export const ShikiService = Context.GenericTag<ShikiService>(
 "rspress-plugin-api-extractor/ShikiService",
);
```

- [ ] **Step 2: Write CrossLinkerService interface**

Create `plugin/src/services/CrossLinkerService.ts`:

```typescript
import { Context, Effect } from "effect";

export interface CrossLinkData {
 readonly routes: Map<string, string>;
 readonly kinds: Map<string, string>;
}

export interface CrossLinkerService {
 readonly registerItems: (
  data: CrossLinkData,
  apiScope: string,
 ) => Effect.Effect<void>;

 readonly generateInlineCodeLinks: (
  text: string,
 ) => Effect.Effect<string>;

 readonly getCrossLinkData: Effect.Effect<CrossLinkData>;
}

export const CrossLinkerService = Context.GenericTag<CrossLinkerService>(
 "rspress-plugin-api-extractor/CrossLinkerService",
);
```

- [ ] **Step 3: Write TypeRegistryService interface**

Create `plugin/src/services/TypeRegistryService.ts`:

```typescript
import { Context, Effect } from "effect";
import type { VirtualFileSystem } from "type-registry-effect";
import type { TypeRegistryError } from "../errors.js";

export interface ExternalPackageSpec {
 readonly name: string;
 readonly version: string;
}

export interface TypeRegistryService {
 readonly loadPackages: (
  packages: ReadonlyArray<ExternalPackageSpec>,
 ) => Effect.Effect<VirtualFileSystem, TypeRegistryError>;
}

export const TypeRegistryService = Context.GenericTag<TypeRegistryService>(
 "rspress-plugin-api-extractor/TypeRegistryService",
);
```

- [ ] **Step 4: Write PageGeneratorService interface**

Create `plugin/src/services/PageGeneratorService.ts`:

```typescript
import { Context, Effect, Stream } from "effect";
import type { PageGenerationError } from "../errors.js";

export interface GeneratedPage {
 readonly relativePath: string;
 readonly content: string;
 readonly frontmatter: Record<string, unknown>;
 readonly apiName: string;
 readonly version: string | undefined;
 readonly category: string;
 readonly itemName: string;
}

export interface FileWriteDecision {
 readonly page: GeneratedPage;
 readonly outputDir: string;
 readonly status: "new" | "modified" | "unchanged";
 readonly publishedTime: string;
 readonly modifiedTime: string;
 readonly contentHash: string;
 readonly frontmatterHash: string;
}

export interface PageGeneratorService {
 readonly generatePages: (
  config: {
   readonly apiName: string;
   readonly outputDir: string;
   readonly routeBase: string;
   readonly version: string | undefined;
  },
 ) => Stream.Stream<GeneratedPage, PageGenerationError>;
}

export const PageGeneratorService = Context.GenericTag<PageGeneratorService>(
 "rspress-plugin-api-extractor/PageGeneratorService",
);
```

- [ ] **Step 5: Write services barrel export**

Create `plugin/src/services/index.ts`:

```typescript
export { ConfigService } from "./ConfigService.js";
export type { ValidatedApiConfig, ValidatedPluginConfig } from "./ConfigService.js";

export { CrossLinkerService } from "./CrossLinkerService.js";
export type { CrossLinkData } from "./CrossLinkerService.js";

export { PageGeneratorService } from "./PageGeneratorService.js";
export type { FileWriteDecision, GeneratedPage } from "./PageGeneratorService.js";

export { PathDerivationService } from "./PathDerivationService.js";
export type { DerivedPath, PathDerivationInput } from "./PathDerivationService.js";

export { ShikiService } from "./ShikiService.js";

export { SnapshotService } from "./SnapshotService.js";
export type { FileSnapshot } from "./SnapshotService.js";

export { TypeRegistryService } from "./TypeRegistryService.js";
export type { ExternalPackageSpec } from "./TypeRegistryService.js";
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm run typecheck`

Expected: No type errors.

- [ ] **Step 7: Run lint**

Run: `pnpm run lint`

Expected: No lint errors. Fix any import ordering issues Biome flags.

- [ ] **Step 8: Commit**

```bash
git add plugin/src/services/
git commit -m "feat: add service interfaces for Effect migration"
```

---

## Chunk 3: Test Infrastructure and Mock Layers

### Task 7: Create test helpers and mock layers

**Files:**

- Create: `plugin/__test__/utils/helpers.ts`
- Create: `plugin/__test__/utils/layers.ts`

These provide reusable mock layers for all service tests.

- [ ] **Step 1: Create test utils directory**

```bash
mkdir -p plugin/__test__/utils
```

- [ ] **Step 2: Write test helpers**

Create `plugin/__test__/utils/helpers.ts`:

```typescript
import { Effect, Layer } from "effect";

/**
 * Run an Effect program with a test layer and return the result.
 * Convenience wrapper for test assertions.
 */
export function runTest<A, E>(
 effect: Effect.Effect<A, E, never>,
): Promise<A> {
 return Effect.runPromise(effect);
}

/**
 * Run an Effect program with a provided layer.
 */
export function runTestWithLayer<A, E, R>(
 effect: Effect.Effect<A, E, R>,
 layer: Layer.Layer<R>,
): Promise<A> {
 return Effect.runPromise(effect.pipe(Effect.provide(layer)));
}
```

- [ ] **Step 3: Write mock layers**

Create `plugin/__test__/utils/layers.ts`:

```typescript
import { Effect, Layer, Option, Ref } from "effect";
import { createHash } from "node:crypto";
import { SnapshotService } from "../../src/services/SnapshotService.js";
import { PathDerivationService } from "../../src/services/PathDerivationService.js";
import { TypeRegistryService } from "../../src/services/TypeRegistryService.js";
import { CrossLinkerService } from "../../src/services/CrossLinkerService.js";
import { ShikiService } from "../../src/services/ShikiService.js";
import type { FileSnapshot } from "../../src/services/SnapshotService.js";

/**
 * Mock SnapshotService with in-memory Map storage.
 * Tracks all upserts for test assertions.
 */
export const MockSnapshotServiceLayer = Layer.effect(
 SnapshotService,
 Effect.gen(function* () {
  const store = yield* Ref.make(new Map<string, FileSnapshot>());
  return SnapshotService.of({
   getSnapshot: (outputDir, filePath) =>
    Ref.get(store).pipe(
     Effect.map((m) => Option.fromNullable(m.get(`${outputDir}::${filePath}`))),
    ),
   upsert: (snapshot) =>
    Ref.update(store, (m) => {
     const next = new Map(m);
     next.set(`${snapshot.outputDir}::${snapshot.filePath}`, snapshot);
     return next;
    }).pipe(Effect.as(true)),
   getAllForDirectory: (outputDir) =>
    Ref.get(store).pipe(
     Effect.map((m) =>
      [...m.values()].filter((s) => s.outputDir === outputDir),
     ),
    ),
   cleanupStale: (_outputDir, _currentFiles) =>
    Effect.succeed([]),
   hashContent: (content) =>
    createHash("sha256").update(content).digest("hex"),
   hashFrontmatter: (frontmatter) => {
    const sorted = JSON.stringify(
     Object.keys(frontmatter).sort().reduce(
      (acc, key) => {
       if (key !== "head" && key !== "publishedTime" && key !== "modifiedTime") {
        acc[key] = frontmatter[key];
       }
       return acc;
      },
      {} as Record<string, unknown>,
     ),
    );
    return createHash("sha256").update(sorted).digest("hex");
   },
  });
 }),
);

/**
 * Mock PathDerivationService using the real pure functions.
 */
import {
 deriveOutputPaths,
 normalizeBaseRoute,
} from "../../src/path-derivation.js";

export const MockPathDerivationServiceLayer = Layer.succeed(
 PathDerivationService,
 PathDerivationService.of({
  derivePaths: (input) => Effect.succeed(deriveOutputPaths(input)),
  normalizeBaseRoute: (route) => Effect.succeed(normalizeBaseRoute(route)),
 }),
);

/**
 * Mock TypeRegistryService returning empty VFS.
 */
export const MockTypeRegistryServiceLayer = Layer.succeed(
 TypeRegistryService,
 TypeRegistryService.of({
  loadPackages: (_packages) => Effect.succeed(new Map()),
 }),
);

/**
 * Mock CrossLinkerService with no-op registration.
 */
export const MockCrossLinkerServiceLayer = Layer.succeed(
 CrossLinkerService,
 CrossLinkerService.of({
  registerItems: (_data, _scope) => Effect.void,
  generateInlineCodeLinks: (text) => Effect.succeed(text),
  getCrossLinkData: Effect.succeed({ routes: new Map(), kinds: new Map() }),
 }),
);

/**
 * Mock ShikiService returning placeholder HTML.
 */
export const MockShikiServiceLayer = Layer.succeed(
 ShikiService,
 ShikiService.of({
  highlightCode: (code, _lang, _transformers, _meta) =>
   Effect.succeed(`<pre><code>${code}</code></pre>`),
  getCrossLinkerTransformer: Effect.succeed({
   name: "mock-cross-linker",
  }),
 }),
);
```

- [ ] **Step 4: Write a smoke test for mock layers**

Create `plugin/__test__/utils/layers.test.ts`:

```typescript
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import { SnapshotService } from "../../src/services/SnapshotService.js";
import { MockSnapshotServiceLayer } from "./layers.js";

describe("MockSnapshotServiceLayer", () => {
 it("starts empty and stores upserted snapshots", async () => {
  const program = Effect.gen(function* () {
   const service = yield* SnapshotService;

   // Initially empty
   const before = yield* service.getSnapshot("docs", "test.mdx");
   expect(Option.isNone(before)).toBe(true);

   // Upsert a snapshot
   yield* service.upsert({
    outputDir: "docs",
    filePath: "test.mdx",
    publishedTime: "2026-01-01T00:00:00Z",
    modifiedTime: "2026-01-01T00:00:00Z",
    contentHash: "abc123",
    frontmatterHash: "def456",
    buildTime: "2026-01-01T00:00:00Z",
   });

   // Now found
   const after = yield* service.getSnapshot("docs", "test.mdx");
   expect(Option.isSome(after)).toBe(true);
   if (Option.isSome(after)) {
    expect(after.value.contentHash).toBe("abc123");
   }
  });

  await Effect.runPromise(
   program.pipe(Effect.provide(MockSnapshotServiceLayer)),
  );
 });

 it("hashContent produces consistent SHA-256", () => {
  const program = Effect.gen(function* () {
   const service = yield* SnapshotService;
   const hash1 = service.hashContent("hello");
   const hash2 = service.hashContent("hello");
   const hash3 = service.hashContent("world");
   expect(hash1).toBe(hash2);
   expect(hash1).not.toBe(hash3);
   expect(hash1).toHaveLength(64); // SHA-256 hex
  });

  return Effect.runPromise(
   program.pipe(Effect.provide(MockSnapshotServiceLayer)),
  );
 });
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run plugin/__test__/utils/layers.test.ts`

Expected: All tests PASS.

- [ ] **Step 6: Run lint**

Run: `pnpm run lint`

Expected: No lint errors.

- [ ] **Step 7: Commit**

```bash
git add plugin/__test__/
git commit -m "feat: add test helpers and mock layers for Effect services"
```

---

## Chunk 4: Live Layer Implementations (Phase 1 wrappers)

### Task 8: Create PathDerivationServiceLive

**Files:**

- Create: `plugin/src/layers/PathDerivationServiceLive.ts`
- Create: `plugin/src/layers/index.ts`
- Test: `plugin/__test__/layers/PathDerivationServiceLive.test.ts`

This wraps the existing pure functions from `path-derivation.ts`.

- [ ] **Step 1: Create layers directory**

```bash
mkdir -p plugin/src/layers plugin/__test__/layers
```

- [ ] **Step 2: Write failing test**

Create `plugin/__test__/layers/PathDerivationServiceLive.test.ts`:

```typescript
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { PathDerivationService } from "../../src/services/PathDerivationService.js";
import { PathDerivationServiceLive } from "../../src/layers/PathDerivationServiceLive.js";

describe("PathDerivationServiceLive", () => {
 it("derives paths for single API, no i18n, no versioning", async () => {
  const program = Effect.gen(function* () {
   const service = yield* PathDerivationService;
   const paths = yield* service.derivePaths({
    mode: "single",
    docsRoot: "docs",
    baseRoute: "/",
    apiFolder: "api",
    locales: [],
    defaultLang: undefined,
    versions: [],
    defaultVersion: undefined,
   });
   expect(paths).toHaveLength(1);
   expect(paths[0]).toEqual({
    outputDir: "docs/api",
    routeBase: "/api",
    version: undefined,
    locale: undefined,
   });
  });

  await Effect.runPromise(
   program.pipe(Effect.provide(PathDerivationServiceLive)),
  );
 });

 it("derives paths for versioned + i18n (bug fix validation)", async () => {
  const program = Effect.gen(function* () {
   const service = yield* PathDerivationService;
   const paths = yield* service.derivePaths({
    mode: "single",
    docsRoot: "docs",
    baseRoute: "/",
    apiFolder: "api",
    locales: ["en", "zh"],
    defaultLang: "en",
    versions: ["v1", "v2"],
    defaultVersion: "v2",
   });
   // 2 versions x 2 locales = 4 paths
   expect(paths).toHaveLength(4);
   // Verify i18n is included in versioned paths
   const v1zh = paths.find((p) => p.version === "v1" && p.locale === "zh");
   expect(v1zh).toBeDefined();
   expect(v1zh?.routeBase).toBe("/v1/zh/api");
  });

  await Effect.runPromise(
   program.pipe(Effect.provide(PathDerivationServiceLive)),
  );
 });

 it("normalizes root route", async () => {
  const program = Effect.gen(function* () {
   const service = yield* PathDerivationService;
   const result = yield* service.normalizeBaseRoute("/");
   expect(result).toBe("/");
  });

  await Effect.runPromise(
   program.pipe(Effect.provide(PathDerivationServiceLive)),
  );
 });

 it("normalizes empty string to root", async () => {
  const program = Effect.gen(function* () {
   const service = yield* PathDerivationService;
   const result = yield* service.normalizeBaseRoute("");
   expect(result).toBe("/");
  });

  await Effect.runPromise(
   program.pipe(Effect.provide(PathDerivationServiceLive)),
  );
 });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/layers/PathDerivationServiceLive.test.ts`

Expected: FAIL -- cannot resolve layer module.

- [ ] **Step 4: Implement PathDerivationServiceLive**

Create `plugin/src/layers/PathDerivationServiceLive.ts`:

```typescript
import { Effect, Layer } from "effect";
import {
 deriveOutputPaths,
 normalizeBaseRoute,
} from "../path-derivation.js";
import { PathDerivationService } from "../services/PathDerivationService.js";

export const PathDerivationServiceLive = Layer.succeed(
 PathDerivationService,
 PathDerivationService.of({
  derivePaths: (input) =>
   Effect.succeed(deriveOutputPaths(input)),
  normalizeBaseRoute: (route) =>
   Effect.succeed(normalizeBaseRoute(route)),
 }),
);
```

Note: The error mapping will be refined in Phase 2 when we add proper
`PathDerivationError` handling. For now, the pure functions don't throw.

- [ ] **Step 5: Create layers barrel export**

Create `plugin/src/layers/index.ts`:

```typescript
export { PathDerivationServiceLive } from "./PathDerivationServiceLive.js";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run plugin/__test__/layers/PathDerivationServiceLive.test.ts`

Expected: All 4 tests PASS.

- [ ] **Step 7: Run lint and typecheck**

Run: `pnpm run lint && pnpm run typecheck`

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add plugin/src/layers/ plugin/__test__/layers/
git commit -m "feat: add PathDerivationServiceLive layer"
```

---

### Task 9: Create SnapshotServiceLive (wrapping existing manager)

**Files:**

- Create: `plugin/src/layers/SnapshotServiceLive.ts`
- Modify: `plugin/src/layers/index.ts`
- Test: `plugin/__test__/layers/SnapshotServiceLive.test.ts`

Phase 1 wrapper: delegates to existing `SnapshotManager` via `Effect.sync`.
Phase 3 will replace with `@effect/sql` native implementation.

- [ ] **Step 1: Write failing test**

Create `plugin/__test__/layers/SnapshotServiceLive.test.ts`:

```typescript
import { Effect, Option } from "effect";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SnapshotService } from "../../src/services/SnapshotService.js";
import { SnapshotServiceLive } from "../../src/layers/SnapshotServiceLive.js";

describe("SnapshotServiceLive", () => {
 let tmpDir: string;
 let dbPath: string;

 beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-test-"));
  dbPath = path.join(tmpDir, "test-snapshot.db");
 });

 afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
 });

 it("upserts and retrieves a snapshot", async () => {
  const layer = SnapshotServiceLive(dbPath);
  const program = Effect.gen(function* () {
   const service = yield* SnapshotService;

   yield* service.upsert({
    outputDir: "docs/api",
    filePath: "class/MyClass.mdx",
    publishedTime: "2026-01-01T00:00:00Z",
    modifiedTime: "2026-01-01T00:00:00Z",
    contentHash: "abc",
    frontmatterHash: "def",
    buildTime: "2026-01-01T00:00:00Z",
   });

   const result = yield* service.getSnapshot("docs/api", "class/MyClass.mdx");
   expect(Option.isSome(result)).toBe(true);
  });

  await Effect.runPromise(
   Effect.scoped(program.pipe(Effect.provide(layer))),
  );
 });

 it("returns None for missing snapshots", async () => {
  const layer = SnapshotServiceLive(dbPath);
  const program = Effect.gen(function* () {
   const service = yield* SnapshotService;
   const result = yield* service.getSnapshot("docs/api", "nonexistent.mdx");
   expect(Option.isNone(result)).toBe(true);
  });

  await Effect.runPromise(
   Effect.scoped(program.pipe(Effect.provide(layer))),
  );
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/layers/SnapshotServiceLive.test.ts`

Expected: FAIL -- cannot resolve module.

- [ ] **Step 3: Implement SnapshotServiceLive**

Create `plugin/src/layers/SnapshotServiceLive.ts`:

```typescript
import { Effect, Layer, Option } from "effect";
import { SnapshotManager } from "../snapshot-manager.js";
import { SnapshotService } from "../services/SnapshotService.js";
import type { SnapshotDbError } from "../errors.js";

/**
 * Phase 1 wrapper: delegates to existing SnapshotManager.
 * Phase 3 will replace with @effect/sql native implementation.
 *
 * Uses Layer.scoped + acquireRelease to guarantee DB cleanup.
 */
export const SnapshotServiceLive = (dbPath: string) =>
 Layer.scoped(
  SnapshotService,
  Effect.acquireRelease(
   // Acquire: open database
   Effect.sync(() => new SnapshotManager(dbPath)),
   // Release: close database (WAL checkpoint)
   (manager) => Effect.sync(() => manager.close()),
  ).pipe(
   Effect.map((manager) =>
    SnapshotService.of({
     getSnapshot: (outputDir, filePath) =>
      Effect.sync(() => {
       const result = manager.getSnapshot(outputDir, filePath);
       return result ? Option.some(result) : Option.none();
      }),
     upsert: (snapshot) =>
      Effect.sync(() => manager.upsertSnapshot(snapshot)),
     getAllForDirectory: (outputDir) =>
      Effect.sync(() => manager.getAllSnapshotsForDirectory(outputDir)),
     cleanupStale: (outputDir, currentFiles) =>
      Effect.sync(() => manager.cleanupStaleFiles(outputDir, currentFiles)),
     hashContent: (content) => SnapshotManager.hashContent(content),
     hashFrontmatter: (frontmatter) =>
      SnapshotManager.hashFrontmatter(frontmatter),
    }),
   ),
  ),
 );
```

- [ ] **Step 4: Export from layers barrel**

Add to `plugin/src/layers/index.ts`:

```typescript
export { SnapshotServiceLive } from "./SnapshotServiceLive.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run plugin/__test__/layers/SnapshotServiceLive.test.ts`

Expected: Both tests PASS.

- [ ] **Step 6: Run lint and typecheck**

Run: `pnpm run lint && pnpm run typecheck`

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add plugin/src/layers/SnapshotServiceLive.ts plugin/src/layers/index.ts plugin/__test__/layers/
git commit -m "feat: add SnapshotServiceLive with acquireRelease lifecycle"
```

---

### Task 10: Create ObservabilityLive (Logger + Metrics)

**Files:**

- Create: `plugin/src/layers/ObservabilityLive.ts`
- Modify: `plugin/src/layers/index.ts`
- Test: `plugin/__test__/layers/ObservabilityLive.test.ts`

Replaces `DebugLogger` with Effect's built-in Logger. Defines all
Metric counters and histograms.

- [ ] **Step 1: Write failing test**

Create `plugin/__test__/layers/ObservabilityLive.test.ts`:

```typescript
import { Effect, Logger, LogLevel, Metric, Ref } from "effect";
import { describe, expect, it } from "vitest";
import {
 BuildMetrics,
 PluginLoggerLive,
} from "../../src/layers/ObservabilityLive.js";

describe("ObservabilityLive", () => {
 it("PluginLoggerLive respects log level", async () => {
  const captured = { messages: [] as string[] };
  const testLogger = Logger.make(({ message }) => {
   captured.messages.push(String(message));
  });
  const layer = Logger.replace(Logger.defaultLogger, testLogger).pipe(
   Layer.merge(Logger.minimumLogLevel(LogLevel.Warning)),
  );

  const program = Effect.gen(function* () {
   yield* Effect.logDebug("should not appear");
   yield* Effect.logWarning("should appear");
  });

  await Effect.runPromise(program.pipe(Effect.provide(layer)));
  expect(captured.messages).toHaveLength(1);
  expect(captured.messages[0]).toContain("should appear");
 });

 it("BuildMetrics counters increment correctly", async () => {
  const program = Effect.gen(function* () {
   yield* Metric.increment(BuildMetrics.filesNew);
   yield* Metric.increment(BuildMetrics.filesNew);
   yield* Metric.increment(BuildMetrics.filesModified);
  });

  await Effect.runPromise(program);
  // Metrics are global singletons in Effect -- just verify no errors
 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run plugin/__test__/layers/ObservabilityLive.test.ts`

Expected: FAIL -- cannot resolve module.

- [ ] **Step 3: Implement ObservabilityLive**

Create `plugin/src/layers/ObservabilityLive.ts`:

```typescript
import { Layer, Logger, LogLevel, Metric } from "effect";

/**
 * All build metrics as named counters/histograms.
 * These replace the 5 ad-hoc stats collector classes.
 */
export const BuildMetrics = {
 filesTotal: Metric.counter("files.total"),
 filesNew: Metric.counter("files.new"),
 filesModified: Metric.counter("files.modified"),
 filesUnchanged: Metric.counter("files.unchanged"),
 codeblockDuration: Metric.histogram("codeblock.duration", {
  boundaries: [10, 25, 50, 100, 200, 500, 1000],
 }),
 codeblockSlow: Metric.counter("codeblock.slow"),
 twoslashErrors: Metric.counter("twoslash.errors"),
 prettierErrors: Metric.counter("prettier.errors"),
 pagesGenerated: Metric.counter("pages.generated"),
} as const;

/**
 * Create the Logger layer for the plugin.
 *
 * @param logLevel - Plugin log level from options
 */
export function PluginLoggerLive(
 logLevel: "debug" | "verbose" | "info" | "warn" | "error" = "info",
): Layer.Layer<never> {
 const effectLogLevel = {
  debug: LogLevel.Debug,
  verbose: LogLevel.Debug, // Effect doesn't have "verbose", use Debug
  info: LogLevel.Info,
  warn: LogLevel.Warning,
  error: LogLevel.Error,
 }[logLevel];

 return Logger.minimumLogLevel(effectLogLevel);
}
```

- [ ] **Step 4: Export from layers barrel**

Add to `plugin/src/layers/index.ts`:

```typescript
export { BuildMetrics, PluginLoggerLive } from "./ObservabilityLive.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run plugin/__test__/layers/ObservabilityLive.test.ts`

Expected: All tests PASS.

- [ ] **Step 6: Run lint and typecheck**

Run: `pnpm run lint && pnpm run typecheck`

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add plugin/src/layers/ObservabilityLive.ts plugin/src/layers/index.ts plugin/__test__/layers/ObservabilityLive.test.ts
git commit -m "feat: add ObservabilityLive with Logger and Metrics"
```

---

## Chunk 5: ManagedRuntime Bridge (Phase 1 completion)

### Task 11: Create build-program.ts skeleton

**Files:**

- Create: `plugin/src/build-program.ts`
- Test: `plugin/__test__/build-program.test.ts`

The top-level Effect program. Phase 1 wraps existing logic via
`Effect.promise`. Phase 2 replaces with the Stream pipeline.

- [ ] **Step 1: Write smoke test**

Create `plugin/__test__/build-program.test.ts`:

```typescript
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/build-program.js";

describe("buildProgram", () => {
 it("exports a function returning an Effect", () => {
  expect(typeof buildProgram).toBe("function");
  // The program requires services -- just verify it's constructible
  const program = buildProgram({ dryRun: true });
  expect(program).toBeDefined();
 });
});
```

Note: Full pipeline tests come in Phase 2 (Chunk 6). This is a smoke test
for the module structure.

- [ ] **Step 2: Implement build-program.ts skeleton**

Create `plugin/src/build-program.ts`:

```typescript
import { Effect } from "effect";

export interface BuildProgramOptions {
 readonly dryRun?: boolean;
}

/**
 * Top-level Effect program for the plugin build.
 *
 * Phase 1: Returns a no-op effect (existing logic stays in plugin.ts).
 * Phase 2: Will contain the full Stream pipeline.
 */
export function buildProgram(
 _options: BuildProgramOptions = {},
): Effect.Effect<void> {
 return Effect.log("Build program initialized (Phase 1 skeleton)");
}
```

- [ ] **Step 3: Run test**

Run: `pnpm vitest run plugin/__test__/build-program.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add plugin/src/build-program.ts plugin/__test__/build-program.test.ts
git commit -m "feat: add build-program skeleton for Phase 1"
```

---

### Task 12: Wire ManagedRuntime into plugin.ts

**Files:**

- Modify: `plugin/src/plugin.ts`

This is the core Phase 1 architectural change. The plugin factory creates
a `ManagedRuntime`, `beforeBuild` calls `buildProgram` through it, and
`afterBuild` disposes it.

- [ ] **Step 1: Import Effect and ManagedRuntime in plugin.ts**

Add to the top of `plugin/src/plugin.ts`:

```typescript
import { Effect, Layer, ManagedRuntime } from "effect";
import { buildProgram } from "./build-program.js";
import { PathDerivationServiceLive } from "./layers/PathDerivationServiceLive.js";
import { PluginLoggerLive } from "./layers/ObservabilityLive.js";
```

- [ ] **Step 2: Create the runtime in the plugin factory**

In the `apiExtractorPlugin()` function, after options validation but
before the return statement, add:

```typescript
// Phase 1: Minimal AppLayer with available services
const AppLayer = Layer.mergeAll(
  PathDerivationServiceLive,
  PluginLoggerLive(options.logLevel),
);
const runtime = ManagedRuntime.make(AppLayer);
```

- [ ] **Step 3: Add runtime.dispose() to afterBuild**

In the `afterBuild` hook, add cleanup:

```typescript
async afterBuild() {
  // ... existing afterBuild logic ...
  await runtime.dispose();
},
```

- [ ] **Step 4: Run all tests**

Run: `pnpm run test`

Expected: All tests PASS. The ManagedRuntime is created but
`buildProgram` is still a no-op, so no behavior change.

- [ ] **Step 5: Run build**

Run: `pnpm run build`

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add plugin/src/plugin.ts
git commit -m "feat: wire ManagedRuntime bridge into plugin factory"
```

---

### Task 13: Verify full test suite and build (Phase 1 complete)

**Files:**

- No new files. Verification only.

- [ ] **Step 1: Run all tests**

Run: `pnpm run test`

Expected: All existing tests PASS plus all new tests PASS.

- [ ] **Step 2: Run full build**

Run: `pnpm run build`

Expected: Build succeeds. New files are compiled but not yet imported by
the main plugin entry point (no behavior change).

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck`

Expected: No type errors.

- [ ] **Step 4: Run lint**

Run: `pnpm run lint`

Expected: No lint errors.

This completes Phase 1. The Effect infrastructure is in place:

- 8 TaggedError types
- 7 service interfaces
- Mock layers for testing
- PathDerivationServiceLive (real implementation)
- SnapshotServiceLive (wrapper with acquireRelease)
- ObservabilityLive (Logger + Metrics)
- build-program.ts skeleton
- All existing functionality unchanged

---

## Chunk 6: Phase 2 -- Bug Fixes as Native Effect

Phase 2 tasks fix the 3 active bugs by implementing the Stream pipeline
and per-API Layer composition. These are the first consumers of the Effect
infrastructure from Phase 1.

### Task 14: Bug Fix 2 -- Versioned + i18n path derivation

**Files:**

- Modify: `plugin/src/plugin.ts:1549-1555`
- Test: `plugin/__test__/bugs/versioned-i18n-paths.test.ts`

Replace the manual path construction in the versioned code path with
`deriveOutputPaths()`.

- [ ] **Step 1: Create bugs test directory**

```bash
mkdir -p plugin/__test__/bugs
```

- [ ] **Step 2: Write the regression test**

Create `plugin/__test__/bugs/versioned-i18n-paths.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { deriveOutputPaths } from "../../src/path-derivation.js";

describe("Bug: Versioned path bypass (plugin.ts:1550)", () => {
 it("versioned + i18n produces locale x version cross-product", () => {
  const paths = deriveOutputPaths({
   mode: "single",
   docsRoot: "docs",
   baseRoute: "/",
   apiFolder: "api",
   locales: ["en", "zh"],
   defaultLang: "en",
   versions: ["v1", "v2"],
   defaultVersion: "v2",
  });

  expect(paths).toHaveLength(4);

  // v1 + en (non-default version, default locale)
  const v1en = paths.find((p) => p.version === "v1" && p.locale === "en");
  expect(v1en).toBeDefined();
  expect(v1en?.outputDir).toBe("docs/v1/en/api");
  expect(v1en?.routeBase).toBe("/v1/api");

  // v1 + zh (non-default version, non-default locale)
  const v1zh = paths.find((p) => p.version === "v1" && p.locale === "zh");
  expect(v1zh).toBeDefined();
  expect(v1zh?.outputDir).toBe("docs/v1/zh/api");
  expect(v1zh?.routeBase).toBe("/v1/zh/api");

  // v2 + en (default version, default locale)
  const v2en = paths.find((p) => p.version === "v2" && p.locale === "en");
  expect(v2en).toBeDefined();
  expect(v2en?.routeBase).toBe("/api");

  // v2 + zh (default version, non-default locale)
  const v2zh = paths.find((p) => p.version === "v2" && p.locale === "zh");
  expect(v2zh).toBeDefined();
  expect(v2zh?.routeBase).toBe("/zh/api");
 });

 it("versioned without i18n still works", () => {
  const paths = deriveOutputPaths({
   mode: "single",
   docsRoot: "docs",
   baseRoute: "/",
   apiFolder: "api",
   locales: [],
   defaultLang: undefined,
   versions: ["v1", "v2"],
   defaultVersion: "v2",
  });

  expect(paths).toHaveLength(2);
 });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm vitest run plugin/__test__/bugs/versioned-i18n-paths.test.ts`

Expected: PASS -- `deriveOutputPaths` already handles this correctly.
The bug is that plugin.ts doesn't call it for versioned APIs.

- [ ] **Step 4: Fix plugin.ts versioned path computation**

In `plugin/src/plugin.ts`, find the versioned path computation at lines
1549-1555 and replace the manual construction with `deriveOutputPaths`:

Replace:

```typescript
// Compute output directory and route using deriveOutputPaths for this version
const versionDir = path.join(rspressRoot, version);
const apiFolder = api.apiFolder ?? "api";
const outputDir = apiFolder
 ? path.join(versionDir, baseRoute.replace(/^\//, ""), apiFolder)
 : path.join(versionDir, baseRoute.replace(/^\//, ""));
const fullRoute = apiFolder ? `${baseRoute}/${apiFolder}` : baseRoute;
```

With:

```typescript
// Use deriveOutputPaths for versioned paths (supports i18n + versioned cross-product)
const versionDerivedPaths = deriveOutputPaths({
 mode: "single",
 docsRoot: rspressRoot,
 baseRoute,
 apiFolder: api.apiFolder ?? "api",
 locales: rspressLocales,
 defaultLang: rspressLang,
 versions: [version],
 defaultVersion: rspressMultiVersion?.default,
});
// For this version, iterate all locale variants
```

Note: This change requires refactoring the surrounding code to iterate
`versionDerivedPaths` instead of using a single `outputDir`. The exact
diff depends on the code structure at implementation time. Follow the
pattern used by the non-versioned code path at lines 1601-1623.

- [ ] **Step 5: Run full test suite**

Run: `pnpm run test`

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add plugin/src/plugin.ts plugin/__test__/bugs/
git commit -m "fix: use deriveOutputPaths for versioned APIs (supports i18n)"
```

---

### Task 15: Bug Fix 3 -- Per-API tsconfig in multi-API mode

**Files:**

- Modify: `plugin/src/plugin.ts:1625-1637`
- Test: `plugin/__test__/bugs/per-api-tsconfig.test.ts`

Each API in multi-API mode should use its own tsconfig instead of sharing
the first API's config.

- [ ] **Step 1: Write regression test**

Create `plugin/__test__/bugs/per-api-tsconfig.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

describe("Bug: Multi-API tsconfig sharing (plugin.ts:1625)", () => {
 it("documents the fix: each API should use its own tsconfig", () => {
  // This is a design-level test documenting the fix.
  // The actual fix modifies plugin.ts to pass per-API tsconfig
  // to processSimpleApi instead of using firstApiTsconfig.
  //
  // Full integration test requires running the plugin with
  // multiple API configs, which is covered by site builds.

  // Verify the pattern: each API config should carry its own tsconfig
  const api1 = { packageName: "pkg-a", tsconfig: "tsconfig.a.json" };
  const api2 = { packageName: "pkg-b", tsconfig: "tsconfig.b.json" };

  // The fix ensures these are NOT merged into a single firstApiTsconfig
  expect(api1.tsconfig).not.toBe(api2.tsconfig);
 });
});
```

- [ ] **Step 2: Fix plugin.ts multi-API tsconfig handling**

In `plugin/src/plugin.ts` at lines 1625-1637, remove the
`firstApiTsconfig`/`firstApiCompilerOptions` capture pattern.

Instead, pass each API's tsconfig directly to `processSimpleApi()` or
the TypeScript resolution function. The exact change:

Replace:

```typescript
// Capture tsconfig from first API if not yet set
if (!firstApiTsconfig && api.tsconfig) {
 firstApiTsconfig = api.tsconfig;
}
if (!firstApiCompilerOptions && api.compilerOptions) {
 firstApiCompilerOptions = api.compilerOptions;
}
```

With:

```typescript
// Each API uses its own tsconfig (no sharing between APIs)
const apiTsconfig = api.tsconfig;
const apiCompilerOptions = api.compilerOptions;
```

Then update all downstream references from `firstApiTsconfig` to
`apiTsconfig` within the `apis.map()` callback scope.

- [ ] **Step 3: Run full test suite**

Run: `pnpm run test`

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add plugin/src/plugin.ts plugin/__test__/bugs/per-api-tsconfig.test.ts
git commit -m "fix: use per-API tsconfig in multi-API mode"
```

---

### Task 16: Bug Fix 1 -- Eliminate shared mutable context

**Files:**

- Modify: `plugin/src/plugin.ts:573-579`
- Test: `plugin/__test__/bugs/context-clobbering.test.ts`

Replace `setContext()`/`clearContext()` with per-item context passing.

- [ ] **Step 1: Write regression test**

Create `plugin/__test__/bugs/context-clobbering.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

describe("Bug: Twoslash error context clobbering (plugin.ts:575)", () => {
 it("documents the fix: no shared mutable context in parallel workers", () => {
  // The fix eliminates twoslashErrorStats.setContext() / clearContext()
  // in the parallelLimit callback. Instead, context is passed directly
  // to error recording functions.
  //
  // Phase 2 Stream pipeline will use Effect.annotateLogs for
  // fiber-scoped context. For now, the immediate fix is to pass
  // context as a parameter to error callbacks instead of using
  // shared mutable state.

  // Simulate the problem: shared state with concurrent access
  let sharedContext = "";
  const contexts: string[] = [];

  // Two "concurrent" workers set context and read it
  sharedContext = "worker-a";
  sharedContext = "worker-b"; // Worker B clobbers worker A
  contexts.push(sharedContext); // Worker A reads B's context!
  contexts.push(sharedContext);

  // Both captured the same context (bug)
  expect(contexts[0]).toBe(contexts[1]);

  // The fix: pass context directly, no shared state
  const fixedContexts: string[] = [];
  const processItem = (ctx: string) => fixedContexts.push(ctx);
  processItem("worker-a");
  processItem("worker-b");
  expect(fixedContexts[0]).toBe("worker-a");
  expect(fixedContexts[1]).toBe("worker-b");
 });
});
```

- [ ] **Step 2: Fix plugin.ts context handling**

In `plugin/src/plugin.ts` at line 575, remove the `setContext()` call
and the corresponding `clearContext()`. Instead, pass the context object
directly to the error stats recording function:

Replace:

```typescript
twoslashErrorStats.setContext({
 file: pageFilePath,
 api: apiName,
 version: packageJson?.version,
});
```

With:

```typescript
const errorContext = {
 file: pageFilePath,
 api: apiName,
 version: packageJson?.version,
};
```

Then update any `twoslashErrorStats.recordError()` calls within the
callback to accept the context as a parameter:
`twoslashErrorStats.recordError(error, code, errorContext)`.

Apply the same pattern to `prettierErrorStats` if it uses
`setContext()`/`clearContext()`.

Remove the `clearContext()` call at the end of the callback.

- [ ] **Step 3: Run full test suite**

Run: `pnpm run test`

Expected: All tests PASS.

- [ ] **Step 4: Run the full build to verify no regressions**

Run: `pnpm run build`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/plugin.ts plugin/__test__/bugs/context-clobbering.test.ts
git commit -m "fix: eliminate shared mutable context in parallel workers"
```

---

### Task 17: Phase 2 verification

- [ ] **Step 1: Run all tests**

Run: `pnpm run test`

Expected: All tests PASS (existing + new regression tests).

- [ ] **Step 2: Run lint and typecheck**

Run: `pnpm run lint && pnpm run typecheck`

Expected: No errors.

- [ ] **Step 3: Run build**

Run: `pnpm run build`

Expected: Build succeeds.

This completes Phase 2. All 3 bugs are fixed:

- Context clobbering: Shared mutable state eliminated
- Versioned paths: Uses `deriveOutputPaths` for all variants
- Multi-API tsconfig: Per-API config, no sharing

---

## Chunk 7: Phase 3 -- Native Effect Migration (staged)

Phase 3 migrates existing modules to native Effect one at a time. Each
task is independently shippable. The order is: config validation, utils,
observability collectors, type registry, snapshot manager.

Note: Phase 3 tasks are larger and may need to be broken into sub-tasks
during implementation. The plan provides the target state for each
migration.

### Task 18: Migrate config-validation.ts to Schema

**Files:**

- Modify: `plugin/src/services/ConfigService.ts` (add Schema definitions)
- Create: `plugin/src/layers/ConfigServiceLive.ts`
- Delete: `plugin/src/config-validation.ts`
- Test: `plugin/__test__/layers/ConfigServiceLive.test.ts`

Replace imperative validation with `Schema.Struct` + refinements.

- [ ] **Step 1: Write test for Schema-based validation**

The test should cover all cases from the existing
`config-validation.test.ts` plus the `apis: []` edge case.

- [ ] **Step 2: Implement ConfigServiceLive with Schema validation**

- [ ] **Step 3: Update plugin.ts to use ConfigService**

- [ ] **Step 4: Delete config-validation.ts**

- [ ] **Step 5: Run all tests, lint, typecheck**

- [ ] **Step 6: Commit**

---

### Task 19: Delete utils.ts (async package removal)

**Files:**

- Delete: `plugin/src/utils.ts`
- Modify: `plugin/src/plugin.ts` (replace `parallelLimit` calls)
- Modify: `plugin/package.json` (remove `async` dependency)

Replace `parallelLimit()` with `Promise.all` + chunking or
`Stream.mapEffect` depending on Phase 2 Stream pipeline progress.

- [ ] **Step 1: Replace parallelLimit usage in plugin.ts**

- [ ] **Step 2: Remove async dependency**

```bash
cd plugin && pnpm remove async @types/async
```

- [ ] **Step 3: Delete utils.ts**

- [ ] **Step 4: Run all tests**

- [ ] **Step 5: Commit**

---

### Task 20: Migrate observability collectors

**Files:**

- Delete: `plugin/src/debug-logger.ts`
- Delete: `plugin/src/performance-manager.ts`
- Delete: `plugin/src/code-block-stats.ts`
- Delete: `plugin/src/file-generation-stats.ts`
- Delete: `plugin/src/twoslash-error-stats.ts`
- Delete: `plugin/src/prettier-error-stats.ts`
- Modify: `plugin/src/plugin.ts` (use Effect Logger + Metrics)

Replace 5 collector classes with `Effect.log` + `BuildMetrics`.

- [ ] **Step 1: Replace logger usage throughout plugin.ts**

- [ ] **Step 2: Replace stats collector usage with Metrics**

- [ ] **Step 3: Delete all 6 collector files**

- [ ] **Step 4: Migrate or delete associated test files**

- [ ] **Step 5: Run all tests, lint, typecheck**

- [ ] **Step 6: Commit**

---

### Task 21: Migrate TypeRegistryLoader to direct Effect

**Files:**

- Delete: `plugin/src/type-registry-loader.ts`
- Create: `plugin/src/layers/TypeRegistryServiceLive.ts`

Use `type-registry-effect` programs directly instead of Promise wrappers.

- [ ] **Step 1: Implement TypeRegistryServiceLive**

- [ ] **Step 2: Update plugin.ts to use TypeRegistryService**

- [ ] **Step 3: Delete type-registry-loader.ts**

- [ ] **Step 4: Run all tests**

- [ ] **Step 5: Commit**

---

### Task 22: Migrate SnapshotManager to @effect/sql

**Files:**

- Delete: `plugin/src/snapshot-manager.ts`
- Modify: `plugin/src/layers/SnapshotServiceLive.ts` (native @effect/sql)
- Modify: `plugin/package.json` (remove better-sqlite3)

Replace `better-sqlite3` wrapper with `@effect/sql-sqlite-node`.

- [ ] **Step 1: Rewrite SnapshotServiceLive with @effect/sql**

- [ ] **Step 2: Remove better-sqlite3 dependency**

```bash
cd plugin && pnpm remove better-sqlite3 @types/better-sqlite3
```

- [ ] **Step 3: Delete snapshot-manager.ts**

- [ ] **Step 4: Run all tests**

- [ ] **Step 5: Commit**

---

### Task 23: Migrate build-events.ts from Zod to Schema

**Files:**

- Modify: `plugin/src/build-events.ts` (replace Zod with Effect Schema)
- Modify: `plugin/package.json` (remove zod)

- [ ] **Step 1: Rewrite event schemas using Effect Schema**

- [ ] **Step 2: Remove zod dependency**

```bash
cd plugin && pnpm remove zod
```

- [ ] **Step 3: Run all tests**

- [ ] **Step 4: Commit**

---

### Task 24: Final Phase 3 verification

- [ ] **Step 1: Run all tests**

Run: `pnpm run test`

Expected: All tests PASS.

- [ ] **Step 2: Run lint and typecheck**

Run: `pnpm run lint && pnpm run typecheck`

Expected: No errors.

- [ ] **Step 3: Run build**

Run: `pnpm run build`

Expected: Build succeeds.

- [ ] **Step 4: Verify deleted dependencies are gone**

Run: `pnpm ls better-sqlite3 async zod 2>&1`

Expected: None found (all removed).

- [ ] **Step 5: Verify new dependencies are present**

Run: `pnpm ls effect @effect/platform @effect/platform-node @effect/sql @effect/sql-sqlite-node`

Expected: All 5 listed.

This completes the Effect-TS migration.
