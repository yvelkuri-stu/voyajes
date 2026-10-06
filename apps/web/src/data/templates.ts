import type { TemplatePack } from "@voyajes/core";
import {
  packRef,
  textStyleLabel,
  textTransitionLabel,
} from "@voyajes/core";
import manifest from "../../public/catalog-manifest.json";
import { getThemeById, type ThemeCard } from "./themes";
import { getBeatById, type BeatCard } from "./beats";

export type TemplateCard = TemplatePack & {
  packRef: string;
  theme?: ThemeCard;
  beat?: BeatCard;
  gradient: string;
};

export function getTemplates(): TemplateCard[] {
  const packs = manifest.packs as unknown as TemplatePack[];
  return packs
    .filter((p) => p.kind === "template")
    .map((p) => {
      const theme = getThemeById(p.themeId);
      const beat = getBeatById(p.beatId);
      return {
        ...p,
        packRef: packRef(p.id, p.version),
        theme,
        beat,
        gradient: theme?.gradient ?? "var(--grad-brand)",
      };
    });
}

export function getTemplateById(id: string): TemplateCard | undefined {
  return getTemplates().find((t) => t.id === id);
}

export { textStyleLabel, textTransitionLabel };

export function templateComboSummary(t: TemplateCard): string {
  return [
    t.motion,
    t.transition,
    t.beat?.name ?? t.beatId,
    textStyleLabel(t.textStyle),
    textTransitionLabel(t.textTransition),
  ].join(" · ");
}
