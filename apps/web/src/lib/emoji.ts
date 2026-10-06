/** Unicode emoji catalog + recently-used helpers for overlays / reactions. */

const RECENT_KEY = "voyajes.emoji.recent.v1";
const RECENT_MAX = 24;

export type EmojiCategory = {
  id: string;
  label: string;
  emojis: string[];
};

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: "smileys",
    label: "Smileys",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
      "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😋",
      "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐",
      "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😌",
      "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🥵",
      "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "😎", "🤓", "🧐", "😕",
    ],
  },
  {
    id: "gestures",
    label: "Gestures",
    emojis: [
      "👍", "👎", "👏", "🙌", "👐", "🤝", "🙏", "✌️", "🤞", "🤟",
      "🤘", "🤙", "👌", "🤌", "🤏", "👈", "👉", "👆", "👇", "☝️",
      "✋", "🤚", "🖐️", "🖖", "👋", "💪", "🦾", "💅", "🤳", "✍️",
    ],
  },
  {
    id: "hearts",
    label: "Hearts",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "✨",
      "⭐", "🌟", "💫", "🔥", "💥", "💯", "💢", "💤", "💦", "💨",
    ],
  },
  {
    id: "travel",
    label: "Travel",
    emojis: [
      "✈️", "🚀", "🛸", "🚁", "🛶", "⛵", "🚢", "🚗", "🚕", "🚙",
      "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐", "🛻", "🚚", "🚛",
      "🚜", "🛵", "🏍️", "🚲", "🛴", "🛹", "🛼", "🚏", "⛽", "🗺️",
      "🗿", "🗽", "🗼", "🏰", "🏯", "🏟️", "🎡", "🎢", "🎠", "⛱️",
      "🏖️", "🏝️", "🏜️", "🌋", "⛰️", "🏔️", "🗻", "🏕️", "⛺", "🏠",
    ],
  },
  {
    id: "nature",
    label: "Nature",
    emojis: [
      "🌍", "🌎", "🌏", "🌐", "🌑", "🌕", "🌙", "☀️", "🌤️", "⛅",
      "🌧️", "⛈️", "🌈", "❄️", "💧", "🌊", "🌲", "🌳", "🌴", "🌵",
      "🌸", "🌺", "🌻", "🌹", "🌷", "🍀", "🍁", "🍂", "🍃", "🌾",
    ],
  },
  {
    id: "food",
    label: "Food",
    emojis: [
      "🍎", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍒", "🍑",
      "🥭", "🍍", "🥥", "🥝", "🍅", "🥑", "🍔", "🍟", "🍕", "🌮",
      "🍣", "🍜", "🍝", "🥗", "🍿", "🍩", "🍪", "🎂", "🍰", "☕",
    ],
  },
  {
    id: "activities",
    label: "Fun",
    emojis: [
      "🎉", "🎊", "🎈", "🎁", "🏆", "🥇", "🎯", "🎮", "🎲", "🧩",
      "🎸", "🎹", "🎺", "🎻", "🥁", "🎤", "🎧", "🎬", "📷", "📸",
      "🎥", "📹", "📱", "💻", "⌚", "🧭", "🧳", "🎒", "👓", "🕶️",
    ],
  },
];

/** Quick-react strip used on share / comments */
export const QUICK_REACTIONS = ["❤️", "🔥", "👏", "😍", "😂", "😮", "😢", "🙌", "✨", "💯"];

export function loadRecentEmojis(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is string => typeof e === "string").slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function rememberEmoji(emoji: string): string[] {
  const next = [emoji, ...loadRecentEmojis().filter((e) => e !== emoji)].slice(
    0,
    RECENT_MAX,
  );
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

export function allEmojisFlat(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const cat of EMOJI_CATEGORIES) {
    for (const e of cat.emojis) {
      if (!seen.has(e)) {
        seen.add(e);
        out.push(e);
      }
    }
  }
  return out;
}
