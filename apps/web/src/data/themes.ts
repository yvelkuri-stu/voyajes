import type { ThemePack, TransitionKind } from "@voyajes/core";
import { TRANSITION_KINDS } from "@voyajes/core";
import manifest from "../../public/catalog-manifest.json";

export type ThemeCard = ThemePack & { gradient: string };

const gradients: Record<string, string> = {
  "theme.neon-night":
    "linear-gradient(160deg, #2a0845 0%, #E84AFF 55%, #7C5CFF 100%)",
  "theme.soft-film":
    "linear-gradient(160deg, #2A221C 0%, #F5C542 50%, #FF6B4A 100%)",
  "theme.ocean-pop":
    "linear-gradient(160deg, #06141C 0%, #0EA5E9 40%, #3DDC97 100%)",
  "theme.golden-hour":
    "linear-gradient(160deg, #1C1008 0%, #FF6B4A 45%, #F5C542 100%)",
  "theme.retro-vhs":
    "linear-gradient(160deg, #12081A 0%, #FF2D95 40%, #2DE1C2 100%)",
  "theme.minimal-white":
    "linear-gradient(160deg, #F4F2EE 0%, #FFFFFF 45%, #D8D4CE 100%)",
  "theme.cyber-lime":
    "linear-gradient(160deg, #050A04 0%, #B8FF3D 50%, #3DFFB8 100%)",
  "theme.rose-quartz":
    "linear-gradient(160deg, #1A1014 0%, #F2A7C3 45%, #C97B9E 100%)",
  "theme.documentary-grain":
    "linear-gradient(160deg, #141210 0%, #C4A574 50%, #6B5A45 100%)",
  "theme.party-strobe":
    "linear-gradient(160deg, #0C0418 0%, #FF3D81 40%, #7C5CFF 100%)",
};

export function getThemes(): ThemeCard[] {
  const packs = manifest.packs as unknown as ThemePack[];
  return packs
    .filter((p) => p.kind === "theme")
    .map((p) => ({
      ...p,
      gradient: gradients[p.id] ?? "var(--grad-brand)",
    }));
}

export function getThemeById(id: string): ThemeCard | undefined {
  return getThemes().find((t) => t.id === id);
}

export function getTransitionKinds(): TransitionKind[] {
  return [...TRANSITION_KINDS];
}

export function transitionLabel(kind: TransitionKind): string {
  switch (kind) {
    case "cut":
      return "Cut";
    case "dissolve":
      return "Dissolve";
    case "push":
      return "Push";
    case "whip":
      return "Whip";
    case "light-leak":
      return "Light leak";
    case "fade-black":
      return "Fade black";
    case "zoom-through":
      return "Zoom through";
    case "slide-up":
      return "Slide up";
    case "flash":
      return "Flash";
    default:
      return kind;
  }
}
