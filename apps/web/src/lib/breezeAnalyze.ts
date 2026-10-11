import { parseExif } from "@voyajes/core";

export type MediaFacts = {
  takenAt?: number;
  lat?: number;
  lon?: number;
  hash?: string;
  sharpness?: number;
};

/** EXIF + perceptual hash (dHash 9×8) + sharpness (Laplacian variance @128px). Cheap, best-effort. */
export async function analyzeMedia(blob: Blob, kind: "image" | "video"): Promise<MediaFacts> {
  if (kind !== "image") return {};
  const facts: MediaFacts = {};
  try {
    if (/jpe?g/i.test(blob.type) || blob.type === "") {
      const head = await blob.slice(0, 256 * 1024).arrayBuffer();
      Object.assign(facts, parseExif(head));
    }
  } catch {
    /* no exif */
  }
  try {
    const bmp = await createImageBitmap(blob, { resizeWidth: 128, resizeHeight: 128, resizeQuality: "low" });
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const x = c.getContext("2d", { willReadFrequently: true })!;
    x.drawImage(bmp, 0, 0, 128, 128);
    bmp.close?.();
    const d = x.getImageData(0, 0, 128, 128).data;
    const g = new Float32Array(128 * 128);
    for (let i = 0; i < g.length; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    let s = 0, s2 = 0, n = 0;
    for (let y = 1; y < 127; y++)
      for (let xx = 1; xx < 127; xx++) {
        const i = y * 128 + xx;
        const l = g[i - 1] + g[i + 1] + g[i - 128] + g[i + 128] - 4 * g[i];
        s += l;
        s2 += l * l;
        n++;
      }
    facts.sharpness = Math.round((s2 / n - (s / n) ** 2) * 10) / 10;
    // dHash from a 9×8 average-downsample of the 128px gray image
    let bits = "";
    const cell = (cx: number, cy: number) => {
      let t = 0, k = 0;
      for (let y = Math.floor((cy * 128) / 8); y < Math.floor(((cy + 1) * 128) / 8); y++)
        for (let xx = Math.floor((cx * 128) / 9); xx < Math.floor(((cx + 1) * 128) / 9); xx++) {
          t += g[y * 128 + xx];
          k++;
        }
      return t / k;
    };
    for (let y = 0; y < 8; y++) for (let xx = 0; xx < 8; xx++) bits += cell(xx, y) > cell(xx + 1, y) ? "1" : "0";
    let hex = "";
    for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    facts.hash = hex;
  } catch {
    /* undecodable */
  }
  return facts;
}
