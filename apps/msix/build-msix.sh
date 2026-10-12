#!/usr/bin/env bash
# Regenerate the Microsoft Store MSIX via PWABuilder's free packaging service.
# Fill these from Partner Center → your app → Product identity (they must match exactly):
#   MS_PACKAGE_ID="12345Voyajes.Voyajes" MS_PUBLISHER_CN="CN=ABCDEF12-..." MS_PUBLISHER_NAME="Your Name" bash build-msix.sh
# Optional: VOYAJES_URL (default the github.io site; set to your custom domain later), MS_VERSION (default 1.1.0.0)
set -euo pipefail
cd "$(dirname "$0")"
URL="${VOYAJES_URL:-https://yvelkuri-stu.github.io/voyajes/}"
python3 - "$URL" <<'PY'
import json, os, sys
url = sys.argv[1].rstrip('/') + '/'
d = json.load(open('pwabuilder-msix.json'))
d.update(url=url, manifestUrl=url + 'manifest.webmanifest', packageId=os.environ.get('MS_PACKAGE_ID', d['packageId']), version=os.environ.get('MS_VERSION', d['version']))
d['classicPackage']['url'] = url
d['publisher'] = {'displayName': os.environ.get('MS_PUBLISHER_NAME', d['publisher']['displayName']), 'commonName': os.environ.get('MS_PUBLISHER_CN', d['publisher']['commonName'])}
json.dump(d, open('/tmp/msix-options.json', 'w'))
PY
mkdir -p dist
code=$(curl -s -o dist/voyajes-msix-store-package.zip -w "%{http_code}" -X POST -H "Content-Type: application/json" --data @/tmp/msix-options.json https://pwabuilder-windows-docker.azurewebsites.net/msix/generatezip --max-time 340)
[[ $code == 200 ]] || { echo "PWABuilder returned $code"; cat dist/voyajes-msix-store-package.zip; exit 1; }
unzip -l dist/voyajes-msix-store-package.zip
