// What OpenCode's TUI part (opencode/tui.ts, T-466) draws, as plain data: the band above the prompt
// (session.composer.top) and the board panel (session.panel), each as lines of colored text (core's Seg), made from
// the view file the engine writes (view.ts) with hooks/core's own helpers: the band's row fronts and notes
// (bandLeads, bandNote), the list's sections, marks and short states (panelSections, rowMark, rowStates,
// rowExtra, fitRow), the banner (bannerLines) and a task's page sections (taskSections, T-580). Nothing here draws or reads a file, so
// the tests check exactly what the TUI shows (hooks/opencode/tests/opencode-tui.spec.ts). The panel's actions go back
// to the engine as symcc's slash commands (actionCommand), run in the TUI's session (R6 of T-468). Like the Claude Code
// board it has three tabs (T-559): Tasks, Scouts (the list, a scout's page with its runs, a run's report) and
// Settings (every setting in its group, with its value and default; the groups open and close as on the Claude Code
// board, T-585). Like it, Settings opens the Roles and Kinds
// pages (a list, then one role's or kind's page: turn it off or on, reset it to the built-in one, T-562) and a
// scout's page edits the scout (how often, model, instructions); the roles and kinds come in the view file too.
// Settings also opens the Organizational memory page (T-619): org-mem's notes, newest first, x deletes one (after a
// yes) with /<name>-settings orgmem delete N; the notes come in the view file too (org_mem). Every screen has the
// Claude Code panel's buttons (T-680, T-685): its tab row, the list's [m] mode and [f] search buttons, Back (b) on the
// list pages, a role's or kind's page buttons; each a click on it presses its key.
import type { SymccTask, SymccScout, SymccMode } from '../../types'
import type { PaneView } from '../app/state'
import type { OwnerQuestion } from '../core/questions'
import {
  statusCounts, newestFirst, bandLeads, bandNote, bandBrand, bandWhere, boardBrand, modeLabel, modeOf, planBandText, withCrew, questionsForYou,
  bannerLines, bannerRule, footerRule, type BannerTone, panelSections, localOffset, when, SECTION_LABEL, BACKLOG_SHOWN, foldedRow, backlogMoreLabel, ALL_CLEAR,
  rowStates, rowMark, TITLE_ROOM, fitRow, rowExtra, questionsLabel, archivedOf, archivedNote, statusMark, statusBadge, detailRows, detailRowLines, wrapSegs, hintLineText,
  type KeyHint, type Seg, type BoardTask, gitNote, intoOf, taskActions, taskAsks, actionButtonLabel, packRows, type TaskAction, type TaskActionId,
  ownersTurn, shownStatus, sortScouts, scoutListRows, scoutRow, scoutIcon, scoutTone, scoutHowTo, scoutRunLine, scoutOutcomeTone, scoutLastRunProblem, scoutFile,
  SETTING_GROUPS, SETTINGS, isSettingPage, settingInfo, settingValue, cantPlayNotify, groupSummaryParts,
  type SettingName, type SettingPage, type ScoutRunRecord, type RoleDef, type KindDef, type ScoutEditField, type DefAction, type TaskVerb, settingsKeys,
  DEFAULT_ROLE, isCheckerRole, ALWAYS_ON_KINDS, checkerOn, roleNameError, kindNameError, checkStepNow, rowEndText, taskPhase, choiceLines, driveWarning,
  PANE_TABS, tabLabel, TAB_GAP, searchTasks, searchLine, modeButton, hintLines, roleKeys, rolePromptKeys, ROLE_PROMPTS, ROLE_SLOT, promptsOfRole, type RolePromptKind,
} from '../board'
import { type DefSource, type BrokenDef, defSource, sourceLabel, brokenNamed, brokenLabel, defNamed } from '../core/def-files'
import { restFrame } from '../core/logo'
import { taskSections, type TaskSection } from '../core/task-sections'
import type { DiffFile } from '../core/review'
import { DEFAULT_NAME, dataDir } from '../name'
import { ORG_MEM_TITLE, ORG_MEM_EMPTY, orgMemAbout, orgMemCount, orgMemSummary, orgMemKeys, orgMemNoteHead, orgMemFile, type OrgMemNote } from '../core/org-mem'

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
  view: PaneView & { scout_runs?: ScoutRuns; scout_results?: Record<string, string>; roles?: ViewDef[]; kinds?: ViewDef[]; changes?: ViewChanges; org_mem?: OrgMemNote[] }
}

/** The files each task in review changed (not an answered investigation's), or why they can't be read (view.ts puts
 *  them in the view file, T-580: the TUI can't run git; its task page lists them under Changes). */
export type ViewChanges = Record<string, { files: DiffFile[]; error: string }>

/** One role or kind as the Roles and Kinds pages show it (view.ts puts them in the view file, made with viewDefs). */
export type ViewDef = {
  name: string
  description: string
  /** built-in, replaced (the owner's copy of a built-in) or added; '' when the owner's file can't be read */
  source: DefSource | ''
  /** turned off (the checker role never shows as off: its off only keeps it out of the task roles) */
  off: boolean
  /** a role's model ('' = the session's), skills and extra tools */
  model?: string
  skills?: string[]
  tools?: string[]
  /** a role's checklist, or a kind's body */
  text: string
  warning?: string
  /** why the owner's file can't be read (brokenLabel) */
  broken?: string
  /** its file, as the pages name it */
  file: string
  /** whether it can be turned off and on here (not general, the checker role, change or investigation) */
  canOff: boolean
  /** whether Reset to built-in works: the owner's copy of a built-in (or a broken file with a built-in's name) */
  canReset: boolean
}

/** The roles or kinds as the view file carries them: each merged one (built-in, or the owner's over it) in order, then
 *  the owner's files that can't be read. `dir` is the owner's folder for them (".symcc/roles"). */
export function viewDefs(def: 'role' | 'kind', all: readonly (RoleDef | KindDef)[], builtIn: readonly { name: string }[], project: readonly { name: string }[], broken: readonly BrokenDef[], dir: string): ViewDef[] {
  const nameError = def === 'role' ? roleNameError : kindNameError
  const brokenRow = (b: BrokenDef): ViewDef => ({ name: b.name, description: '', source: '', off: false, text: '', broken: brokenLabel(b), file: b.file, canOff: false, canReset: !nameError(b.name) && !!defNamed(builtIn, b.name) })
  const rows = all.map((d): ViewDef => {
    const bad = brokenNamed(broken, d.name)
    if (bad) return brokenRow(bad)
    const source = defSource(d.name, builtIn, project) ?? 'built-in'
    const checker = def === 'role' && isCheckerRole(d.name)
    const canOff = def === 'role' ? d.name.toLowerCase() !== DEFAULT_ROLE && !checker : !ALWAYS_ON_KINDS.includes(d.name)
    const plugin = def === 'role' ? `roles/${d.name}.md` : `kinds/${d.name}.ts`
    const file = source === 'built-in' ? `${plugin} (in the plugin)` : `${dir}/${d.name}.md`
    const role = def === 'role' ? (d as RoleDef) : null
    return {
      name: d.name,
      description: d.description,
      source,
      off: !!d.off && !checker,
      ...(role ? { model: role.model ?? '', skills: [...role.skills], tools: [...(role.tools ?? [])] } : {}),
      text: role ? role.prompt : (d as KindDef).body,
      ...(role?.warning ? { warning: role.warning } : {}),
      file,
      canOff,
      canReset: source === 'replaced',
    }
  })
  return [...rows, ...broken.filter(b => !defNamed(all, b.name)).map(brokenRow)]
}

/** One scout run as the scout's page lists it, with the ids of the tasks made from it. */
export type ScoutRun = { run: ScoutRunRecord; tasks: string[] }

/** Each scout's recent runs, newest first (view.ts puts them in the view file; a scout with none is left out). */
export type ScoutRuns = Record<string, ScoutRun[]>

/** How many runs of each scout the view file keeps. */
export const VIEW_RUNS_KEPT = 20

/** The panel's three views, as the Claude Code board's tabs: Tasks, Scouts and Settings (keys t, s and c). */
export type PanelTab = 'tasks' | 'scouts' | 'settings'

/** The tabs in order, with their keys (core's PANE_TABS, as the Claude Code board's tab row). */
export const PANEL_TABS: readonly { tab: PanelTab; label: string; key: 't' | 's' | 'c' }[] = PANE_TABS

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
    if (!rest.scout_results || typeof rest.scout_results !== 'object' || Array.isArray(rest.scout_results)) delete rest.scout_results
    if (!Array.isArray(rest.roles)) delete rest.roles
    if (!Array.isArray(rest.kinds)) delete rest.kinds
    if (!Array.isArray(rest.org_mem)) delete rest.org_mem
    if (!rest.changes || typeof rest.changes !== 'object' || Array.isArray(rest.changes)) delete rest.changes
    const view = { ...rest, ...runs, working: Array.isArray(f.view.working) ? f.view.working : [], scouts: Array.isArray(f.view.scouts) ? f.view.scouts : [], test_commands: Array.isArray(f.view.test_commands) ? f.view.test_commands : [] }
    return { root: s(f.root), home: s(f.home), name: s(f.name) || DEFAULT_NAME, version: s(f.version), written_at: Number(f.written_at) || 0, view }
  } catch {
    return null
  }
}

/** The panel's keys (see panelKeys for which ones each page offers). */
export type PanelKey = 'up' | 'down' | 'open' | 'back' | 'close' | LetterKey | ChoiceKey

