/**
 * Portable share packs: self-contained invite payloads in the URL hash.
 * Format: #vj1.<base64url(deflate(JSON))>
 * No backend — photos travel with the link; videos become stills.
 */

import { getBlob, type DraftClipMeta } from "./draftStore";
import {
  publicShareUrl,
  type SharePlaybackSnapshot,
  type ShareRecord,
} from "./shareStore";

export const PORTABLE_HASH_PREFIX = "vj1.";
/** Soft cap for URL hash payload (chars). WhatsApp/SMS may truncate sooner. */
export const PORTABLE_MAX_CHARS = 1_800_000;
const SESSION_CACHE_PREFIX = "voyajes.portable.cache.v1:";

export type PortableMediaEntry = {
  /** JPEG (or original image) data URL */
  dataUrl: string;
  /** Playback kind after packing (videos may be coerced to image stills) */
  kind: "image" | "video";
  /** Original clip was video; link embeds a poster still */
  videoAsStill?: boolean;
};

export type PortablePackV1 = {
  v: 1;
  share: ShareRecord;
  /** clipId → media */
  media: Record<string, PortableMediaEntry>;
  flags?: {
    truncated?: boolean;
    videosAsStills?: boolean;
    droppedClips?: number;
    quality?: "high" | "compact";
  };
};

export type BuildPortableResult = {
  url: string;
  pack: PortablePackV1;
  payloadChars: number;
  truncated: boolean;
  videosAsStills: boolean;
  droppedClips: number;
  /** Human status for host UI */
  status: string;
};

export type HydratedPortable = {
  record: ShareRecord;
  /** clipId → object URL (blob:) for playback; revoke when done */
  objectUrls: Record<string, string>;
  /** First playable poster object URL if any */
  posterUrl: string | null;
  flags: PortablePackV1["flags"];
};

function bytesToBase64Url(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}


function asBlobPart(bytes: Uint8Array): BlobPart {
  return bytes.slice() as BlobPart;
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const pad = (4 - (b64url.length % 4)) % 4;
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deflateBytes(input: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") {
    // No CompressionStream — return raw (still works, just larger)
    return input;
  }
  const stream = new Blob([asBlobPart(input)]).stream().pipeThrough(new CompressionStream("deflate"));
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

async function inflateBytes(input: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    return input;
  }
  try {
    const stream = new Blob([asBlobPart(input)])
      .stream()
      .pipeThrough(new DecompressionStream("deflate"));
    const ab = await new Response(stream).arrayBuffer();
    return new Uint8Array(ab);
  } catch {
    // Payload may be uncompressed (fallback encode path)
    return input;
  }
}

function encodePayload(pack: PortablePackV1): Promise<string> {
  const json = JSON.stringify(pack);
  const raw = new TextEncoder().encode(json);
  return deflateBytes(raw).then(bytesToBase64Url);
}

export async function decodePortablePayload(payload: string): Promise<PortablePackV1> {
  const bytes = base64UrlToBytes(payload);
  const inflated = await inflateBytes(bytes);
  const json = new TextDecoder().decode(inflated);
  const pack = JSON.parse(json) as PortablePackV1;
  if (!pack || pack.v !== 1 || !pack.share || typeof pack.media !== "object") {
    throw new Error("Invalid portable pack");
  }
  return pack;
}

/** Extract #vj1.<payload> from a hash string (with or without leading #). */
export function parsePortableHash(hash: string): string | null {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!h.startsWith(PORTABLE_HASH_PREFIX)) return null;
  const payload = h.slice(PORTABLE_HASH_PREFIX.length);
  return payload.length > 0 ? payload : null;
}

export function portableHashFromLocation(
  hash = typeof location !== "undefined" ? location.hash : "",
): string | null {
  return parsePortableHash(hash);
}

export function buildPortableUrl(shareId: string, encodedPayload: string): string {
  const base = publicShareUrl(shareId || "p");
  return `${base}#${PORTABLE_HASH_PREFIX}${encodedPayload}`;
}

