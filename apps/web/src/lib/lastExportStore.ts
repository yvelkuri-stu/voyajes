/**
 * In-memory last browser export — so Share / WhatsApp can attach the file
 * without re-encoding when the user just exported from Compose.
 */

export type LastExport = {
  blob: Blob;
  filename: string;
  mimeType: string;
  shareId?: string;
  title: string;
  createdAt: number;
};

let last: LastExport | null = null;

export function setLastExport(entry: LastExport): void {
  last = entry;
}

export function getLastExport(shareId?: string): LastExport | null {
  if (!last) return null;
  if (shareId && last.shareId && last.shareId !== shareId) return null;
  return last;
}

export function clearLastExport(): void {
  last = null;
}
