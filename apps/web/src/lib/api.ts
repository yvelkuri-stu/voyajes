/**
 * Voyajes collaboration API client (v0.7). Everything here is optional:
 * without VITE_API_BASE (or when the API is unreachable) the app stays
 * local-first and #vj1 links keep working.
 */
import type { PortablePackV1 } from "./portableShare";

export const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? "").replace(/\/$/, "");
export const apiEnabled = (): boolean => !!API_BASE;
export const isCloudId = (s: string | undefined): boolean => !!s && /^c[0-9A-Za-z]{7}$/.test(s);
export const REACTION_EMOJIS = ["❤️", "🔥", "😂", "😮", "👏"] as const;

export function deviceId(): string {
  const K = "voyajes.deviceId.v1";
  try {
    let id = localStorage.getItem(K);
    if (!id) {
      const b = crypto.getRandomValues(new Uint8Array(12));
      id = "d" + [...b].map((x) => x.toString(36).padStart(2, "0")).join("").slice(0, 20);
      localStorage.setItem(K, id);
    }
    return id;
  } catch {
    return "danon" + Math.random().toString(36).slice(2, 12);
  }
}

// host secrets stay on this device (never in links)
type HostEntry = { id: string; secret: string; localShareId?: string; title?: string; createdAt: number };
const HOST_KEY = "voyajes.hostVoyages.v1";
export function hostEntries(): HostEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HOST_KEY) || "[]");
  } catch {
    return [];
  }
}
export function hostSecretFor(id: string): string | undefined {
  return hostEntries().find((e) => e.id === id)?.secret;
}
export function cloudIdForLocal(localShareId: string): string | undefined {
  return hostEntries().find((e) => e.localShareId === localShareId)?.id;
}
function saveHost(e: HostEntry) {
  const list = hostEntries().filter((x) => x.id !== e.id);
  list.unshift(e);
  localStorage.setItem(HOST_KEY, JSON.stringify(list.slice(0, 100)));
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
async function req<T>(path: string, init: RequestInit & { json?: unknown; secret?: string; timeoutMs?: number } = {}): Promise<T> {
  if (!API_BASE) throw new ApiError(0, "API not configured");
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  if (init.secret) headers.Authorization = `Bearer ${init.secret}`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), init.timeoutMs ?? 15000);
  try {
    const res = await fetch(API_BASE + path, {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      signal: ac.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || `HTTP ${res.status}`);
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, "Can't reach Voyajes cloud right now");
  } finally {
    clearTimeout(t);
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "application/octet-stream";
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: mime });
}

/**
 * Publish a portable pack: create the voyage, upload every embedded media
 * entry to R2, then store the pack with media URLs instead of data URLs.
 */
export async function publishPack(
  pack: PortablePackV1,
  opts: { localShareId?: string; existingId?: string; onProgress?: (msg: string) => void } = {},
): Promise<{ id: string; secret: string; shortUrl: string }> {
  const lite: PortablePackV1 = { ...pack, media: {} };
  const existingSecret = opts.existingId ? hostSecretFor(opts.existingId) : undefined;
  const created =
    opts.existingId && existingSecret
      ? { id: opts.existingId, hostSecret: existingSecret }
      : await req<{ id: string; hostSecret: string }>("/voyages", {
          method: "POST",
          json: { title: pack.share.title, mode: pack.share.mode, pack: lite },
        });
  const media: PortablePackV1["media"] = {};
  const entries = Object.entries(pack.media);
  let i = 0;
  for (const [k, e] of entries) {
    i++;
    opts.onProgress?.(`Uploading ${i}/${entries.length}…`);
    if (e.url) {
      media[k] = e;
      continue;
    }
    const blob = dataUrlToBlob(e.dataUrl);
    const up = await req<{ url: string }>(`/voyages/${created.id}/media`, {
      method: "POST",
      secret: created.hostSecret,
      headers: { "Content-Type": blob.type },
      body: blob,
      timeoutMs: 60000,
    });
    media[k] = { ...e, dataUrl: "", url: up.url };
  }
  await req(`/voyages/${created.id}/pack`, { method: "PUT", secret: created.hostSecret, json: { pack: { ...pack, media } } });
  saveHost({ id: created.id, secret: created.hostSecret, localShareId: opts.localShareId, title: pack.share.title, createdAt: Date.now() });
  return { id: created.id, secret: created.hostSecret, shortUrl: shortUrlFor(created.id) };
}

