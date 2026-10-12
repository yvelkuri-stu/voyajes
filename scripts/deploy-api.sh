#!/usr/bin/env bash
# Deploy the Voyajes collaboration API (Cloudflare Worker + D1 [+ R2]).
# Needs CLOUDFLARE_API_TOKEN (never printed) and Node >= 22 for wrangler.
# Idempotent: creates the D1 db / R2 bucket if missing, applies migrations,
# sets SIGNING_KEY once, deploys, prints the workers.dev URL.
set -euo pipefail
cd "$(dirname "$0")/../apps/api"
export WRANGLER_SEND_METRICS=false
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
W="npx wrangler"
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  CLOUDFLARE_ACCOUNT_ID=$($W whoami 2>/dev/null | grep -oE '[0-9a-f]{32}' | head -1)
  export CLOUDFLARE_ACCOUNT_ID
fi

DB_ID=$($W d1 list --json | node -e 'const l=JSON.parse(require("fs").readFileSync(0,"utf8"));const d=l.find(x=>x.name==="voyajes");process.stdout.write(d?d.uuid:"")')
if [ -z "$DB_ID" ]; then
  $W d1 create voyajes >/dev/null
  DB_ID=$($W d1 list --json | node -e 'const l=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(l.find(x=>x.name==="voyajes").uuid)')
fi

R2=0
if $W r2 bucket list >/tmp/r2list 2>&1; then
  R2=1
  grep -q "voyajes-media" /tmp/r2list || $W r2 bucket create voyajes-media >/dev/null
fi

CFG=.wrangler.deploy.toml
sed "s/00000000-0000-0000-0000-000000000000/$DB_ID/" wrangler.toml > "$CFG"
if [ "$R2" = 0 ]; then
  # R2 not enabled on this account → media stored as chunked blobs in D1
  node -e 'const f=process.argv[1];const fs=require("fs");fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/\[\[r2_buckets\]\][\s\S]*?bucket_name = "voyajes-media"\n/,""))' "$CFG"
fi

$W d1 migrations apply voyajes --remote --config "$CFG" >/dev/null
OUT=$($W deploy --config "$CFG" 2>&1)
URL=$(printf '%s' "$OUT" | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1)
if ! $W secret list --config "$CFG" 2>/dev/null | grep -q SIGNING_KEY; then
  openssl rand -base64 48 | tr -d '\n' | $W secret put SIGNING_KEY --config "$CFG" >/dev/null
fi
# ADMIN_SECRET guards /admin/* takedowns. Generated once, stored only in a gitignored file on this machine.
SECRET_FILE="$(cd ../.. && pwd)/.secrets/admin-secret"
if ! $W secret list --config "$CFG" 2>/dev/null | grep -q ADMIN_SECRET; then
  mkdir -p "$(dirname "$SECRET_FILE")" && chmod 700 "$(dirname "$SECRET_FILE")"
  [ -s "$SECRET_FILE" ] || (umask 077; openssl rand -hex 32 | tr -d '\n' > "$SECRET_FILE")
  $W secret put ADMIN_SECRET --config "$CFG" < "$SECRET_FILE" >/dev/null
fi
# VAPID_PRIVATE_JWK signs Web Push requests. Generated once, piped straight into the secret (never printed).
if ! $W secret list --config "$CFG" 2>/dev/null | grep -q VAPID_PRIVATE_JWK; then
  node -e 'crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign"]).then(k=>crypto.subtle.exportKey("jwk",k.privateKey)).then(j=>process.stdout.write(JSON.stringify({kty:j.kty,crv:j.crv,d:j.d,x:j.x,y:j.y})))' \
    | $W secret put VAPID_PRIVATE_JWK --config "$CFG" >/dev/null
fi
echo "admin_secret_file=$SECRET_FILE"
echo "media=$([ "$R2" = 1 ] && echo r2 || echo d1)"
echo "url=$URL"
