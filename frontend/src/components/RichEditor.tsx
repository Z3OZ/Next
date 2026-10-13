import React, { useCallback, useMemo, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { EditorStyle } from "@/src/lib/fonts";
import { applyMatches, Seg, tokenizeLines } from "@/src/lib/highlight";
import { useTheme } from "@/src/theme";

export type Sel = { start: number; end: number };

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  onSelectionChange: (s: Sel) => void;
  selection?: Sel;
  language: string;
  font: EditorStyle;
  wordWrap: boolean;
  lineNumbers: boolean;
  highlight: boolean;
  matches: [number, number][];
  activeMatch: number;
  inputRef: React.RefObject<TextInput | null>;
  scrollRef: React.RefObject<ScrollView | null>;
  bottomPad: number;
};

const PAD_TOP = 8;
const PAD_RIGHT = 12;
const IS_WEB = Platform.OS === "web";

/**
 * Single-layer editor: the TextInput itself renders colored spans (nested Text children),
 * so there is never a second text layer that can drift out of alignment ("ghost text").
 */
export function RichEditor(p: Props) {
  const { colors } = useTheme();
  const { family, size, lineSpacing, palette } = p.font;
  const lineHeight = Math.round(size * lineSpacing);
  const lines = useMemo(() => p.value.split("\n"), [p.value]);
  const tooBig = lines.length > 3000 || p.value.length > 150_000;
  const doHighlight = p.highlight && !tooBig && !IS_WEB;

  const tokens = useMemo<Seg[][] | null>(
    () => (doHighlight || (p.matches.length && !IS_WEB) ? (doHighlight ? tokenizeLines(lines, p.language) : lines.map((l) => (l ? [{ t: l }] : []))) : null),
    [lines, p.language, doHighlight, p.matches.length],
  );

  const lineMatches = useMemo(() => {
    const map = new Map<number, [number, number, 1 | 2][]>();
    if (!p.matches.length) return map;
    const starts: number[] = [];
    let off = 0;
    for (const l of lines) {
      starts.push(off);
      off += l.length + 1;
    }
    p.matches.forEach(([a, b], idx) => {
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= a) lo = mid;
        else hi = mid - 1;
      }
      const ls = starts[lo];
      const arr = map.get(lo) ?? [];
      arr.push([a - ls, Math.min(b, ls + lines[lo].length) - ls, idx === p.activeMatch ? 2 : 1]);
      map.set(lo, arr);
    });
    return map;
  }, [p.matches, p.activeMatch, lines]);

  const children = useMemo(() => {
    if (!tokens) return null;
    const out: React.ReactNode[] = [];
    tokens.forEach((segs0, i) => {
      const segs = lineMatches.has(i) ? applyMatches(segs0, lineMatches.get(i)!) : segs0;
      segs.forEach((s, j) => {
        out.push(
          <Text
            key={`${i}-${j}`}
            style={{
              color: s.k ? palette[s.k] : palette.plain,
              backgroundColor: s.m === 2 ? colors.matchActiveBg : s.m === 1 ? colors.matchBg : undefined,
            }}
          >
            {s.t}
          </Text>,
        );
      });
      if (i < tokens.length - 1) out.push(<Text key={`${i}-n`}>{"\n"}</Text>);
    });
    return out;
  }, [tokens, lineMatches, palette, colors]);

  // Line number heights (wrapped lines are measured with an invisible copy using the same font & width)
  const [heights, setHeights] = useState<number[]>([]);
  const hRef = useRef<number[]>([]);
  const raf = useRef<number | null>(null);
  const onRowLayout = useCallback((i: number, h: number) => {
    if (hRef.current[i] === h) return;
    hRef.current[i] = h;
    if (raf.current == null) {
      raf.current = requestAnimationFrame(() => {
        raf.current = null;
        setHeights(hRef.current.slice());
      });
    }
  }, []);
  const measure = p.lineNumbers && p.wordWrap && lines.length <= 3000;
  if (hRef.current.length > lines.length) hRef.current.length = lines.length;

  const digits = String(lines.length).length;
  const gutterW = p.lineNumbers ? Math.ceil(Math.max(2, digits) * size * 0.62 + 16) : 0;
  const maxLen = useMemo(() => (p.wordWrap ? 0 : lines.reduce((m, l) => Math.max(m, l.length), 0)), [lines, p.wordWrap]);

  const textStyle = {
    fontFamily: family,
    fontSize: size,
    lineHeight,
    color: palette.plain,
    includeFontPadding: false,
  } as const;

  const input = (
    <TextInput
      ref={p.inputRef}
      testID="editor-text-input"
      {...(children ? {} : { value: p.value })}
      onChangeText={p.onChangeText}
      onSelectionChange={(e) => p.onSelectionChange(e.nativeEvent.selection)}
      selection={p.selection}
      multiline
      scrollEnabled={false}
      autoCorrect={false}
      autoCapitalize="none"
      spellCheck={false}
      autoComplete="off"
      textAlignVertical="top"
      underlineColorAndroid="transparent"
      selectionColor={colors.matchActiveBg}
      cursorColor={colors.caret}
      style={[
        textStyle,
        styles.input,
        p.wordWrap ? styles.flex : { minWidth: Math.ceil(maxLen * size * 0.62) + 64 },
        IS_WEB ? ({ caretColor: colors.caret, outlineStyle: "none", whiteSpace: p.wordWrap ? "pre-wrap" : "pre" } as object) : null,
      ]}
    >
      {children}
    </TextInput>
  );

  return (
    <ScrollView ref={p.scrollRef} style={styles.flex} contentContainerStyle={{ paddingBottom: p.bottomPad }} keyboardShouldPersistTaps="handled" testID="editor-scroll">
      <View style={styles.row}>
        {p.lineNumbers ? (
          <View style={[styles.gutter, { width: gutterW, backgroundColor: colors.gutter, borderRightColor: colors.divider }]} testID="line-gutter">
            {lines.map((_, i) => (
              <Text
                key={i}
                style={{ height: measure ? heights[i] ?? lineHeight : lineHeight, lineHeight, fontFamily: family, fontSize: size * 0.8, color: colors.onGutter, textAlign: "right", paddingRight: 8, includeFontPadding: false }}
              >
                {i + 1}
              </Text>
            ))}
          </View>
        ) : null}
        <View style={[styles.flex, styles.editArea]}>
          {measure ? (
            <View style={[styles.measure, { pointerEvents: "none" }]}>
              {lines.map((l, i) => (
                <Text key={i} style={textStyle} onLayout={(e) => onRowLayout(i, e.nativeEvent.layout.height)}>{l || " "}</Text>
              ))}
            </View>
          ) : null}
          {p.wordWrap ? input : (
            <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator contentContainerStyle={{ flexGrow: 1 }}>
              {input}
            </ScrollView>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "stretch" },
  gutter: { paddingTop: PAD_TOP, borderRightWidth: StyleSheet.hairlineWidth },
  editArea: { position: "relative", overflow: "hidden" },
  measure: { position: "absolute", left: 8, right: PAD_RIGHT, top: PAD_TOP, opacity: 0 },
  input: { paddingTop: PAD_TOP, paddingBottom: 0, paddingLeft: 8, paddingRight: PAD_RIGHT, margin: 0, backgroundColor: "transparent", borderWidth: 0 },
});
