import { getLang, Lang } from "./languages";

export type TokKind = "keyword" | "string" | "number" | "comment" | "function" | "type" | "operator" | "tag" | "attr";
export type Seg = { t: string; k?: TokKind; m?: 1 | 2 };
type Res = { segs: Seg[]; state: number };

const OPS = "+-*/%=<>!&|^~?:;,.{}()[]";
const caches = new Map<string, Map<string, Res>>();

function cacheFor(id: string) {
  let c = caches.get(id);
  if (!c || c.size > 6000) {
    c = new Map();
    caches.set(id, c);
  }
  return c;
}

function makePusher(segs: Seg[]) {
  let plain = "";
  return {
    plain: (s: string) => {
      plain += s;
    },
    push: (t: string, k?: TokKind) => {
      if (plain) {
        segs.push({ t: plain });
        plain = "";
      }
      if (t) segs.push({ t, k });
    },
  };
}

function tokCode(line: string, lang: Lang, state: number): Res {
  const segs: Seg[] = [];
  const p = makePusher(segs);
  const wordRe = lang.wordChars ?? /^[A-Za-z_$@][\w$]*/;
  let i = 0;
  const n = line.length;
  while (i < n) {
    if (state === 1 && lang.block) {
      const endTok = lang.block[1];
      const end = line.indexOf(endTok, i);
      if (end < 0) {
        p.push(line.slice(i), "comment");
        i = n;
        break;
      }
      p.push(line.slice(i, end + endTok.length), "comment");
      i = end + endTok.length;
      state = 0;
      continue;
    }
    if (lang.lineComment && lang.lineComment.some((c) => line.startsWith(c, i))) {
      // avoid treating "#include" as comment when language uses "#" keywords (not applicable here)
      p.push(line.slice(i), "comment");
      i = n;
      break;
    }
    if (lang.block && line.startsWith(lang.block[0], i)) {
      state = 1;
      p.push(lang.block[0], "comment");
      i += lang.block[0].length;
      continue;
    }
    const ch = line[i];
    if (lang.strings.includes(ch)) {
      let j = i + 1;
      while (j < n && line[j] !== ch) {
        if (line[j] === "\\") j++;
        j++;
      }
      j = Math.min(j + 1, n);
      let k: TokKind = "string";
      if ((lang.id === "json" || lang.id === "yaml") && /^\s*:/.test(line.slice(j, j + 8))) k = "attr";
      p.push(line.slice(i, j), k);
      i = j;
      continue;
    }
    if (ch >= "0" && ch <= "9" && !/[\w$]/.test(line[i - 1] ?? "")) {
      const m = /^(0[xX][\da-fA-F]+|\d[\d_]*(\.\d+)?([eE][+-]?\d+)?)/.exec(line.slice(i, i + 48));
      if (m) {
        p.push(m[0], "number");
        i += m[0].length;
        continue;
      }
    }
    if (/[A-Za-z_$@#]/.test(ch)) {
      const m = wordRe.exec(line.slice(i, i + 80));
      if (m) {
        const word = m[0];
        const w = lang.caseInsensitive ? word.toLowerCase() : word;
        let k: TokKind | undefined;
        if (lang.keywords.has(w)) k = "keyword";
        else if (lang.literals.has(w)) k = "number";
        else if (lang.types.has(w)) k = "type";
        else {
          const after = line.slice(i + word.length).trimStart();
          if (lang.id === "css" || lang.id === "yaml") {
            if (after.startsWith(":") && !after.startsWith("::")) k = "attr";
          } else if (after.startsWith("(")) k = "function";
          else if (word[0] === "@") k = "attr";
          else if (/^[A-Z][a-z0-9]/.test(word) && lang.id !== "sql") k = "type";
        }
        if (k) p.push(word, k);
        else p.plain(word);
        i += word.length;
        continue;
      }
    }
    if (OPS.includes(ch)) {
      let j = i + 1;
      while (j < n && OPS.includes(line[j]) && !(lang.block && line.startsWith(lang.block[0], j)) && !(lang.lineComment?.some((c) => line.startsWith(c, j)))) j++;
      p.push(line.slice(i, j), "operator");
      i = j;
      continue;
    }
    p.plain(ch);
    i++;
  }
  p.push("");
  return { segs, state };
}

function tokMarkup(line: string, state: number): Res {
  const segs: Seg[] = [];
  const p = makePusher(segs);
  let i = 0;
  const n = line.length;
  while (i < n) {
    if (state === 1) {
      const end = line.indexOf("-->", i);
      if (end < 0) {
        p.push(line.slice(i), "comment");
        i = n;
        break;
      }
      p.push(line.slice(i, end + 3), "comment");
      i = end + 3;
      state = 0;
      continue;
    }
    const ch = line[i];
    if (state === 2) {
      if (line.startsWith("/>", i)) {
        p.push("/>", "tag");
        i += 2;
        state = 0;
        continue;
      }
      if (ch === ">") {
        p.push(">", "tag");
        i++;
        state = 0;
        continue;
      }
      if (ch === '"' || ch === "'") {
        const end = line.indexOf(ch, i + 1);
        const j = end < 0 ? n : end + 1;
        p.push(line.slice(i, j), "string");
        i = j;
        continue;
      }
      const m = /^[\w:@.-]+/.exec(line.slice(i, i + 60));
      if (m) {
        p.push(m[0], "attr");
        i += m[0].length;
        continue;
      }
      if (ch === "=") {
        p.push("=", "operator");
        i++;
        continue;
      }
      p.plain(ch);
      i++;
      continue;
    }
    if (line.startsWith("<!--", i)) {
      state = 1;
      p.push("<!--", "comment");
      i += 4;
      continue;
    }
    if (ch === "<" && /[/!?A-Za-z]/.test(line[i + 1] ?? "")) {
      const m = /^<\/?[!?]?[\w:.-]*/.exec(line.slice(i, i + 60))!;
      p.push(m[0], "tag");
      i += m[0].length;
      state = 2;
      continue;
    }
    if (ch === "&") {
      const m = /^&#?\w+;/.exec(line.slice(i, i + 12));
      if (m) {
        p.push(m[0], "number");
        i += m[0].length;
        continue;
      }
    }
    p.plain(ch);
    i++;
  }
  p.push("");
  return { segs, state };
}

const MD_INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*)|(\[[^\]]*\]\([^)]*\))/g;

