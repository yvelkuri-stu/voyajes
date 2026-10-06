import { useCallback, useEffect, useState } from "react";
import {
  loadPrefs,
  subscribePrefs,
  updatePrefs,
  type Prefs,
} from "../lib/prefsStore";

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());

  useEffect(() => subscribePrefs(() => setPrefs(loadPrefs())), []);

  // Mirror onto <html> for CSS hooks
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("kids-mode", prefs.kidsMode);
    root.classList.toggle("large-targets", prefs.largeTargets || prefs.kidsMode);
    root.classList.toggle("reduce-motion", prefs.reduceMotion);
    root.dataset.kids = prefs.kidsMode ? "1" : "0";
  }, [prefs]);

  const setKidsMode = useCallback((on: boolean) => {
    setPrefs(updatePrefs({ kidsMode: on }));
  }, []);

  const setReduceMotion = useCallback((on: boolean) => {
    setPrefs(updatePrefs({ reduceMotion: on }));
  }, []);

  const setLargeTargets = useCallback((on: boolean) => {
    setPrefs(updatePrefs({ largeTargets: on }));
  }, []);

  return {
    prefs,
    setKidsMode,
    setReduceMotion,
    setLargeTargets,
  };
}
