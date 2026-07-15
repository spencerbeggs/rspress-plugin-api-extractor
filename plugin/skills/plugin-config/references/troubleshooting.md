# Troubleshooting

The build failures and stale-output problems the plugin produces, and what each one means. Most are not plugin bugs — they point at the model, the config, or the build cache. Load this when a build fails or a page looks wrong. Twoslash-error *mechanics* (what a directive does) are `twoslash`'s; the config *levers* for them are here.

## Route collision (build fails)

**Symptom:** the build fails with an error naming two items, their kinds and a shared route.

```text
Route collision: "Config" (Interface) and "Config" (Class) both resolve to
/api/interface/config. Rename one of the items or remap categories so they
land in different folders.
```

**Cause:** two genuinely distinct API items resolve to the same page route (`category-folder/name`, lowercased). The plugin fails fast on purpose rather than overwrite one page with the other. Detection runs on the **lowercased** route, so `Config` and `config` still collide — a case-insensitive filesystem (macOS, Windows) would merge them anyway.

**Fix — depends on whether the two items share a kind:**

- **Different categories already** (e.g. one Interface, one Class that a category remap pushed into the same folder). Give one category a distinct `folderName` so they separate again:

  ```ts
  categories: {
    ...DEFAULT_CATEGORIES,
    interfaces: { ...DEFAULT_CATEGORIES.interfaces, folderName: "iface" },
  }
  ```

- **Same kind, same category** (e.g. two distinct classes named `Config`, each re-exported from a different entry point). Remapping the shared category's `folderName` moves **both**, so it cannot split them. Either rename one item in your source, or route just one out with a new category keyed by a `tsdocModifier` — tag that one item with the modifier in its TSDoc and add a category carrying a distinct `folderName`:

  ```ts
  categories: {
    ...DEFAULT_CATEGORIES,
    // one Config class tagged with the matching @-modifier in its TSDoc lands here
    configV2: { displayName: "Config", singularName: "Config", folderName: "config-v2", tsdocModifier: "@configV2" },
  }
  ```

**What is *not* a collision:** the same item re-exported from several entry points (deduplicated); a value and a type sharing a name (they route to `/variable/...` and `/type/...`); two same-named items in different categories (different routes). Only two distinct items wanting the *same* folder and name collide.

## Forgotten-export warnings from API Extractor

**Symptom:** `ae-forgotten-export` warnings, or a type appears in a signature with no page and no working cross-link.

**Cause:** a type referenced by the public API is not itself exported from the entry point, so the reference cannot resolve to a documented page.

**Fix:** export the type so it joins the public API, or mark it `@internal` in its TSDoc so API Extractor drops it from the model. This is a library-source and API-Extractor-config fix, not a plugin fix.

**Exception — compiler-generated base declarations.** A class extending a call expression (Effect `Schema.Class`, `Data.TaggedError`, mixin factories) makes TypeScript emit an unexported `declare const Foo_base`. You cannot export these and do not need to: include them in the doc model (`includeForgottenExports`) and the plugin inlines the declaration in a "Base Class" section on the owning class page, then suppress the `ae-forgotten-export` rule for `_base` names. Full setup is in [model-plumbing.md](./model-plumbing.md).

## Twoslash errors in code examples (build still completes)

**Symptom:** the build logs `Twoslash error: ...` lines and a code-block error count in the summary, but completes.

**Cause:** Twoslash type-checks examples; one that does not type-check reports an error. **These are not build failures** — the block still renders, just without hover tooltips. Common causes: an intentional error, an incomplete snippet, or a referenced type from a package whose types were not loaded.

**Fixes, by cause:**

- **Intentional error** — annotate it so Twoslash expects it: `// @errors: <code>` inside the block (a `twoslash` mechanic).
- **Missing external type** — add the package to `externalPackages`, or confirm `autoDetectDependencies` covers it, so its types load. See [config-reference.md](./config-reference.md).
- **Incomplete snippet** — flesh out the example, or suppress example errors site-wide:

  ```ts
  ApiExtractorPlugin({
    api: { packageName: "my-library", model: "./api/my-library.api.json" },
    errors: { example: "suppress" },
  });
  ```

Raise `logLevel` to `verbose` to see which blocks report errors. Whether a block *deserves* fixing versus suppressing is an editorial call — see `doc-writer`.

## Stale output after editing the model or config

**Symptom:** you rebuilt the model or changed config, but the dev server shows old or half-updated pages.

**Cause:** RSPress (Rspack) caches aggressively, and its cache can survive a model change. The dev server also does **not** hot-reload when the plugin's own output changes — you must restart it.

**Fix:** clear the Rspack cache and restart. It lives under `node_modules/.cache/rspack`, and removing `.rspress` does **not** clear it:

```bash
rm -rf node_modules/.cache/rspack
npx rspress dev
```

If pages still look wrong, remove your `outDir` (e.g. `dist/`) and the `.rspress` temp directory too, then rebuild from clean.

## Pages did not regenerate after a model change

**Symptom:** you updated the `.api.json` but a page's content did not change.

**Cause:** the plugin rewrites only pages whose generated content actually changed, to avoid spurious file churn. If a page's rendered content did not change, it is correctly left alone — but the model may also simply not have been rebuilt.

**Fix:** confirm the model file on disk reflects your source change (rebuild the library so a fresh `.api.json` is emitted), then rebuild the docs. When in doubt, clear the Rspack cache as above. Build ordering that guarantees a fresh model is covered in [model-plumbing.md](./model-plumbing.md).

## Nothing happens with LLMs files

**Symptom:** `llmsPlugin` is configured but no `llms*.txt` files appear.

**Cause:** the integration post-processes RSPress's own LLMs output; with RSPress LLMs off, there is nothing to process.

**Fix:** set `llms: true` in the RSPress config. Both it and `llmsPlugin.enabled` must be on. See [llms.md](./llms.md).

## The `checkDeadLinks` accommodation

**Symptom:** the build fails on dead links, often on a partially translated locale where some pages are not yet present in every language.

**Common accommodation:** relax RSPress's dead-link checker:

```ts
markdown: { link: { checkDeadLinks: false } }
```

**But treat it as a temporary accommodation, not a best practice.** Turning off `checkDeadLinks` silences *all* dead-link reports, including real broken cross-links introduced later — not just the translation gaps you meant to allow. When a site has it off, verify links by hand (or re-enable it once translations are complete), because RSPress will no longer catch a genuinely broken link for you.
