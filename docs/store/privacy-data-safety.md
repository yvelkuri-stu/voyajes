# Privacy answers for each store

Based on what the code actually does in 1.1.0 (see the in-app policy at `/privacy`). If you add analytics, crash reporting,
accounts or Firebase push, **update these answers first**.

## What the app collects, and why
| Data | When | Stored where | Linked to the person? | Purpose |
|---|---|---|---|---|
| Photos / videos | Only the ones a host **publishes**, or a guest **drops** into a party | Cloudflare (D1/R2), deleted when the host deletes the voyage | No (no accounts) | App functionality |
| Name (as typed) | Guest RSVPs / comments, host name on invites | Cloudflare D1 | No | App functionality |
| User content (comments, RSVPs, reactions, votes) | When a guest sends them | Cloudflare D1 | No | App functionality |
| Approximate location (≈1 km) | Only if the host publishes a story **with the route-map intro on** (from photo GPS) | Inside the published story | No | App functionality |
| Device id (random, made by the app) | Guests posting | Cloudflare D1 | No | App functionality, fraud/abuse prevention |
| IP address | Every API call (short-lived rate-limit counters) | Cloudflare D1, auto-expiring | No | Fraud/abuse prevention |
| Push address | Only if someone taps "notify me" | Cloudflare D1 | No | App functionality (notifications) |

Not collected: contacts, precise location from the device, health, financial info, browsing history, advertising id, crash or analytics data. Nothing is shared with or sold to third parties; Cloudflare is our hosting provider (a "service provider", not "sharing").
Drafts, photos you don't publish and all Story Brain analysis stay on the device.

## Apple — App Privacy ("nutrition label")
- Do you or your partners collect data? **Yes**
- Types to tick, each as **"Not linked to the user"**, **"Not used for tracking"**:
  - *User Content* → **Photos or Videos**, **Other User Content** (comments/RSVPs) — purpose: **App Functionality**
  - *Contact Info* → **Name** — purpose: **App Functionality**
  - *Location* → **Coarse Location** — purpose: **App Functionality**
  - *Identifiers* → **Device ID** — purpose: **App Functionality**
- Tracking: **No** (no ATT prompt needed).
- Privacy Manifest: Capacitor ships its own `PrivacyInfo.xcprivacy`; if Xcode warns about "required reason APIs" add the reasons it lists (UserDefaults: `CA92.1`; file timestamps: `C617.1`).

## Google Play — Data safety form
- Does your app collect or share any required user data types? **Yes**
- Is all data encrypted in transit? **Yes** (HTTPS only)
- Can users request deletion? **Yes** — hosts delete a voyage from Manage; anyone can email the contact on `/privacy`
- Data types (all **Collected**, **not Shared**, **not processed ephemerally**, **optional** where marked):
  - *Location → Approximate location* — optional — App functionality
  - *Personal info → Name* — optional — App functionality
  - *Photos and videos → Photos, Videos* — optional — App functionality
  - *App activity → Other user-generated content* — optional — App functionality
  - *Device or other IDs* — App functionality, Fraud prevention/security
- Ads: **No**. Account creation: **No** (so the account-deletion URL question doesn't apply; still give `/privacy`).
- Permissions declared: CAMERA (party camera), POST_NOTIFICATIONS, VIBRATE, INTERNET. No READ_MEDIA_* (system photo picker), so no Photo & Video permission declaration form is needed.

## Microsoft Store
- Privacy policy URL: `/privacy` (required because the app uses the internet and camera).
- "Does this product access, collect or transmit personal information?" **Yes** → policy URL above.
