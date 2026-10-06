# Voyajes catalog sync

The official catalog lives in `catalog/manifest.json` and is mirrored to the web app as `apps/web/public/catalog-manifest.json`.

## Versioning

| Field | Meaning |
| --- | --- |
| `catalogVersion` | Human-readable stamp, e.g. `2026.10.06.3` |
| `etag` | Delta/sync token, e.g. `W/"vj-20261006-3"` |
| `generatedAt` | UTC timestamp when the manifest was written |
| `packs[]` | Themes, **templates**, audio beats, motion stubs |
| `tombstones[]` | Pack ids removed from the channel |

Bump **`catalogVersion` + `etag`** whenever you add/change packs so clients can detect updates.

## Shipping new templates

1. Add a `kind: "template"` pack to `catalog/manifest.json` with:
   - `themeId`, `motion`, `transition`, `beatId`, `beatSync`
   - `textStyle`, `textTransition`
   - optional `aspect`, `durationTargetSec`
2. Keep combos original (Voyajes packs — do not copy proprietary CapCut/Canva assets).
3. Bump `catalogVersion` / `etag` / `generatedAt`.
4. Mirror to the web public tree:

```bash
cp catalog/manifest.json apps/web/public/catalog-manifest.json
# keep beat previews in sync if you added audio
cp -R catalog/beats catalog/previews apps/web/public/catalog/ 2>/dev/null || true
```

5. CLI cache refresh:

```bash
pnpm voyajes sync --force
pnpm voyajes catalog list --kind template
```

6. Rebuild & deploy Pages so the live site fetches the new manifest:

```bash
./scripts/deploy-gh-pages.sh
```

## Client notifications

The web app compares `localStorage` key `voyajes.catalog.lastSeenVersion` against the live `catalog-manifest.json`. When the version changes:

- In-app toast + bell badge
- Soft prompt for the browser Notification API (never forced)
- “Mark seen” stores the new version

## Current templates (14)

Midnight Metro · Sunlit Drift · Coastal Bounce · Golden Recap · VHS Party · Gallery Quiet · Acid Drop · Blush Story · Field Notes · Strobe Night · Swing Retro · Mint Travel · Lounge Edit · Pulse Reels
