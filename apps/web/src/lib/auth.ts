/**
 * Voyajes auth shell — OAuth redirect start + mock session.
 * Real token exchange needs a backend (client secrets must never ship in Vite).
 * See SETUP_AUTH.md.
 */

export type AuthProviderId =
  | "google"
  | "apple"
  | "microsoft"
  | "meta"
  | "github";

export type AuthSession = {
  provider: AuthProviderId;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  signedInAt: string;
  /** true when we never exchanged a real OAuth code (SPA stub) */
  stub: true;
};

const SESSION_KEY = "voyajes.auth.session";
const STATE_KEY = "voyajes.auth.oauth_state";
const PKCE_KEY = "voyajes.auth.pkce_verifier";

export type ProviderConfig = {
  id: AuthProviderId;
  label: string;
  /** Brand color for the button */
  color: string;
  envKey: string;
  clientId: string | undefined;
  configured: boolean;
  scopes: string;
  authorizeUrl: string;
};

function env(name: string): string | undefined {
  const v = (import.meta.env as Record<string, string | undefined>)[name];
  return v && String(v).trim() ? String(v).trim() : undefined;
}

/** App origin + Vite base path, no trailing slash on origin path except base */
export function appOriginPath(): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "") || "";
  return `${window.location.origin}${base}`;
}

export function defaultRedirectUri(): string {
  const override = env("VITE_AUTH_REDIRECT_URI");
  if (override) return override;
  return `${appOriginPath()}/auth/callback`;
}

export function getProviders(): ProviderConfig[] {
  const defs: Omit<ProviderConfig, "clientId" | "configured">[] = [
    {
      id: "google",
      label: "Google",
      color: "#EA4335",
      envKey: "VITE_AUTH_GOOGLE_CLIENT_ID",
      scopes: "openid email profile",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    },
    {
      id: "apple",
      label: "Apple",
      color: "#000000",
      envKey: "VITE_AUTH_APPLE_CLIENT_ID",
      scopes: "name email",
      authorizeUrl: "https://appleid.apple.com/auth/authorize",
    },
    {
      id: "microsoft",
      label: "Microsoft",
      color: "#00A4EF",
      envKey: "VITE_AUTH_MICROSOFT_CLIENT_ID",
      scopes: "openid profile email User.Read",
      authorizeUrl:
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    },
    {
      id: "meta",
      label: "Meta",
      color: "#1877F2",
      envKey: "VITE_AUTH_META_CLIENT_ID",
      scopes: "email,public_profile",
      authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    },
    {
      id: "github",
      label: "GitHub",
      color: "#24292F",
      envKey: "VITE_AUTH_GITHUB_CLIENT_ID",
      scopes: "read:user user:email",
      authorizeUrl: "https://github.com/login/oauth/authorize",
    },
  ];

  return defs.map((d) => {
    const clientId = env(d.envKey);
    return {
      ...d,
      clientId,
      configured: Boolean(clientId),
    };
  });
}

export function anyProviderConfigured(): boolean {
  return getProviders().some((p) => p.configured);
}

export function getSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function setSession(session: AuthSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("voyajes-auth-change"));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("voyajes-auth-change"));
}