function tokMarkdown(line: string, state: number): Res {
  if (/^\s*```/.test(line)) return { segs: [{ t: line, k: "string" }], state: state === 3 ? 0 : 3 };
  if (state === 3) return { segs: [{ t: line, k: "string" }], state };
  if (/^#{1,6}\s/.test(line)) return { segs: [{ t: line, k: "keyword" }], state };
  if (/^\s*>/.test(line)) return { segs: [{ t: line, k: "comment" }], state };
  const segs: Seg[] = [];
  let rest = line;
  const lm = /^(\s*)([-*+]|\d+\.)(\s+)(\[[ xX]\]\s)?/.exec(line);
  if (lm) {
    if (lm[1]) segs.push({ t: lm[1] });
    segs.push({ t: lm[2], k: "operator" });
    segs.push({ t: lm[3] });
    if (lm[4]) segs.push({ t: lm[4], k: "number" });
    rest = line.slice(lm[0].length);
  }
  let last = 0;
  MD_INLINE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MD_INLINE.exec(rest))) {
    if (m.index > last) segs.push({ t: rest.slice(last, m.index) });
    const k: TokKind = m[1] ? "string" : m[2] ? "function" : m[3] ? "type" : "attr";
    segs.push({ t: m[0], k });
    last = m.index + m[0].length;
  }
  if (last < rest.length) segs.push({ t: rest.slice(last) });
  return { segs, state };
}

export function tokenizeLines(lines: string[], langId: string): Seg[][] {
  const lang = getLang(langId);
  const cache = cacheFor(lang.id);
  const out: Seg[][] = new Array(lines.length);
  let state = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const key = state + "\u0001" + line;
    let r = cache.get(key);
    if (!r) {
      if (lang.mode === "plain") r = { segs: line ? [{ t: line }] : [], state: 0 };
      else if (lang.mode === "markup") r = tokMarkup(line, state);
      else if (lang.mode === "markdown") r = tokMarkdown(line, state);
      else r = tokCode(line, lang, state);
      cache.set(key, r);
    }
    out[i] = r.segs;
    state = r.state;
  }
  return out;
}

/** Overlay match highlight ranges (line-relative) onto segments. */
export function applyMatches(segs: Seg[], ranges: [number, number, 1 | 2][]): Seg[] {
  if (!ranges.length) return segs;
  const out: Seg[] = [];
  let pos = 0;
  for (const s of segs) {
    const sStart = pos;
    const sEnd = pos + s.t.length;
    let cur = sStart;
    for (const [a, b, m] of ranges) {
      if (b <= cur || a >= sEnd) continue;
      const from = Math.max(a, cur);
      const to = Math.min(b, sEnd);
      if (from > cur) out.push({ t: s.t.slice(cur - sStart, from - sStart), k: s.k });
      out.push({ t: s.t.slice(from - sStart, to - sStart), k: s.k, m });
      cur = to;
    }
    if (cur < sEnd) out.push({ t: s.t.slice(cur - sStart), k: s.k });
    pos = sEnd;
  }
  return out;
}
