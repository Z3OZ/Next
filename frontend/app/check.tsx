import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { Button, Icon, IconButton, useToast } from "@/src/components/ui";
import { api, CoachResult } from "@/src/lib/api";
import { detectLanguage, getLang } from "@/src/lib/languages";
import { useStore } from "@/src/lib/store";
import { analyzeCode, analyzeWriting, Issue, IssueType } from "@/src/lib/writing";
import { makeStyles, MONO, radius, spacing, useTheme } from "@/src/theme";

type Tab = "offline" | "ai";
const FILTERS: ("all" | IssueType)[] = ["all", "spelling", "grammar", "clarity", "style", "code"];

function Pulse({ text }: { text: string }) {
  const o = useSharedValue(0.4);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [o]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  const styles = useStyles();
  return (
    <Animated.View style={[{ padding: spacing.xl, gap: spacing.md }, st]} testID="ai-loading">
      <Text style={styles.cardTitle}>{text}</Text>
      {[0, 1, 2].map((i) => <View key={i} style={styles.skel} />)}
    </Animated.View>
  );
}

export default function CheckScreen() {
  const { docId } = useLocalSearchParams<{ docId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const { docs, updateDoc, addVersion } = useStore();
  const doc = docs.find((d) => d.id === docId);
  const langId = doc ? (doc.language === "auto" ? detectLanguage(doc.name, doc.content) : doc.language) : "plaintext";
  const lang = getLang(langId);
  const isCodeLang = lang.mode === "code" || lang.mode === "markup";
  const [tab, setTab] = useState<Tab>("offline");
  const [asCode, setAsCode] = useState(isCodeLang);
  const [filter, setFilter] = useState<"all" | IssueType>("all");
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [ai, setAi] = useState<CoachResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<number>>(new Set());

  const content = doc?.content ?? "";
  const result = useMemo(() => {
    if (asCode) {
      const r = analyzeCode(content);
      return { issues: r.issues, score: r.score, tips: r.tips, stats: [["Lines", String(r.stats.lines)], ["TODOs", String(r.stats.todos)], ["Long lines", String(r.stats.longLines)]] };
    }
    const r = analyzeWriting(content);
    return {
      issues: r.issues, score: r.score, tips: r.tips,
      stats: [["Words", String(r.stats.words)], ["Sentences", String(r.stats.sentences)], ["Avg. sentence", `${r.stats.avgSentence}w`], ["Readability", `${r.stats.flesch} · ${r.stats.grade}`], ["Reading time", `${r.stats.readingMin} min`], ["Passive", String(r.stats.passive)]],
    };
  }, [content, asCode]);

  const keyOf = (i: Issue) => `${i.original}|${i.message}`;
  const visible = result.issues.filter((i) => !ignored.has(keyOf(i)) && (filter === "all" || i.type === filter));
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    result.issues.forEach((i) => { if (!ignored.has(keyOf(i))) c[i.type] = (c[i.type] ?? 0) + 1; });
    return c;
  }, [result.issues, ignored]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/editor"));

  if (!doc) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={styles.muted}>File not found</Text>
        <Button testID="check-close-missing" label="Close" onPress={close} />
      </View>
    );
  }

  const applyIssue = (i: Issue) => {
    if (i.replacement === undefined || content.slice(i.start, i.end) !== i.original) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    updateDoc(doc.id, { content: content.slice(0, i.start) + i.replacement + content.slice(i.end) }, { external: true });
  };

  const fixAll = (type: IssueType) => {
    const list = result.issues.filter((i) => i.type === type && i.replacement !== undefined && !ignored.has(keyOf(i))).sort((a, b) => b.start - a.start);
    let t = content;
    let lastStart = Infinity;
    let n = 0;
    for (const i of list) {
      if (i.end > lastStart) continue;
      if (t.slice(i.start, i.end) !== i.original) continue;
      t = t.slice(0, i.start) + i.replacement + t.slice(i.end);
      lastStart = i.start;
      n++;
    }
    if (!n) return;
    addVersion(doc.id, content, { auto: false, label: `Before fixing ${type}` });
    updateDoc(doc.id, { content: t }, { external: true });
    toast(`Fixed ${n} ${type} issue${n > 1 ? "s" : ""}`, "success");
  };

  const runAi = async () => {
    setAiLoading(true);
    setAiError(null);
    setApplied(new Set());
    try {
      const r = await api.coach(content, asCode ? "code" : "writing", lang.name);
      setAi(r);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAiLoading(false);
    }
  };

  const applyAi = (idx: number) => {
    const it = ai?.issues[idx];
    if (!it) return;
    const pos = content.indexOf(it.original);
    if (pos < 0 || !it.original) {
      toast("Text has changed — could not apply", "error");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    updateDoc(doc.id, { content: content.slice(0, pos) + it.replacement + content.slice(pos + it.original.length) }, { external: true });
    setApplied((s) => new Set(s).add(idx));
  };

  const context = (i: Issue) => {
    const a = Math.max(0, i.start - 28);
    const b = Math.min(content.length, i.end + 28);
    return { pre: (a > 0 ? "…" : "") + content.slice(a, i.start).replace(/\n/g, " "), mid: content.slice(i.start, i.end).replace(/\n/g, " "), post: content.slice(i.end, b).replace(/\n/g, " ") + (b < content.length ? "…" : "") };
  };

  const scoreColor = (s: number) => (s >= 80 ? colors.success : s >= 60 ? colors.warning : colors.error);
  const typeColor = (t: string) => (t === "spelling" || t === "bug" ? colors.error : t === "grammar" ? colors.warning : t === "code" ? colors.info : colors.brandPrimary);

  return (
    <View style={styles.screen} testID="check-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton testID="check-close-btn" name="close" onPress={close} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Writing & Code Check</Text>
          <Text style={styles.muted} numberOfLines={1}>{doc.name} · {lang.name}</Text>
        </View>
      </View>
      <View style={styles.segment}>
        {(["offline", "ai"] as Tab[]).map((t) => (
          <Pressable key={t} testID={`check-tab-${t}`} onPress={() => setTab(t)} style={[styles.segBtn, tab === t && styles.segBtnActive]}>
            <Icon name={t === "offline" ? "spellcheck" : "robot-outline"} size={16} color={tab === t ? colors.onSurface : colors.muted} />
            <Text style={[styles.segText, tab === t && styles.segTextActive]}>{t === "offline" ? "Offline check" : "AI Coach"}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.modeRow}>
        <Text style={styles.muted}>Analyze as</Text>
        {[false, true].map((c) => (
          <Pressable key={String(c)} testID={`mode-${c ? "code" : "writing"}`} onPress={() => { setAsCode(c); setFilter("all"); setAi(null); }} style={[styles.chip, asCode === c && styles.chipActive]}>
            <Text style={[styles.chipText, asCode === c && styles.chipTextActive]}>{c ? "Code" : "Writing"}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "offline" ? (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }} testID="offline-results">
          <View style={styles.scoreCard}>
            <View style={[styles.scoreRing, { borderColor: scoreColor(result.score) }]}>
              <Text style={[styles.scoreNum, { color: scoreColor(result.score) }]} testID="offline-score">{result.score}</Text>
            </View>
            <View style={styles.statsGrid}>
              {result.stats.map(([k, v]) => (
                <View key={k} style={styles.statBox}>
                  <Text style={styles.statVal} numberOfLines={1}>{v}</Text>
                  <Text style={styles.statKey}>{k}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={{ height: 56, justifyContent: "center" }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {FILTERS.filter((f) => f === "all" || counts[f]).map((f) => (
                <Pressable key={f} testID={`issue-filter-${f}`} onPress={() => setFilter(f)} style={[styles.chip, filter === f && styles.chipActive]}>
                  <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
                    {f === "all" ? `All ${Object.values(counts).reduce((a, b) => a + b, 0)}` : `${f[0].toUpperCase()}${f.slice(1)} ${counts[f]}`}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {filter !== "all" && filter !== "code" && result.issues.some((i) => i.type === filter && i.replacement !== undefined) ? (
            <Button testID="fix-all-btn" label={`Fix all ${filter} issues`} icon="auto-fix" variant="secondary" style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }} onPress={() => fixAll(filter)} />
          ) : null}

          {visible.length === 0 ? (
            <View style={styles.emptyBox} testID="no-issues">
              <Icon name="check-decagram-outline" size={40} color={colors.success} />
              <Text style={styles.cardTitle}>No issues found. Looks great!</Text>
            </View>
          ) : (
            visible.slice(0, 150).map((i) => {
              const c = context(i);
              const canFix = i.replacement !== undefined;
              return (
                <Animated.View entering={FadeIn.duration(180)} key={i.id} style={styles.card} testID={`issue-card-${i.id}`}>
                  <View style={styles.cardHead}>
                    <View style={[styles.badge, { borderColor: typeColor(i.type) }]}><Text style={[styles.badgeText, { color: typeColor(i.type) }]}>{i.type}</Text></View>
                    <Text style={styles.cardTitle} numberOfLines={2}>{i.message}</Text>
                  </View>
                  {i.original ? (
                    <Text style={styles.ctx} numberOfLines={3}>
                      {c.pre}<Text style={[styles.ctxMid, { backgroundColor: colors.diffDelBg, color: colors.onDiffDel }]}>{c.mid}</Text>
                      {canFix && i.replacement ? <Text style={[styles.ctxMid, { backgroundColor: colors.diffAddBg, color: colors.onDiffAdd }]}>{` → ${i.replacement}`}</Text> : null}
                      {c.post}
                    </Text>
                  ) : null}
                  <View style={styles.cardActions}>
                    <Pressable testID={`ignore-${i.id}`} onPress={() => setIgnored((s) => new Set(s).add(keyOf(i)))} style={styles.ghostBtn}><Text style={styles.ghostText}>Ignore</Text></Pressable>
                    {canFix ? (
                      <Pressable testID={`apply-fix-${i.id}`} onPress={() => applyIssue(i)} style={styles.fixBtn}>
                        <Icon name="check" size={16} color={colors.onBrandPrimary} />
                        <Text style={styles.fixText}>{i.replacement ? "Apply fix" : "Remove"}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Animated.View>
              );
            })
          )}

          <Text style={styles.section}>Improve your technique</Text>
          {result.tips.map((t, k) => (
            <View key={k} style={styles.tip}>
              <Icon name="lightbulb-on-outline" size={18} color={colors.brandPrimary} />
              <Text style={styles.tipText}>{t}</Text>
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }} testID="ai-results">
          {!ai && !aiLoading && !aiError ? (
            <View style={styles.emptyBox}>
              <Icon name="robot-happy-outline" size={44} color={colors.brandPrimary} />
              <Text style={styles.cardTitle}>{asCode ? "AI code review" : "AI writing coach"}</Text>
              <Text style={[styles.muted, { textAlign: "center" }]}>
                {asCode ? "Get bug finds, readability and performance suggestions." : "Get personalized feedback on grammar, clarity and style, plus tips to level up your writing."} Requires internet.
              </Text>
              <Button testID="run-ai-btn" label="Analyze with AI" icon="creation" onPress={runAi} disabled={!content.trim()} />
            </View>
          ) : null}
          {aiLoading ? <Pulse text={asCode ? "Reviewing code…" : "Analyzing text…"} /> : null}
          {aiError ? (
            <View style={styles.emptyBox} testID="ai-error">
              <Icon name="wifi-off" size={40} color={colors.error} />
              <Text style={styles.cardTitle}>Analysis failed</Text>
              <Text style={[styles.muted, { textAlign: "center" }]}>{aiError}. The offline checker still works without internet.</Text>
              <Button testID="retry-ai-btn" label="Retry" icon="refresh" onPress={runAi} />
            </View>
          ) : null}
          {ai && !aiLoading ? (
            <Animated.View entering={FadeIn.duration(250)}>
              <View style={styles.scoreCard}>
                <View style={[styles.scoreRing, { borderColor: scoreColor(ai.score) }]}>
                  <Text style={[styles.scoreNum, { color: scoreColor(ai.score) }]} testID="ai-score">{ai.score}</Text>
                </View>
                <Text style={[styles.tipText, { flex: 1 }]} testID="ai-summary">{ai.summary}</Text>
              </View>
              {ai.issues.map((it, idx) => {
                const found = !!it.original && content.includes(it.original);
                return (
                  <View key={idx} style={styles.card} testID={`ai-issue-${idx}`}>
                    <View style={styles.cardHead}>
                      <View style={[styles.badge, { borderColor: typeColor(it.type) }]}><Text style={[styles.badgeText, { color: typeColor(it.type) }]}>{it.type}</Text></View>
                      <Text style={styles.cardTitle} numberOfLines={3}>{it.explanation}</Text>
                    </View>
                    <Text style={[styles.ctx, styles.ctxMid, { backgroundColor: colors.diffDelBg, color: colors.onDiffDel }]}>{it.original}</Text>
                    <Text style={[styles.ctx, styles.ctxMid, { backgroundColor: colors.diffAddBg, color: colors.onDiffAdd, marginTop: 4 }]}>{it.replacement}</Text>
                    <View style={styles.cardActions}>
                      {applied.has(idx) ? (
                        <Text style={[styles.ghostText, { color: colors.success }]}>Applied ✓</Text>
                      ) : (
                        <Pressable testID={`ai-apply-${idx}`} disabled={!found} onPress={() => applyAi(idx)} style={[styles.fixBtn, !found && { opacity: 0.4 }]}>
                          <Icon name="check" size={16} color={colors.onBrandPrimary} />
                          <Text style={styles.fixText}>{found ? "Apply" : "Not found"}</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}
              <Text style={styles.section}>Coach tips</Text>
              {ai.tips.map((t, k) => (
                <View key={k} style={styles.tip}>
                  <Icon name="school-outline" size={18} color={colors.brandPrimary} />
                  <Text style={styles.tipText}>{t}</Text>
                </View>
              ))}
              <Button testID="rerun-ai-btn" label="Analyze again" variant="secondary" icon="refresh" style={{ margin: spacing.lg }} onPress={runAi} />
            </Animated.View>
          ) : null}
          {aiLoading ? <ActivityIndicator color={colors.brandPrimary} /> : null}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.border },
  title: { color: c.onSurface, fontSize: 17, fontWeight: "700" },
  muted: { color: c.muted, fontSize: 12 },
  segment: { flexDirection: "row", marginHorizontal: spacing.lg, marginTop: spacing.md, padding: 4, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  segBtn: { flex: 1, height: 38, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: spacing.xs },
  segBtnActive: { backgroundColor: c.surface },
  segText: { color: c.muted, fontSize: 13, fontWeight: "600" },
  segTextActive: { color: c.onSurface },
  modeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  chipRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center" },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.surfaceTertiary, justifyContent: "center" },
  chipActive: { backgroundColor: c.brandTertiary, borderColor: c.brandPrimary },
  chipText: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "500" },
  chipTextActive: { color: c.onBrandTertiary },
  scoreCard: { flexDirection: "row", alignItems: "center", gap: spacing.lg, margin: spacing.lg, marginBottom: 0, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary },
  scoreRing: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, alignItems: "center", justifyContent: "center" },
  scoreNum: { fontSize: 24, fontWeight: "800" },
  statsGrid: { flex: 1, flexDirection: "row", flexWrap: "wrap", rowGap: spacing.sm },
  statBox: { width: "50%" },
  statVal: { color: c.onSurface, fontSize: 14, fontWeight: "700" },
  statKey: { color: c.muted, fontSize: 11 },
  card: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  cardTitle: { color: c.onSurface, fontSize: 14, fontWeight: "600", flex: 1 },
  badge: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  ctx: { color: c.onSurfaceSecondary, fontSize: 13, marginTop: spacing.sm, lineHeight: 19 },
  ctxMid: { fontFamily: MONO, fontSize: 12, borderRadius: 2 },
  cardActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.sm },
  ghostBtn: { height: 36, paddingHorizontal: spacing.md, justifyContent: "center" },
  ghostText: { color: c.muted, fontSize: 13, fontWeight: "600" },
  fixBtn: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: c.brandPrimary, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  fixText: { color: c.onBrandPrimary, fontSize: 13, fontWeight: "700" },
  emptyBox: { alignItems: "center", gap: spacing.md, padding: spacing.xl },
  section: { color: c.onSurface, fontSize: 15, fontWeight: "700", marginHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  tip: { flexDirection: "row", gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.brandTertiary },
  tipText: { color: c.onSurface, fontSize: 13, lineHeight: 19, flex: 1 },
  skel: { height: 64, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
}));
