import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { storage } from "@/src/utils/storage";
import { setColorScheme } from "@/src/theme";

export type Doc = {
  id: string;
  name: string;
  content: string;
  language: string; // "auto" or LangId
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  rev: number; // bumps on external changes (restore / apply fix / sync)
};

export type Version = { id: string; content: string; createdAt: number; label: string; auto: boolean };

export type Settings = {
  theme: "dark" | "light" | "system";
  fontSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  highlight: boolean;
  autocomplete: boolean;
  autoIndent: boolean;
  autoClose: boolean;
  autosaveSec: number;
  tabSize: number;
  syncId: string;
  lastSync: number | null;
};

const genSync = () => {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () => Array.from({ length: 4 }, () => c[Math.floor(Math.random() * c.length)]).join("");
  return `NX-${part()}-${part()}`;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark", fontSize: 14, wordWrap: true, lineNumbers: true, highlight: true, autocomplete: true,
  autoIndent: true, autoClose: true, autosaveSec: 2, tabSize: 2, syncId: "", lastSync: null,
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const K = {
  index: "nx:index",
  doc: (id: string) => `nx:doc:${id}`,
  ver: (id: string) => `nx:ver:${id}`,
  settings: "nx:settings",
  tabs: "nx:tabs",
};

const MAX_VERSIONS = 100;

type Ctx = {
  ready: boolean;
  docs: Doc[];
  settings: Settings;
  openTabs: string[];
  activeId: string | null;
  createDoc: (p?: Partial<Pick<Doc, "name" | "content" | "language">>) => string;
  updateDoc: (id: string, patch: Partial<Doc>, opts?: { external?: boolean }) => void;
  deleteDoc: (id: string) => void;
  duplicateDoc: (id: string) => string | null;
  openDoc: (id: string) => void;
  closeTab: (id: string) => void;
  updateSettings: (p: Partial<Settings>) => void;
  getVersions: (id: string) => Promise<Version[]>;
  addVersion: (id: string, content: string, opts: { label?: string; auto: boolean }) => Promise<void>;
  deleteVersion: (docId: string, versionId: string) => Promise<void>;
  mergeDocs: (incoming: Omit<Doc, "rev">[]) => number;
};

const StoreCtx = createContext<Ctx | null>(null);

const WELCOME = `# Welcome to NexaEdit

A fast, offline-first text & code editor inspired by Jota++.

## Highlights
- **Autosave** with full version history and diff
- Syntax highlighting for 20+ languages with *auto detection*
- Find & replace with regex, undo / redo, line numbers
- Snippets & autocomplete — type \`log\` in a JS file
- Offline spelling, grammar & style checker
- AI Writing Coach for deeper feedback

> Tip: tap the spellcheck icon to analyze this document.

- [ ] Try creating a new file
- [ ] Open version history
`;

const SAMPLE_JS = `// Sample JavaScript file
import { useState } from 'react';

function greet(name) {
  const message = \`Hello, \${name}!\`;
  console.log(message);
  return message.length * 2;
}

class Counter {
  constructor(start = 0) {
    this.value = start;
  }
  increment() {
    return ++this.value;
  }
}

/* Block comment
   spanning lines */
const items = [1, 2, 3].map((n) => n * 10);
greet("Jota");
`;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const docsRef = useRef<Doc[]>([]);
  const verCache = useRef(new Map<string, Version[]>());

  const commitDocs = useCallback((next: Doc[]) => {
    docsRef.current = next;
    setDocs(next);
    storage.setItem(K.index, JSON.stringify(next.map((d) => d.id)));
  }, []);

  const persistDoc = (d: Doc) => storage.setItem(K.doc(d.id), JSON.stringify(d));

  // Load
  useEffect(() => {
    (async () => {
      const s = await storage.getItem(K.settings, "");
      const loadedSettings: Settings = { ...DEFAULT_SETTINGS, ...(s ? JSON.parse(s) : {}) };
      if (!loadedSettings.syncId) loadedSettings.syncId = genSync();
      setSettings(loadedSettings);
      setColorScheme(loadedSettings.theme === "system" ? null : loadedSettings.theme);
      storage.setItem(K.settings, JSON.stringify(loadedSettings));

      const idxRaw = await storage.getItem(K.index, "");
      let list: Doc[] = [];
      if (idxRaw) {
        const ids: string[] = JSON.parse(idxRaw);
        const loaded = await Promise.all(ids.map((id) => storage.getItem(K.doc(id), "")));
        list = loaded.filter(Boolean).map((r) => JSON.parse(r as string) as Doc);
      } else {
        const now = Date.now();
        list = [
          { id: uid(), name: "Welcome.md", content: WELCOME, language: "auto", createdAt: now, updatedAt: now, pinned: true, rev: 0 },
          { id: uid(), name: "sample.js", content: SAMPLE_JS, language: "auto", createdAt: now - 1000, updatedAt: now - 1000, pinned: false, rev: 0 },
        ];
        list.forEach((d) => persistDoc(d));
      }
      docsRef.current = list;
      setDocs(list);
      storage.setItem(K.index, JSON.stringify(list.map((d) => d.id)));
      const tabsRaw = await storage.getItem(K.tabs, "");
      if (tabsRaw) {
        const t = JSON.parse(tabsRaw) as { open: string[]; active: string | null };
        const valid = t.open.filter((id) => list.some((d) => d.id === id));
        setOpenTabs(valid);
        setActiveId(valid.includes(t.active ?? "") ? t.active : valid[0] ?? null);
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (ready) storage.setItem(K.tabs, JSON.stringify({ open: openTabs, active: activeId }));
  }, [openTabs, activeId, ready]);

  const createDoc: Ctx["createDoc"] = useCallback((p) => {
    const now = Date.now();
    const d: Doc = {
      id: uid(), name: p?.name?.trim() || `untitled-${docsRef.current.length + 1}.txt`, content: p?.content ?? "",
      language: p?.language ?? "auto", createdAt: now, updatedAt: now, pinned: false, rev: 0,
    };
    commitDocs([d, ...docsRef.current]);
    persistDoc(d);
    return d.id;
  }, [commitDocs]);

  const updateDoc: Ctx["updateDoc"] = useCallback((id, patch, opts) => {
    let updated: Doc | null = null;
    const next = docsRef.current.map((d) => {
      if (d.id !== id) return d;
      updated = { ...d, ...patch, updatedAt: patch.content !== undefined || patch.name !== undefined ? Date.now() : d.updatedAt, rev: opts?.external ? d.rev + 1 : d.rev };
      return updated;
    });
    if (!updated) return;
    commitDocs(next);
    persistDoc(updated);
  }, [commitDocs]);

  const deleteDoc = useCallback((id: string) => {
    commitDocs(docsRef.current.filter((d) => d.id !== id));
    storage.removeItem(K.doc(id));
    storage.removeItem(K.ver(id));
    verCache.current.delete(id);
    setOpenTabs((tabs) => {
      const nt = tabs.filter((t) => t !== id);
      setActiveId((a) => (a === id ? nt[0] ?? null : a));
      return nt;
    });
  }, [commitDocs]);

  const duplicateDoc = useCallback((id: string) => {
    const d = docsRef.current.find((x) => x.id === id);
    if (!d) return null;
    const name = d.name.replace(/(\.[^.]+)?$/, (ext) => ` copy${ext}`);
    return createDoc({ name, content: d.content, language: d.language });
  }, [createDoc]);

  const openDoc = useCallback((id: string) => {
    setOpenTabs((t) => (t.includes(id) ? t : [...t, id]));
    setActiveId(id);
  }, []);

  const closeTab = useCallback((id: string) => {
    setOpenTabs((tabs) => {
      const idx = tabs.indexOf(id);
      const nt = tabs.filter((t) => t !== id);
      setActiveId((a) => (a === id ? nt[Math.max(0, idx - 1)] ?? null : a));
      return nt;
    });
  }, []);

  const updateSettings = useCallback((p: Partial<Settings>) => {
    setSettings((s) => {
      const n = { ...s, ...p };
      storage.setItem(K.settings, JSON.stringify(n));
      if (p.theme) setColorScheme(p.theme === "system" ? null : p.theme);
      return n;
    });
  }, []);

  const getVersions = useCallback(async (id: string) => {
    const cached = verCache.current.get(id);
    if (cached) return cached;
    const raw = await storage.getItem(K.ver(id), "");
    const list: Version[] = raw ? JSON.parse(raw) : [];
    verCache.current.set(id, list);
    return list;
  }, []);

  const saveVersions = (id: string, list: Version[]) => {
    verCache.current.set(id, list);
    return storage.setItem(K.ver(id), JSON.stringify(list));
  };

  const verQueue = useRef<Promise<void>>(Promise.resolve());
  const addVersion: Ctx["addVersion"] = useCallback((id, content, opts) => {
    const run = async () => {
    const list = [...(await getVersions(id))];
    const last = list[0];
    if (last && last.content === content && opts.auto) return;
    const now = Date.now();
    const v: Version = { id: uid(), content, createdAt: now, label: opts.label ?? "", auto: opts.auto };
    if (opts.auto && last?.auto && now - last.createdAt < 60_000) list[0] = { ...v, id: last.id };
    else if (!opts.auto && last?.auto && last.content === content) list[0] = { ...v, id: last.id }; // promote autosave to named commit
    else list.unshift(v);
    while (list.length > MAX_VERSIONS) {
      const idx = list.map((x) => x.auto).lastIndexOf(true);
      list.splice(idx >= 0 ? idx : list.length - 1, 1);
    }
    await saveVersions(id, list);
    };
    const p = verQueue.current.then(run);
    verQueue.current = p.catch(() => {});
    return p;
  }, [getVersions]);

  const deleteVersion = useCallback(async (docId: string, versionId: string) => {
    const list = (await getVersions(docId)).filter((v) => v.id !== versionId);
    await saveVersions(docId, list);
  }, [getVersions]);

  const mergeDocs = useCallback((incoming: Omit<Doc, "rev">[]) => {
    let changed = 0;
    const map = new Map(docsRef.current.map((d) => [d.id, d]));
    for (const inc of incoming) {
      const cur = map.get(inc.id);
      if (!cur || inc.updatedAt > cur.updatedAt) {
        const d: Doc = { ...inc, rev: (cur?.rev ?? 0) + 1 };
        map.set(inc.id, d);
        persistDoc(d);
        changed++;
      }
    }
    if (changed) commitDocs(Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt));
    return changed;
  }, [commitDocs]);

  const value = useMemo<Ctx>(() => ({
    ready, docs, settings, openTabs, activeId, createDoc, updateDoc, deleteDoc, duplicateDoc, openDoc, closeTab,
    updateSettings, getVersions, addVersion, deleteVersion, mergeDocs,
  }), [ready, docs, settings, openTabs, activeId, createDoc, updateDoc, deleteDoc, duplicateDoc, openDoc, closeTab, updateSettings, getVersions, addVersion, deleteVersion, mergeDocs]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore outside provider");
  return c;
}

export function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
