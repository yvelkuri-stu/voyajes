/**
 * WhatsApp-oriented share helpers for invitations / voyages.
 * Prefer Web Share with a video file (Android WhatsApp); else download + wa.me text.
 */

export function appHomeUrl(): string {
  if (typeof window === "undefined") {
    return "https://yvelkuri-stu.github.io/voyajes/";
  }
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${window.location.origin}${base}/`;
}

export function buildWhatsAppInviteText(opts: {
  title: string;
  shareUrl?: string;
  isInvitation?: boolean;
  /** When true, remind them to attach the downloaded video */
  attachHint?: boolean;
}): string {
  const app = appHomeUrl();
  const title = opts.title.trim() || (opts.isInvitation ? "You're invited!" : "Untitled voyage");
  let msg = opts.isInvitation
    ? `You're invited ✨ ${title} — open the invite / try Voyajes: ${app}`
    : `Check out my voyage ✨ ${title} — try Voyajes: ${app}`;

  if (opts.shareUrl) {
    msg += `\n\nInvite link: ${opts.shareUrl}`;
    msg += `\n(Link plays media best on this device; for WhatsApp send the exported video.)`;
  }

  if (opts.attachHint) {
    msg += `\n\n📎 Please send the video file you just saved — that's the reliable watch path until cloud sync.`;
  } else {
    msg += `\n\n📎 The video file is the reliable way to watch until cloud sync.`;
  }

  return msg;
}

export function canShareVideoFile(file: File): boolean {
  try {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      return false;
    }
    if (typeof navigator.canShare !== "function") {
      // Some browsers support share(files) without canShare
      return true;
    }
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function openWhatsAppWithText(text: string): void {
  const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(wa, "_blank", "noopener,noreferrer");
}

export type WhatsAppShareResult =
  | "shared-file"
  | "whatsapp-text"
  | "aborted"
  | "failed";

/**
 * Prefer navigator.share with the video file when supported.
 * Otherwise open WhatsApp with prefilled text (caller should download the file first if needed).
 */
export async function shareInviteToWhatsApp(opts: {
  title: string;
  text: string;
  file?: File | null;
}): Promise<WhatsAppShareResult> {
  const { title, text, file } = opts;

  if (file && canShareVideoFile(file)) {
    try {
      await navigator.share({
        files: [file],
        title,
        text,
      });
      return "shared-file";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "aborted";
      }
      // Fall through to wa.me
    }
  }

  try {
    openWhatsAppWithText(text);
    return "whatsapp-text";
  } catch {
    return "failed";
  }
}

export function blobToShareFile(blob: Blob, filename: string): File {
  const type = blob.type || "video/webm";
  try {
    return new File([blob], filename, { type, lastModified: Date.now() });
  } catch {
    // Older engines: File constructor may fail; Share API often still accepts Blob-like
    const f = blob as Blob & { name?: string; lastModified?: number };
    Object.defineProperty(f, "name", { value: filename, configurable: true });
    Object.defineProperty(f, "lastModified", { value: Date.now(), configurable: true });
    return f as File;
  }
}
