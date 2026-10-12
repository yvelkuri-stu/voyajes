import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import { cleanText, isVoyageId } from "../src/index";

let mf: Miniflare;
let ipOverride = "";
const ORIGIN = "https://yvelkuri-stu.github.io";
const call = async (path: string, init: RequestInit & { json?: unknown } = {}) => {
  const headers: Record<string, string> = { Origin: ORIGIN, ...(ipOverride ? { "CF-Connecting-IP": ipOverride } : {}), ...(init.headers as Record<string, string>) };
  let bodyInit = init.body;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyInit = JSON.stringify(init.json);
  }
  const res = await mf.dispatchFetch(`http://api.test${path}`, { ...init, headers, body: bodyInit as any });
  const text = await res.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch { /* binary */ }
  return { status: res.status, data, headers: res.headers };
};
const pack = (title = "Goa") => ({ v: 1, share: { id: "vj_x", title, mode: "voyage", playback: { clips: [{ id: "c1", kind: "image" }] } }, media: {} });
const DEV = "device_abcdefgh1";

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: "dist/worker.js",
    compatibilityDate: "2025-01-01",
    d1Databases: ["DB"],
    ...(process.env.MEDIA_MODE === "d1" ? {} : { r2Buckets: ["MEDIA"] }),
    bindings: { ALLOWED_ORIGINS: ORIGIN, SIGNING_KEY: "test-key", ADMIN_SECRET: "admin-test-secret", APP_URL: "https://app.test/voyajes", ANDROID_PACKAGE: "app.voyajes.twa", ANDROID_SHA256: "AA:BB", APPLE_APP_IDS: "TEAM.app.voyajes" },
  });
  const db = await mf.getD1Database("DB");
  const sql = ["0001_init.sql", "0002_blob_fallback.sql", "0003_one_link.sql"].map((f) => readFileSync(`migrations/${f}`, "utf8")).join(";\n").replace(/--.*$/gm, "");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.prepare(stmt).run();
});
afterAll(async () => { await mf?.dispose(); });

describe("helpers", () => {
  it("filters profanity and caps length", () => {
    expect(cleanText("what the fuck", 100)).toBe("what the f***");
    expect(cleanText("x".repeat(500), 10)).toHaveLength(10);
    expect(isVoyageId("cAbC1234")).toBe(true);
    expect(isVoyageId("vj_abc")).toBe(false);
  });
});