async function resizeImageToJpeg(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  maxEdge: number,
  quality: number,
): Promise<string> {
  const scale = Math.min(1, maxEdge / Math.max(srcW, srcH || 1));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(source, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

async function blobToJpegDataUrl(
  blob: Blob,
  maxEdge: number,
  quality: number,
): Promise<string> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    try {
      return await resizeImageToJpeg(
        bitmap,
        bitmap.width,
        bitmap.height,
        maxEdge,
        quality,
      );
    } finally {
      bitmap.close();
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image load failed"));
      el.src = url;
    });
    return await resizeImageToJpeg(img, img.naturalWidth, img.naturalHeight, maxEdge, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function videoBlobToPosterJpeg(
  blob: Blob,
  maxEdge: number,
  quality: number,
): Promise<string> {
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Video load failed"));
    });
    const seekTo = Math.min(0.15, Number.isFinite(video.duration) ? video.duration * 0.05 : 0.1);
    if (seekTo > 0) {
      try {
        video.currentTime = seekTo;
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          video.onseeked = done;
          window.setTimeout(done, 800);
        });
      } catch {
        /* ignore seek errors */
      }
    }
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 360;
    return await resizeImageToJpeg(video, w, h, maxEdge, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

type QualityPreset = { maxEdge: number; quality: number; label: "high" | "compact" };

const QUALITY_HIGH: QualityPreset = { maxEdge: 960, quality: 0.7, label: "high" };
const QUALITY_COMPACT: QualityPreset = { maxEdge: 720, quality: 0.55, label: "compact" };

async function encodeClipMedia(
  blob: Blob,
  kind: "image" | "video",
  preset: QualityPreset,
): Promise<PortableMediaEntry | null> {
  try {
    if (kind === "image" || blob.type.startsWith("image/")) {
      const dataUrl = await blobToJpegDataUrl(blob, preset.maxEdge, preset.quality);
      return { dataUrl, kind: "image" };
    }
    if (kind === "video" || blob.type.startsWith("video/")) {
      const dataUrl = await videoBlobToPosterJpeg(blob, preset.maxEdge, preset.quality);
      return { dataUrl, kind: "image", videoAsStill: true };
    }
    return null;
  } catch {
    return null;
  }
}

function stripShareForPack(record: ShareRecord): ShareRecord {
  // Deep-ish clone; keep playback recipe; media travels in `media` map
  return JSON.parse(JSON.stringify(record)) as ShareRecord;
}

async function buildPackAtQuality(
  record: ShareRecord,
  preset: QualityPreset,
  maxClips: number,
): Promise<PortablePackV1> {
  const share = stripShareForPack(record);
  const metas = (share.playback?.clips ?? []).slice(0, maxClips);
  if (share.playback) {
    share.playback = {
      ...share.playback,
      clips: metas.map((c) => {
        const { ...rest } = c;
        return rest;
      }),
    };
  }
  share.clipCount = metas.length;
  share.durationSec = metas.reduce((s, c) => s + c.durationSec, 0);
  if (metas[0]) {
    share.posterClipId = metas[0].id;
    share.posterMime = "image/jpeg";
  }

  const media: Record<string, PortableMediaEntry> = {};
  let videosAsStills = false;
  for (const meta of metas) {
    const blob = await getBlob(meta.id);
    if (!blob) continue;
    const entry = await encodeClipMedia(blob, meta.kind, preset);
    if (!entry) continue;
    media[meta.id] = entry;
    if (entry.videoAsStill) videosAsStills = true;
    // Mark playback clip as image when video→still so guest player uses <img>
    if (entry.videoAsStill && share.playback) {
      const clip = share.playback.clips.find((c) => c.id === meta.id);
      if (clip) {
        clip.kind = "image";
        clip.mimeType = "image/jpeg";
      }
    }
  }

  const originalCount = record.playback?.clips?.length ?? record.clipCount;
  const droppedClips = Math.max(0, originalCount - metas.length);
  const truncated = droppedClips > 0 || Object.keys(media).length < metas.length;

  return {
    v: 1,
    share,
    media,
    flags: {
      truncated: truncated || undefined,
      videosAsStills: videosAsStills || undefined,
      droppedClips: droppedClips || undefined,
      quality: preset.label,
    },
  };
}

/**
 * Build a portable share URL with embedded (compressed) media.
 * Prefer photos; videos become JPEG stills. Shrinks quality / drops clips if oversized.
 */
export async function buildPortableShareUrl(
  record: ShareRecord,
  opts?: { onProgress?: (msg: string) => void },
): Promise<BuildPortableResult> {
  const notify = (msg: string) => opts?.onProgress?.(msg);
  const clipCount = record.playback?.clips?.length ?? record.clipCount;

  notify("Preparing shareable link…");
  let pack = await buildPackAtQuality(record, QUALITY_HIGH, clipCount || 99);
  let encoded = await encodePayload(pack);

  if (encoded.length > PORTABLE_MAX_CHARS) {
    notify("Link large — compressing photos…");
    pack = await buildPackAtQuality(record, QUALITY_COMPACT, clipCount || 99);
    encoded = await encodePayload(pack);
  }

  let dropped = pack.flags?.droppedClips ?? 0;
  let maxKeep = Math.max(1, (pack.share.playback?.clips?.length ?? 1) - 1);
  while (encoded.length > PORTABLE_MAX_CHARS && maxKeep >= 1) {
    notify(`Link still large — embedding first ${maxKeep} clip${maxKeep === 1 ? "" : "s"}…`);
    pack = await buildPackAtQuality(record, QUALITY_COMPACT, maxKeep);
    encoded = await encodePayload(pack);
    dropped = pack.flags?.droppedClips ?? dropped;
    maxKeep -= 1;
  }

  const truncated =
    !!pack.flags?.truncated || encoded.length > PORTABLE_MAX_CHARS || dropped > 0;
  const videosAsStills = !!pack.flags?.videosAsStills;
  const url = buildPortableUrl(record.id, encoded);

  let status =
    "Link works in any browser — photos travel with the link. Full video: Export + WhatsApp.";
  if (videosAsStills && truncated) {
    status =
      "Link ready (photos + video stills; some clips omitted). Export video for the full cut.";
  } else if (videosAsStills) {
    status =
      "Link ready — video clips became stills in the link. Export for full video.";
  } else if (truncated) {
    status =
      "Link ready (truncated for size). Export video or download invite pack for the rest.";
  } else if (encoded.length > 500_000) {
    status =
      "Link ready (large). Some apps truncate long URLs — also download invite pack or Export video.";
  }

  return {
    url,
    pack,
    payloadChars: encoded.length,
    truncated,
    videosAsStills,
    droppedClips: dropped,
    status,
  };
}

function dataUrlToObjectUrl(dataUrl: string): string {
  // Prefer blob: URLs for memory / playback stability
  const m = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return dataUrl;
  const mime = m[1] || "image/jpeg";
  const b64 = m[2];
  const pad = (4 - (b64.length % 4)) % 4;
  const binary = atob(b64 + "=".repeat(pad));
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  const blob = new Blob([asBlobPart(arr)], { type: mime });
  return URL.createObjectURL(blob);
}

/** Hydrate a decoded pack into a ShareRecord + object URLs (no IndexedDB). */
export function hydratePortablePack(pack: PortablePackV1): HydratedPortable {
  const objectUrls: Record<string, string> = {};
  for (const [id, entry] of Object.entries(pack.media)) {
    objectUrls[id] = dataUrlToObjectUrl(entry.dataUrl);
  }

  const share = stripShareForPack(pack.share);
  // Ensure playback clips reflect stills
  if (share.playback) {
    share.playback = {
      ...share.playback,
      clips: share.playback.clips.map((c) => {
        const entry = pack.media[c.id];
        if (!entry) return c;
        if (entry.videoAsStill || entry.kind === "image") {
          return { ...c, kind: "image" as const, mimeType: "image/jpeg" };
        }
        return c;
      }),
    };
  }

  const posterId = share.posterClipId;
  const posterUrl =
    (posterId && objectUrls[posterId]) ||
    Object.values(objectUrls)[0] ||
    null;

  return { record: share, objectUrls, posterUrl, flags: pack.flags };
}

export function cachePortablePack(payloadKey: string, pack: PortablePackV1): void {
  try {
    const key = SESSION_CACHE_PREFIX + payloadKey.slice(0, 64);
    sessionStorage.setItem(key, JSON.stringify(pack));
  } catch {
    /* quota — ignore */
  }
}

export function readCachedPortablePack(payloadKey: string): PortablePackV1 | null {
  try {
    const key = SESSION_CACHE_PREFIX + payloadKey.slice(0, 64);
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const pack = JSON.parse(raw) as PortablePackV1;
    if (pack?.v === 1 && pack.share && pack.media) return pack;
    return null;
  } catch {
    return null;
  }
}

/** Attach in-memory portable URLs onto playback clips for InvitePlayer. */
export function applyPortableUrlsToRecord(
  record: ShareRecord,
  objectUrls: Record<string, string>,
): ShareRecord {
  if (!record.playback) return record;
  const clips: DraftClipMeta[] = record.playback.clips.map((c) => {
    const url = objectUrls[c.id];
    if (!url) return c;
    return { ...c, portableUrl: url } as DraftClipMeta & { portableUrl: string };
  });
  const playback: SharePlaybackSnapshot = { ...record.playback, clips };
  return { ...record, playback };
}

export function downloadInvitePackJson(pack: PortablePackV1, filename?: string): void {
  const name =
    filename ||
    `voyajes-invite-${pack.share.id || "pack"}.voyajes.json`;
  const blob = new Blob([JSON.stringify(pack)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function revokeHydratedUrls(objectUrls: Record<string, string>): void {
  for (const u of Object.values(objectUrls)) {
    if (u.startsWith("blob:")) URL.revokeObjectURL(u);
  }
}
