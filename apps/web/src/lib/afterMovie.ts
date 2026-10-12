/**
 * v1.0 "After-Movie": guest drops + crowd votes → a themed cut that plays with the host's look.
 * The cut is a pack (no server render), so it is instant, free and always up to date.
 */
import type { LiveDrop } from "./api";
import type { PortablePackV1 } from "./portableShare";

export const CUT_MAX = 16;

/** Crowd shapes the cut: most-voted first in, then the freshest; story order stays chronological. */
export function rankCut(drops: LiveDrop[], max = CUT_MAX): { drop: LiveDrop; hero: boolean }[] {
  const ranked = [...drops].sort((a, b) => b.votes - a.votes || b.createdAt - a.createdAt);
  const pick = ranked.slice(0, max);
  const topVotes = pick[0]?.votes ?? 0;
  const heroCut = topVotes > 0 ? Math.max(1, Math.ceil(pick.filter((d) => d.votes > 0).length / 3)) : 0;
  const heroes = new Set(ranked.filter((d) => d.votes > 0).slice(0, heroCut).map((d) => d.id));
  return pick.sort((a, b) => a.createdAt - b.createdAt).map((drop) => ({ drop, hero: heroes.has(drop.id) }));
}

/** Host pack (theme, music, grade, motion) + ranked guest drops → after-movie pack. */
export function buildAfterMoviePack(host: PortablePackV1, drops: LiveDrop[], max = CUT_MAX): PortablePackV1 | null {
  const cut = rankCut(drops, max);
  if (!cut.length) return null;
  const pb = host.share.playback;
  const media: PortablePackV1["media"] = {};
  const clips = cut.map(({ drop, hero }) => {
    const id = `am-${drop.id}`;
    const isVideo = drop.mime.startsWith("video/");
    media[id] = { dataUrl: "", url: drop.url, kind: isVideo ? "video" : "image" };
    return {
      id,
      fileName: drop.name ? `by ${drop.name}` : "guest",
      mimeType: drop.mime,
      kind: (isVideo ? "video" : "image") as "video" | "image",
      durationSec: hero ? 3.6 : 2.2, // crowd favourites hold longer
      mute: true,
      transitionOut: null,
    };
  });
  const name = host.share.invitation?.eventName || pb?.invitation?.eventName || host.share.title || "The party";
  const title = `${name} · After-Movie`;
  const credits = [...new Set(cut.map((c) => c.drop.name).filter(Boolean))].slice(0, 8).join(" · ");
  return {
    v: 1,
    media,
    share: {
      ...host.share,
      id: `${host.share.id}-am`,
      title,
      mode: "voyage",
      clipCount: clips.length,
      durationSec: clips.reduce((n, c) => n + c.durationSec, 0),
      posterClipId: clips.find((_, i) => cut[i].hero)?.id ?? clips[0].id,
      posterMime: "image/jpeg",
      passwordProtected: false,
      playback: pb
        ? {
            ...pb,
            clips,
            captionText: credits ? `Shot by ${credits}` : pb.captionText,
            textOverlays: [],
            invitation: undefined,
          }
        : null,
    },
  };
}
