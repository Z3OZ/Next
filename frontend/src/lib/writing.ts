// Offline rule-based spelling, grammar and style checker.

export type IssueType = "spelling" | "grammar" | "style" | "clarity" | "code";
export type Issue = {
  id: string;
  type: IssueType;
  message: string;
  start: number;
  end: number;
  original: string;
  replacement?: string;
};

const MISSPELLINGS: Record<string, string> = {
  teh: "the", recieve: "receive", recieved: "received", beleive: "believe", belive: "believe", seperate: "separate",
  definately: "definitely", definatly: "definitely", occured: "occurred", occurence: "occurrence", untill: "until",
  wich: "which", whcih: "which", becuase: "because", becasue: "because", beacuse: "because", adress: "address",
  accomodate: "accommodate", acheive: "achieve", arguement: "argument", basicly: "basically", begining: "beginning",
  calender: "calendar", collegue: "colleague", comming: "coming", commitee: "committee", completly: "completely",
  concious: "conscious", curiousity: "curiosity", dilemna: "dilemma", embarass: "embarrass", enviroment: "environment",
  existance: "existence", familar: "familiar", finaly: "finally", foriegn: "foreign", freind: "friend", goverment: "government",
  gaurd: "guard", happend: "happened", harrass: "harass", hieght: "height", immediatly: "immediately", independant: "independent",
  knowlege: "knowledge", liason: "liaison", libary: "library", lisence: "license", maintainance: "maintenance", millenium: "millennium",
  neccessary: "necessary", necesary: "necessary", noticable: "noticeable", occassion: "occasion", ocasion: "occasion",
  persistant: "persistent", posession: "possession", prefered: "preferred", publically: "publicly", realy: "really",
  reccomend: "recommend", recomend: "recommend", refered: "referred", relevent: "relevant", religous: "religious",
  remeber: "remember", resistence: "resistance", responsability: "responsibility", rythm: "rhythm", sucess: "success",
  succesful: "successful", successfull: "successful", supercede: "supersede", suprise: "surprise", tommorow: "tomorrow",
  tomorow: "tomorrow", tounge: "tongue", truely: "truly", twelth: "twelfth", tyranny: "tyranny", wierd: "weird",
  writting: "writing", writen: "written", thier: "their", alot: "a lot", aswell: "as well", everytime: "every time",
  infact: "in fact", incase: "in case", alright: "all right", thru: "through", untill_: "until", wether: "whether",
  wheather: "whether", whith: "with", wiht: "with", taht: "that", thsi: "this", adn: "and", nad: "and", jsut: "just",
  dont: "don't", doesnt: "doesn't", didnt: "didn't", cant: "can't", wont: "won't", isnt: "isn't", wasnt: "wasn't",
  im: "I'm", ive: "I've", youre: "you're", theyre: "they're", couldnt: "couldn't", shouldnt: "shouldn't", wouldnt: "wouldn't",
  arent: "aren't", havent: "haven't", hasnt: "hasn't", lets_: "let's", grammer: "grammar", languge: "language",
  langauge: "language", progam: "program", programing: "programming", fucntion: "function", funtion: "function",
  retrun: "return", lenght: "length", widht: "width", heigth: "height", positon: "position", paramter: "parameter",
  enviorment: "environment", developement: "development", experiance: "experience", explaination: "explanation",
  pronounciation: "pronunciation", priviledge: "privilege", questionaire: "questionnaire", recieving: "receiving",
  similiar: "similar", strenght: "strength", sentance: "sentence", speach: "speech", studing: "studying", useing: "using",
  usualy: "usually", vaccum: "vacuum", visable: "visible", wierdly: "weirdly", yeild: "yield", acually: "actually",
  actualy: "actually", aproach: "approach", apparantly: "apparently", buisness: "business", catagory: "category",
  cemetary: "cemetery", charachter: "character", decison: "decision", diffrent: "different", dissapoint: "disappoint",
  easliy: "easily", effecient: "efficient", exellent: "excellent", grate_: "great", importent: "important", intresting: "interesting",
  interupt: "interrupt", judgement: "judgment", minature: "miniature", mispell: "misspell", oppurtunity: "opportunity",
  peice: "piece", perfomance: "performance", probaly: "probably", probly: "probably", reseach: "research", shedule: "schedule",
  thoughtfull: "thoughtful", togehter: "together", tought: "thought", writeing: "writing",
};

