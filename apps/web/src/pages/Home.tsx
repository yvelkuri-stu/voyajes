import { Link } from "react-router-dom";
import { brand } from "@voyajes/core";
import { getThemes } from "../data/themes";
import { useAuthSession } from "../hooks/useAuthSession";
import { usePrefs } from "../hooks/usePrefs";

const recents = [
  {
    id: "1",
    title: "Goa 2026",
    theme: "Ocean Pop",
    duration: "0:28",
    accent: "#3DDC97",
  },
  {
    id: "2",
    title: "Neon market walk",
    theme: "Neon Night",
    duration: "0:15",
    accent: "#E84AFF",
  },
  {
    id: "3",
    title: "Golden pier",
    theme: "Golden Hour",
    duration: "0:42",
    accent: "#FF6B4A",
  },
];

export function Home() {
  const { session } = useAuthSession();
  const { prefs } = usePrefs();
  const themes = getThemes().slice(0, 4);

  return (
    <div>
      <section className="hero-grid">
        <div>
          <p
            className="muted"
            style={{ margin: "0 0 8px", fontSize: "0.85rem", fontWeight: 600 }}
          >
            {brand.name.toUpperCase()}
          </p>
          <h1 className="display" style={{ margin: "0 0 12px" }}>
            {brand.tagline}
          </h1>
          <p className="muted" style={{ maxWidth: 440, marginBottom: 24 }}>
            Theme before timeline. Pick a color &amp; motion pack, compose a
            breeze edit, share a beautiful link — same project JSON your CLI
            robots use.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link to="/create?fresh=1" className="btn btn-primary">
              New story
            </Link>
            <Link
              to="/create?mode=invitation&fresh=1"
              className="btn btn-primary"
              style={{
                background: "linear-gradient(135deg, rgba(124,92,255,0.85), rgba(61,220,151,0.55))",
                boxShadow: "0 0 0 1px rgba(124,92,255,0.35)",
              }}
            >
              New invitation
            </Link>
            <Link to="/themes?tab=templates&filter=invitation" className="btn btn-ghost">
              Invitation templates
            </Link>
            <Link to="/themes" className="btn btn-ghost">
              Browse themes
            </Link>
            <Link to="/themes?tab=templates" className="btn btn-ghost">
              {prefs.kidsMode ? "Kids templates" : "Templates"}
            </Link>
            {!session && (
              <Link to="/signin?next=/create" className="btn btn-ghost">
                Continue
              </Link>
            )}
          </div>
        </div>
        <div
          style={{
            borderRadius: 20,
            padding: 24,
            background:
              "linear-gradient(145deg, rgba(232,74,255,0.2), rgba(124,92,255,0.15), rgba(61,220,151,0.12))",
            border: "1px solid var(--border-subtle)",
            minHeight: 220,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
          }}
        >
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {["#E84AFF", "#FF6B4A", "#F5C542", "#3DDC97", "#7C5CFF"].map((c) => (
              <span
                key={c}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: c,
                  boxShadow: `0 0 16px ${c}66`,
                }}
              />
            ))}
          </div>
          <p style={{ margin: 0, fontFamily: "Sora, sans-serif", fontWeight: 600 }}>
            Color &amp; motion as the product
          </p>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
            Neon Night · Soft Film · Ocean Pop · Golden Hour
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Recent voyages</h2>
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            Demo data
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 16,
          }}
        >
          {recents.map((r) => (
            <Link key={r.id} to="/create" className="card" style={{ display: "block" }}>
              <div
                style={{
                  height: 120,
                  background: `linear-gradient(160deg, #141822, ${r.accent}88)`,
                  borderBottom: `3px solid ${r.accent}`,
                }}
              />
              <div style={{ padding: 14 }}>
                <div style={{ fontWeight: 600 }}>{r.title}</div>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  {r.theme} · {r.duration}
                </div>
              </div>
            </Link>
          ))}
          <Link
            to="/create?fresh=1"
            className="card"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 180,
              borderStyle: "dashed",
              color: "var(--text-secondary)",
              fontWeight: 600,
            }}
          >
            + New story
          </Link>
          <Link
            to="/create?mode=invitation&fresh=1"
            className="card"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              minHeight: 180,
              borderStyle: "dashed",
              borderColor: "rgba(124,92,255,0.45)",
              color: "var(--text-secondary)",
              fontWeight: 600,
              background: "rgba(124,92,255,0.06)",
            }}
          >
            <span>+ New invitation</span>
            <span className="muted" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
              Guest playback share
            </span>
          </Link>
        </div>
      </section>

      <section>
        <h2 style={{ margin: "0 0 16px", fontSize: "1.15rem" }}>Theme packs</h2>
        <div className="grid-themes">
          {themes.map((t) => (
            <Link key={t.id} to="/themes" className="card">
              <div
                className="theme-card-preview"
                style={{ ["--theme-grad" as string]: t.gradient, minHeight: 140 }}
              >
                <span className="badge badge-free">{t.tier}</span>
                <div style={{ marginTop: 8, fontWeight: 700 }}>{t.name}</div>
                <div style={{ fontSize: "0.8rem", opacity: 0.9 }}>{t.motion} · {t.transition}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
