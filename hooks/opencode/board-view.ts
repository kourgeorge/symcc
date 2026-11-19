// What OpenCode's TUI part (opencode/tui.ts, T-466) draws, as plain data: the band above the prompt
// (session.composer.top) and the board panel (session.panel), each as lines of colored text (core's Seg), made from
// the view file the engine writes (view.ts) with hooks/core's own helpers: the band's row fronts and notes
// (bandLeads, bandNote), the list's sections, marks and short states (panelSections, statusMark, fittedCells,
// rowExtra, fitRow), the banner (bannerLines) and a task's rows (detailRows). Nothing here draws or reads a file, so
// the tests check exactly what the TUI shows (hooks/opencode/tests/opencode-tui.spec.ts). The panel's actions go back
// to the engine as symcc's slash commands (actionCommand), run in the TUI's session (R6 of T-468). Like the Claude Code
// board it has three tabs (T-559): Tasks, Scouts (the list, a scout's page with its runs, a run's report) and
// Settings (every setting in its group, with its value and default).
import type { SymccTask, SymccScout } from '../../types'
import type { PaneView } from '../app/state'
import type { OwnerQuestion } from '../core/questions'
import {
  statusCounts, newestFirst, bandLeads, bandNote, boardBrand, boardWhere, modeLabel, modeOf, planBandText, withCrew, fileWaitText, questionsForYou,
  bannerLines, bannerRule, footerRule, type BannerTone, panelSections, localOffset, SECTION_LABEL, BACKLOG_SHOWN, foldedRow, backlogMoreLabel, ALL_CLEAR,
  fittedCells, TITLE_ROOM, fitRow, rowExtra, questionsLabel, archivedOf, archivedNote, statusMark, detailRows, detailRowLines, wrapSegs, answerChoices, hintLineText,
  type KeyHint, type Seg, type BoardTask, asksMoreTime, gitNote, OVERTIME_OPTIONS, overtimeQuestion, timeLimitOf,
  waitsForYou, sortScouts, scoutListRows, scoutRow, scoutIcon, scoutTone, scoutHowTo, scoutRunLine, scoutOutcomeTone, scoutLastRunProblem, scoutFile,
  SETTING_GROUPS, SETTINGS, isSettingPage, settingInfo, settingValue, SCOUT_FINDINGS_CHOICES, TESTS_WITH_CHANGES_CHOICES,
  type SettingName, type ScoutRunRecord,
} from '../board'
import { restFrame } from '../core/logo'
import { DEFAULT_NAME } from '../name'

/** The view file's name, in the data folder (.<name>/view.json). */
export const VIEW_FILE = 'view.json'

/** What the view file holds: the published view, and what the TUI needs to draw the banner and band. */
export type ViewFile = {
  /** the project's main folder */
  root: string
  home: string
  /** the plugin's name ("symcc") */
  name: string
  /** the plugin's version ('' = not known) */
  version: string
  /** when it was written (ms) */
  written_at: number
  view: PaneView & { scout_runs?: ScoutRuns }
}

/** One scout run as the scout's page lists it, with the ids of the tasks made from it. */
export type ScoutRun = { run: ScoutRunRecord; tasks: string[] }

/** Each scout's recent runs, newest first (view.ts puts them in the view file; a scout with none is left out). */
export type ScoutRuns = Record<string, ScoutRun[]>

/** How many runs of each scout the view file keeps. */
export const VIEW_RUNS_KEPT = 20

/** The panel's three views, as the Claude Code board's tabs: Tasks, Scouts and Settings (keys t, s and c). */
export type PanelTab = 'tasks' | 'scouts' | 'settings'

/** The tabs in order, with their keys. */
export const PANEL_TABS: readonly { tab: PanelTab; label: string; key: 't' | 's' | 'c' }[] = [
  { tab: 'tasks', label: 'Tasks', key: 't' },
  { tab: 'scouts', label: 'Scouts', key: 's' },
  { tab: 'settings', label: 'Settings', key: 'c' },
]

/** The view file's text. */
export const viewFileText = (f: ViewFile) => JSON.stringify(f) + '\n'

/** The view file read back, or null when the text is no view file (missing, half written, from another version). */
export function parseViewFile(text: string | null | undefined): ViewFile | null {
  if (!text) return null
  try {
    const f = JSON.parse(text) as Partial<ViewFile> | null
    if (!f || typeof f !== 'object' || !f.view || !Array.isArray(f.view.tasks)) return null
    const s = (x: unknown) => (typeof x === 'string' ? x : '')
    const { scout_runs, ...rest } = f.view
    const runs = scout_runs && typeof scout_runs === 'object' && !Array.isArray(scout_runs) ? { scout_runs } : {}
    const view = { ...rest, ...runs, working: Array.isArray(f.view.working) ? f.view.working : [], scouts: Array.isArray(f.view.scouts) ? f.view.scouts : [], test_commands: Array.isArray(f.view.test_commands) ? f.view.test_commands : [] }
    return { root: s(f.root), home: s(f.home), name: s(f.name) || DEFAULT_NAME, version: s(f.version), written_at: Number(f.written_at) || 0, view }
  } catch {
    return null
  }
}

