import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Icon, IconButton, Sheet, SheetRow, useToast } from "@/src/components/ui";
import { Chunk, CompareMode, compareTexts, CompareResult } from "@/src/lib/compare";
import { timeAgo, uid, useStore } from "@/src/lib/store";
import { storage } from "@/src/utils/storage";
import { makeStyles, MONO, radius, spacing, useTheme } from "@/src/theme";

type Saved = {
  id: string; at: number; nameA: string; nameB: string; a: string; b: string; mode: CompareMode;
  ignoreCase: boolean; ignoreSpace: boolean; summary: CompareResult["summary"];
};
const KEY = "nx:compares";
type View_ = "diff" | "same" | "inline";

export default function CompareScreen() {
  const { docId } = useLocalSearchParams<{ docId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const { docs } = useStore();
  const initial = docs.find((d) => d.id === docId);
  const [a, setA] = useState(initial?.content ?? "");
  const [b, setB] = useState("");
  const [nameA, setNameA] = useState(initial?.name ?? "Text A");
  const [nameB, setNameB] = useState("Text B");
  const [mode, setMode] = useState<CompareMode>("words");
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreSpace, setIgnoreSpace] = useState(true);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [view, setView] = useState<View_>("diff");
  const [pickFor, setPickFor] = useState<"a" | "b" | null>(null);
  const [history, setHistory] = useState<Saved[]>([]);
  const [prevSummary, setPrevSummary] = useState<CompareResult["summary"] | null>(null);

  useEffect(() => {
    storage.getItem(KEY, "").then((r) => r && setHistory(JSON.parse(r)));
  }, []);

  const saveHistory = (list: Saved[]) => {
    setHistory(list);
    storage.setItem(KEY, JSON.stringify(list));
  };

  const run = (opts?: Partial<Saved>) => {
    const A = opts?.a ?? a;
    const B = opts?.b ?? b;
    if (!A.trim() && !B.trim()) {
      toast("Enter or pick two texts to compare", "error");
      return;
    }
    const o = { mode: opts?.mode ?? mode, ignoreCase: opts?.ignoreCase ?? ignoreCase, ignoreSpace: opts?.ignoreSpace ?? ignoreSpace };
    const r = compareTexts(A, B, o);
    // previous comparison of the same pair (by names) for recount
    const prev = history.find((h) => h.nameA === (opts?.nameA ?? nameA) && h.nameB === (opts?.nameB ?? nameB) && h.mode === o.mode);
    setPrevSummary(prev ? prev.summary : null);
    setResult(r);
    setView("diff");
    if (!opts) {
      const rec: Saved = { id: uid(), at: Date.now(), nameA, nameB, a: A.slice(0, 50000), b: B.slice(0, 50000), ...o, summary: r.summary };
      saveHistory([rec, ...history].slice(0, 20));
    }
    if (r.tooLarge) toast("Texts are very large — showing a simplified comparison", "info");
  };

  const unit = mode === "lines" ? "lines" : "words";
  const diffs = useMemo(() => result?.chunks.filter((c) => c.kind !== "same") ?? [], [result]);
  const sims = useMemo(() => result?.chunks.filter((c) => c.kind === "same" && c.units >= (mode === "lines" ? 1 : 3)) ?? [], [result, mode]);

  const delta = (k: keyof CompareResult["summary"]) => {
    if (!prevSummary || !result) return null;
    const d = Math.round((result.summary[k] - prevSummary[k]) * 10) / 10;
    if (!d) return null;
    return <Text style={{ color: colors.muted, fontSize: 11 }}>{d > 0 ? `+${d}` : d} vs prev</Text>;
  };

  const kindColor = (k: Chunk["kind"]) => (k === "added" ? colors.success : k === "removed" ? colors.error : k === "changed" ? colors.warning : colors.info);

  const InputCard = ({ which }: { which: "a" | "b" }) => {
    const val = which === "a" ? a : b;
    const name = which === "a" ? nameA : nameB;
    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={[styles.tag, { backgroundColor: which === "a" ? colors.diffDelBg : colors.diffAddBg }]}>
            <Text style={[styles.tagText, { color: which === "a" ? colors.onDiffDel : colors.onDiffAdd }]}>{which.toUpperCase()}</Text>
          </View>
          <Text style={styles.cardTitle} numberOfLines={1}>{name}</Text>
          <Pressable testID={`pick-file-${which}`} onPress={() => setPickFor(which)} style={styles.pickBtn}>
            <Icon name="file-document-outline" size={16} color={colors.onSurfaceTertiary} />
            <Text style={styles.pickText}>From file</Text>
          </Pressable>
          {val ? <IconButton testID={`clear-${which}`} name="close" size={18} onPress={() => { if (which === "a") { setA(""); setNameA("Text A"); } else { setB(""); setNameB("Text B"); } setResult(null); }} /> : null}
        </View>
        <TextInput
          testID={`compare-input-${which}`}
          value={val}
          onChangeText={(t) => { if (which === "a") setA(t); else setB(t); setResult(null); }}
          multiline
          placeholder={`Paste or type text ${which.toUpperCase()}…`}
          placeholderTextColor={colors.muted}
          textAlignVertical="top"
          autoCorrect={false}
          style={styles.input}
        />
        <Text style={styles.meta}>{(val.match(/\S+/g) ?? []).length} words · {val.length} chars · {val ? val.split("\n").length : 0} lines</Text>
      </View>
    );
  };

  return (
    <View style={styles.screen} testID="compare-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton testID="compare-back-btn" name="arrow-left" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Text Compare</Text>
          <Text style={styles.meta}>Spot differences & similarities</Text>
        </View>
        <IconButton testID="swap-texts-btn" name="swap-vertical" onPress={() => { setA(b); setB(a); setNameA(nameB); setNameB(nameA); setResult(null); }} />
      </View>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
        {InputCard({ which: "a" })}
        {InputCard({ which: "b" })}

        <View style={styles.options}>
          <View style={styles.seg}>
            {(["words", "lines"] as CompareMode[]).map((m) => (
              <Pressable key={m} testID={`compare-mode-${m}`} onPress={() => { setMode(m); setResult(null); }} style={[styles.segBtn, mode === m && styles.segBtnActive]}>
                <Text style={[styles.segText, mode === m && styles.segTextActive]}>{m === "words" ? "Word by word" : "Line by line"}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.label}>Ignore case</Text>
            <Switch testID="ignore-case-toggle" value={ignoreCase} onValueChange={(v) => { setIgnoreCase(v); setResult(null); }} trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }} thumbColor={colors.onBrandPrimary} />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.label}>Ignore extra spaces</Text>
            <Switch testID="ignore-space-toggle" value={ignoreSpace} onValueChange={(v) => { setIgnoreSpace(v); setResult(null); }} trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }} thumbColor={colors.onBrandPrimary} />
          </View>
          <Button testID="run-compare-btn" label={result ? "Recount" : "Compare"} icon="compare-horizontal" onPress={() => run()} />
        </View>

        {result ? (
          <View testID="compare-results">
            <View style={styles.summary}>
              <View style={styles.simBox}>
                <Text style={styles.simNum} testID="similarity-value">{result.summary.similarity}%</Text>
                <Text style={styles.meta}>similar</Text>
                {delta("similarity")}
              </View>
              <View style={styles.statsGrid}>
                {([
                  ["added", `Added ${unit}`, colors.success],
                  ["removed", `Removed ${unit}`, colors.error],
                  ["changed", `Changed ${unit}`, colors.warning],
                  ["same", `Same ${unit}`, colors.info],
                ] as const).map(([k, l, c]) => (
                  <View key={k} style={styles.stat} testID={`stat-${k}`}>
                    <Text style={[styles.statVal, { color: c }]}>{result.summary[k]}</Text>
                    <Text style={styles.meta}>{l}</Text>
                    {delta(k)}
                  </View>
                ))}
              </View>
            </View>
            <Text style={[styles.meta, { marginHorizontal: spacing.lg }]} testID="compare-recount">
              {result.summary.diffCount} difference{result.summary.diffCount === 1 ? "" : "s"} found · A: {result.summary.unitsA} {unit} · B: {result.summary.unitsB} {unit}
              {prevSummary ? ` · previous run: ${prevSummary.similarity}% similar, ${prevSummary.diffCount} differences` : ""}
            </Text>

            <View style={[styles.seg, { margin: spacing.lg }]}>
              {([["diff", `Differences ${diffs.length}`], ["same", `Similarities ${sims.length}`], ["inline", "Marked text"]] as const).map(([k, l]) => (
                <Pressable key={k} testID={`compare-view-${k}`} onPress={() => setView(k)} style={[styles.segBtn, view === k && styles.segBtnActive]}>
                  <Text style={[styles.segText, view === k && styles.segTextActive]} numberOfLines={1}>{l}</Text>
                </Pressable>
              ))}
            </View>

            {view === "inline" ? (
              <View style={[styles.card, { padding: spacing.md }]} testID="inline-view">
                <Text style={styles.inline}>
                  {result.chunks.map((c, i) =>
                    c.kind === "same" ? <Text key={i}>{c.bText}</Text> : (
                      <Text key={i}>
                        {c.aText ? <Text style={{ backgroundColor: colors.diffDelBg, color: colors.onDiffDel, textDecorationLine: "line-through" }}>{c.aText}</Text> : null}
                        {c.bText ? <Text style={{ backgroundColor: colors.diffAddBg, color: colors.onDiffAdd }}>{c.bText}</Text> : null}
                      </Text>
                    ),
                  )}
                </Text>
                <View style={styles.legend}>
                  <Text style={[styles.meta, { color: colors.onDiffDel }]}>■ only in A</Text>
                  <Text style={[styles.meta, { color: colors.onDiffAdd }]}>■ only in B</Text>
                </View>
              </View>
            ) : (
              (view === "diff" ? diffs : sims).slice(0, 300).map((c, i) => (
                <View key={i} style={[styles.chunk, { borderLeftColor: kindColor(c.kind) }]} testID={`chunk-${view}-${i}`}>
                  <View style={styles.chunkHead}>
                    <Text style={[styles.kind, { color: kindColor(c.kind) }]}>{c.kind === "same" ? "MATCH" : c.kind.toUpperCase()}</Text>
                    <Text style={styles.loc}>
                      {c.kind !== "added" ? `A: Ln ${c.aLoc.line}, Col ${c.aLoc.col}` : ""}{c.kind === "changed" || c.kind === "same" ? "  →  " : ""}{c.kind !== "removed" ? `B: Ln ${c.bLoc.line}, Col ${c.bLoc.col}` : ""}
                    </Text>
                    <Text style={styles.loc}>{c.units} {unit}</Text>
                  </View>
                  {c.kind === "same" ? (
                    <Text style={styles.chunkText} numberOfLines={4}>{c.aText.trim()}</Text>
                  ) : (
                    <>
                      {c.aText ? <Text style={[styles.chunkText, { backgroundColor: colors.diffDelBg, color: colors.onDiffDel }]} numberOfLines={6}>− {c.aText}</Text> : null}
                      {c.bText ? <Text style={[styles.chunkText, { backgroundColor: colors.diffAddBg, color: colors.onDiffAdd }]} numberOfLines={6}>+ {c.bText}</Text> : null}
                    </>
                  )}
                </View>
              ))
            )}
            {view !== "inline" && (view === "diff" ? diffs : sims).length === 0 ? (
              <Text style={[styles.meta, { textAlign: "center", padding: spacing.xl }]} testID="no-chunks">{view === "diff" ? "The texts are identical." : "No shared passages found."}</Text>
            ) : null}
          </View>
        ) : null}

        {history.length ? (
          <View style={{ marginTop: spacing.xl }}>
            <View style={styles.histHead}>
              <Text style={styles.section}>Previous comparisons</Text>
              <Pressable testID="clear-compare-history" onPress={() => saveHistory([])}><Text style={[styles.meta, { color: colors.error }]}>Clear</Text></Pressable>
            </View>
            {history.map((h) => (
              <Pressable
                key={h.id}
                testID={`compare-history-${h.id}`}
                onPress={() => {
                  setA(h.a); setB(h.b); setNameA(h.nameA); setNameB(h.nameB); setMode(h.mode); setIgnoreCase(h.ignoreCase); setIgnoreSpace(h.ignoreSpace);
                  run(h);
                }}
                style={({ pressed }) => [styles.histRow, pressed && { backgroundColor: colors.surfaceTertiary }]}
              >
                <Icon name="history" size={18} color={colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.label} numberOfLines={1}>{h.nameA} ↔ {h.nameB}</Text>
                  <Text style={styles.meta}>{timeAgo(h.at)} · {h.summary.similarity}% similar · +{h.summary.added} −{h.summary.removed} ~{h.summary.changed} · {h.summary.diffCount} diffs ({h.mode})</Text>
                </View>
                <Icon name="chevron-right" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      <Sheet visible={!!pickFor} onClose={() => setPickFor(null)} title={`Pick file for ${pickFor?.toUpperCase()}`} testID="pick-file-sheet">
        <ScrollView style={{ maxHeight: 420 }}>
          {docs.map((d) => (
            <SheetRow key={d.id} testID={`pick-doc-${d.id}`} icon="file-document-outline" label={d.name} right={`${d.content.length} ch`} onPress={() => {
              if (pickFor === "a") { setA(d.content); setNameA(d.name); } else { setB(d.content); setNameB(d.name); }
              setResult(null);
              setPickFor(null);
            }} />
          ))}
        </ScrollView>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.border },
  title: { color: c.onSurface, fontSize: 17, fontWeight: "700" },
  meta: { color: c.muted, fontSize: 12 },
  label: { color: c.onSurface, fontSize: 14, fontWeight: "500" },
  section: { color: c.onSurface, fontSize: 15, fontWeight: "700" },
  card: { marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: spacing.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardTitle: { flex: 1, color: c.onSurface, fontSize: 14, fontWeight: "600" },
  tag: { width: 24, height: 24, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  tagText: { fontWeight: "800", fontSize: 12 },
  pickBtn: { flexDirection: "row", alignItems: "center", gap: 4, height: 32, paddingHorizontal: spacing.sm, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary },
  pickText: { color: c.onSurfaceTertiary, fontSize: 12, fontWeight: "600" },
  input: { minHeight: 120, maxHeight: 220, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: c.surface, color: c.onSurface, fontFamily: MONO, fontSize: 13, lineHeight: 19, borderWidth: 1, borderColor: c.border },
  options: { marginHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.sm },
  seg: { flexDirection: "row", padding: 4, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  segBtn: { flex: 1, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  segBtnActive: { backgroundColor: c.brandPrimary },
  segText: { color: c.onSurfaceTertiary, fontSize: 12, fontWeight: "600" },
  segTextActive: { color: c.onBrandPrimary },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  summary: { flexDirection: "row", gap: spacing.lg, margin: spacing.lg, marginBottom: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary },
  simBox: { alignItems: "center", justifyContent: "center", minWidth: 84 },
  simNum: { color: c.brandPrimary, fontSize: 28, fontWeight: "800" },
  statsGrid: { flex: 1, flexDirection: "row", flexWrap: "wrap", rowGap: spacing.sm },
  stat: { width: "50%" },
  statVal: { fontSize: 18, fontWeight: "800" },
  inline: { color: c.onSurface, fontFamily: MONO, fontSize: 13, lineHeight: 20 },
  legend: { flexDirection: "row", gap: spacing.lg },
  chunk: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderLeftWidth: 4, gap: spacing.xs },
  chunkHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  kind: { fontSize: 11, fontWeight: "800" },
  loc: { color: c.onSurfaceSecondary, fontSize: 11, fontFamily: MONO },
  chunkText: { color: c.onSurface, fontFamily: MONO, fontSize: 12, lineHeight: 18, padding: 4, borderRadius: 2 },
  histHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  histRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider },
}));
