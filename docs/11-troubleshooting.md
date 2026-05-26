# Troubleshooting

The build problems you are most likely to hit, and what each one means. Most are not bugs in the plugin — they point at something in the model, the config or the build cache that needs your attention.

## Route collision

**Symptom:** the build fails with an error naming two items, their kinds and a shared route.

```text
Route collision: "Config" (Interface) and "Config" (Class) both resolve to
/api/interface/config. Rename one of the items or remap categories so they
land in different folders.
```

**Cause:** two genuinely distinct API items resolve to the same page route (`category-folder/name`, lowercased). The plugin fails fast here on purpose; it will not overwrite one page with the other.

**Fix:** rename one of the items in your source, or route them into different category folders. A value and a type that share a name already land in different folders (`/variable/...` and `/type/...`) and never collide, so this error means two items truly want the same folder and name. To separate them, give one a custom category with a distinct `folderName`:

```ts
import { ApiExtractorPlugin, DEFAULT_CATEGORIES } from "rspress-plugin-api-extractor";

ApiExtractorPlugin({
  api: {
    packageName: "my-library",
    model: "./api/my-library.api.json",
    categories: {
      ...DEFAULT_CATEGORIES,
      interfaces: { ...DEFAULT_CATEGORIES.interfaces, folderName: "iface" },
    },
  },
});
```

Detection runs on the lowercased route, so two items differing only in case (`Config` and `config`) still collide. A case-insensitive filesystem would merge them anyway.

## Forgotten-export warnings from API Extractor

**Symptom:** API Extractor reports `ae-forgotten-export` warnings, or a type appears in a signature but has no page and no working cross-link.

**Cause:** a type is referenced by your public API but is not itself exported from the package entry point. API Extractor calls this a "forgotten export". The reference cannot resolve to a documented page, because the type was never made public.

**Fix:** export the type from your package's entry point so it joins the public API. If the type is meant to stay internal, mark it `@internal` in its TSDoc so API Extractor drops it from the model rather than flag it. This comes down to your library's exports, so the fix lives in your source and your API Extractor configuration, not in the plugin.

## Twoslash errors in code examples

**Symptom:** the build logs `Twoslash error: ...` lines and a count of code-block errors in the summary, but the build still completes.

**Cause:** Twoslash type-checks code examples, and when one does not type-check it reports an error. These are not build failures — the block still renders, just without hover tooltips and type annotations. Common reasons: an intentional error in an example, an incomplete snippet, or a referenced type from a package whose types were not loaded.

**Fixes, by cause:**

- **Intentional error:** annotate it so Twoslash expects it. Add `// @errors: <code>` to the block.
- **Missing external type:** add the package to `externalPackages` (or confirm `autoDetectDependencies` covers it) so its types load. See [Configuration](./02-configuration.md).
- **Incomplete snippet:** flesh out the example, or suppress example errors for the whole site with `errors: { example: "suppress" }`.

```ts
ApiExtractorPlugin({
  api: { packageName: "my-library", model: "./api/my-library.api.json" },
  errors: { example: "suppress" },
});
```

Raise `logLevel` to `verbose` to see which blocks are reporting errors.

## Stale build output after editing the plugin or a model

**Symptom:** you rebuilt your model or changed config, but the dev server still shows the old pages, or pages look half-updated.

**Cause:** RSPress (Rspack) caches aggressively. Its build cache can survive a model change and keep serving stale generated pages. The RSPress dev server also does not hot-reload when the plugin's own output changes — you have to restart it.

**Fix:** clear the Rspack cache and restart the dev server. The cache lives under `node_modules/.cache/rspack`, and removing `.rspress` does not clear it:

```bash
rm -rf node_modules/.cache/rspack
npx rspress dev
```

If pages still look wrong after that, remove your `outDir` (for example `dist/`) and the `.rspress` temp directory too, then rebuild from clean.

## Pages did not regenerate after a model change

**Symptom:** you updated the `.api.json` model but a page's content did not change.

**Cause:** the plugin rewrites only the pages whose generated content actually changed, to avoid spurious file churn. If the model change did not alter a page's rendered content, that page is correctly left alone. If you expected a change and see none, the model may not have been rebuilt.

**Fix:** confirm the model file on disk reflects your source change — rebuild your library so a fresh `.api.json` is emitted — then run the docs build again. When in doubt, clear the Rspack cache as above so nothing is served from a previous run.

## Nothing happens with LLMs files

**Symptom:** `llmsPlugin` is configured but no `llms*.txt` files appear.

**Cause:** the integration is a post-processing step over RSPress's own LLMs output. With RSPress's LLMs support off, there is nothing to post-process.

**Fix:** set `llms: true` in your RSPress config. Both that and `llmsPlugin.enabled` must be on. See the [LLMs guide](./09-llms.md).

## Related guides

- [Multi-entry points](./08-multi-entry-points.md) — the full rules behind route collisions.
- [Configuration](./02-configuration.md) — `externalPackages`, `errors` and `logLevel`.
- [LLMs](./09-llms.md) — the `llms: true` prerequisite.
