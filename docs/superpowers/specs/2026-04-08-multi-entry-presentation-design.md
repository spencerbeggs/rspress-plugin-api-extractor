# Multi-Entry Point Presentation

**Date:** 2026-04-08
**Status:** Approved
**Scope:** Plugin doc generation pipeline changes for multi-entry API models

## Goal

Update the plugin's doc generation pipeline to process all entry points
from a merged API Extractor model, deduplicating re-exported items and
handling name collisions with entry-point-scoped URL segments.

## Design Decisions

1. **Flat organization (Approach A)** -- Items from all entry points are
   categorized together by kind. No per-entry-point sub-sections in nav.
2. **Deduplicate re-exports** -- Items re-exported from secondary entry
   points get a single page under the defining (original) entry point.
   The page shows all entry points the item is available from.
3. **Collision-only URL segments** -- Entry point segments in URLs only
   appear when two different items share the same display name within
   the same category. Single-entry packages and multi-entry packages
   without collisions produce identical URLs to current behavior.
4. **Entry point naming** -- The `"."` entry point is named `"default"`.
   Named entries use their export path (e.g., `"./testing"` becomes
   `"testing"`).
5. **Backward compatible** -- Single-entry packages have zero behavioral
   change.

## URL Structure

| Scenario | URL |
| --- | --- |
| Single entry, any item | `/api/type/config` |
| Multi-entry, no collision | `/api/type/config` |
| Multi-entry, collision | `/api/type/default/config` and `/api/type/testing/config` |

## New Component: MultiEntryResolver

**File:** `plugin/src/multi-entry-resolver.ts`

A pure function `resolveEntryPoints()` that takes a raw `ApiPackage`
and produces a flat array of resolved items with deduplication and
collision metadata.

### Data Model

```typescript
interface ResolvedEntryItem {
  /** The API item from the model */
  item: ApiItem;
  /** Which entry point defines this item (canonical owner) */
  definingEntryPoint: string;
  /** All entry points that export this item (includes re-exports) */
  availableFrom: string[];
  /** Whether this display name collides across entry points */
  hasCollision: boolean;
}
```

### Entry Point Naming

- `"."` (main entry, canonical reference `package!`) maps to `"default"`
- `"./testing"` (canonical reference `package/testing!`) maps to
  `"testing"`

### Deduplication Logic

Two items across entry points are the "same" (re-exports) if they share
the same `displayName` AND `kind`. The defining entry point is
determined by preferring `"default"`, otherwise the first entry point
that exports it.

When a re-export is detected:

- Only one `ResolvedEntryItem` is emitted (from the defining entry
  point)
- `availableFrom` includes all entry points that export the item

### Collision Logic

A collision exists when two or more entry points export items with the
same `displayName` within the same category (matched by `kind` to
category `itemKinds`), but they are different items (not re-exports).

Different means different canonical reference base -- the items have
distinct member structures or source locations despite sharing a display
name.

When a collision is detected:

- Both items are emitted as separate `ResolvedEntryItem` entries
- `hasCollision: true` on both
- Route computation inserts the entry point segment

## Integration with prepareWorkItems

### Changes to `loader.ts`

`categorizeApiItems()` changes from accepting `ApiPackage` to accepting
`ResolvedEntryItem[]`. It categorizes by matching `item.kind` against
category `itemKinds` as before, but iterates resolved items instead of
entry point members.

`extractNamespaceMembers()` similarly changes to accept
`ResolvedEntryItem[]` and extract namespace members from the resolved
items.

### Changes to `build-stages.ts`

`prepareWorkItems()`:

1. Calls `resolveEntryPoints(apiPackage)` to get `ResolvedEntryItem[]`
2. Passes resolved items to modified `categorizeApiItems()`
3. Builds `WorkItem[]` with two new fields:
   - `availableFrom: string[]`
   - `entryPointSegment: string | undefined` (set only when
     `hasCollision` is true)

Route computation:

- No collision:
  `${baseRoute}/${folderName}/${displayName.toLowerCase()}`
- Collision:
  `${baseRoute}/${folderName}/${entryPointSegment}/${displayName.toLowerCase()}`

Cross-link route registration uses the same computed routes.

## Page Generator Changes

### "Available from" Display

Each page generator adds an "Available from" line when
`availableFrom.length > 1`:

```markdown
# MockLogger

Available from: `kitchensink`, `kitchensink/testing`

Summary text...
```

The package name is combined with the entry point name:

- `"default"` becomes the bare package name (`kitchensink`)
- Named entries become `kitchensink/testing`

For single-entry packages or items available from only one entry point,
this line is omitted.

### Navigation Labels

In `writeMetadata()`, the `_meta.json` label for colliding items
includes the entry point qualifier:

- `"Config (default)"` and `"Config (testing)"` for colliding items
- Plain `"Config"` for non-colliding items

## What Doesn't Change

- **`build-program.ts`** -- Still called once per API config
- **Stream pipeline** -- Processes `WorkItem[]` as before
- **`writeSingleFile()`** -- No changes
- **Snapshot tracking** -- Works as-is (paths derived from routes)
- **`PathDerivationService`** -- No changes
- **Cross-linkers** -- Receive routes map with correct paths
- **VFS / TypeRegistry** -- Already handles multi-entry
- **Single-entry packages** -- Zero behavioral change

## Testing Strategy

### Unit Tests for resolveEntryPoints()

Using the kitchensink `.api.json` merged model as test fixture:

1. **Single entry point** -- All items get `definingEntryPoint: "default"`,
   `availableFrom: ["default"]`, `hasCollision: false`
2. **Multi-entry, no collisions** -- Items from each entry point,
   unique items get their own entry, no segments
3. **Multi-entry with re-exports** -- Deduplicates to single item,
   `availableFrom` lists both entry points
4. **Multi-entry with collision** -- Sets `hasCollision: true`,
   both items emitted separately

### Integration Verification

- Build the basic site and confirm pages generated for items from
  both entry points
- Verify re-exported items (e.g., `Logger`) get single page with
  `availableFrom` showing both entry points
- Verify unique items (e.g., `MockLogger`) get flat routes
