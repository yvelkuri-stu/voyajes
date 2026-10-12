/**
 * v1.0 "After-Movie": crowd-voted guest drops → after-movie released to guests,
 * notified by Web Push (payload-less VAPID, so no payload crypto) with an in-app inbox fallback.
 */
import { invitationOf } from "./onelink";

export type PushEnv = { DB: D1Database; VAPID_PRIVATE_JWK?: string; CONTACT_EMAIL?: string };

const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

/** Hosts we will POST to (prevents the worker being used as an open relay). */
export function okPushEndpoint(e: unknown): e is string {
  if (typeof e !== "string" || e.length > 1000) return false;
  try {
    const u = new URL(e);
    return u.protocol === "https:" && /(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/.test(u.hostname);
  } catch {
    return false;
  }
}

export function vapidPublicKey(env: PushEnv): string | null {
  if (!env.VAPID_PRIVATE_JWK) return null;
  try {
    const j = JSON.parse(env.VAPID_PRIVATE_JWK);
    const x = unb64u(j.x), y = unb64u(j.y);
    const out = new Uint8Array(65);
    out[0] = 4; out.set(x, 1); out.set(y, 33);
    return b64u(out);
  } catch {
    return null;
  }
}

async function vapidAuth(env: PushEnv, endpoint: string): Promise<string> {
  const j = JSON.parse(env.VAPID_PRIVATE_JWK!);
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", d: j.d, x: j.x, y: j.y }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = (o: unknown) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const data = `${enc({ typ: "JWT", alg: "ES256" })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: `mailto:${env.CONTACT_EMAIL || "hello@voyajes.app"}` })}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(data)));
  return `vapid t=${data}.${b64u(sig)}, k=${vapidPublicKey(env)}`;
}

/** Record an in-app notice and wake every push subscriber of the voyage. Returns pushes sent. */
export async function notify(env: PushEnv, voyageId: string, kind: string, title: string, body: string, id: string): Promise<number> {
  await env.DB.prepare("INSERT INTO notices (id, voyage_id, kind, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, voyageId, kind, title, body, Date.now()).run();
  if (!env.VAPID_PRIVATE_JWK) return 0;
  const subs = await env.DB.prepare("SELECT endpoint_hash, endpoint FROM push_subs WHERE voyage_id = ? LIMIT 300").bind(voyageId).all<{ endpoint_hash: string; endpoint: string }>();
  let sent = 0;
  await Promise.all(
    subs.results.map(async (s) => {
      try {
        const r = await fetch(s.endpoint, { method: "POST", headers: { Authorization: await vapidAuth(env, s.endpoint), TTL: "86400", Urgency: "normal", "Content-Length": "0" } });
        if (r.status === 404 || r.status === 410) await env.DB.prepare("DELETE FROM push_subs WHERE endpoint_hash = ?").bind(s.endpoint_hash).run();
        else if (r.ok) sent++;
      } catch {
        /* best effort */
      }
    }),
  );
  return sent;
}

/** When the party is over: explicit end, else start + 6h (people keep dropping photos after). */
export function eventEndOf(packStr: string): number | null {
  try {
    const inv = invitationOf(JSON.parse(packStr));
    const end = inv?.eventEnd ? +new Date(inv.eventEnd) : NaN;
    if (!isNaN(end)) return end;
    const start = inv?.eventStart ? +new Date(inv.eventStart) : NaN;
    return isNaN(start) ? null : start + 6 * 3600_000;
  } catch {
    return null;
  }
}

export const AFTERMOVIE_TITLE = "Your after-movie is ready 🎬";

/** Cron: release after-movies for events that have ended and have guest drops. */
export async function releaseDue(env: PushEnv, rid: () => string): Promise<string[]> {
  const rows = await env.DB.prepare(
    "SELECT id, title, pack FROM voyages v WHERE mode = 'invitation' AND aftermovie_at IS NULL AND status = 'live' AND EXISTS (SELECT 1 FROM drops d WHERE d.voyage_id = v.id AND d.status IN ('pending','accepted','added')) LIMIT 200",
  ).all<{ id: string; title: string; pack: string }>();
  const out: string[] = [];
  const now = Date.now();
  for (const r of rows.results) {
    const end = eventEndOf(r.pack);
    if (end == null || end > now) continue;
    await env.DB.prepare("UPDATE voyages SET aftermovie_at = ? WHERE id = ? AND aftermovie_at IS NULL").bind(now, r.id).run();
    await notify(env, r.id, "aftermovie", AFTERMOVIE_TITLE, `${r.title || "The party"} — made from everyone's photos. Tap to watch.`, rid());
    out.push(r.id);
  }
  return out;
}
