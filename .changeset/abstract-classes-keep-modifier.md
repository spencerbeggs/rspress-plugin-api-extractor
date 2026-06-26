---
"rspress-plugin-api-extractor": patch
---

## Bug Fixes

Abstract classes are now reconstructed with the `abstract` modifier on the class
header. Previously the modifier was dropped while abstract members were kept,
producing `TS1244`/`TS1253` ("abstract member in a non-abstract class") errors in
the generated Twoslash VFS declarations. The modifier is also preserved for
abstract classes nested inside namespaces.