/** The letter keys the panel takes, each pressed as itself (the task page's take core's taskActions keys: u resume,
 *  z stash to backlog, v keep as a note, l role, h already merged, n needs review); and on the list (T-685) f search
 *  and m the board mode, as on Claude Code's list. j and k are not here: they always move (KEY_BINDS). */
export const LETTER_KEYS = ['a', 'x', 'd', 't', 's', 'c', 'r', 'p', 'o', 'e', 'u', 'z', 'v', 'l', 'h', 'n', 'f', 'm'] as const
export type LetterKey = (typeof LETTER_KEYS)[number]
const isLetterKey = (k: string): k is LetterKey => (LETTER_KEYS as readonly string[]).includes(k)

/** The number keys that pick a page's answer choice (T-583): 1 is the first choice. */
export type ChoiceKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
export const CHOICE_KEYS: readonly ChoiceKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/** The list's groups that open and close (▸ Backlog, ▸ Done, ▸ Dropped). */
export type PanelGroup = 'backlog' | 'done' | 'dropped'

/** What a mouse click on a line or a piece of it does (T-558): open a task or question, open or close a group, or
 *  press one of the panel's keys (a key hint in the footer works as a button); and (T-559) go to a tab, open a scout
 *  or one of its runs, or change a setting; and (T-562) open a page under Settings: the Roles or Kinds list ("roles", "kinds") or one
 *  role's or kind's page ("role:tester", "kind:bug", see settingsPlace); and (T-583) pick answer choice `choice`
 *  (1 = the first of answerOptions) of the open task or question; and (T-585) open or close a Settings group (its title);
 *  and (T-680) press a task page's button that has no key (Drop in review): `action`, its id in core's taskActions. */
export type PanelHit = { open: string } | { group: PanelGroup } | { key: PanelKey } | { tab: PanelTab } | { scout: string } | { run: string } | { setting: SettingName } | { page: string } | { choice: number } | { settingGroup: string } | { action: TaskActionId }

/** One colored piece of a line, with what a click on it does (only the footer's key hints have one). */
export type DrawSeg = Seg & { hit?: PanelHit }

/** One drawn line: colored pieces of text (colors are core's names: 'ide', 'inactive', 'warning', ...). */
export type Line = DrawSeg[]

/** A line's plain text (for tests and plain output). */
export const lineText = (l: Line) => l.map(s => s.text).join('')

// ---------------- the band above the prompt ----------------

/** The colors of the band's rows, as Claude Code's band has them (above-prompt.tsx). */
const BAND_COLOR: Record<string, string> = { review: 'cyan', waiting: 'yellow', failed: 'red', doing: 'green' }

/** What a click on a line of the band does (T-567): open (or close) the board panel, or open a task's or question's
 *  page in it. */
export type BandHit = { board: true } | { open: string }

/** The hint at the header's end that it is a button; dropped first when the line has no room for it. */
export const BAND_CLICK_HINT = ' (click: board)'

/** The band above the prompt (bandDraw's lines). */
export function bandLines(f: ViewFile | null, nowMs: number, width: number, rows = 6): Line[] {
  return bandDraw(f, nowMs, width, rows).lines
}

/**
 * The band above the prompt, like Claude Code's (T-455/T-461), with what a click on each line does (the header and
 * the "+N more" line open the board panel, a question's or task's row opens its page): the header line (brand,
 * folder, mode, questions for you, workers, counts, scouts, then the " (click: board)" hint, dropped first when short
 * of room), the owner's open questions, then the tasks that need the owner or run, newest first, each with its
 * lined-up front ("T-434 ✎ 2m (2)", "T-440 ▶ 12m", see bandLeads) and its note when the state doesn't already say
 * it (bandNote), and "+N more" when they don't all fit. No lines when there is nothing to show (an empty board, or
 * symcc disabled). `rows`: at most this many rows under the header.
 */
export function bandDraw(f: ViewFile | null, nowMs: number, width: number, rows = 6): { lines: Line[]; hits: (BandHit | null)[] } {
  const v = f?.view
  const tasks = v?.tasks ?? []
  const questions = v?.questions ?? []
  if (!f || !v || (!tasks.length && !questions.length) || v.enabled === false) return { lines: [], hits: [] }
  // an approved task whose approve runs counts and shows as doing (shownStatus)
  const summary = statusCounts(tasks, ['doing', 'todo', 'paused', 'review', 'waiting', 'failed', 'done'], nowMs).join(' · ')
  const order = ['review', 'waiting', 'failed', 'doing']
  const live = tasks.filter(t => order.includes(t.status)).sort(newestFirst)
  const plan = v.plan_mode ? planBandText(tasks.filter(t => t.status === 'doing').length) : ''
  const crew = { mode: modeOf(v), plan_mode: !!plan, max_parallel: v.max_parallel, tasks, scouts: v.scouts ?? [] }
  const facts = (room: number) => withCrew((w, s) => `${bandWhere(f.root, f.name)} ${[modeLabel(modeOf(v)), questionsForYou(questions.length), w, summary, s, plan].filter(Boolean).join(' · ')}`, crew, nowMs, room)
  // "𝄞 symcc", then " · <project>" only when it isn't called symcc too (see bandBrand), then the state
  const brand = bandBrand(f.name)
  // T-643: another session drives: a warning mark right after the brand, so it is never cut off
  const drive = driveWarning(v.driving ?? false, tasks, nowMs, f.name, 'band')
  const mark = drive ? ` ${drive}` : ''
  const head = { brand, facts: facts(width - brand.length - mark.length - 1) }
  const headLen = head.brand.length + mark.length + head.facts.length
  const hint = headLen + BAND_CLICK_HINT.length <= width ? [{ text: BAND_CLICK_HINT, color: 'inactive' }] : []
  const out: Line[] = [[{ text: head.brand, color: 'ide', bold: true }, ...(mark ? [{ text: mark, color: 'warning' }] : []), { text: head.facts, color: 'inactive' }, ...hint]]
  const hits: (BandHit | null)[] = [{ board: true }]
  const asks = questions.slice(0, rows)
  for (const q of asks) hits.push({ open: q.id }), out.push([{ text: `${q.id} for you`, color: 'yellow' }, { text: ` ${q.text}`, color: 'text' }, ...(q.options.length ? [{ text: ` — ${q.options.join(' | ')}`, color: 'inactive' }] : [])])
  const shown = live.slice(0, Math.max(0, rows - asks.length))
  const since = (id: string) => v.working?.find(w => w.task === id)?.since
  const leads = bandLeads(shown, nowMs, since, width)
  for (const t of shown) {
    // the row's end text, the same in Claude Code's band and the lead's board (rowEndText)
    const end = rowEndText(t, taskPhase(t, nowMs), bandNote(t, nowMs, since(t.id), v.driving ?? false))
    const tail = end ? ` — ${end}` : ''
    hits.push({ open: t.id })
    out.push([{ text: leads.get(t.id)!, color: BAND_COLOR[shownStatus(t, nowMs)] ?? 'text' }, { text: ` ${t.title}`, color: 'text' }, ...(tail ? [{ text: tail, color: 'inactive' }] : [])])
  }
  if (live.length + questions.length > rows) hits.push({ board: true }), out.push([{ text: `+${live.length + questions.length - rows} more · /${f.name}`, color: 'inactive' }])
  return { lines: out, hits }
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
  /** the Settings groups open (their titles, T-585; SETTINGS_OPEN when left out) */
  settingsOpen?: readonly string[]
  /** the answer the owner just sent from this panel (T-583): the open page says it was sent */
  sent?: { id: string; answer: string }
  /** the open task's latest report (T-580), read from its file: its text undefined while it is read, null when it can't be */
  taskReport?: { file: string; text: string | null | undefined }
  /** the task whose approve this panel just sent, and when (ms): its page shows the approve's first step at once (see
   *  approveSent), as Claude Code's task page does */
  approving?: ApproveSent
  /** the task list's search (T-685, core's searchTasks words, as Claude Code's [f] search); '' or left out = none */
  search?: string
}

/** An approve this panel sent: the task and when (ms). */
export type ApproveSent = { id: string; at: number }
/** How long an approve sent from the panel shows as started while the board shows none of its steps yet. */
export const APPROVE_SENT_MS = 60_000

/** Whether approve `a` (sent from this panel) still counts as started before its first step is on the board: its task
 *  is still in review with no check step yet, and it was sent less than APPROVE_SENT_MS ago. Once a step shows, the
 *  board carries it (and when that step ends with the task back in review, the approve is over). */
export function approveSent(f: ViewFile | null, a: ApproveSent | undefined, nowMs: number): boolean {
  const t = a ? f?.view.tasks.find(x => x.id === a.id) : undefined
  return !!a && !!t && t.status === 'review' && !checkStepNow(t, nowMs) && nowMs - a.at < APPROVE_SENT_MS
}

/** The panel as drawn: its lines, what a click on each line does (null: nothing), the ids of the rows the cursor
 *  goes over (tasks, questions and the groups' rows, see groupId; in order), the one under the cursor, its keys, and
 *  the scroll it was drawn with (kept within the list's or page's length). */
export type PanelDraw = {
  lines: Line[]
  hits: (PanelHit | null)[]
  ids: string[]
  selected: string
  keys: KeyHint[]
  scroll: number
  /** how many of the first lines stay put when the body scrolls (the banner, the tabs, the rule and the page's title) */
  fixed: number
  /** how many drawn lines the body has in all (what scrolls) */
  bodyLines: number
  /** how many of the last lines are the footer (its rule, the list's mode row, the key hints), which never scroll */
  footer: number
}

