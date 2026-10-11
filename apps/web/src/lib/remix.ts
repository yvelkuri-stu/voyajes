import { defaultDraft, putBlob, saveDraft, clearAllBlobs, type DraftState } from "./draftStore";
import type { PortablePackV1 } from "./portableShare";

/**
 * "Make your version": fork a published voyage into this device's draft.
 * Media is fetched from the cloud (R2) URLs (or the link's embedded data) into IndexedDB.
 */
export async function forkPackToDraft(pack: PortablePackV1, onProgress?: (m: string) => void): Promise<void> {
  const pb = pack.share.playback;
  if (!pb) throw new Error("Nothing to remix");
  await clearAllBlobs();
  const clips = [];
  let i = 0;
  for (const c of pb.clips) {
    i++;
    onProgress?.(`Copying ${i}/${pb.clips.length}…`);
    const e = pack.media[c.id];
    if (c.libraryId) {
      clips.push({ ...c, placeholder: false });
      continue;
    }
    if (!e) continue;
    const blob = await (await fetch(e.url || e.dataUrl)).blob();
    await putBlob(c.id, blob);
    clips.push({ ...c, kind: e.kind === "video" && !e.videoAsStill ? c.kind : ("image" as const), mimeType: blob.type || c.mimeType, placeholder: false });
  }
  const base = defaultDraft(pb.themeId);
  const inv = pack.share.invitation ?? pb.invitation ?? {};
  const draft: DraftState = {
    ...base,
    title: `${pack.share.title} (my version)`,
    mode: pack.share.mode,
    aspect: pb.aspect,
    themeId: pb.themeId,
    audioTrackRef: pb.audioTrackRef,
    beatSync: pb.beatSync,
    ducking: pb.ducking,
    textStyle: pb.textStyle,
    textTransition: pb.textTransition,
    captionStyle: pb.captionStyle,
    captionText: pb.captionText,
    textOverlays: pb.textOverlays,
    transitionOverride: pb.transitionOverride,
    watermark: pb.watermark,
    clips,
    grade: pb.grade,
    defaultAnimation: pb.defaultAnimation,
    transitionSpec: pb.transitionSpec,
    audioClips: pb.audioClips?.filter((a) => !a.ref.startsWith("custom:")),
    autoDuck: pb.autoDuck,
    ...inv,
    shareId: undefined,
    updatedAt: new Date().toISOString(),
  };
  saveDraft(draft);
}
