import { openCapsules } from "./capsule";
import { notify, releaseDue, vapidPublicKey, okPushEndpoint, eventEndOf, AFTERMOVIE_TITLE } from "./aftermovie";
import { isCrawler, ogHtml, previewMeta, invitationOf, firstImageUrl, buildIcs, assetLinks, appleAppSiteAssociation, esc } from "./onelink";
/**
 * Voyajes collaboration API (v0.7) — Cloudflare Worker + D1 + R2.
 * Short links for published voyages, guest photo drops (signed upload URLs),
 * reactions, comments, per-clip hearts, RSVPs. Anonymous device ids; host
 * actions authorised by a per-voyage secret (stored as SHA-256).
 */
export interface Env {
  DB: D1Database;
  /** optional: without R2 the worker stores media as chunked blobs in D1 */
  MEDIA?: R2Bucket;
  ALLOWED_ORIGINS?: string;
  PUBLIC_BASE?: string;
  SIGNING_KEY?: string;
  /** v0.9: secret for /admin/* takedown endpoints (unset → admin API disabled) */
  ADMIN_SECRET?: string;
  /** v0.9: where humans are sent for /v/:id (the SPA), e.g. https://yvelkuri-stu.github.io/voyajes */
  APP_URL?: string;
  /** v0.9 root-domain mode: proxy non-API GETs to this static origin (see docs/domain.md) */
  APP_ORIGIN?: string;
  /** v0.9 app links */
  ANDROID_PACKAGE?: string;
  ANDROID_SHA256?: string;
  APPLE_APP_IDS?: string;
  CONTACT_EMAIL?: string;
  /** v1.0: VAPID private key (JWK JSON) for Web Push; unset → in-app notifications only */
  VAPID_PRIVATE_JWK?: string;
}

export const EMOJIS = ["❤️", "🔥", "😂", "😮", "👏"] as const;
export const LIMITS = {
  packBytes: 1_500_000,
  hostMediaBytes: 40_000_000,
  dropImageBytes: 15_000_000,
  dropVideoBytes: 60_000_000,
  commentChars: 280,
  nameChars: 40,
  noteChars: 280,
  updateChars: 500,
  plusOnesMax: 10,
  dropsMaxDefault: 10,
};
const RATE = { write: 60, sign: 30, publish: 10, report: 10 }; // per IP per minute

// ───────── media store: R2 when bound, else chunked D1 ─────────
const CHUNK = 900_000;
type Stored = { body: ReadableStream | ArrayBuffer; size: number; mime: string; etag: string; range?: { start: number; end: number } };
const store = {
  async put(env: Env, key: string, buf: ArrayBuffer, mime: string) {
    if (env.MEDIA) {
      await env.MEDIA.put(key, buf, { httpMetadata: { contentType: mime } });
      return;
    }
    const n = Math.max(1, Math.ceil(buf.byteLength / CHUNK));
    const stmts = [env.DB.prepare("DELETE FROM blob_chunks WHERE key = ?").bind(key)];
    for (let i = 0; i < n; i++) stmts.push(env.DB.prepare("INSERT INTO blob_chunks (key, idx, data) VALUES (?, ?, ?)").bind(key, i, buf.slice(i * CHUNK, (i + 1) * CHUNK)));
    stmts.push(env.DB.prepare("INSERT OR REPLACE INTO blob_meta (key, mime, size, chunks) VALUES (?, ?, ?, ?)").bind(key, mime, buf.byteLength, n));
    await env.DB.batch(stmts);
  },
  async get(env: Env, key: string, range?: { offset: number; length?: number }): Promise<Stored | null> {
    if (env.MEDIA) {
      const obj = await env.MEDIA.get(key, range ? { range } : undefined);
      if (!obj) return null;
      const mime = obj.httpMetadata?.contentType ?? "application/octet-stream";
      const r = range ? { start: range.offset, end: range.length ? range.offset + range.length - 1 : obj.size - 1 } : undefined;
      return { body: obj.body, size: obj.size, mime, etag: obj.httpEtag, range: r };
    }
    const meta = await env.DB.prepare("SELECT mime, size, chunks FROM blob_meta WHERE key = ?").bind(key).first<{ mime: string; size: number; chunks: number }>();
    if (!meta) return null;
    const start = range?.offset ?? 0;
    const end = Math.min(meta.size - 1, range?.length ? start + range.length - 1 : meta.size - 1);
    const first = Math.floor(start / CHUNK), last = Math.floor(end / CHUNK);
    const rows = await env.DB.prepare("SELECT idx, data FROM blob_chunks WHERE key = ? AND idx BETWEEN ? AND ? ORDER BY idx").bind(key, first, last).all<{ idx: number; data: ArrayBuffer | number[] }>();
    const out = new Uint8Array(end - start + 1);
    for (const row of rows.results) {
      const u = row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : new Uint8Array(row.data as number[]);
      const base = row.idx * CHUNK;
      const from = Math.max(start, base) - base, to = Math.min(end + 1, base + u.length) - base;
      if (to > from) out.set(u.subarray(from, to), base + from - start);
    }
    return { body: out.buffer, size: meta.size, mime: meta.mime, etag: `"${key.length}-${meta.size}"`, range: range ? { start, end } : undefined };
  },
  async del(env: Env, keys: string[]) {
    if (!keys.length) return;
    if (env.MEDIA) return void (await env.MEDIA.delete(keys));
    await env.DB.batch(keys.flatMap((k) => [env.DB.prepare("DELETE FROM blob_chunks WHERE key = ?").bind(k), env.DB.prepare("DELETE FROM blob_meta WHERE key = ?").bind(k)]));
  },
};

