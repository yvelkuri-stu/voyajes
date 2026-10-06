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