/** The panel's keys (see panelKeys for which ones each page offers). */
export type PanelKey = 'up' | 'down' | 'open' | 'back' | 'a' | 'x' | 'close' | 't' | 's' | 'c' | 'r' | 'p'

/** The list's groups that open and close (▸ Backlog, ▸ Done, ▸ Dropped). */
export type PanelGroup = 'backlog' | 'done' | 'dropped'

/** What a mouse click on a line or a piece of it does (T-558): open a task or question, open or close a group, or
 *  press one of the panel's keys (a key hint in the footer works as a button); and (T-559) go to a tab, open a scout
 *  or one of its runs, or change a setting. */
export type PanelHit = { open: string } | { group: PanelGroup } | { key: PanelKey } | { tab: PanelTab } | { scout: string } | { run: string } | { setting: SettingName }

/** One colored piece of a line, with what a click on it does (only the footer's key hints have one). */
export type DrawSeg = Seg & { hit?: PanelHit }

/** One drawn line: colored pieces of text (colors are core's names: 'ide', 'inactive', 'warning', ...). */
export type Line = DrawSeg[]

/** A line's plain text (for tests and plain output). */
export const lineText = (l: Line) => l.map(s => s.text).join('')

// ---------------- the band above the prompt ----------------

/** The colors of the band's rows, as Claude Code's band has them (above-prompt.tsx). */
const BAND_COLOR: Record<string, string> = { review: 'cyan', waiting: 'yellow', failed: 'red', doing: 'green' }

/**
 * The band above the prompt, like Claude Code's (T-455/T-461): the header line (brand, folder, mode, questions for
 * you, workers, counts, scouts; the version dropped first when short of room), the owner's open questions, then the
 * tasks that need the owner or run, newest first, each with its lined-up front ("T-434 ▶ prep · try 2", see
 * bandLeads) and its note when the state doesn't already say it (bandNote), and "+N more" when they don't all fit.
 * [] when there is nothing to show (an empty board, or symcc turned off). `rows`: at most this many rows under the header.
 */
export function bandLines(f: ViewFile | null, nowMs: number, width: number, rows = 6): Line[] {
  const v = f?.view
  const tasks = v?.tasks ?? []
  const questions = v?.questions ?? []
  if (!f || !v || (!tasks.length && !questions.length) || v.enabled === false) return []
  const summary = statusCounts(tasks, ['doing', 'todo', 'paused', 'review', 'waiting', 'failed', 'done']).join(' · ')
  const order = ['review', 'waiting', 'failed', 'doing']
  const live = tasks.filter(t => order.includes(t.status)).sort(newestFirst)
  const plan = v.plan_mode ? planBandText(tasks.filter(t => t.status === 'doing').length) : ''
  const crew = { mode: modeOf(v), plan_mode: !!plan, max_parallel: v.max_parallel, tasks, scouts: v.scouts ?? [] }
  const facts = (room: number) => withCrew((w, s) => `${boardWhere(f.root)} ${[modeLabel(modeOf(v)), questionsForYou(questions.length), w, summary, s, plan].filter(Boolean).join(' · ')}`, crew, nowMs, room)
  // the version is dropped first: kept only when the facts are the same with it and the line still fits
  const roomFor = (brand: string) => width - brand.length - 1
  const bare = boardBrand(f.name, '')
  const plain = facts(roomFor(bare))
  const full = f.version ? facts(roomFor(boardBrand(f.name, f.version))) : ''
  const head = f.version && full === plain && full.length <= roomFor(boardBrand(f.name, f.version)) ? { brand: boardBrand(f.name, f.version), facts: full } : { brand: bare, facts: plain }
  const out: Line[] = [[{ text: head.brand, color: 'ide', bold: true }, { text: head.facts, color: 'inactive' }]]
  const asks = questions.slice(0, rows)
  for (const q of asks) out.push([{ text: `${q.id} for you`, color: 'yellow' }, { text: ` ${q.text}`, color: 'text' }, ...(q.options.length ? [{ text: ` — ${q.options.join(' | ')}`, color: 'inactive' }] : [])])
  const shown = live.slice(0, Math.max(0, rows - asks.length))
  const since = (id: string) => v.working?.find(w => w.task === id)?.since
  const leads = bandLeads(shown, nowMs, since, width)
  for (const t of shown) {
    const note = bandNote(t, nowMs, since(t.id))
    const tail = fileWaitText(t) ? ` — ${fileWaitText(t)}` : waitsForYou(t) ? ` — ${t.question ?? t.note}` : note ? ` — ${note}` : ''
    out.push([{ text: leads.get(t.id)!, color: BAND_COLOR[t.status] ?? 'text' }, { text: ` ${t.title}`, color: 'text' }, ...(tail ? [{ text: tail, color: 'inactive' }] : [])])
  }
  if (live.length + questions.length > rows) out.push([{ text: `+${live.length + questions.length - rows} more · /${f.name}`, color: 'inactive' }])
  return out
}

