/**
 * Voyajes UI prefs — Kids Mode, accessibility, Memory jar.
 * Persisted in localStorage; change events sync across tabs/components.
 */

export type Prefs = {
  kidsMode: boolean;
  /** Manual reduce-motion (also respects prefers-reduced-motion via CSS) */
  reduceMotion: boolean;
  /** Larger tap targets (on with Kids Mode; can be toggled alone) */
  largeTargets: boolean;
  /**
   * Content-first UI: icon chrome, secondary settings in sheets.
   * Default ON for new sessions (no prefs key yet).
   */
  minimalistMode: boolean;
};

export type MemoryMoment = {
  id: string;
  title: string;
  note: string;
  themeName?: string;
  clipCount?: number;
  savedAt: string;
};

const PREFS_KEY = "voyajes.prefs.v1";
const MEMORY_KEY = "voyajes.memoryJar.v1";
const CHANGE = "voyajes-prefs-change";

const DEFAULTS: Prefs = {
  kidsMode: false,
  reduceMotion: false,
  largeTargets: false,
  minimalistMode: true,
};

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      kidsMode: Boolean(parsed.kidsMode),
      reduceMotion: Boolean(parsed.reduceMotion),
      largeTargets: Boolean(parsed.largeTargets) || Boolean(parsed.kidsMode),
      // Existing users without the key keep classic; new installs get DEFAULTS.minimalistMode
      minimalistMode:
        typeof parsed.minimalistMode === "boolean"
          ? parsed.minimalistMode
          : false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(next: Prefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CHANGE));
}

export function updatePrefs(patch: Partial<Prefs>): Prefs {
  const current = loadPrefs();
  const next: Prefs = { ...current, ...patch };
  // Kids Mode implies larger targets
  if (patch.kidsMode === true) next.largeTargets = true;
  savePrefs(next);
  return next;
}

export function subscribePrefs(cb: () => void): () => void {
  const sync = () => cb();
  window.addEventListener(CHANGE, sync);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener(CHANGE, sync);
    window.removeEventListener("storage", sync);
  };
}

/** Safer template ids for Kids Mode (bright / calm / travel — no party/strobe/acid). */
export const KIDS_SAFE_TEMPLATE_IDS = [
  "template.sunlit-drift",
  "template.coastal-bounce",
  "template.golden-recap",
  "template.gallery-quiet",
  "template.blush-story",
  "template.mint-travel",
  "template.lounge-edit",
  "template.baby-shower-bloom",
  "template.brunch-breeze",
  "template.kids-party-pop",
  "template.candle-wish",
] as const;

export const KIDS_SAFE_THEME_IDS = [
  "theme.soft-film",
  "theme.ocean-pop",
  "theme.golden-hour",
  "theme.minimal-white",
  "theme.rose-quartz",
] as const;

/** Fun sticker pack for Kids Mode stamp tool */
export const STICKER_PACK = [
  "⭐", "🌈", "🦄", "🐶", "🐱", "🐻", "🐼", "🦊",
  "🐸", "🦁", "🐰", "🐥", "🌸", "🍀", "🎈", "🎁",
  "🚀", "✈️", "🏖️", "🍦", "🍕", "🍩", "⚽", "🎨",
  "❤️", "💛", "💚", "💙", "💜", "✨", "🌟", "🎉",
] as const;

export function loadMemoryJar(): MemoryMoment[] {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is MemoryMoment =>
        !!m &&
        typeof m === "object" &&
        typeof (m as MemoryMoment).id === "string" &&
        typeof (m as MemoryMoment).title === "string",
    );
  } catch {
    return [];
  }
}

export function saveMemoryJar(moments: MemoryMoment[]): void {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(moments.slice(0, 40)));
  window.dispatchEvent(new Event(CHANGE));
}

export function addMemoryMoment(
  moment: Omit<MemoryMoment, "id" | "savedAt">,
): MemoryMoment {
  const entry: MemoryMoment = {
    ...moment,
    id: `mem.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 7)}`,
    savedAt: new Date().toISOString(),
  };
  const next = [entry, ...loadMemoryJar()].slice(0, 40);
  saveMemoryJar(next);
  return entry;
}

export function removeMemoryMoment(id: string): void {
  saveMemoryJar(loadMemoryJar().filter((m) => m.id !== id));
}

/**
 * Story coach — suggest title + caption from theme name + clip count.
 */
export function suggestStoryCopy(input: {
  themeName: string;
  clipCount: number;
  existingTitle?: string;
}): { title: string; caption: string } {
  const theme = input.themeName.trim() || "Adventure";
  const n = Math.max(0, input.clipCount);
  const clipWord = n === 1 ? "1 clip" : `${n} clips`;

  const titles = [
    `${theme} recap`,
    `Little ${theme.toLowerCase()} voyage`,
    `${theme} · ${clipWord}`,
    `Our ${theme.toLowerCase()} day`,
    `${theme} memories`,
    `Postcard from ${theme}`,
  ];
  const captions = [
    `${clipWord} · edited with ${theme}. Every voyage, in motion.`,
    `A short ${theme.toLowerCase()} story — ${clipWord} and a beat.`,
    `Packed ${clipWord} into one breezy film. #voyajes`,
    `${theme} vibes only. Tap play and smile.`,
    `From the camera roll to a tiny movie — ${clipWord}.`,
  ];

  // Deterministic-ish pick from theme + count so demos feel stable
  const seed =
    [...theme].reduce((a, c) => a + c.charCodeAt(0), 0) + n * 17;
  const title = titles[seed % titles.length];
  const caption = captions[(seed * 3) % captions.length];

  // If they already have a custom title, only refresh caption unless title is default
  const existing = input.existingTitle?.trim() ?? "";
  const isDefault =
    !existing ||
    existing === "Untitled voyage" ||
    existing.startsWith("Untitled");

  return {
    title: isDefault ? title : existing,
    caption,
  };
}
