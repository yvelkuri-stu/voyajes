import { useEffect, useMemo, useRef, useState } from "react";
import {
  EMOJI_CATEGORIES,
  QUICK_REACTIONS,
  loadRecentEmojis,
  rememberEmoji,
  type EmojiCategory,
} from "../lib/emoji";

type Props = {
  onSelect: (emoji: string) => void;
  /** Compact trigger label */
  label?: string;
  className?: string;
  /** Start open (rare) */
  defaultOpen?: boolean;
};

export function EmojiPicker({
  onSelect,
  label = "😀",
  className = "",
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [categoryId, setCategoryId] = useState(EMOJI_CATEGORIES[0]?.id ?? "smileys");
  const [recent, setRecent] = useState<string[]>(() => loadRecentEmojis());
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const category: EmojiCategory | undefined = useMemo(
    () => EMOJI_CATEGORIES.find((c) => c.id === categoryId) ?? EMOJI_CATEGORIES[0],
    [categoryId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return category?.emojis ?? [];
    const matchCat = EMOJI_CATEGORIES.find((c) =>
      c.label.toLowerCase().includes(q),
    );
    return matchCat?.emojis ?? category?.emojis ?? [];
  }, [category, query]);

  function pick(emoji: string) {
    setRecent(rememberEmoji(emoji));
    onSelect(emoji);
    setOpen(false);
  }

  return (
    <div className={`emoji-picker ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className="emoji-picker-trigger"
        aria-label="Open emoji picker"
        aria-expanded={open}
        title="Insert emoji"
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open && (
        <div className="emoji-picker-pop" role="dialog" aria-label="Emoji picker">
          {recent.length > 0 && (
            <div className="emoji-picker-section">
              <div className="emoji-picker-section-label">Recently used</div>
              <div className="emoji-grid">
                {recent.map((e) => (
                  <button
                    key={`r-${e}`}
                    type="button"
                    className="emoji-cell"
                    onClick={() => pick(e)}
                    aria-label={`Emoji ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="emoji-picker-tabs" role="tablist" aria-label="Emoji categories">
            {EMOJI_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={c.id === categoryId}
                className={`emoji-tab${c.id === categoryId ? " is-active" : ""}`}
                onClick={() => {
                  setCategoryId(c.id);
                  setQuery("");
                }}
                title={c.label}
              >
                {c.emojis[0]}
              </button>
            ))}
          </div>
          <input
            className="emoji-picker-search"
            type="search"
            placeholder={`Search · ${category?.label ?? "emoji"}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter emoji category"
          />
          <div className="emoji-grid emoji-grid-scroll" role="listbox">
            {filtered.map((e) => (
              <button
                key={e}
                type="button"
                className="emoji-cell"
                role="option"
                onClick={() => pick(e)}
                aria-label={`Emoji ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Inline strip of quick reactions (no popover). */
export function QuickReactionBar({
  onSelect,
  active = [],
}: {
  onSelect: (emoji: string) => void;
  active?: string[];
}) {
  return (
    <div className="quick-react-bar" role="group" aria-label="Quick reactions">
      {QUICK_REACTIONS.map((e) => (
        <button
          key={e}
          type="button"
          className={`quick-react-btn${active.includes(e) ? " is-active" : ""}`}
          onClick={() => onSelect(e)}
          aria-pressed={active.includes(e)}
          aria-label={`React ${e}`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}