// ---------------- the board panel ----------------

/** What the panel has chosen: the task or question open ('' = the list), the row the cursor is on in the list, the
 *  groups opened or closed (GROUPS_OPEN when left out), how many lines the list or page is scrolled down, and the
 *  panel's height in rows when known (it bounds the scroll). */
export type PanelChoice = {
  opened: string
  cursor: number
  groups?: Partial<Record<PanelGroup, boolean>>
  scroll?: number
  rows?: number
  /** the tab shown (default: tasks); on the Scouts tab `opened` is the open scout's name and `cursor` the row on its page */
  tab?: PanelTab
  /** the open run of the open scout (its end time, '' = the scout's page) */
  run?: string
  /** that run's report text: undefined while it is read, null when it can't be read */
  report?: string | null
}

/** The panel as drawn: its lines, what a click on each line does (null: nothing), the ids of the rows the cursor
 *  goes over (tasks, questions and the groups' rows, see groupId; in order), the one under the cursor, its keys, and
 *  the scroll it was drawn with (kept within the list's or page's length). */
export type PanelDraw = { lines: Line[]; hits: (PanelHit | null)[]; ids: string[]; selected: string; keys: KeyHint[]; scroll: number }

/** Which groups are open at first: the backlog (its first rows), not Done and Dropped. */
export const GROUPS_OPEN: Record<PanelGroup, boolean> = { backlog: true, done: false, dropped: false }

/** A group's row as a cursor id ("group:done"), and back (null for a task's or question's id). */
export const groupId = (g: PanelGroup) => `group:${g}`
export const groupOf = (id: string): PanelGroup | null => (id.startsWith('group:') ? (id.slice(6) as PanelGroup) : null)

/** The key a key hint's word stands for, so a click on the hint does what the key does ('' for "move"). */
const HINT_KEY: Record<string, PanelKey> = { open: 'open', close: 'close', back: 'back', approve: 'a', answer: 'a', reject: 'x', change: 'open', report: 'open', 'run now': 'r', pause: 'p', resume: 'p' }

/** The footer's key hints as pieces, each a button for its key: "a approve · x reject · b back". */
export function hintSegs(keys: KeyHint[]): Line {
  return keys.flatMap((k, i) => [
    ...(i ? [{ text: ' · ', color: 'inactive' }] : []),
    { text: hintLineText([k]), color: 'inactive', ...(HINT_KEY[k.word] ? { hit: { key: HINT_KEY[k.word]! } } : {}) },
  ])
}

/** The banner's tones in core's color names. */
const TONE: Record<BannerTone, string> = { accent: 'ide', plain: 'text', dim: 'inactive', warning: 'warning' }

/** The list's own colors per status (as Claude Code's list): failed red, review and waiting yellow, doing blue, done green. */
const LIST_TONE: Record<string, string> = { backlog: 'inactive', review: 'warning', waiting: 'warning', failed: 'error', doing: 'ide', paused: 'permission', todo: 'text', done: 'success', dropped: 'inactive' }

/** A short date and time from an ISO time: "2026-11-19 14:05". */
const when = (iso: string) => (iso ? iso.slice(0, 16).replace('T', ' ') : '?')

/** Whether the view still has a page for this id (a task or a question); an open task that left the view
 *  (archived, removed, or the view file gone) falls back to the list. */
export function hasPage(f: ViewFile | null, id: string, tab: PanelTab = 'tasks'): boolean {
  if (!id || !f) return false
  if (tab === 'scouts') return (f.view.scouts ?? []).some(x => x.name === id)
  if (tab === 'settings') return false
  return f.view.tasks.some(x => x.id === id) || (f.view.questions ?? []).some(x => x.id === id)
}

/** Scout `scout`'s recent runs in the view file, newest first. */
export const scoutRunsIn = (f: ViewFile | null, scout: string): ScoutRun[] => (Array.isArray(f?.view.scout_runs?.[scout]) ? f!.view.scout_runs![scout]! : [])

/** The open scout, when the Scouts tab shows one's page. */
const scoutNamed = (f: ViewFile | null, name: string): SymccScout | undefined => (name ? f?.view.scouts?.find(x => x.name === name) : undefined)

/**
 * The keys of the list, and of a task's or question's page (the main actions only); on the Scouts tab, of the list,
 * a scout's page (r run now, p pause or resume) and a run's page; on the Settings tab, of the settings list.
 */
