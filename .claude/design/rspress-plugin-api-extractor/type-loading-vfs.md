---
status: current
module: rspress-plugin-api-extractor
category: architecture
created: 2026-01-17
updated: 2026-01-17
last-synced: 2026-01-17
completeness: 85
related: []
dependencies: []
---

# Type Loading & Virtual File System (VFS)

## Overview

The RSPress API Extractor plugin integrates with `type-registry-effect` to
load external package type definitions and generate virtual file systems (VFS)
for TypeScript's Twoslash compiler. This enables rich hover tooltips and
type-checked code examples in generated API documentation.

## Architecture

### 1. TypeRegistryLoader

**Location:** `src/type-registry-loader.ts`

The `TypeRegistryLoader` class provides a high-level interface for loading
external package types. It wraps `type-registry-effect` and handles logging
integration.

**Key Features:**

- Configurable cache directory and TTL
- Logging integration via Logger interface
- Event handling for cache hits/misses and package loading
- Graceful error handling with detailed failure reporting
- Batch loading of multiple packages in parallel

**Initialization:**

```typescript
const loader = new TypeRegistryLoader(
  cacheDir,   // undefined = XDG default (~/.cache/type-registry-effect)
  ttl,        // milliseconds (default: 7 days)
  logger,     // Logger instance for observability
);
```

**Loading Types:**

```typescript
const result = await loader.load([
  { name: "zod", version: "^3.22.4" },
  { name: "@effect/schema", version: "^0.68.0" },
]);

// result.vfs: Map<string, string> with node_modules/ prefix
// result.loaded: Successfully loaded packages
// result.failed: Failed packages with error messages
```

### 2. Virtual File System (VFS)

The VFS is a `Map<string, string>` mapping file paths to TypeScript source
code. It represents an in-memory file system that TypeScript's compiler can
read from.

**Path Structure:**

All paths in the VFS use the `node_modules/` prefix to match TypeScript's
module resolution expectations:

```text
node_modules/
├── zod/
│   ├── package.json
│   ├── index.d.ts
│   └── lib/
│       └── types.d.ts
└── @effect/
    └── schema/
        ├── package.json
        └── dist/
            └── index.d.ts
```

**VFS Creation Flow:**

1. **Version Resolution:**
   - Convert version ranges (e.g., `^3.22.4`) to exact versions via jsDelivr
   - Emit `package.version.resolved` event if version changed

2. **Cache Check:**
   - Check if package exists in disk cache
   - Validate TTL to determine if cache is stale
   - Emit `cache.hit`, `cache.miss`, or `cache.stale` event

3. **Package Fetching (if needed):**
   - Download package.json from jsDelivr CDN
   - Get file tree to find all `.d.ts`, `.d.mts`, `.d.cts` files
   - Download type definition files in parallel
   - Write to disk cache with metadata

4. **VFS Generation:**
   - Read files from cache
   - Map file paths to `node_modules/{package}/{file}`
   - Return combined VFS for all packages

### 3. Integration with Twoslash

The VFS is passed to Twoslash via `TwoslashManager`:

```typescript
// src/twoslash-generator.ts
const twoslashManager = new TwoslashManager(
  vfs,              // Virtual file system from TypeRegistryLoader
  logger,           // Logger instance
  performanceManager, // Performance tracking
  stats,            // Error statistics collector
);

// Process code blocks with type information
const result = await twoslashManager.createTwoslasher(code, {
  meta: metadata,
  lang: "typescript",
});
```

**Twoslash Features Enabled by VFS:**

- **Hover tooltips:** Show type information on mouseover
- **Type errors:** Display TypeScript errors inline
- **Auto-imports:** Resolve import paths correctly
- **Cross-references:** Link to external type definitions

### 4. Package Configuration

External packages are configured in the plugin options:

```typescript
// website/rspress.config.ts
apiExtractor({
  externalPackages: [
    { name: "zod", version: "^3.22.4" },
    { name: "@effect/schema", version: "^0.68.0" },
    { name: "ts-pattern", version: "^5.0.1" },
  ],
})
```

**Version Specification:**

- Exact: `"3.22.4"`
- Range: `"^3.22.4"`, `"~3.22.4"`
- Tag: `"latest"`, `"next"`

All versions are resolved to exact versions before caching.

## Observability

### Event-Based Logging

The TypeRegistryLoader receives events from `type-registry-effect` via the
`onLogEvent` callback and formats them based on log level:

**INFO mode (default):**

```text
✅ Successfully loaded types for 3 package(s)
```

**VERBOSE mode:**

```text
📦 Loading types for 3 external package(s)...
   Resolved zod: ^3.22.4 → 3.23.8
   ✓ zod@3.23.8 (cached, 45m old)
   Fetching @effect/schema@0.68.15...
   ✓ Loaded @effect/schema@0.68.15 (142 files, downloaded)
   ✓ ts-pattern@5.0.1 (cached, 2h old)
   Completed: 3 packages loaded (178 files, 1.45s)
```

**DEBUG mode:**

```json
{"event":"cache.hit","level":"info","message":"Cache hit for zod@3.23.8",...}
{"event":"cache.miss","level":"debug","message":"Cache miss for @effect/schema@0.68.15",...}
{"event":"package.loaded","level":"info","message":"Loaded @effect/schema@0.68.15",...}
```

See `.claude/design/type-registry-effect/observability.md` for details on
the event schema.