// ───────── helpers ─────────
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export function rid(n: number): string {
  const b = crypto.getRandomValues(new Uint8Array(n));
  let s = "";
  for (const x of b) s += B62[x % 62];
  return s;
}
/** Cloud voyage ids: "c" + 7 base62 (local share ids start with "vj_") */
export const isVoyageId = (s: string) => /^c[0-9A-Za-z]{7}$/.test(s);

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const BAD = ["fuck", "shit", "bitch", "cunt", "asshole", "dick", "bastard", "slut", "whore", "nigger", "faggot", "retard"];
export function cleanText(s: unknown, max: number): string {
  let t = String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
  for (const w of BAD) t = t.replace(new RegExp(`\\b${w}\\w*`, "gi"), (m) => m[0] + "*".repeat(m.length - 1));
  return t;
}
const cleanDevice = (s: unknown) => (typeof s === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(s) ? s : null);

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || allowed.includes("*");
  return {
    ...(ok ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Device-Id",
    "Access-Control-Max-Age": "86400",
  };
}
function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...extra } });
}
async function body<T = any>(req: Request, max = 64_000): Promise<T> {
  const len = Number(req.headers.get("Content-Length") ?? 0);
  if (len > max) throw new HttpError(413, "Body too large");
  const text = await req.text();
  if (text.length > max) throw new HttpError(413, "Body too large");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

async function rateLimit(env: Env, req: Request, bucket: keyof typeof RATE, device?: string | null) {
  const ip = req.headers.get("CF-Connecting-IP") ?? "local";
  const now = Date.now();
  for (const who of [ip, device].filter(Boolean) as string[]) {
    const k = `${bucket}:${who}`;
    const row = await env.DB.prepare("SELECT n, reset_at FROM rate WHERE k = ?").bind(k).first<{ n: number; reset_at: number }>();
    if (!row || row.reset_at < now) {
      await env.DB.prepare("INSERT OR REPLACE INTO rate (k, n, reset_at) VALUES (?, 1, ?)").bind(k, now + 60_000).run();
    } else if (row.n >= RATE[bucket]) {
      throw new HttpError(429, "Slow down — try again in a minute");
    } else {
      await env.DB.prepare("UPDATE rate SET n = n + 1 WHERE k = ?").bind(k).run();
    }
  }
}

type VoyageRow = {
  id: string; host_hash: string; title: string; mode: string; pack: string; drops_enabled: number; drops_max: number; created_at: number; updated_at: number;
  cover_key?: string | null; preview_key?: string | null; status?: string; removed_reason?: string | null;
  aftermovie_at?: number | null; aftermovie_key?: string | null;
  unlock_at?: number | null; unlock_notified?: number | null;
};
const sealed = (v: VoyageRow) => v.unlock_at != null && v.unlock_at > Date.now();
async function isHost(env: Env, req: Request, v: VoyageRow) {
  const auth = req.headers.get("Authorization") ?? "";
  const secret = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return !!secret && timingSafeEq(await sha256(secret), v.host_hash);
}
async function getVoyage(env: Env, id: string, allowRemoved = false): Promise<VoyageRow> {
  if (!isVoyageId(id)) throw new HttpError(404, "Not found");
  const v = await env.DB.prepare("SELECT * FROM voyages WHERE id = ?").bind(id).first<VoyageRow>();
  if (!v) throw new HttpError(404, "Not found");
  if (v.status === "removed" && !allowRemoved) throw new HttpError(410, "This voyage was removed for violating the Voyajes terms");
  return v;
}
async function assertNotBlocked(env: Env, v: VoyageRow, device: string | null) {
  if (!device) return;
  const b = await env.DB.prepare("SELECT 1 FROM blocks WHERE voyage_id = ? AND device_id = ?").bind(v.id, device).first();
  if (b) throw new HttpError(403, "The host has turned off posting from this device");
}
function rsvpClosed(v: VoyageRow): number | null {
  try {
    const d = invitationOf(JSON.parse(v.pack))?.rsvpDeadline;
    const t = d ? +new Date(d) : NaN;
    return isNaN(t) ? null : t;
  } catch { return null; }
}
const appUrl = (env: Env, req: Request) => (env.APP_URL || env.PUBLIC_BASE || new URL(req.url).origin).replace(/\/$/, "");
async function requireAdmin(env: Env, req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const got = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!env.ADMIN_SECRET) throw new HttpError(404, "Not found");
  if (!got || !timingSafeEq(await sha256(got), await sha256(env.ADMIN_SECRET))) throw new HttpError(403, "Admin secret required");
}
const TABLES = ["voyages", "media", "drops", "reactions", "comments", "hearts", "rsvps", "updates", "reports", "blocks", "votes", "notices", "push_subs"];
async function wipeMedia(env: Env, voyageId: string) {
  const keys = await env.DB.prepare("SELECT key FROM media WHERE voyage_id = ?").bind(voyageId).all<{ key: string }>();
  await store.del(env, keys.results.map((k) => k.key));
  await env.DB.prepare("DELETE FROM media WHERE voyage_id = ?").bind(voyageId).run();
}
const html = (body: string, status = 200, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...extra } });

/** Root-domain mode: everything that isn't API is the static app (see docs/domain.md). */
async function proxyApp(env: Env, req: Request, path: string): Promise<Response> {
  const origin = env.APP_ORIGIN!.replace(/\/$/, "");
  const r = await fetch(origin + path + new URL(req.url).search, { headers: { Accept: req.headers.get("Accept") ?? "*/*" } });
  if (r.status === 404 && !/\.[a-z0-9]+$/i.test(path)) return fetch(origin + "/index.html"); // SPA fallback
  return r;
}
async function requireHost(env: Env, req: Request, v: VoyageRow) {
  const auth = req.headers.get("Authorization") ?? "";
  const secret = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!secret || !timingSafeEq(await sha256(secret), v.host_hash)) throw new HttpError(403, "Host secret required");
}
const base = (env: Env, req: Request) => (env.PUBLIC_BASE || new URL(req.url).origin).replace(/\/$/, "");
const mediaUrl = (env: Env, req: Request, key: string) => `${base(env, req)}/media/${key}`;
const okMime = (m: string) => /^(image\/(jpeg|png|webp|gif|heic|heif|avif)|video\/(mp4|webm|quicktime))$/.test(m);

function validatePack(pack: any): string {
  if (!pack || pack.v !== 1 || typeof pack.share !== "object" || typeof pack.media !== "object") throw new HttpError(400, "Invalid pack");
  for (const e of Object.values(pack.media) as any[]) {
    if (e && typeof e.dataUrl === "string" && e.dataUrl.length > 400_000) throw new HttpError(413, "Upload media to R2 instead of embedding it");
  }
  const s = JSON.stringify(pack);
  if (s.length > LIMITS.packBytes) throw new HttpError(413, "Project too large");
  return s;
}

