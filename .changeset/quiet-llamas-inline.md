---
"rspress-plugin-api-extractor": minor
---

## Features

### Inline synthetic base-class declarations

When a documented class extends a call expression (Effect `Schema.Class`, `Data.TaggedError`, mixin factories, etc.), TypeScript emits an unexported companion declaration (`Foo_base`) that API Extractor hoists into the doc model. Previously this rendered as its own empty Variable page with a sidebar entry, and the class signature linked out to that orphan page.

The plugin now detects these synthetic bases automatically — an unexported item referenced only from an exported class's `extends` clause — and:

- generates no standalone page or sidebar entry for the synthetic base
- renders its declaration inline in a "Base Class" section on the owning class's page
- points the `Foo_base` reference in the class signature at that section's anchor instead of a dead link

Classes that don't extend a call expression are unaffected, and genuine forgotten exports still surface as before. This is automatic — there is no configuration option and no opt-out.
