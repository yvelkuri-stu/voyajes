/**
 * In-memory last browser export — so Share / WhatsApp can attach the file
 * without re-encoding when the user just exported from Compose.
 */

export type LastExportKind = "video" | "gif" | "webp";

export type LastExport = {
  blob: Blob;
  filename: string;
  mimeType: string;
  shareId?: string;
  title: string;
  createdAt: number;
  kind?: LastExportKind;
};

let last: LastExport | null = null;
let lastGif: LastExport | null = null;

export function setLastExport(entry: LastExport): void {
  const kind = entry.kind ?? (entry.mimeType.startsWith("image/") ? "gif" : "video");
  const withKind = { ...entry, kind };
  if (kind === "gif" || kind === "webp") {
    lastGif = withKind;
  }
  last = withKind;
}

export function getLastExport(shareId?: string): LastExport | null {
  if (!last) return null;
  if (shareId && last.shareId && last.shareId !== shareId) return null;
  return last;
}

/** Prefer a recent GIF/WebP for chat-friendly shares. */
export function getLastGifExport(shareId?: string): LastExport | null {
  if (!lastGif) return null;
  if (shareId && lastGif.shareId && lastGif.shareId !== shareId) return null;
  return lastGif;
}

export function clearLastExport(): void {
  last = null;
  lastGif = null;
}