export function panelKeys(f: ViewFile | null, opened: string, tab: PanelTab = 'tasks', run = ''): KeyHint[] {
  const move = { key: '↑↓', word: 'move' }
  const views = { key: 't s c', word: 'views' }
  const close = { key: 'Esc', word: 'close' }
  const back = { key: 'b', word: 'back' }
  if (tab === 'settings') return [move, { key: 'Enter', word: 'change' }, views, close]
  if (tab === 'scouts') {
    const sc = scoutNamed(f, opened)
    if (!sc) return [move, { key: 'Enter', word: 'open' }, views, close]
    if (run && scoutRunsIn(f, sc.name).some(x => x.run.ended === run)) return [back]
    const runs = scoutRunsIn(f, sc.name).length ? [move, { key: 'Enter', word: 'report' }] : []
    return [...(sc.running ? [] : [{ key: 'r', word: 'run now' }]), { key: 'p', word: sc.paused ? 'resume' : 'pause' }, ...runs, back]
  }
  if (!opened) return [move, { key: 'Enter', word: 'open' }, views, close]
  const t = f?.view.tasks.find(x => x.id === opened)
  const q = f?.view.questions?.find(x => x.id === opened)
  if (q) return [{ key: 'a', word: 'answer' }, back]
  if (t?.status === 'review') return [{ key: 'a', word: 'approve' }, { key: 'x', word: 'reject' }, back]
  if (t && asksWhat(t, f?.view.max_minutes)) return [{ key: 'a', word: 'answer' }, back]
  return [back]
}

/** The panel's lines: the banner and rule, then the list or the open task's (or question's) page, then the keys. */
export function panelLines(f: ViewFile | null, choice: PanelChoice, nowMs: number, width: number): PanelDraw {
  const w = Math.max(20, Math.floor(width))
  if (!f) {
    const lines: Line[] = [[{ text: `${boardBrand(DEFAULT_NAME)}`, color: 'ide', bold: true }], [{ text: 'No board yet: start symcc in this project (the board is written by the server part).', color: 'inactive' }]]
    return { lines, hits: lines.map(() => null), ids: [], selected: '', keys: [], scroll: 0 }
  }
  // the shared note's "(g)" names the Claude Code panel's key; this panel has none, so it says to ask the lead (setup_git)
  const v = { ...f.view, ...(f.view.git_state && f.view.branch_note ? { branch_note: gitNote(f.view.git_state, 'ask the lead') } : {}) }
  const banner: Line[] = bannerLines({ ...v, max_parallel: v.max_parallel ?? 0, max_minutes: v.max_minutes ?? 0, auto_retries: v.auto_retries ?? 0, mode: v.mode }, f.root, f.home, v.driving ?? false, w, nowMs, f.name, restFrame(), f.version).map(l => [
    ...(l.art ? [{ text: l.art, color: 'ide' }] : []),
    ...l.parts.map(p => ({ text: p.text, color: TONE[p.tone], ...(p.bold ? { bold: true } : {}) })),
  ])
  const tab = choice.tab ?? 'tasks'
  const top = [...banner, tabsLine(tab), [{ text: bannerRule(w), color: 'ide' }]]
  let body: { lines: Line[]; hits?: (PanelHit | null)[] | null; ids: string[]; selected: string }
  let keys: KeyHint[]
  if (tab === 'scouts') {
    body = scoutsBody(f, choice, nowMs, w)
    keys = panelKeys(f, choice.opened, 'scouts', choice.run ?? '')
  } else if (tab === 'settings') {
    body = settingsBody(f, choice.cursor, w)
    keys = panelKeys(f, '', 'settings')
  } else {
    const page = choice.opened ? openedPage(f, choice.opened, nowMs, w) : null
    body = page ?? listBody(f, choice.cursor, { ...GROUPS_OPEN, ...choice.groups }, nowMs, w)
    keys = panelKeys(f, page ? choice.opened : '')
  }
  // the mouse wheel scrolls the list or page between the banner and the footer, down to its last screenful (its last
  // line when the panel's height isn't known)
  const room = choice.rows ? choice.rows - top.length - 2 : 1
  const scroll = Math.max(0, Math.min(Math.floor(choice.scroll ?? 0), body.lines.length - Math.max(1, room)))
  const hits = body.hits ?? body.lines.map(() => null)
  return {
    lines: [...top, ...body.lines.slice(scroll), [{ text: footerRule(w), color: 'subtle' }], hintSegs(keys)],
    hits: [...top.map(() => null), ...hits.slice(scroll), null, null],
    ids: body.ids,
    selected: body.selected,
    keys,
    scroll,
  }
}

/** The tabs under the banner: "[Tasks]  Scouts   Settings", the shown one bright; each one a button for its tab. */
export function tabsLine(tab: PanelTab): Line {
  return PANEL_TABS.flatMap((t, i) => [
    ...(i ? [{ text: ' ', color: 'inactive' }] : []),
    { text: t.tab === tab ? `[${t.label}]` : ` ${t.label} `, color: t.tab === tab ? 'ide' : 'inactive', ...(t.tab === tab ? { bold: true } : {}), hit: { tab: t.tab } },
  ])
}

/** What a body of the panel holds (between the tabs and the footer). */
type Body = { lines: Line[]; hits: (PanelHit | null)[]; ids: string[]; selected: string }

