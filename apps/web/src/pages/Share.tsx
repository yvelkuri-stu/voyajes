import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Logo } from "../components/Logo";
import { brand } from "@voyajes/core";

export function Share() {
  const { id = "demo" } = useParams();
  const [copied, setCopied] = useState(false);
  const shareUrl = `https://${brand.shareHost}/v/${id}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <div className="share-hero">
        <div
          className="share-bar"
          style={{
            background:
              "linear-gradient(90deg, #0EA5E9, #7C5CFF, #3DDC97)",
          }}
        />
        <div
          style={{
            aspectRatio: "9/14",
            maxHeight: 420,
            background:
              "linear-gradient(160deg, #06141C 0%, #0EA5E9 40%, #3DDC97 100%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <button
            type="button"
            aria-label="Play"
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              border: "none",
              background: "rgba(255,255,255,0.2)",
              backdropFilter: "blur(8px)",
              color: "#fff",
              fontSize: 24,
              cursor: "pointer",
            }}
          >
            ▶
          </button>
          <p
            style={{
              position: "absolute",
              bottom: 24,
              margin: 0,
              fontFamily: "Sora, sans-serif",
              fontWeight: 700,
              fontSize: "1.4rem",
            }}
          >
            Goa 2026
          </p>
        </div>
        <div style={{ padding: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <div>
              <h1 style={{ margin: "0 0 4px", fontSize: "1.25rem" }}>Goa 2026</h1>
              <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                0:28 · Made with theme Ocean Pop
              </p>
            </div>
            <Logo size={24} />
          </div>

          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 12,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
              fontFamily: "monospace",
              fontSize: "0.8rem",
              wordBreak: "break-all",
            }}
          >
            {shareUrl}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary" onClick={copy}>
              {copied ? "Copied!" : "Copy link"}
            </button>
            <button type="button" className="btn btn-ghost" disabled title="TODO: real MP4">
              Download
            </button>
            <button type="button" className="btn btn-ghost" disabled title="TODO: embed">
              Embed
            </button>
          </div>

          <p className="muted" style={{ fontSize: "0.8rem", marginTop: 16 }}>
            Instagram &amp; TikTok rank uploads higher — export a file for those
            feeds; use this link for chats &amp; sites.
          </p>
          <p className="muted" style={{ fontSize: "0.75rem" }}>
            Player is a stub. HLS + OG cards ship with the render pipeline.
          </p>
        </div>
      </div>

      <p style={{ textAlign: "center", marginTop: 24 }}>
        <Link to="/create" className="muted" style={{ fontSize: "0.9rem" }}>
          ← Back to Compose
        </Link>
      </p>
    </div>
  );
}
