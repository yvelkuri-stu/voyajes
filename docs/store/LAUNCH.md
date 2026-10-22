# Launch checklist — App Store, Google Play, Microsoft Store

Plain steps, in order. Everything that could be built without your accounts is already in the repo. Commands run from the repo root.
The site stays at **https://yvelkuri-stu.github.io/voyajes/**; short links at **https://voyajes-api.yeshu501.workers.dev/v/…**.
No custom domain is needed to launch. Switching later is covered at the end.

| What | File |
|---|---|
| Android app (Capacitor), debug, installable | `apps/mobile/dist/voyajes-debug.apk` |
| Android app bundle, **unsigned** | `apps/mobile/dist/voyajes-release-unsigned.aab` |
| Android app bundle, **signed with your upload key**: upload this one to Play | `apps/mobile/dist/voyajes-release-upload-signed.aab` |
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

## 1. Google Play (5 once)

### Sign up
1. Go to https://play.google.com/console/signup, choose **Personal** (or Organisation if you have a company with a D-U-N-S number).
2. Pay the $25, verify your identity (ID + address) and your phone. Verification can take a few days.

### Create the app
1. **Create app** → name `Voyajes` → App → Free → accept the declarations.
2. **Set up your app** (left menu → Dashboard), fill each section from these files:
   - Privacy policy: `https://yvelkuri-stu.github.io/voyajes/privacy`
   - App access: "All functionality available without special access"
   - Ads: **No**
   - Content rating: `content-rating.md` (IARC answers)
   - Target audience: **13+**
   - Data safety: `privacy-data-safety.md`
   - Government apps / financial / health: **No**
3. **Store listing** (Grow → Store presence → Main store listing): copy from `listing.md`. Then upload:
   - App icon `graphics/play-icon-512.png`, feature graphic `graphics/play-feature-graphic-1024x500.png`
   - Phone screenshots `screenshots/android-phone/*.jpg` (1080×1920), 10-inch tablet `screenshots/android-tablet-10/*.jpg`
     (use the same tablet set for 7-inch).

### Upload, and the 12 testers / 14 days rule
New personal accounts **must run a closed test with at least 12 testers who stay opted in for 14 days in a row** before
you're allowed to apply for Production.
1. Test and release → Testing → **Closed testing** → create track "Friends" → **Create new release**.
2. Choose **Use Google-generated key** (Play App Signing; recommended). Upload
   `apps/mobile/dist/voyajes-release-upload-signed.aab`. Release name `1.2.1 (10201)`. Notes from `listing.md` → What's new.
3. Testers: make a Google Group (or list the emails) with **at least 12 people** (aim for 15–20 so dropouts don't reset you).
   Share the opt-in link from the track page; each person taps **Become a tester** and installs from Play.
4. Wait **14 full days** with ≥12 people opted in. Ask them to actually open it a few times; Google asks what feedback you got.
5. Dashboard → **Apply for production** → answer the questions (who tested, what you changed) → wait for review (often 1–7 days).
6. Each new upload needs a higher `versionCode`: `VOYAJES_VERSION_CODE=10101 VOYAJES_VERSION_NAME=1.1.1 bash apps/mobile/scripts/build-android.sh release`.

### Fill ANDROID_SHA256 (makes short links open the app)
After the first upload: Play Console → Test and release → **App integrity** → App signing → copy **SHA-256 certificate fingerprint**
of the **App signing key**. Then in `apps/api/wrangler.toml`:
```toml
ANDROID_PACKAGE = "app.voyajes"
ANDROID_SHA256 = "<PLAY APP SIGNING SHA-256>,C8:07:61:E0:D7:05:0C:A5:0A:27:97:13:6F:B0:16:B0:A0:82:EB:15:13:6D:9D:CE:E7:23:BD:7C:EE:82:D3:7C"
```
(The second value is your upload key and is already there.) Deploy: `PATH=$HOME/.local/node22/bin:$PATH bash scripts/deploy-api.sh`.
Check: https://voyajes-api.yeshu501.workers.dev/.well-known/assetlinks.json should list both.

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
