---
"rspress-plugin-api-extractor": patch
---

## Bug Fixes

Reference tokens carrying a dts-rollup disambiguation suffix (e.g.
`CoverageLevelName$1`, emitted when a symbol is re-imported under an alias) are
now reconstructed using their canonical, un-suffixed name. The prepended import
uses the canonical name, so emitting the suffixed form previously left the
identifier undefined (`TS2304`) in the generated Twoslash VFS declarations. The
suffix is only stripped when the de-suffixed text matches the token's canonical
symbol, so identifiers that genuinely end in `$N` are left untouched.
