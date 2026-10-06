/** JS mirror of tokens.css for CLI / non-CSS consumers */

export const colors = {
  magenta: "#E84AFF",
  coral: "#FF6B4A",
  mint: "#3DDC97",
  gold: "#F5C542",
  indigo: "#7C5CFF",
  bgApp: "#0B0D12",
  bgSurface: "#141822",
  bgElevated: "#1C2230",
  textPrimary: "#F4F1EC",
  textSecondary: "#A8B0C0",
  borderSubtle: "#2A3344",
  danger: "#FF5C7A",
} as const;

export const brand = {
  name: "Voyajes",
  tagline: "Every voyage, in motion",
  taglineOptions: [
    "Every voyage, in motion",
    "Color your journey",
    "Photos to films, with feeling",
  ] as const,
  cli: "voyajes",
  shareHost: "voyajes.app",
} as const;