describe(`voyage lifecycle (media in ${process.env.MEDIA_MODE === "d1" ? "D1 fallback" : "R2"})`, () => {
  let id = "", secret = "";
  it("publishes → short id + host secret; CORS for github.io", async () => {
    const r = await call("/voyages", { method: "POST", json: { title: "Goa", mode: "invitation", pack: pack() } });
    expect(r.status).toBe(201);
    expect(isVoyageId(r.data.id)).toBe(true);
    expect(r.data.hostSecret).toHaveLength(32);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    id = r.data.id; secret = r.data.hostSecret;
    const pre = await mf.dispatchFetch("http://api.test/voyages", { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
    expect(pre.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
  it("host uploads media to R2 and updates the pack; guests read it", async () => {
    const up = await call(`/voyages/${id}/media`, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "image/jpeg" }, body: new Uint8Array([255, 216, 255, 1, 2, 3]) });
    expect(up.status).toBe(201);
    const p2 = pack(); (p2.media as any).c1 = { url: up.data.url, kind: "image" };
    expect((await call(`/voyages/${id}/pack`, { method: "PUT", headers: { Authorization: `Bearer ${secret}` }, json: { pack: p2 } })).status).toBe(200);
    const g = await call(`/voyages/${id}`);
    expect(g.data.pack.media.c1.url).toBe(up.data.url);
    const media = await mf.dispatchFetch(up.data.url.replace(/^https?:\/\/[^/]+/, "http://api.test"));
    expect(media.headers.get("Content-Type")).toBe("image/jpeg");
    expect([...new Uint8Array(await media.arrayBuffer())]).toEqual([255, 216, 255, 1, 2, 3]);
    const part = await mf.dispatchFetch(up.data.url.replace(/^https?:\/\/[^/]+/, "http://api.test"), { headers: { Range: "bytes=2-4" } });
    expect(part.status).toBe(206);
    expect([...new Uint8Array(await part.arrayBuffer())]).toEqual([255, 1, 2]);
  });
  it("stores multi-chunk media and serves ranges across chunk boundaries", async () => {
    const big = new Uint8Array(2_100_000).map((_, i) => i % 251);
    const up = await call(`/voyages/${id}/media`, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "video/mp4" }, body: big });
    expect(up.status).toBe(201);
    const u = up.data.url.replace(/^https?:\/\/[^/]+/, "http://api.test");
    const all = new Uint8Array(await (await mf.dispatchFetch(u)).arrayBuffer());
    expect(all.length).toBe(big.length);
    expect(all[1_999_999]).toBe(big[1_999_999]);
    const part = await mf.dispatchFetch(u, { headers: { Range: "bytes=899990-900009" } });
    expect([...new Uint8Array(await part.arrayBuffer())]).toEqual([...big.subarray(899990, 900010)]);
  });
  it("rejects host actions without the secret", async () => {
    expect((await call(`/voyages/${id}/pack`, { method: "PUT", json: { pack: pack() } })).status).toBe(403);
    expect((await call(`/voyages/${id}/host`, { headers: { Authorization: "Bearer nope" } })).status).toBe(403);
  });
  it("guest drops: closed → open → signed upload → host queue → accept", async () => {
    const closed = await call(`/voyages/${id}/drops`, { method: "POST", json: { deviceId: DEV, mime: "image/png", size: 10 } });
    expect(closed.status).toBe(403);
    await call(`/voyages/${id}`, { method: "PATCH", headers: { Authorization: `Bearer ${secret}` }, json: { dropsEnabled: true, dropsMax: 2 } });
    expect((await call(`/voyages/${id}/drops`, { method: "POST", json: { deviceId: DEV, mime: "application/pdf", size: 10 } })).status).toBe(415);
    expect((await call(`/voyages/${id}/drops`, { method: "POST", json: { deviceId: DEV, mime: "image/png", size: 99_000_000 } })).status).toBe(413);
    const s = await call(`/voyages/${id}/drops`, { method: "POST", json: { deviceId: DEV, name: "Asha", mime: "image/png", size: 8 } });
    expect(s.status).toBe(201);
    const path = s.data.uploadUrl.replace(/^https?:\/\/[^/]+/, "");
    expect((await call(path.replace(/sig=[^&]+/, "sig=bad"), { method: "PUT", headers: { "Content-Type": "image/png" }, body: new Uint8Array(8) })).status).toBe(403);
    expect((await call(path, { method: "PUT", headers: { "Content-Type": "image/png" }, body: new Uint8Array(20) })).status).toBe(413);
    const put = await call(path, { method: "PUT", headers: { "Content-Type": "image/png" }, body: new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]) });
    expect(put.status).toBe(200);
    const host = await call(`/voyages/${id}/host`, { headers: { Authorization: `Bearer ${secret}` } });
    expect(host.data.drops).toHaveLength(1);
    expect(host.data.drops[0]).toMatchObject({ name: "Asha", status: "pending" });
    expect((await call(`/voyages/${id}/drops/${s.data.dropId}`, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, json: { status: "accepted" } })).status).toBe(200);
    await call(`/voyages/${id}/drops`, { method: "POST", json: { deviceId: DEV, mime: "image/png", size: 8 } });
    expect((await call(`/voyages/${id}/drops`, { method: "POST", json: { deviceId: DEV, mime: "image/png", size: 8 } })).status).toBe(429);
  });
  it("reactions, comments (filtered), hearts toggle, host delete comment", async () => {
    expect((await call(`/voyages/${id}/reactions`, { method: "POST", json: { emoji: "🔥", deviceId: DEV } })).status).toBe(200);
    await call(`/voyages/${id}/reactions`, { method: "POST", json: { emoji: "🔥", deviceId: DEV } });
    expect((await call(`/voyages/${id}/reactions`, { method: "POST", json: { emoji: "💩" } })).status).toBe(400);
    const c = await call(`/voyages/${id}/comments`, { method: "POST", json: { deviceId: DEV, name: "Asha", body: "so shit hot" } });
    expect(c.data.body).toBe("so s*** hot");
    expect((await call(`/voyages/${id}/hearts`, { method: "POST", json: { deviceId: DEV, clip: 1 } })).data.hearted).toBe(true);
    let s = await call(`/voyages/${id}/social?deviceId=${DEV}`);
    expect(s.data.reactions["🔥"]).toBe(2);
    expect(s.data.hearts["1"]).toBe(1);
    expect(s.data.myHearts).toEqual([1]);
    expect((await call(`/voyages/${id}/hearts`, { method: "POST", json: { deviceId: DEV, clip: 1 } })).data.hearted).toBe(false);
    await call(`/voyages/${id}/comments/${c.data.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${secret}` } });
    s = await call(`/voyages/${id}/social?deviceId=${DEV}`);
    expect(s.data.comments).toHaveLength(0);
  });
  it("RSVP upserts per device; host sees guest list; guests see attending names", async () => {
    expect((await call(`/voyages/${id}/rsvp`, { method: "POST", json: { deviceId: DEV, name: "Asha", answer: "maybe" } })).status).toBe(200);
    await call(`/voyages/${id}/rsvp`, { method: "POST", json: { deviceId: DEV, name: "Asha K", answer: "yes", note: "can't wait" } });
    await call(`/voyages/${id}/rsvp`, { method: "POST", json: { deviceId: "device_zzzzzzzz2", name: "Ben", answer: "no" } });
    expect((await call(`/voyages/${id}/rsvp`, { method: "POST", json: { deviceId: DEV, name: "x", answer: "lol" } })).status).toBe(400);
    const s = await call(`/voyages/${id}/social?deviceId=${DEV}`);
    expect(s.data.attending).toEqual(["Asha K"]);
    expect(s.data.rsvpCounts).toEqual({ yes: 1, no: 1 });
    expect(s.data.myRsvp.answer).toBe("yes");
    const h = await call(`/voyages/${id}/host`, { headers: { Authorization: `Bearer ${secret}` } });
    expect(h.data.rsvps.map((r: any) => r.name).sort()).toEqual(["Asha K", "Ben"]);
  });
  it("rate-limits bursts", async () => {
    let last = 0;
    for (let i = 0; i < 70; i++) last = (await call(`/voyages/${id}/reactions`, { method: "POST", json: { emoji: "👏", deviceId: "device_rate0001" } })).status;
    expect(last).toBe(429);
  });
  it("host delete removes everything", async () => {
    expect((await call(`/voyages/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${secret}` } })).status).toBe(200);
    expect((await call(`/voyages/${id}`)).status).toBe(404);
  });
});