/** A body being made: lines, each with what a click on it does. */
function bodyMaker() {
  const lines: Line[] = []
  const hits: (PanelHit | null)[] = []
  const add = (l: Line, hit: PanelHit | null = null) => (lines.push(l), hits.push(hit))
  const blank = () => lines.length && add([{ text: ' ', color: 'text' }])
  const head = (text: string) => add([{ text, color: 'text', bold: true }])
  return { lines, hits, add, blank, head }
}

/** Text as lines of one color, each of its own lines wrapped to `w` after `indent` spaces. */
const textLines = (text: string, color: string, w: number, indent = 2): Line[] =>
  text.split('\n').flatMap(l => (l.trim() ? wrapSegs([{ text: l, color }], w - indent).map(x => [{ text: ' '.repeat(indent), color }, ...x]) : [[{ text: ' ', color }]]))

/** The Scouts tab: the list of scouts (as Claude Code's: icon, name, how often, state, last result, model), a
 *  scout's page (its header, instructions, recent runs and file) or one run's page (its line and report). */
function scoutsBody(f: ViewFile, choice: PanelChoice, nowMs: number, w: number): Body {
  const b = bodyMaker()
  const sc = scoutNamed(f, choice.opened)
  if (sc) return scoutPage(f, sc, choice, nowMs, w)
  const scouts = sortScouts(f.view.scouts ?? [])
  if (!scouts.length) {
    // the Claude Code board's "New scout" button has no place here
    for (const [i, l] of scoutHowTo(f.name).filter(l => !l.includes('New scout')).entries()) b.add([{ text: l, color: i === 0 ? 'text' : 'inactive' }])
    return { ...b, ids: [], selected: '' }
  }
  const ids = scouts.map(x => x.name)
  const selected = ids[Math.min(Math.max(0, choice.cursor), ids.length - 1)]!
  const rows = scoutListRows(scouts, nowMs, w)
  scouts.forEach((x, i) => {
    const r = rows[i]!
    b.add(
      [
        { text: x.name === selected ? '› ' : '  ', color: 'ide', bold: true },
        { text: `${r.icon} `, color: r.tone },
        { text: r.name, color: x.paused ? 'inactive' : 'claude', ...(x.paused ? {} : { bold: true }) },
        { text: r.every, color: 'inactive' },
        { text: r.state, color: r.stateTone },
        { text: r.last, color: r.lastTone },
        { text: r.model, color: 'inactive' },
      ],
      { scout: x.name },
    )
  })
  b.blank()
  b.add([{ text: `Enter opens a scout · /${f.name}-scout <name> runs one now`, color: 'inactive' }])
  return { ...b, ids, selected }
}

/** A scout's page, or the page of its open run (choice.run). The cursor goes over its runs. */
function scoutPage(f: ViewFile, sc: SymccScout, choice: PanelChoice, nowMs: number, w: number): Body {
  const b = bodyMaker()
  const shown = scoutRunsIn(f, sc.name)
  const opened = choice.run ? shown.find(x => x.run.ended === choice.run) : undefined
  if (opened) {
    b.add([{ text: sc.name, color: 'claude', bold: true }, { text: ` · run that ended ${opened.run.ended}`, color: 'inactive' }])
    b.add([{ text: scoutRunLine(opened.run, opened.tasks, nowMs), color: scoutOutcomeTone(opened.run.outcome) }])
    if (opened.run.why) b.add([{ text: opened.run.why, color: 'error' }])
    b.blank()
    b.head('Report')
    const report = opened.run.report
    if (!report) b.add([{ text: '  (this run reported nothing)', color: 'inactive' }])
    else if (choice.report === undefined) b.add([{ text: '  (reading the report…)', color: 'inactive' }])
    else if (choice.report === null || !choice.report.trim()) b.add([{ text: `  (its report file ${report} can't be read)`, color: 'inactive' }])
    else for (const l of textLines(choice.report.trim(), 'text', w)) b.add(l)
    if (report) {
      b.blank()
      b.head('File')
      b.add([{ text: `  ${report}`, color: 'autoAccept' }])
    }
    return { ...b, ids: [], selected: '' }
  }
  const r = scoutRow(sc, nowMs)
  const head = wrapSegs([
    { text: sc.name, color: 'claude', bold: true },
    { text: ` ${scoutIcon(sc)} ${r.state || 'waiting'}${sc.running && sc.paused ? ', then paused' : ''}`, color: scoutTone(sc), bold: true },
    { text: ` · ${r.every}${r.model ? ` · ${r.model}` : ''} · ${r.ran}`, color: 'inactive' },
  ], w)
  for (const l of head) b.add(l)
  const firstLine = (sc.prompt ?? '').split('\n').map(l => l.trim()).find(Boolean) ?? ''
  const title = sc.summary?.trim() || firstLine
  if (title) b.add([{ text: title, color: sc.summary?.trim() ? 'text' : 'inactive', ...(sc.summary?.trim() ? { bold: true } : {}) }])
  if (sc.warning) b.add([{ text: sc.warning, color: 'warning' }])
  const problem = scoutLastRunProblem([...shown].reverse().map(x => x.run))
  if (problem && !sc.running) b.add([{ text: problem, color: 'error' }])
  b.blank()
  b.head('Instructions')
  if (sc.prompt?.trim()) for (const l of textLines(sc.prompt.trim(), 'text', w)) b.add(l)
  else b.add([{ text: `  (not loaded yet: run /${f.name}-scouts)`, color: 'inactive' }])
  b.blank()
  b.head('Runs')
  const ids = shown.map(x => x.run.ended)
  const selected = ids.length ? ids[Math.min(Math.max(0, choice.cursor), ids.length - 1)]! : ''
  b.add([{ text: shown.length ? '  Enter on a run shows its report' : '  (no runs yet)', color: 'inactive' }])
  for (const x of shown) b.add([{ text: x.run.ended === selected ? '› ' : '  ', color: 'ide', bold: true }, { text: scoutRunLine(x.run, x.tasks, nowMs), color: scoutOutcomeTone(x.run.outcome) }], { run: x.run.ended })
  b.blank()
  b.head('File')
  b.add([{ text: `  ${scoutFile(sc.name, f.name)}`, color: 'autoAccept' }])
  return { ...b, ids, selected }
}

