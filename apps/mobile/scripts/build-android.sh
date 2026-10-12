#!/usr/bin/env bash
# Build Voyajes Android: debug APK (installable) + release AAB (unsigned, or signed with the upload key if
# .secrets/android/keystore.properties exists). Toolchain lives under ~/.local (no root needed).
#   bash scripts/build-android.sh debug|release|all     (VOYAJES_UNSIGNED=1 to force an unsigned AAB)
set -euo pipefail
cd "$(dirname "$0")/.."
export JAVA_HOME="${JAVA_HOME:-$HOME/.local/jdk}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/.local/android}" ANDROID_SDK_ROOT="${ANDROID_HOME:-$HOME/.local/android}"
export PATH="$HOME/.local/node22/bin:$JAVA_HOME/bin:$PATH"
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
pnpm build:web >/dev/null
npx cap sync android >/dev/null
mkdir -p dist
cd android
what="${1:-all}"
if [[ $what == debug || $what == all ]]; then
  ./gradlew -q assembleDebug
  cp app/build/outputs/apk/debug/app-debug.apk ../dist/voyajes-debug.apk
fi
if [[ $what == release || $what == all ]]; then
  VOYAJES_UNSIGNED=1 ./gradlew -q bundleRelease
  cp app/build/outputs/bundle/release/app-release.aab ../dist/voyajes-release-unsigned.aab
  if [[ -f ../../../.secrets/android/keystore.properties ]]; then
    ./gradlew -q bundleRelease
    cp app/build/outputs/bundle/release/app-release.aab ../dist/voyajes-release-upload-signed.aab
  fi
fi
ls -la ../dist
