#!/usr/bin/env bash
# Publish apps/web to origin/gh-pages (GitHub Pages project site).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Building with GITHUB_PAGES=1 (base /voyajes/)…"
GITHUB_PAGES=1 pnpm --filter @voyajes/core build
GITHUB_PAGES=1 pnpm --filter @voyajes/web build
cp apps/web/dist/index.html apps/web/dist/404.html
touch apps/web/dist/.nojekyll

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -a apps/web/dist/. "$TMP/"
cd "$TMP"
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.name="yvelkuri-stu" -c user.email="yvelkuri-stu@users.noreply.github.com" \
  commit -q -m "deploy: Voyajes web to GitHub Pages"
git remote add origin https://github.com/yvelkuri-stu/voyajes.git
git push -f origin gh-pages
echo "Deployed → https://yvelkuri-stu.github.io/voyajes/"