/** The settings the cursor goes over on the Settings tab, in the Claude Code board's groups and order. */
export const SETTING_ROWS: readonly SettingName[] = SETTING_GROUPS.flatMap(g => g.items.filter((x): x is SettingName => !isSettingPage(x)))

/** The Settings tab: each group (Work, Checks before merging, ...) with its settings: name, value, default and range,
 *  and what it does on the line under it. The Roles and Kinds pages are only on the Claude Code board. */
function settingsBody(f: ViewFile, cursor: number, w: number): Body {
  const b = bodyMaker()
  const v = f.view
  const nameWidth = Math.max(...SETTINGS.map(x => x.name.length))
  const selected = SETTING_ROWS[Math.min(Math.max(0, cursor), SETTING_ROWS.length - 1)]!
  for (const g of SETTING_GROUPS) {
    b.blank()
    b.head(g.title)
    for (const item of g.items) {
      if (isSettingPage(item)) {
        const label = item === 'roles' ? 'Roles' : 'Kinds'
        b.add([{ text: `  ${label.padEnd(nameWidth)}`, color: 'inactive' }, { text: ` its page is on the Claude Code board; here ask the lead`, color: 'inactive' }])
        continue
      }
      const x = settingInfo(item)!
      const hit = { setting: x.name }
      const sel = x.name === selected
      const unplayable = x.name === 'notify' && v.notify_choices && v.notify && !v.notify_choices.includes(v.notify)
      b.add(
        [
          { text: sel ? '› ' : '  ', color: 'ide', bold: true },
          { text: x.name.padEnd(nameWidth), color: 'claude', bold: true },
          { text: ` ${settingValue(v, x.name)}`, color: 'text', bold: true },
          ...(unplayable ? [{ text: " (can't play here: nothing plays)", color: 'warning' }] : []),
          { text: ` · default ${x.default} · ${x.range}`, color: 'inactive' },
        ],
        hit,
      )
      for (const l of wrapSegs([{ text: x.meaning, color: 'inactive' }], w - 4)) b.add([{ text: '    ', color: 'inactive' }, ...l], hit)
    }
  }
  b.blank()
  b.add([{ text: `Enter changes a setting (on/off flips) · /${f.name}-settings NAME VALUE · or tell the lead`, color: 'inactive' }])
  return { ...b, ids: [...SETTING_ROWS], selected }
}

/** The values setting `name` is picked from ([] when it is typed, or flips as on/off). */
export function settingChoices(f: ViewFile | null, name: SettingName): string[] {
  const kind = settingInfo(name)?.kind
  if (kind === 'mode') return ['off', 'review', 'auto']
  if (kind === 'findings') return [...SCOUT_FINDINGS_CHOICES]
  if (kind === 'untested') return [...TESTS_WITH_CHANGES_CHOICES]
  // only what this machine can play (off always)
  if (kind === 'notify') return f?.view.notify_choices?.length ? [...f.view.notify_choices] : ['off']
  return []
}

/** The list: the questions for the owner, NEEDS YOU, what runs and waits to run, then the groups: the backlog (its
 *  first rows when open), done and dropped (their rows when open); the row under the cursor is marked with "›". */
