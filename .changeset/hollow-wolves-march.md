---
"rspress-plugin-api-extractor": patch
---

## Refactoring

Delegates previously duplicated pure logic to the new `api-extractor-llms` runtime dependency. Model loading, type-signature formatting, TSDoc extraction helpers, and prose cross-linking now route through shared library implementations. Public config surface, route schemes, RSPress integration, and generated output are unchanged.

## Dependencies

| Dependency | Type | Action | From | To |
| :--------- | :--- | :------ | :--- | :- |
| api-extractor-llms | dependency | added | — | 0.1.0 |
