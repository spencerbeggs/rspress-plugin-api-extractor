---
status: current
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-05-26
last-synced: 2026-05-26
completeness: 85
related:
  - rspress-plugin-api-extractor/import-generation-system.md
  - rspress-plugin-api-extractor/multi-entry-vfs.md
  - rspress-plugin-api-extractor/source-mapping-system.md
  - rspress-plugin-api-extractor/build-architecture.md
dependencies: []
---

# Type Loading & Virtual File System (VFS)

## Overview

The RSPress API Extractor plugin integrates with `type-registry-effect` (v2,
the Effect v4 port) to load external package type definitions and generate
virtual file systems (VFS) for TypeScript's Twoslash compiler. This enables
rich hover tooltips and type-checked code examples in generated API
documentation.

### Effect Service Architecture

Type loading uses the Effect service pattern:

- **`TypeRegistryService`** (`services/TypeRegistryService.ts`) --
  Interface defining `resolveVersions` and `loadPackages`
- **`TypeRegistryServiceLive`** (`layers/TypeRegistryServiceLive.ts`) --
  Implementation using `type-registry-effect` Effect programs directly

Library v2 has no `/node` subpath and ships **no platform layer of its own** —
it composes at the edge, so `TypeRegistryServiceLive` wires the whole stack
itself. Library statics also became instance methods: the service yields the
`TypeRegistry` tag and calls `registry.getVfs(...)` / `registry.resolveVersion(...)`.

## Architecture

### TypeRegistryService Interface

```typescript
export interface TypeRegistryServiceShape {
  /**
   * Resolve each package's version spec (range / npm tag) to an exact
   * published version, dropping any package that cannot be resolved.
   * The CDN backing loadPackages requires exact versions.
   */
  readonly resolveVersions: (
    packages: ReadonlyArray<ExternalPackageSpec>,
  ) => Effect.Effect<ReadonlyArray<ExternalPackageSpec>>;

  readonly loadPackages: (
    packages: ReadonlyArray<ExternalPackageSpec>,
  ) => Effect.Effect<TypeRegistryResult, TypeRegistryError>;
}
```

There is no `createTypeScriptCache` method. (Earlier revisions of this document
described one; it has never existed on this interface in the current codebase.)

### Edge-composed registry stack

`TypeRegistryServiceLive` builds the registry runtime from module-level layer
consts — never rebuilt per call, per the v4 layer memoization discipline:

```typescript
const PlatformLive = Layer.mergeAll(NodeFileSystem.layer, Path.layer);

/** XDG app dirs under the library's shared namespace. */
const AppDirsLive = AppDirs.layer({ namespace: "type-registry-effect" }).pipe(
  Layer.provide(Layer.mergeAll(Xdg.layer, PlatformLive)),
);

/** Metadata plane: sqlite-backed @effected/store Cache in the XDG cache dir. */
const MetadataCacheLive = Layer.unwrap(
  Effect.gen(function* () {
    const appDirs = yield* AppDirs;
    const path = yield* Path.Path;
    const cacheDir = yield* appDirs.ensureCache;
    return Cache.layerSqlite({
      filename: path.join(cacheDir, "metadata.sqlite"),
    });
  }),
).pipe(Layer.provide(Layer.mergeAll(AppDirsLive, PlatformLive)));

const RegistryLayer = TypeRegistry.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(TypeCache.layerXdg(), PackageFetcher.layer)),
  Layer.provideMerge(RegistryObserverLayer),
  Layer.provide(Layer.mergeAll(
    MetadataCacheLive, AppDirsLive, PlatformLive, NodeHttpClient.layerUndici,
  )),
);
```

Both service methods run their program with `Effect.provide(RegistryLayer)`.
`resolveVersions` recovers from registry infrastructure failure (no HOME for
XDG, unwritable cache DB) by passing the specs through unresolved, so the
failure surfaces from `loadPackages` with a meaningful error rather than being
silently swallowed.

### Registry event observer

