export type ThemeId = "studio" | "felt";
export type ThemeDefinition = {
  name: string;
  colors: { field: string; panel: string; letters: string; hero: string; alarm: string };
  displayFont: string;
  uiFont: string;
  audio: ThemeId;
};

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  studio: {
    name: "Studio",
    colors: { field: "#123A63", panel: "#0C2745", letters: "#F5EFE1", hero: "#F2A93B", alarm: "#E0472F" },
    displayFont: '"Arial Narrow", "Roboto Condensed", Impact, sans-serif',
    uiFont: 'Inter, ui-sans-serif, system-ui, sans-serif',
    audio: "studio"
  },
  felt: {
    name: "Felt",
    colors: { field: "#14432F", panel: "#0D2E20", letters: "#F2E9D8", hero: "#D9A441", alarm: "#C0392B" },
    displayFont: 'Rockwell, "Roboto Slab", Georgia, serif',
    uiFont: 'Inter, ui-sans-serif, system-ui, sans-serif',
    audio: "felt"
  }
};

export function applyTheme(id: ThemeId): ThemeDefinition {
  const theme = THEMES[id] ?? THEMES.studio;
  const root = document.documentElement;
  root.dataset.theme = id;
  for (const [role, value] of Object.entries(theme.colors)) root.style.setProperty(`--${role}`, value);
  root.style.setProperty("--font-display", theme.displayFont);
  root.style.setProperty("--font-ui", theme.uiFont);
  return theme;
}
