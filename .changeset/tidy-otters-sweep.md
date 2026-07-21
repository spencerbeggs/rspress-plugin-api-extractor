---
"rspress-plugin-api-extractor": patch
---

## Bug Fixes

- Fixed namespace member routing when a member's simple name matches its category folder (e.g. an Effect Schema companion-namespace alias like `CompilerOptions.Type`) — this previously produced corrupted page paths with colliding `_meta.json` navigation entries, breaking the RSPress sidebar and failing the consumer's docs build. Only the final route segment is now replaced with the qualified name.
- Fixed incremental build cleanup to actually remove directories left empty by stale or orphaned file deletion. The sweep previously only fed on orphaned files (missing directories emptied by stale-file cleanup) and never removed anything, because directory removal without the recursive flag failed silently.
- Long `tsconfig`/`compilerOptions` "ignoring alternatives" console warnings (multi-API configs with more than 2 APIs) now collapse to a count instead of listing every path, keeping the warning to one scannable line.

## Documentation

`MultiApiConfig.tsconfig` and `compilerOptions` now document the multi-API constraint: Twoslash type-checks all code examples in a single shared TypeScript environment, so only the first API entry that provides a value is honored — the rest are ignored, with a warning logged when they differ.
