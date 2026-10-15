import { Platform } from "react-native";

import type { TokKind } from "./highlight";
import type { Settings } from "./store";
import { ColorScheme, MONO, ThemeColors } from "@/src/theme";

export type Palette = Record<TokKind | "plain", string>;
export type FontPrefs = { fontFamily?: string; fontSize?: number; textColor?: string; palette?: string };

export const FONT_FAMILIES: { id: string; label: string; family: string }[] = [
  { id: "spacemono", label: "Space Mono", family: MONO },
  { id: "monospace", label: "System Mono", family: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" })! },
  { id: "sans", label: "Sans", family: Platform.select({ ios: "System", android: "sans-serif", default: "sans-serif" })! },
  { id: "serif", label: "Serif", family: Platform.select({ ios: "Georgia", android: "serif", default: "serif" })! },
  { id: "condensed", label: "Condensed", family: Platform.select({ ios: "AvenirNextCondensed-Regular", android: "sans-serif-condensed", default: "sans-serif" })! },
];

// Text color swatches ("" = theme default). Fixed literal colors chosen by the user.
export const TEXT_COLORS = ["", "#FFFFFF", "#E6E6E6", "#FFE9A8", "#A8E6FF", "#C8FFC8", "#000000", "#1E1E1E", "#0B3D91", "#5A2D00"];

type P = Omit<Palette, "plain"> & { plain: string };
const mk = (keyword: string, string: string, number: string, comment: string, fn: string, type: string, operator: string, tag: string, attr: string, plain: string): P =>
  ({ keyword, string, number, comment, function: fn, type, operator, tag, attr, plain });

export const PALETTES: { id: string; label: string; dark?: P; light?: P }[] = [
  { id: "theme", label: "Theme" },
  {
    id: "monokai", label: "Monokai",
    dark: mk("#F92672", "#E6DB74", "#AE81FF", "#9A9683", "#A6E22E", "#66D9EF", "#F8F8F2", "#F92672", "#A6E22E", "#F8F8F2"),
    light: mk("#C2185B", "#7A6A00", "#6A1B9A", "#6E6E60", "#2E7D32", "#0277BD", "#222222", "#C2185B", "#2E7D32", "#111111"),
  },
  {
    id: "dracula", label: "Dracula",
    dark: mk("#FF79C6", "#F1FA8C", "#BD93F9", "#8C98C6", "#50FA7B", "#8BE9FD", "#FFFFFF", "#FF79C6", "#50FA7B", "#F8F8F2"),
    light: mk("#A0306E", "#6E6400", "#6A3FB0", "#5A6799", "#1B7F3B", "#007C91", "#222222", "#A0306E", "#1B7F3B", "#111111"),
  },
  {
    id: "github", label: "GitHub",
    dark: mk("#FF7B72", "#A5D6FF", "#79C0FF", "#9AA4AF", "#D2A8FF", "#FFA657", "#E6EDF3", "#7EE787", "#79C0FF", "#E6EDF3"),
    light: mk("#CF222E", "#0A3069", "#0550AE", "#59636E", "#8250DF", "#953800", "#1F2328", "#116329", "#0550AE", "#1F2328"),
  },
  {
    id: "solarized", label: "Solarized",
    dark: mk("#9DB300", "#2AA198", "#E04B9B", "#93A1A1", "#3A9EE6", "#C99A00", "#EEE8D5", "#3A9EE6", "#C99A00", "#EEE8D5"),
    light: mk("#5F7000", "#1F7A73", "#B02A70", "#586E75", "#1D6FA8", "#8A6800", "#073642", "#1D6FA8", "#8A6800", "#073642"),
  },
  {
    id: "contrast", label: "High contrast",
    dark: mk("#FF6B9D", "#9EFF6B", "#FFB86B", "#C8C8C8", "#FFFF66", "#66FFFF", "#FFFFFF", "#FF6B9D", "#9EFF6B", "#FFFFFF"),
    light: mk("#B00020", "#005A00", "#8A3A00", "#3A3A3A", "#6A00A8", "#004E8A", "#000000", "#B00020", "#005A00", "#000000"),
  },
];

export function themePalette(c: ThemeColors): Palette {
  return {
    keyword: c.synKeyword, string: c.synString, number: c.synNumber, comment: c.synComment, function: c.synFunction,
    type: c.synType, operator: c.synOperator, tag: c.synTag, attr: c.synAttr, plain: c.synPlain,
  };
}

export type EditorStyle = { family: string; size: number; lineSpacing: number; palette: Palette };

export function resolveEditorStyle(s: Settings, langId: string, scheme: ColorScheme, colors: ThemeColors): EditorStyle {
  const o: FontPrefs = s.langFonts?.[langId] ?? {};
  const famId = o.fontFamily || s.fontFamily;
  const family = (FONT_FAMILIES.find((f) => f.id === famId) ?? FONT_FAMILIES[0]).family;
  const palId = o.palette || s.palette;
  const pal = PALETTES.find((p) => p.id === palId);
  const base: Palette = pal && pal[scheme] ? { ...pal[scheme]! } : themePalette(colors);
  const textColor = o.textColor || s.textColor;
  if (textColor) base.plain = textColor;
  return { family, size: Math.round((o.fontSize || s.fontSize) * (s.zoom || 1)), lineSpacing: s.lineSpacing || 1.5, palette: base };
}
