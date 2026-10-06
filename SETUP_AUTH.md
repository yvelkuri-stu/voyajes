# Social login setup (Voyajes)

Voyajes is a **Vite + React** SPA. This repo ships an **OAuth shell**:

- Sign-in UI for **Google · Apple · Microsoft · Meta · GitHub**
- **QR pairing** + **OTP** demos (SMS / WhatsApp / Telegram tabs) — see §§6–7
- Buttons stay **disabled** with “Add credentials in .env” until you paste a client ID
- When a client ID is present, the app **redirects to the provider** (auth-code + PKCE for Google/Microsoft)
- `/auth/callback` stores a **stub session** in `localStorage` — it does **not** exchange the code for tokens (that needs a small backend + client secret)

**Honest status:** UI + redirect + mock session = ready. Production accounts = add a token endpoint later (Auth.js, Supabase Auth, Clerk, or your own `/api/auth/*`).

---

## 1. Env file

```bash
cp .env.example apps/web/.env
# edit apps/web/.env — paste client IDs
pnpm dev   # must restart after env changes
```

| Variable | Provider |
| --- | --- |
| `VITE_AUTH_GOOGLE_CLIENT_ID` | Google |
| `VITE_AUTH_APPLE_CLIENT_ID` | Apple (Services ID) |
| `VITE_AUTH_MICROSOFT_CLIENT_ID` | Microsoft Entra app |
| `VITE_AUTH_META_CLIENT_ID` | Meta / Facebook App ID |
| `VITE_AUTH_GITHUB_CLIENT_ID` | GitHub OAuth App |
| `VITE_AUTH_REDIRECT_URI` | Optional override |

### Redirect URIs to register everywhere

| Environment | Redirect URI |
| --- | --- |
| Local Vite | `http://localhost:5173/auth/callback` |
| GitHub Pages | `https://yvelkuri-stu.github.io/voyajes/auth/callback` |

If you change Vite `base`, keep the path under that base (`/voyajes/auth/callback` on Pages).

Homepage / JS origins to allow (where asked):

- `http://localhost:5173`
- `https://yvelkuri-stu.github.io`

---

## 2. Where to sign up & create OAuth apps

### Google