function listBody(f: ViewFile, cursor: number, open: Record<PanelGroup, boolean>, nowMs: number, w: number): { lines: Line[]; hits: (PanelHit | null)[]; ids: string[]; selected: string } {
  const v = f.view
  const parts = panelSections(v.tasks, nowMs, localOffset(nowMs))
  const questions = v.questions ?? []
  const backlog = open.backlog ? parts.backlog.slice(0, BACKLOG_SHOWN) : []
  const done = open.done ? parts.done : []
  const dropped = open.dropped ? parts.dropped : []
  const gone = archivedOf(v).done
  const groups: { g: PanelGroup; label: string; all: SymccTask[]; rows: SymccTask[] }[] = [
    { g: 'backlog' as const, label: 'Backlog', all: parts.backlog, rows: backlog },
    { g: 'done' as const, label: 'Done', all: parts.done, rows: done },
    { g: 'dropped' as const, label: 'Dropped', all: parts.dropped, rows: dropped },
  ].filter(x => x.all.length || (x.g === 'done' && gone))
  const running = [...parts.doing, ...parts.todo]
  const listed = [...parts.needsYou, ...running, ...groups.flatMap(x => x.rows)]
  // the cursor's rows in the order drawn: questions, tasks, and each group's row before its tasks
  const ids = [...questions.map(q => q.id), ...parts.needsYou.map(t => t.id), ...running.map(t => t.id), ...groups.flatMap(x => [groupId(x.g), ...x.rows.map(t => t.id)])]
  const at = ids.length ? Math.min(Math.max(0, cursor), ids.length - 1) : -1
  const selected = at >= 0 ? ids[at]! : ''
  const since = (id: string) => v.working.find(x => x.task === id)?.since
  const idWidth = Math.max(4, ...ids.filter(id => !groupOf(id)).map(id => id.length))
  // a doing task: the total work time of all tries, "1h40m", "test 9m"; narrow, the time is left out
  const cells = fittedCells(listed, nowMs, since, w - (4 + idWidth + 3 + 2) - TITLE_ROOM)
  const cellWidth = Math.max(0, ...[...cells.values()].map(c => c.length))
  const pointer = (id: string, indent: number) => (id === selected ? `${' '.repeat(Math.max(0, indent - 2))}› ` : ' '.repeat(indent))
  const lines: Line[] = []
  const hits: (PanelHit | null)[] = []
  const add = (l: Line, hit: PanelHit | null = null) => (lines.push(l), hits.push(hit))
  const blank = () => lines.length && add([{ text: ' ', color: 'text' }])
  const head = (text: string) => add([{ text, color: 'text', bold: true }])
  if (questions.length) {
    head(questionsLabel(questions.length))
    for (const q of questions) add(questionRow(q, pointer(q.id, 2), idWidth, w), { open: q.id })
  }
  const row = (x: SymccTask, indent: number): Line => {
    const closed = x.status === 'done' || x.status === 'dropped' || x.status === 'backlog'
    const lead = indent + idWidth + 3 + cellWidth + 2
    const fit = fitRow(lead, x.title, rowExtra(x, v.tasks, v.branch ?? '', v.max_minutes), w, x.status === 'failed')
    const sel = x.id === selected
    return [
      { text: pointer(x.id, indent), color: 'ide', bold: true },
      { text: x.id.padEnd(idWidth), color: closed ? 'inactive' : 'claude', bold: !closed || sel },
      { text: ` ${statusMark(x)} ${(cells.get(x.id) ?? '').padEnd(cellWidth)}  `, color: LIST_TONE[x.status]! },
      { text: fit.title, color: closed ? 'inactive' : 'text', ...(sel || waitsForYou(x) || x.status === 'failed' || x.status === 'review' ? { bold: true } : {}) },
      ...(fit.extra ? [{ text: `${fit.pad}${fit.extra}`, color: 'inactive' }] : []),
    ]
  }
  const task = (t: SymccTask, indent: number) => add(row(t, indent), { open: t.id })
  if (parts.needsYou.length) {
    blank()
    head(SECTION_LABEL.needsYou)
    for (const t of parts.needsYou) task(t, 2)
  }
  if (running.length) {
    blank()
    for (const t of running) task(t, 2)
  }
  if (!questions.length && !parts.needsYou.length && !running.length) for (const l of ALL_CLEAR) add([{ text: `  ${l}`, color: 'inactive' }])
  const countWidth = Math.max(1, ...[parts.backlog, parts.done, parts.dropped].map(ts => String(ts.length).length))
  if (groups.length) blank()
  for (const x of groups) {
    const label = foldedRow(x.label, x.all.length, open[x.g], countWidth)
    add([{ text: `${pointer(groupId(x.g), 2)}${[label, x.g === 'done' ? archivedNote(gone) : ''].filter(Boolean).join(' ')}`, color: 'text', ...(groupId(x.g) === selected ? { bold: true } : {}) }], { group: x.g })
    for (const t of x.rows) task(t, 4)
    if (x.g === 'backlog' && x.rows.length && x.all.length > x.rows.length) add([{ text: `    ${backlogMoreLabel(x.all.length - x.rows.length).replace(/ \(Enter to show all\)$/, '')}`, color: 'inactive' }])
  }
  return { lines, hits, ids, selected }
}

/** A question's row in the list: "  Q-3 ? Which database?". */
function questionRow(q: OwnerQuestion, front: string, idWidth: number, w: number): Line {
  return [
    { text: front, color: 'ide', bold: true },
    { text: q.id.padEnd(idWidth), color: 'claude', bold: true },
    { text: ' ? ', color: 'warning' },
    { text: fitRow(front.length + idWidth + 3, q.text, '', w).title, color: 'text', bold: true },
  ]
}

