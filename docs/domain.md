# Custom domain (root-domain readiness)

Voyajes runs today at **https://yvelkuri-stu.github.io/voyajes/** (app, GitHub Pages) +
**https://voyajes-api.yeshu501.workers.dev** (API + share links). Nothing here needs a domain;
this is the checklist for when you buy one (e.g. `voyaj.es`). **No domain has been purchased.**

## What already works

| Piece | Where | Notes |
|---|---|---|
| Configurable base path | `VITE_BASE_PATH` (apps/web/vite.config.ts) | `/voyajes/` on github.io, `/` on a root domain |
| Share-link host | `VITE_SHARE_BASE` (apps/web/src/lib/api.ts) | defaults to the Worker; short links are `<base>/v/<id>` |
| Rich previews | Worker `GET /v/:id` | crawlers (WhatsApp, iMessage, Telegram, Slack, Discord, X, LinkedIn…) get OG/Twitter meta + a themed 1200×630 cover (`/v/:id/og.jpg`); people get a 302 to `APP_URL/v/:id` |
| App-link manifests | Worker `/.well-known/assetlinks.json`, `/.well-known/apple-app-site-association` | driven by `ANDROID_PACKAGE`, `ANDROID_SHA256`, `APPLE_APP_IDS` |
| Root-domain mode | Worker `APP_ORIGIN` | when set, every non-API GET is proxied to the static app (SPA fallback to `/index.html`) |
| Legal | `/terms`, `/privacy` | app routes; the Worker redirects them to the app in split mode |

## Option A — one domain, Worker in front (recommended)

1. Buy the domain and add it to Cloudflare (free plan is fine).
2. Keep the static app on GitHub Pages (or Cloudflare Pages) and build it for the root:
   `VITE_BASE_PATH=/ VITE_SHARE_BASE=https://voyaj.es VITE_API_BASE=https://voyaj.es pnpm --filter @voyajes/web build`
3. In `apps/api/wrangler.toml` set:
   ```toml
   PUBLIC_BASE = "https://voyaj.es"
   APP_URL = "https://voyaj.es"
   APP_ORIGIN = "https://yvelkuri-stu.github.io/voyajes"   # or your Pages origin
   ALLOWED_ORIGINS = "https://voyaj.es,..."
   ```
   and add a route: `routes = [{ pattern = "voyaj.es/*", zone_name = "voyaj.es" }]`.
4. `bash scripts/deploy-api.sh`. Now `https://voyaj.es/v/<id>` previews in WhatsApp **and** opens the app
   on the same URL (no redirect), `/.well-known/*` is served at the root, and API routes
   (`/voyages`, `/media`, `/upload`, `/admin`, `/health`) keep working.

## Option B — split (what runs today)

App on `app.example.com` (or github.io), Worker on `go.example.com`: set `VITE_SHARE_BASE=https://go.example.com`
and `APP_URL=https://app.example.com`. Links are `go.example.com/v/<id>` → 302 → app.
Universal/App Links must then be associated with `go.example.com` (that's where `.well-known` is served).

## Store app links (later: Capacitor / PWABuilder)

- Android (TWA/Capacitor): set `ANDROID_PACKAGE` (e.g. `app.voyajes`) and `ANDROID_SHA256`
  (comma-separated signing-cert SHA-256 fingerprints from Play Console → App integrity).
- iOS: set `APPLE_APP_IDS` = `TEAMID.bundle.id`; paths `/v/*` and `/i/*` open in the app.
- Redeploy the Worker; verify with `curl https://<domain>/.well-known/assetlinks.json`.

## Things only you can do

- Buy the domain; point it at Cloudflare.
- Set `VITE_CONTACT_EMAIL` (published on /terms, /privacy and the report sheet) — today it falls back to GitHub Issues.
- Owner moderation: the admin secret lives only on the deploy machine at `.secrets/admin-secret` (gitignored).
  ```bash
  A=https://voyajes-api.yeshu501.workers.dev; S=$(cat .secrets/admin-secret)
  curl -H "Authorization: Bearer $S" "$A/admin/reports?status=open"
  curl -X POST -H "Authorization: Bearer $S" -d '{"reason":"nudity"}' "$A/admin/voyages/<id>/takedown"
  curl -X POST -H "Authorization: Bearer $S" "$A/admin/comments/<commentId>/takedown"
  curl -X POST -H "Authorization: Bearer $S" "$A/admin/drops/<dropId>/takedown"
  ```
  Rotate it with `openssl rand -hex 32 > .secrets/admin-secret && npx wrangler secret put ADMIN_SECRET < .secrets/admin-secret`.