The library emits no logs of its own — observers are the only diagnostic
surface. `RegistryObserverLayer` (`Layer.succeed(RegistryObserver, ...)`)
forwards the library's typed events onto the plugin's EventBus as
`PluginEvent.TypeRegistryEvent`, so registry activity flows through the
plugin's configured log level and format.

In v2 the tag is `RegistryObserver` (was `TypeRegistryObserver`) and
`RegistryEvent` is a **Schema union with no `$match`**, so the observer is a
plain `switch` on `event._tag`. Levels: `BatchComplete` at `info`,
`PackageLoadFailed` at `warn`, everything else (version resolution, cache
hit/miss/stale, fetch start/failure, per-package load, batch start) at `debug`
so a normal build stays quiet.

### Integration Flow

```text
ConfigServiceLive.resolve()
    |
    +-> Collect external packages from plugin options
    |   (explicit + auto-detected from package.json)
    |
    +-> TypeRegistryService.resolveVersions(packages)
    |   -> registry.resolveVersion(name, spec) per package
    |   -> ranges/tags become exact versions; unresolvable specs dropped
    |
    +-> TypeRegistryService.loadPackages(resolvedPackages)
    |   -> registry.getVfs(specs, { autoFetch: true })
    |   -> Returns VirtualFileSystem (Map<string, string>)
    |
    +-> Prepend import statements to VFS declaration files
    |   (TypeReferenceExtractor)
    |
    +-> Combined VFS passed to TwoslashManager
    |   -> TypeScript language service resolves all references
    |
    +-> VFS config registered in VfsRegistry per API scope
```

Both calls are wrapped by `Effect.result` in `ConfigServiceLive`, so a type
load failure degrades the build (code blocks render without Twoslash
enhancements) rather than aborting it. `VirtualTypeScriptEnvironment` is now
imported from `@typescript/vfs` directly, since v2 dropped the `/node` subpath
that used to re-export it.

### VFS in the Build Pipeline

The VFS is consumed in two places:

1. **TwoslashManager** -- Provides type information for Twoslash
   processing of code blocks (hover tooltips, type annotations)

2. **VfsRegistry** -- Makes VFS config available to remark plugins
   (`remarkWithApi`, `remarkApiCodeblocks`) for user-authored code blocks

## Virtual File System (VFS)

The VFS is a `Map<string, string>` mapping file paths to TypeScript
source code:

```text
node_modules/
+-- zod/
|   +-- package.json
|   +-- index.d.ts
|   +-- lib/
|       +-- types.d.ts
+-- @effect/
    +-- schema/
        +-- package.json
        +-- dist/
            +-- index.d.ts
```

## Package Configuration

External packages are configured in plugin options:

```typescript
apiExtractor({
  externalPackages: [
    { name: "zod", version: "^3.22.4" },
    { name: "@effect/schema", version: "^0.68.0" },
  ],
})
```

Auto-detection from `package.json` is also supported via
`autoDetectDependencies`:

```typescript
apiExtractor({
  autoDetectDependencies: {
    peerDependencies: true,
    autoDependencies: true,
  },
})
```

## Error Handling

`loadPackages` catches any failure (`Effect.catch`) and wraps it in
`TypeRegistryError`:

```typescript
new PluginTypeRegistryError({
  packageName: packages.map((p) => p.name).join(", "),
  version: packages.map((p) => p.version).join(", "),
  reason: error instanceof Error ? (error.message ?? String(error)) : String(error),
})
```

Errors propagate through the Effect pipeline and are inspected in
`ConfigServiceLive` via `Effect.result` (the v4 replacement for
`Effect.either`; a `Result` with `_tag: "Failure"` and `.failure`). The build
continues without type information if loading fails — code blocks render
without Twoslash enhancements.

## Related Documentation

- **Import Generation System:**
  `import-generation-system.md` -- Import statement generation for VFS
- **Multi-Entry VFS:**
  `multi-entry-vfs.md` -- VFS `.d.ts` generation for multi-entry packages
- **Source Mapping:**
  `source-mapping-system.md` -- Standalone source-map utility
- **Build Architecture:**
  `build-architecture.md` -- Service layer and plugin structure