1. Open [Google Cloud Console](https://console.cloud.google.com/) → create/select a project  
2. **APIs & Services → OAuth consent screen** → External (or Internal) → fill app name “Voyajes” → save  
3. **Credentials → Create credentials → OAuth client ID** → Application type **Web application**  
4. Authorized JavaScript origins: `http://localhost:5173`, `https://yvelkuri-stu.github.io`  
5. Authorized redirect URIs: both callback URLs above  
6. Copy **Client ID** → `VITE_AUTH_GOOGLE_CLIENT_ID`  
7. **Client secret** → keep for a future backend only (not in Vite)

Docs: https://developers.google.com/identity/protocols/oauth2

### Apple

1. [Apple Developer](https://developer.apple.com/account/) (paid membership)  
2. **Certificates, Identifiers & Profiles → Identifiers**  
3. Create an **App ID**, then a **Services ID** (this is your “client id”) for Sign in with Apple  
4. Enable Sign in with Apple on the Services ID → Configure domains & return URLs  
   - Domains: `localhost` (dev quirks apply), `yvelkuri-stu.github.io`  
   - Return URLs: both callback URIs above  
5. Paste Services ID into `VITE_AUTH_APPLE_CLIENT_ID`  
6. Apple often wants a **JWT client secret** generated from a key — that stays server-side

Docs: https://developer.apple.com/sign-in-with-apple/

> Apple on pure localhost SPAs is fiddly. Fine to skip until you have HTTPS + a backend.

### Microsoft

1. [Microsoft Entra admin / Azure Portal](https://entra.microsoft.com/) → **App registrations → New registration**  
2. Name: Voyajes · Supported accounts: personal + work/school (or your choice)  
3. Redirect URI platform **Single-page application (SPA)** or Web: both callback URIs  
4. Copy **Application (client) ID** → `VITE_AUTH_MICROSOFT_CLIENT_ID`  
5. Certificates & secrets → for backend later only

Docs: https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app

### Meta (Facebook)

1. [Meta for Developers](https://developers.facebook.com/) → **My Apps → Create App**  
2. Use type that supports Facebook Login (Consumer / none)  
3. Add product **Facebook Login → Web**  
4. Valid OAuth Redirect URIs: both callbacks  
5. App settings → Basic → copy **App ID** → `VITE_AUTH_META_CLIENT_ID`  
6. App Secret → backend only  
7. While in Development mode, only test users / roles can sign in — switch to Live when ready

Docs: https://developers.facebook.com/docs/facebook-login/web

### GitHub

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**  
   (org: org Settings → Developer settings)  
2. Application name: Voyajes  
3. Homepage URL: `http://localhost:5173` (add Pages URL in description or a second app)  
4. Authorization callback URL: start with `http://localhost:5173/auth/callback`  
   - GitHub OAuth Apps allow **one** callback URL — create a **second OAuth App** for Pages, or use a backend that normalizes redirects  
5. Copy **Client ID** → `VITE_AUTH_GITHUB_CLIENT_ID`  
6. Generate client secret → backend only

Docs: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app

**Tip:** Two GitHub OAuth Apps (local + Pages) is the least painful approach without a server.

---

## 3. What the app does today

```text
/signin  →  provider buttons
              ├─ no client id  → disabled + “Add credentials in .env”
              └─ has client id → redirect to provider authorize URL
/auth/callback → validate state → localStorage stub session → home
```

Demo path without any keys: **Continue as demo voyager** on `/signin`.

---

## 4. Next step for “real” login (not in this MVP)

1. Tiny API route that receives `code` + `code_verifier`, exchanges with provider using **client secret**, sets httpOnly cookie  
2. Or drop in **Auth.js / NextAuth**, **Supabase Auth**, **Clerk**, **Firebase Auth**  
3. Point `VITE_AUTH_REDIRECT_URI` at that backend callback if needed  

Until then, treat the stub session as UI chrome only — don’t gate secrets or billing on it.

---

## 5. Quick checklist

- [ ] Copied `.env.example` → `apps/web/.env`  
- [ ] At least one `VITE_AUTH_*_CLIENT_ID` filled  
- [ ] Redirect URIs registered for local (+ Pages if deploying)  
- [ ] Restarted `pnpm dev`  
- [ ] `/signin` button enabled for that provider  
- [ ] Secrets nowhere near `VITE_*` or git  

---

## 6. QR code login (stub → real)

The sign-in page shows a **QR pairing stub**:

1. Desktop generates a short-lived token and encodes  
   `{origin}{base}/signin?qr={token}` into a QR image.
2. Phone opens that URL → mock “approve” → stub session in `localStorage`.
3. **Simulate scan** on the same device works for demos without a second phone.

### Wire a real QR session later

| Piece | Notes |
| --- | --- |
| Backend | `POST /api/auth/qr/start` → `{ token, expiresAt }` stored server-side |
| Polling / WS | Desktop polls `GET /api/auth/qr/:token` until `approved` |
| Phone | Authenticated device (or OTP) hits `POST /api/auth/qr/:token/approve` |
| Cookie | On approve, set httpOnly session cookie; desktop receives session |

Do **not** put long-lived secrets in the QR payload — only an opaque, single-use token.

Env (future):

```bash
# VITE_AUTH_QR_API=https://api.example.com/auth/qr
```

---

## 7. OTP via SMS / WhatsApp / Telegram (stub → real)

UI on `/signin`:

- Channel tabs: **SMS · WhatsApp · Telegram**
- Destination field (phone E.164 or email / @username)
- **Send code** → generates a mock 6-digit code, stores it in **`sessionStorage`** (`voyajes.auth.otp_pending`) and displays it for the demo
- **Verify** → creates a stub session if the code matches

**Honest status:** No SMS/WhatsApp/Telegram message is actually sent from this SPA. Client-side OTP is for UI demos only. Production OTP **must** be generated, rate-limited, and verified on a backend.

### Env vars (future backend — never put secrets in `VITE_*`)

```bash
# Twilio SMS / Verify
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_VERIFY_SERVICE_SID=
# or Messaging Service / From number:
TWILIO_FROM_NUMBER=

# WhatsApp Business (Twilio or Meta Cloud API)
WHATSAPP_PROVIDER=twilio   # or meta
WHATSAPP_FROM_NUMBER=      # Twilio WhatsApp-enabled sender
# Meta Cloud API:
META_WHATSAPP_TOKEN=
META_WHATSAPP_PHONE_NUMBER_ID=

# Telegram Login Widget / bot OTP
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
# Optional: VITE_TELEGRAM_BOT_USERNAME=YourBot  (public username only)
```

### Suggested API shape

```text
POST /api/auth/otp/send   { channel: "sms"|"whatsapp"|"telegram", destination }
POST /api/auth/otp/verify { channel, destination, code } → session cookie
```

### Provider notes

**Twilio Verify (SMS / WhatsApp)**  
1. Create a [Twilio](https://www.twilio.com/) account → Verify service  
2. Enable SMS (+ WhatsApp channel if approved)  
3. Backend calls Verify `verifications` / `verificationChecks` with your Auth Token  
4. Never expose `TWILIO_AUTH_TOKEN` to Vite

**WhatsApp Business API (Meta)**  
1. [Meta for Developers](https://developers.facebook.com/) → WhatsApp product  
2. Template messages required for outbound OTP outside the 24h window  
3. Backend sends template with `{{1}}` = code; verify on your server

**Telegram**  
- **Login Widget:** embed [Telegram Login Widget](https://core.telegram.org/widgets/login) with bot domain; verify `hash` on the server using `TELEGRAM_BOT_TOKEN`  
- **Bot OTP:** bot DMs a code after `/start`; store challenge server-side, verify in `POST /api/auth/otp/verify`

### Checklist

- [ ] OTP UI reviewed on `/signin` (demo path works without keys)  
- [ ] Backend send/verify routes sketched  
- [ ] Twilio / WhatsApp / Telegram credentials only in server env  
- [ ] Rate limits + expiry (≤10 min) + attempt caps  
- [ ] Removed any client-side storage of real OTP codes  
