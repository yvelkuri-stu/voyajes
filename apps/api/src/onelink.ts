// v0.9 "One Link": link previews (OG/Twitter), calendar files, app-link manifests.
// Pure helpers so they are unit-testable and reusable by v1.0 recap pages.

import { fmtWhen, type Invitation } from "../../../packages/core/src/event";
export { buildIcs, eventTimes, fmtWhen, googleCalendarUrl, mapsUrl, type Invitation } from "../../../packages/core/src/event";

export const BOT_UA =
  /(WhatsApp|facebookexternalhit|Facebot|Twitterbot|TelegramBot|Slackbot|Slack-ImgProxy|Discordbot|LinkedInBot|Pinterest|Applebot|SkypeUriPreview|redditbot|Embedly|vkShare|Iframely|Google-PageRenderer|Googlebot|bingbot|Mastodon|Signal|Snapchat|Viber|Line\/|kakaotalk|bot\b|crawler|spider|preview)/i;
export const isCrawler = (ua: string | null | undefined) => !!ua && BOT_UA.test(ua);

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function invitationOf(pack: any): Invitation | null {
  const inv = pack?.share?.playback?.invitation ?? pack?.share?.invitation ?? null;
  return inv && typeof inv === "object" ? inv : null;
}
export function clipCount(pack: any): number {
  const c = pack?.share?.playback?.clips;
  return Array.isArray(c) ? c.length : 0;
}
/** First usable still image in the pack (fallback og:image when no cover was uploaded). */
export function firstImageUrl(pack: any): string | null {
  const clips: any[] = pack?.share?.playback?.clips ?? [];
  for (const c of clips) {
    const m = pack?.media?.[c?.id];
    if (m?.url && m.kind === "image" && /^https?:/.test(m.url)) return m.url;
  }
  for (const m of Object.values(pack?.media ?? {}) as any[]) if (m?.url && m.kind === "image" && /^https?:/.test(m.url)) return m.url;
  return null;
}

export function previewMeta(v: { id: string; title: string; mode: string; pack: any }) {
  const inv = v.mode === "invitation" ? invitationOf(v.pack) : null;
  const title = (inv?.eventName || v.title || v.pack?.share?.title || "A Voyajes story").slice(0, 90);
  const parts: string[] = [];
  if (inv) {
    if (inv.hostName) parts.push(`${inv.hostName} invites you`);
    const w = fmtWhen(inv);
    if (w) parts.push(w);
    if (inv.eventWhere) parts.push(inv.eventWhere);
    if (!parts.length) parts.push("You're invited — tap to RSVP");
  } else {
    const n = clipCount(v.pack);
    parts.push(n ? `A ${n}-moment story · tap to watch` : "Tap to watch");
  }
  return { title, description: parts.join(" · ").slice(0, 200) };
}

export function ogHtml(o: {
  title: string; description: string; url: string; appUrl: string; image: string; video?: string | null; themeColor?: string; siteName?: string;
}): string {
  const t = esc(o.title), d = esc(o.description);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${t} · Voyajes</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${d}">
<link rel="canonical" href="${esc(o.url)}">
<meta property="og:type" content="${o.video ? "video.other" : "website"}">
<meta property="og:site_name" content="${esc(o.siteName ?? "Voyajes")}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${esc(o.url)}">
<meta property="og:image" content="${esc(o.image)}">
<meta property="og:image:secure_url" content="${esc(o.image)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${t}">
${o.video ? `<meta property="og:video" content="${esc(o.video)}">
<meta property="og:video:secure_url" content="${esc(o.video)}">
<meta property="og:video:type" content="video/mp4">
<meta property="og:video:width" content="720">
<meta property="og:video:height" content="1280">
` : ""}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${esc(o.image)}">
<meta name="theme-color" content="${esc(o.themeColor ?? "#0B0D12")}">
<meta http-equiv="refresh" content="0;url=${esc(o.appUrl)}">
</head><body style="background:#0B0D12;color:#fff;font-family:system-ui;text-align:center;padding:3rem 1rem">
<h1>${t}</h1><p>${d}</p><p><a style="color:#9ef" href="${esc(o.appUrl)}">Open in Voyajes →</a></p>
<script>location.replace(${JSON.stringify(o.appUrl)})</script>
</body></html>`;
}

export function assetLinks(pkg?: string, fingerprints?: string) {
  if (!pkg || !fingerprints) return [];
  return [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: fingerprints.split(",").map((s) => s.trim()).filter(Boolean) },
  }];
}
export function appleAppSiteAssociation(appIds?: string) {
  const ids = (appIds ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    applinks: { details: ids.length ? [{ appIDs: ids, components: [{ "/": "/v/*" }, { "/": "/i/*" }] }] : [] },
    webcredentials: { apps: ids },
  };
}
