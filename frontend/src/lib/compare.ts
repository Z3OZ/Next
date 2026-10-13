// Text comparator: line or word level diff with locations, similarity and summary.

export type CompareMode = "lines" | "words";
export type CompareOpts = { mode: CompareMode; ignoreCase: boolean; ignoreSpace: boolean };
export type Loc = { line: number; col: number };
export type Chunk = {
  kind: "added" | "removed" | "changed" | "same";
  aText: string;
  bText: string;
  aLoc: Loc;
  bLoc: Loc;
  units: number; // lines or words involved
};
export type CompareResult = {
  chunks: Chunk[];
  summary: { similarity: number; added: number; removed: number; changed: number; same: number; unitsA: number; unitsB: number; diffCount: number };
  tooLarge?: boolean;
};

function tokenize(t: string, mode: CompareMode): string[] {
  if (mode === "lines") return t.split("\n").map((l, i, arr) => (i < arr.length - 1 ? l + "\n" : l));
  return t.split(/(\s+)/).filter((x) => x.length);
}

function locator(tokens: string[]) {
  const locs: Loc[] = [];
  let line = 1;
  let col = 1;
  for (const tk of tokens) {
    locs.push({ line, col });
    for (const ch of tk) {
      if (ch === "\n") {
        line++;
        col = 1;
      } else col++;
    }
  }
  locs.push({ line, col });
  return locs;
}

const isUnit = (t: string, mode: CompareMode) => (mode === "lines" ? true : /\S/.test(t));

export function compareTexts(a: string, b: string, o: CompareOpts): CompareResult {
  const ta = tokenize(a, o.mode);
  const tb = tokenize(b, o.mode);
  const norm = (t: string) => {
    let x = t;
    if (o.ignoreSpace) x = o.mode === "lines" ? x.trim().replace(/\s+/g, " ") : /^\s+$/.test(x) ? " " : x;
    if (o.ignoreCase) x = x.toLowerCase();
    return x;
  };
  const na = ta.map(norm);
  const nb = tb.map(norm);
  const la = locator(ta);
  const lb = locator(tb);

  let pre = 0;
  while (pre < na.length && pre < nb.length && na[pre] === nb[pre]) pre++;
  let suf = 0;
  while (suf < na.length - pre && suf < nb.length - pre && na[na.length - 1 - suf] === nb[nb.length - 1 - suf]) suf++;
  const n = na.length - pre - suf;
  const m = nb.length - pre - suf;
  const ops: { t: "s" | "d" | "a"; i: number; j: number }[] = [];
  for (let k = 0; k < pre; k++) ops.push({ t: "s", i: k, j: k });
  let tooLarge = false;
  if (n * m > 4_000_000) {
    tooLarge = true;
    for (let k = 0; k < n; k++) ops.push({ t: "d", i: pre + k, j: pre });
    for (let k = 0; k < m; k++) ops.push({ t: "a", i: pre + n, j: pre + k });
  } else {
    const dp: Uint32Array[] = [];
    for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        dp[i][j] = na[pre + i] === nb[pre + j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && na[pre + i] === nb[pre + j]) {
        ops.push({ t: "s", i: pre + i, j: pre + j });
        i++;
        j++;
      } else if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) {
        ops.push({ t: "d", i: pre + i, j: pre + j });
        i++;
      } else {
        ops.push({ t: "a", i: pre + i, j: pre + j });
        j++;
      }
    }
  }
  for (let k = 0; k < suf; k++) ops.push({ t: "s", i: na.length - suf + k, j: nb.length - suf + k });

  const chunks: Chunk[] = [];
  let k = 0;
  let added = 0;
  let removed = 0;
  let changed = 0;
  let same = 0;
  while (k < ops.length) {
    const start = ops[k];
    if (start.t === "s") {
      let aT = "";
      let bT = "";
      let units = 0;
      while (k < ops.length && ops[k].t === "s") {
        aT += ta[ops[k].i];
        bT += tb[ops[k].j];
        if (isUnit(ta[ops[k].i], o.mode)) units++;
        k++;
      }
      same += units;
      chunks.push({ kind: "same", aText: aT, bText: bT, aLoc: la[start.i], bLoc: lb[start.j], units });
      continue;
    }
    let aT = "";
    let bT = "";
    let du = 0;
    let au = 0;
    let firstI = start.i;
    let firstJ = start.j;
    while (k < ops.length && ops[k].t !== "s") {
      const op = ops[k];
      if (op.t === "d") {
        aT += ta[op.i];
        if (isUnit(ta[op.i], o.mode)) du++;
        firstI = Math.min(firstI, op.i);
      } else {
        bT += tb[op.j];
        if (isUnit(tb[op.j], o.mode)) au++;
        firstJ = Math.min(firstJ, op.j);
      }
      k++;
    }
    // whitespace-only chunk in word mode counts as same-ish (skip as a diff)
    if (!du && !au) {
      chunks.push({ kind: "same", aText: aT, bText: bT, aLoc: la[firstI], bLoc: lb[firstJ], units: 0 });
      continue;
    }
    const kind = du && au ? "changed" : du ? "removed" : "added";
    if (kind === "changed") changed += Math.max(du, au);
    removed += du;
    added += au;
    chunks.push({ kind, aText: aT, bText: bT, aLoc: la[firstI], bLoc: lb[firstJ], units: Math.max(du, au) });
  }
  const unitsA = ta.filter((t) => isUnit(t, o.mode)).length;
  const unitsB = tb.filter((t) => isUnit(t, o.mode)).length;
  const similarity = unitsA + unitsB ? Math.round(((2 * same) / (unitsA + unitsB)) * 1000) / 10 : 100;
  return {
    chunks,
    summary: { similarity, added, removed, changed, same, unitsA, unitsB, diffCount: chunks.filter((c) => c.kind !== "same").length },
    tooLarge,
  };
}
