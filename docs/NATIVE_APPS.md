# Native apps for Voyajes — realistic paths

Voyajes is already a **responsive installable PWA** on GitHub Pages (`/voyajes/`). That covers “add to home screen,” offline shell caching, and a standalone display mode in Chromium and (with a Share → Add to Home Screen tip) on iOS Safari.

This note is research only: how you’d get a **proper App Store / Play Store / desktop** listing if you want one later. No native shells are in the repo yet.

---

## What the PWA already covers

| Capability | PWA today | Store native usually adds |
| --- | --- | --- |
| Install icon / standalone UI | Yes (Chrome/Edge/Android; iOS via Share sheet) | Store listing + discoverability |
| Offline / cached shell | Service worker (Workbox via `vite-plugin-pwa`) | Same + optional deeper native offline |
| Push notifications | Limited (esp. iOS PWA still constrained) | Much better with native APNs / FCM |
| Camera / mic / file pickers | Browser APIs (good enough for compose) | Native plugins, background capture |
| App Store / Play discovery | No | Yes |
| Deep OS integration (share sheet targets, widgets) | Limited | Yes |

Official PWA overview: [web.dev Progressive Web Apps](https://web.dev/explore/progressive-web-apps)  
Manifest + installability: [MDN Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)  
Vite PWA plugin: [vite-pwa-org.netlify.app](https://vite-pwa-org.netlify.app/guide/)

**Bottom line:** keep shipping the PWA. Treat store apps as an *extra distribution channel*, not a rewrite gate.

---

## iOS App Store

### Option A — Wrap with Capacitor (lowest effort for this codebase)

[Capacitor](https://capacitorjs.com/docs) loads your built web app in a native WebView and exposes plugins (camera, filesystem, push, haptics, etc.).

- **Effort:** days–few weeks for a thin shell + icons/splash + CI; more if you add push, IAP, or App Tracking.
- **Reuse:** ~100% of current React/Vite UI.
- **Tooling:** macOS + Xcode, CocoaPods/SPM as Capacitor requires. See [Environment setup](https://capacitorjs.com/docs/getting-started/environment-setup).
- **Signing:** Apple Developer Program membership, certificates, provisioning profiles, App Store Connect. Membership is **$99 USD / year** ([Apple enrollment](https://developer.apple.com/programs/enroll/)).
- **Review risk:** Guideline **4.2 Minimum Functionality** — Apple may reject a thin “website in a WebView” with no app-like value. Docs vibe: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/). Plan native extras (offline drafts, share extension, push when a voyage finishes, home-screen widget, Face ID unlock of drafts) before you submit a bare wrapper.
- **Store review:** typically days; expect iterations.

### Option B — React Native rewrite (or new RN app sharing packages)

- **Effort:** months for parity with Create / Themes / Share / export.
- **Reuse:** TypeScript domain logic in `packages/core` might port; UI does **not**.
- **Why bother:** gesture-heavy timeline, long lists, true native media pipeline.
- Docs: [React Native](https://reactnative.dev/docs/getting-started)

### Option C — Flutter rewrite

- Same rewrite cost class as RN; Dart UI from scratch.
- Docs: [Flutter](https://docs.flutter.dev/)

**Recommendation for Voyajes:** Capacitor wrap **if** you need an App Store presence soon and can ship 2–3 native features. Full RN/Flutter only if the editor’s UX outgrows the browser (heavy timeline scrubbing, background encode, etc.).

---

## Android Play Store

Paths mirror iOS:

1. **Capacitor** — same web bundle, Android Studio project. Signing with a Play App Signing keystore.
2. **Trusted Web Activity (TWA)** — Chrome Custom Tabs / Bubblewrap packaging of the *live* HTTPS PWA. Fast for Android-only; no iOS twin. See [Google TWA docs](https://developer.chrome.com/docs/android/trusted-web-activity/).
3. **React Native / Flutter** — full rewrite, same caveats as iOS.

**Cost / accounts**

- Google Play Console registration: **one-time $25 USD** ([Play Console help](https://support.google.com/googleplay/android-developer/answer/6112435)).
- Review is usually faster / more wrapper-tolerant than Apple, but still expect policy checks (permissions, data safety form, target API levels).

**Effort:** Capacitor Android shell often lands in a long weekend once the iOS project exists; TWA can be even faster if you’re happy pointing at `https://yvelkuri-stu.github.io/voyajes/`.

---

## Desktop (macOS / Windows / Linux)

| Approach | Effort | Footprint | Notes |
| --- | --- | --- | --- |
| **PWA install** (Edge/Chrome “Install app”) | Already done | Tiny | Best default for Voyajes web |
| **[Tauri](https://v2.tauri.app/)** | 1–2 weeks for packaging | Small (system WebView + Rust) | Needs Rust toolchain ([prerequisites](https://v2.tauri.app/start/prerequisites/)); great for a lightweight “Voyajes Desktop” |
| **[Electron](https://www.electronjs.org/docs/latest/)** | 1–2 weeks | Large (Chromium bundled) | Mature; heavier downloads; easy Node FS access for local projects |
| Capacitor + desktop community targets | Experimental | Varies | Prefer Tauri/Electron for desktop-first |

**Signing / distribution**

- macOS: Apple Developer ID + notarization for Gatekeeper (same $99 program).
- Windows: Authenticode cert (paid) or Microsoft Store packaging.
- Linux: AppImage / Flatpak / Snap — often unsigned or community-signed.

---

## Rough effort & cost snapshot (indie / small team)

| Path | Calendar time* | Hard fees | Soft cost |
| --- | --- | --- | --- |
| Keep PWA only | Ongoing | $0 | Hosting already on Pages |
| Capacitor iOS + Android | ~2–6 weeks first ship | $99/yr + $25 once | Mac CI or cloud Mac; screenshots; review cycles |
| TWA Android only | ~days | $25 once | Digital Asset Links on domain |
| Tauri / Electron desktop | ~1–3 weeks | Optional store / cert fees | Notarization, auto-update hosting |
| RN / Flutter rewrite | ~3–6+ months | Same store fees | New UI skill set + dual maintenance |

\*Assumes one familiar full-stack engineer; agency quotes for Capacitor ports often land in the mid–five figures — treat those as market noise, not a requirement.

---

## Signing & store review (cheat sheet)

**Apple**

1. Enroll: [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/) ($99/yr).
2. Create App ID, certificates, profiles in Certificates, Identifiers & Profiles.
3. Upload via Xcode / Transporter → App Store Connect.
4. Privacy Nutrition Labels, screenshots for required device sizes, review notes explaining non-web functionality.

**Google**

1. Register: [Play Console](https://support.google.com/googleplay/android-developer/answer/6112435) ($25).
2. Play App Signing, AAB upload, Data safety form, content rating questionnaire.
3. Target recent Android API as required by Play policy.

**Desktop**

- Prefer **auto-update** (Tauri updater / electron-updater) hosted on your own CDN or GitHub Releases.
- Store channels (Mac App Store, Microsoft Store) add review + sandbox rules; direct download is fine for early Voyajes.

---

## Suggested sequencing for Voyajes

1. **Polish the PWA** (you’re here) — install prompt, icons, responsive Create/Home, `/voyajes/` base.
2. **If Android discovery matters first:** Bubblewrap / TWA against the live Pages URL.
3. **If both mobile stores matter:** Capacitor monorepo app next to `apps/web`, shared `dist`, plus a couple of native features so Apple 4.2 is less scary.
4. **Desktop:** only if creators ask for local project folders / long encodes — then Tauri over Electron for a smaller binary.
5. **Rewrite (RN/Flutter):** postpone until the editor’s product requirements clearly exceed what a WebView + MediaRecorder can do.

---

## Useful links

- Capacitor docs: https://capacitorjs.com/docs  
- Capacitor environment setup: https://capacitorjs.com/docs/getting-started/environment-setup  
- React Native: https://reactnative.dev/docs/getting-started  
- Flutter: https://docs.flutter.dev/  
- Apple Developer Program: https://developer.apple.com/programs/enroll/  
- App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/  
- Google Play registration: https://support.google.com/googleplay/android-developer/answer/6112435  
- Trusted Web Activity: https://developer.chrome.com/docs/android/trusted-web-activity/  
- Tauri v2: https://v2.tauri.app/  
- Electron docs: https://www.electronjs.org/docs/latest/  
- vite-plugin-pwa: https://vite-pwa-org.netlify.app/guide/  
- Learn PWA (web.dev): https://web.dev/learn/pwa  

*Last researched: Oct 2026. Fees and Xcode/Android Studio minimums change — re-check Apple/Google pages before budgeting.*
