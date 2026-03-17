---
status: current
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-03-17
last-synced: 2026-03-17
completeness: 85
related:
  - rspress-plugin-api-extractor/import-generation-system.md
  - rspress-plugin-api-extractor/multi-entry-point-support.md
  - rspress-plugin-api-extractor/source-mapping-system.md
  - rspress-plugin-api-extractor/build-architecture.md
dependencies: []
---

# Type Loading & Virtual File System (VFS)

## Overview

The RSPress API Extractor plugin integrates with `type-registry-effect` to
load external package type definitions and generate virtual file systems
(VFS) for TypeScript's Twoslash compiler. This enables rich hover tooltips
and type-checked code examples in generated API documentation.

### Effect Service Architecture

Type loading uses the Effect service pattern:

- **`TypeRegistryService`** (`services/TypeRegistryService.ts`) --
  Interface defining `loadPackages` and `createTypeScriptCache`
- **`TypeRegistryServiceLive`** (`layers/TypeRegistryServiceLive.ts`) --
  Implementation using `type-registry-effect` Effect programs directly

The `TypeRegistryServiceLive` delegates to the upstream
`type-registry-effect` library's native Effect programs (not Promise
wrappers), providing the `NodeLayer` for platform dependencies.

## Architecture

### TypeRegistryService Interface

```typescript
export interface TypeRegistryServiceShape {
  readonly loadPackages: (
    packages: ReadonlyArray<ExternalPackageSpec>,
  ) => Effect.Effect<TypeRegistryResult, TypeRegistryError>;

  readonly createTypeScriptCache: (
    packages: ReadonlyArray<ExternalPackageSpec>,
    compilerOptions: object,
  ) => Effect.Effect<
    Map<string, VirtualTypeScriptEnvironment>,
    TypeRegistryError
  >;
}
```

### TypeRegistryServiceLive Implementation

```typescript
export const TypeRegistryServiceLive = Layer.succeed(
  TypeRegistryService, {
    loadPackages: (packages) =>
      Effect.gen(function* () {
        const specs = packages.map((pkg) =>
          new PackageSpec({ name: pkg.name, version: pkg.version })
        );
        const vfs = yield* TypeRegistry.getVFS(specs, {
          autoFetch: true
        });
        return { vfs };
      }).pipe(Effect.provide(NodeLayer)),

    createTypeScriptCache: (packages, compilerOptions) =>
      Effect.tryPromise({
        try: () => {
          const specs = packages.map((pkg) =>
            new PackageSpec({
              name: pkg.name, version: pkg.version
            })
          );
          return createTypeScriptCache(specs, compilerOptions);
        },
        catch: (error) => new PluginTypeRegistryError({ ... }),
      }),
  }
);
```

The `NodeLayer` from `type-registry-effect` provides `CacheService`,
`PackageFetcher`, and `TypeResolver` with Node.js platform
implementations.

### Integration Flow

```text
ConfigServiceLive.resolve()
    |
    +-> Collect external packages from plugin options
    |   (explicit + auto-detected from package.json)
    |
    +-> TypeRegistryService.loadPackages(packages)
    |   -> TypeRegistry.getVFS(specs, { autoFetch: true })
    |   -> Returns VirtualFileSystem (Map<string, string>)
    |
    +-> Prepend import statements to VFS declaration files
    |   (TypeReferenceExtractor)
    |
    +-> TypeRegistryService.createTypeScriptCache(packages, options)
    |   -> Creates VirtualTypeScriptEnvironment per package
    |
    +-> Combined VFS passed to TwoslashManager
    |   -> TypeScript language service resolves all references
    |
    +-> VFS config registered in VfsRegistry per API scope
```

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

Type loading errors are wrapped in `TypeRegistryError`:

```typescript
new PluginTypeRegistryError({
  packageName: packages.map((p) => p.name).join(", "),
  version: packages.map((p) => p.version).join(", "),
  reason: error.message ?? String(error),
})
```

Errors propagate through the Effect pipeline and are caught in
`ConfigServiceLive`. The build can continue without type information
if loading fails (code blocks render without Twoslash enhancements).

## Related Documentation

- **Import Generation System:**
  `import-generation-system.md` -- Import statement generation for VFS
- **Multi-Entry Point Support:**
  `multi-entry-point-support.md` -- VFS generation for multi-entry
  packages
- **Source Mapping:**
  `source-mapping-system.md` -- Source map generation alongside VFS
- **Build Architecture:**
  `build-architecture.md` -- Service layer and plugin structure
