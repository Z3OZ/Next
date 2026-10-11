export type DiffLine = { type: "same" | "add" | "del"; text: string; oldNo?: number; newNo?: number };

/** Line-based LCS diff between old and new text. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const am = a.slice(pre, a.length - suf);
  const bm = b.slice(pre, b.length - suf);
  const out: DiffLine[] = [];
  for (let i = 0; i < pre; i++) out.push({ type: "same", text: a[i], oldNo: i + 1, newNo: i + 1 });

  const n = am.length;
  const m = bm.length;
  if (n * m > 3_000_000) {
    am.forEach((t, i) => out.push({ type: "del", text: t, oldNo: pre + i + 1 }));
    bm.forEach((t, i) => out.push({ type: "add", text: t, newNo: pre + i + 1 }));
  } else {
    const dp: Uint32Array[] = [];
    for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        dp[i][j] = am[i] === bm[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (am[i] === bm[j]) {
        out.push({ type: "same", text: am[i], oldNo: pre + i + 1, newNo: pre + j + 1 });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        out.push({ type: "del", text: am[i], oldNo: pre + i + 1 });
        i++;
      } else {
        out.push({ type: "add", text: bm[j], newNo: pre + j + 1 });
        j++;
      }
    }
    while (i < n) out.push({ type: "del", text: am[i], oldNo: pre + ++i });
    while (j < m) out.push({ type: "add", text: bm[j], newNo: pre + ++j });
  }
  for (let k = 0; k < suf; k++) {
    const ai = a.length - suf + k;
    const bi = b.length - suf + k;
    out.push({ type: "same", text: a[ai], oldNo: ai + 1, newNo: bi + 1 });
  }
  return out;
}

export function diffStats(lines: DiffLine[]) {
  let add = 0;
  let del = 0;
  for (const l of lines) {
    if (l.type === "add") add++;
    else if (l.type === "del") del++;
  }
  return { add, del };
}

export type DiffBlock = { kind: "lines"; lines: DiffLine[] } | { kind: "fold"; count: number };

/** Collapse long unchanged runs, keeping 3 lines of context. */
export function foldDiff(lines: DiffLine[], ctx = 3): DiffBlock[] {
  const blocks: DiffBlock[] = [];
  let i = 0;
  let buf: DiffLine[] = [];
  while (i < lines.length) {
    if (lines[i].type !== "same") {
      buf.push(lines[i++]);
      continue;
    }
    let j = i;
    while (j < lines.length && lines[j].type === "same") j++;
    const run = lines.slice(i, j);
    const isStart = i === 0;
    const isEnd = j === lines.length;
    const keepHead = isStart ? 0 : ctx;
    const keepTail = isEnd ? 0 : ctx;
    if (run.length > keepHead + keepTail + 2) {
      buf.push(...run.slice(0, keepHead));
      if (buf.length) blocks.push({ kind: "lines", lines: buf });
      blocks.push({ kind: "fold", count: run.length - keepHead - keepTail });
      buf = run.slice(run.length - keepTail);
    } else buf.push(...run);
    i = j;
  }
  if (buf.length) blocks.push({ kind: "lines", lines: buf });
  return blocks;
}