/** Which groups are open at first: the backlog (its first rows), not Done and Dropped. */
export const GROUPS_OPEN: Record<PanelGroup, boolean> = { backlog: true, done: false, dropped: false }

/** A group's row as a cursor id ("group:done"), and back (null for a task's or question's id). */
export const groupId = (g: PanelGroup) => `group:${g}`
export const groupOf = (id: string): PanelGroup | null => (id.startsWith('group:') ? (id.slice(6) as PanelGroup) : null)

/** The key a key hint's word stands for, so a click on the hint does what the key does ('' for "move"). */
const HINT_KEY: Record<string, PanelKey> = { open: 'open', 'open/close': 'open', close: 'close', back: 'back', change: 'open', report: 'open' }

/** What a click on key hint `k` presses: its own letter key, else the key its word stands for (Enter opens, b back...). */
export const hintKey = (k: KeyHint): PanelKey | undefined => (isLetterKey(k.key) ? k.key : HINT_KEY[k.word])

/** The footer's key hints as pieces, each a button for its key: "a approve · x reject · b back". */
export function hintSegs(keys: KeyHint[]): Line {
  return keys.flatMap((k, i) => [
    ...(i ? [{ text: ' · ', color: 'inactive' }] : []),
    { text: hintLineText([k]), color: 'inactive', ...(hintKey(k) ? { hit: { key: hintKey(k)! } } : {}) },
  ])
}

/** The banner's tones in core's color names. */
const TONE: Record<BannerTone, string> = { accent: 'ide', plain: 'text', dim: 'inactive', warning: 'warning' }

/** The list's own colors per status (as Claude Code's list): failed red, review and waiting yellow, doing blue, done green. */
const LIST_TONE: Record<string, string> = { backlog: 'inactive', review: 'warning', waiting: 'warning', failed: 'error', doing: 'ide', paused: 'permission', todo: 'text', done: 'success', dropped: 'inactive' }

/** Whether the view still has a page for this id (a task or a question); an open task that left the view
 *  (archived, removed, or the view file gone) falls back to the list. */
export function hasPage(f: ViewFile | null, id: string, tab: PanelTab = 'tasks'): boolean {
  if (!id || !f) return false
  if (tab === 'scouts') return (f.view.scouts ?? []).some(x => x.name === id)
  if (tab === 'settings') return !!settingsPlace(f, id)
  return f.view.tasks.some(x => x.id === id) || (f.view.questions ?? []).some(x => x.id === id)
}

/** Scout `scout`'s recent runs in the view file, newest first. */
export const scoutRunsIn = (f: ViewFile | null, scout: string): ScoutRun[] => (Array.isArray(f?.view.scout_runs?.[scout]) ? f!.view.scout_runs![scout]! : [])

/** The Settings pages that list roles or kinds. */
type DefList = Exclude<SettingPage, 'orgmem'>

/** A page under Settings: the Roles or Kinds list (`id` "roles" or "kinds"), the Organizational memory page ("orgmem"),
 *  or one role's or kind's page ("role:tester", "kind:bug"; its list is `list`), or (T-685) the built-in prompt a role
 *  goes in, view only ("prompt:tester:change", `prompt`); null when there is no such page (or the role or kind left the view). */
export function settingsPlace(f: ViewFile | null, id: string): { list: SettingPage; def?: ViewDef; prompt?: RolePromptKind } | null {
  if (id === 'roles' || id === 'kinds' || id === 'orgmem') return { list: id }
  const p = /^prompt:(.+):([^:]+)$/.exec(id)
  if (p) {
    const def = defsIn(f, 'roles').find(x => x.name === p[1])
    const kind = promptsOfRole(p[1]!).find(k => k === p[2])
    return def && !def.broken && kind ? { list: 'roles', def, prompt: kind } : null
  }
  const m = /^(role|kind):(.+)$/.exec(id)
  if (!m) return null
  const list = m[1] === 'role' ? 'roles' : 'kinds'
  const def = defsIn(f, list).find(x => x.name === m[2])
  return def ? { list, def } : null
}

/** The roles or kinds in the view file. */
export const defsIn = (f: ViewFile | null, list: DefList): ViewDef[] => (Array.isArray(f?.view[list]) ? f!.view[list]! : [])

/** A role's or kind's page id: "role:tester", "kind:bug". */
export const defPageId = (list: DefList, name: string) => `${list === 'roles' ? 'role' : 'kind'}:${name}`

/** The page id of the built-in prompt role `role` goes in: "prompt:tester:change". */
export const rolePromptId = (role: string, kind: RolePromptKind) => `prompt:${role}:${kind}`

/** The buttons of a role's or kind's page, in Claude Code's order (T-685): Back, See the prompt (a role, p), Turn off
 *  or Turn on (o), Reset to built-in (r). Claude Code's Edit and Remove are not here: no slash command does them. */
export const defButtons = (list: DefList, d: ViewDef): PanelButton[] => [
  BACK_BUTTON,
  ...(list === 'roles' && !d.broken ? [{ label: 'See the prompt', hit: { key: 'p' as const } }] : []),
  ...(d.canOff ? [{ label: d.off ? 'Turn on' : 'Turn off', hit: { key: 'o' as const } }] : []),
  ...(d.canReset ? [{ label: 'Reset to built-in', hit: { key: 'r' as const } }] : []),
]

/** The buttons of the built-in prompt page: Back (to the role), then the role's other prompts ("The checker prompt"). */
export const rolePromptButtons = (role: string, kind: RolePromptKind): PanelButton[] => [
  BACK_BUTTON,
  ...promptsOfRole(role).filter(k => k !== kind).map(k => ({ label: `The ${k} prompt`, hit: { page: rolePromptId(role, k) } })),
]

/** The open scout, when the Scouts tab shows one's page. */
const scoutNamed = (f: ViewFile | null, name: string): SymccScout | undefined => (name ? f?.view.scouts?.find(x => x.name === name) : undefined)

/**
 * The keys of the list, and of a task's or question's page (the main actions only); on the Scouts tab, of the list,
 * (`merging`: the task's approve is in progress, see approveInProgress, so no approve, reject or merge now),
 * a scout's page (r run now, p pause or resume, e edit) and a run's page; on the Settings tab, of the settings list,
 * the Roles and Kinds lists and a role's or kind's page (o turn off or on, r reset to the built-in one).
 */
export function panelKeys(f: ViewFile | null, opened: string, tab: PanelTab = 'tasks', run = '', heading = false, merging = false): KeyHint[] {
  const move = { key: '↑↓', word: 'move' }
  const views = { key: 't s c', word: 'views' }
  const close = { key: 'Esc', word: 'close' }
  const back = { key: 'b', word: 'back' }
  if (tab === 'settings') {
    const place = settingsPlace(f, opened)
    // the settings list: core's keys, as Claude Code's (Enter open/close on a group heading, else change)
    if (!place) return settingsKeys(heading)
    if (place.list === 'orgmem') return orgMemKeys(false, orgMemIn(f).length > 0)
    if (!place.def) return [move, { key: 'Enter', word: 'open' }, back]
    if (place.prompt) return rolePromptKeys()
    // core's keys of Claude Code's role page, but Edit and Remove (no slash command does them here)
    const d = place.def
    return roleKeys({ canEdit: false, canOff: d.canOff, off: d.off, canReset: d.canReset, canRemove: false, canSeePrompt: place.list === 'roles' && !d.broken })
  }
  if (tab === 'scouts') {
    const sc = scoutNamed(f, opened)
    if (!sc) return [move, { key: 'Enter', word: 'open' }, views, close]
    if (run && scoutRunsIn(f, sc.name).some(x => x.run.ended === run)) return [back]
    const runs = scoutRunsIn(f, sc.name).length ? [move, { key: 'Enter', word: 'report' }] : []
    return [...(sc.running ? [] : [{ key: 'r', word: 'run now' }]), { key: 'p', word: sc.paused ? 'resume' : 'pause' }, { key: 'e', word: 'edit' }, ...runs, back]
  }
  if (!opened) return [move, { key: 'Enter', word: 'open' }, views, close]
  const t = f?.view.tasks.find(x => x.id === opened)
  const q = f?.view.questions?.find(x => x.id === opened)
  if (q) return [{ key: 'a', word: 'answer' }, back]
  if (!t) return [back]
  return [...(taskAsks(t, f?.view.max_minutes) ? [{ key: 'a', word: 'answer' }] : []), ...panelTaskActions(t, merging).map(a => ({ key: a.key!, word: a.word })), back]
}

/** Whether task `t`'s approve is in progress at `nowMs`: this panel just sent it (approveSent, `approving`), or the board
 *  shows it running (taskPhase's `approved` with a step). Its page then offers no approve, reject or merge now, as the
 *  terminal's while its merging line shows. */
export function approveInProgress(f: ViewFile | null, t: BoardTask, approving: ApproveSent | undefined, nowMs: number): boolean {
  const p = taskPhase(t, nowMs, undefined, { merging: approving?.id === t.id && approveSent(f, approving, nowMs) })
  return p.approved && !!p.stage
}

