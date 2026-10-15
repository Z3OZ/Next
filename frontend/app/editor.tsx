import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { RichEditor, Sel } from "@/src/components/RichEditor";
import { resolveEditorStyle } from "@/src/lib/fonts";
import { Button, Icon, IconButton, PromptSheet, Sheet, SheetRow, tap, useToast } from "@/src/components/ui";
import { copyText, shareText } from "@/src/lib/files";
import { detectLanguage, getLang, LANGUAGES } from "@/src/lib/languages";
import { useStore } from "@/src/lib/store";
import { makeStyles, MONO, radius, spacing, useTheme } from "@/src/theme";

const KEYS: { label: string; ins: string }[] = [
  { label: "⇥", ins: "\t" }, { label: "{ }", ins: "{$0}" }, { label: "( )", ins: "($0)" }, { label: "[ ]", ins: "[$0]" },
  { label: "\" \"", ins: "\"$0\"" }, { label: "' '", ins: "'$0'" }, { label: "< >", ins: "<$0>" }, { label: ";", ins: ";" },
  { label: "=", ins: "=" }, { label: ":", ins: ":" }, { label: ".", ins: "." }, { label: ",", ins: "," }, { label: "/", ins: "/" },
  { label: "*", ins: "*" }, { label: "+", ins: "+" }, { label: "-", ins: "-" }, { label: "_", ins: "_" }, { label: "&", ins: "&" },
  { label: "|", ins: "|" }, { label: "!", ins: "!" }, { label: "?", ins: "?" }, { label: "#", ins: "#" }, { label: "$", ins: "$" },
  { label: "%", ins: "%" }, { label: "\\", ins: "\\" }, { label: "`", ins: "`$0`" }, { label: "@", ins: "@" },
];

type Suggestion = { label: string; body: string; kind: "snippet" | "keyword" | "word"; desc?: string };