function randomString(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Base64Url(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let str = "";
  bytes.forEach((b) => {
    str += String.fromCharCode(b);
  });
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Begin OAuth authorize redirect for a configured provider.
 * Returns an error string if the provider has no client id.
 */
export async function startOAuth(
  providerId: AuthProviderId,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const provider = getProviders().find((p) => p.id === providerId);
  if (!provider?.clientId) {
    return {
      ok: false,
      reason: `Add ${provider?.envKey ?? "client id"} to .env — see SETUP_AUTH.md`,
    };
  }

  const state = `${providerId}.${randomString(16)}`;
  sessionStorage.setItem(STATE_KEY, state);

  const redirectUri = defaultRedirectUri();
  const url = new URL(provider.authorizeUrl);

  if (providerId === "meta") {
    url.searchParams.set("client_id", provider.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", provider.scopes);
    url.searchParams.set("response_type", "code");
  } else if (providerId === "github") {
    url.searchParams.set("client_id", provider.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", provider.scopes);
    url.searchParams.set("state", state);
  } else if (providerId === "apple") {
    url.searchParams.set("client_id", provider.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("scope", provider.scopes);
    url.searchParams.set("state", state);
  } else {
    // Google + Microsoft: auth code + PKCE (SPA-friendly; still need backend for full token use)
    const verifier = randomString(48);
    sessionStorage.setItem(PKCE_KEY, verifier);
    const challenge = await sha256Base64Url(verifier);
    url.searchParams.set("client_id", provider.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", provider.scopes);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    if (providerId === "google") {
      url.searchParams.set("access_type", "online");
      url.searchParams.set("prompt", "select_account");
    }
  }

  window.location.assign(url.toString());
  return { ok: true };
}

/**
 * Handle /auth/callback — validate state, create stub session.
 * Does NOT exchange the code (needs server + client secret).
 */
export function completeOAuthCallback(search: string): {
  ok: boolean;
  session?: AuthSession;
  message: string;
} {
  const params = new URLSearchParams(search);
  const err = params.get("error") || params.get("error_description");
  if (err) {
    return { ok: false, message: `Provider error: ${err}` };
  }

  const code = params.get("code");
  const state = params.get("state") || "";
  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(PKCE_KEY);

  if (!code) {
    return {
      ok: false,
      message: "No authorization code in callback. Did the provider redirect correctly?",
    };
  }

  if (expected && state !== expected) {
    return {
      ok: false,
      message: "OAuth state mismatch — try signing in again.",
    };
  }

  const providerId = (state.split(".")[0] || "github") as AuthProviderId;
  const labels: Record<AuthProviderId, string> = {
    google: "Google traveler",
    apple: "Apple traveler",
    microsoft: "Microsoft traveler",
    meta: "Meta traveler",
    github: "GitHub traveler",
  };

  const session: AuthSession = {
    provider: providerId,
    displayName: labels[providerId] ?? "Voyajes traveler",
    signedInAt: new Date().toISOString(),
    stub: true,
  };
  setSession(session);

  return {
    ok: true,
    session,
    message:
      "Stub session saved locally. Authorization code received but not exchanged — wire a backend token endpoint for real accounts (see SETUP_AUTH.md).",
  };
}

/** Local-only mock sign-in for UI demos when no OAuth apps are configured */
export function signInDemo(provider: AuthProviderId = "github"): AuthSession {
  const session: AuthSession = {
    provider,
    displayName: "Demo voyager",
    email: "demo@voyajes.local",
    signedInAt: new Date().toISOString(),
    stub: true,
  };
  setSession(session);
  return session;
}

/* —— QR session pairing (mock) + OTP demo —— */

export type OtpChannel = "sms" | "whatsapp" | "telegram";

const QR_SESSION_KEY = "voyajes.auth.qr_session";
const OTP_PENDING_KEY = "voyajes.auth.otp_pending";

export type QrPairSession = {
  token: string;
  createdAt: string;
  /** Device that showed the QR claims “waiting” until phone confirms */
  status: "waiting" | "approved";
};

export type OtpPending = {
  channel: OtpChannel;
  destination: string;
  /** Demo only — never store real OTPs client-side in production */
  code: string;
  expiresAt: string;
};

function randomToken(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Create a mock QR pairing session and return the deep-link URL for the QR payload. */
export function createQrPairSession(): { session: QrPairSession; pairUrl: string } {
  const token = randomToken(12);
  const session: QrPairSession = {
    token,
    createdAt: new Date().toISOString(),
    status: "waiting",
  };
  sessionStorage.setItem(QR_SESSION_KEY, JSON.stringify(session));
  const base = appOriginPath();
  const pairUrl = `${base}/signin?qr=${encodeURIComponent(token)}`;
  return { session, pairUrl };
}

export function getQrPairSession(): QrPairSession | null {
  try {
    const raw = sessionStorage.getItem(QR_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as QrPairSession;
  } catch {
    return null;
  }
}

/** Phone (or second tab) approving the QR session — mock. */
export function approveQrPairSession(token: string): boolean {
  const session = getQrPairSession();
  if (!session || session.token !== token) {
    // Allow approving even if this tab didn't create it (cross-tab demo):
    // store an approved marker keyed by token.
    const approved: QrPairSession = {
      token,
      createdAt: new Date().toISOString(),
      status: "approved",
    };
    sessionStorage.setItem(QR_SESSION_KEY, JSON.stringify(approved));
    const sess: AuthSession = {
      provider: "github",
      displayName: "QR voyager",
      email: "qr@voyajes.local",
      signedInAt: new Date().toISOString(),
      stub: true,
    };
    setSession(sess);
    return true;
  }
  session.status = "approved";
  sessionStorage.setItem(QR_SESSION_KEY, JSON.stringify(session));
  const sess: AuthSession = {
    provider: "github",
    displayName: "QR voyager",
    email: "qr@voyajes.local",
    signedInAt: new Date().toISOString(),
    stub: true,
  };
  setSession(sess);
  return true;
}

export function clearQrPairSession(): void {
  sessionStorage.removeItem(QR_SESSION_KEY);
}

/** Public QR image URL (third-party stub — swap for local generator later). */
export function qrImageUrl(data: string, size = 180): string {
  const encoded = encodeURIComponent(data);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encoded}`;
}

function mockSixDigit(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

/**
 * “Send” a demo OTP. Code is stored in sessionStorage for verify.
 * Real SMS/WhatsApp/Telegram delivery requires a backend (see SETUP_AUTH.md).
 */
export function sendMockOtp(
  channel: OtpChannel,
  destination: string,
): { ok: true; pending: OtpPending; demoCode: string } | { ok: false; reason: string } {
  const dest = destination.trim();
  if (!dest) {
    return { ok: false, reason: "Enter a phone number or email." };
  }
  if (channel === "sms" || channel === "whatsapp") {
    // loose check
    if (!/[+\d]/.test(dest) && !dest.includes("@")) {
      return { ok: false, reason: "Use a phone (+E.164) or email for this channel." };
    }
  }
  const code = mockSixDigit();
  const pending: OtpPending = {
    channel,
    destination: dest,
    code,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
  sessionStorage.setItem(OTP_PENDING_KEY, JSON.stringify(pending));
  return { ok: true, pending, demoCode: code };
}

export function getPendingOtp(): OtpPending | null {
  try {
    const raw = sessionStorage.getItem(OTP_PENDING_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OtpPending;
  } catch {
    return null;
  }
}

export function verifyMockOtp(
  code: string,
): { ok: true; session: AuthSession } | { ok: false; reason: string } {
  const pending = getPendingOtp();
  if (!pending) {
    return { ok: false, reason: "No code pending — tap Send code first." };
  }
  if (new Date(pending.expiresAt).getTime() < Date.now()) {
    sessionStorage.removeItem(OTP_PENDING_KEY);
    return { ok: false, reason: "Code expired — send a new one." };
  }
  if (code.trim() !== pending.code) {
    return { ok: false, reason: "Incorrect code. Check the demo code shown after send." };
  }
  sessionStorage.removeItem(OTP_PENDING_KEY);
  const labels: Record<OtpChannel, string> = {
    sms: "SMS voyager",
    whatsapp: "WhatsApp voyager",
    telegram: "Telegram voyager",
  };
  const session: AuthSession = {
    provider: "github",
    displayName: labels[pending.channel],
    email: pending.destination.includes("@") ? pending.destination : undefined,
    signedInAt: new Date().toISOString(),
    stub: true,
  };
  setSession(session);
  return { ok: true, session };
}
