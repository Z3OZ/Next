export type LangId =
  | "plaintext" | "markdown" | "javascript" | "typescript" | "python" | "java" | "kotlin"
  | "c" | "cpp" | "csharp" | "go" | "rust" | "php" | "ruby" | "swift" | "html" | "xml"
  | "css" | "json" | "sql" | "shell" | "yaml";

export type Snippet = { label: string; body: string; desc: string };

export type Lang = {
  id: LangId;
  name: string;
  exts: string[];
  icon: string;
  mode: "code" | "markup" | "markdown" | "plain";
  lineComment?: string[];
  block?: [string, string];
  strings: string[];
  keywords: Set<string>;
  types: Set<string>;
  literals: Set<string>;
  caseInsensitive?: boolean;
  wordChars?: RegExp;
  snippets: Snippet[];
};

const S = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

const C_LIKE_SNIPPETS: Snippet[] = [
  { label: "if", body: "if ($0) {\n  \n}", desc: "if block" },
  { label: "for", body: "for (int i = 0; i < $0; i++) {\n  \n}", desc: "for loop" },
  { label: "while", body: "while ($0) {\n  \n}", desc: "while loop" },
];

const JS_SNIPPETS: Snippet[] = [
  { label: "log", body: "console.log($0);", desc: "console.log" },
  { label: "fn", body: "function $0() {\n  \n}", desc: "function" },
  { label: "afn", body: "const $0 = () => {\n  \n};", desc: "arrow function" },
  { label: "iff", body: "if ($0) {\n  \n}", desc: "if block" },
  { label: "forof", body: "for (const item of $0) {\n  \n}", desc: "for...of loop" },
  { label: "trycatch", body: "try {\n  $0\n} catch (err) {\n  console.error(err);\n}", desc: "try / catch" },
  { label: "imp", body: "import { $0 } from '';", desc: "import" },
  { label: "asyncfn", body: "async function $0() {\n  \n}", desc: "async function" },
];

const JS_KW =
  "break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return super switch this throw try typeof var void while with yield async await static get set as";

function L(
  id: LangId, name: string, exts: string[], icon: string, mode: Lang["mode"],
  opts: Partial<Omit<Lang, "keywords" | "types" | "literals">> & { kw?: string; ty?: string; lit?: string },
): Lang {
  return {
    id, name, exts, icon, mode,
    lineComment: opts.lineComment,
    block: opts.block,
    strings: opts.strings ?? ['"', "'"],
    keywords: S(opts.kw ?? ""),
    types: S(opts.ty ?? ""),
    literals: S(opts.lit ?? "true false null"),
    caseInsensitive: opts.caseInsensitive,
    wordChars: opts.wordChars,
    snippets: opts.snippets ?? [],
  };
}

const SL = ["//"];
const BL: [string, string] = ["/*", "*/"];