export default function EditorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const toast = useToast();
  const store = useStore();
  const { docs, activeId, openTabs, settings, updateDoc, addVersion, getVersions, openDoc, closeTab, createDoc, updateSettings } = store;
  const doc = docs.find((d) => d.id === activeId) ?? null;

  const [text, setText] = useState("");
  const textRef = useRef("");
  const selRef = useRef<Sel>({ start: 0, end: 0 });
  const [sel, setSel] = useState<Sel>({ start: 0, end: 0 });
  const [forcedSel, setForcedSel] = useState<Sel | undefined>();
  const [saveState, setSaveState] = useState<"saved" | "unsaved">("saved");
  const loaded = useRef<{ id: string | null; rev: number }>({ id: null, rev: -1 });
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stacks = useRef(new Map<string, { undo: string[]; redo: string[]; last: number }>());
  const [, force] = useState(0);
  const inputRef = useRef<TextInput | null>(null);
  const [liveZoom, setLiveZoom] = useState<number | null>(null);
  const pinchBase = useRef(1);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [closeAsk, setCloseAsk] = useState<string | null>(null);
  const lastClosed = useRef<string | null>(null);
  const lastTap = useRef<{ id: string; t: number }>({ id: "", t: 0 });

  // find
  const [findOpen, setFindOpen] = useState(false);
  const [findQ, setFindQ] = useState("");
  const [replQ, setReplQ] = useState("");
  const [caseS, setCaseS] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [matchIdx, setMatchIdx] = useState(0);
  const [showReplace, setShowReplace] = useState(false);

  // sheets
  const [moreOpen, setMoreOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [gotoOpen, setGotoOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Record<string, string>>({});

  const deferred = useDeferredValue(text);

  const stackFor = (id: string) => {
    let s = stacks.current.get(id);
    if (!s) {
      s = { undo: [], redo: [], last: 0 };
      stacks.current.set(id, s);
    }
    return s;
  };

  const flush = useCallback(() => {
    const id = loaded.current.id;
    if (timer.current) clearTimeout(timer.current);
    if (!id || !dirty.current) return;
    const content = textRef.current;
    updateDoc(id, { content });
    addVersion(id, content, { auto: true });
    dirty.current = false;
    setSaveState("saved");
  }, [updateDoc, addVersion]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // load doc into editor
  useEffect(() => {
    if (!doc) return;
    if (loaded.current.id !== doc.id || loaded.current.rev !== doc.rev) {
      if (loaded.current.id !== doc.id) flushRef.current();
      loaded.current = { id: doc.id, rev: doc.rev };
      textRef.current = doc.content;
      setText(doc.content);
      dirty.current = false;
      setSaveState("saved");
      setMatchIdx(0);
      const id = doc.id;
      const content = doc.content;
      getVersions(id).then((v) => {
        if (!v.length) addVersion(id, content, { auto: false, label: "Initial version" });
      });
    }
  }, [doc, getVersions, addVersion]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") flushRef.current();
    });
    return () => {
      sub.remove();
      flushRef.current();
    };
  }, []);

  useEffect(() => {
    if (!forcedSel) return;
    const t = setTimeout(() => setForcedSel(undefined), 60);
    return () => clearTimeout(t);
  }, [forcedSel]);

  const lang = useMemo(() => {
    const detected = doc ? detectLanguage(doc.name, deferred) : "plaintext";
    return { detected, effective: doc && doc.language !== "auto" ? doc.language : detected };
  }, [doc, deferred]);
  const langInfo = getLang(lang.effective);

  const commit = useCallback((t: string, caret?: number, record = true) => {
    const id = loaded.current.id;
    if (!id) return;
    const old = textRef.current;
    if (record && old !== t) {
      const s = stackFor(id);
      const now = Date.now();
      if (!s.undo.length || now - s.last > 700) {
        s.undo.push(old);
        if (s.undo.length > 200) s.undo.shift();
      }
      s.last = now;
      s.redo = [];
    }
    textRef.current = t;
    setText(t);
    dirty.current = true;
    setSaveState("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), settings.autosaveSec * 1000);
    if (caret !== undefined) {
      const ns = { start: caret, end: caret };
      selRef.current = ns;
      setSel(ns);
      setForcedSel(ns);
    }
  }, [settings.autosaveSec]);

  const onChangeText = (nt: string) => {
    const old = textRef.current;
    if (settings.autoIndent && nt.length === old.length + 1) {
      let i = 0;
      while (i < old.length && old[i] === nt[i]) i++;
      if (nt[i] === "\n") {
        const ls = old.lastIndexOf("\n", i - 1) + 1;
        const prev = old.slice(ls, i);
        const indent = /^[\t ]*/.exec(prev)![0];
        const isCode = langInfo.mode === "code" || langInfo.mode === "markup";
        const extra = isCode && /[{([:]\s*$/.test(prev) ? (settings.tabSize ? " ".repeat(settings.tabSize) : "\t") : "";
        const tail = extra && /^[)\]}]/.test(old[i] ?? "") ? "\n" + indent : "";
        const listM = !isCode ? /^(\s*)([-*+]|\d+\.)\s(\[[ xX]\]\s)?/.exec(prev) : null;
        let ins = indent + extra;
        if (listM && prev.trim() !== listM[0].trim()) {
          const num = /^\d+/.exec(listM[2]);
          ins = listM[1] + (num ? `${Number(num[0]) + 1}.` : listM[2]) + " " + (listM[3] ? "[ ] " : "");
        }
        if (ins || tail) {
          commit(nt.slice(0, i + 1) + ins + tail + nt.slice(i + 1), i + 1 + ins.length);
          return;
        }
      }
    }
    // Keep caret estimate in sync (selection events can lag behind text changes)
    let suf = 0;
    while (suf < old.length && suf < nt.length && old[old.length - 1 - suf] === nt[nt.length - 1 - suf]) suf++;
    const caret = Math.max(0, nt.length - suf);
    selRef.current = { start: caret, end: caret };
    setSel({ start: caret, end: caret });
    commit(nt);
  };

  const insert = (raw: string, replaceFrom?: number) => {
    const s = selRef.current;
    const old = textRef.current;
    const start = replaceFrom ?? s.start;
    const ls = old.lastIndexOf("\n", start - 1) + 1;
    const indent = /^[\t ]*/.exec(old.slice(ls, start))![0];
    let body = raw === "\t" ? (settings.tabSize ? " ".repeat(settings.tabSize) : "\t") : raw.replace(/\n/g, "\n" + indent);
    const selected = old.slice(s.start, s.end);
    if (!settings.autoClose && body.includes("$0") && body.length === 4) body = body[0];
    if (selected && body.includes("$0") && replaceFrom === undefined) body = body.replace("$0", selected + "$0");
    const idx = body.indexOf("$0");
    const clean = body.replace("$0", "");
    const t = old.slice(0, start) + clean + old.slice(s.end);
    commit(t, start + (idx >= 0 ? idx : clean.length));
  };

  const onKey = (k: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    insert(k);
  };

  const moveCaret = (d: number) => {
    const p = Math.max(0, Math.min(textRef.current.length, selRef.current.start + d));
    const ns = { start: p, end: p };
    selRef.current = ns;
    setSel(ns);
    setForcedSel(ns);
  };

  const undo = () => {
    const id = loaded.current.id;
    if (!id) return;
    const s = stackFor(id);
    const prev = s.undo.pop();
    if (prev === undefined) return;
    s.redo.push(textRef.current);
    commit(prev, undefined, false);
    force((x) => x + 1);
  };
  const redo = () => {
    const id = loaded.current.id;
    if (!id) return;
    const s = stackFor(id);
    const next = s.redo.pop();
    if (next === undefined) return;
    s.undo.push(textRef.current);
    commit(next, undefined, false);
    force((x) => x + 1);
  };
  const st = activeId ? stacks.current.get(activeId) : undefined;
  const canUndo = !!st?.undo.length;
  const canRedo = !!st?.redo.length;

  // Autocomplete
  const prefix = useMemo(() => {
    if (sel.start !== sel.end) return "";
    const m = /[A-Za-z_$][\w$]*$/.exec(text.slice(Math.max(0, sel.start - 40), sel.start));
    return m ? m[0] : "";
  }, [text, sel]);
  const docWords = useMemo(() => {
    const set = new Set<string>();
    const re = /[A-Za-z_$][\w$]{2,}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(deferred)) && set.size < 3000) set.add(m[0]);
    return Array.from(set);
  }, [deferred]);
  const suggestions = useMemo<Suggestion[]>(() => {
    if (!settings.autocomplete || prefix.length < 2) return [];
    const p = prefix.toLowerCase();
    const out: Suggestion[] = [];
    const seen = new Set<string>([prefix]);
    for (const s of langInfo.snippets) if (s.label.startsWith(p)) { out.push({ label: s.label, body: s.body, kind: "snippet", desc: s.desc }); }
    for (const k of [...langInfo.keywords, ...langInfo.types]) {
      if (k.toLowerCase().startsWith(p) && !seen.has(k)) { seen.add(k); out.push({ label: k, body: k, kind: "keyword" }); }
      if (out.length > 12) break;
    }
    for (const w of docWords) {
      if (out.length > 14) break;
      if (w.toLowerCase().startsWith(p) && !seen.has(w)) { seen.add(w); out.push({ label: w, body: w, kind: "word" }); }
    }
    return out.slice(0, 14);
  }, [prefix, langInfo, docWords, settings.autocomplete]);

  const applySuggestion = (s: Suggestion) => {
    tap();
    insert(s.kind === "snippet" ? s.body : s.body + (s.body.includes("$0") ? "" : "$0"), selRef.current.start - prefix.length);
  };

  // Find
  const { matches, findError } = useMemo(() => {
    if (!findOpen || !findQ) return { matches: [] as [number, number][], findError: false };
    try {
      const src = useRegex ? findQ : findQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(src, caseS ? "g" : "gi");
      const out: [number, number][] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(deferred)) && out.length < 2000) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        out.push([m.index, m.index + m[0].length]);
      }
      return { matches: out, findError: false };
    } catch {
      return { matches: [] as [number, number][], findError: true };
    }
  }, [findOpen, findQ, caseS, useRegex, deferred]);
  const activeMatch = matches.length ? Math.min(matchIdx, matches.length - 1) : -1;

  const editorStyle = useMemo(() => resolveEditorStyle({ ...settings, zoom: liveZoom ?? settings.zoom }, lang.effective, scheme, colors), [settings, liveZoom, lang.effective, scheme, colors]);
  const scrollToOffset = (off: number) => {
    const line = textRef.current.slice(0, off).split("\n").length - 1;
    void line;
    // the editor scrolls natively to the caret once it has focus
    setTimeout(() => inputRef.current?.focus(), 80);
  };
  const gotoMatch = (i: number) => {
    if (!matches.length) return;
    const n = (i + matches.length) % matches.length;
    setMatchIdx(n);
    const [a, b] = matches[n];
    const ns = { start: a, end: b };
    selRef.current = ns;
    setSel(ns);
    setForcedSel(ns);
    scrollToOffset(a);
  };
  const replaceOne = () => {
    if (activeMatch < 0) return;
    const [a, b] = matches[activeMatch];
    const old = textRef.current;
    let rep = replQ;
    if (useRegex) {
      try { rep = old.slice(a, b).replace(new RegExp(findQ, caseS ? "" : "i"), replQ); } catch { /* keep literal */ }
    }
    commit(old.slice(0, a) + rep + old.slice(b), a + rep.length);
  };
  const replaceAll = () => {
    if (!matches.length) return;
    const src = useRegex ? findQ : findQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const n = matches.length;
    commit(textRef.current.replace(new RegExp(src, caseS ? "g" : "gi"), useRegex ? replQ : replQ.replace(/\$/g, "$$$$")));
    toast(`Replaced ${n} occurrence${n > 1 ? "s" : ""}`, "success");
  };

  const cursor = useMemo(() => {
    const before = text.slice(0, sel.start);
    const ln = before.split("\n").length;
    const col = sel.start - before.lastIndexOf("\n");
    const words = (deferred.match(/\S+/g) ?? []).length;
    const selected = Math.abs(sel.end - sel.start);
    return { ln, col, words, chars: text.length, selected, lines: text.split("\n").length };
  }, [text, sel.start, sel.end, deferred]);

  const goTo = (route: "/history" | "/check") => {
    flush();
    const wasOpen = moreOpen;
    setMoreOpen(false);
    const id = doc?.id;
    if (!id) return;
    // let the sheet modal dismiss before pushing a new screen
    const s = selRef.current;
    const params: Record<string, string> = { docId: id };
    if (route === "/check" && s.end > s.start) {
      params.selStart = String(s.start);
      params.selEnd = String(s.end);
    }
    setTimeout(() => router.push({ pathname: route, params }), wasOpen ? 300 : 0);
  };

  const zoom = liveZoom ?? settings.zoom ?? 1;
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onStart(() => { pinchBase.current = settingsRef.current.zoom ?? 1; })
        .onUpdate((e) => {
          const z = Math.round(Math.min(2.5, Math.max(0.5, pinchBase.current * e.scale)) * 20) / 20;
          setLiveZoom((prev) => (prev === z ? prev : z));
        })
        .onEnd(() => {
          setLiveZoom((z) => {
            if (z != null) updateSettings({ zoom: z });
            return null;
          });
        }),
    [updateSettings],
  );

  const requestClose = (id: string) => {
    if (settings.confirmCloseTab === false) return doClose(id);
    setCloseAsk(id);
  };
  const doClose = (id: string) => {
    if (id === activeId) flush();
    lastClosed.current = id;
    closeTab(id);
    setCloseAsk(null);
  };
  const onTabPress = (id: string) => {
    const now = Date.now();
    const isDouble = lastTap.current.id === id && now - lastTap.current.t < 350;
    lastTap.current = { id, t: now };
    if (id !== activeId) {
      tap();
      flush();
      openDoc(id);
    }
    if (isDouble) {
      lastTap.current = { id: "", t: 0 };
      setRenameOpen(true);
    }
  };

  if (!doc) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]} testID="editor-empty">
        <Icon name="file-hidden" size={48} color={colors.muted} />
        <Text style={styles.emptyTitle}>No file open</Text>
        <Button testID="editor-new-file-btn" label="New file" icon="plus" onPress={() => openDoc(createDoc({}))} />
        <Button testID="editor-back-home-btn" label="Back to files" variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      </View>
    );
  }

  const showBanner = doc.language !== "auto" && lang.detected !== doc.language && lang.detected !== "plaintext" && dismissed[doc.id] !== lang.detected;

  return (
    <View style={styles.screen} testID="editor-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
        <IconButton testID="editor-back-btn" name="arrow-left" onPress={() => { flush(); if (router.canGoBack()) router.back(); else router.replace("/"); }} />
        <Pressable testID="editor-title-btn" style={{ flex: 1, paddingHorizontal: spacing.xs }} onPress={() => setRenameOpen(true)}>
          <Text style={styles.docTitle} numberOfLines={1}>{doc.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name={saveState === "saved" ? "check-circle-outline" : "circle-medium"} size={12} color={saveState === "saved" ? colors.success : colors.warning} />
            <Text style={styles.docSub} testID="autosave-status">{saveState === "saved" ? "Saved" : "Editing…"} · {doc.language === "auto" ? `Auto: ${langInfo.name}` : langInfo.name}</Text>
          </View>
        </Pressable>
        <IconButton testID="undo-btn" name="undo" onPress={undo} disabled={!canUndo} />
        <IconButton testID="redo-btn" name="redo" onPress={redo} disabled={!canRedo} />
        <IconButton testID="toggle-find-btn" name="magnify" active={findOpen} onPress={() => setFindOpen((f) => !f)} />
        <IconButton testID="open-check-btn" name="spellcheck" onPress={() => goTo("/check")} />
        <IconButton testID="editor-more-btn" name="dots-vertical" onPress={() => { flush(); setMoreOpen(true); }} />
      </View>

      <View style={styles.tabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {openTabs.map((id) => {
            const d = docs.find((x) => x.id === id);
            if (!d) return null;
            const active = id === activeId;
            return (
              <Pressable key={id} testID={`tab-${id}`} onPress={() => onTabPress(id)} style={[styles.tab, active && styles.tabActive]}>
                <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>{d.name}</Text>
                {active && saveState === "unsaved" ? <View style={styles.dot} /> : null}
                <Pressable testID={`close-tab-${id}`} hitSlop={8} onPress={() => requestClose(id)}>
                  <Icon name="close" size={14} color={active ? colors.onSurface : colors.muted} />
                </Pressable>
              </Pressable>
            );
          })}
          <Pressable testID="new-tab-btn" onPress={() => { flush(); openDoc(createDoc({})); }} style={styles.newTab}>
            <Icon name="plus" size={18} color={colors.muted} />
          </Pressable>
        </ScrollView>
      </View>

      {findOpen ? (
        <View style={styles.find} testID="find-bar">
          <View style={styles.findRow}>
            <IconButton testID="toggle-replace-btn" name={showReplace ? "chevron-down" : "chevron-right"} size={18} onPress={() => setShowReplace((s) => !s)} />
            <TextInput
              testID="find-input"
              value={findQ}
              onChangeText={(v) => { setFindQ(v); setMatchIdx(0); }}
              placeholder="Find"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              onSubmitEditing={() => gotoMatch(activeMatch + 1)}
              style={[styles.findInput, findError && { borderColor: colors.error }]}
            />
            <Text style={styles.findCount} testID="find-count">{findQ ? (matches.length ? `${activeMatch + 1}/${matches.length}` : "0") : ""}</Text>
            <IconButton testID="find-case-btn" name="format-letter-case" size={18} active={caseS} onPress={() => setCaseS((c) => !c)} />
            <IconButton testID="find-regex-btn" name="regex" size={18} active={useRegex} onPress={() => setUseRegex((r) => !r)} />
            <IconButton testID="find-prev-btn" name="chevron-up" size={20} onPress={() => gotoMatch(activeMatch - 1)} disabled={!matches.length} />
            <IconButton testID="find-next-btn" name="chevron-down" size={20} onPress={() => gotoMatch(activeMatch + 1)} disabled={!matches.length} />
          </View>
          {showReplace ? (
            <View style={styles.findRow}>
              <View style={{ width: 40 }} />
              <TextInput
                testID="replace-input"
                value={replQ}
                onChangeText={setReplQ}
                placeholder="Replace"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.findInput}
              />
              <Pressable testID="replace-one-btn" onPress={replaceOne} style={styles.smallBtn}><Text style={styles.smallBtnText}>Replace</Text></Pressable>
              <Pressable testID="replace-all-btn" onPress={replaceAll} style={styles.smallBtn}><Text style={styles.smallBtnText}>All</Text></Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {showBanner ? (
        <View style={styles.banner} testID="language-suggestion-banner">
          <Icon name="lightbulb-on-outline" size={18} color={colors.onBrandTertiary} />
          <Text style={styles.bannerText}>Looks like {getLang(lang.detected).name}. Switch highlighting?</Text>
          <Pressable testID="banner-switch-btn" onPress={() => updateDoc(doc.id, { language: lang.detected })} style={styles.bannerBtn}><Text style={styles.bannerBtnText}>Switch</Text></Pressable>
          <IconButton testID="banner-dismiss-btn" name="close" size={16} color={colors.onBrandTertiary} onPress={() => setDismissed((d) => ({ ...d, [doc.id]: lang.detected }))} />
        </View>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <GestureDetector gesture={pinch}>
        <View style={{ flex: 1, backgroundColor: colors.surface }} collapsable={false}>
          {liveZoom != null ? (
            <View style={styles.zoomBadge} testID="zoom-badge"><Text style={styles.zoomBadgeText}>{Math.round(liveZoom * 100)}%</Text></View>
          ) : null}
          <RichEditor
            value={text}
            onChangeText={onChangeText}
            onSelectionChange={(s) => { selRef.current = s; setSel(s); }}
            selection={forcedSel}
            language={lang.effective}
            font={editorStyle}
            wordWrap={settings.wordWrap}
            lineNumbers={settings.lineNumbers}
            highlight={settings.highlight}
            matches={findOpen ? matches : []}
            activeMatch={activeMatch}
            inputRef={inputRef}
            bottomPad={48}
          />
        </View>
        </GestureDetector>

        {suggestions.length ? (
          <View style={styles.suggestWrap} testID="autocomplete-bar">
            <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestRow}>
              {suggestions.map((s) => (
                <Pressable key={s.kind + s.label} testID={`suggestion-${s.label}`} onPress={() => applySuggestion(s)} style={styles.suggest}>
                  <Icon name={s.kind === "snippet" ? "code-braces" : s.kind === "keyword" ? "key-variant" : "alphabetical-variant"} size={14} color={s.kind === "snippet" ? colors.brandPrimary : colors.muted} />
                  <Text style={styles.suggestText}>{s.label}</Text>
                  {s.desc ? <Text style={styles.suggestDesc}>{s.desc}</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.keysWrap}>
          <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.keys} testID="accessory-bar">
            <Pressable testID="key-left" onPress={() => moveCaret(-1)} style={styles.key}><Icon name="chevron-left" size={18} color={colors.onSurfaceTertiary} /></Pressable>
            <Pressable testID="key-right" onPress={() => moveCaret(1)} style={styles.key}><Icon name="chevron-right" size={18} color={colors.onSurfaceTertiary} /></Pressable>
            {KEYS.map((k, i) => (
              <Pressable key={i} testID={`key-${i}`} onPress={() => onKey(k.ins)} style={({ pressed }) => [styles.key, pressed && { backgroundColor: colors.brandTertiary }]}>
                <Text style={styles.keyText}>{k.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={[styles.status, { paddingBottom: insets.bottom + spacing.xs }]} testID="status-bar">
          <View style={styles.statusPill} testID="cursor-position">
            <Icon name="cursor-text" size={13} color={colors.onBrandTertiary} />
            <Text style={styles.statusStrong}>Ln {cursor.ln}, Col {cursor.col}{cursor.selected ? ` (${cursor.selected} sel)` : ""}</Text>
          </View>
          <Text style={styles.statusText} testID="word-count">{cursor.words} words</Text>
          <Text style={styles.statusText} testID="char-count">{cursor.chars} chars</Text>
          <Text style={styles.statusText} testID="line-count">{cursor.lines} lines</Text>
          <Pressable testID="status-language-btn" onPress={() => setLangOpen(true)}>
            <Text style={[styles.statusText, { color: colors.brandPrimary }]}>{langInfo.name}</Text>
          </Pressable>
          <View style={styles.zoomRow}>
            <Icon name="magnify-minus-outline" size={14} color={colors.muted} />
            <Slider
              testID="zoom-slider"
              style={{ width: 110, height: 28 }}
              minimumValue={0.5}
              maximumValue={2.5}
              step={0.05}
              value={settings.zoom ?? 1}
              onValueChange={(v) => setLiveZoom(Math.round(v * 20) / 20)}
              onSlidingComplete={(v) => { updateSettings({ zoom: Math.round(v * 20) / 20 }); setLiveZoom(null); }}
              minimumTrackTintColor={colors.brandPrimary}
              maximumTrackTintColor={colors.borderStrong}
              thumbTintColor={colors.brandPrimary}
            />
            <Icon name="magnify-plus-outline" size={14} color={colors.muted} />
            <Pressable testID="zoom-reset-btn" onPress={() => updateSettings({ zoom: 1 })}>
              <Text style={styles.statusText} testID="zoom-value">{Math.round(zoom * 100)}%</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Sheet visible={moreOpen} onClose={() => setMoreOpen(false)} title={doc.name} testID="editor-more-sheet">
        <ScrollView>
          <SheetRow testID="more-language" icon="code-tags" label="Language" right={doc.language === "auto" ? `Auto (${langInfo.name})` : langInfo.name} onPress={() => { setMoreOpen(false); setLangOpen(true); }} />
          <SheetRow testID="more-commit" icon="source-commit" label="Save version (commit)" onPress={() => { setMoreOpen(false); setCommitOpen(true); }} />
          <SheetRow testID="more-history" icon="history" label="Version history & diff" onPress={() => goTo("/history")} />
          <SheetRow testID="more-check" icon="spellcheck" label="Spelling, grammar & AI coach" onPress={() => goTo("/check")} />
          <SheetRow testID="more-goto" icon="format-list-numbered" label="Go to line" onPress={() => { setMoreOpen(false); setGotoOpen(true); }} />
          <SheetRow testID="more-rename" icon="pencil-outline" label="Rename" onPress={() => { setMoreOpen(false); setRenameOpen(true); }} />
          <SheetRow testID="more-share" icon="share-variant-outline" label="Share / Export" onPress={async () => { setMoreOpen(false); const r = await shareText(doc.name, textRef.current).catch(() => null); if (r === "copied") toast("Copied to clipboard", "success"); }} />
          <SheetRow testID="more-compare" icon="compare-horizontal" label="Compare with another text" onPress={() => { flush(); setMoreOpen(false); const id = doc.id; setTimeout(() => router.push({ pathname: "/compare", params: { docId: id } }), 300); }} />
          <SheetRow testID="more-copy" icon="content-copy" label="Copy all text" onPress={async () => { await copyText(textRef.current); setMoreOpen(false); toast("Copied to clipboard", "success"); }} />
          <SheetRow testID="more-settings" icon="cog-outline" label="Editor settings" onPress={() => { setMoreOpen(false); router.push("/settings"); }} />
          <SheetRow testID="more-close" icon="close-box-outline" label="Close tab" onPress={() => { setMoreOpen(false); setTimeout(() => requestClose(doc.id), 300); }} />
          {lastClosed.current && !openTabs.includes(lastClosed.current) && docs.some((d) => d.id === lastClosed.current) ? (
            <SheetRow testID="more-reopen" icon="tab-plus" label="Reopen closed tab" onPress={() => { setMoreOpen(false); if (lastClosed.current) openDoc(lastClosed.current); }} />
          ) : null}
        </ScrollView>
      </Sheet>

      <Sheet visible={!!closeAsk} onClose={() => setCloseAsk(null)} title="Close this tab?" testID="close-tab-sheet">
        <Text style={styles.sheetText}>
          “{docs.find((d) => d.id === closeAsk)?.name}” is saved and stays in your files — you can reopen it any time.
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
          <Button testID="close-tab-cancel" label="Keep open" variant="secondary" style={{ flex: 1 }} onPress={() => setCloseAsk(null)} />
          <Button testID="close-tab-confirm" label="Close tab" style={{ flex: 1 }} onPress={() => closeAsk && doClose(closeAsk)} />
        </View>
        <Pressable testID="close-tab-dont-ask" onPress={() => { updateSettings({ confirmCloseTab: false }); if (closeAsk) doClose(closeAsk); }} style={{ alignSelf: "center", padding: spacing.md }}>
          <Text style={[styles.sheetText, { color: colors.brandPrimary }]}>Close and don’t ask again</Text>
        </Pressable>
      </Sheet>

      <Sheet visible={langOpen} onClose={() => setLangOpen(false)} title="Language mode" testID="language-sheet">
        <ScrollView style={{ maxHeight: 420 }}>
          <SheetRow testID="lang-auto" icon="auto-fix" label={`Auto detect (${getLang(lang.detected).name})`} right={doc.language === "auto" ? "✓" : undefined} onPress={() => { updateDoc(doc.id, { language: "auto" }); setLangOpen(false); }} />
          {LANGUAGES.map((l) => (
            <SheetRow key={l.id} testID={`lang-${l.id}`} icon={l.icon as never} label={l.name} right={doc.language === l.id ? "✓" : undefined} onPress={() => { updateDoc(doc.id, { language: l.id }); setLangOpen(false); }} />
          ))}
        </ScrollView>
      </Sheet>

      <PromptSheet
        visible={commitOpen}
        testID="commit-sheet"
        title="Save version"
        placeholder="Describe this version (e.g. Added intro)"
        confirmLabel="Commit"
        onClose={() => setCommitOpen(false)}
        onSubmit={async (label) => { flush(); await addVersion(doc.id, textRef.current, { auto: false, label }); setCommitOpen(false); toast("Version saved", "success"); }}
      />
      <PromptSheet
        visible={gotoOpen}
        testID="goto-sheet"
        title={`Go to line (1–${cursor.lines})`}
        placeholder="Line number"
        keyboardType="number-pad"
        confirmLabel="Go"
        onClose={() => setGotoOpen(false)}
        onSubmit={(v) => {
          const n = Math.max(1, Math.min(cursor.lines, parseInt(v, 10) || 1));
          const ls = textRef.current.split("\n").slice(0, n - 1).reduce((a, l) => a + l.length + 1, 0);
          const ns = { start: ls, end: ls };
          selRef.current = ns; setSel(ns); setForcedSel(ns);
          setTimeout(() => inputRef.current?.focus(), 350);
          setGotoOpen(false);
        }}
      />
      <PromptSheet
        visible={renameOpen}
        testID="editor-rename-sheet"
        title="Rename file"
        initial={doc.name}
        confirmLabel="Rename"
        onClose={() => setRenameOpen(false)}
        onSubmit={(v) => { updateDoc(doc.id, { name: v }); setRenameOpen(false); }}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  center: { alignItems: "center", justifyContent: "center", gap: spacing.md },
  emptyTitle: { color: c.onSurface, fontSize: 18, fontWeight: "700" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xs, paddingBottom: spacing.xs, backgroundColor: c.surfaceSecondary },
  docTitle: { color: c.onSurface, fontSize: 15, fontWeight: "700" },
  docSub: { color: c.muted, fontSize: 11 },
  tabsWrap: { height: 40, backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.border },
  tabs: { alignItems: "stretch" },
  tab: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, maxWidth: 200, borderTopWidth: 2, borderTopColor: "transparent", borderRightWidth: 1, borderRightColor: c.border },
  tabActive: { backgroundColor: c.surface, borderTopColor: c.brandPrimary },
  tabText: { color: c.muted, fontSize: 13, flexShrink: 1 },
  tabTextActive: { color: c.onSurface, fontWeight: "600" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.warning },
  newTab: { width: 44, alignItems: "center", justifyContent: "center" },
  find: { backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.border, paddingVertical: spacing.xs, paddingRight: spacing.xs },
  findRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  findInput: { flex: 1, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: spacing.sm, fontFamily: MONO, fontSize: 13 },
  findCount: { color: c.muted, fontSize: 12, minWidth: 36, textAlign: "center" },
  smallBtn: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center", marginLeft: spacing.xs },
  smallBtnText: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  banner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingLeft: spacing.md, backgroundColor: c.brandTertiary },
  bannerText: { flex: 1, color: c.onBrandTertiary, fontSize: 13 },
  bannerBtn: { paddingHorizontal: spacing.md, height: 32, borderRadius: radius.sm, backgroundColor: c.brandPrimary, justifyContent: "center" },
  bannerBtnText: { color: c.onBrandPrimary, fontSize: 13, fontWeight: "700" },
  suggestWrap: { height: 44, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border, justifyContent: "center" },
  suggestRow: { gap: spacing.xs, paddingHorizontal: spacing.sm, alignItems: "center" },
  suggest: { flexShrink: 0, height: 32, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary },
  suggestText: { color: c.onSurface, fontFamily: MONO, fontSize: 13 },
  suggestDesc: { color: c.muted, fontSize: 11 },
  keysWrap: { height: 44, backgroundColor: c.surfaceTertiary, borderTopWidth: 1, borderTopColor: c.border },
  keys: { alignItems: "center", paddingHorizontal: spacing.xs, gap: 2 },
  key: { flexShrink: 0, minWidth: 40, height: 38, paddingHorizontal: spacing.sm, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  keyText: { color: c.onSurfaceTertiary, fontFamily: MONO, fontSize: 15 },
  status: { flexDirection: "row", flexWrap: "wrap", rowGap: 2, justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.md, paddingTop: spacing.xs, backgroundColor: c.surfaceSecondary, gap: spacing.sm },
  statusText: { color: c.onSurfaceSecondary, fontSize: 11, fontFamily: MONO },
  zoomRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  zoomBadge: { position: "absolute", top: spacing.md, alignSelf: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: c.surfaceInverse, zIndex: 2 },
  zoomBadgeText: { color: c.onSurfaceInverse, fontWeight: "700", fontSize: 13 },
  sheetText: { color: c.onSurfaceSecondary, fontSize: 14, lineHeight: 20 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, height: 22, borderRadius: radius.sm, backgroundColor: c.brandTertiary },
  statusStrong: { color: c.onBrandTertiary, fontSize: 11, fontFamily: MONO, fontWeight: "700" },
}));