/** The panel's lines: the banner and rule, then the list or the open task's (or question's) page, then the keys. */
export function panelLines(f: ViewFile | null, choice: PanelChoice, nowMs: number, width: number): PanelDraw {
  const w = Math.max(20, Math.floor(width))
  if (!f) {
    const lines: Line[] = [[{ text: `${boardBrand(DEFAULT_NAME)}`, color: 'ide', bold: true }], [{ text: 'No board yet: start symcc in this project (the board is written by the server part).', color: 'inactive' }]]
    return { lines, hits: lines.map(() => null), ids: [], selected: '', keys: [], scroll: 0, fixed: lines.length, bodyLines: 0, footer: 0 }
  }
  // the shared note's "(g)" names the Claude Code panel's key; this panel has none, so it says to ask the lead (setup_git)
  const v = { ...f.view, ...(f.view.git_state && f.view.branch_note ? { branch_note: [gitNote(f.view.git_state, 'ask the lead'), f.view.size_note ?? ''].filter(Boolean).join('; ') } : {}) }
  const banner: Line[] = bannerLines({ ...v, max_parallel: v.max_parallel ?? 0, max_minutes: v.max_minutes ?? 0, auto_retries: v.auto_retries ?? 0, mode: v.mode }, f.root, f.home, v.driving ?? false, w, nowMs, f.name, restFrame(), f.version).map(l => [
    ...(l.art ? [{ text: l.art, color: 'ide' }] : []),
    ...l.parts.map(p => ({ text: p.text, color: TONE[p.tone], ...(p.bold ? { bold: true } : {}) })),
  ])
  const tab = choice.tab ?? 'tasks'
  const top = [...banner, ...tabsLines(tab, w, v.tasks.length, (v.scouts ?? []).length), [{ text: bannerRule(w), color: 'ide' }]]
  // the list's footer has Claude Code's board-mode row (T-685): the mode, its [m] button and (no search on) [f] search
  let modeRow: Line[] = []
  let body: { lines: Line[]; hits?: (PanelHit | null)[] | null; ids: string[]; selected: string; head?: number }
  let keys: KeyHint[]
  if (tab === 'scouts') {
    body = scoutsBody(f, choice, nowMs, w)
    keys = panelKeys(f, choice.opened, 'scouts', choice.run ?? '')
  } else if (tab === 'settings') {
    const place = settingsPlace(f, choice.opened)
    body = place?.list === 'orgmem' ? orgMemBody(f, choice.cursor, w) : place?.prompt && place.def ? rolePromptPage(place.def, place.prompt, w) : place?.def ? defPage(f, place.list as DefList, place.def, w) : place ? defsList(f, place.list as DefList, choice.cursor, w) : settingsBody(f, choice.cursor, choice.settingsOpen ?? SETTINGS_OPEN, w)
    keys = panelKeys(f, place ? choice.opened : '', 'settings', '', !place && !!settingGroupOf(body.selected))
  } else {
    const t = choice.opened ? f.view.tasks.find(x => x.id === choice.opened) : undefined
    // the approve in progress takes the same buttons and keys away (approveInProgress)
    const busy = !!t && approveInProgress(f, t, choice.approving, nowMs)
    const page = choice.opened ? openedPage(f, choice.opened, nowMs, w, choice.sent?.id === choice.opened ? choice.sent.answer : '', choice.taskReport, choice.approving?.id === choice.opened && approveSent(f, choice.approving, nowMs), busy) : null
    body = page ?? listBody(f, choice.cursor, { ...GROUPS_OPEN, ...choice.groups }, nowMs, w, choice.search ?? '')
    keys = panelKeys(f, page ? choice.opened : '', 'tasks', '', false, !!page && busy)
    if (!page) modeRow = modeLines(f, !!choice.search?.trim(), w)
  }
  const foot: Line[] = [[{ text: footerRule(w), color: 'subtle' }], ...modeRow, ...hintLines(keys, w).map(hintSegs)]
  // T-627: every line is cut into the rows it really takes (drawn lines: no line wider than the panel, none with a
  // line break inside), so the scroll counts what is on screen. The page's own title (and a task's badge) stays with
  // the banner and the tabs at the top; the mouse wheel scrolls only the rest, between them and the footer, down to its
  // last screenful (its last line when the panel's height isn't known).
  const hits0 = body.hits ?? body.lines.map(() => null)
  const drawnHead: Line[] = []
  const drawnBody: Line[] = []
  const bodyHits: (PanelHit | null)[] = []
  body.lines.forEach((l, i) => {
    for (const d of drawnLines(l, w)) {
      if (i < (body.head ?? 0)) drawnHead.push(d)
      else drawnBody.push(d), bodyHits.push(hits0[i] ?? null)
    }
  })
  // a panel too low to keep the page's title and still show 3 lines of the rest: the title scrolls with the rest
  if (choice.rows && drawnHead.length && Math.floor(choice.rows) - top.length - drawnHead.length - foot.length < 3) {
    drawnBody.unshift(...drawnHead)
    bodyHits.unshift(...drawnHead.map(() => null))
    drawnHead.length = 0
  }
  const fixed = [...top, ...drawnHead]
  const room = choice.rows ? Math.max(1, Math.floor(choice.rows) - fixed.length - foot.length) : 0
  const scroll = Math.max(0, Math.min(Math.floor(choice.scroll ?? 0), drawnBody.length - Math.max(1, room)))
  // with the height known, exactly one screenful: the window of the body, then blank rows down to the footer, so the
  // footer stays at the bottom and every row is drawn again (nothing left over from a longer page)
  const shown = room ? drawnBody.slice(scroll, scroll + room) : drawnBody.slice(scroll)
  const pad = room ? room - shown.length : 0
  return {
    lines: [...fixed, ...shown, ...Array.from({ length: pad }, (): Line => [{ text: ' ', color: 'text' }]), ...foot],
    hits: [...fixed.map(() => null), ...bodyHits.slice(scroll, scroll + shown.length), ...Array.from({ length: pad }, () => null), ...foot.map(() => null)],
    ids: body.ids,
    selected: body.selected,
    keys,
    scroll,
    fixed: fixed.length,
    bodyLines: drawnBody.length,
    footer: foot.length,
  }
}

/** The list footer's board-mode row, as Claude Code's (T-685): the mode in its color, its "[m] review merge" button
 *  (it sends /<name>-mode with the mode it switches to), and "[f] search" when no search is on; going on to another row
 *  when it doesn't fit, never cutting a button. */
function modeLines(f: ViewFile, searching: boolean, w: number): Line[] {
  const mode = modeOf(f.view)
  const label: DrawSeg = { text: modeLabel(mode), color: mode === 'paused' ? 'warning' : mode === 'review' ? 'suggestion' : 'text', bold: true }
  const buttons: PanelButton[] = [{ label: modeButton(mode), hit: { key: 'm' } }, ...(searching ? [] : [SEARCH_BUTTON])]
  const pieces: DrawSeg[] = [label, ...buttons.map(b => ({ text: buttonText(b), color: 'inactive', hit: b.hit }))]
  return packRows(pieces.map(p => p.text.length), Math.max(1, Math.floor(w)), 2).map(row => row.flatMap((k, i) => [...(i ? [{ text: i === 1 ? ' ' : '  ', color: 'inactive' }] : []), pieces[k]!]))
}

/** Line `l` as the rows it takes in a panel `w` wide: split at its line breaks, and a row wider than `w` broken
 *  (between words when it can) with the next row starting under the line's own indent. Each piece keeps its color,
 *  bold and hit. An empty line is one blank row. */
export function drawnLines(l: Line, w: number): Line[] {
  const width = Math.max(1, Math.floor(w))
  // split at line breaks first
  const rows: Line[] = [[]]
  for (const s of l) {
    s.text.replace(/\r/g, '').split('\n').forEach((part, i) => {
      if (i) rows.push([])
      if (part) rows[rows.length - 1]!.push({ ...s, text: part.replace(/\t/g, '  ') })
    })
  }
  const out: Line[] = []
  for (const row of rows) {
    const chars = row.flatMap((s, si) => [...s.text].map(c => ({ c, si })))
    if (chars.length <= width) {
      out.push(row.length ? row : [{ text: ' ', color: l[0]?.color ?? 'text' }])
      continue
    }
    // the line's own indent (at most half the width), repeated in front of each row it goes on to
    const firstText = chars.findIndex(x => x.c !== ' ')
    const lead = Math.min(Math.max(0, firstText), Math.floor(width / 2))
    let rest = chars
    let first = true
    while (rest.length) {
      const room = first ? width : width - lead
      let take = rest
      if (rest.length > room) {
        // break at the last space within the room, after the indent; a word longer than the room is cut
        const space = rest.slice(0, room + 1).map(x => x.c).lastIndexOf(' ')
        take = rest.slice(0, space > (first ? lead : 0) ? space : room)
      }
      rest = rest.slice(take.length)
      while (rest.length && rest[0]!.c === ' ') rest = rest.slice(1)
      // the row's pieces: runs of characters from the same piece of the line
      const pieces: { si: number; text: string }[] = []
      for (const x of take) {
        const last = pieces[pieces.length - 1]
        if (last && last.si === x.si) last.text += x.c
        else pieces.push({ si: x.si, text: x.c })
      }
      const out1: Line = [...(first || !lead ? [] : [{ text: ' '.repeat(lead), color: row[0]!.color }]), ...pieces.map(p => ({ ...row[p.si]!, text: p.text }))]
      const end = out1[out1.length - 1]
      if (end) end.text = end.text.trimEnd() || ' '
      out.push(out1.length ? out1 : [{ text: ' ', color: 'text' }])
      first = false
    }
  }
  return out
}