describe("v0.9 One Link", () => {
  const WA = "WhatsApp/2.23.20.0 A";
  const H = (s: string) => ({ Authorization: `Bearer ${s}` });
  let id = "", secret = "";
  beforeAll(() => { ipOverride = "10.9.0.1"; });
  const invPack = (inv: Record<string, unknown>) => ({
    v: 1,
    share: { id: "vj_y", title: "Asha's 30th", mode: "invitation", playback: { clips: [{ id: "c1", kind: "image" }], invitation: inv } },
    media: {},
  });
  it("publishes an invitation with event times, cover and deadline", async () => {
    const inv = { hostName: "Asha", eventName: "Asha's 30th", eventWhere: "Rooftop, Bandra", eventStart: "2030-03-14T19:30:00+05:30", eventEnd: "2030-03-14T23:30:00+05:30", plusOnesMax: 2, rsvpDeadline: "2030-03-10T23:59:00+05:30" };
    const r = await call("/voyages", { method: "POST", json: { title: "Asha's 30th", mode: "invitation", pack: invPack(inv) } });
    id = r.data.id; secret = r.data.hostSecret;
    const up = await call(`/voyages/${id}/media`, { method: "POST", headers: { ...H(secret), "Content-Type": "image/jpeg" }, body: new Uint8Array([255, 216, 255, 9, 9]) });
    expect((await call(`/voyages/${id}`, { method: "PATCH", headers: H(secret), json: { coverKey: up.data.key } })).status).toBe(200);
    expect((await call(`/voyages/${id}`, { method: "PATCH", headers: H(secret), json: { coverKey: "v/other/host/x" } })).status).toBe(400);
  });
  it("serves OG meta to WhatsApp and redirects humans to the app", async () => {
    const bot = await call(`/v/${id}`, { headers: { "User-Agent": WA } });
    expect(bot.status).toBe(200);
    expect(bot.headers.get("Content-Type")).toMatch(/text\/html/);
    expect(bot.data).toContain(`<meta property="og:title" content="Asha&#39;s 30th">`);
    expect(bot.data).toContain("Asha invites you");
    expect(bot.data).toContain("Thu, Mar 14 · 7:30 PM");
    expect(bot.data).toMatch(new RegExp(`og:image" content="http://api.test/v/${id}/og.jpg`));
    expect(bot.data).toContain('name="twitter:card" content="summary_large_image"');
    const img = await mf.dispatchFetch(`http://api.test/v/${id}/og.jpg`, { headers: { "User-Agent": WA } });
    expect(img.headers.get("Content-Type")).toBe("image/jpeg");
    expect([...new Uint8Array(await img.arrayBuffer())]).toEqual([255, 216, 255, 9, 9]);
    const human = await mf.dispatchFetch(`http://api.test/v/${id}?r=1`, { headers: { "User-Agent": "Mozilla/5.0 (iPhone) Safari" }, redirect: "manual" });
    expect(human.status).toBe(302);
    expect(human.headers.get("Location")).toBe(`https://app.test/voyajes/v/${id}?r=1`);
  });
  it("builds a valid .ics", async () => {
    const r = await call(`/voyages/${id}/event.ics`);
    expect(r.headers.get("Content-Type")).toMatch(/text\/calendar/);
    expect(r.data).toContain("BEGIN:VEVENT");
    expect(r.data).toContain("DTSTART:20300314T140000Z");
    expect(r.data).toContain("DTEND:20300314T180000Z");
    expect(r.data).toContain("SUMMARY:Asha's 30th");
    expect(r.data).toContain("LOCATION:Rooftop\\, Bandra");
    expect(r.data.split("\r\n").every((l: string) => l.length <= 75)).toBe(true);
  });
  it("RSVP +1s are capped by the host and counted; host broadcasts updates", async () => {
    const r = await call(`/voyages/${id}/rsvp`, { method: "POST", json: { deviceId: "device_plus_1", name: "Ravi", answer: "yes", plusOnes: 5 } });
    expect(r.data.plusOnes).toBe(2);
    await call(`/voyages/${id}/rsvp`, { method: "POST", json: { deviceId: "device_plus_2", name: "Mei", answer: "yes" } });
    const u = await call(`/voyages/${id}/updates`, { method: "POST", headers: H(secret), json: { body: "Parking is in the back lot" } });
    expect(u.status).toBe(201);
    expect((await call(`/voyages/${id}/updates`, { method: "POST", json: { body: "spoof" } })).status).toBe(403);
    const s = await call(`/voyages/${id}/social?deviceId=device_plus_1`);
    expect(s.data.guestCount).toBe(4);
    expect(s.data.myRsvp.plusOnes).toBe(2);
    expect(s.data.updates[0].body).toBe("Parking is in the back lot");
    expect(s.data.rsvpClosed).toBe(false);
  });
  it("closes RSVP after the deadline", async () => {
    const r = await call("/voyages", { method: "POST", json: { title: "Past", mode: "invitation", pack: invPack({ eventName: "Past", rsvpDeadline: "2020-01-01T00:00:00Z" }) } });
    const x = await call(`/voyages/${r.data.id}/rsvp`, { method: "POST", json: { deviceId: "device_late_1", name: "Late", answer: "yes" } });
    expect(x.status).toBe(409);
    expect((await call(`/voyages/${r.data.id}/social`)).data.rsvpClosed).toBe(true);
  });
  it("report → host hides + blocks device; blocked device can't post", async () => {
    const c = await call(`/voyages/${id}/comments`, { method: "POST", json: { deviceId: "device_troll_1", name: "Troll", body: "buy followers now" } });
    const rep = await call(`/voyages/${id}/report`, { method: "POST", json: { deviceId: "device_plus_1", targetType: "comment", targetId: c.data.id, reason: "spam" } });
    expect(rep.status).toBe(201);
    expect((await call(`/voyages/${id}/report`, { method: "POST", json: { targetType: "comment", targetId: c.data.id, reason: "nope" } })).status).toBe(400);
    const host = await call(`/voyages/${id}/host`, { headers: H(secret) });
    expect(host.data.reports[0]).toMatchObject({ target_type: "comment", target_id: c.data.id, reason: "spam" });
    const troll = host.data.comments.find((x: any) => x.id === c.data.id);
    expect(troll.device_id).toBe("device_troll_1");
    expect((await call(`/voyages/${id}/blocks`, { method: "POST", headers: H(secret), json: { deviceId: troll.device_id } })).data.blocked).toBe(true);
    const s = await call(`/voyages/${id}/social?deviceId=device_troll_1`);
    expect(s.data.comments.find((x: any) => x.id === c.data.id)).toBeUndefined();
    expect(s.data.blocked).toBe(true);
    expect((await call(`/voyages/${id}/comments`, { method: "POST", json: { deviceId: "device_troll_1", body: "again" } })).status).toBe(403);
    expect((await call(`/voyages/${id}/blocks`, { method: "DELETE", headers: H(secret), json: { deviceId: "device_troll_1" } })).data.blocked).toBe(false);
  });
  it("three reporters auto-hide a comment", async () => {
    const c = await call(`/voyages/${id}/comments`, { method: "POST", json: { deviceId: "device_mean_01", body: "mean thing" } });
    for (const d of ["device_rep_001", "device_rep_002", "device_rep_003"])
      await call(`/voyages/${id}/report`, { method: "POST", json: { deviceId: d, targetType: "comment", targetId: c.data.id, reason: "harassment" } });
    const s = await call(`/voyages/${id}/social`);
    expect(s.data.comments.find((x: any) => x.id === c.data.id)).toBeUndefined();
  });
  it("admin takedown needs the secret and removes the voyage + media", async () => {
    expect((await call(`/admin/reports`)).status).toBe(403);
    expect((await call(`/admin/reports`, { headers: H("wrong") })).status).toBe(403);
    const list = await call(`/admin/reports`, { headers: H("admin-test-secret") });
    expect(list.data.reports.length).toBeGreaterThan(0);
    const r = await call("/voyages", { method: "POST", json: { title: "Bad", mode: "voyage", pack: pack("Bad") } });
    const up = await call(`/voyages/${r.data.id}/media`, { method: "POST", headers: { ...H(r.data.hostSecret), "Content-Type": "image/jpeg" }, body: new Uint8Array([255, 216, 1]) });
    await call(`/voyages/${r.data.id}/report`, { method: "POST", json: { targetType: "voyage", reason: "nudity" } });
    const t = await call(`/admin/voyages/${r.data.id}/takedown`, { method: "POST", headers: H("admin-test-secret"), json: { reason: "nudity report" } });
    expect(t.data.status).toBe("removed");
    expect((await call(`/voyages/${r.data.id}`)).status).toBe(410);
    expect((await call(`/v/${r.data.id}`, { headers: { "User-Agent": WA } })).status).toBe(410);
    expect((await mf.dispatchFetch(up.data.url.replace(/^https?:\/\/[^/]+/, "http://api.test"))).status).toBe(404);
  });
  it("serves app-link manifests", async () => {
    const a = await call("/.well-known/assetlinks.json");
    expect(a.data[0].target).toMatchObject({ package_name: "app.voyajes.twa", sha256_cert_fingerprints: ["AA:BB"] });
    const i = await call("/.well-known/apple-app-site-association");
    expect(i.data.applinks.details[0].appIDs).toEqual(["TEAM.app.voyajes"]);
    expect((await call("/health")).data.version).toBe("0.9.0");
  });
});
