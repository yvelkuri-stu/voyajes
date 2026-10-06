/**
 * Soft “AI working” activity pulses for coach / template / export / catalog sync.
 * Toggles html/app classes briefly; CSS handles motion (respects reduce-motion).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type AiActivityKind =
  | "idle"
  | "listening"
  | "coach"
  | "template"
  | "export"
  | "catalog";

const BODY_CLASS = "ai-working";
const KIND_ATTR = "data-ai-activity";

export function useAiActivity() {
  const [kind, setKind] = useState<AiActivityKind>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setKind("idle");
    document.documentElement.classList.remove(BODY_CLASS);
    document.documentElement.removeAttribute(KIND_ATTR);
  }, []);

  const pulse = useCallback(
    (next: Exclude<AiActivityKind, "idle">, ms = 1400) => {
      if (timer.current) clearTimeout(timer.current);
      setKind(next);
      document.documentElement.classList.add(BODY_CLASS);
      document.documentElement.setAttribute(KIND_ATTR, next);
      timer.current = setTimeout(() => {
        clear();
      }, ms);
    },
    [clear],
  );

  /** Hold “working” until release() — used for export / sync. */
  const begin = useCallback((next: Exclude<AiActivityKind, "idle">) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setKind(next);
    document.documentElement.classList.add(BODY_CLASS);
    document.documentElement.setAttribute(KIND_ATTR, next);
  }, []);

  useEffect(() => () => clear(), [clear]);

  return { kind, pulse, begin, end: clear, isActive: kind !== "idle" };
}