// ───────── routes ─────────
async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const m = req.method;
  const seg = p.split("/").filter(Boolean);

  if (p === "/health" || (p === "/" && !env.APP_ORIGIN)) return json({ ok: true, service: "voyajes-api", version: "1.1.0", push: !!env.VAPID_PRIVATE_JWK, media: env.MEDIA ? "r2" : "d1" });

  // app links (custom-domain + store readiness)
  if (p === "/.well-known/assetlinks.json") return json(assetLinks(env.ANDROID_PACKAGE, env.ANDROID_SHA256), 200, { "Cache-Control": "public, max-age=3600" });
  if (p === "/.well-known/apple-app-site-association" || p === "/apple-app-site-association")
    return json(appleAppSiteAssociation(env.APPLE_APP_IDS), 200, { "Cache-Control": "public, max-age=3600" });

  // share link with previews: crawlers get OG meta, humans go to the app
  if (seg[0] === "v" && seg[1] && m === "GET") {
    const v = await getVoyage(env, seg[1], true).catch(() => null);
    const human = !isCrawler(req.headers.get("User-Agent"));
    if (seg[2] === "og.jpg") {
      if (!v || v.status === "removed" || sealed(v)) return Response.redirect(`${appUrl(env, req)}/og-default.jpg`, 302);
      let key = v.cover_key ?? null;
      if (!key) {
        const u = firstImageUrl(JSON.parse(v.pack));
        const mm = u && /\/media\/(.+)$/.exec(u);
        key = mm ? decodeURIComponent(mm[1]) : null;
      }
      const obj = key ? await store.get(env, key) : null;
      if (!obj) return Response.redirect(`${appUrl(env, req)}/og-default.jpg`, 302);
      return new Response(obj.body, { headers: { "Content-Type": obj.mime, "Cache-Control": "public, max-age=300" } });
    }
    if (seg[2]) throw new HttpError(404, "Not found");
    const target = `${appUrl(env, req)}/v/${encodeURIComponent(seg[1])}${url.search}`;
    if (human) {
      if (env.APP_ORIGIN) return proxyApp(env, req, "/index.html");
      return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store" } });
    }
    if (!v) return html(`<!doctype html><title>Voyajes</title><meta property="og:title" content="Voyajes"><p>Not found</p>`, 404);
    if (v.status === "removed")
      return html(`<!doctype html><title>Removed · Voyajes</title><meta property="og:title" content="This voyage was removed"><meta property="og:description" content="It broke the Voyajes terms."><p>Removed</p>`, 410);
    const pack = JSON.parse(v.pack);
    const meta = previewMeta({ id: v.id, title: v.title, mode: v.mode, pack });
    const self = `${base(env, req)}/v/${v.id}`;
    return html(
      ogHtml({
        ...meta,
        url: self,
        appUrl: target,
        image: `${self}/og.jpg?v=${v.updated_at}`,
        video: v.preview_key ? mediaUrl(env, req, v.preview_key) : null,
        themeColor: "#0B0D12",
      }),
      200,
      { "Cache-Control": "public, max-age=60" },
    );
  }

  // terms/privacy on the API origin redirect to the app's pages
  if ((p === "/terms" || p === "/privacy") && !env.APP_ORIGIN) return Response.redirect(`${appUrl(env, req)}${p}`, 302);

  // owner admin (takedowns) — Authorization: Bearer $ADMIN_SECRET
  if (seg[0] === "admin") {
    await requireAdmin(env, req);
    if (seg[1] === "reports" && !seg[2] && m === "GET") {
      const status = url.searchParams.get("status") ?? "open";
      const r = await env.DB.prepare(
        "SELECT r.*, v.title AS voyage_title, v.status AS voyage_status FROM reports r LEFT JOIN voyages v ON v.id = r.voyage_id WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 200",
      ).bind(status).all<any>();
      return json({ reports: r.results });
    }
    if (seg[1] === "reports" && seg[2] && m === "POST") {
      const b = await body<{ status: string }>(req);
      if (!["open", "actioned", "dismissed"].includes(b.status)) throw new HttpError(400, "Bad status");
      await env.DB.prepare("UPDATE reports SET status = ? WHERE id = ?").bind(b.status, seg[2]).run();
      return json({ ok: true });
    }
    if (seg[1] === "voyages" && seg[2] && seg[3] === "takedown" && m === "POST") {
      const v = await getVoyage(env, seg[2], true);
      const b = await body<{ reason?: string }>(req).catch(() => ({}) as { reason?: string });
      await wipeMedia(env, v.id);
      const now = Date.now();
      await env.DB.batch([
        env.DB.prepare("UPDATE voyages SET status = 'removed', removed_reason = ?, removed_at = ?, pack = ?, cover_key = NULL, preview_key = NULL, updated_at = ? WHERE id = ?")
          .bind(cleanText(b.reason, 200) || "terms", now, JSON.stringify({ v: 1, share: { title: "Removed" }, media: {} }), now, v.id),
        env.DB.prepare("DELETE FROM comments WHERE voyage_id = ?").bind(v.id),
        env.DB.prepare("DELETE FROM drops WHERE voyage_id = ?").bind(v.id),
        env.DB.prepare("UPDATE reports SET status = 'actioned' WHERE voyage_id = ? AND status = 'open'").bind(v.id),
      ]);
      return json({ ok: true, id: v.id, status: "removed" });
    }
    if (seg[1] === "comments" && seg[2] && seg[3] === "takedown" && m === "POST") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(seg[2]),
        env.DB.prepare("UPDATE reports SET status = 'actioned' WHERE target_type = 'comment' AND target_id = ?").bind(seg[2]),
      ]);
      return json({ ok: true });
    }
    if (seg[1] === "drops" && seg[2] && seg[3] === "takedown" && m === "POST") {
      const d = await env.DB.prepare("SELECT media_key FROM drops WHERE id = ?").bind(seg[2]).first<{ media_key: string }>();
      if (!d) throw new HttpError(404, "Not found");
      await store.del(env, [d.media_key]);
      await env.DB.batch([
        env.DB.prepare("UPDATE drops SET status = 'rejected' WHERE id = ?").bind(seg[2]),
        env.DB.prepare("DELETE FROM media WHERE key = ?").bind(d.media_key),
        env.DB.prepare("UPDATE reports SET status = 'actioned' WHERE target_type = 'drop' AND target_id = ?").bind(seg[2]),
      ]);
      return json({ ok: true });
    }
    throw new HttpError(404, "Not found");
  }

  // media (public, immutable)
  if (seg[0] === "media" && m === "GET") {
    const key = decodeURIComponent(seg.slice(1).join("/"));
    const range = req.headers.get("Range");
    let r2range: { offset: number; length?: number } | undefined;
    const mm = range && /^bytes=(\d+)-(\d*)$/.exec(range);
    if (mm) r2range = mm[2] ? { offset: +mm[1], length: +mm[2] - +mm[1] + 1 } : { offset: +mm[1] };
    const obj = await store.get(env, key, r2range as { offset: number; length?: number } | undefined);
    if (!obj) throw new HttpError(404, "Not found");
    const h = new Headers();
    h.set("Content-Type", obj.mime);
    h.set("ETag", obj.etag);
    h.set("Cache-Control", "public, max-age=31536000, immutable");
    h.set("Accept-Ranges", "bytes");
    if (obj.range) {
      h.set("Content-Range", `bytes ${obj.range.start}-${obj.range.end}/${obj.size}`);
      h.set("Content-Length", String(obj.range.end - obj.range.start + 1));
      return new Response(obj.body, { status: 206, headers: h });
    }
    return new Response(obj.body, { headers: h });
  }

  // signed guest upload
  if (seg[0] === "upload" && seg[1] && m === "PUT") {
    const drop = await env.DB.prepare("SELECT * FROM drops WHERE id = ?").bind(seg[1]).first<any>();
    if (!drop || drop.status !== "signed") throw new HttpError(404, "Upload slot not found");
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig") ?? "";
    const want = await hmac(env.SIGNING_KEY || "dev-signing-key", `${drop.id}.${exp}.${drop.size}.${drop.mime}`);
    if (!timingSafeEq(sig, want) || !(exp > Date.now())) throw new HttpError(403, "Upload link expired or invalid");
    const ct = (req.headers.get("Content-Type") ?? "").split(";")[0];
    if (ct !== drop.mime) throw new HttpError(415, "Content-Type must match the signed type");
    const buf = await req.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > drop.size) throw new HttpError(413, "File larger than signed size");
    await store.put(env, drop.media_key, buf, drop.mime);
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("UPDATE drops SET status = 'pending', size = ? WHERE id = ?").bind(buf.byteLength, drop.id),
      env.DB.prepare("INSERT OR REPLACE INTO media (key, voyage_id, role, mime, size, created_at) VALUES (?, ?, 'drop', ?, ?, ?)").bind(drop.media_key, drop.voyage_id, drop.mime, buf.byteLength, now),
    ]);
    return json({ ok: true, key: drop.media_key, url: mediaUrl(env, req, drop.media_key) });
  }

  // v1.0 Web Push (payload-less; the service worker asks what's new)
  if (seg[0] === "push") {
    if (seg[1] === "key" && m === "GET") {
      const k = vapidPublicKey(env);
      return json({ publicKey: k, supported: !!k }, 200, { "Cache-Control": "public, max-age=300" });
    }
    if (seg[1] === "notices" && m === "POST") {
      const b = await body<{ endpoint: string }>(req);
      if (!okPushEndpoint(b.endpoint)) throw new HttpError(400, "Bad endpoint");
      const r = await env.DB.prepare(
        "SELECT n.id, n.voyage_id, n.kind, n.title, n.body, n.created_at FROM notices n JOIN push_subs s ON s.voyage_id = n.voyage_id AND s.endpoint_hash = ? WHERE n.created_at > ? ORDER BY n.created_at DESC LIMIT 5",
      ).bind(await sha256(b.endpoint), Date.now() - 2 * 86400_000).all<any>();
      return json({ notices: r.results.map((n) => ({ ...n, url: `${appUrl(env, req)}/${n.kind === "year" ? "year" : `v/${n.voyage_id}`}${n.kind === "aftermovie" ? "?aftermovie=1" : ""}` })) });
    }
    throw new HttpError(404, "Not found");
  }

  if (seg[0] !== "voyages") {
    if (env.APP_ORIGIN && (m === "GET" || m === "HEAD")) return proxyApp(env, req, p === "/" ? "/index.html" : url.pathname);
    throw new HttpError(404, "Not found");
  }

  // publish
  if (seg.length === 1 && m === "POST") {
    await rateLimit(env, req, "publish");
    const b = await body<{ title?: string; mode?: string; pack: any }>(req, LIMITS.packBytes + 10_000);
    const packStr = validatePack(b.pack);
    const id = "c" + rid(7);
    const secret = rid(32);
    const now = Date.now();
    await env.DB.prepare(
      "INSERT INTO voyages (id, host_hash, title, mode, pack, drops_enabled, drops_max, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)",
    )
      .bind(id, await sha256(secret), cleanText(b.title, 120), b.mode === "invitation" ? "invitation" : "voyage", packStr, LIMITS.dropsMaxDefault, now, now)
      .run();
    return json({ id, hostSecret: secret }, 201);
  }

  const id = seg[1];
  const v = await getVoyage(env, id);
  const sub = seg[2];

  if (!sub && m === "GET") {
    if (sealed(v) && !(await isHost(env, req, v)))
      return json({ id: v.id, title: v.title, mode: v.mode, pack: null, locked: true, unlockAt: v.unlock_at, dropsEnabled: false, updatedAt: v.updated_at }, 200, { "Cache-Control": "no-store" });
    return json(
      {
        id: v.id, title: v.title, mode: v.mode, pack: JSON.parse(v.pack), dropsEnabled: !!v.drops_enabled, updatedAt: v.updated_at,
        coverUrl: v.cover_key ? mediaUrl(env, req, v.cover_key) : null, previewUrl: v.preview_key ? mediaUrl(env, req, v.preview_key) : null,
        aftermovieAt: v.aftermovie_at ?? null,
        unlockAt: v.unlock_at ?? null,
        locked: false,
      },
      200,
      { "Cache-Control": sealed(v) || v.unlock_at ? "no-store" : "public, max-age=10" },
    );
  }
  if (!sub && m === "PATCH") {
    await requireHost(env, req, v);
    const b = await body<{ dropsEnabled?: boolean; dropsMax?: number; title?: string; coverKey?: string | null; previewKey?: string | null; unlockAt?: number | null }>(req);
    if (b.unlockAt !== undefined) {
      if (b.unlockAt !== null && !(Number.isFinite(b.unlockAt) && b.unlockAt > Date.now() && b.unlockAt < Date.now() + 50 * 365 * 86400_000)) throw new HttpError(400, "unlockAt must be a future time");
      await env.DB.prepare("UPDATE voyages SET unlock_at = ?, unlock_notified = NULL WHERE id = ?").bind(b.unlockAt === null ? null : Math.round(b.unlockAt), v.id).run();
    }
    const ownKey = async (k: string | null | undefined, prev: string | null | undefined) => {
      if (k === undefined) return prev ?? null;
      if (k === null) return null;
      const row = await env.DB.prepare("SELECT 1 FROM media WHERE key = ? AND voyage_id = ? AND role = 'host'").bind(k, v.id).first();
      if (!row) throw new HttpError(400, "Unknown media key");
      return k;
    };
    const coverKey = await ownKey(b.coverKey, v.cover_key);
    const previewKey = await ownKey(b.previewKey, v.preview_key);
    await env.DB.prepare("UPDATE voyages SET drops_enabled = ?, drops_max = ?, title = ?, cover_key = ?, preview_key = ?, updated_at = ? WHERE id = ?")
      .bind(
        b.dropsEnabled == null ? v.drops_enabled : b.dropsEnabled ? 1 : 0,
        b.dropsMax == null ? v.drops_max : Math.max(1, Math.min(50, Math.round(b.dropsMax))),
        b.title == null ? v.title : cleanText(b.title, 120),
        coverKey,
        previewKey,
        Date.now(),
        v.id,
      )
      .run();
    return json({ ok: true });
  }
  if (!sub && m === "DELETE") {
    await requireHost(env, req, v);
    await wipeMedia(env, v.id);
    await env.DB.batch(
      TABLES.map((t) =>
        env.DB.prepare(`DELETE FROM ${t} WHERE ${t === "voyages" ? "id" : "voyage_id"} = ?`).bind(v.id),
      ),
    );
    return json({ ok: true });
  }
  if (sub === "pack" && m === "PUT") {
    await requireHost(env, req, v);
    const b = await body<{ pack: any }>(req, LIMITS.packBytes + 10_000);
    const packStr = validatePack(b.pack);
    await env.DB.prepare("UPDATE voyages SET pack = ?, updated_at = ? WHERE id = ?").bind(packStr, Date.now(), v.id).run();
    return json({ ok: true });
  }
  if (sub === "media" && m === "POST") {
    await requireHost(env, req, v);
    const ct = (req.headers.get("Content-Type") ?? "").split(";")[0];
    if (!okMime(ct) && !/^audio\/(mpeg|mp4|wav|ogg|webm|aac)$/.test(ct)) throw new HttpError(415, "Unsupported media type");
    const buf = await req.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > LIMITS.hostMediaBytes) throw new HttpError(413, "File too large");
    const key = `v/${v.id}/host/${rid(10)}`;
    await store.put(env, key, buf, ct);
    await env.DB.prepare("INSERT INTO media (key, voyage_id, role, mime, size, created_at) VALUES (?, ?, 'host', ?, ?, ?)").bind(key, v.id, ct, buf.byteLength, Date.now()).run();
    return json({ key, url: mediaUrl(env, req, key) }, 201);
  }

  // guest drops
  if (sub === "drops" && !seg[3] && m === "POST") {
    const b = await body<{ deviceId: string; name?: string; mime: string; size: number; purpose?: string }>(req);
    const device = cleanDevice(b.deviceId);
    if (!device) throw new HttpError(400, "deviceId required");
    await rateLimit(env, req, "sign", device);
    await assertNotBlocked(env, v, device);
    // invitations: RSVP selfies and the live party camera are always open (host can block/reject)
    const rsvpPhoto = (b.purpose === "rsvp" || b.purpose === "live") && v.mode === "invitation";
    if (!v.drops_enabled && !rsvpPhoto) throw new HttpError(403, "The host hasn't opened photo drops");
    if (!okMime(b.mime)) throw new HttpError(415, "Photos and videos only");
    const cap = b.mime.startsWith("video/") ? (env.MEDIA ? LIMITS.dropVideoBytes : 30_000_000) : LIMITS.dropImageBytes;
    if (!(b.size > 0) || b.size > cap) throw new HttpError(413, `Max ${Math.round(cap / 1e6)} MB`);
    const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM drops WHERE voyage_id = ? AND device_id = ?").bind(v.id, device).first<{ n: number }>();
    if ((used?.n ?? 0) >= v.drops_max) throw new HttpError(429, `Up to ${v.drops_max} per guest`);
    const dropId = rid(12);
    const key = `v/${v.id}/drops/${dropId}`;
    const exp = Date.now() + 15 * 60_000;
    await env.DB.prepare("INSERT INTO drops (id, voyage_id, device_id, name, media_key, mime, size, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'signed', ?)")
      .bind(dropId, v.id, device, cleanText(b.name, LIMITS.nameChars) || null, key, b.mime, Math.round(b.size), Date.now())
      .run();
    const sig = await hmac(env.SIGNING_KEY || "dev-signing-key", `${dropId}.${exp}.${Math.round(b.size)}.${b.mime}`);
    return json({ dropId, key, uploadUrl: `${base(env, req)}/upload/${dropId}?exp=${exp}&sig=${sig}`, url: mediaUrl(env, req, key), expiresAt: exp }, 201);
  }
  if (sub === "drops" && seg[3] && m === "POST") {
    await requireHost(env, req, v);
    const b = await body<{ status: string }>(req);
    if (!["accepted", "rejected", "added", "pending"].includes(b.status)) throw new HttpError(400, "Bad status");
    const d = await env.DB.prepare("SELECT media_key FROM drops WHERE id = ? AND voyage_id = ?").bind(seg[3], v.id).first<{ media_key: string }>();
    if (!d) throw new HttpError(404, "Not found");
    await env.DB.prepare("UPDATE drops SET status = ? WHERE id = ?").bind(b.status, seg[3]).run();
    if (b.status === "rejected") {
      await store.del(env, [d.media_key]);
      await env.DB.prepare("DELETE FROM media WHERE key = ?").bind(d.media_key).run();
    }
    return json({ ok: true });
  }

  // host dashboard
  if (sub === "host" && m === "GET") {
    await requireHost(env, req, v);
    const [drops, rsvps, comments, reactions, hearts, reports, blocks, updates] = await Promise.all([
      env.DB.prepare("SELECT id, device_id, name, mime, size, status, media_key, created_at FROM drops WHERE voyage_id = ? AND status != 'signed' ORDER BY created_at DESC").bind(v.id).all<any>(),
      env.DB.prepare("SELECT device_id, name, answer, note, plus_ones, media_key, updated_at FROM rsvps WHERE voyage_id = ? ORDER BY updated_at DESC").bind(v.id).all<any>(),
      env.DB.prepare("SELECT id, device_id, name, body, hidden, created_at FROM comments WHERE voyage_id = ? ORDER BY created_at DESC LIMIT 200").bind(v.id).all<any>(),
      env.DB.prepare("SELECT emoji, count FROM reactions WHERE voyage_id = ?").bind(v.id).all<any>(),
      env.DB.prepare("SELECT clip, COUNT(*) AS n FROM hearts WHERE voyage_id = ? GROUP BY clip ORDER BY n DESC").bind(v.id).all<any>(),
      env.DB.prepare("SELECT id, target_type, target_id, reason, note, status, created_at FROM reports WHERE voyage_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 100").bind(v.id).all<any>(),
      env.DB.prepare("SELECT device_id, created_at FROM blocks WHERE voyage_id = ?").bind(v.id).all<any>(),
      env.DB.prepare("SELECT id, body, created_at FROM updates WHERE voyage_id = ? ORDER BY created_at DESC LIMIT 50").bind(v.id).all<any>(),
    ]);
    const yes = rsvps.results.filter((r) => r.answer === "yes");
    return json({
      id: v.id,
      dropsEnabled: !!v.drops_enabled,
      dropsMax: v.drops_max,
      drops: drops.results.map((d) => ({ ...d, url: mediaUrl(env, req, d.media_key) })),
      rsvps: rsvps.results.map((r) => ({ ...r, url: r.media_key ? mediaUrl(env, req, r.media_key) : undefined })),
      comments: comments.results.map((c) => ({ ...c, hidden: !!c.hidden })),
      reactions: Object.fromEntries(reactions.results.map((r) => [r.emoji, r.count])),
      hearts: Object.fromEntries(hearts.results.map((h) => [h.clip, h.n])),
      reports: reports.results,
      blocked: blocks.results.map((b) => b.device_id),
      updates: updates.results,
      guestCount: yes.reduce((n, r) => n + 1 + (r.plus_ones ?? 0), 0),
      coverUrl: v.cover_key ? mediaUrl(env, req, v.cover_key) : null,
    });
  }

  // guest social
  if (sub === "social" && m === "GET") {
    const device = cleanDevice(url.searchParams.get("deviceId"));
    const [reactions, comments, hearts, mine, attending, counts, myRsvp, updates, heads, blocked] = await Promise.all([
      env.DB.prepare("SELECT emoji, count FROM reactions WHERE voyage_id = ?").bind(v.id).all<any>(),
      env.DB.prepare("SELECT id, name, body, created_at FROM comments WHERE voyage_id = ? AND hidden = 0 ORDER BY created_at DESC LIMIT 50").bind(v.id).all<any>(),
      env.DB.prepare("SELECT clip, COUNT(*) AS n FROM hearts WHERE voyage_id = ? GROUP BY clip").bind(v.id).all<any>(),
      device ? env.DB.prepare("SELECT clip FROM hearts WHERE voyage_id = ? AND device_id = ?").bind(v.id, device).all<any>() : Promise.resolve({ results: [] as any[] }),
      env.DB.prepare("SELECT name FROM rsvps WHERE voyage_id = ? AND answer = 'yes' ORDER BY updated_at LIMIT 60").bind(v.id).all<any>(),
      env.DB.prepare("SELECT answer, COUNT(*) AS n FROM rsvps WHERE voyage_id = ? GROUP BY answer").bind(v.id).all<any>(),
      device ? env.DB.prepare("SELECT name, answer, note, plus_ones AS plusOnes FROM rsvps WHERE voyage_id = ? AND device_id = ?").bind(v.id, device).first<any>() : Promise.resolve(null),
      env.DB.prepare("SELECT id, body, created_at FROM updates WHERE voyage_id = ? ORDER BY created_at DESC LIMIT 10").bind(v.id).all<any>(),
      env.DB.prepare("SELECT COALESCE(SUM(1 + plus_ones), 0) AS n FROM rsvps WHERE voyage_id = ? AND answer = 'yes'").bind(v.id).first<{ n: number }>(),
      device ? env.DB.prepare("SELECT 1 FROM blocks WHERE voyage_id = ? AND device_id = ?").bind(v.id, device).first() : Promise.resolve(null),
    ]);
    const deadline = rsvpClosed(v);
    return json({
      reactions: Object.fromEntries(reactions.results.map((r) => [r.emoji, r.count])),
      comments: comments.results,
      hearts: Object.fromEntries(hearts.results.map((h) => [h.clip, h.n])),
      myHearts: mine.results.map((h) => h.clip),
      attending: attending.results.map((a) => a.name),
      rsvpCounts: Object.fromEntries(counts.results.map((c) => [c.answer, c.n])),
      myRsvp,
      dropsEnabled: !!v.drops_enabled,
      updates: updates.results,
      guestCount: heads?.n ?? 0,
      rsvpDeadline: deadline,
      rsvpClosed: deadline != null && Date.now() > deadline,
      blocked: !!blocked,
      aftermovieAt: v.aftermovie_at ?? null,
      eventEnd: eventEndOf(v.pack),
    });
  }
  if (sub === "reactions" && m === "POST") {
    const b = await body<{ emoji: string; deviceId?: string }>(req);
    await rateLimit(env, req, "write", cleanDevice(b.deviceId));
    if (!(EMOJIS as readonly string[]).includes(b.emoji)) throw new HttpError(400, "Unknown reaction");
    await env.DB.prepare("INSERT INTO reactions (voyage_id, emoji, count) VALUES (?, ?, 1) ON CONFLICT(voyage_id, emoji) DO UPDATE SET count = count + 1").bind(v.id, b.emoji).run();
    return json({ ok: true });
  }
  if (sub === "comments" && !seg[3] && m === "POST") {
    const b = await body<{ deviceId: string; name?: string; body: string }>(req);
    const device = cleanDevice(b.deviceId);
    if (!device) throw new HttpError(400, "deviceId required");
    await rateLimit(env, req, "write", device);
    await assertNotBlocked(env, v, device);
    const text = cleanText(b.body, LIMITS.commentChars);
    if (!text) throw new HttpError(400, "Empty comment");
    const cid = rid(10);
    const row = { id: cid, name: cleanText(b.name, LIMITS.nameChars) || null, body: text, created_at: Date.now() };
    await env.DB.prepare("INSERT INTO comments (id, voyage_id, device_id, name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(cid, v.id, device, row.name, row.body, row.created_at).run();
    return json(row, 201);
  }
  if (sub === "comments" && seg[3] && m === "DELETE") {
    await requireHost(env, req, v);
    await env.DB.prepare("DELETE FROM comments WHERE id = ? AND voyage_id = ?").bind(seg[3], v.id).run();
    return json({ ok: true });
  }
  if (sub === "comments" && seg[3] && m === "POST") {
    await requireHost(env, req, v);
    const b = await body<{ hidden: boolean }>(req);
    await env.DB.prepare("UPDATE comments SET hidden = ? WHERE id = ? AND voyage_id = ?").bind(b.hidden ? 1 : 0, seg[3], v.id).run();
    if (b.hidden) await env.DB.prepare("UPDATE reports SET status = 'actioned' WHERE voyage_id = ? AND target_type = 'comment' AND target_id = ?").bind(v.id, seg[3]).run();
    return json({ ok: true });
  }

  // moderation: guest reports (anyone), host blocks + resolves
  if (sub === "report" && m === "POST") {
    const b = await body<{ deviceId?: string; targetType: string; targetId?: string; reason: string; note?: string }>(req);
    const device = cleanDevice(b.deviceId);
    await rateLimit(env, req, "report", device);
    if (!["voyage", "comment", "drop", "clip"].includes(b.targetType)) throw new HttpError(400, "Bad target");
    if (!["spam", "nudity", "harassment", "violence", "hate", "other"].includes(b.reason)) throw new HttpError(400, "Bad reason");
    const targetId = b.targetType === "voyage" ? v.id : String(b.targetId ?? "").slice(0, 64);
    if (!targetId) throw new HttpError(400, "targetId required");
    const rid2 = rid(12);
    await env.DB.prepare("INSERT INTO reports (id, voyage_id, target_type, target_id, reason, note, device_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)")
      .bind(rid2, v.id, b.targetType, targetId, b.reason, cleanText(b.note, 500) || null, device, Date.now())
      .run();
    // three distinct reporters auto-hide a comment until the host or admin reviews it
    if (b.targetType === "comment") {
      const n = await env.DB.prepare("SELECT COUNT(DISTINCT COALESCE(device_id, id)) AS n FROM reports WHERE voyage_id = ? AND target_type = 'comment' AND target_id = ? AND status = 'open'").bind(v.id, targetId).first<{ n: number }>();
      if ((n?.n ?? 0) >= 3) await env.DB.prepare("UPDATE comments SET hidden = 1 WHERE id = ? AND voyage_id = ?").bind(targetId, v.id).run();
    }
    return json({ ok: true, id: rid2 }, 201);
  }
  if (sub === "reports" && seg[3] && m === "POST") {
    await requireHost(env, req, v);
    const b = await body<{ status: string }>(req);
    if (!["actioned", "dismissed"].includes(b.status)) throw new HttpError(400, "Bad status");
    await env.DB.prepare("UPDATE reports SET status = ? WHERE id = ? AND voyage_id = ?").bind(b.status, seg[3], v.id).run();
    return json({ ok: true });
  }
  if (sub === "blocks" && (m === "POST" || m === "DELETE")) {
    await requireHost(env, req, v);
    const b = await body<{ deviceId: string }>(req);
    const device = cleanDevice(b.deviceId);
    if (!device) throw new HttpError(400, "deviceId required");
    if (m === "DELETE") {
      await env.DB.prepare("DELETE FROM blocks WHERE voyage_id = ? AND device_id = ?").bind(v.id, device).run();
      return json({ ok: true, blocked: false });
    }
    const pending = await env.DB.prepare("SELECT media_key FROM drops WHERE voyage_id = ? AND device_id = ? AND status IN ('pending','signed')").bind(v.id, device).all<{ media_key: string }>();
    await store.del(env, pending.results.map((d) => d.media_key));
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO blocks (voyage_id, device_id, created_at) VALUES (?, ?, ?)").bind(v.id, device, Date.now()),
      env.DB.prepare("UPDATE comments SET hidden = 1 WHERE voyage_id = ? AND device_id = ?").bind(v.id, device),
      env.DB.prepare("UPDATE drops SET status = 'rejected' WHERE voyage_id = ? AND device_id = ? AND status IN ('pending','signed')").bind(v.id, device),
    ]);
    return json({ ok: true, blocked: true });
  }

  // host updates broadcast
  if (sub === "updates" && !seg[3] && m === "POST") {
    await requireHost(env, req, v);
    const b = await body<{ body: string }>(req);
    const text = cleanText(b.body, LIMITS.updateChars);
    if (!text) throw new HttpError(400, "Empty update");
    const row = { id: rid(10), body: text, created_at: Date.now() };
    await env.DB.prepare("INSERT INTO updates (id, voyage_id, body, created_at) VALUES (?, ?, ?, ?)").bind(row.id, v.id, row.body, row.created_at).run();
    await notify(env, v.id, "update", `Update · ${v.title || "Voyajes"}`, text, rid(10));
    return json(row, 201);
  }
  if (sub === "updates" && seg[3] && m === "DELETE") {
    await requireHost(env, req, v);
    await env.DB.prepare("DELETE FROM updates WHERE id = ? AND voyage_id = ?").bind(seg[3], v.id).run();
    return json({ ok: true });
  }

  // calendar file
  if (sub === "event.ics" && m === "GET") {
    const inv = invitationOf(JSON.parse(v.pack));
    const ics = inv ? buildIcs({ uid: v.id, title: inv.eventName || v.title || "Event", inv, url: `${base(env, req)}/v/${v.id}` }) : null;
    if (!ics) throw new HttpError(404, "No event time set");
    return new Response(ics, {
      headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${v.id}.ics"`, "Cache-Control": "public, max-age=60" },
    });
  }

  // ── v1.0 After-Movie ──
  // live wall: every guest drop (newest first) with crowd votes — feeds the party camera, TV mode and the cut
  if (sub === "live" && m === "GET") {
    const device = cleanDevice(url.searchParams.get("deviceId"));
    const [drops, votes, mine] = await Promise.all([
      env.DB.prepare("SELECT id, name, mime, media_key, status, created_at FROM drops WHERE voyage_id = ? AND status IN ('pending','accepted','added') ORDER BY created_at DESC LIMIT 300").bind(v.id).all<any>(),
      env.DB.prepare("SELECT drop_id, COUNT(*) AS n FROM votes WHERE voyage_id = ? GROUP BY drop_id").bind(v.id).all<{ drop_id: string; n: number }>(),
      device ? env.DB.prepare("SELECT drop_id FROM votes WHERE voyage_id = ? AND device_id = ?").bind(v.id, device).all<{ drop_id: string }>() : Promise.resolve({ results: [] as { drop_id: string }[] }),
    ]);
    const vc = Object.fromEntries(votes.results.map((x) => [x.drop_id, x.n]));
    const my = new Set(mine.results.map((x) => x.drop_id));
    return json(
      {
        title: v.title,
        drops: drops.results.map((d) => ({ id: d.id, name: d.name, mime: d.mime, url: mediaUrl(env, req, d.media_key), createdAt: d.created_at, votes: vc[d.id] ?? 0, mine: my.has(d.id) })),
        aftermovieAt: v.aftermovie_at ?? null,
        aftermovieUrl: v.aftermovie_key ? mediaUrl(env, req, v.aftermovie_key) : null,
        eventEnd: eventEndOf(v.pack),
      },
      200,
      { "Cache-Control": "no-store" },
    );
  }
  if (sub === "votes" && m === "POST") {
    const b = await body<{ deviceId: string; dropId: string }>(req);
    const device = cleanDevice(b.deviceId);
    if (!device || typeof b.dropId !== "string") throw new HttpError(400, "deviceId + dropId required");
    await rateLimit(env, req, "write", device);
    await assertNotBlocked(env, v, device);
    const d = await env.DB.prepare("SELECT 1 FROM drops WHERE id = ? AND voyage_id = ? AND status IN ('pending','accepted','added')").bind(b.dropId, v.id).first();
    if (!d) throw new HttpError(404, "Not found");
    const has = await env.DB.prepare("SELECT 1 FROM votes WHERE voyage_id = ? AND drop_id = ? AND device_id = ?").bind(v.id, b.dropId, device).first();
    if (has) await env.DB.prepare("DELETE FROM votes WHERE voyage_id = ? AND drop_id = ? AND device_id = ?").bind(v.id, b.dropId, device).run();
    else await env.DB.prepare("INSERT INTO votes (voyage_id, drop_id, device_id, created_at) VALUES (?, ?, ?, ?)").bind(v.id, b.dropId, device, Date.now()).run();
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM votes WHERE voyage_id = ? AND drop_id = ?").bind(v.id, b.dropId).first<{ n: number }>();
    return json({ voted: !has, votes: n?.n ?? 0 });
  }
  // host releases the after-movie now (the cron does it automatically when the event ends)
  if (sub === "aftermovie" && m === "POST") {
    await requireHost(env, req, v);
    const b = await body<{ key?: string | null; renotify?: boolean }>(req).catch(() => ({}) as { key?: string | null; renotify?: boolean });
    let key = v.aftermovie_key ?? null;
    if (b.key !== undefined) {
      if (b.key !== null && !(await env.DB.prepare("SELECT 1 FROM media WHERE key = ? AND voyage_id = ? AND role = 'host'").bind(b.key, v.id).first())) throw new HttpError(400, "Unknown media key");
      key = b.key;
    }
    const first = !v.aftermovie_at;
    const at = v.aftermovie_at ?? Date.now();
    await env.DB.prepare("UPDATE voyages SET aftermovie_at = ?, aftermovie_key = ?, updated_at = ? WHERE id = ?").bind(at, key, Date.now(), v.id).run();
    const pushed = first || b.renotify ? await notify(env, v.id, "aftermovie", AFTERMOVIE_TITLE, `${v.title || "The party"} — made from everyone's photos. Tap to watch.`, rid(10)) : 0;
    return json({ ok: true, aftermovieAt: at, aftermovieUrl: key ? mediaUrl(env, req, key) : null, notified: first || !!b.renotify, pushed });
  }
  if (sub === "notices" && m === "GET") {
    const since = Number(url.searchParams.get("since") ?? 0) || 0;
    const r = await env.DB.prepare("SELECT id, kind, title, body, created_at FROM notices WHERE voyage_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 20").bind(v.id, since).all<any>();
    return json({ notices: r.results }, 200, { "Cache-Control": "no-store" });
  }
  if (sub === "push" && (m === "POST" || m === "DELETE")) {
    const b = await body<{ deviceId?: string; endpoint: string }>(req);
    if (!okPushEndpoint(b.endpoint)) throw new HttpError(400, "Unsupported push endpoint");
    await rateLimit(env, req, "write", cleanDevice(b.deviceId));
    const h = await sha256(b.endpoint);
    if (m === "DELETE") {
      await env.DB.prepare("DELETE FROM push_subs WHERE endpoint_hash = ? AND voyage_id = ?").bind(h, v.id).run();
      return json({ ok: true, subscribed: false });
    }
    await env.DB.prepare("INSERT OR REPLACE INTO push_subs (endpoint_hash, voyage_id, endpoint, device_id, created_at) VALUES (?, ?, ?, ?, ?)").bind(h, v.id, b.endpoint, cleanDevice(b.deviceId), Date.now()).run();
    return json({ ok: true, subscribed: true }, 201);
  }

  if (sub === "hearts" && m === "POST") {
    const b = await body<{ deviceId: string; clip: number }>(req);
    const device = cleanDevice(b.deviceId);
    if (!device || !Number.isInteger(b.clip) || b.clip < 0 || b.clip > 500) throw new HttpError(400, "deviceId + clip required");
    await rateLimit(env, req, "write", device);
    const has = await env.DB.prepare("SELECT 1 FROM hearts WHERE voyage_id = ? AND clip = ? AND device_id = ?").bind(v.id, b.clip, device).first();
    if (has) await env.DB.prepare("DELETE FROM hearts WHERE voyage_id = ? AND clip = ? AND device_id = ?").bind(v.id, b.clip, device).run();
    else await env.DB.prepare("INSERT INTO hearts (voyage_id, clip, device_id) VALUES (?, ?, ?)").bind(v.id, b.clip, device).run();
    return json({ hearted: !has });
  }
  if (sub === "rsvp" && m === "POST") {
    const b = await body<{ deviceId: string; name: string; answer: string; note?: string; mediaKey?: string; plusOnes?: number }>(req);
    const device = cleanDevice(b.deviceId);
    if (!device) throw new HttpError(400, "deviceId required");
    await rateLimit(env, req, "write", device);
    if (v.mode !== "invitation") throw new HttpError(400, "RSVP is for invitations");
    await assertNotBlocked(env, v, device);
    const deadline = rsvpClosed(v);
    if (deadline != null && Date.now() > deadline) throw new HttpError(409, "RSVPs are closed");
    const invMax = invitationOf(JSON.parse(v.pack))?.plusOnesMax;
    const maxPlus = typeof invMax === "number" ? Math.max(0, Math.min(LIMITS.plusOnesMax, invMax)) : LIMITS.plusOnesMax;
    const plusOnes = b.answer === "yes" ? Math.max(0, Math.min(maxPlus, Math.round(Number(b.plusOnes) || 0))) : 0;
    if (!["yes", "no", "maybe"].includes(b.answer)) throw new HttpError(400, "answer must be yes | no | maybe");
    const name = cleanText(b.name, LIMITS.nameChars);
    if (!name) throw new HttpError(400, "Name required");
    let mediaKey: string | null = null;
    if (b.mediaKey) {
      const own = await env.DB.prepare("SELECT media_key FROM drops WHERE voyage_id = ? AND device_id = ? AND media_key = ? AND status != 'signed'").bind(v.id, device, b.mediaKey).first();
      if (own) mediaKey = b.mediaKey;
    }
    await env.DB.prepare(
      "INSERT INTO rsvps (voyage_id, device_id, name, answer, note, media_key, plus_ones, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(voyage_id, device_id) DO UPDATE SET name = excluded.name, answer = excluded.answer, note = excluded.note, media_key = COALESCE(excluded.media_key, rsvps.media_key), plus_ones = excluded.plus_ones, updated_at = excluded.updated_at",
    )
      .bind(v.id, device, name, b.answer, cleanText(b.note, LIMITS.noteChars) || null, mediaKey, plusOnes, Date.now())
      .run();
    return json({ ok: true, plusOnes });
  }
  throw new HttpError(404, "Not found");
}

export default {
  /** cron: release after-movies once events end */
  async scheduled(_c: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(releaseDue(env, () => rid(10)));
    ctx.waitUntil(openCapsules(env, () => rid(10)));
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const c = cors(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c });
    try {
      const res = await route(req, env);
      const h = new Headers(res.headers);
      for (const [k, v] of Object.entries(c)) h.set(k, v);
      // public media is readable from any page (canvas export, Remix fetch)
      if (new URL(req.url).pathname.startsWith("/media/")) h.set("Access-Control-Allow-Origin", "*");
      return new Response(res.body, { status: res.status, headers: h });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return json({ error: e instanceof HttpError ? e.message : "Server error" }, status, c);
    }
  },
};
