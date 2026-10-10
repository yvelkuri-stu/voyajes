/**
 * Timeline audio: decode cache, waveform peaks, synced preview playback and
 * export scheduling. Gains follow core `audioEnvelope` (volume · fades · ducking)
 * so preview, WebM export and CLI sound the same.
 */
import { audioEnvelope, type AudioClip } from "@voyajes/core";

let sharedCtx: AudioContext | null = null;
function ctxCtor(): typeof AudioContext | undefined {
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}
export function previewContext(): AudioContext | null {
  const AC = ctxCtor();
  if (!AC) return null;
  if (!sharedCtx) sharedCtx = new AC();
  return sharedCtx;
}

const rawCache = new Map<string, Promise<ArrayBuffer>>();
const bufCache = new WeakMap<BaseAudioContext, Map<string, Promise<AudioBuffer>>>();

function fetchRaw(url: string): Promise<ArrayBuffer> {
  let p = rawCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Audio fetch failed (${r.status})`);
      return r.arrayBuffer();
    });
    p.catch(() => rawCache.delete(url));
    rawCache.set(url, p);
  }
  return p;
}

export function decodeFor(ctx: BaseAudioContext, url: string): Promise<AudioBuffer> {
  let m = bufCache.get(ctx);
  if (!m) {
    m = new Map();
    bufCache.set(ctx, m);
  }
  let p = m.get(url);
  if (!p) {
    p = fetchRaw(url).then((raw) => ctx.decodeAudioData(raw.slice(0)));
    p.catch(() => m!.delete(url));
    m.set(url, p);
  }
  return p;
}

const peakCache = new Map<string, Promise<{ peaks: Float32Array; duration: number }>>();
/** Normalised peaks (0–1) at `perSec` buckets per source second. */
export function waveformPeaks(url: string, perSec = 40): Promise<{ peaks: Float32Array; duration: number }> {
  const key = `${url}|${perSec}`;
  let p = peakCache.get(key);
  if (!p) {
    const ctx = previewContext();
    if (!ctx) return Promise.reject(new Error("no audio"));
    p = decodeFor(ctx, url).then((buf) => {
      const n = Math.max(1, Math.ceil(buf.duration * perSec));
      const peaks = new Float32Array(n);
      const ch = buf.getChannelData(0);
      const step = Math.max(1, Math.floor(ch.length / n));
      let max = 0.0001;
      for (let i = 0; i < n; i++) {
        let m = 0;
        const s = i * step;
        for (let j = 0; j < step; j += 8) {
          const v = Math.abs(ch[s + j] ?? 0);
          if (v > m) m = v;
        }
        peaks[i] = m;
        if (m > max) max = m;
      }
      for (let i = 0; i < n; i++) peaks[i] = peaks[i] / max;
      return { peaks, duration: buf.duration };
    });
    p.catch(() => peakCache.delete(key));
    peakCache.set(key, p);
  }
  return p;
}

export type ResolvedAudioClip = AudioClip & { url?: string };

/**
 * Schedule clips on `ctx` starting at timeline time `fromSec` (ctx time `when`).
 * Returns a stop() handle.
 */
export async function scheduleAudio(
  ctx: BaseAudioContext,
  dest: AudioNode,
  clips: ResolvedAudioClip[],
  fromSec: number,
  ducks: [number, number][],
  duckLevel: number,
  when?: number,
): Promise<() => void> {
  const sources: AudioBufferSourceNode[] = [];
  const t0 = when ?? ctx.currentTime + 0.05;
  await Promise.all(
    clips.map(async (c) => {
      if (!c.url) return;
      const end = c.at + c.durationSec;
      if (end <= fromSec) return;
      let buf: AudioBuffer;
      try {
        buf = await decodeFor(ctx, c.url);
      } catch {
        return;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const loop = c.loop !== false;
      src.loop = loop;
      const gain = ctx.createGain();
      const env = audioEnvelope(c, ducks, duckLevel);
      const startTl = Math.max(fromSec, c.at);
      const ctxAt = (tl: number) => t0 + (tl - fromSec);
      // envelope
      const g0 = envAt(env, startTl);
      gain.gain.setValueAtTime(g0, ctxAt(startTl));
      for (const p of env) if (p.t > startTl) gain.gain.linearRampToValueAtTime(p.g, ctxAt(p.t));
      src.connect(gain);
      gain.connect(dest);
      const offsetSrc = (c.inSec ?? 0) + (startTl - c.at);
      const off = loop ? offsetSrc % Math.max(0.01, buf.duration) : offsetSrc;
      if (!loop && off >= buf.duration) return;
      src.start(ctxAt(startTl), off);
      src.stop(ctxAt(end));
      sources.push(src);
    }),
  );
  return () => {
    for (const s of sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      try {
        s.disconnect();
      } catch {
        /* ignore */
      }
    }
  };
}

function envAt(env: { t: number; g: number }[], t: number) {
  if (!env.length) return 1;
  if (t <= env[0].t) return env[0].g;
  for (let i = 1; i < env.length; i++) {
    if (t <= env[i].t) {
      const a = env[i - 1];
      const b = env[i];
      return a.g + (b.g - a.g) * ((t - a.t) / Math.max(1e-6, b.t - a.t));
    }
  }
  return env[env.length - 1].g;
}

/** Synced preview playback for the Create timeline. */
export class TimelineAudioPlayer {
  private stopFn: (() => void) | null = null;
  private token = 0;
  async play(clips: ResolvedAudioClip[], fromSec: number, ducks: [number, number][], duckLevel: number) {
    this.stop();
    const ctx = previewContext();
    if (!ctx) return;
    try {
      await ctx.resume();
    } catch {
      /* needs gesture */
    }
    const my = ++this.token;
    const stop = await scheduleAudio(ctx, ctx.destination, clips, fromSec, ducks, duckLevel);
    if (my !== this.token) stop();
    else this.stopFn = stop;
  }
  stop() {
    this.token++;
    this.stopFn?.();
    this.stopFn = null;
  }
}
