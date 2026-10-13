import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { IconButton } from "@/src/components/ui";
import { FONT_FAMILIES, PALETTES, TEXT_COLORS, resolveEditorStyle } from "@/src/lib/fonts";
import { tokenizeLines } from "@/src/lib/highlight";
import { Settings } from "@/src/lib/store";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const SAMPLES: Record<string, string> = {
  default: "// Preview\nfunction greet(name) {\n  return \"Hi \" + name; /* 42 */\n}",
  python: "# Preview\ndef greet(name):\n    return f\"Hi {name}\"  # 42",
  html: "<!-- Preview -->\n<div class=\"box\">Hello &amp; welcome</div>",
  markdown: "# Heading\nSome **bold** text and `code`\n- [ ] task",
  plaintext: "The quick brown fox jumps over the lazy dog.\nPack my box with five dozen liquor jugs.",
};

type Prefs = { fontFamily?: string; fontSize?: number; textColor?: string; palette?: string };

export function FontStyleEditor({
  settings, lang, prefs, onChange, perLanguage, testID,
}: { settings: Settings; lang: string; prefs: Prefs; onChange: (p: Prefs) => void; perLanguage: boolean; testID: string }) {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const merged: Settings = perLanguage ? { ...settings, langFonts: { ...settings.langFonts, [lang]: prefs } } : { ...settings, ...prefs } as Settings;
  const st = resolveEditorStyle(merged, lang, scheme, colors);
  const sample = SAMPLES[lang] ?? SAMPLES.default;
  const toks = tokenizeLines(sample.split("\n"), lang);

  const Chip = ({ id, label, active, onPress, family }: { id: string; label: string; active: boolean; onPress: () => void; family?: string }) => (
    <Pressable testID={`${testID}-${id}`} onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive, family ? { fontFamily: family } : null]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ gap: spacing.md }}>
      <View style={[styles.preview, { backgroundColor: colors.surface }]} testID={`${testID}-preview`}>
        {toks.map((segs, i) => (
          <Text key={i} style={{ fontFamily: st.family, fontSize: st.size, lineHeight: Math.round(st.size * st.lineSpacing), color: st.palette.plain }}>
            {segs.length ? segs.map((s, j) => <Text key={j} style={{ color: s.k ? st.palette[s.k] : st.palette.plain }}>{s.t}</Text>) : " "}
          </Text>
        ))}
      </View>

      <Text style={styles.label}>Font type</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {perLanguage ? <Chip id="family-default" label="Default" active={!prefs.fontFamily} onPress={() => onChange({ ...prefs, fontFamily: undefined })} /> : null}
        {FONT_FAMILIES.map((f) => (
          <Chip key={f.id} id={`family-${f.id}`} label={f.label} family={f.family} active={(prefs.fontFamily ?? (perLanguage ? "" : settings.fontFamily)) === f.id} onPress={() => onChange({ ...prefs, fontFamily: f.id })} />
        ))}
      </ScrollView>

      {perLanguage ? (
        <View style={styles.sizeRow}>
          <Text style={[styles.label, { flex: 1 }]}>Font size</Text>
          <Chip id="size-default" label="Default" active={!prefs.fontSize} onPress={() => onChange({ ...prefs, fontSize: undefined })} />
          <IconButton testID={`${testID}-size-minus`} name="minus" onPress={() => onChange({ ...prefs, fontSize: Math.max(10, (prefs.fontSize ?? settings.fontSize) - 1) })} />
          <Text style={styles.sizeVal}>{prefs.fontSize ?? settings.fontSize}</Text>
          <IconButton testID={`${testID}-size-plus`} name="plus" onPress={() => onChange({ ...prefs, fontSize: Math.min(26, (prefs.fontSize ?? settings.fontSize) + 1) })} />
        </View>
      ) : null}

      <Text style={styles.label}>Syntax color scheme</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {perLanguage ? <Chip id="palette-default" label="Default" active={!prefs.palette} onPress={() => onChange({ ...prefs, palette: undefined })} /> : null}
        {PALETTES.map((p) => (
          <Chip key={p.id} id={`palette-${p.id}`} label={p.label} active={(prefs.palette ?? (perLanguage ? "" : settings.palette)) === p.id} onPress={() => onChange({ ...prefs, palette: p.id })} />
        ))}
      </ScrollView>

      <Text style={styles.label}>Text color</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {TEXT_COLORS.map((c) => {
          const active = (prefs.textColor ?? (perLanguage ? undefined : settings.textColor) ?? "") === c;
          return (
            <Pressable
              key={c || "auto"}
              testID={`${testID}-color-${c ? c.slice(1) : "auto"}`}
              onPress={() => onChange({ ...prefs, textColor: c || undefined })}
              style={[styles.swatch, { backgroundColor: c || colors.surfaceTertiary, borderColor: active ? colors.brandPrimary : colors.border }, active && { borderWidth: 3 }]}
            >
              {!c ? <Text style={styles.autoText}>Auto</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  preview: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
  label: { color: c.onSurface, fontSize: 14, fontWeight: "600" },
  chipRow: { gap: spacing.sm, alignItems: "center" },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.surfaceTertiary, justifyContent: "center" },
  chipActive: { backgroundColor: c.brandTertiary, borderColor: c.brandPrimary },
  chipText: { color: c.onSurfaceTertiary, fontSize: 13 },
  chipTextActive: { color: c.onBrandTertiary },
  sizeRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  sizeVal: { color: c.onSurface, fontSize: 15, fontWeight: "700", minWidth: 24, textAlign: "center" },
  swatch: { flexShrink: 0, width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  autoText: { color: c.onSurfaceTertiary, fontSize: 10, fontWeight: "700" },
}));