/** The tabs under the banner, as Claude Code's tab row (T-685): "[t]: Tasks (12) │ [s]: Scouts (3) │ [c]: Settings"
 *  (core's PANE_TABS and tabLabel), the shown one bright and bold; each one a button for its tab. A narrow panel puts
 *  them on more rows, never cutting one. */
export function tabsLines(tab: PanelTab, w: number, tasks: number, scouts: number): Line[] {
  const count: Record<PanelTab, number | undefined> = { tasks, scouts, settings: undefined }
  const segs: DrawSeg[] = PANEL_TABS.map(t => ({ text: tabLabel(t.key, t.label, count[t.tab]), color: t.tab === tab ? 'ide' : 'inactive', ...(t.tab === tab ? { bold: true } : {}), hit: { tab: t.tab } }))
  return packRows(segs.map(s => s.text.length), Math.max(1, Math.floor(w)), TAB_GAP.length).map(row => row.flatMap((k, i) => [...(i ? [{ text: TAB_GAP, color: 'subtle' }] : []), segs[k]!]))
}

/** What a body of the panel holds (between the tabs and the footer); its first `head` lines (the page's title) stay
 *  at the top while the rest scrolls. */
type Body = { lines: Line[]; hits: (PanelHit | null)[]; ids: string[]; selected: string; head?: number }

/** The Back (b) button at the end of a list page (Scouts, Settings, Roles, Kinds, Organizational memory), as Claude Code's. */
const backButton = (b: ReturnType<typeof bodyMaker>, w: number) => buttonLines([LIST_BACK_BUTTON], w).forEach(l => b.add(l))

/** A body being made: lines, each with what a click on it does. */
function bodyMaker() {
  const lines: Line[] = []
  const hits: (PanelHit | null)[] = []
  const add = (l: Line, hit: PanelHit | null = null) => (lines.push(l), hits.push(hit))
  const blank = () => lines.length && add([{ text: ' ', color: 'text' }])
  const heading = (text: string) => add([{ text, color: 'text', bold: true }])
  return { lines, hits, add, blank, heading }
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
    b.blank()
    backButton(b, w)
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
  b.blank()
  backButton(b, w)
  return { ...b, ids, selected }
}

/** A scout's page, or the page of its open run (choice.run). The cursor goes over its runs. */
function scoutPage(f: ViewFile, sc: SymccScout, choice: PanelChoice, nowMs: number, w: number): Body {
  const b = bodyMaker()
  const shown = scoutRunsIn(f, sc.name)
  const opened = choice.run ? shown.find(x => x.run.ended === choice.run) : undefined
  if (opened) {
    b.add([{ text: sc.name, color: 'claude', bold: true }, { text: ` · run that ended ${opened.run.ended}`, color: 'inactive' }])
    for (const l of buttonLines([BACK_BUTTON], w)) b.add(l)
    const head = b.lines.length
    b.add([{ text: scoutRunLine(opened.run, opened.tasks, nowMs), color: scoutOutcomeTone(opened.run.outcome) }])
    if (opened.run.why) b.add([{ text: opened.run.why, color: 'error' }])
    b.blank()
    b.heading('Report')
    const report = opened.run.report
    if (!report) b.add([{ text: '  (this run reported nothing)', color: 'inactive' }])
    else if (choice.report === undefined) b.add([{ text: '  (reading the report…)', color: 'inactive' }])
    else if (choice.report === null || !choice.report.trim()) b.add([{ text: `  (its report file ${report} can't be read)`, color: 'inactive' }])
    else for (const l of textLines(choice.report.trim(), 'text', w)) b.add(l)
    if (report) {
      b.blank()
      b.heading('File')
      b.add([{ text: `  ${report}`, color: 'autoAccept' }])
    }
    return { ...b, ids: [], selected: '', head }
  }
  const r = scoutRow(sc, nowMs)
  const head = wrapSegs([
    { text: sc.name, color: 'claude', bold: true },
    { text: ` ${scoutIcon(sc)} ${r.state || 'waiting'}${sc.running && sc.paused ? ', then paused' : ''}`, color: scoutTone(sc), bold: true },
    { text: ` · ${r.every}${r.model ? ` · ${r.model}` : ''} · ${r.ran}`, color: 'inactive' },
  ], w)
  for (const l of head) b.add(l)
  // T-680: the page's buttons, as Claude Code's scout page has them; they stay at the top with its name
  for (const l of buttonLines(scoutButtons(sc), w)) b.add(l)
  const headLines = b.lines.length
  const firstLine = (sc.prompt ?? '').split('\n').map(l => l.trim()).find(Boolean) ?? ''
  const title = sc.summary?.trim() || firstLine
  if (title) b.add([{ text: title, color: sc.summary?.trim() ? 'text' : 'inactive', ...(sc.summary?.trim() ? { bold: true } : {}) }])
  if (sc.warning) b.add([{ text: sc.warning, color: 'warning' }])
  const problem = scoutLastRunProblem([...shown].reverse().map(x => x.run))
  if (problem && !sc.running) b.add([{ text: problem, color: 'error' }])
  const results = f.view.scout_results?.[sc.name]
  if (typeof results === 'string' && results) for (const l of wrapSegs([{ text: results, color: 'inactive' }], w)) b.add(l)
  b.blank()
  b.heading('Instructions')
  if (sc.prompt?.trim()) for (const l of textLines(sc.prompt.trim(), 'text', w)) b.add(l)
  else b.add([{ text: `  (not loaded yet: run /${f.name}-scouts)`, color: 'inactive' }])
  b.blank()
  b.heading('Runs')
  const ids = shown.map(x => x.run.ended)
  const selected = ids.length ? ids[Math.min(Math.max(0, choice.cursor), ids.length - 1)]! : ''
  b.add([{ text: shown.length ? '  Enter on a run shows its report' : '  (no runs yet)', color: 'inactive' }])
  for (const x of shown) b.add([{ text: x.run.ended === selected ? '› ' : '  ', color: 'ide', bold: true }, { text: scoutRunLine(x.run, x.tasks, nowMs), color: scoutOutcomeTone(x.run.outcome) }], { run: x.run.ended })
  b.blank()
  b.heading('File')
  b.add([{ text: `  ${scoutFile(sc.name, f.name)}`, color: 'autoAccept' }])
  return { ...b, ids, selected, head: headLines }
}

/** Which Settings groups are open at first: none, as on the Claude Code board's Settings page (S.settingsOpen). */
export const SETTINGS_OPEN: readonly string[] = []

/** A Settings group's heading as a cursor id ("settings-group:Work"), and back (null for a setting's or page's id). */
export const settingGroupId = (title: string) => `settings-group:${title}`
export const settingGroupOf = (id: string): string | null => (id.startsWith('settings-group:') ? id.slice(15) : null)

/** The rows the cursor goes over on the Settings tab, in the Claude Code board's groups and order: each group's
 *  heading, then (when it is open) its settings and the Roles and Kinds rows that open their pages. */
export const settingRows = (open: readonly string[]): string[] => SETTING_GROUPS.flatMap(g => [settingGroupId(g.title), ...(open.includes(g.title) ? g.items : [])])

/** "6 roles · 1 off" (the Settings row of the Roles or Kinds page). */
function defsCount(f: ViewFile, list: DefList): string {
  const all = defsIn(f, list)
  const off = all.filter(x => x.off).length
  const noun = list === 'roles' ? 'role' : 'kind'
  return `${all.length} ${noun}${all.length === 1 ? '' : 's'}${off ? ` · ${off} off` : ''}`
}

/** The Roles or Kinds page: one row per role or kind (name, where it comes from, whether it is off, what it is for);
 *  Enter opens one. New ones are made by the lead or as files. */
function defsList(f: ViewFile, list: DefList, cursor: number, w: number): Body {
  const b = bodyMaker()
  const all = defsIn(f, list)
  const noun = list === 'roles' ? 'role' : 'kind'
  b.heading(list === 'roles' ? 'Roles' : 'Kinds')
  if (!all.length) b.add([{ text: `  (none in the board's view yet)`, color: 'inactive' }])
  const ids = all.map(x => defPageId(list, x.name))
  const selected = ids.length ? ids[Math.min(Math.max(0, cursor), ids.length - 1)]! : ''
  const nameW = Math.max(0, ...all.map(x => x.name.length))
  for (const x of all) {
    const id = defPageId(list, x.name)
    const front = { text: id === selected ? '› ' : '  ', color: 'ide', bold: true }
    if (x.broken) {
      b.add([front, { text: x.name.padEnd(nameW), color: 'inactive', bold: true }, { text: ` — ${x.broken}`, color: 'error' }], { page: id })
      continue
    }
    const label = sourceLabel(x.source as DefSource, x.off)
    const fit = fitRow(2 + nameW + 1 + label.length, ` · ${x.description}`, '', w)
    b.add(
      [
        front,
        { text: x.name.padEnd(nameW), color: x.off ? 'inactive' : 'claude', ...(x.off ? {} : { bold: true }) },
        { text: ` ${label}`, color: x.off ? 'warning' : 'inactive' },
        { text: fit.title, color: x.off ? 'inactive' : 'text' },
        ...(x.warning ? [{ text: ' ⚠', color: 'warning' }] : []),
      ],
      { page: id },
    )
  }
  b.blank()
  b.add([{ text: `Enter opens a ${noun} · a new one: ask the lead, or add .${f.name}/${list}/<name>.md (a file you add or edit yourself shows here at the next board change)`, color: 'inactive' }])
  b.blank()
  backButton(b, w)
  return { ...b, ids, selected, head: 1 }
}

