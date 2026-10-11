import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Icon, IconButton, PromptSheet, useToast } from "@/src/components/ui";
import { diffLines, diffStats, foldDiff } from "@/src/lib/diff";
import { timeAgo, useStore, Version } from "@/src/lib/store";
import { makeStyles, MONO, radius, spacing, useTheme } from "@/src/theme";

export default function HistoryScreen() {
  const { docId } = useLocalSearchParams<{ docId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const { docs, getVersions, addVersion, updateDoc, deleteVersion } = useStore();
  const doc = docs.find((d) => d.id === docId);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [selected, setSelected] = useState<Version | null>(null);
  const [compareTo, setCompareTo] = useState<"current" | "previous">("current");
  const [commitOpen, setCommitOpen] = useState(false);

  const load = useCallback(async () => {
    if (!docId) return;
    setVersions([...(await getVersions(docId))]);
  }, [docId, getVersions]);
  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const m = new Map<string, { add: number; del: number }>();
    if (!versions || !doc) return m;
    versions.slice(0, 40).forEach((v) => m.set(v.id, diffStats(diffLines(v.content, doc.content))));
    return m;
  }, [versions, doc]);

  const diff = useMemo(() => {
    if (!selected || !doc || !versions) return null;
    let base = doc.content;
    let title = "Version → Current";
    let oldT = selected.content;
    let newT = base;
    if (compareTo === "previous") {
      const idx = versions.findIndex((v) => v.id === selected.id);
      const prev = versions[idx + 1];
      oldT = prev ? prev.content : "";
      newT = selected.content;
      title = "Previous → This version";
    }
    base = "";
    void base;
    const lines = diffLines(oldT, newT);
    return { title, blocks: foldDiff(lines), stats: diffStats(lines) };
  }, [selected, doc, versions, compareTo]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/editor"));

  if (!doc) {
    return (
      <View style={[styles.screen, styles.center]} testID="history-missing">
        <Text style={styles.muted}>File not found</Text>
        <Button testID="history-close-missing" label="Close" onPress={close} />
      </View>
    );
  }

  const restore = async (v: Version) => {
    await addVersion(doc.id, doc.content, { auto: false, label: "Before restore" });
    updateDoc(doc.id, { content: v.content }, { external: true });
    toast("Version restored", "success");
    close();
  };

  if (selected && diff) {
    return (
      <View style={styles.screen} testID="diff-view">
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <IconButton testID="diff-back-btn" name="arrow-left" onPress={() => setSelected(null)} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{selected.label || "Autosave"}</Text>
            <Text style={styles.muted}>{new Date(selected.createdAt).toLocaleString()}</Text>
          </View>
          <IconButton testID="diff-delete-btn" name="delete-outline" color={colors.error} onPress={async () => { await deleteVersion(doc.id, selected.id); setSelected(null); load(); toast("Version deleted"); }} />
        </View>
        <View style={styles.segment}>
          {(["current", "previous"] as const).map((k) => (
            <Pressable key={k} testID={`compare-${k}`} onPress={() => setCompareTo(k)} style={[styles.segBtn, compareTo === k && styles.segBtnActive]}>
              <Text style={[styles.segText, compareTo === k && styles.segTextActive]}>{k === "current" ? "vs Current" : "vs Previous"}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.diffSummary}>
          <Text style={styles.muted}>{diff.title}</Text>
          <Text style={{ color: colors.success, fontFamily: MONO, fontSize: 12 }} testID="diff-added">+{diff.stats.add}</Text>
          <Text style={{ color: colors.error, fontFamily: MONO, fontSize: 12 }} testID="diff-removed">−{diff.stats.del}</Text>
        </View>
        <FlatList
          data={diff.blocks}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ paddingBottom: 120 }}
          ListEmptyComponent={<Text style={[styles.muted, { padding: spacing.lg }]}>No differences</Text>}
          renderItem={({ item }) =>
            item.kind === "fold" ? (
              <Text style={styles.fold}>⋯ {item.count} unchanged lines</Text>
            ) : (
              <View>
                {item.lines.map((l, i) => (
                  <View key={i} style={[styles.diffLine, l.type === "add" && { backgroundColor: colors.diffAddBg }, l.type === "del" && { backgroundColor: colors.diffDelBg }]}>
                    <Text style={styles.diffNo}>{l.oldNo ?? ""}</Text>
                    <Text style={styles.diffNo}>{l.newNo ?? ""}</Text>
                    <Text style={[styles.diffSign, { color: l.type === "add" ? colors.onDiffAdd : l.type === "del" ? colors.onDiffDel : colors.muted }]}>{l.type === "add" ? "+" : l.type === "del" ? "−" : " "}</Text>
                    <Text style={[styles.diffText, l.type === "add" && { color: colors.onDiffAdd }, l.type === "del" && { color: colors.onDiffDel }]}>{l.text || " "}</Text>
                  </View>
                ))}
              </View>
            )
          }
        />
        <View style={[styles.sticky, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button testID="restore-version-btn" label="Restore this version" icon="restore" onPress={() => restore(selected)} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="history-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton testID="history-close-btn" name="close" onPress={close} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Version history</Text>
          <Text style={styles.muted} numberOfLines={1}>{doc.name} · {versions?.length ?? 0} versions</Text>
        </View>
        <Pressable testID="history-commit-btn" onPress={() => setCommitOpen(true)} style={styles.commitBtn}>
          <Icon name="source-commit" size={16} color={colors.onBrandPrimary} />
          <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", fontSize: 13 }}>Commit</Text>
        </Pressable>
      </View>
      {versions === null ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.brandPrimary} />
      ) : (
        <FlatList
          data={versions}
          keyExtractor={(v) => v.id}
          testID="version-list"
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
          ListEmptyComponent={<Text style={[styles.muted, { padding: spacing.xl, textAlign: "center" }]} testID="history-empty">No versions saved yet.</Text>}
          renderItem={({ item, index }) => {
            const s = stats.get(item.id);
            return (
              <Pressable testID={`version-row-${index}`} onPress={() => { setCompareTo("current"); setSelected(item); }} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceSecondary }]}>
                <View style={styles.timeline}>
                  <View style={[styles.node, !item.auto && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]} />
                  {index < versions.length - 1 ? <View style={styles.line} /> : null}
                </View>
                <View style={{ flex: 1, paddingVertical: spacing.md }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                    <Icon name={item.auto ? "content-save-outline" : "source-commit"} size={14} color={item.auto ? colors.muted : colors.brandPrimary} />
                    <Text style={styles.vLabel} numberOfLines={1}>{item.label || "Autosave"}</Text>
                  </View>
                  <Text style={styles.muted}>{timeAgo(item.createdAt)} · {new Date(item.createdAt).toLocaleTimeString()} · {item.content.split("\n").length} lines</Text>
                </View>
                {s ? (
                  s.add || s.del ? (
                    <Text style={styles.stat}><Text style={{ color: colors.success }}>+{s.add}</Text> <Text style={{ color: colors.error }}>−{s.del}</Text></Text>
                  ) : <Text style={[styles.stat, { color: colors.muted }]}>current</Text>
                ) : null}
                <Icon name="chevron-right" size={18} color={colors.muted} />
              </Pressable>
            );
          }}
        />
      )}
      <PromptSheet
        visible={commitOpen}
        testID="history-commit-sheet"
        title="Save version"
        placeholder="Describe this version"
        confirmLabel="Commit"
        onClose={() => setCommitOpen(false)}
        onSubmit={async (label) => { await addVersion(doc.id, doc.content, { auto: false, label }); setCommitOpen(false); load(); toast("Version saved", "success"); }}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  center: { alignItems: "center", justifyContent: "center", gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.border },
  title: { color: c.onSurface, fontSize: 17, fontWeight: "700" },
  muted: { color: c.muted, fontSize: 12 },
  commitBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: c.brandPrimary, marginRight: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", paddingRight: spacing.md, gap: spacing.sm },
  timeline: { width: 40, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  node: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: c.borderStrong, backgroundColor: c.surface, zIndex: 1 },
  line: { position: "absolute", top: "50%", bottom: 0, width: 2, backgroundColor: c.border },
  vLabel: { color: c.onSurface, fontSize: 14, fontWeight: "600", flexShrink: 1 },
  stat: { fontFamily: MONO, fontSize: 12 },
  segment: { flexDirection: "row", margin: spacing.md, padding: 4, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  segBtn: { flex: 1, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  segBtnActive: { backgroundColor: c.surface },
  segText: { color: c.muted, fontSize: 13, fontWeight: "600" },
  segTextActive: { color: c.onSurface },
  diffSummary: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, alignItems: "center" },
  diffLine: { flexDirection: "row", paddingRight: spacing.sm },
  diffNo: { width: 34, color: c.onGutter, fontFamily: MONO, fontSize: 11, textAlign: "right", paddingRight: 4, lineHeight: 20 },
  diffSign: { width: 16, fontFamily: MONO, fontSize: 13, textAlign: "center", lineHeight: 20 },
  diffText: { flex: 1, color: c.onSurface, fontFamily: MONO, fontSize: 12, lineHeight: 20 },
  fold: { color: c.muted, fontSize: 12, fontFamily: MONO, paddingVertical: spacing.sm, paddingLeft: spacing.lg, backgroundColor: c.surfaceSecondary },
  sticky: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border },
}));