### Error Handling

The loader implements graceful error handling:

**Partial Success:**

If some packages fail to load, the plugin continues with successfully loaded
packages:

```typescript
const { vfs, loaded, failed } = await loader.load(packages);

if (failed.length > 0) {
  logger.warn(`Failed to load ${failed.length} package(s):`);
  for (const { package: pkg, error } of failed) {
    logger.warn(`   ✗ ${pkg.name}@${pkg.version}: ${error}`);
  }
}

// Continue with loaded packages
if (loaded.length > 0) {
  logger.info(`✅ Successfully loaded types for ${loaded.length} package(s)`);
}
```

**Total Failure:**

If all packages fail, the plugin logs warnings but continues the build without
external types. Code blocks will still render but without enhanced type
information.

## Performance Optimizations

### 1. Disk Caching

Type definitions are cached to `~/.cache/type-registry-effect/{package}@{version}/`
with configurable TTL:

- Default TTL: 7 days
- Metadata stored in `.metadata.json`
- Cache key: `{package}@{exact-version}`

**Benefits:**

- Avoid redundant network requests
- Faster builds (cache hit ~20ms vs download ~1-2s)
- Offline support for cached packages

### 2. Parallel Loading

Multiple packages are fetched in parallel using `Promise.allSettled`:

```typescript
const results = await Promise.allSettled(
  packages.map(pkg => registry.getPackageVFS(pkg))
);
```

**Benchmark:** Loading 3 packages:

- Serial: ~4.5s total
- Parallel: ~1.5s total (3x speedup)

### 3. Incremental Updates

The plugin only reloads types when:

- External package configuration changes
- Cache is stale (TTL expired)
- Cache directory doesn't exist

Otherwise, the VFS is reused across builds.

## Type Resolution

The VFS includes proper package.json files to enable TypeScript's module
resolution. The `TypeResolver` service (in `type-registry-effect`) handles:

### 1. Exports Field Resolution

Modern packages use `exports` for conditional exports:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "default": "./dist/index.js"
    },
    "./advanced": {
      "types": "./dist/advanced.d.ts"
    }
  }
}
```

The resolver extracts the `types` path for each export.

### 2. TypesVersions Resolution

Some packages use `typesVersions` for conditional type exports based on
TypeScript version:

```json
{
  "typesVersions": {
    "*": {
      "*": ["dist/*"]
    }
  }
}
```

### 3. Legacy Resolution

For packages without `exports` or `typesVersions`:

1. Check `types` or `typings` field
2. Try common paths: `index.d.ts`, `lib/index.d.ts`
3. Match file extensions: `.d.ts`, `.d.mts`, `.d.cts`

## Error Tracking

Twoslash errors in code blocks are tracked by the `TwoslashErrorStatsCollector`:

```typescript
// src/twoslash-error-stats.ts
stats.recordError({
  code: 2307,  // "Cannot find module 'zod'"
  message: "Cannot find module 'zod' or its corresponding type declarations.",
  file: "docs/en/api/functions/parseConfig.mdx",
  api: "my-package",
  version: "1.0.0",
});
```

**Error Attribution:**

- Path-based inference detects API name and version from file path
- Errors grouped by code, file, API, and version
- Summary printed at build completion in VERBOSE/DEBUG modes

See `.claude/design/rspress-plugin-api-extractor/error-observability.md`
for details.

## Future Enhancements

### 1. Monorepo Support

Allow loading types from local packages in the monorepo without fetching
from CDN:

```typescript
externalPackages: [
  { name: "my-package", source: "workspace" },  // Use local dist/
]
```

### 2. Custom CDN

Support alternative CDNs besides jsDelivr:

```typescript
typeRegistry: {
  cdn: "https://unpkg.com",  // or "esm.sh"
}
```

### 3. Selective Type Loading

Only download specific entry points instead of all `.d.ts` files:

```typescript
externalPackages: [
  {
    name: "lodash",
    version: "^4.17.21",
    include: ["index.d.ts", "fp.d.ts"],  // Skip individual function files
  },
]
```

### 4. VFS Preloading

Preload VFS during plugin initialization instead of first code block:

```typescript
async afterSetup() {
  await this.loader.load(this.config.externalPackages);
}
```

This would frontload the network latency instead of blocking first page
generation.

## Related Documentation

- **Import Generation System:**
  `.claude/design/rspress-plugin-api-extractor/import-generation-system.md` -
  Automatic import statement generation for VFS
- **Multi-Entry Point Support:**
  `.claude/design/rspress-plugin-api-extractor/multi-entry-point-support.md` -
  VFS generation for multi-entry packages
- **Source Mapping:**
  `.claude/design/rspress-plugin-api-extractor/source-mapping-system.md` -
  Source map generation alongside VFS
- **Effect Type Registry:** `pkgs/type-registry-effect/CLAUDE.md` -
  Package fetching and VFS generation service
- **Event Observability:**
  `.claude/design/type-registry-effect/observability.md` -
  Event-based logging architecture
- **Error Observability:**
  `.claude/design/rspress-plugin-api-extractor/error-observability.md` -
  Twoslash error tracking
- **Performance Observability:**
  `.claude/design/rspress-plugin-api-extractor/performance-observability.md` -
  Build performance tracking
- **Main Plugin README:** `plugin/README.md`
- **Package CLAUDE.md:** `plugin/CLAUDE.md`