export const LANGUAGES: Lang[] = [
  L("plaintext", "Plain Text", ["txt", "text", "log"], "file-document-outline", "plain", { strings: [], lit: "" }),
  L("markdown", "Markdown", ["md", "markdown", "mdx"], "language-markdown", "markdown", {
    strings: [],
    snippets: [
      { label: "h1", body: "# $0", desc: "Heading 1" },
      { label: "h2", body: "## $0", desc: "Heading 2" },
      { label: "link", body: "[$0](https://)", desc: "Link" },
      { label: "code", body: "```\n$0\n```", desc: "Code block" },
      { label: "table", body: "| Col 1 | Col 2 |\n| --- | --- |\n| $0 |  |", desc: "Table" },
      { label: "todo", body: "- [ ] $0", desc: "Checklist item" },
    ],
  }),
  L("javascript", "JavaScript", ["js", "jsx", "mjs", "cjs"], "language-javascript", "code", {
    lineComment: SL, block: BL, strings: ['"', "'", "`"], kw: JS_KW,
    ty: "Array Object String Number Boolean Promise Map Set Date Math JSON console window document",
    lit: "true false null undefined NaN Infinity", snippets: JS_SNIPPETS,
  }),
  L("typescript", "TypeScript", ["ts", "tsx", "mts"], "language-typescript", "code", {
    lineComment: SL, block: BL, strings: ['"', "'", "`"],
    kw: JS_KW + " interface type enum implements namespace declare readonly private public protected abstract keyof infer is satisfies",
    ty: "string number boolean any unknown never void object Array Record Partial Promise Map Set Date",
    lit: "true false null undefined",
    snippets: [...JS_SNIPPETS, { label: "intf", body: "interface $0 {\n  \n}", desc: "interface" }, { label: "typ", body: "type $0 = {\n  \n};", desc: "type alias" }],
  }),
  L("python", "Python", ["py", "pyw"], "language-python", "code", {
    lineComment: ["#"], strings: ['"', "'"],
    kw: "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case self",
    ty: "int float str bool list dict set tuple bytes object Exception print len range open type isinstance enumerate zip map filter sorted super",
    lit: "True False None",
    snippets: [
      { label: "def", body: "def $0():\n    pass", desc: "function" },
      { label: "class", body: "class $0:\n    def __init__(self):\n        pass", desc: "class" },
      { label: "ifmain", body: "if __name__ == \"__main__\":\n    $0", desc: "main guard" },
      { label: "for", body: "for item in $0:\n    pass", desc: "for loop" },
      { label: "try", body: "try:\n    $0\nexcept Exception as e:\n    print(e)", desc: "try / except" },
      { label: "with", body: "with open($0) as f:\n    data = f.read()", desc: "with open" },
    ],
  }),
  L("java", "Java", ["java"], "language-java", "code", {
    lineComment: SL, block: BL,
    kw: "abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try volatile while var record",
    ty: "int long short byte char float double boolean void String Integer List Map ArrayList HashMap Object System",
    snippets: [
      { label: "main", body: "public static void main(String[] args) {\n    $0\n}", desc: "main method" },
      { label: "sout", body: "System.out.println($0);", desc: "print" },
      ...C_LIKE_SNIPPETS,
    ],
  }),
  L("kotlin", "Kotlin", ["kt", "kts"], "language-kotlin", "code", {
    lineComment: SL, block: BL, strings: ['"', "'"],
    kw: "as break class continue do else for fun if in interface is object package return super this throw try typealias val var when while by catch constructor init companion data sealed override open private public internal suspend import",
    ty: "Int Long String Boolean Double Float Unit Any List Map MutableList", lit: "true false null",
    snippets: [{ label: "fun", body: "fun $0() {\n    \n}", desc: "function" }, { label: "main", body: "fun main() {\n    $0\n}", desc: "main" }],
  }),
  L("c", "C", ["c", "h"], "language-c", "code", {
    lineComment: SL, block: BL,
    kw: "auto break case const continue default do else enum extern for goto if register return sizeof static struct switch typedef union volatile while #include #define #ifdef #ifndef #endif #pragma",
    ty: "int long short char float double void unsigned signed size_t FILE bool", lit: "NULL true false",
    snippets: [{ label: "main", body: "#include <stdio.h>\n\nint main(void) {\n    $0\n    return 0;\n}", desc: "main" }, { label: "printf", body: "printf(\"$0\\n\");", desc: "printf" }, ...C_LIKE_SNIPPETS],
    wordChars: /^[#A-Za-z_][\w]*/,
  }),
  L("cpp", "C++", ["cpp", "cc", "cxx", "hpp", "hh"], "language-cpp", "code", {
    lineComment: SL, block: BL,
    kw: "alignas auto break case catch class const constexpr continue default delete do else enum explicit export extern for friend goto if inline mutable namespace new noexcept operator private protected public return sizeof static struct switch template this throw try typedef typename union using virtual volatile while #include #define #ifdef #ifndef #endif #pragma",
    ty: "int long short char float double void bool unsigned string vector map set std size_t auto", lit: "true false nullptr NULL",
    snippets: [{ label: "main", body: "#include <iostream>\n\nint main() {\n    $0\n    return 0;\n}", desc: "main" }, { label: "cout", body: "std::cout << $0 << std::endl;", desc: "cout" }, ...C_LIKE_SNIPPETS],
    wordChars: /^[#A-Za-z_][\w]*/,
  }),
  L("csharp", "C#", ["cs"], "language-csharp", "code", {
    lineComment: SL, block: BL,
    kw: "abstract as base break case catch class const continue default delegate do else enum event explicit extern finally fixed for foreach goto if implicit in interface internal is lock namespace new operator out override params private protected public readonly ref return sealed sizeof static struct switch this throw try typeof using virtual void volatile while async await var get set",
    ty: "int long string bool double float decimal object char byte List Dictionary Task Console", lit: "true false null",
    snippets: [{ label: "cw", body: "Console.WriteLine($0);", desc: "print" }, ...C_LIKE_SNIPPETS],
  }),
  L("go", "Go", ["go"], "language-go", "code", {
    lineComment: SL, block: BL, strings: ['"', "'", "`"],
    kw: "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var",
    ty: "int int64 int32 uint string bool float64 float32 byte rune error any make len append fmt", lit: "true false nil iota",
    snippets: [{ label: "func", body: "func $0() {\n\t\n}", desc: "function" }, { label: "iferr", body: "if err != nil {\n\treturn err$0\n}", desc: "error check" }, { label: "main", body: "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println($0)\n}", desc: "main" }],
  }),
  L("rust", "Rust", ["rs"], "language-rust", "code", {
    lineComment: SL, block: BL, strings: ['"'],
    kw: "as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while",
    ty: "i8 i16 i32 i64 u8 u16 u32 u64 usize isize f32 f64 bool char str String Vec Option Result Box HashMap", lit: "true false None Some Ok Err",
    snippets: [{ label: "fn", body: "fn $0() {\n    \n}", desc: "function" }, { label: "main", body: "fn main() {\n    println!(\"$0\");\n}", desc: "main" }, { label: "match", body: "match $0 {\n    _ => {}\n}", desc: "match" }],
  }),
  L("php", "PHP", ["php"], "language-php", "code", {
    lineComment: ["//", "#"], block: BL,
    kw: "abstract and array as break case catch class clone const continue declare default do echo else elseif empty endif endforeach endwhile extends final finally fn for foreach function global if implements include interface isset list match namespace new or print private protected public require require_once return static switch throw trait try unset use var while yield",
    ty: "int string bool float array object mixed void", lit: "true false null TRUE FALSE NULL",
    snippets: [{ label: "func", body: "function $0() {\n    \n}", desc: "function" }, { label: "echo", body: "echo $0;", desc: "echo" }],
  }),
  L("ruby", "Ruby", ["rb"], "language-ruby", "code", {
    lineComment: ["#"],
    kw: "alias and begin break case class def defined do else elsif end ensure for if in module next not or redo rescue retry return self super then undef unless until when while yield require puts attr_accessor",
    lit: "true false nil",
    snippets: [{ label: "def", body: "def $0\n  \nend", desc: "method" }, { label: "each", body: "$0.each do |item|\n  \nend", desc: "each" }],
  }),
  L("swift", "Swift", ["swift"], "language-swift", "code", {
    lineComment: SL, block: BL, strings: ['"'],
    kw: "associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as catch is rethrows throw throws try async await self Self",
    ty: "Int Double Float String Bool Character Array Dictionary Optional Any Void", lit: "true false nil",
    snippets: [{ label: "func", body: "func $0() {\n    \n}", desc: "function" }, { label: "guard", body: "guard let $0 else { return }", desc: "guard" }],
  }),
  L("html", "HTML", ["html", "htm", "vue", "svelte"], "language-html5", "markup", {
    snippets: [
      { label: "html5", body: "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <title>$0</title>\n</head>\n<body>\n  \n</body>\n</html>", desc: "HTML5 boilerplate" },
      { label: "div", body: "<div>$0</div>", desc: "div" },
      { label: "a", body: "<a href=\"\">$0</a>", desc: "link" },
      { label: "img", body: "<img src=\"$0\" alt=\"\">", desc: "image" },
      { label: "script", body: "<script>\n  $0\n</script>", desc: "script" },
    ],
  }),
  L("xml", "XML", ["xml", "svg", "plist", "xaml"], "xml", "markup", {}),
  L("css", "CSS", ["css", "scss", "less"], "language-css3", "code", {
    block: BL, lineComment: [],
    kw: "@media @import @keyframes @font-face @supports !important @mixin @include",
    lit: "",
    wordChars: /^[@A-Za-z_-][\w-]*/,
    snippets: [{ label: "flex", body: "display: flex;\nalign-items: center;\njustify-content: $0;", desc: "flexbox" }, { label: "media", body: "@media (max-width: $0px) {\n  \n}", desc: "media query" }],
  }),
  L("json", "JSON", ["json", "jsonc"], "code-json", "code", { lineComment: [], strings: ['"'] }),
  L("sql", "SQL", ["sql"], "database-outline", "code", {
    lineComment: ["--"], block: BL, caseInsensitive: true,
    kw: "select from where insert into values update set delete create table drop alter add primary key foreign references join left right inner outer on group by order having limit offset as and or not null is in like between distinct union all index view exists case when then else end default unique",
    ty: "int integer varchar text char boolean date timestamp float decimal serial bigint count sum avg min max",
    lit: "true false",
    snippets: [{ label: "sel", body: "SELECT $0 FROM ;", desc: "select" }, { label: "ins", body: "INSERT INTO $0 () VALUES ();", desc: "insert" }],
  }),
  L("shell", "Shell", ["sh", "bash", "zsh"], "console", "code", {
    lineComment: ["#"],
    kw: "if then else elif fi for while do done case esac function return in export local echo exit cd source alias sudo",
    lit: "true false",
    snippets: [{ label: "shebang", body: "#!/usr/bin/env bash\n$0", desc: "shebang" }, { label: "iff", body: "if [ $0 ]; then\n  \nfi", desc: "if" }],
  }),
  L("yaml", "YAML", ["yaml", "yml"], "code-braces", "code", {
    lineComment: ["#"], lit: "true false null yes no", wordChars: /^[A-Za-z_][\w.-]*/,
  }),
];

const BY_ID = new Map(LANGUAGES.map((l) => [l.id, l]));
const BY_EXT = new Map<string, LangId>();
LANGUAGES.forEach((l) => l.exts.forEach((e) => BY_EXT.set(e, l.id)));

export function getLang(id: string): Lang {
  return BY_ID.get(id as LangId) ?? BY_ID.get("plaintext")!;
}

export function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : "";
}

export function detectLanguage(name: string, content: string): LangId {
  const byExt = BY_EXT.get(extOf(name));
  if (byExt) return byExt;
  const t = content.slice(0, 4000);
  const s = t.trimStart();
  if (!s) return "plaintext";
  if (s.startsWith("<?php")) return "php";
  if (/^<!DOCTYPE html|^<html/i.test(s)) return "html";
  if (s.startsWith("<?xml")) return "xml";
  if (/^#!.*\b(bash|sh|zsh)\b/.test(s)) return "shell";
  if (/^#!.*python/.test(s)) return "python";
  if (/^[{[]/.test(s)) {
    try {
      JSON.parse(content);
      return "json";
    } catch {
      /* not json */
    }
  }
  if (/^\s*#include\s*<(iostream|vector|string)>|std::|cout\s*<</m.test(t)) return "cpp";
  if (/^\s*#include\s*[<"]/m.test(t)) return "c";
  if (/public\s+static\s+void\s+main|System\.out\.print/.test(t)) return "java";
  if (/\bfn\s+\w+\s*\(|let\s+mut\b|println!\(/.test(t)) return "rust";
  if (/^package\s+main\b|\bfunc\s+\w+\s*\(.*\)\s*\{/m.test(t)) return "go";
  if (/\bfun\s+\w+\s*\(|\bval\s+\w+\s*=/.test(t)) return "kotlin";
  if (/^\s*(def\s+\w+\s*\(.*\)\s*:|from\s+[\w.]+\s+import\s|import\s+\w+\s*$|class\s+\w+(\(.*\))?\s*:\s*$|print\()/m.test(t)) return "python";
  if (/\binterface\s+\w+\s*\{|:\s*(string|number|boolean)\b|\btype\s+\w+\s*=/.test(t)) return "typescript";
  if (/\b(function\s*\w*\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|=>|console\.log|require\(|import\s+.*from\s+['"])/.test(t)) return "javascript";
  if (/^\s*(SELECT|INSERT\s+INTO|CREATE\s+TABLE|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/im.test(t)) return "sql";
  if (/<\/?(div|span|p|body|head|a|ul|li|section)\b[^>]*>/i.test(t)) return "html";
  if (/[.#]?[\w-]+\s*\{[^}]*[\w-]+\s*:\s*[^};]+;/.test(t)) return "css";
  if (/^#{1,6}\s|^\s*[-*]\s+\[[ x]\]|\[[^\]]+\]\([^)]+\)|^```/m.test(t)) return "markdown";
  if ((t.match(/^[\w-]+:\s.*$/gm) ?? []).length >= 3) return "yaml";
  return "plaintext";
}
