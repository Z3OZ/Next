# NexaEdit — PRD

## Original problem statement
Build an APK Android app that clones all features of Jota++ (text editor) plus modern code-editor features. Autosave is a must, with history and version control. Automatic language suggestion and color coding per language. Spell & grammar checker with an offline checker that helps improve writing technique.

## User choices
- Files on device (offline-first) + optional cloud backup/sync
- Offline rule-based spell/grammar checker + online AI coach (Claude Sonnet 5.5 via Emergent LLM key)
- Tabs, syntax highlighting, auto language detection, find/replace, undo/redo, line numbers, autosave, version history with diff, snippets & autocomplete, themes & font size
- Dark VS Code-like theme with light toggle

## Architecture
- Expo Router (SDK 57): `/` home, `/editor`, `/history` (modal), `/check` (modal), `/settings`
- Local storage via `@/src/utils/storage` (docs, versions, settings, tabs)
- Editor: transparent TextInput over tokenized/highlighted Text rows (`src/components/CodeEditor.tsx`, `src/lib/highlight.ts`)
- 22 languages with snippets/keywords (`src/lib/languages.ts`), detection by extension + content heuristics
- Offline writing/code analysis (`src/lib/writing.ts`), line diff LCS (`src/lib/diff.ts`)
- FastAPI backend: `/api/sync/push`, `/api/sync/pull/{code}`, `/api/ai/coach` (Claude claude-sonnet-5-5), MongoDB collections `sync_spaces`, `coach_logs`

## Implemented (2026-06)
- File explorer: search (name+content), filters, sort, pin, rename, duplicate, delete, share/export, open from device
- Multi-tab editor, line numbers, word wrap, syntax highlighting, auto-indent, list continuation, auto-close brackets, accessory symbol bar, autocomplete + snippets, find/replace (regex, case), go to line, undo/redo
- Autosave (configurable 1–10s) + automatic version snapshots, named commits, diff vs current/previous, restore
- Auto language detection + "switch highlighting?" suggestion banner
- Offline spelling/grammar/style/clarity checker with readability stats, fix/ignore, fix-all, technique tips; offline code diagnostics
- AI Coach (writing or code review) with apply-able suggestions
- Settings: theme dark/light/system, font size, toggles, tab size, autosave delay, cloud backup/restore via sync code
- Tested: iteration 1 & 2 (backend 100%, frontend fixes verified)

## Iteration 2 (2026-06)
- Fixed ghost/overlapping text: single-layer RichEditor (TextInput with colored nested spans), measured line numbers for wrapped lines
- Higher contrast dark/light tokens
- Font settings: font type, size, line spacing, syntax color schemes (Monokai, Dracula, GitHub, Solarized, High contrast), text color — global + per language
- Text Compare screen: word/line diff, similarity %, added/removed/changed/same, locations, similarities, marked view, previous comparisons with recount
- Status bar: cursor Ln/Col, words, chars, lines

## Backlog
- P1: Full dictionary-based spell check (currently common-misspellings list), Save to device folders (SAF), encoding selection
- P1: Split-screen / side-by-side diff, branching of versions
- P2: Custom color themes, more languages, Markdown preview, password-protected notes