/** One role's or kind's page: its name, where it comes from and whether it is off, what it is for; a role's model,
 *  skills and tools; its checklist (a role) or body (a kind); its file. A file that can't be read says why. */
function defPage(f: ViewFile, list: DefList, x: ViewDef, w: number): Body {
  const b = bodyMaker()
  const role = list === 'roles'
  // T-685: its title and what it is, then its buttons (as Claude Code's page), all staying at the top
  let head = 0
  const buttons = () => {
    for (const l of buttonLines(defButtons(list, x), w)) b.add(l)
    head = b.lines.length
  }
  if (x.broken) {
    b.add([{ text: x.name, color: 'inactive', bold: true }, { text: ` · ${x.broken}`, color: 'error' }])
    for (const l of wrapSegs([{ text: `Fix the file by hand: ${x.file}${x.canReset ? '; or Reset to built-in deletes it (the built-in one is used meanwhile)' : ''}.`, color: 'text' }], w)) b.add(l)
    buttons()
  } else {
    b.add([{ text: x.name, color: x.off ? 'inactive' : 'claude', bold: true }, { text: ` · ${sourceLabel(x.source as DefSource, x.off)}`, color: x.off ? 'warning' : 'inactive' }])
    if (x.description) for (const l of wrapSegs([{ text: x.description, color: 'text', bold: true }], w)) b.add(l)
    if (x.warning) b.add([{ text: x.warning, color: 'warning' }])
    if (role && isCheckerRole(x.name)) for (const l of wrapSegs([{ text: `never a task's role, and not turned on or off here: the checker setting runs it (Settings → checker, now ${checkerOn(f.view) ? 'on' : 'off'})`, color: 'inactive' }], w)) b.add(l)
    buttons()
    const section = (title: string, value: string, none: string) => {
      b.blank()
      b.heading(title)
      b.add([{ text: `  ${value || none}`, color: value ? 'text' : 'inactive' }])
    }
    if (role) {
      section('Model', x.model ?? '', "(none: the session's model)")
      section('Skills', (x.skills ?? []).join(', '), '(none)')
      section('Tools', (x.tools ?? []).join(', '), '(none: the base tools only)')
    }
    b.blank()
    b.heading(role ? 'Checklist' : 'Body')
    if (x.text.trim()) for (const l of textLines(x.text.trim(), 'text', w)) b.add(l)
    else b.add([{ text: role ? '  (none: a plain worker)' : '  (none)', color: 'inactive' }])
  }
  b.blank()
  b.heading('File')
  b.add([{ text: `  ${x.file}`, color: 'autoAccept' }])
  b.blank()
  b.add([{ text: 'To change what it says: ask the lead, or edit its file (your own edit shows here at the next board change)', color: 'inactive' }])
  return { ...b, ids: [], selected: '', head }
}

/** The built-in prompt role `x` goes in, view only (T-685, Claude Code's See the prompt page): its name, what it is,
 *  the buttons (Back, the role's other prompts), then its text with the {{role}} slot marked. */
function rolePromptPage(x: ViewDef, kind: RolePromptKind, w: number): Body {
  const b = bodyMaker()
  b.add([{ text: `${kind} prompt`, color: 'claude', bold: true }, { text: ' · built-in, view only', color: 'inactive' }])
  for (const l of wrapSegs([{ text: `${kind === 'checker' ? 'what a checker is told' : `what a worker on a ${kind} task is told`}; role ${x.name}'s checklist goes where ${ROLE_SLOT} is`, color: 'inactive' }], w)) b.add(l)
  for (const l of buttonLines(rolePromptButtons(x.name, kind), w)) b.add(l)
  const head = b.lines.length
  b.blank()
  b.add([{ text: '▍Text', color: 'suggestion', bold: true }])
  for (const line of ROLE_PROMPTS[kind].trimEnd().split('\n')) {
    if (!line.includes(ROLE_SLOT)) {
      b.add([{ text: line || ' ', color: 'text' }])
      continue
    }
    const [before, ...after] = line.split(ROLE_SLOT)
    b.add([
      ...(before ? [{ text: before, color: 'text' }] : []),
      { text: ROLE_SLOT, color: 'warning', bold: true },
      ...(after.join(ROLE_SLOT) ? [{ text: after.join(ROLE_SLOT), color: 'text' }] : []),
      { text: `  ◀ role ${x.name}'s checklist goes here`, color: 'warning' },
    ])
  }
  return { ...b, ids: [], selected: '', head }
}

/** Org-mem's notes in the view file, newest first. */
export const orgMemIn = (f: ViewFile | null): OrgMemNote[] => (Array.isArray(f?.view.org_mem) ? f!.view.org_mem! : [])

/** A note's cursor id on the Organizational memory page ("note:3"), and back (null for any other id). */
export const orgMemNoteId = (n: number) => `note:${n}`
export const orgMemNoteOf = (f: ViewFile | null, id: string): OrgMemNote | undefined => {
  const m = /^note:(\d+)$/.exec(id)
  return m ? orgMemIn(f).find(x => x.n === Number(m[1])) : undefined
}

/** The Organizational memory page (T-619): what org-mem is, then its notes newest first, each its number, task id and
 *  date, then its text wrapped; the cursor's note is the one x deletes. "No notes yet." when there are none. */
function orgMemBody(f: ViewFile, cursor: number, w: number): Body {
  const b = bodyMaker()
  const notes = orgMemIn(f)
  b.heading(ORG_MEM_TITLE)
  for (const l of wrapSegs([{ text: orgMemAbout(orgMemFile(dataDir(f.name))), color: 'inactive' }], w)) b.add(l)
  b.blank()
  if (!notes.length) b.add([{ text: `  ${ORG_MEM_EMPTY}`, color: 'inactive' }])
  const ids = notes.map(x => orgMemNoteId(x.n))
  const selected = ids.length ? ids[Math.min(Math.max(0, cursor), ids.length - 1)]! : ''
  for (const x of notes) {
    const id = orgMemNoteId(x.n)
    b.add([{ text: id === selected ? '› ' : '  ', color: 'ide', bold: true }, { text: orgMemNoteHead(x), color: 'claude', bold: true }])
    for (const l of wrapSegs([{ text: x.text, color: 'text' }], w - 4)) b.add([{ text: '    ', color: 'text' }, ...l])
  }
  b.blank()
  b.add([{ text: `↑↓ picks a note · x deletes it (asks first) · or edit ${orgMemFile(dataDir(f.name))} by hand`, color: 'inactive' }])
  b.blank()
  // Delete (x) (when there are notes) and Back (b), each on its own row as on Claude Code's page
  for (const x of [...(notes.length ? [DELETE_NOTE_BUTTON] : []), LIST_BACK_BUTTON]) buttonLines([x], w).forEach(l => b.add(l))
  return { ...b, ids, selected, head: 1 }
}

/** The Settings tab: each group (Work, Checks before merging, ...) as a heading that opens or closes, like the
 *  Claude Code board's (T-585): "▸ Work · auto · 3 at once" closed (its values in short, core's groupSummaryParts),
 *  "▾ Work" open with its settings under it: name, value, default and range, and what it does on the line under it;
 *  the Roles and Kinds rows open their pages. */
