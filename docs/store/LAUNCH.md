# Launch checklist — App Store, Google Play, Microsoft Store

Plain steps, in order. Everything that could be built without your accounts is already in the repo. Commands run from the repo root.
The site stays at **https://yvelkuri-stu.github.io/voyajes/**; short links at **https://voyajes-api.yeshu501.workers.dev/v/…**.
No custom domain is needed to launch. Switching later is covered at the end.

| What | File |
|---|---|
| Android app (Capacitor), debug, installable | `apps/mobile/dist/voyajes-debug.apk` |
| Android app bundle, **unsigned** | `apps/mobile/dist/voyajes-release-unsigned.aab` |
| Android app bundle, **signed with your upload key**: upload this one to Play (v1.3.0, versionCode 10300) | `apps/mobile/dist/voyajes-release-upload-signed.aab` |
| Android TWA alternative (Bubblewrap), signed | `apps/twa/dist/voyajes-twa-release.aab` / `.apk` |
| Microsoft Store package (test identity) | `apps/msix/dist/voyajes-msix-store-package.zip` |
| iOS Xcode project | `apps/mobile/ios/App/App.xcworkspace` |
| Listing copy, privacy answers, ratings, UGC notes | `docs/store/*.md` |
| Screenshots at every size | `docs/store/screenshots/<device>/` |
| Icons and feature graphic | `docs/store/graphics/` |
| Android upload key and passwords (**never commit or share**) | `.secrets/android/upload-keystore.jks` + `keystore.properties` |