const WORDY: [RegExp, string, string][] = [
  [/\bin order to\b/gi, "to", "Wordy phrase"],
  [/\bdue to the fact that\b/gi, "because", "Wordy phrase"],
  [/\bat this point in time\b/gi, "now", "Wordy phrase"],
  [/\ba large number of\b/gi, "many", "Wordy phrase"],
  [/\bin the event that\b/gi, "if", "Wordy phrase"],
  [/\bfor the purpose of\b/gi, "for", "Wordy phrase"],
  [/\bin spite of the fact that\b/gi, "although", "Wordy phrase"],
  [/\bhas the ability to\b/gi, "can", "Wordy phrase"],
  [/\bat the present time\b/gi, "currently", "Wordy phrase"],
  [/\bprior to\b/gi, "before", "Wordy phrase"],
  [/\bin close proximity\b/gi, "near", "Wordy phrase"],
  [/\beach and every\b/gi, "every", "Redundant phrase"],
  [/\bfree gift\b/gi, "gift", "Redundant phrase"],
  [/\bend result\b/gi, "result", "Redundant phrase"],
  [/\bpast history\b/gi, "history", "Redundant phrase"],
  [/\bclose proximity\b/gi, "proximity", "Redundant phrase"],
];

const CONFUSIONS: [RegExp, string, string][] = [
  [/\b(could|should|would|must|might) of\b/gi, "$1 have", "Use “have”, not “of”, after modal verbs"],
  [/\b(more|less|better|worse|rather|greater|smaller|other) then\b/gi, "$1 than", "Use “than” for comparisons"],
  [/\byour welcome\b/gi, "you're welcome", "“you're” = you are"],
  [/\byour (going|doing|being|right|wrong)\b/gi, "you're $1", "“you're” = you are"],
  [/\bits (a|an|the|not|been|going|very|time)\b/gi, "it's $1", "“it's” = it is"],
  [/\bthere (is|are) (alot|many) of\b/gi, "there $1 many", "Simplify"],
  [/\birregardless\b/gi, "regardless", "Non-standard word"],
  [/\bsuppose to\b/gi, "supposed to", "Use “supposed to”"],
  [/\buse to\b(?= \w)/gi, "used to", "Use “used to” for past habits"],
  [/\bloose (weight|focus|control)\b/gi, "lose $1", "“lose” = misplace / not win"],
  [/\bthey was\b/gi, "they were", "Subject–verb agreement"],
  [/\bwe was\b/gi, "we were", "Subject–verb agreement"],
  [/\byou was\b/gi, "you were", "Subject–verb agreement"],
  [/\b(he|she|it) don't\b/gi, "$1 doesn't", "Subject–verb agreement"],
  [/\b(I|you|we|they) doesn't\b/g, "$1 don't", "Subject–verb agreement"],
  [/\b(he|she|it) have\b/gi, "$1 has", "Subject–verb agreement"],
];

const FILLERS = ["very", "really", "basically", "actually", "literally", "just", "quite", "totally", "simply", "extremely", "somewhat", "kind of", "sort of"];
const CLICHES = ["at the end of the day", "think outside the box", "low-hanging fruit", "in a nutshell", "few and far between", "last but not least", "the bottom line", "needless to say", "it goes without saying", "avoid like the plague"];

let idCounter = 0;
const mk = (type: IssueType, message: string, start: number, original: string, replacement?: string): Issue => ({
  id: `i${++idCounter}`, type, message, start, end: start + original.length, original, replacement,
});

function preserveCase(src: string, rep: string) {
  if (src[0] && src[0] === src[0].toUpperCase() && src[0] !== src[0].toLowerCase()) return rep[0].toUpperCase() + rep.slice(1);
  return rep;
}

function syllables(word: string) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  const m = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}

export type WritingStats = {
  words: number; sentences: number; chars: number; paragraphs: number; avgSentence: number;
  readingMin: number; flesch: number; grade: string; passive: number; fillers: number;
};

export function analyzeWriting(text: string): { issues: Issue[]; stats: WritingStats; score: number; tips: string[] } {
  const issues: Issue[] = [];
  let m: RegExpExecArray | null;

  // Spelling
  const wordRe = /\b[A-Za-z']+\b/g;
  while ((m = wordRe.exec(text))) {
    const w = m[0];
    const fix = MISSPELLINGS[w.toLowerCase()];
    if (fix && !fix.endsWith("_")) issues.push(mk("spelling", `Possible misspelling of “${fix}”`, m.index, w, preserveCase(w, fix)));
  }
  // lowercase i
  const iRe = /(^|[\s(])(i)(?=[\s,.!?;:']|$)/g;
  while ((m = iRe.exec(text))) issues.push(mk("grammar", "Capitalize the pronoun “I”", m.index + m[1].length, "i", "I"));
  // Repeated words
  const repRe = /\b(\w+)\s+\1\b/gi;
  while ((m = repRe.exec(text))) {
    if (/^\d+$/.test(m[1]) || m[1].toLowerCase() === "had" || m[1].toLowerCase() === "that") continue;
    issues.push(mk("grammar", `Repeated word “${m[1]}”`, m.index, m[0], m[1]));
  }
  // a / an
  const aRe = /\b(a|A) ([aeiouAEIOU]\w*)/g;
  while ((m = aRe.exec(text))) {
    if (/^(uni|use|usu|uti|one|once|eu|ur)/i.test(m[2])) continue;
    issues.push(mk("grammar", "Use “an” before a vowel sound", m.index, m[0], `${m[1] === "A" ? "An" : "an"} ${m[2]}`));
  }
  const anRe = /\b(an|An) ([b-df-hj-np-tv-zB-DF-HJ-NP-TV-Z]\w*)/g;
  while ((m = anRe.exec(text))) {
    if (/^(hour|honest|honor|honour|heir|herb)/i.test(m[2])) continue;
    issues.push(mk("grammar", "Use “a” before a consonant sound", m.index, m[0], `${m[1] === "An" ? "A" : "a"} ${m[2]}`));
  }
  // Sentence capitalization
  const capRe = /([.!?])(\s+)([a-z])/g;
  while ((m = capRe.exec(text))) {
    const pos = m.index + 1 + m[2].length;
    const before = text.slice(Math.max(0, m.index - 4), m.index + 1);
    if (/(e\.g\.|i\.e\.|etc\.|vs\.)$/i.test(before)) continue;
    issues.push(mk("grammar", "Start sentences with a capital letter", pos, m[3], m[3].toUpperCase()));
  }
  if (/^[a-z]/.test(text.trimStart())) {
    const p = text.length - text.trimStart().length;
    issues.push(mk("grammar", "Start sentences with a capital letter", p, text[p], text[p].toUpperCase()));
  }
  // Spacing / punctuation
  const dsRe = /(\S)( {2,})(\S)/g;
  while ((m = dsRe.exec(text))) issues.push(mk("style", "Multiple spaces", m.index + 1, m[2], " "));
  const spRe = /(\w)( +)([,.!?;:])(?!\w)/g;
  while ((m = spRe.exec(text))) issues.push(mk("grammar", "Remove space before punctuation", m.index + 1, m[2] + m[3], m[3]));
  const noSpRe = /([a-z])([,;])([A-Za-z])/g;
  while ((m = noSpRe.exec(text))) issues.push(mk("grammar", "Add a space after punctuation", m.index + 1, m[2], m[2] + " "));
  const exRe = /([!?]){2,}/g;
  while ((m = exRe.exec(text))) issues.push(mk("style", "Avoid repeated punctuation", m.index, m[0], m[0][0]));

  for (const [re, rep, msg] of CONFUSIONS) {
    re.lastIndex = 0;
    while ((m = re.exec(text))) issues.push(mk("grammar", msg, m.index, m[0], preserveCase(m[0], m[0].replace(new RegExp(re.source, "i"), rep))));
  }
  for (const [re, rep, msg] of WORDY) {
    re.lastIndex = 0;
    while ((m = re.exec(text))) issues.push(mk("clarity", `${msg}: try “${rep}”`, m.index, m[0], preserveCase(m[0], rep)));
  }
  let fillers = 0;
  for (const f of FILLERS) {
    const re = new RegExp(`\\b${f}\\b`, "gi");
    while ((m = re.exec(text))) {
      fillers++;
      issues.push(mk("style", `Filler word “${m[0]}” weakens your sentence`, m.index, m[0]));
    }
  }
  for (const c of CLICHES) {
    const re = new RegExp(`\\b${c}\\b`, "gi");
    while ((m = re.exec(text))) issues.push(mk("style", "Cliché — say it in your own words", m.index, m[0]));
  }
  let passive = 0;
  const pasRe = /\b(am|is|are|was|were|be|been|being)\s+(\w+ed|written|done|made|given|taken|seen|known|built|sent|told|found|shown|chosen|broken|driven|eaten|held|kept|left|lost|paid|put|read|said|sold|spent|taught|thought|won)\b/gi;
  while ((m = pasRe.exec(text))) {
    passive++;
    issues.push(mk("clarity", "Passive voice — consider active voice", m.index, m[0]));
  }

  // Sentences
  const sentences = text.split(/(?<=[.!?])\s+|\n{2,}/).map((s) => s.trim()).filter((s) => /\w/.test(s));
  const words = (text.match(/\b[\w'-]+\b/g) ?? []);
  let pos = 0;
  for (const s of sentences) {
    const idx = text.indexOf(s, pos);
    pos = idx >= 0 ? idx + s.length : pos;
    const wc = (s.match(/\b[\w'-]+\b/g) ?? []).length;
    if (wc > 30 && idx >= 0) issues.push(mk("clarity", `Long sentence (${wc} words) — consider splitting`, idx, s.slice(0, Math.min(s.length, 60))));
  }

  const wc = words.length;
  const sc = Math.max(1, sentences.length);
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  const flesch = wc ? Math.round(206.835 - 1.015 * (wc / sc) - 84.6 * (syl / Math.max(1, wc))) : 0;
  const grade = flesch >= 90 ? "Very easy" : flesch >= 70 ? "Easy" : flesch >= 60 ? "Standard" : flesch >= 50 ? "Fairly hard" : flesch >= 30 ? "Hard" : "Very hard";
  const stats: WritingStats = {
    words: wc, sentences: sentences.length, chars: text.length,
    paragraphs: text.split(/\n\s*\n/).filter((p) => p.trim()).length,
    avgSentence: Math.round((wc / sc) * 10) / 10, readingMin: Math.max(1, Math.round(wc / 230)),
    flesch: Math.max(0, Math.min(100, flesch)), grade, passive, fillers,
  };

  // dedupe overlaps (keep first)
  issues.sort((a, b) => a.start - b.start);
  const deduped: Issue[] = [];
  let lastEnd = -1;
  for (const i of issues) {
    if (i.start < lastEnd && deduped.length && deduped[deduped.length - 1].start === i.start) continue;
    deduped.push(i);
    lastEnd = Math.max(lastEnd, i.end);
  }

  const weight = { spelling: 3, grammar: 3, clarity: 1.5, style: 1, code: 1 };
  const penalty = deduped.reduce((a, i) => a + weight[i.type], 0);
  const score = wc ? Math.max(0, Math.min(100, Math.round(100 - (penalty / Math.max(1, wc)) * 100 * 1.2))) : 100;

  const tips: string[] = [];
  if (stats.avgSentence > 22) tips.push(`Your sentences average ${stats.avgSentence} words. Aim for 15–20 to keep readers engaged.`);
  if (stats.avgSentence < 8 && sentences.length > 3) tips.push("Many short sentences in a row can feel choppy. Combine some ideas for better flow.");
  if (passive > 2) tips.push(`You used passive voice ${passive} times. Active voice (“The team fixed the bug”) is clearer and stronger.`);
  if (wc && fillers / wc > 0.02) tips.push("Cut filler words like “very”, “really” and “just”. Choose stronger, precise words instead (e.g. “very big” → “huge”).");
  if (stats.flesch < 50 && wc > 30) tips.push("Your text reads as hard. Use shorter words and sentences to improve readability.");
  if (stats.paragraphs <= 1 && wc > 150) tips.push("Break long text into paragraphs of 3–5 sentences, one idea per paragraph.");
  if (deduped.some((i) => i.type === "spelling")) tips.push("Re-read your draft once aloud — it's the fastest way to catch typos and awkward phrasing.");
  if (!tips.length && wc) tips.push("Great job! Vary sentence length and open with a strong first sentence to hook readers.");

  return { issues: deduped, stats, score, tips };
}

/** Offline code diagnostics. */
export function analyzeCode(text: string): { issues: Issue[]; stats: { lines: number; todos: number; longLines: number } ; score: number; tips: string[] } {
  const issues: Issue[] = [];
  const lines = text.split("\n");
  let offset = 0;
  let todos = 0;
  let longLines = 0;
  let tabs = 0;
  let spaces = 0;
  lines.forEach((line, idx) => {
    const tw = /[ \t]+$/.exec(line);
    if (tw) issues.push(mk("code", `Line ${idx + 1}: trailing whitespace`, offset + tw.index, tw[0], ""));
    if (line.length > 120) {
      longLines++;
      issues.push(mk("code", `Line ${idx + 1}: line is ${line.length} chars (max 120)`, offset, line.slice(0, 40)));
    }
    if (/\b(TODO|FIXME|HACK)\b/.test(line)) {
      todos++;
      const i = line.search(/\b(TODO|FIXME|HACK)\b/);
      issues.push(mk("code", `Line ${idx + 1}: unresolved ${line.slice(i, i + 5).trim()}`, offset + i, line.slice(i, i + 4)));
    }
    if (/^\t/.test(line)) tabs++;
    else if (/^ {2}/.test(line)) spaces++;
    const cl = /\bconsole\.log\(|\bprint\(/.exec(line);
    if (cl) issues.push(mk("code", `Line ${idx + 1}: debug output left in code`, offset + cl.index, cl[0]));
    offset += line.length + 1;
  });
  // bracket balance
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const stack: { ch: string; pos: number }[] = [];
  let inStr: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === inStr || ch === "\n") inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") inStr = ch;
    else if (ch === "(" || ch === "[" || ch === "{") stack.push({ ch, pos: i });
    else if (pairs[ch]) {
      if (stack.length && stack[stack.length - 1].ch === pairs[ch]) stack.pop();
      else issues.push(mk("code", `Unmatched closing “${ch}”`, i, ch));
    }
  }
  stack.forEach((s) => issues.push(mk("code", `Unclosed “${s.ch}”`, s.pos, s.ch)));
  if (tabs && spaces) issues.push(mk("code", `Mixed indentation: ${tabs} lines use tabs, ${spaces} use spaces`, 0, ""));
  issues.sort((a, b) => a.start - b.start);
  const score = Math.max(0, 100 - issues.length * 4);
  const tips: string[] = [];
  if (todos) tips.push(`You have ${todos} TODO/FIXME note(s). Track them so they don't get forgotten.`);
  if (longLines) tips.push("Keep lines under ~100 characters so code is easy to read on small screens.");
  if (tabs && spaces) tips.push("Pick one indentation style (spaces or tabs) and stick to it.");
  tips.push("Use the AI Coach for a deeper review of bugs, naming and performance.");
  return { issues, stats: { lines: lines.length, todos, longLines }, score, tips };
}