function settingsBody(f: ViewFile, cursor: number, open: readonly string[], w: number): Body {
  const b = bodyMaker()
  const v = f.view
  const nameWidth = Math.max(...SETTINGS.map(x => x.name.length))
  const ids = settingRows(open)
  const selected = ids[Math.min(Math.max(0, cursor), ids.length - 1)]!
  const pages = { roles: defsCount(f, 'roles'), kinds: defsCount(f, 'kinds'), orgmem: orgMemSummary(orgMemIn(f).length) }
  for (const g of SETTING_GROUPS) {
    b.blank()
    const isOpen = open.includes(g.title)
    const front = { text: settingGroupId(g.title) === selected ? '› ' : '  ', color: 'ide', bold: true }
    const hit = { settingGroup: g.title }
    if (!isOpen) {
      const sum = groupSummaryParts(g, v, Math.max(20, w - 4), pages)
      b.add([front, { text: `▸ ${sum.title}`, color: 'text', bold: true }, ...(sum.values ? [{ text: sum.values, color: 'inactive' }] : [])], hit)
      continue
    }
    b.add([front, { text: `▾ ${g.title}`, color: 'text', bold: true }], hit)
    for (const item of g.items) {
      if (item === 'orgmem') {
        const hit = { page: item }
        b.add(
          [
            { text: item === selected ? '› ' : '  ', color: 'ide', bold: true },
            { text: 'Org-mem'.padEnd(nameWidth), color: 'claude', bold: true },
            { text: ` ${orgMemCount(orgMemIn(f).length)}`, color: 'text', bold: true },
          ],
          hit,
        )
        b.add([{ text: '    Enter opens the Organizational memory page: the notes agents left for the next ones, to read or delete', color: 'inactive' }], hit)
        continue
      }
      if (isSettingPage(item)) {
        const label = item === 'roles' ? 'Roles' : 'Kinds'
        const hit = { page: item }
        b.add(
          [
            { text: item === selected ? '› ' : '  ', color: 'ide', bold: true },
            { text: label.padEnd(nameWidth), color: 'claude', bold: true },
            { text: ` ${defsCount(f, item)}`, color: 'text', bold: true },
          ],
          hit,
        )
        b.add([{ text: `    Enter opens the ${label} page: the ${item === 'roles' ? 'worker roles' : 'task kinds'}, to open, turn off or reset`, color: 'inactive' }], hit)
        continue
      }
      const x = settingInfo(item)!
      const hit = { setting: x.name }
      const sel = x.name === selected
      const unplayable = x.name === 'notify' && cantPlayNotify(v)
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
  b.add([{ text: `Enter on a heading opens or closes its group · Enter changes a setting (on/off flips) or opens a page · /${f.name}-settings NAME VALUE · or tell the lead`, color: 'inactive' }])
  b.blank()
  backButton(b, w)
  return { ...b, ids, selected }
}

/** The list: the questions for the owner, NEEDS YOU, what runs and waits to run, then the groups: the backlog (its
 *  first rows when open), done and dropped (their rows when open); the row under the cursor is marked with "›".
 *  With a search on (`search`, core's searchTasks words, T-685) only the matching tasks are listed, as on Claude Code's
 *  list: no questions, every group with a match open (the whole backlog), none without one; the search line and the
 *  [f] change search and [x] clear search buttons stay at the top. */
function listBody(f: ViewFile, cursor: number, open0: Record<PanelGroup, boolean>, nowMs: number, w: number, search = ''): Body {
  const v = f.view
  const query = search.trim()
  const filtering = query !== ''
  const matching = filtering ? searchTasks(v.tasks, query, nowMs) : v.tasks
  const parts = panelSections(matching, nowMs, localOffset(nowMs))
  const questions = filtering ? [] : (v.questions ?? [])
  const open: Record<PanelGroup, boolean> = filtering ? { backlog: true, done: true, dropped: true } : open0
  const backlog = open.backlog ? (filtering ? parts.backlog : parts.backlog.slice(0, BACKLOG_SHOWN)) : []
  const done = open.done ? parts.done : []
  const dropped = open.dropped ? parts.dropped : []
  const gone = filtering ? 0 : archivedOf(v).done
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
  // a doing task: the total work time of all tries, "1h40m", "⊛ 9m", with no try mark (T-628: the band and the task
  // page show it); narrow, the time is left out (see rowStates)
  const { states, width: cellWidth } = rowStates(listed, nowMs, since, cw => cw <= w - (4 + idWidth + 3 + 2) - TITLE_ROOM, false)
  const pointer = (id: string, indent: number) => (id === selected ? `${' '.repeat(Math.max(0, indent - 2))}› ` : ' '.repeat(indent))
  const lines: Line[] = []
  const hits: (PanelHit | null)[] = []
  const add = (l: Line, hit: PanelHit | null = null) => (lines.push(l), hits.push(hit))
  const blank = () => lines.length > top && add([{ text: ' ', color: 'text' }])
  const head = (text: string) => add([{ text, color: 'text', bold: true }])
  // the search line and its buttons, as Claude Code's (two columns between the buttons)
  if (filtering) {
    add([{ text: searchLine(query, matching.length, v.tasks.length), color: 'warning', bold: true }])
    for (const l of buttonLines([CHANGE_SEARCH_BUTTON, CLEAR_SEARCH_BUTTON], w, 2, 'inactive')) add(l)
  }
  const top = lines.length
  if (questions.length) {
    head(questionsLabel(questions.length))
    for (const q of questions) add(questionRow(q, pointer(q.id, 2), idWidth, w), { open: q.id })
  }
  const row = (x: SymccTask, indent: number): Line => {
    const closed = x.status === 'done' || x.status === 'dropped' || x.status === 'backlog'
    const lead = indent + idWidth + 3 + cellWidth + 2
    const fit = fitRow(lead, x.title, rowExtra(x, v.tasks, v.branch ?? '', v.max_minutes, nowMs), w, x.status === 'failed')
    const state = states.get(x.id) ?? { front: '', tag: '', back: '' }
    const sel = x.id === selected
    return [
      { text: pointer(x.id, indent), color: 'ide', bold: true },
      { text: x.id.padEnd(idWidth), color: closed ? 'inactive' : 'claude', bold: !closed || sel },
      // an approved task whose approve runs is shown as running (shownStatus): the doing tone, not bold
      { text: ` ${rowMark(x, nowMs)} ${state.front}${state.back}  `, color: LIST_TONE[shownStatus(x, nowMs)]! },
      { text: fit.title, color: closed ? 'inactive' : 'text', ...(sel || ownersTurn(x, nowMs) ? { bold: true } : {}) },
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
  if (!filtering && !questions.length && !parts.needsYou.length && !running.length) for (const l of ALL_CLEAR) add([{ text: `  ${l}`, color: 'inactive' }])
  const countWidth = Math.max(1, ...[parts.backlog, parts.done, parts.dropped].map(ts => String(ts.length).length))
  if (groups.length) blank()
  for (const x of groups) {
    const label = foldedRow(x.label, x.all.length, open[x.g], countWidth)
    add([{ text: `${pointer(groupId(x.g), 2)}${[label, x.g === 'done' ? archivedNote(gone) : ''].filter(Boolean).join(' ')}`, color: 'text', ...(groupId(x.g) === selected ? { bold: true } : {}) }], { group: x.g })
    for (const t of x.rows) task(t, 4)
    if (x.g === 'backlog' && x.rows.length && x.all.length > x.rows.length) add([{ text: `    ${backlogMoreLabel(x.all.length - x.rows.length).replace(/ \(Enter to show all\)$/, '')}`, color: 'inactive' }])
  }
  return { lines, hits, ids, selected, head: top }
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

/** How many lines of a long History or Report section the task page shows; the rest is cut with "… (n more lines)"
 *  (the whole report stays in its file, named in the section). */
export const SECTION_LINES: Partial<Record<TaskSection['id'], number>> = { history: 30, report: 40 }

/** The page of the task or question `id`: its title, its question and its choices, each a clickable line (T-583),
 *  and the answer just sent (`sent`); then a task's sections as on Claude Code's task page (core's taskSections,
 *  T-580: Why it failed, Answer, Details, Changes, What to do, History, Report, Runs), with the latest report's text
 *  (`report`, read by the TUI) and the changed files from the view file; null when it is gone. */
function openedPage(f: ViewFile, id: string, nowMs: number, w: number, sent = '', report?: PanelChoice['taskReport'], merging = false, busy = false): Body | null {
  const v = f.view
  const b = bodyMaker()
  const addAll = (ls: Line[]) => ls.forEach(l => b.add(l))
  const choices = () => {
    answerOptions(f, id).forEach((c, i) => choiceLine(c, i, w).forEach(l => b.add(l, { choice: i + 1 })))
    if (sent) addAll(wrapSegs([{ text: '  answer sent: ', color: 'success', bold: true }, { text: sent, color: 'text' }], w))
  }
  const q = v.questions?.find(x => x.id === id)
  if (q) {
    addAll(wrapSegs([{ text: q.id, color: 'claude', bold: true }, { text: `  ${q.text}`, color: 'text', bold: true }], w))
    // its Back button, as Claude Code's question page has; it stays at the top with the question
    addAll(buttonLines([BACK_BUTTON], w))
    const head = b.lines.length
    b.add([{ text: ' ', color: 'text' }])
    choices()
    return { ...b, ids: [], selected: id, head }
  }
  const t = v.tasks.find(x => x.id === id)
  if (!t) return null
  addAll(wrapSegs([{ text: t.id, color: 'claude', bold: true }, { text: `  ${t.title}`, color: 'text', bold: true }], w))
  // the status badge, as on Claude Code's task page: the step a doing task is in ("[⌕ checker · 5m]"), else its status
  // (`merging`, an approve this panel just sent: its step at once, on the badge, the Status row and the Stage line alike)
  const badge = statusBadge(t, nowMs, undefined, merging)
  b.add([{ text: `[${badge.text}]`, color: badge.color, bold: true }])
  // T-680: the page's buttons, as Claude Code's terminal page draws them ([ Back ] [ Pause ] ...); a click presses one
  addAll(buttonLines(taskButtons(t, busy), w))
  // the title, the badge and the buttons stay at the top while the rest of the page scrolls
  const head = b.lines.length
  const asked = taskAsks(t, v.max_minutes)
  if (asked) {
    b.add([{ text: ' ', color: 'text' }])
    addAll(wrapSegs([{ text: 'asks: ', color: 'warning', bold: true }, { text: asked.text, color: 'text' }], w))
    choices()
  } else if (sent) addAll(wrapSegs([{ text: 'answer sent: ', color: 'success', bold: true }, { text: sent, color: 'text' }], w))
  const sections = taskSections(t, {
    width: w,
    nowMs,
    detail: { roles: defsIn(f, 'roles'), kinds: defsIn(f, 'kinds'), all: v.tasks, when: iso => when(iso), board: v, merging, driving: v.driving ?? false, ...(v.archived_done ? { archivedDone: v.archived_done } : {}) },
    ...(report ? { texts: { [report.file]: report.text } } : {}),
    changes: v.changes?.[t.id] ?? null,
    target: intoOf(t),
    dataDir: dataDir(f.name || DEFAULT_NAME),
    // here a click on a file, like d, shows all the task's changes (there is no one-file diff)
    changesHint: '  d (or a click on a file) shows the changes',
  })
  for (const sec of sections) {
    b.add([{ text: ' ', color: 'text' }])
    b.add([{ text: `▍${sec.title}`, color: 'suggestion', bold: true }])
    const most = SECTION_LINES[sec.id] ?? Infinity
    sec.lines.slice(0, most).forEach(l => b.add(l.segs.length ? l.segs : [{ text: ' ', color: 'text' }], l.action ? { key: 'd' } : null))
    if (sec.lines.length > most) b.add([{ text: `  … (${sec.lines.length - most} more lines)`, color: 'inactive' }])
  }
  return { ...b, ids: [], selected: id, head }
}

/** A numbered choice of a question as Claude Code's question pop-up shows it ("  1. Allow", "  3. Answer…"; T-651):
 *  a long one wraps under its text (core's choiceLines), and a click on any of its lines picks it. */
const choiceLine = (c: string, i: number, w: number): Line[] => choiceLines(c, i + 1, w, '  ').map(text => [{ text, color: c === OWN_ANSWER ? 'inactive' : 'text' }])

/** The last choice of a question: the owner types their own answer. */
export const OWN_ANSWER = 'Answer…'

/** The choices to answer task or question `id` with (a task's from core's taskAsks; a question's own options),
 *  OWN_ANSWER last; [] when it asks nothing. */
export function answerOptions(f: ViewFile | null, id: string): string[] {
  const q = f?.view.questions?.find(x => x.id === id)
  if (q) return [...q.options.slice(0, 8), OWN_ANSWER]
  const t: BoardTask | undefined = f?.view.tasks.find(x => x.id === id)
  const asks = t ? taskAsks(t, f?.view.max_minutes) : null
  if (!asks) return []
  return asks.choices.length ? asks.choices : [OWN_ANSWER]
}

/** What sends each of core's task actions: /<name>-approve, -reject (it asks the reason) or -diff, else a word of
 *  /<name>-task T-5 (TaskVerb: merge now is retry, as on the terminal's page). Copy and Watch worker have none: this
 *  panel can't copy or show a worker, so it leaves them out. */
export const TASK_ACTION_COMMANDS: Partial<Record<TaskActionId, 'approve' | 'reject' | 'diff' | TaskVerb>> = {
  approve: 'approve', done: 'approve', reject: 'reject', 'ask-more': 'reject', 'show-changes': 'diff', 'keep-note': 'note',
  pause: 'pause', resume: 'resume', 'merge-now': 'retry', retry: 'retry', 'to-todo': 'todo', stash: 'stash', role: 'role', 'already-merged': 'merged', drop: 'drop', 'needs-review': 'review',
}

/** The actions of task `t`'s page (core's taskActions, the terminal's and VS Code's buttons) this panel sends, each
 *  with its key: every one but Copy and Watch worker (and Drop in review, which has no key there). */
export const panelTaskActions = (t: BoardTask, merging = false): TaskAction[] => taskActions(t, { merging }).filter(a => a.key && TASK_ACTION_COMMANDS[a.id])

/** One button of a page's row of buttons (T-680, as on Claude Code's terminal page): its words, and what a click on
 *  it does (its key, or a task action that has no key). */
export type PanelButton = { label: string; hit: PanelHit }

/** The Back button every page starts with (b). */
export const BACK_BUTTON: PanelButton = { label: 'Back', hit: { key: 'back' } }

/** The buttons of the list pages (T-685), with Claude Code's words: the task list's search buttons ([f] search in
 *  the footer; [f] change search and [x] clear search under the search line while one is on), and the Back (b) and
 *  Delete (x) buttons at the end of the Scouts, Settings, Roles, Kinds and Organizational memory pages. */
export const SEARCH_BUTTON: PanelButton = { label: '[f] search', hit: { key: 'f' } }
export const CHANGE_SEARCH_BUTTON: PanelButton = { label: '[f] change search', hit: { key: 'f' } }
export const CLEAR_SEARCH_BUTTON: PanelButton = { label: '[x] clear search', hit: { key: 'x' } }
export const LIST_BACK_BUTTON: PanelButton = { label: 'Back (b)', hit: { key: 'back' } }
export const DELETE_NOTE_BUTTON: PanelButton = { label: 'Delete (x)', hit: { key: 'x' } }

/** How a button looks: "[ Back ]". */
export const buttonText = (b: PanelButton) => `[ ${b.label} ]`

/** The buttons of task `t`'s page, in Claude Code's order: Back, then core's taskActions with Claude Code's words
 *  (actionButtonLabel: "Stash to backlog (z)"), but Copy and Watch worker, which this panel can't do (`merging`: see
 *  panelKeys). A button with a key presses that key; one without (Drop in review) sends its action. */
export const taskButtons = (t: BoardTask, merging = false): PanelButton[] => [
  BACK_BUTTON,
  ...taskActions(t, { merging }).filter(a => TASK_ACTION_COMMANDS[a.id]).map(a => ({ label: actionButtonLabel(a), hit: a.key ? { key: a.key as PanelKey } : { action: a.id } })),
]

/** The buttons of scout `sc`'s page, as Claude Code's: Back, Run now (not while it runs), Edit, Pause or Resume. */
export const scoutButtons = (sc: Pick<SymccScout, 'running' | 'paused'>): PanelButton[] => [
  BACK_BUTTON,
  ...(sc.running ? [] : [{ label: 'Run now', hit: { key: 'r' as const } }]),
  { label: 'Edit', hit: { key: 'e' } },
  { label: sc.paused ? 'Resume' : 'Pause', hit: { key: 'p' } },
]

/** A row of buttons, going on to more rows when it doesn't fit `w` (core's packRows, as Claude Code's buttonRows),
 *  never cutting a button; each button is a piece a click presses. */
export function buttonLines(buttons: readonly PanelButton[], w: number, gap = 1, color = 'ide'): Line[] {
  return packRows(buttons.map(b => buttonText(b).length), Math.max(1, Math.floor(w)), gap).map(row =>
    row.flatMap((k, i) => [...(i ? [{ text: ' '.repeat(gap), color: 'inactive' }] : []), { text: buttonText(buttons[k]!), color, hit: buttons[k]!.hit }]),
  )
}

/** The roles a task's role can be set to (Role on its page): those turned on, general first, never the checker role. */
export const panelRoleChoices = (f: ViewFile | null): string[] => {
  const names = defsIn(f, 'roles').filter(d => !d.off && !d.broken && !isCheckerRole(d.name)).map(d => d.name)
  return names.some(n => n.toLowerCase() === DEFAULT_ROLE) ? names : [DEFAULT_ROLE, ...names]
}

/** A panel action as the slash command that does it, run in the TUI's session: approve, reject (with the reason), diff or answer. */
export type PanelAction =
  | { kind: 'approve'; id: string }
  | { kind: 'reject'; id: string; reason: string }
  /** show the files a task in review changed */
  | { kind: 'diff'; id: string }
  | { kind: 'answer'; id: string; answer: string }
  /** one of the task page's other actions: /<name>-task T-5 <verb> [arg] (drop's reason, role's name, review's on|off) */
  | { kind: 'task'; id: string; verb: TaskVerb; arg?: string }
  /** run a scout now, or (with `paused`) pause or resume its timer */
  | { kind: 'scout'; scout: string; paused?: boolean }
  | { kind: 'setting'; setting: SettingName; value: string }
  /** change one part of a scout's file: how often it runs, its model ('' = the session's), its instructions */
  | { kind: 'scout-edit'; scout: string; field: ScoutEditField; value: string }
  /** turn a role or kind off or on, or reset it to the built-in one */
  | { kind: 'def'; def: 'role' | 'kind'; name: string; action: DefAction }
  /** delete note `n` (its place in the file) from organizational memory (T-619); `key`: its check word
   *  (orgMemNoteKey), so a note that moved meanwhile is not the one deleted */
  | { kind: 'orgmem-delete'; n: number; key?: string }
  /** set the board mode (the list's [m] button, T-685): /<name>-mode review|auto */
  | { kind: 'mode'; mode: SymccMode }

/** The slash command (its name, without the slash, and its text) that does `a` for plugin `name`. */
export function actionCommand(a: PanelAction, name: string = DEFAULT_NAME): { name: string; text: string } {
  if (a.kind === 'approve') return { name: `${name}-approve`, text: a.id }
  if (a.kind === 'reject') return { name: `${name}-reject`, text: `${a.id} ${a.reason.trim()}` }
  if (a.kind === 'diff') return { name: `${name}-diff`, text: a.id }
  if (a.kind === 'task') return { name: `${name}-task`, text: `${a.id} ${a.verb} ${a.arg?.trim() ?? ''}`.trim() }
  if (a.kind === 'scout') return { name: `${name}-scout`, text: a.paused === undefined ? a.scout : `${a.scout} ${a.paused ? 'pause' : 'resume'}` }
  if (a.kind === 'setting') return { name: `${name}-settings`, text: `${a.setting} ${a.value.trim()}` }
  if (a.kind === 'scout-edit') return { name: `${name}-scout`, text: `${a.scout} ${a.field} ${a.value.trim() || (a.field === 'model' ? 'none' : '')}`.trim() }
  if (a.kind === 'def') return { name: `${name}-settings`, text: `${a.def} ${a.name} ${a.action}` }
  if (a.kind === 'mode') return { name: `${name}-mode`, text: a.mode }
  if (a.kind === 'orgmem-delete') return { name: `${name}-settings`, text: `orgmem delete ${a.n}${a.key ? ` ${a.key}` : ''}` }
  return { name: `${name}-answer`, text: `${a.id} ${a.answer.trim()}` }
}

/** The next cursor after moving `by` rows in a list of `n` (it stops at the ends). */
export const moveCursor = (cursor: number, by: number, n: number) => (n ? Math.min(n - 1, Math.max(0, cursor + by)) : 0)