> `dist/` folders are git-ignored (they're big binaries). Rebuild any time:
> `cd apps/mobile && bash scripts/build-android.sh all`. It uses the JDK/SDK in `~/.local`.

---

## 0. Before any store (10 minutes)
1. **Choose the app id once.** It's `app.voyajes` now and can never change after the first upload. If you'd rather use e.g.
   `com.yourname.voyajes`, rebuild with `VOYAJES_APP_ID=com.yourname.voyajes bash scripts/build-android.sh all`, change
   `ANDROID_PACKAGE` in `apps/api/wrangler.toml`, and set the iOS Bundle Identifier in Xcode to match.
2. **Back up `.secrets/android/`** (keystore + properties) to a password manager or a USB drive. If you lose the upload key,
   Google can reset it (it takes days), but don't rely on that.
   To see the passwords: open `.secrets/android/keystore.properties` on your own machine. Don't paste them anywhere.
3. Make sure the contact link on `/terms` and `/privacy` goes to an inbox you read.

---

## 1. Google Play: step-by-step checklist (v1.3.0, beginner-friendly)

Tick these off in order. You need: a Google account, a government photo ID, a phone, a card for the **one-time US$25 fee**,
and about 12 friends with Android phones. Voyajes is a **free app with no ads and no in-app purchases**; monetization
decisions are yours, and nothing below sets up payments.

**1. Create the developer account.** Go to https://play.google.com/console/signup and sign in with the Google account
   that should own the app (use one you'll keep; ownership is hard to move later).
   - **Personal**: choose this if you're publishing as yourself. No company paperwork. Your name, plus the country you
     enter, appear on the store page. New personal accounts **must** do the closed test in step 9 before going live.
   - **Organization**: only if you have a registered company. It needs a **D-U-N-S number** (free from Dun & Bradstreet at
     https://www.dnb.com/duns.html, and it can take **up to 30 days**), a company website and a company email/phone. The
     12-tester rule doesn't apply. If you don't have a company, pick Personal; you can't switch the account type afterwards.

**2. Verify your identity.** In the console, **Account details** asks for your legal name and address (they must match your ID),
   then a photo of a government ID, then a code sent to your phone and your contact email. Google usually confirms within
   **1–3 days**, sometimes longer. You can't publish until this shows **Verified**. Personal accounts also have to prove they
   own an Android phone: install the **Google Play Console** app on it and sign in with the same account when asked.
   Use an ID and a card in **your legal name**; if they don't match, Google keeps the fee.

**3. Pay the US$25 registration fee.** It's a one-time card payment during signup, not yearly. That's the only cost
   on the Play side.

**4. Create the app.** Home → **Create app**:
   - App name `Voyajes` · Default language English (US) · **App** (not Game) · **Free** · tick the Developer Program
     Policies + US export laws declarations → **Create app**.
   - Package name: it's set by the first upload, **`app.voyajes`**, and can never change (see step 0.1 if you want another).

**5. Upload the app bundle (AAB).** Build the signed bundle (already built for 1.3.0, file below; rebuild any time):
   ```bash
   cd apps/mobile && bash scripts/build-android.sh release   # → apps/mobile/dist/voyajes-release-upload-signed.aab
   ```
   You upload it in step 9 (closed testing). Release name `1.3.0 (10300)`; every later upload needs a higher versionCode:
   `VOYAJES_VERSION_CODE=10301 VOYAJES_VERSION_NAME=1.3.1 bash scripts/build-android.sh release`.
   **Never upload `.secrets/` or share the `.jks` / passwords.** The AAB only carries a *signature*, not the key.

**6. Play App Signing (accept the default).** On your first release Play shows **"Releases signed by Google Play"**.
   Keep **Use Google-generated key** (recommended). Google holds the *app signing key*; your `.secrets/android` key is only
   the *upload key*. If you ever lose the upload key, the account owner can request an upload-key reset under
   **Test and release → App integrity**. Back up `.secrets/android/` anyway (step 0.2).

**7. Store listing (Grow users → Store presence → Main store listing).** Everything is ready in `docs/store/`:
   | Field | Where |
   |---|---|
   | Short + full description, What's new | `docs/store/listing.md` |
   | App icon 512×512 | `docs/store/graphics/play-icon-512.png` |
   | Feature graphic 1024×500 | `docs/store/graphics/play-feature-graphic-1024x500.png` |
   | Phone screenshots (2–8) | `docs/store/screenshots/android-phone/*.jpg` |
   | 7-inch and 10-inch tablet screenshots | `docs/store/screenshots/android-tablet-10/*.jpg` (same set for both) |
   | Privacy policy URL | `https://yvelkuri-stu.github.io/voyajes/privacy` |
   Category: **Photography** · Contact email: the inbox from step 0.3. Sound credits for the CC BY music are in the app
   (`/credits`), so you don't need to repeat them in the listing.

**8. App content declarations (left menu → Policy and programs → App content).** Answer from our kit:
   - **Privacy policy**: the URL above.
   - **App access**: *All functionality is available without special access* (no login).
   - **Ads**: **No, my app does not contain ads.**
   - **Content rating**: start the IARC questionnaire and copy `docs/store/content-rating.md`. Category *Utility,
     productivity, communication or other*. Everything **No** except **"Users can interact / exchange content: Yes"**.
     Expected: Everyone / PEGI 3 with "Users interact".
   - **Target audience and content**: **13–15, 16–17, 18+** only. Do **not** tick under-13 (that pulls in the Families policy).
     "Could the app unintentionally appeal to children?" **No**.
   - **Data safety**: copy `docs/store/privacy-data-safety.md` → *Google Play*. Summary: collects optional photos/videos,
     name, other user content, approximate location and a device id. Not shared, encrypted in transit, users can request
     deletion, no account creation.
   - **Government / financial / health / news / COVID apps**: **No** to all. **Advertising ID**: **No**.
   - **Photo & video permissions**: not needed (the app uses the system photo picker).

**9. Closed testing: 12 testers, 14 days in a row** (required for new personal accounts):
   1. **Test and release → Testing → Closed testing → Create track** (call it `Friends`) → **Create new release** → upload
      `apps/mobile/dist/voyajes-release-upload-signed.aab` (steps 5–6) → release notes from `listing.md` → **Save → Review →
      Start rollout to Closed testing**. The first review takes from a few hours to a few days.
   2. **Testers tab** → *Create email list* → add the Gmail/Google-account addresses of **at least 12 people (invite 15–20**,
      because if fewer than 12 stay opted in the 14-day clock doesn't count). Or use a Google Group's address.
   3. Copy the **opt-in link** (Testers tab, "Join on the web") and send it to them. Each tester opens it **on their Android
      phone, with the same Google account**, taps **Become a tester**, then **Download it on Google Play** and installs.
   4. Keep **≥12 testers opted in for 14 continuous days**. Ask them to open the app every couple of days and send you feedback
      (screenshots, bugs). Write the feedback down; Google asks about it. Ship fixes as new closed-test releases (higher versionCode).
   5. The Dashboard shows the progress. Testers may join on different days, but you need 12 who have each stayed opted in
      for the **last 14 days in a row** when you apply. Anyone who opts out and back in restarts their own clock.
   6. Tip: you can use **Internal testing** (up to 100 testers, no review, available before setup is complete) for a quick
      smoke test first. It doesn't count toward the 14 days.

**10. Apply for production.** When the counter is done: **Dashboard → Apply for production**. Answer honestly: how you
   recruited testers, what feedback you got, what you changed, and why the app is ready. Review usually takes **up to 7 days**.
   Once approved: **Production → Create new release** → *add from library* (the same AAB, or a newer one) → countries
   (all, or start with yours) → **Start rollout** (a 20% staged rollout is a safe first step).

**11. Set `ANDROID_SHA256` and redeploy the API** so `…/v/<id>` short links open the installed app instead of the browser.
   After the first upload: **Test and release → App integrity → App signing** → copy the **SHA-256 certificate fingerprint**
   of the **App signing key** (Google's, not the upload key). Put it first in `apps/api/wrangler.toml`:
   ```toml
   ANDROID_PACKAGE = "app.voyajes"
   ANDROID_SHA256 = "<PLAY APP SIGNING SHA-256>,C8:07:61:E0:D7:05:0C:A5:0A:27:97:13:6F:B0:16:B0:A0:82:EB:15:13:6D:9D:CE:E7:23:BD:7C:EE:82:D3:7C"
   ```
   (the second value is the upload key, already there). Then deploy and check:
   ```bash
   PATH=$HOME/.local/node22/bin:$PATH bash scripts/deploy-api.sh
   curl -s https://voyajes-api.yeshu501.workers.dev/.well-known/assetlinks.json   # must list both fingerprints
   ```
   On a phone with the Play build installed, tap a share link and it should open in Voyajes.
   (Optional) Play Console → **Grow users → Deep links** should then show the domain as verified.

### TWA instead of Capacitor? (optional, Android only)
`apps/twa/` is the PWABuilder/Bubblewrap version, package `app.voyajes.twa`. It always shows the live site, so updates need no new upload.
Pick **one** of the two Android apps for your Play listing; Capacitor is the recommended one (camera/share/haptics are native, and it works offline).
A TWA hides the browser bar only if `https://yvelkuri-stu.github.io/.well-known/assetlinks.json` exists. That file has to sit at the
domain root, not under /voyajes. Free way to do it: create a public GitHub repo named **yvelkuri-stu.github.io**, add
`docs/store/twa/assetlinks.json` as `.well-known/assetlinks.json` (plus an empty `.nojekyll` file), and add the Play App Signing SHA-256 to it.
Rebuild: `cd apps/twa && npx @bubblewrap/cli build` (it asks for the keystore password from `.secrets/android/keystore.properties`).

---

## 2. Apple App Store (9 / year), needs a Mac
### Sign up
1. https://developer.apple.com/programs/enroll/ with your Apple ID (2-factor on). Individual is fine. Pay $99. Approval: hours to 2 days.
### Build on a Mac (Xcode 16+, from the Mac App Store)
```bash
git clone https://github.com/yvelkuri-stu/voyajes && cd voyajes
corepack enable && pnpm install
cd apps/mobile && pnpm sync            # builds the web app into www/ and copies it into ios/
open ios/App/App.xcworkspace
```
In Xcode → target **App** → **Signing & Capabilities**:
1. Team: your developer team; Bundle Identifier `app.voyajes` (or your chosen id). Tick "Automatically manage signing".
2. Capabilities already declared in `App.entitlements`: **Push Notifications**, **Associated Domains**
   (`applinks:voyajes-api.yeshu501.workers.dev`). Xcode registers them for you. If push isn't set up yet, you can remove that capability.
3. Version 1.2.1, Build 10201 (already set). Product → **Archive** → Distribute App → **App Store Connect** → Upload.
### App Store Connect
1. https://appstoreconnect.apple.com → My Apps → **+ New App** → iOS, name Voyajes, Bundle ID as above, SKU `voyajes`.
2. Fill from `listing.md` (subtitle, promo text, description, keywords, support and privacy URLs), **App Privacy** from
   `privacy-data-safety.md`, **Age Rating** from `content-rating.md`.
3. Screenshots: 6.9" `screenshots/ios-6.9/` (1320×2868), 6.5" `screenshots/ios-6.5/` (1284×2778), iPad 13" `screenshots/ipad-13/` (2064×2752).
4. Pick the uploaded build → App Review notes from `ugc-moderation.md` → **Submit for Review**.
   Use TestFlight first if you want friends to try it (no 12-tester rule on iOS).
### Fill APPLE_APP_IDS (makes short links open the app)
Your Team ID is at https://developer.apple.com/account → Membership. In `apps/api/wrangler.toml`:
`APPLE_APP_IDS = "ABCDE12345.app.voyajes"`, then deploy the API (same command as above).
Check: https://voyajes-api.yeshu501.workers.dev/.well-known/apple-app-site-association.

---

## 3. Microsoft Store (free for individuals)
1. Sign up at https://storedeveloper.microsoft.com (individual accounts are free; verification by ID/phone).
2. Partner Center → Apps and games → **New product → MSIX or PWA app** → reserve the name **Voyajes**.
3. Product → **Product identity**: copy **Package/Identity/Name**, **Publisher** (`CN=…`) and **Publisher display name**.
4. Build the real package with those values:
   ```bash
   MS_PACKAGE_ID="<Package/Identity/Name>" MS_PUBLISHER_CN="CN=<…>" MS_PUBLISHER_NAME="<display name>" bash apps/msix/build-msix.sh
   ```
   The zip in `apps/msix/dist/` will contain `Voyajes.msixbundle` (upload this) and `Voyajes.classic.appxbundle` (for older Windows 10).
   The current zip uses a placeholder publisher and **will be rejected** until you rebuild it. You can sideload it to try it out: run `install.ps1`.
5. Submission: Packages → upload the `.msixbundle` (+ classic appxbundle); Store listings from `listing.md`; screenshots
   `screenshots/windows-desktop/` (1920×1080); logos `graphics/msstore-logo-300.png`; age rating = same IARC answers; Privacy URL.
6. Submit; certification usually takes 1–3 days.

---

## 4. Native push later (optional)
Right now notifications in the store apps use the **in-app inbox**: the after-movie and capsule notices appear when the app is opened.
Real native push needs:
- **Android:** a free Firebase project → add an Android app `app.voyajes` → download `google-services.json` into `apps/mobile/android/app/`.
- **iOS:** an APNs key (Apple Developer → Keys → +, tick APNs).
- Server delivery to those tokens isn't written yet (the Worker sends Web Push only). Build with `VITE_NATIVE_PUSH=1` only once that's added.

## 5. When you buy a custom domain
1. Follow `docs/domain.md` (Option A).
2. Rebuild the apps so shared links use it: `VOYAJES_PUBLIC_URL=https://yourdomain bash apps/mobile/scripts/build-android.sh all`
   (iOS: `VOYAJES_PUBLIC_URL=https://yourdomain pnpm sync` on the Mac).
3. Android: change `android:host` in `apps/mobile/android/app/src/main/AndroidManifest.xml`. iOS: add `applinks:yourdomain` in Xcode → Associated Domains.
4. TWA: change `host`/`startUrl`/`iconUrl`/`webManifestUrl` in `apps/twa/twa-manifest.json`, run `npx @bubblewrap/cli update` then `build`.
   This is a new start URL, so upload it as a new version.
5. Microsoft: `VOYAJES_URL=https://yourdomain/ bash apps/msix/build-msix.sh` and upload a new version.
6. Keep the old github.io site live (or redirect it) so existing links keep working.
