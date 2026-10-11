import React, { memo, useMemo } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { applyMatches, Seg, TokKind, tokenizeLines } from "@/src/lib/highlight";
import { MONO, ThemeColors, useTheme } from "@/src/theme";

export type Sel = { start: number; end: number };

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  onSelectionChange: (s: Sel) => void;
  selection?: Sel;
  language: string;
  fontSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  highlight: boolean;
  matches: [number, number][];
  activeMatch: number;
  inputRef: React.RefObject<TextInput | null>;
  scrollRef: React.RefObject<ScrollView | null>;
  bottomPad: number;
};

const kindColor = (c: ThemeColors, k?: TokKind) => {
  switch (k) {
    case "keyword": return c.synKeyword;
    case "string": return c.synString;
    case "number": return c.synNumber;
    case "comment": return c.synComment;
    case "function": return c.synFunction;
    case "type": return c.synType;
    case "operator": return c.synOperator;
    case "tag": return c.synTag;
    case "attr": return c.synAttr;
    default: return c.synPlain;
  }
};

const Row = memo(function Row({
  num, segs, gutterW, lineNumbers, wrap, textStyle, gutterStyle, colors,
}: {
  num: number; segs: Seg[]; gutterW: number; lineNumbers: boolean; wrap: boolean; textStyle: object; gutterStyle: object; colors: ThemeColors;
}) {
  return (
    <View style={styles.row}>
      <Text style={[gutterStyle, { width: gutterW }]}>{lineNumbers ? num : ""}</Text>
      <Text style={[textStyle, wrap ? styles.flex : null]}>
        {segs.length === 0 ? " " : segs.map((s, i) => (
          <Text
            key={i}
            style={{
              color: kindColor(colors, s.k),
              fontStyle: s.k === "comment" ? "italic" : "normal",
              backgroundColor: s.m === 2 ? colors.matchActiveBg : s.m === 1 ? colors.matchBg : undefined,
            }}
          >
            {s.t}
          </Text>
        ))}
      </Text>
    </View>
  );
});

export function CodeEditor(p: Props) {
  const { colors } = useTheme();
  const lineHeight = Math.round(p.fontSize * 1.55);
  const lines = useMemo(() => p.value.split("\n"), [p.value]);
  const tooBig = lines.length > 4000;
  const doHighlight = p.highlight && !tooBig;
  const tokens = useMemo(
    () => (doHighlight ? tokenizeLines(lines, p.language) : lines.map((l) => (l ? [{ t: l }] : []))),
    [lines, p.language, doHighlight],
  );

  // map matches to lines
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
      const le = ls + lines[lo].length;
      const arr = map.get(lo) ?? [];
      arr.push([a - ls, Math.min(b, le) - ls, idx === p.activeMatch ? 2 : 1]);
      map.set(lo, arr);
    });
    return map;
  }, [p.matches, p.activeMatch, lines]);

  const digits = String(lines.length).length;
  const charW = p.fontSize * 0.62;
  const gutterW = p.lineNumbers ? Math.ceil(Math.max(2, digits) * charW + 18) : 10;

  const textStyle = useMemo(
    () => ({ fontFamily: MONO, fontSize: p.fontSize, lineHeight, color: colors.synPlain, paddingRight: p.wordWrap ? 8 : 48 }),
    [p.fontSize, lineHeight, colors, p.wordWrap],
  );
  const gutterStyle = useMemo(
    () => ({ fontFamily: MONO, fontSize: p.fontSize * 0.85, lineHeight, color: colors.onGutter, textAlign: "right" as const, paddingRight: 10 }),
    [p.fontSize, lineHeight, colors],
  );

  const body = (
    <View style={[styles.content, p.wordWrap ? null : { minWidth: "100%" }]}>
      {p.lineNumbers ? <View style={[styles.gutterBg, { width: gutterW, backgroundColor: colors.gutter, borderRightColor: colors.divider }]} /> : null}
      <View style={{ pointerEvents: "none" }}>
        {tokens.map((segs, i) => (
          <Row
            key={i}
            num={i + 1}
            segs={lineMatches.has(i) ? applyMatches(segs, lineMatches.get(i)!) : segs}
            gutterW={gutterW}
            lineNumbers={p.lineNumbers}
            wrap={p.wordWrap}
            textStyle={textStyle}
            gutterStyle={gutterStyle}
            colors={colors}
          />
        ))}
      </View>
      <TextInput
        ref={p.inputRef}
        testID="editor-text-input"
        value={p.value}
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
          StyleSheet.absoluteFill,
          textStyle,
          styles.input,
          { paddingLeft: gutterW, color: doHighlight || p.matches.length ? "transparent" : colors.synPlain },
          Platform.OS === "web" ? ({ caretColor: colors.caret, outlineStyle: "none", whiteSpace: p.wordWrap ? "pre-wrap" : "pre", overflow: "hidden" } as object) : null,
        ]}
      />
    </View>
  );

  return (
    <ScrollView
      ref={p.scrollRef}
      style={styles.flex}
      contentContainerStyle={{ paddingBottom: p.bottomPad }}
      keyboardShouldPersistTaps="handled"
      testID="editor-scroll"
    >
      {p.wordWrap ? body : (
        <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: "100%" }}>
          {body}
        </ScrollView>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row" },
  content: { position: "relative", paddingTop: 8 },
  gutterBg: { position: "absolute", left: 0, top: 0, bottom: 0, borderRightWidth: StyleSheet.hairlineWidth },
  input: { paddingTop: 8, paddingBottom: 0, paddingRight: 0, marginTop: 0, includeFontPadding: false, backgroundColor: "transparent", borderWidth: 0 },
});
