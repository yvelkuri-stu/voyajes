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
  dropsMaxDefault: 10,
};
const RATE = { write: 60, sign: 20, publish: 10 }; // per IP per minute

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

type VoyageRow = { id: string; host_hash: string; title: string; mode: string; pack: string; drops_enabled: number; drops_max: number; created_at: number; updated_at: number };
async function getVoyage(env: Env, id: string): Promise<VoyageRow> {
  if (!isVoyageId(id)) throw new HttpError(404, "Not found");
  const v = await env.DB.prepare("SELECT * FROM voyages WHERE id = ?").bind(id).first<VoyageRow>();
  if (!v) throw new HttpError(404, "Not found");
  return v;
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

  if (p === "/" || p === "/health") return json({ ok: true, service: "voyajes-api", version: "0.7.0", media: env.MEDIA ? "r2" : "d1" });

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

  if (seg[0] !== "voyages") throw new HttpError(404, "Not found");

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
    return json(
      { id: v.id, title: v.title, mode: v.mode, pack: JSON.parse(v.pack), dropsEnabled: !!v.drops_enabled, updatedAt: v.updated_at },
      200,
      { "Cache-Control": "public, max-age=10" },
    );
  }
  if (!sub && m === "PATCH") {
    await requireHost(env, req, v);
    const b = await body<{ dropsEnabled?: boolean; dropsMax?: number; title?: string }>(req);
    await env.DB.prepare("UPDATE voyages SET drops_enabled = ?, drops_max = ?, title = ?, updated_at = ? WHERE id = ?")
      .bind(
        b.dropsEnabled == null ? v.drops_enabled : b.dropsEnabled ? 1 : 0,
        b.dropsMax == null ? v.drops_max : Math.max(1, Math.min(50, Math.round(b.dropsMax))),
        b.title == null ? v.title : cleanText(b.title, 120),
        Date.now(),
        v.id,
      )
      .run();
    return json({ ok: true });
  }
  if (!sub && m === "DELETE") {
    await requireHost(env, req, v);
    const keys = await env.DB.prepare("SELECT key FROM media WHERE voyage_id = ?").bind(v.id).all<{ key: string }>();
    await store.del(env, keys.results.map((k) => k.key));
    await env.DB.batch(
      ["voyages", "media", "drops", "reactions", "comments", "hearts", "rsvps"].map((t) =>
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
    const rsvpPhoto = b.purpose === "rsvp" && v.mode === "invitation";
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
    const [drops, rsvps, comments, reactions, hearts] = await Promise.all([
      env.DB.prepare("SELECT id, name, mime, size, status, media_key, created_at FROM drops WHERE voyage_id = ? AND status != 'signed' ORDER BY created_at DESC").bind(v.id).all<any>(),
      env.DB.prepare("SELECT name, answer, note, media_key, updated_at FROM rsvps WHERE voyage_id = ? ORDER BY updated_at DESC").bind(v.id).all<any>(),
      env.DB.prepare("SELECT id, name, body, created_at FROM comments WHERE voyage_id = ? ORDER BY created_at DESC LIMIT 200").bind(v.id).all<any>(),
      env.DB.prepare("SELECT emoji, count FROM reactions WHERE voyage_id = ?").bind(v.id).all<any>(),
      env.DB.prepare("SELECT clip, COUNT(*) AS n FROM hearts WHERE voyage_id = ? GROUP BY clip ORDER BY n DESC").bind(v.id).all<any>(),
    ]);
    return json({
      id: v.id,
      dropsEnabled: !!v.drops_enabled,
      dropsMax: v.drops_max,
      drops: drops.results.map((d) => ({ ...d, url: mediaUrl(env, req, d.media_key) })),
      rsvps: rsvps.results.map((r) => ({ ...r, url: r.media_key ? mediaUrl(env, req, r.media_key) : undefined })),
      comments: comments.results,
      reactions: Object.fromEntries(reactions.results.map((r) => [r.emoji, r.count])),
      hearts: Object.fromEntries(hearts.results.map((h) => [h.clip, h.n])),
    });
  }

  // guest social
  if (sub === "social" && m === "GET") {
    const device = cleanDevice(url.searchParams.get("deviceId"));
    const [reactions, comments, hearts, mine, attending, counts, myRsvp] = await Promise.all([
      env.DB.prepare("SELECT emoji, count FROM reactions WHERE voyage_id = ?").bind(v.id).all<any>(),
      env.DB.prepare("SELECT id, name, body, created_at FROM comments WHERE voyage_id = ? ORDER BY created_at DESC LIMIT 50").bind(v.id).all<any>(),
      env.DB.prepare("SELECT clip, COUNT(*) AS n FROM hearts WHERE voyage_id = ? GROUP BY clip").bind(v.id).all<any>(),
      device ? env.DB.prepare("SELECT clip FROM hearts WHERE voyage_id = ? AND device_id = ?").bind(v.id, device).all<any>() : Promise.resolve({ results: [] as any[] }),
      env.DB.prepare("SELECT name FROM rsvps WHERE voyage_id = ? AND answer = 'yes' ORDER BY updated_at LIMIT 60").bind(v.id).all<any>(),
      env.DB.prepare("SELECT answer, COUNT(*) AS n FROM rsvps WHERE voyage_id = ? GROUP BY answer").bind(v.id).all<any>(),
      device ? env.DB.prepare("SELECT name, answer, note FROM rsvps WHERE voyage_id = ? AND device_id = ?").bind(v.id, device).first<any>() : Promise.resolve(null),
    ]);
    return json({
      reactions: Object.fromEntries(reactions.results.map((r) => [r.emoji, r.count])),
      comments: comments.results,
      hearts: Object.fromEntries(hearts.results.map((h) => [h.clip, h.n])),
      myHearts: mine.results.map((h) => h.clip),
      attending: attending.results.map((a) => a.name),
      rsvpCounts: Object.fromEntries(counts.results.map((c) => [c.answer, c.n])),
      myRsvp,
      dropsEnabled: !!v.drops_enabled,
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
    const b = await body<{ deviceId: string; name: string; answer: string; note?: string; mediaKey?: string }>(req);
    const device = cleanDevice(b.deviceId);
    if (!device) throw new HttpError(400, "deviceId required");
    await rateLimit(env, req, "write", device);
    if (v.mode !== "invitation") throw new HttpError(400, "RSVP is for invitations");
    if (!["yes", "no", "maybe"].includes(b.answer)) throw new HttpError(400, "answer must be yes | no | maybe");
    const name = cleanText(b.name, LIMITS.nameChars);
    if (!name) throw new HttpError(400, "Name required");
    let mediaKey: string | null = null;
    if (b.mediaKey) {
      const own = await env.DB.prepare("SELECT media_key FROM drops WHERE voyage_id = ? AND device_id = ? AND media_key = ? AND status != 'signed'").bind(v.id, device, b.mediaKey).first();
      if (own) mediaKey = b.mediaKey;
    }
    await env.DB.prepare(
      "INSERT INTO rsvps (voyage_id, device_id, name, answer, note, media_key, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(voyage_id, device_id) DO UPDATE SET name = excluded.name, answer = excluded.answer, note = excluded.note, media_key = COALESCE(excluded.media_key, rsvps.media_key), updated_at = excluded.updated_at",
    )
      .bind(v.id, device, name, b.answer, cleanText(b.note, LIMITS.noteChars) || null, mediaKey, Date.now())
      .run();
    return json({ ok: true });
  }
  throw new HttpError(404, "Not found");
}

export default {
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
