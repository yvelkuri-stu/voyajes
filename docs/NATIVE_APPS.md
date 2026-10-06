# Native apps for Voyajes — realistic paths

Voyajes is already a **responsive installable PWA** on GitHub Pages (`/voyajes/`). That covers “add to home screen,” offline shell caching, and a standalone display mode in Chromium and (with a Share → Add to Home Screen tip) on iOS Safari.

This note is research + a **locked product decision** for a later App Store / Play Store build. No native shells are in the repo yet.

---

## Decision (locked) — Flutter for store apps

**Chosen later path for iOS App Store + Google Play:** **[Flutter](https://docs.flutter.dev/)**.

| | |
| --- | --- |
| **Why Flutter** | One Dart UI for iOS + Android; strong media / animation ecosystem; clear separation from the web PWA so store review can show native-shaped UX (Apple Guideline 4.2). |
| **What stays web** | Shipping continues on the Vite/React PWA. Store apps are an *extra distribution channel*, not a rewrite gate for the browser product. |
| **Reuse** | Domain ideas and catalog JSON can inform Flutter models; the React UI does **not** port. Prefer a dedicated `apps/mobile` (or sibling repo) when you start. |
| **Effort class** | ~3–6+ months for Create / Themes / Share / export parity with one focused engineer. |

Revisit only if product requirements clearly favor a different stack (e.g. heavy existing RN team). Until then, treat Flutter as the default answer to “when do we ship store apps?”

---

## Alternate — Capacitor wrap (not the chosen path)

**[Capacitor](https://capacitorjs.com/docs)** remains a valid **alternate** if you need a thin App Store / Play listing *sooner* and can ship 2–3 native extras (offline drafts, share extension, push, Face ID) so Apple 4.2 is less scary.

- **Effort:** days–few weeks for a thin shell + icons/splash + CI.
- **Reuse:** ~100% of current React/Vite UI inside a WebView.
- **Risk:** Guideline **4.2 Minimum Functionality** — bare “website in a WebView” rejections.
- **Tooling:** macOS + Xcode; Android Studio for Play. Apple Developer **$99 USD / year**; Play Console **$25 once**.

Use Capacitor only as a bridge; the **locked long-term store path is still Flutter**.

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

**Bottom line:** keep shipping the PWA. Flutter store apps come later as distribution, not a rewrite gate.

---

## iOS App Store (when you start)

### Chosen — Flutter

- New Flutter app sharing catalog concepts / project schema ideas with Voyajes web.
- Docs: [Flutter](https://docs.flutter.dev/) · [iOS deployment](https://docs.flutter.dev/deployment/ios)
- **Signing:** Apple Developer Program **$99 USD / year** ([enroll](https://developer.apple.com/programs/enroll/)).
- Plan native value (background encode, share extension, widgets, push) before first submission.

### Alternate — Capacitor

See [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup). Same $99 program; higher 4.2 risk for thin wrappers.

### Not preferred — React Native rewrite

Same rewrite cost class as Flutter; only if the team is already RN-native. Docs: [React Native](https://reactnative.dev/docs/getting-started)

---

## Android Play Store

1. **Flutter** (chosen) — same codebase as iOS. [Android deployment](https://docs.flutter.dev/deployment/android)
2. **Alternate — Capacitor** — same web bundle, Android Studio project.
3. **Alternate — Trusted Web Activity (TWA)** — Bubblewrap packaging of the live HTTPS PWA for Android-only. Fast; no iOS twin. [TWA docs](https://developer.chrome.com/docs/android/trusted-web-activity/)

**Cost:** Google Play Console **one-time $25 USD** ([help](https://support.google.com/googleplay/android-developer/answer/6112435)).

---

## Desktop (macOS / Windows / Linux)

| Approach | Effort | Footprint | Notes |
| --- | --- | --- | --- |
| **PWA install** (Edge/Chrome “Install app”) | Already done | Tiny | Best default for Voyajes web |
| **[Tauri](https://v2.tauri.app/)** | 1–2 weeks for packaging | Small (system WebView + Rust) | Great for a lightweight “Voyajes Desktop” |
| **[Electron](https://www.electronjs.org/docs/latest/)** | 1–2 weeks | Large (Chromium bundled) | Mature; heavier downloads |
| Flutter desktop | Possible later | Varies | Only if you already invested in Flutter mobile |

---

## Rough effort & cost snapshot (indie / small team)

| Path | Calendar time* | Hard fees | Soft cost |
| --- | --- | --- | --- |
| Keep PWA only | Ongoing | $0 | Hosting already on Pages |
| Flutter iOS + Android (**chosen**) | ~3–6+ months first ship | $99/yr + $25 once | Dart/Flutter skill set; dual store review |
| Capacitor iOS + Android (alternate) | ~2–6 weeks first ship | $99/yr + $25 once | Mac CI; native extras for Apple 4.2 |
| TWA Android only | ~days | $25 once | Digital Asset Links on domain |
| Tauri / Electron desktop | ~1–3 weeks | Optional store / cert fees | Notarization, auto-update hosting |

\*Assumes one familiar full-stack engineer.

---

## Signing & store review (cheat sheet)

**Apple**

1. Enroll: [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/) ($99/yr).
2. Create App ID, certificates, profiles in Certificates, Identifiers & Profiles.
3. Upload via Xcode / Transporter → App Store Connect.
4. Privacy Nutrition Labels, screenshots, review notes explaining non-web functionality.

**Google**

1. Register: [Play Console](https://support.google.com/googleplay/android-developer/answer/6112435) ($25).
2. Play App Signing, AAB upload, Data safety form, content rating questionnaire.
3. Target recent Android API as required by Play policy.

---

## Suggested sequencing for Voyajes

1. **Polish the PWA** (you’re here) — install prompt, Kids Mode, auth demos, `/voyajes/` base.
2. **If Android discovery matters first without Flutter yet:** Bubblewrap / TWA against the live Pages URL.
3. **When both mobile stores matter for real:** start **Flutter** (`apps/mobile` or sibling), port catalog + compose flows deliberately.
4. **Capacitor (alternate):** only if you need a stopgap listing before Flutter is ready — and ship native extras.
5. **Desktop:** only if creators ask for local project folders / long encodes — then Tauri over Electron.

---

## Useful links

- Flutter: https://docs.flutter.dev/  
- Flutter iOS deploy: https://docs.flutter.dev/deployment/ios  
- Flutter Android deploy: https://docs.flutter.dev/deployment/android  
- Capacitor (alternate): https://capacitorjs.com/docs  
- React Native: https://reactnative.dev/docs/getting-started  
- Apple Developer Program: https://developer.apple.com/programs/enroll/  
- App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/  
- Google Play registration: https://support.google.com/googleplay/android-developer/answer/6112435  
- Trusted Web Activity: https://developer.chrome.com/docs/android/trusted-web-activity/  
- Tauri v2: https://v2.tauri.app/  
- Electron docs: https://www.electronjs.org/docs/latest/  
- vite-plugin-pwa: https://vite-pwa-org.netlify.app/guide/  
- Learn PWA (web.dev): https://web.dev/learn/pwa  

*Last updated: Oct 2026. **Flutter locked** as the store path; Capacitor kept as alternate. Fees and tool minimums change — re-check Apple/Google pages before budgeting.*
