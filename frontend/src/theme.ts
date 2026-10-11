// Design tokens (from /app/design_guidelines.json). Dark + Light themes.
// Plain key = background, `on` partner = text/icon on it.
import { useMemo, useSyncExternalStore } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FFFFFF",
  onSurface: "#1E1E1E",
  surfaceSecondary: "#F3F3F3",
  onSurfaceSecondary: "#333333",
  surfaceTertiary: "#E8E8E8",
  onSurfaceTertiary: "#555555",
  surfaceInverse: "#1E1E1E",
  onSurfaceInverse: "#FFFFFF",
  muted: "#757575",

  brand: "#D97757",
  onBrand: "#FFFFFF",
  brandPrimary: "#D97757",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#C16346",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#F7DFD7",
  onBrandTertiary: "#B35A3E",

  success: "#388E3C",
  onSuccess: "#FFFFFF",
  warning: "#F57C00",
  onWarning: "#FFFFFF",
  error: "#D32F2F",
  onError: "#FFFFFF",
  info: "#546E7A",
  onInfo: "#FFFFFF",

  border: "#E0E0E0",
  borderStrong: "#BDBDBD",
  divider: "#EEEEEE",

  // Editor-specific
  gutter: "#F3F3F3",
  onGutter: "#9E9E9E",
  caret: "#D97757",
  matchBg: "#FFE0B2",
  matchActiveBg: "#FFB74D",
  diffAddBg: "#E3F4E1",
  onDiffAdd: "#1B5E20",
  diffDelBg: "#FBE3E3",
  onDiffDel: "#B71C1C",
  backdrop: "rgba(0,0,0,0.35)",

  synKeyword: "#D32F2F",
  synString: "#2E7D32",
  synNumber: "#E65100",
  synComment: "#8A8A8A",
  synFunction: "#C77700",
  synType: "#00695C",
  synOperator: "#424242",
  synTag: "#D32F2F",
  synAttr: "#E65100",
  synPlain: "#1E1E1E",
};

export type ThemeColors = typeof light;

const dark: ThemeColors = {
  surface: "#1E1E1E",
  onSurface: "#D4D4D4",
  surfaceSecondary: "#252526",
  onSurfaceSecondary: "#CCCCCC",
  surfaceTertiary: "#2D2D30",
  onSurfaceTertiary: "#E0E0E0",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#1E1E1E",
  muted: "#858585",

  brand: "#E6B450",
  onBrand: "#1E1E1E",
  brandPrimary: "#E6B450",
  onBrandPrimary: "#1E1E1E",
  brandSecondary: "#C99638",
  onBrandSecondary: "#1E1E1E",
  brandTertiary: "#4A3C1F",
  onBrandTertiary: "#E6B450",

  success: "#81C784",
  onSuccess: "#1E1E1E",
  warning: "#FFB74D",
  onWarning: "#1E1E1E",
  error: "#E57373",
  onError: "#1E1E1E",
  info: "#78909C",
  onInfo: "#1E1E1E",

  border: "#3E3E42",
  borderStrong: "#555555",
  divider: "#2D2D30",

  gutter: "#1E1E1E",
  onGutter: "#5A5A5A",
  caret: "#E6B450",
  matchBg: "#4A3C1F",
  matchActiveBg: "#8A6A20",
  diffAddBg: "#1F3A1F",
  onDiffAdd: "#A6E22E",
  diffDelBg: "#4A1F24",
  onDiffDel: "#F28B82",
  backdrop: "rgba(0,0,0,0.6)",

  synKeyword: "#F92672",
  synString: "#A6E22E",
  synNumber: "#FD971F",
  synComment: "#75715E",
  synFunction: "#E6DB74",
  synType: "#4DB6AC",
  synOperator: "#F8F8F2",
  synTag: "#F92672",
  synAttr: "#A6E22E",
  synPlain: "#D4D4D4",
};

export const defaultScheme: ColorScheme = "dark";
export const themes: { light: ThemeColors; dark: ThemeColors } = { light, dark };

// In-app override (null = follow device)
let override: ColorScheme | null = null;
const listeners = new Set<() => void>();
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const getOverride = () => override;

export function setColorScheme(scheme: ColorScheme | null) {
  override = scheme;
  try {
    Appearance.setColorScheme?.(scheme ?? "unspecified");
  } catch {
    // web: not supported
  }
  listeners.forEach((l) => l());
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const ov = useSyncExternalStore(subscribe, getOverride, getOverride);
  const scheme: ColorScheme = ov ?? (system === "light" ? "light" : system === "dark" ? "dark" : defaultScheme);
  return useMemo(() => ({ scheme, colors: themes[scheme] }), [scheme]);
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 4, md: 8, lg: 12, pill: 999 };
export const MONO = "SpaceMono";
