import React, { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Icon, IconButton, PromptSheet, Sheet, SheetRow, tap, useToast } from "@/src/components/ui";
import { shareText, pickTextFile } from "@/src/lib/files";
import { detectLanguage, getLang } from "@/src/lib/languages";
import { Doc, formatSize, timeAgo, useStore } from "@/src/lib/store";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Filter = "all" | "pinned" | "code" | "text";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All files" },
  { id: "pinned", label: "Pinned" },
  { id: "code", label: "Code" },
  { id: "text", label: "Text & Notes" },
];
const TEMPLATES = [
  { ext: "txt", label: "Text" }, { ext: "md", label: "Markdown" }, { ext: "js", label: "JavaScript" },
  { ext: "ts", label: "TypeScript" }, { ext: "py", label: "Python" }, { ext: "html", label: "HTML" },
  { ext: "css", label: "CSS" }, { ext: "json", label: "JSON" }, { ext: "java", label: "Java" }, { ext: "cpp", label: "C++" },
];

const EMPTY_IMG = "https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?crop=entropy&cs=srgb&fm=jpg&q=60&w=800";

export function langOfDoc(d: Doc) {
  return getLang(d.language === "auto" ? detectLanguage(d.name, d.content) : d.language);
}

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const { docs, openTabs, createDoc, openDoc, updateDoc, deleteDoc, duplicateDoc, ready } = useStore();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortByName, setSortByName] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [ext, setExt] = useState("txt");
  const [actionDoc, setActionDoc] = useState<Doc | null>(null);
  const [renameDoc, setRenameDoc] = useState<Doc | null>(null);
  const [confirmDel, setConfirmDel] = useState<Doc | null>(null);

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let l = docs.filter((d) => !ql || d.name.toLowerCase().includes(ql) || d.content.toLowerCase().includes(ql));
    if (filter === "pinned") l = l.filter((d) => d.pinned);
    if (filter === "code") l = l.filter((d) => langOfDoc(d).mode === "code" || langOfDoc(d).mode === "markup");
    if (filter === "text") l = l.filter((d) => ["plain", "markdown"].includes(langOfDoc(d).mode));
    return [...l].sort((a, b) => (sortByName ? a.name.localeCompare(b.name) : Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt));
  }, [docs, q, filter, sortByName]);

  const open = (id: string) => {
    tap();
    openDoc(id);
    router.push("/editor");
  };

  const onImport = async () => {
    try {
      const f = await pickTextFile();
      if (!f) return;
      const id = createDoc({ name: f.name, content: f.content });
      toast(`Opened ${f.name}`, "success");
      open(id);
    } catch {
      toast("Could not read that file", "error");
    }
  };

  const createNew = (name: string) => {
    const n = /\.[A-Za-z0-9]+$/.test(name) ? name : `${name}.${ext}`;
    const id = createDoc({ name: n });
    setNewOpen(false);
    open(id);
  };

  return (
    <View style={styles.screen} testID="home-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.titleRow}>
          <View style={styles.logo}><Icon name="code-tags" size={20} color={colors.onBrandPrimary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} testID="app-title">NexaEdit</Text>
            <Text style={styles.subtitle}>{docs.length} files · offline</Text>
          </View>
          <IconButton testID="open-compare-btn" name="compare-horizontal" onPress={() => router.push("/compare")} />
          <IconButton testID="open-device-file-btn" name="folder-open-outline" onPress={onImport} />
          <IconButton testID="open-settings-btn" name="cog-outline" onPress={() => router.push("/settings")} />
        </View>
        <View style={styles.search}>
          <Icon name="magnify" size={20} color={colors.muted} />
          <TextInput
            testID="home-search-input"
            value={q}
            onChangeText={setQ}
            placeholder="Search files and content"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {q ? <IconButton testID="clear-search-btn" name="close" size={18} onPress={() => setQ("")} /> : null}
        </View>
        <View style={styles.chipRowWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {FILTERS.map((f) => (
              <Pressable
                key={f.id}
                testID={`filter-chip-${f.id}`}
                onPress={() => { tap(); setFilter(f.id); }}
                style={[styles.chip, filter === f.id && styles.chipActive]}
              >
                <Text style={[styles.chipText, filter === f.id && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            ))}
            <Pressable testID="sort-toggle-btn" onPress={() => setSortByName((s) => !s)} style={styles.chip}>
              <Icon name={sortByName ? "sort-alphabetical-ascending" : "sort-clock-descending-outline"} size={16} color={colors.onSurfaceTertiary} />
              <Text style={styles.chipText}>{sortByName ? "Name" : "Recent"}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>

      {openTabs.length ? (
        <Pressable testID="continue-editing-btn" onPress={() => router.push("/editor")} style={styles.continue}>
          <Icon name="tab" size={18} color={colors.onBrandTertiary} />
          <Text style={styles.continueText}>Continue editing · {openTabs.length} open tab{openTabs.length > 1 ? "s" : ""}</Text>
          <Icon name="chevron-right" size={18} color={colors.onBrandTertiary} />
        </Pressable>
      ) : null}

      <FlatList
        data={list}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96, paddingTop: spacing.xs }}
        testID="file-list"
        ListEmptyComponent={
          ready ? (
            <View style={styles.empty} testID="empty-state">
              <Image source={{ uri: EMPTY_IMG }} style={styles.emptyImg} contentFit="cover" />
              <Text style={styles.emptyTitle}>{q || filter !== "all" ? "No matching files" : "No files yet"}</Text>
              <Text style={styles.emptyText}>Create a new file or open one from your device.</Text>
              <Button testID="empty-create-btn" label="Create new file" icon="plus" onPress={() => setNewOpen(true)} />
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          const lang = langOfDoc(item);
          return (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 30).duration(220)}>
              <Pressable
                testID={`file-row-${item.id}`}
                onPress={() => open(item.id)}
                onLongPress={() => setActionDoc(item)}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceSecondary }]}
              >
                <View style={styles.fileIcon}><Icon name={lang.icon as never} size={20} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                    <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
                    {item.pinned ? <Icon name="pin" size={14} color={colors.brandPrimary} /> : null}
                  </View>
                  <Text style={styles.fileMeta} numberOfLines={1}>
                    {lang.name} · {formatSize(item.content.length)} · {timeAgo(item.updatedAt)}
                  </Text>
                </View>
                <IconButton testID={`file-more-${item.id}`} name="dots-vertical" size={20} color={colors.muted} onPress={() => setActionDoc(item)} />
              </Pressable>
            </Animated.View>
          );
        }}
      />

      <Pressable
        testID="new-file-fab"
        onPress={() => { tap(); setNewOpen(true); }}
        style={({ pressed }) => [styles.fab, { bottom: insets.bottom + spacing.lg }, pressed && { transform: [{ scale: 0.95 }] }]}
      >
        <Icon name="plus" size={28} color={colors.onBrandPrimary} />
      </Pressable>

      <PromptSheet
        visible={newOpen}
        testID="new-file-sheet"
        title="New file"
        placeholder="File name (e.g. notes, main.py)"
        confirmLabel="Create"
        onClose={() => setNewOpen(false)}
        onSubmit={createNew}
        extra={
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chipRow, { paddingHorizontal: 0, paddingTop: spacing.md }]}>
            {TEMPLATES.map((t) => (
              <Pressable key={t.ext} testID={`template-chip-${t.ext}`} onPress={() => setExt(t.ext)} style={[styles.chip, ext === t.ext && styles.chipActive]}>
                <Text style={[styles.chipText, ext === t.ext && styles.chipTextActive]}>.{t.ext} {t.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        }
      />

      <Sheet visible={!!actionDoc} onClose={() => setActionDoc(null)} title={actionDoc?.name} testID="file-actions-sheet">
        {actionDoc ? (
          <>
            <SheetRow testID="action-open" icon="file-edit-outline" label="Open" onPress={() => { const d = actionDoc; setActionDoc(null); open(d.id); }} />
            <SheetRow testID="action-rename" icon="pencil-outline" label="Rename" onPress={() => { setRenameDoc(actionDoc); setActionDoc(null); }} />
            <SheetRow testID="action-pin" icon={actionDoc.pinned ? "pin-off-outline" : "pin-outline"} label={actionDoc.pinned ? "Unpin" : "Pin to top"} onPress={() => { updateDoc(actionDoc.id, { pinned: !actionDoc.pinned }); setActionDoc(null); }} />
            <SheetRow testID="action-duplicate" icon="content-copy" label="Duplicate" onPress={() => { duplicateDoc(actionDoc.id); setActionDoc(null); toast("Duplicated", "success"); }} />
            <SheetRow testID="action-history" icon="history" label="Version history" onPress={() => { const d = actionDoc; setActionDoc(null); router.push({ pathname: "/history", params: { docId: d.id } }); }} />
            <SheetRow testID="action-share" icon="share-variant-outline" label="Share / Export" onPress={async () => { const d = actionDoc; setActionDoc(null); const r = await shareText(d.name, d.content).catch(() => null); if (r === "copied") toast("Copied to clipboard", "success"); }} />
            <SheetRow testID="action-delete" icon="delete-outline" label="Delete" danger onPress={() => { setConfirmDel(actionDoc); setActionDoc(null); }} />
          </>
        ) : null}
      </Sheet>

      <Sheet visible={!!confirmDel} onClose={() => setConfirmDel(null)} title="Delete file?" testID="confirm-delete-sheet">
        <Text style={styles.emptyText}>“{confirmDel?.name}” and its version history will be permanently deleted.</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
          <Button testID="confirm-delete-cancel" label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => setConfirmDel(null)} />
          <Button testID="confirm-delete-confirm" label="Delete" variant="danger" style={{ flex: 1 }} onPress={() => { if (confirmDel) deleteDoc(confirmDel.id); setConfirmDel(null); toast("File deleted"); }} />
        </View>
      </Sheet>

      <PromptSheet
        visible={!!renameDoc}
        testID="rename-sheet"
        title="Rename file"
        initial={renameDoc?.name}
        confirmLabel="Rename"
        onClose={() => setRenameDoc(null)}
        onSubmit={(v) => { if (renameDoc) updateDoc(renameDoc.id, { name: v }); setRenameDoc(null); }}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  header: { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  logo: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  title: { color: c.onSurface, fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { color: c.muted, fontSize: 12 },
  search: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, paddingLeft: spacing.md, height: 44, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  searchInput: { flex: 1, color: c.onSurface, fontSize: 15, height: 44 },
  chipRowWrap: { height: 56, justifyContent: "center" },
  chipRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center" },
  chip: { height: 36, flexShrink: 0, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.surfaceTertiary },
  chipActive: { backgroundColor: c.brandTertiary, borderColor: c.brandPrimary },
  chipText: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "500" },
  chipTextActive: { color: c.onBrandTertiary },
  continue: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.brandTertiary },
  continueText: { flex: 1, color: c.onBrandTertiary, fontWeight: "600", fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider },
  fileIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  fileName: { color: c.onSurface, fontSize: 15, fontWeight: "600", flexShrink: 1 },
  fileMeta: { color: c.muted, fontSize: 12, marginTop: 2 },
  empty: { alignItems: "center", padding: spacing.xl, gap: spacing.md },
  emptyImg: { width: "100%", height: 160, borderRadius: radius.lg, opacity: 0.8 },
  emptyTitle: { color: c.onSurface, fontSize: 18, fontWeight: "700" },
  emptyText: { color: c.muted, fontSize: 14, textAlign: "center" },
  fab: { position: "absolute", right: spacing.lg, width: 56, height: 56, borderRadius: radius.lg, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
}));
