import type { ThemePack } from "@voyajes/core";
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
