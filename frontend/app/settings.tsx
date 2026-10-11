import React, { useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, IconButton, PromptSheet, useToast } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { copyText } from "@/src/lib/files";
import { Settings, timeAgo, useStore } from "@/src/lib/store";
import { makeStyles, MONO, radius, spacing, useTheme } from "@/src/theme";

function Segmented<T extends string | number>({ value, options, onChange, testID }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; testID: string }) {
  const styles = useStyles();
  return (
    <View style={styles.seg}>
      {options.map((o) => (
        <Pressable key={String(o.v)} testID={`${testID}-${o.v}`} onPress={() => onChange(o.v)} style={[styles.segBtn, value === o.v && styles.segBtnActive]}>
          <Text style={[styles.segText, value === o.v && styles.segTextActive]}>{o.l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const { settings, updateSettings, docs, mergeDocs } = useStore();
  const [busy, setBusy] = useState<"push" | "pull" | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);

  const Toggle = ({ k, label, desc }: { k: keyof Settings; label: string; desc?: string }) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {desc ? <Text style={styles.desc}>{desc}</Text> : null}
      </View>
      <Switch
        testID={`toggle-${k}`}
        value={!!settings[k]}
        onValueChange={(v) => updateSettings({ [k]: v } as Partial<Settings>)}
        trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }}
        thumbColor={colors.onBrandPrimary}
      />
    </View>
  );

  const push = async () => {
    setBusy("push");
    try {
      const r = await api.syncPush(settings.syncId, docs.map(({ rev: _rev, ...d }) => d));
      updateSettings({ lastSync: Date.now() });
      toast(`Backed up ${r.count} files`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Backup failed — check your connection", "error");
    } finally {
      setBusy(null);
    }
  };
  const pull = async (code = settings.syncId) => {
    setBusy("pull");
    try {
      const r = await api.syncPull(code);
      const n = mergeDocs(r.docs);
      updateSettings({ lastSync: Date.now() });
      toast(n ? `Restored ${n} file${n > 1 ? "s" : ""}` : "Already up to date", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Restore failed — check your connection", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.screen} testID="settings-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton testID="settings-back-btn" name="arrow-left" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        <Text style={styles.title}>Settings</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
        <Text style={styles.section}>Appearance</Text>
        <View style={styles.group}>
          <View style={styles.rowCol}>
            <Text style={styles.label}>Theme</Text>
            <Segmented testID="theme" value={settings.theme} onChange={(v) => updateSettings({ theme: v })} options={[{ v: "dark", l: "Dark" }, { v: "light", l: "Light" }, { v: "system", l: "System" }]} />
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Font size</Text>
              <Text style={[styles.desc, { fontFamily: MONO, fontSize: settings.fontSize }]}>const a = 1;</Text>
            </View>
            <IconButton testID="font-decrease-btn" name="minus" onPress={() => updateSettings({ fontSize: Math.max(10, settings.fontSize - 1) })} />
            <Text style={styles.fontVal} testID="font-size-value">{settings.fontSize}</Text>
            <IconButton testID="font-increase-btn" name="plus" onPress={() => updateSettings({ fontSize: Math.min(26, settings.fontSize + 1) })} />
          </View>
          <Toggle k="wordWrap" label="Word wrap" desc="Wrap long lines instead of scrolling sideways" />
          <Toggle k="lineNumbers" label="Line numbers" />
          <Toggle k="highlight" label="Syntax highlighting" desc="Color code by language (auto-detected)" />
        </View>

        <Text style={styles.section}>Editor</Text>
        <View style={styles.group}>
          <Toggle k="autocomplete" label="Autocomplete & snippets" desc="Suggest keywords, words and snippets as you type" />
          <Toggle k="autoIndent" label="Auto indent" desc="Keep indentation and continue lists on new lines" />
          <Toggle k="autoClose" label="Auto-close brackets & quotes" />
          <View style={styles.rowCol}>
            <Text style={styles.label}>Tab size</Text>
            <Segmented testID="tab-size" value={settings.tabSize} onChange={(v) => updateSettings({ tabSize: v })} options={[{ v: 2, l: "2 spaces" }, { v: 4, l: "4 spaces" }, { v: 0, l: "Tab" }]} />
          </View>
          <View style={styles.rowCol}>
            <Text style={styles.label}>Autosave after typing stops</Text>
            <Segmented testID="autosave" value={settings.autosaveSec} onChange={(v) => updateSettings({ autosaveSec: v })} options={[{ v: 1, l: "1s" }, { v: 2, l: "2s" }, { v: 5, l: "5s" }, { v: 10, l: "10s" }]} />
            <Text style={styles.desc}>Every autosave is kept in version history (up to 100 versions per file).</Text>
          </View>
        </View>

        <Text style={styles.section}>Cloud backup & sync</Text>
        <View style={styles.group}>
          <View style={styles.rowCol}>
            <Text style={styles.desc}>Your files live on this device. Back them up to the cloud and restore on any device using your sync code.</Text>
            <View style={styles.codeBox}>
              <Text style={styles.code} testID="sync-code">{settings.syncId}</Text>
              <IconButton testID="copy-sync-code-btn" name="content-copy" size={18} onPress={async () => { await copyText(settings.syncId); toast("Sync code copied", "success"); }} />
            </View>
            <Text style={styles.desc} testID="last-sync">{settings.lastSync ? `Last synced ${timeAgo(settings.lastSync)}` : "Never synced"}</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button testID="sync-push-btn" label="Back up" icon="cloud-upload-outline" style={{ flex: 1 }} loading={busy === "push"} onPress={push} />
              <Button testID="sync-pull-btn" label="Restore" icon="cloud-download-outline" variant="secondary" style={{ flex: 1 }} loading={busy === "pull"} onPress={() => pull()} />
            </View>
            <Button testID="change-sync-code-btn" label="Use code from another device" variant="ghost" onPress={() => setCodeOpen(true)} />
          </View>
        </View>

        <Text style={styles.section}>About</Text>
        <View style={styles.group}>
          <View style={styles.rowCol}>
            <Text style={styles.label}>NexaEdit 1.0</Text>
            <Text style={styles.desc}>Offline-first text & code editor inspired by Jota++. 22 languages, autosave with version history, offline grammar checker and AI coach.</Text>
          </View>
        </View>
      </ScrollView>
      <PromptSheet
        visible={codeOpen}
        testID="sync-code-sheet"
        title="Enter sync code"
        placeholder="NX-XXXX-XXXX"
        confirmLabel="Link & restore"
        onClose={() => setCodeOpen(false)}
        onSubmit={(v) => { const code = v.toUpperCase(); updateSettings({ syncId: code }); setCodeOpen(false); pull(code); }}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.border },
  title: { color: c.onSurface, fontSize: 18, fontWeight: "700" },
  section: { color: c.brandPrimary, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  group: { marginHorizontal: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 56, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.divider },
  rowCol: { gap: spacing.sm, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: c.divider },
  label: { color: c.onSurface, fontSize: 15, fontWeight: "500" },
  desc: { color: c.muted, fontSize: 12, marginTop: 2 },
  fontVal: { color: c.onSurface, fontSize: 15, fontWeight: "700", minWidth: 24, textAlign: "center" },
  seg: { flexDirection: "row", padding: 4, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  segBtn: { flex: 1, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  segBtnActive: { backgroundColor: c.brandPrimary },
  segText: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  segTextActive: { color: c.onBrandPrimary },
  codeBox: { flexDirection: "row", alignItems: "center", paddingLeft: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceTertiary },
  code: { flex: 1, color: c.onSurface, fontFamily: MONO, fontSize: 16, letterSpacing: 1 },
}));
