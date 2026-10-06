/**
 * Preview catalog beats: try HTMLAudioElement on previewUrl,
 * fall back to a WebAudio metronome / tone pattern at BPM.
 */

export type PreviewHandle = {
  stop: () => void;
};

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!sharedCtx) {
    sharedCtx = new AudioContext();
  }
  return sharedCtx;
}

function playMetronome(bpm: number, mood: string[]): PreviewHandle {
  const ctx = getCtx();
  void ctx.resume();
  const beatSec = 60 / Math.max(40, Math.min(200, bpm));
  let beat = 0;
  let timer: number | null = null;
  let stopped = false;

  const baseFreq =
    mood.includes("neon") || mood.includes("energetic")
      ? 660
      : mood.includes("ocean") || mood.includes("calm")
        ? 165
        : 330;

  const tick = () => {
    if (stopped) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const isDownbeat = beat % 4 === 0;
    osc.type = mood.includes("neon") ? "square" : "sine";
    osc.frequency.value = isDownbeat ? baseFreq * 1.5 : baseFreq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(isDownbeat ? 0.22 : 0.12, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (isDownbeat ? 0.18 : 0.1));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.22);
    beat += 1;
    timer = window.setTimeout(tick, beatSec * 1000);
  };

  tick();

  return {
    stop: () => {
      stopped = true;
      if (timer != null) window.clearTimeout(timer);
    },
  };
}

export function startBeatPreview(opts: {
  previewUrl?: string;
  bpm: number;
  mood?: string[];
  onMode?: (mode: "file" | "metronome") => void;
  onError?: (msg: string) => void;
}): PreviewHandle {
  const { previewUrl, bpm, mood = [], onMode, onError } = opts;
  let audio: HTMLAudioElement | null = null;
  let metro: PreviewHandle | null = null;
  let stopped = false;

  const startMetro = (reason?: string) => {
    if (stopped) return;
    if (reason) onError?.(reason);
    onMode?.("metronome");
    metro = playMetronome(bpm, mood);
  };

  if (previewUrl) {
    audio = new Audio(previewUrl);
    audio.loop = true;
    audio.volume = 0.85;
    onMode?.("file");
    void audio.play().catch(() => {
      audio = null;
      startMetro("Preview file unavailable — using BPM metronome");
    });
  } else {
    startMetro();
  }

  return {
    stop: () => {
      stopped = true;
      if (audio) {
        audio.pause();
        audio.src = "";
        audio = null;
      }
      metro?.stop();
      metro = null;
    },
  };
}
