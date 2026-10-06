import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  anyProviderConfigured,
  getProviders,
  signInDemo,
  startOAuth,
  type AuthProviderId,
} from "../lib/auth";

const providerIcons: Record<AuthProviderId, string> = {
  google: "G",
  apple: "",
  microsoft: "⊞",
  meta: "f",
  github: "",
};

export function SignIn() {
  const navigate = useNavigate();
  const providers = useMemo(() => getProviders(), []);
  const anyConfigured = anyProviderConfigured();
  const [busy, setBusy] = useState<AuthProviderId | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  async function onProvider(id: AuthProviderId) {
    setHint(null);
    setBusy(id);
    const result = await startOAuth(id);
    if (!result.ok) {
      setHint(result.reason);
      setBusy(null);
    }
    // if ok, browser navigates away
  }

  function onDemo() {
    signInDemo("github");
    navigate("/");
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="muted" style={{ margin: "0 0 6px", fontSize: "0.8rem", fontWeight: 600 }}>
          VOYAJES
        </p>
        <h1 className="display" style={{ margin: "0 0 8px", fontSize: "1.75rem" }}>
          Sign in to pack your voyage
        </h1>
        <p className="muted" style={{ margin: "0 0 24px", fontSize: "0.95rem" }}>
          Sync drafts across devices someday. Today: OAuth shell — paste client IDs
          in <code>.env</code> (see <code>SETUP_AUTH.md</code>).
        </p>

        {!anyConfigured && (
          <div className="auth-banner" role="status">
            No OAuth client IDs found. Buttons stay locked until you add{" "}
            <code>VITE_AUTH_*_CLIENT_ID</code> values. Copy{" "}
            <code>.env.example</code> → <code>apps/web/.env</code> and restart{" "}
            <code>pnpm dev</code>.
          </div>
        )}

        <div className="auth-provider-list">
          {providers.map((p) => {
            const disabled = !p.configured || busy !== null;
            const title = p.configured
              ? `Continue with ${p.label}`
              : `Add credentials in .env (${p.envKey})`;
            return (
              <button
                key={p.id}
                type="button"
                className={`auth-provider-btn${!p.configured ? " is-locked" : ""}`}
                style={{ ["--provider-color" as string]: p.color }}
                disabled={disabled}
                title={title}
                aria-label={title}
                onClick={() => void onProvider(p.id)}
              >
                <span className="auth-provider-icon" aria-hidden>
                  {providerIcons[p.id] || p.label[0]}
                </span>
                <span className="auth-provider-label">
                  {busy === p.id ? "Redirecting…" : `Continue with ${p.label}`}
                </span>
                {!p.configured && (
                  <span className="auth-provider-badge">Add credentials in .env</span>
                )}
              </button>
            );
          })}
        </div>

        {hint && (
          <p className="auth-hint" role="alert">
            {hint}
          </p>
        )}

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button type="button" className="btn btn-ghost auth-demo-btn" onClick={onDemo}>
          Continue as demo voyager
        </button>

        <p className="muted" style={{ margin: "20px 0 0", fontSize: "0.8rem", textAlign: "center" }}>
          <Link to="/">← Back home</Link>
          {" · "}
          Callback stub: <code>/auth/callback</code>
        </p>
      </div>
    </div>
  );
}
