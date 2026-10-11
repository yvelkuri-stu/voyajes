import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import { cleanText, isVoyageId } from "../src/index";

let mf: Miniflare;
const ORIGIN = "https://yvelkuri-stu.github.io";
const call = async (path: string, init: RequestInit & { json?: unknown } = {}) => {
  const headers: Record<string, string> = { Origin: ORIGIN, ...(init.headers as Record<string, string>) };
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
    bindings: { ALLOWED_ORIGINS: ORIGIN, SIGNING_KEY: "test-key" },
  });
  const db = await mf.getD1Database("DB");
  const sql = ["0001_init.sql", "0002_blob_fallback.sql"].map((f) => readFileSync(`migrations/${f}`, "utf8")).join(";\n").replace(/--.*$/gm, "");
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
