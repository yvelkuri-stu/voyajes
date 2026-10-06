import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  anyProviderConfigured,
  approveQrPairSession,
  createQrPairSession,
  getProviders,
  getSession,
  qrImageUrl,
  sendMockOtp,
  signInDemo,
  startOAuth,
  verifyMockOtp,
  type AuthProviderId,
  type OtpChannel,
} from "../lib/auth";

const providerIcons: Record<AuthProviderId, string> = {
  google: "G",
  apple: "",
  microsoft: "⊞",
  meta: "f",
  github: "",
};

const OTP_TABS: { id: OtpChannel; label: string; icon: string }[] = [
  { id: "sms", label: "SMS", icon: "📱" },
  { id: "whatsapp", label: "WhatsApp", icon: "💬" },
  { id: "telegram", label: "Telegram", icon: "✈️" },
];

function safeNext(raw: string | null): string {
  if (!raw) return "/create";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/create";
  if (raw.startsWith("/signin") || raw.startsWith("/auth")) return "/create";
  return raw;
}

export function SignIn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const nextPath = safeNext(params.get("next"));
  const providers = useMemo(() => getProviders(), []);
  const anyConfigured = anyProviderConfigured();
  const [busy, setBusy] = useState<AuthProviderId | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  // QR stub
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string | null>(null);

  // OTP stub
  const [otpChannel, setOtpChannel] = useState<OtpChannel>("sms");
  const [otpDest, setOtpDest] = useState("demo@voyajes.local");
  const [otpCode, setOtpCode] = useState("");
  const [otpDemoCode, setOtpDemoCode] = useState<string | null>(null);
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);

  // Already signed in → go where they wanted
  useEffect(() => {
    if (getSession() && !params.get("qr")) {
      navigate(nextPath, { replace: true });
    }
  }, [navigate, nextPath, params]);

  // Remember next for OAuth callback
  useEffect(() => {
    try {
      sessionStorage.setItem("voyajes.auth.next", nextPath);
    } catch {
      /* ignore */
    }
  }, [nextPath]);

  // Incoming QR deep-link: /signin?qr=TOKEN
  useEffect(() => {
    const token = params.get("qr");
    if (!token) return;
    const ok = approveQrPairSession(token);
    if (ok) {
      setQrStatus("QR session approved — signed in as QR voyager (mock).");
      navigate(nextPath, { replace: true });
    } else {
      setHint("Could not approve QR session.");
    }
  }, [params, navigate, nextPath]);

  function refreshQr() {
    const { pairUrl, session } = createQrPairSession();
    setQrUrl(pairUrl);
    setQrToken(session.token);
    setQrStatus(null);
  }

  useEffect(() => {
    refreshQr();
  }, []);

  async function onProvider(id: AuthProviderId) {
    setHint(null);
    setBusy(id);
    const result = await startOAuth(id);
    if (!result.ok) {
      setHint(result.reason);
      setBusy(null);
    }
  }

  function onDemo() {
    signInDemo("github");
    navigate(nextPath);
  }

  function onSendOtp() {
    setOtpHint(null);
    const result = sendMockOtp(otpChannel, otpDest);
    if (!result.ok) {
      setOtpHint(result.reason);
      setOtpSent(false);
      setOtpDemoCode(null);
      return;
    }
    setOtpSent(true);
    setOtpDemoCode(result.demoCode);
    setOtpCode(result.demoCode); // prefill for home testing
    setOtpHint(
      `Demo only — no real ${otpChannel.toUpperCase()} was sent. Use the code shown below.`,
    );
  }

  function onVerifyOtp() {
    setOtpHint(null);
    const result = verifyMockOtp(otpCode);
    if (!result.ok) {
      setOtpHint(result.reason);
      return;
    }
    navigate(nextPath);
  }

  const destPlaceholder =
    otpChannel === "telegram"
      ? "@username or phone"
      : otpChannel === "whatsapp"
        ? "+1… WhatsApp number"
        : "Phone (+E.164) or email";

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-wide">
        <p className="muted" style={{ margin: "0 0 6px", fontSize: "0.8rem", fontWeight: 600 }}>
          VOYAJES · CONTINUE
        </p>
        <h1 className="display" style={{ margin: "0 0 8px", fontSize: "1.75rem" }}>
          Continue to pack your voyage
        </h1>
        <p className="muted" style={{ margin: "0 0 8px", fontSize: "0.95rem" }}>
          Sign in and sign up are the same here — pick a path below. No OAuth keys?
          Use <strong>demo</strong>, <strong>QR</strong>, or <strong>OTP</strong>.
        </p>
        <p className="muted" style={{ margin: "0 0 24px", fontSize: "0.8rem" }}>
          After continue → <code>{nextPath}</code>
        </p>

        {!anyConfigured && (
          <div className="auth-banner" role="status">
            No OAuth client IDs found — social buttons stay locked. Home testing
            works with <strong>Continue as demo voyager</strong>, QR, or OTP below.
            Real keys: copy <code>.env.example</code> → <code>apps/web/.env</code> (
            <code>SETUP_AUTH.md</code>).
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
          <span>or QR / one-time code (demo)</span>
        </div>

        <div className="auth-alt-grid">
          <section className="auth-alt-panel" aria-label="QR code login">
            <h2 className="auth-alt-title">QR code login</h2>
            <ol className="auth-howto">
              <li>A pairing QR is ready below (refreshes with <em>New QR</em>).</li>
              <li>
                On another phone/tab, open the link under the QR — or scan it.
              </li>
              <li>
                For one-browser testing: tap <strong>Simulate scan</strong> → you
                continue as <code>QR voyager</code>.
              </li>
            </ol>
            {qrUrl && (
              <div className="auth-qr-wrap">
                <img
                  src={qrImageUrl(qrUrl, 168)}
                  alt="Sign-in QR code"
                  width={168}
                  height={168}
                  className="auth-qr-img"
                />
                <p className="auth-qr-url muted" title={qrUrl}>
                  {qrUrl}
                </p>
                {qrToken && (
                  <p className="muted" style={{ fontSize: "0.72rem", margin: "4px 0 0" }}>
                    Pairing token <code>{qrToken.slice(0, 10)}…</code>
                  </p>
                )}
              </div>
            )}
            <div className="auth-alt-actions">
              <button type="button" className="btn btn-ghost" onClick={refreshQr}>
                New QR
              </button>
              {qrToken && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    approveQrPairSession(qrToken);
                    navigate(nextPath);
                  }}
                >
                  Simulate scan
                </button>
              )}
            </div>
            {qrStatus && (
              <p className="muted" style={{ fontSize: "0.78rem", marginTop: 10 }}>
                {qrStatus}
              </p>
            )}
          </section>

          <section className="auth-alt-panel" aria-label="OTP login">
            <h2 className="auth-alt-title">One-time code</h2>
            <ol className="auth-howto">
              <li>Pick SMS / WhatsApp / Telegram (all mock — nothing is sent).</li>
              <li>Enter any phone or email → <strong>Send code</strong>.</li>
              <li>
                The <strong>demo code appears on screen</strong> — type or use the
                prefilled field → <strong>Verify &amp; continue</strong>.
              </li>
            </ol>
            <div className="otp-tabs" role="tablist" aria-label="OTP channel">
              {OTP_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={otpChannel === t.id}
                  className={`otp-tab${otpChannel === t.id ? " is-active" : ""}`}
                  onClick={() => {
                    setOtpChannel(t.id);
                    setOtpSent(false);
                    setOtpDemoCode(null);
                    setOtpCode("");
                    setOtpHint(null);
                  }}
                >
                  <span aria-hidden>{t.icon}</span> {t.label}
                </button>
              ))}
            </div>
            <label className="otp-field">
              <span className="muted">Phone or email</span>
              <input
                type="text"
                value={otpDest}
                onChange={(e) => setOtpDest(e.target.value)}
                placeholder={destPlaceholder}
                autoComplete="tel"
                aria-label="OTP destination"
              />
            </label>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 8 }}
              onClick={onSendOtp}
            >
              Send code ({OTP_TABS.find((t) => t.id === otpChannel)?.label})
            </button>
            {otpSent && (
              <div className="otp-verify">
                {otpDemoCode && (
                  <div className="otp-demo-banner" role="status">
                    <div className="otp-demo-label">Your demo code (copy this)</div>
                    <div className="otp-demo-code-lg" aria-live="polite">
                      {otpDemoCode}
                    </div>
                    <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.75rem" }}>
                      Not delivered by {otpChannel} — shown here for home testing.
                    </p>
                  </div>
                )}
                <label className="otp-field">
                  <span className="muted">6-digit code</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="••••••"
                    aria-label="OTP code"
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: "100%", marginTop: 8 }}
                  disabled={otpCode.length !== 6}
                  onClick={onVerifyOtp}
                >
                  Verify &amp; continue
                </button>
              </div>
            )}
            {otpHint && (
              <p className="muted" style={{ fontSize: "0.78rem", marginTop: 10 }}>
                {otpHint}
              </p>
            )}
          </section>
        </div>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button type="button" className="btn btn-primary auth-demo-btn" onClick={onDemo}>
          Continue as demo voyager
        </button>
        <p className="muted" style={{ margin: "10px 0 0", fontSize: "0.78rem", textAlign: "center" }}>
          Fastest path for local demos — stub session in localStorage.
        </p>

        <p className="muted" style={{ margin: "20px 0 0", fontSize: "0.8rem", textAlign: "center" }}>
          <Link to="/">← Back home</Link>
          {" · "}
          Callback stub: <code>/auth/callback</code>
        </p>
      </div>
    </div>
  );
}