/** The page of the task or question `id`: its title and rows (detailRows), its question and choices; null when it is gone. */
function openedPage(f: ViewFile, id: string, nowMs: number, w: number): { lines: Line[]; hits: null; ids: string[]; selected: string } | null {
  const v = f.view
  const q = v.questions?.find(x => x.id === id)
  if (q) {
    const lines: Line[] = [...wrapSegs([{ text: q.id, color: 'claude', bold: true }, { text: `  ${q.text}`, color: 'text', bold: true }], w)]
    lines.push([{ text: ' ', color: 'text' }], ...choiceLines(answerOptions(f, id), w))
    return { lines, hits: null, ids: [], selected: id }
  }
  const t = v.tasks.find(x => x.id === id)
  if (!t) return null
  const lines: Line[] = [...wrapSegs([{ text: t.id, color: 'claude', bold: true }, { text: `  ${t.title}`, color: 'text', bold: true }], w)]
  for (const r of detailRows(t, { roles: [], all: v.tasks, when, nowMs, ...(v.archived_done ? { archivedDone: v.archived_done } : {}) })) lines.push(...detailRowLines(r, w))
  const asked = asksWhat(t, v.max_minutes)
  if (asked) {
    lines.push([{ text: ' ', color: 'text' }], ...wrapSegs([{ text: 'asks: ', color: 'warning', bold: true }, { text: asked, color: 'text' }], w))
    lines.push(...choiceLines(answerOptions(f, id), w))
  }
  if (t.details?.trim() && t.details.trim() !== t.title) lines.push([{ text: ' ', color: 'text' }], ...wrapSegs([{ text: t.details.trim(), color: 'inactive' }], w))
  return { lines, hits: null, ids: [], selected: id }
}

/** The numbered choices of a question ("1 Allow", "2 Don't allow", "3 Answer…"). */
const choiceLines = (choices: string[], w: number): Line[] => choices.map((c, i) => [{ text: `  ${fitRow(2, `${i + 1} ${c}`, '', w).title}`, color: c === OWN_ANSWER ? 'inactive' : 'text' }])

/** The last choice of a question: the owner types their own answer. */
export const OWN_ANSWER = 'Answer…'

/** The choices to answer task or question `id` with (answerChoices; a question's own options), OWN_ANSWER last; [] when it asks nothing. */
export function answerOptions(f: ViewFile | null, id: string): string[] {
  const q = f?.view.questions?.find(x => x.id === id)
  if (q) return [...q.options.slice(0, 8), OWN_ANSWER]
  const t: BoardTask | undefined = f?.view.tasks.find(x => x.id === id)
  if (!t || !asksWhat(t, f?.view.max_minutes)) return []
  const c = asksMoreTime(t) ? answerChoices(undefined, [...OVERTIME_OPTIONS]) : answerChoices(t.asked_files, t.options)
  return c.length ? c : [OWN_ANSWER]
}

/** What task `t` asks the owner, '' when nothing (as Claude's task page): a running worker past its time limit asks
 *  for more time; a waiting task asks its question, unless its finished work only waits for the owner's files (it
 *  merges on its own once they are committed or stashed, so there is nothing to answer). */
export function asksWhat(t: BoardTask, maxMinutes: number | undefined): string {
  if (asksMoreTime(t)) return overtimeQuestion(t.id, timeLimitOf(maxMinutes ?? 45, t))
  if (!waitsForYou(t) || fileWaitText(t)) return ''
  return t.question || t.note || 'it waits for your answer'
}

/** A panel action as the slash command that does it, run in the TUI's session: approve, reject (with the reason) or answer. */
export type PanelAction =
  | { kind: 'approve'; id: string }
  | { kind: 'reject'; id: string; reason: string }
  | { kind: 'answer'; id: string; answer: string }
  /** run a scout now, or (with `paused`) pause or resume its timer */
  | { kind: 'scout'; scout: string; paused?: boolean }
  | { kind: 'setting'; setting: SettingName; value: string }

/** The slash command (its name, without the slash, and its text) that does `a` for plugin `name`. */
export function actionCommand(a: PanelAction, name: string = DEFAULT_NAME): { name: string; text: string } {
  if (a.kind === 'approve') return { name: `${name}-approve`, text: a.id }
  if (a.kind === 'reject') return { name: `${name}-reject`, text: `${a.id} ${a.reason.trim()}` }
  if (a.kind === 'scout') return { name: `${name}-scout`, text: a.paused === undefined ? a.scout : `${a.scout} ${a.paused ? 'pause' : 'resume'}` }
  if (a.kind === 'setting') return { name: `${name}-settings`, text: `${a.setting} ${a.value.trim()}` }
  return { name: `${name}-answer`, text: `${a.id} ${a.answer.trim()}` }
}

/** The next cursor after moving `by` rows in a list of `n` (it stops at the ends). */
export const moveCursor = (cursor: number, by: number, n: number) => (n ? Math.min(n - 1, Math.max(0, cursor + by)) : 0)
