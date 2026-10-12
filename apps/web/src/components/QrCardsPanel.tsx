import { useState } from "react";
import type { PortablePackV1 } from "../lib/portableShare";
import { CARD_FORMATS, canvasToPdf, cardInfoFromPack, download, renderCard, toBlob, type CardFormat } from "../lib/cards";

/** Host: download/print themed QR invite cards + a guest photo-drop table card. */
export function QrCardsPanel({ pack, url }: { pack: PortablePackV1; url: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const slug = (pack.share.title || "voyajes").replace(/[^\w-]+/g, "-").slice(0, 40);
  const make = async (format: CardFormat, kind: "pdf" | "png") => {
    setBusy(`${format}-${kind}`);
    try {
      const target = format === "table" ? `${url}${url.includes("?") ? "&" : "?"}drop=1` : url;
      const c = await renderCard(format, cardInfoFromPack(pack, target));
      const f = CARD_FORMATS[format];
      const blob = kind === "pdf" && f.pt ? await canvasToPdf(c, f.pt) : await toBlob(c, "image/png");
      download(blob, `${slug}-${format}.${kind}`);
    } finally {
      setBusy(null);
    }
  };
  const isInvite = pack.share.mode === "invitation";
  return (
    <div className="vj-qr-panel" data-qr-cards>
      <p className="muted vj-small-text">
        Printable cards with a QR to your short link{isInvite ? " and the event details" : ""}. Free, no watermark.
      </p>
      <div className="vj-qr-cards">
        <button type="button" className="btn btn-ghost vj-small" data-qr-card="a6-pdf" disabled={!!busy} onClick={() => void make("a6", "pdf")}>
          🖨 A6 card · PDF
        </button>
        <button type="button" className="btn btn-ghost vj-small" data-qr-card="5x7-pdf" disabled={!!busy} onClick={() => void make("5x7", "pdf")}>
          🖨 5×7 card · PDF
        </button>
        <button type="button" className="btn btn-ghost vj-small" data-qr-card="5x7-png" disabled={!!busy} onClick={() => void make("5x7", "png")}>
          5×7 · PNG
        </button>
        <button type="button" className="btn btn-ghost vj-small" data-qr-card="phone-png" disabled={!!busy} onClick={() => void make("phone", "png")}>
          📱 Phone size · PNG
        </button>
        <button type="button" className="btn btn-ghost vj-small" data-qr-card="table-pdf" disabled={!!busy} onClick={() => void make("table", "pdf")}>
          📸 Party camera card · PDF
        </button>
      </div>
      {busy && <p className="muted vj-small-text">Rendering card…</p>}
    </div>
  );
}
