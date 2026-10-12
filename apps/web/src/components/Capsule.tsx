import { useEffect, useState } from "react";
import { fetchVoyage, setCapsule, type CloudVoyage } from "../lib/api";
import { NotifyButton } from "./AfterMovie";
import { t } from "../lib/i18n";
import { Link } from "react-router-dom";
import "../styles/storybrain.css";

const parts = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
};

/** Guests: a sealed capsule shows a living countdown, then opens itself. */
export function CapsuleLocked({ v }: { v: CloudVoyage }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const left = (v.unlockAt ?? 0) - now;
  useEffect(() => {
    if (left <= 0) {
      const tm = setTimeout(() => location.reload(), 1500);
      return () => clearTimeout(tm);
    }
  }, [left <= 0]);
  const p = parts(left);
  const when = v.unlockAt ? new Date(v.unlockAt) : null;
  return (
    <main className="cap-page" data-capsule-locked>
      <div className="cap-glow" aria-hidden />
      <div className="cap-box" aria-hidden>
        <span className="cap-lid" />
        <span className="cap-body">⏳</span>
      </div>
      <p className="cap-kicker">{t("capsule")}</p>
      <h1 className="cap-title">{v.title || "A voyage"}</h1>
      <p className="muted">
        {t("opensIn")} {when?.toLocaleString([], { dateStyle: "long", timeStyle: "short" })}
      </p>
      <div className="cap-count" data-capsule-countdown>
        {(["d", "h", "m", "s"] as const).map((k) => (
          <div key={k} className="cap-cell">
            <b key={p[k]}>{String(p[k]).padStart(2, "0")}</b>
            <span>{{ d: "days", h: "hrs", m: "min", s: "sec" }[k]}</span>
          </div>
        ))}
      </div>
      <NotifyButton cloudId={v.id} title={v.title} />
      <Link to="/" className="cap-home">Make your own capsule →</Link>
    </main>
  );
}

/** Host: seal the voyage until a date (guests see the countdown, then it opens + notifies). */
export function CapsuleHost({ cloudId, unlockAt, onChange }: { cloudId: string; unlockAt: number | null; onChange: (n: number | null) => void }) {
  const toLocal = (ms: number) => new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [val, setVal] = useState(() => toLocal(unlockAt ?? Date.now() + 365 * 86400_000));
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    void fetchVoyage(cloudId).then((v) => { if (!off && v.unlockAt !== undefined) { onChange(v.unlockAt ?? null); if (v.unlockAt) setVal(toLocal(v.unlockAt)); } }).catch(() => {});
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudId]);
  const sealed = unlockAt != null && unlockAt > Date.now();
  return (
    <details className="cap-host" data-capsule-host open={sealed}>
      <summary>⏳ {t("capsule")}{sealed ? ` · opens ${new Date(unlockAt!).toLocaleDateString()}` : ""}</summary>
      <p className="muted vj-small-text">Seal this voyage until a date. Guests see a countdown; it opens by itself and pings everyone following.</p>
      <div className="am-actions">
        <input type="datetime-local" value={val} onChange={(e) => setVal(e.target.value)} data-capsule-date aria-label="Unlock date" />
        <button
          type="button"
          className="btn btn-primary vj-small"
          data-capsule-seal
          onClick={async () => {
            try {
              const at = new Date(val).getTime();
              await setCapsule(cloudId, at);
              onChange(at);
              setMsg(`Sealed until ${new Date(at).toLocaleString()} 🔒`);
            } catch (e) {
              setMsg((e as Error).message);
            }
          }}
        >
          Seal
        </button>
        {sealed && (
          <button type="button" className="btn btn-ghost vj-small" data-capsule-open onClick={async () => { await setCapsule(cloudId, null); onChange(null); setMsg("Opened"); }}>
            Open now
          </button>
        )}
      </div>
      {msg && <p className="muted vj-small-text" role="status" data-capsule-msg>{msg}</p>}
    </details>
  );
}
