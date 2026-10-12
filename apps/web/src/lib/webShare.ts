// v0.9 one-tap sharing helpers (Web Share API with graceful fallbacks).

export const STATUS_MAX_SEC = 30;
export const STATUS_MAX_BYTES = 16 * 1024 * 1024;

/** Keep clips until the cap; trim the last one so the story ends on time. */
export function capClips<T extends { durationSec: number }>(clips: T[], capSec: number): T[] {
  const out: T[] = [];
  let t = 0;
  for (const c of clips) {
    if (t >= capSec - 0.5) break;
    const d = Math.min(c.durationSec, capSec - t);
    out.push(d === c.durationSec ? c : { ...c, durationSec: Math.max(0.8, d) });
    t += d;
  }
  return out.length ? out : clips.slice(0, 1);
}

/** Share a file to the OS sheet (WhatsApp Status, Instagram…) or download it. */
export async function shareOrDownload(blob: Blob, name: string, title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], name, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return "shared";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "cancelled";
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  return "downloaded";
}

/** Share a link to the OS sheet, falling back to WhatsApp. */
export async function shareLink(o: { title: string; text: string; url: string }): Promise<"shared" | "whatsapp" | "cancelled"> {
  if (navigator.share) {
    try {
      await navigator.share(o);
      return "shared";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "cancelled";
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${o.text} ${o.url}`)}`, "_blank", "noopener");
  return "whatsapp";
}
