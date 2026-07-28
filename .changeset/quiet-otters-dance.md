---
"rspress-plugin-api-extractor": minor
---

## Features

### Explicitly inert configuration

`api: null`, `apis: null`, and `apis: []` are now valid plugin options. Any of them opts into an inert plugin: options are still validated, but nothing is generated — no Effect runtime is built, no snapshot database is written, and the LLMs UI wiring (`resolve.alias`, `themeConfig` scopes, `globalUIComponents`) and `afterBuild` post-processing are all skipped.

This lets a site register the plugin ahead of an API model existing, then flip on real config later without restructuring:

```typescript
ApiExtractorPlugin({
	api: null, // valid — plugin becomes a no-op until a real config is supplied
});
```

Omitting both `api` and `apis` entirely remains a configuration error. `apis: []` alone no longer fails validation.
