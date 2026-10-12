# @voyajes/mobile: Capacitor iOS + Android
Wraps `apps/web` (built with `VITE_BASE_PATH=/`, `VITE_PUBLIC_URL=<site>` so shared links point at the real web address).

- `pnpm sync`: build the web app into `www/` and `cap sync` both platforms
- `bash scripts/build-android.sh all`: debug APK + release AAB (unsigned, plus upload-signed if `.secrets/android/keystore.properties` exists) → `dist/`
- `python3 scripts/gen-assets.py`: regenerate icons/splash from `assets/`
- Config: `VOYAJES_APP_ID` (default `app.voyajes`), `VOYAJES_APP_NAME`, `VOYAJES_VERSION_CODE`/`VOYAJES_VERSION_NAME`, `VOYAJES_PUBLIC_URL`

Native features (see `apps/web/src/lib/native.ts`). Each one falls back to the browser API on the web:
| Feature | Plugin | Used by |
|---|---|---|
| Share sheet with files and links | @capacitor/share + filesystem | all `navigator.share` calls, export/share buttons |
| Haptics | @capacitor/haptics | all `navigator.vibrate` calls (timeline snaps, shutter) |
| Camera / photo picker | @capacitor/camera (+ WebView getUserMedia) | party camera ("pick from camera roll") |
| Push | @capacitor/push-notifications | "notify me" (opt-in build flag `VITE_NATIVE_PUSH=1`, needs Firebase/APNs) |
| Status bar, splash, back button, app links | status-bar, splash-screen, app | app start |

iOS builds need a Mac with Xcode: see `docs/store/LAUNCH.md` §2.