export function shortUrlFor(id: string): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${window.location.origin}${base}/v/${id}`;
}

export type CloudVoyage = { id: string; title: string; mode: string; pack: PortablePackV1; dropsEnabled: boolean };
export const fetchVoyage = (id: string) => req<CloudVoyage>(`/voyages/${id}`, { timeoutMs: 10000 });

export type Social = {
  reactions: Record<string, number>;
  comments: { id: string; name: string | null; body: string; created_at: number }[];
  hearts: Record<string, number>;
  myHearts: number[];
  attending: string[];
  rsvpCounts: Record<string, number>;
  myRsvp: { name: string; answer: string; note?: string } | null;
  dropsEnabled: boolean;
};
export const fetchSocial = (id: string) => req<Social>(`/voyages/${id}/social?deviceId=${deviceId()}`);
export const react = (id: string, emoji: string) => req(`/voyages/${id}/reactions`, { method: "POST", json: { emoji, deviceId: deviceId() } });
export const comment = (id: string, name: string, body: string) =>
  req<Social["comments"][number]>(`/voyages/${id}/comments`, { method: "POST", json: { deviceId: deviceId(), name, body } });
export const heart = (id: string, clip: number) => req<{ hearted: boolean }>(`/voyages/${id}/hearts`, { method: "POST", json: { deviceId: deviceId(), clip } });
export const rsvp = (id: string, body: { name: string; answer: "yes" | "no" | "maybe"; note?: string; mediaKey?: string }) =>
  req(`/voyages/${id}/rsvp`, { method: "POST", json: { ...body, deviceId: deviceId() } });

/** Guest photo drop: ask for a signed slot, then PUT the file to it. */
export async function dropFile(id: string, file: File, name?: string, purpose?: "rsvp"): Promise<{ key: string; url: string }> {
  const mime = file.type || (/\.png$/i.test(file.name) ? "image/png" : "image/jpeg");
  const slot = await req<{ uploadUrl: string; key: string; url: string }>(`/voyages/${id}/drops`, {
    method: "POST",
    json: { deviceId: deviceId(), name, mime, size: file.size, purpose },
  });
  const res = await fetch(slot.uploadUrl, { method: "PUT", headers: { "Content-Type": mime }, body: file });
  if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => ({}))) as { error?: string }).error || "Upload failed");
  return { key: slot.key, url: slot.url };
}

// host
export type HostView = {
  id: string;
  dropsEnabled: boolean;
  dropsMax: number;
  drops: { id: string; name: string | null; mime: string; size: number; status: string; url: string; created_at: number }[];
  rsvps: { name: string; answer: string; note: string | null; url?: string; updated_at: number }[];
  comments: { id: string; name: string | null; body: string; created_at: number }[];
  reactions: Record<string, number>;
  hearts: Record<string, number>;
};
const sec = (id: string) => {
  const s = hostSecretFor(id);
  if (!s) throw new ApiError(403, "Not the host on this device");
  return s;
};
export const fetchHost = (id: string) => req<HostView>(`/voyages/${id}/host`, { secret: sec(id) });
export const setDrops = (id: string, enabled: boolean) => req(`/voyages/${id}`, { method: "PATCH", secret: sec(id), json: { dropsEnabled: enabled } });
export const setDropStatus = (id: string, dropId: string, status: "accepted" | "rejected" | "added") =>
  req(`/voyages/${id}/drops/${dropId}`, { method: "POST", secret: sec(id), json: { status } });
export const deleteComment = (id: string, cid: string) => req(`/voyages/${id}/comments/${cid}`, { method: "DELETE", secret: sec(id) });
export const updatePack = (id: string, pack: PortablePackV1) => req(`/voyages/${id}/pack`, { method: "PUT", secret: sec(id), json: { pack } });
