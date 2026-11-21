// What OpenCode's TUI part (opencode/tui.ts, T-466) draws, as plain data: the band above the prompt
// (session.composer.top) and the board panel (session.panel), each as lines of colored text (core's Seg), made from
// the view file the engine writes (view.ts) with hooks/core's own helpers: the band's row fronts and notes
// (bandLeads, bandNote), the list's sections, marks and short states (panelSections, rowMark, rowStates,
// rowExtra, fitRow), the banner (bannerLines) and a task's page sections (taskSections, T-580). Nothing here draws or reads a file, so
// the tests check exactly what the TUI shows (hooks/opencode/tests/opencode-tui.spec.ts). The panel's actions go back
// to the engine as symcc's slash commands (actionCommand), run in the TUI's session (R6 of T-468). Like the Claude Code
// board it has four tabs (T-559, T-692): Tasks, Live (core/live.ts's lanes and today), Scouts (the list, a scout's page with its runs, a run's report) and
// Settings (every setting in its group, with its value and default; the groups open and close as on the Claude Code
// board, T-585). Like it, Settings opens the Roles and Kinds
// pages (a list, then one role's or kind's page: turn it off or on, reset it to the built-in one, T-562) and a
// scout's page edits the scout (how often, model, instructions); the roles and kinds come in the view file too.
// The Live tab's Organizational memory section at its bottom (T-718, core's liveOrgMem: the count and a fill bar, the
// 3 newest notes, the topics with their counts) opens the Organizational memory page (T-619): Enter on a topic its
// notes only ("orgmem:tests"), on a newest note all notes with the cursor on it, m (or a click on the header) all notes.
// x deletes one (after a yes) with /<name>-settings orgmem delete N; Back returns to the Live tab; the notes come in the
// view file too (org_mem). Every screen has the
// Claude Code panel's buttons (T-680, T-685): its tab row, the list's [m] mode and [f] search buttons, Back (b) on the
// list pages, a role's or kind's page buttons (T-706: with Edit, its edit page's Save and Cancel, and Remove), + New
// role, + New kind and + New scout, and the banner's Set up git (g); each a click on it presses its key.
import type { SymccTask, SymccScout, SymccMode } from '../../types'
import type { PaneView } from '../app/state'
import type { OwnerQuestion } from '../core/questions'
import {
  statusCounts, newestFirst, bandLeads, bandNote, bandBrand, bandWhere, boardBrand, modeLabel, modeOf, planBandText, withCrew, questionsForYou,
  bannerLines, bannerRule, footerRule, type BannerTone, panelSections, localOffset, when, SECTION_LABEL, BACKLOG_SHOWN, foldedRow, backlogMoreLabel, ALL_CLEAR,
  rowStates, rowMark, TITLE_ROOM, fitRow, rowExtra, questionsLabel, archivedOf, archivedNote, statusMark, detailRows, detailRowLines, wrapSegs, hintLineText,
  type KeyHint, type Seg, type BoardTask, intoOf, taskActions, taskAsks, actionButtonLabel, packRows, type TaskAction, type TaskActionId,
  ownersTurn, shownStatus, sortScouts, scoutListRows, scoutHowTo, scoutRunLine, scoutOutcomeTone, scoutLastRunProblem, scoutFile,
  SETTING_GROUPS, SETTINGS, isSettingPage, settingInfo, settingValue, cantPlayNotify, groupSummaryParts,
  type SettingName, type SettingPage, type ScoutRunRecord, type RoleDef, type KindDef, type ScoutEditField, type DefAction, type DefEditField, type TaskVerb, settingsKeys, rolesKeys, kindsKeys, roleEditKeys, defEditFields, roleTools, roleFileText, roleSkipReason, kindFileText, kindSkipReason,
  DEFAULT_ROLE, isCheckerRole, ALWAYS_ON_KINDS, checkerOn, roleNameError, kindNameError, leadScoutNameError, checkStepNow, rowEndText, taskPhase, choiceLines, driveWarning,
  searchTasks, showsHeader, type BoardPage,
  LIVE_TABS, LIVE_EMPTY, LIVE_INDENT, liveLegend, LIVE_SECTIONS, type LiveSeg, LIVE_TONE, liveBold, liveHeading, liveIndented, liveInner, tabRow, LIVE_VIEW_KEYS, liveKeys, liveBranches, liveLanes, liveLayout, liveStations, liveHeader, liveLabelSegs, laneLines, liveOrgMem, liveTrains, trainRows, liveTodayLines, searchLine, modeButton, hintLines, roleKeys, rolePromptKeys, ROLE_PROMPTS, ROLE_SLOT, promptsOfRole, type RolePromptKind,
} from '../board'
import { type DefSource, type BrokenDef, defSource, sourceLabel, brokenNamed, brokenLabel, defNamed } from '../core/def-files'
import { restFrame } from '../core/logo'
import { taskSections, type TaskSection } from '../core/task-sections'
import { type ActionGroup, groupSegLines, headerRule, inGroups, navHint, packGroups, type PageFrom, PILL_COLOR, pillText, placeIn, scoutAbout, scoutButtons as headerScoutButtons, scoutListNames, scoutStateGroups, taskColor, taskPlace, taskStateGroups, titleLines, whereLine } from '../core/page-header'
import { sessionNote } from '../core/details'
import type { DiffFile } from '../core/review'
import { DEFAULT_NAME, dataDir } from '../name'
import { ORG_MEM_EMPTY, ORG_MEM_KEY, orgMemAbout, orgMemKeys, orgMemNoteHead, orgMemFile, orgMemOfTopic, orgMemPageTitle, orgMemTopicEmpty, type OrgMemNote } from '../core/org-mem'

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
  /** whether Remove works (T-706, as on Claude Code's page): an added one, or a broken file with no built-in's name */
  canRemove: boolean
}

/** The roles or kinds as the view file carries them: each merged one (built-in, or the owner's over it) in order, then
 *  the owner's files that can't be read. `dir` is the owner's folder for them (".symcc/roles"). */
export function viewDefs(def: 'role' | 'kind', all: readonly (RoleDef | KindDef)[], builtIn: readonly { name: string }[], project: readonly { name: string }[], broken: readonly BrokenDef[], dir: string): ViewDef[] {
  const nameError = def === 'role' ? roleNameError : kindNameError
  const brokenRow = (b: BrokenDef): ViewDef => {
    const okName = !nameError(b.name)
    const canReset = okName && !!defNamed(builtIn, b.name)
    return { name: b.name, description: '', source: '', off: false, text: '', broken: brokenLabel(b), file: b.file, canOff: false, canReset, canRemove: okName && !canReset }
  }
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
      canRemove: source === 'added',
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

/** The panel's four views, as the Claude Code board's tabs: Tasks, Live (T-692), Scouts and Settings (keys t, l, s and c). */
export type PanelTab = 'tasks' | 'live' | 'scouts' | 'settings'

/** The tabs in order, with their keys (core's LIVE_TABS, as the Claude Code board's tab row). */
export const PANEL_TABS: readonly { tab: PanelTab; label: string; key: 't' | 'l' | 's' | 'c' }[] = LIVE_TABS

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
    // T-727: the Live tab's Branches figures; a broken value is left out (no section)
    const br = rest.branches as Partial<NonNullable<PaneView['branches']>> | undefined
    if (!br || typeof br !== 'object' || typeof br.into !== 'string' || !Array.isArray(br.commits) || !br.tasks || typeof br.tasks !== 'object') delete rest.branches
    // T-769: ▍Today's lead, scout and cost figures; a broken value is left out
    const team = rest.today_team as Partial<NonNullable<PaneView['today_team']>> | undefined
    if (!team || typeof team !== 'object' || typeof team.day !== 'string') delete rest.today_team
    if (!rest.changes || typeof rest.changes !== 'object' || Array.isArray(rest.changes)) delete rest.changes
    const view = { ...rest, ...runs, working: Array.isArray(f.view.working) ? f.view.working : [], scouts: Array.isArray(f.view.scouts) ? f.view.scouts : [], test_commands: Array.isArray(f.view.test_commands) ? f.view.test_commands : [] }
    return { root: s(f.root), home: s(f.home), name: s(f.name) || DEFAULT_NAME, version: s(f.version), written_at: Number(f.written_at) || 0, view }
  } catch {
    return null
  }
}

/** The panel's keys (see panelKeys for which ones each page offers). */
/** `prev` and `next` (T-751, keys [ and ]): the previous and the next task or scout of the list a page was opened from. */
export type PanelKey = 'up' | 'down' | 'open' | 'back' | 'close' | 'prev' | 'next' | LetterKey | ChoiceKey

/** The letter keys the panel takes, each pressed as itself (the task page's take core's taskActions keys: u resume,
 *  z stash to backlog, v keep as a note, l role, h already merged, n needs review); and on the list (T-685) f search
 *  and m the board mode, as on Claude Code's list; (T-706) g Set up git (the banner's button), n a new role, kind or
 *  scout, e and d a role's or kind's Edit and Remove. j and k are not here: they always move (KEY_BINDS). */
export const LETTER_KEYS = ['a', 'x', 'd', 't', 's', 'c', 'r', 'p', 'o', 'e', 'u', 'z', 'v', 'l', 'h', 'n', 'f', 'm', 'g'] as const
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
 *  and (T-680) press a task page's button that has no key (Drop in review): `action`, its id in core's taskActions;
 *  and (T-706) on a role's or kind's edit page, change one of its boxes (`editField`) or press Save (`save`). */
export type PanelHit = { open: string } | { group: PanelGroup } | { key: PanelKey } | { tab: PanelTab } | { scout: string } | { run: string } | { setting: SettingName } | { page: string } | { choice: number } | { settingGroup: string } | { action: TaskActionId } | { editField: DefEditField } | { save: true }

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
  /** the open role's or kind's edit mode (T-706, Claude Code's Edit), when it is for the open page */
  edit?: DefDraft
  /** the tab the open task's page was opened from (T-751: its Back link says "‹ Live", and prev/next go through the
   *  Live tab's tasks); the Tasks list when left out */
  from?: PageFrom
}

/** A role's or kind's edit mode (T-706, as Claude Code's Edit page): the page it is for ("role:tester"), each box's
 *  value as changed so far (core's ROLE_EDIT_FIELDS, KIND_EDIT_FIELDS), and what Save found wrong. */
export type DefDraft = { page: string; values: Record<string, string>; error?: string }

/** The edit mode of role or kind `d`, filled from it (as Claude Code's roleDraftOf, kindDraftOf). */
export function defDraftOf(list: DefList, d: ViewDef): DefDraft {
  const values: Record<string, string> = list === 'roles'
    ? { description: d.description, model: d.model ?? '', skills: (d.skills ?? []).join(', '), tools: (d.tools ?? []).join(', '), checklist: d.text }
    : { description: d.description, body: d.text }
  return { page: defPageId(list, d.name), values }
}

/** The boxes of the edit page, in Claude Code's order with its names and placeholders. */
export const DEF_EDIT_BOXES: Record<DefEditField, { label: string; placeholder: (def: 'role' | 'kind') => string }> = {
  description: { label: 'Description', placeholder: def => (def === 'role' ? 'what the role is for, in a few words' : 'what this kind of task is, in a few words') },
  model: { label: 'Model', placeholder: () => "empty: the session's model" },
  skills: { label: 'Skills', placeholder: () => 'skill names joined with ", " (empty: none)' },
  tools: { label: 'Tools', placeholder: () => 'extra tools: web, to search and read the web (empty: none)' },
  checklist: { label: 'Checklist', placeholder: () => 'what a worker with this role checks, one line each' },
  body: { label: 'Body', placeholder: () => 'free text about the kind' },
}

/** An edit box's cursor id ("box:model"). */
export const editBoxId = (field: DefEditField) => `box:${field}`
/** The edit page's cursor ids for its Save and Cancel (x) buttons, before its boxes (T-706, as Claude Code's ↑↓). */
export const EDIT_SAVE_ID = 'edit:save'
export const EDIT_CANCEL_ID = 'edit:cancel'
/** Where the edit page's cursor starts: its first box (Description), as Claude Code's autoFocus; ↑ reaches Cancel and Save. */
export const EDIT_FIRST_BOX = 2

/** The fields of the edit mode's role or kind whose value differs from `d`'s (in the page's order): what Save sends. */
export function draftChanges(list: DefList, d: ViewDef, draft: DefDraft): DefEditField[] {
  const before = defDraftOf(list, d).values
  return defEditFields(list === 'roles' ? 'role' : 'kind').filter(k => (draft.values[k] ?? '') !== (before[k] ?? ''))
}

/** What Save says when the description is empty (Claude Code's words). */
export const noDescriptionText = (list: DefList) => `description is missing: say in a few words what ${list === 'roles' ? 'the role is for' : 'this kind of task is'}`

/** Why Save can't save the edit mode of `name` (Claude Code's error words), or '' when it can: an empty description,
 *  a tool word a role may not have (roleTools), or a file the role or kind could not be read from (roleSkipReason,
 *  kindSkipReason, on the file text the lead's tool would write). The panel shows it on the edit page and sends nothing,
 *  as Claude Code's saveRoleDraft keeps its edit page open with the tool's error. */
export function draftError(list: DefList, name: string, draft: DefDraft): string {
  const v = draft.values
  const description = (v.description ?? '').trim()
  if (!description) return noDescriptionText(list)
  const items = (s: string | undefined) => (s ?? '').split(',').map(x => x.trim()).filter(Boolean)
  if (list === 'kinds') return kindSkipReason(name.toLowerCase(), kindFileText({ description, body: v.body ?? '' })) ?? ''
  const tools = roleTools(items(v.tools))
  if (typeof tools === 'string') return tools
  const model = (v.model ?? '').trim()
  return roleSkipReason(name, roleFileText({ description, ...(model ? { model } : {}), skills: items(v.skills), ...(tools.length ? { tools } : {}), prompt: v.checklist ?? '' })) ?? ''
}

/** The keys at the bottom of the edit page: Claude Code's (roleEditKeys), with Enter, which opens a box here. */
export const defEditKeys = (): KeyHint[] => {
  const [move, cancel] = roleEditKeys()
  return [move!, { key: 'Enter', word: 'change a box or press Save' }, cancel!]
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
  // the Live tab's one page: the Organizational memory page (T-687)
  if (tab === 'live') return orgMemPageTopic(id) !== null
  if (tab === 'scouts') return (f.view.scouts ?? []).some(x => x.name === id)
  if (tab === 'settings') return !!settingsPlace(f, id)
  return f.view.tasks.some(x => x.id === id) || (f.view.questions ?? []).some(x => x.id === id)
}

/** Scout `scout`'s recent runs in the view file, newest first. */
export const scoutRunsIn = (f: ViewFile | null, scout: string): ScoutRun[] => (Array.isArray(f?.view.scout_runs?.[scout]) ? f!.view.scout_runs![scout]! : [])

/** The Settings pages that list roles or kinds. */
type DefList = SettingPage

/** The Organizational memory page's id on the Live tab (T-687: all notes); T-718: "orgmem:tests" is topic tests' notes only. */
export const ORG_MEM_PAGE = 'orgmem'

/** T-718: the page id of topic `topic`'s notes ("orgmem:tests"; all notes without a topic). */
export const orgMemPageId = (topic?: string | null) => (topic ? `${ORG_MEM_PAGE}:${topic}` : ORG_MEM_PAGE)

/** T-718: whether `id` is an Organizational memory page, and its topic ('' = all notes; null: not one). */
export const orgMemPageTopic = (id: string): string | null => (id === ORG_MEM_PAGE ? '' : id.startsWith(`${ORG_MEM_PAGE}:`) ? id.slice(ORG_MEM_PAGE.length + 1) : null)

/** T-718: the cursor ids of the Live tab's org-mem section: a newest note's ("om-note:3") and a topic's ("om-topic:tests"). */
export const liveNoteId = (n: number) => `om-note:${n}`
export const liveTopicId = (topic: string) => `om-topic:${topic}`
/** T-727: the cursor id of a Branches row on the Live tab ("br:T-721"); Enter or a click on it opens the task. */
export const liveBranchId = (id: string) => `br:${id}`
/** The task of a Branches row's cursor id, else null. */
export const branchIdTask = (id: string): string | null => (id.startsWith('br:') ? id.slice(3) : null)

/** A page under Settings: the Roles or Kinds list (`id` "roles" or "kinds"),
 *  or one role's or kind's page ("role:tester", "kind:bug"; its list is `list`), or (T-685) the built-in prompt a role
 *  goes in, view only ("prompt:tester:change", `prompt`); null when there is no such page (or the role or kind left the view). */
export function settingsPlace(f: ViewFile | null, id: string): { list: SettingPage; def?: ViewDef; prompt?: RolePromptKind } | null {
  if (id === 'roles' || id === 'kinds') return { list: id }
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

/** Why a new role's, kind's or scout's name (typed in "+ New ...") can't be used, as the engine would refuse it ('' when
 *  it can): the lead's tool's name check, then a name already in the view (any case), as Claude Code's newDefFile and
 *  New scout keep the name box open with the reason. A file there that can't be read says what its page offers. */
export function newNameError(f: ViewFile | null, what: 'role' | 'kind' | 'scout', name: string): string {
  const n = name.trim()
  if (what === 'scout') {
    const bad = leadScoutNameError(n)
    if (bad) return bad
    const there = (f?.view.scouts ?? []).find(x => x.name.toLowerCase() === n.toLowerCase())
    return there ? `a scout named ${there.name} already exists` : ''
  }
  const bad = (what === 'role' ? roleNameError : kindNameError)(n)
  if (bad) return bad
  const there = defNamed(defsIn(f, what === 'role' ? 'roles' : 'kinds'), n)
  if (!there) return ''
  if (there.broken) return `${there.file} is already there but ${there.broken}: ${there.canReset ? 'open it in the list to Reset to built-in' : 'open it in the list to Remove it'}, or fix the file by hand`
  return `a ${what} named ${there.name} already exists; open it in the list to change it`
}

/** How long a "+ New ..." waits for its role, kind or scout to show in the view file before it stops waiting (ms). */
export const NEW_OPEN_MS = 15_000

/** The page id of the built-in prompt role `role` goes in: "prompt:tester:change". */
export const rolePromptId = (role: string, kind: RolePromptKind) => `prompt:${role}:${kind}`

/** The buttons of a role's or kind's page, in Claude Code's order (T-685, T-706): Back, Edit (e; not a file that can't
 *  be read), See the prompt (a role, p), Turn off or Turn on (o), Reset to built-in (r), Remove (d; it asks first). */
export const defButtons = (list: DefList, d: ViewDef): PanelButton[] => [
  BACK_BUTTON,
  ...(!d.broken ? [{ label: 'Edit', hit: { key: 'e' as const } }] : []),
  ...(list === 'roles' && !d.broken ? [{ label: 'See the prompt', hit: { key: 'p' as const } }] : []),
  ...(d.canOff ? [{ label: d.off ? 'Turn on' : 'Turn off', hit: { key: 'o' as const } }] : []),
  ...(d.canReset ? [{ label: 'Reset to built-in', hit: { key: 'r' as const } }] : []),
  ...(d.canRemove ? [{ label: 'Remove', hit: { key: 'd' as const } }] : []),
]

/** The "+ New role", "+ New kind" and "+ New scout" buttons (n), as on Claude Code's Roles, Kinds and Scouts pages. */
export const NEW_ROLE_BUTTON: PanelButton = { label: '+ New role', hit: { key: 'n' } }
export const NEW_KIND_BUTTON: PanelButton = { label: '+ New kind', hit: { key: 'n' } }
export const NEW_SCOUT_BUTTON: PanelButton = { label: '+ New scout', hit: { key: 'n' } }

/** The banner's git row (T-706, as Claude Code's): with no git repo or no commit yet, what is wrong and the
 *  "[ Set up git (g) ]" button, which asks for a yes before /<name>-settings git setup; no row otherwise. */
export function gitRowLines(v: Pick<PaneView, 'git_state'>, w: number): Line[] {
  if (v.git_state !== 'no-repo' && v.git_state !== 'no-commits') return []
  const text = v.git_state === 'no-repo' ? 'No git repo here; nothing starts. ' : 'No commits yet; nothing starts. '
  const button = buttonText(SETUP_GIT_BUTTON)
  const pieces: DrawSeg[] = [{ text, color: 'warning' }, { text: button, color: 'ide', hit: SETUP_GIT_BUTTON.hit }]
  return text.length + button.length <= w ? [pieces] : [[pieces[0]!], [pieces[1]!]]
}

/** The banner's Set up git button (g). */
export const SETUP_GIT_BUTTON: PanelButton = { label: 'Set up git (g)', hit: { key: 'g' } }

/** What the Set up git button asks before it sends the command (setup_git's own steps, in short). */
export const SETUP_GIT_ASK = 'Set up git here? It runs git init on main (if there is no repo), writes a .gitignore and makes a first commit of the current files, leaving out ones that look like secrets; it never pushes.'

/** What a role's or kind's Remove asks before it sends the command (Claude Code's words). */
export const removeAsk = (list: DefList, d: ViewDef) => `Remove ${list === 'roles' ? 'role' : 'kind'} ${d.name} and delete ${d.file}?`

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
  return tabKeys(f, opened, tab, run, heading, merging)
}

/** The keys of the Live tab (core's liveKeys), but w (watch worker: OpenCode's panel can't show a worker's session). */
export const panelLiveKeys = (): KeyHint[] => liveKeys().filter(k => k.key !== 'w')

function tabKeys(f: ViewFile | null, opened: string, tab: PanelTab, run: string, heading: boolean, merging: boolean): KeyHint[] {
  if (tab === 'live') return orgMemPageTopic(opened) !== null ? orgMemKeys(false, orgMemOfTopic(orgMemIn(f), orgMemPageTopic(opened)).length > 0) : panelLiveKeys()
  const move = { key: '↑↓', word: 'move' }
  const views = { key: LIVE_VIEW_KEYS, word: 'views' }
  const close = { key: 'Esc', word: 'close' }
  const back = { key: 'b', word: 'back' }
  if (tab === 'settings') {
    const place = settingsPlace(f, opened)
    // the settings list: core's keys, as Claude Code's (Enter open/close on a group heading, else change)
    if (!place) return settingsKeys(heading)
    // the Roles and Kinds lists: Claude Code's keys (n makes a new one)
    if (!place.def) return place.list === 'roles' ? rolesKeys() : kindsKeys()
    if (place.prompt) return rolePromptKeys()
    // core's keys of Claude Code's role page (T-706: with Edit and Remove)
    const d = place.def
    return roleKeys({ canEdit: !d.broken, canOff: d.canOff, off: d.off, canReset: d.canReset, canRemove: d.canRemove, canSeePrompt: place.list === 'roles' && !d.broken })
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
  // the shared note says "set up git (g)": this panel has the g key and the Set up git button too (T-706)
  const v = f.view
  const banner: Line[] = bannerLines({ ...v, max_parallel: v.max_parallel ?? 0, max_minutes: v.max_minutes ?? 0, auto_retries: v.auto_retries ?? 0, mode: v.mode }, f.root, f.home, v.driving ?? false, w, nowMs, f.name, restFrame(), f.version).map(l => [
    ...(l.art ? [{ text: l.art, color: 'ide' }] : []),
    ...l.parts.map(p => ({ text: p.text, color: TONE[p.tone], ...(p.bold ? { bold: true } : {}) })),
  ])
  banner.push(...gitRowLines(v, w))
  const tab = choice.tab ?? 'tasks'
  // T-700: the header (banner, tabs, rule) only on a list page, as on the terminal panel and VS Code (core's showsHeader)
  const top = showsHeader(boardPageOf(f, choice)) ? [...banner, ...tabsLines(tab, w, v.tasks.length, (v.scouts ?? []).length), [{ text: bannerRule(w), color: 'ide' }]] : []
  // the list's footer has Claude Code's board-mode row (T-685): the mode, its [m] button and (no search on) [f] search
  let modeRow: Line[] = []
  let body: { lines: Line[]; hits?: (PanelHit | null)[] | null; ids: string[]; selected: string; head?: number }
  let keys: KeyHint[]
  if (tab === 'live') {
    // T-687: the Organizational memory page, opened from the button at the tab's bottom
    const topic = orgMemPageTopic(choice.opened)
    body = topic !== null ? orgMemBody(f, choice.cursor, w, topic) : liveBody(f, choice.cursor, nowMs, w)
    keys = panelKeys(f, topic !== null ? choice.opened : '', 'live')
  } else if (tab === 'scouts') {
    body = scoutsBody(f, choice, nowMs, w)
    keys = panelKeys(f, choice.opened, 'scouts', choice.run ?? '')
  } else if (tab === 'settings') {
    const place = settingsPlace(f, choice.opened)
    const editing = editOf(f, choice)
    body = editing && place?.def ? defEditPage(f, place.list as DefList, place.def, editing, choice.cursor, w) : place?.prompt && place.def ? rolePromptPage(place.def, place.prompt, w) : place?.def ? defPage(f, place.list as DefList, place.def, w) : place ? defsList(f, place.list as DefList, choice.cursor, w) : settingsBody(f, choice.cursor, choice.settingsOpen ?? SETTINGS_OPEN, w)
    keys = editing ? defEditKeys() : panelKeys(f, place ? choice.opened : '', 'settings', '', !place && !!settingGroupOf(body.selected))
  } else {
    const t = choice.opened ? f.view.tasks.find(x => x.id === choice.opened) : undefined
    // the approve in progress takes the same buttons and keys away (approveInProgress)
    const busy = !!t && approveInProgress(f, t, choice.approving, nowMs)
    const page = choice.opened ? openedPage(f, choice.opened, nowMs, w, choice.sent?.id === choice.opened ? choice.sent.answer : '', choice.taskReport, choice.approving?.id === choice.opened && approveSent(f, choice.approving, nowMs), busy, choice.from ?? 'tasks', choice.search ?? '') : null
    body = page ?? listBody(f, choice.cursor, { ...GROUPS_OPEN, ...choice.groups }, nowMs, w, choice.search ?? '')
    keys = panelKeys(f, page ? choice.opened : '', 'tasks', '', false, !!page && busy)
    if (!page) modeRow = modeLines(f, !!choice.search?.trim(), w)
  }
  // T-751: "[ ] prev/next" on a task's or scout's page with others in its list, before "b back"
  const place = pagePlace(f, choice, nowMs)
  if (place && place.of > 1 && keys.at(-1)?.key === 'b') keys = [...keys.slice(0, -1), navHint('opencode'), keys.at(-1)!]
  const foot: Line[] = [[{ text: footerRule(w), color: 'subtle' }], ...modeRow, ...hintLines(keys, w).map(hintSegs)]
  // T-627: every line is cut into the rows it really takes (drawn lines: no line wider than the panel, none with a
  // line break inside), so the scroll counts what is on screen. The page's own title stays with
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

/** The place of the open task's or scout's page in the list it was opened from (core's taskPlace, placeIn): what
 *  prev and next ([ and ]) go through; null on any other page. */
export function pagePlace(f: ViewFile | null, choice: Pick<PanelChoice, 'tab' | 'opened' | 'run' | 'search' | 'from'>, nowMs: number) {
  const page = boardPageOf(f, choice)
  if (!f) return null
  if (page === 'task') return taskPlace(f.view, choice.opened, choice.from ?? 'tasks', nowMs, choice.search ?? '')
  if (page === 'scout') return placeIn(scoutListNames(f.view.scouts ?? []), choice.opened)
  return null
}

/** Which page the panel shows for `choice` (core's BoardPage, the same names on every board): a tab's list, a list
 *  under Settings, or the page of one task, question, scout, scout run, role, kind or role prompt. */
export function boardPageOf(f: ViewFile | null, choice: Pick<PanelChoice, 'tab' | 'opened' | 'run' | 'edit'>): BoardPage {
  const tab = choice.tab ?? 'tasks'
  if (tab === 'live') return orgMemPageTopic(choice.opened) !== null ? 'orgmem' : 'live'
  if (tab === 'scouts') {
    const sc = scoutNamed(f, choice.opened)
    if (!sc) return 'scouts'
    return choice.run && scoutRunsIn(f, sc.name).some(x => x.run.ended === choice.run) ? 'scout-run' : 'scout'
  }
  if (tab === 'settings') {
    const place = settingsPlace(f, choice.opened)
    if (!place) return 'settings'
    if (place.prompt && place.def) return 'role-prompt'
    if (place.def && editOf(f, choice)) return place.list === 'roles' ? 'role-edit' : 'kind-edit'
    if (place.def) return place.list === 'roles' ? 'role' : 'kind'
    return place.list
  }
  if (!choice.opened || !f) return 'tasks'
  if (f.view.tasks.some(x => x.id === choice.opened)) return 'task'
  return (f.view.questions ?? []).some(x => x.id === choice.opened) ? 'question' : 'tasks'
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

/** The tabs under the banner, as Claude Code's tab row (T-685, T-692): "[t]: Tasks (12) │ [l]: Live │ [s]: Scouts (3) │ [c]: Settings"
 *  (core's LIVE_TABS and tabRow: shorter words when narrow), the shown one bright and bold; each one a button for its
 *  tab. A panel too narrow even for the shortest words puts them on more rows, never cutting one. */
export function tabsLines(tab: PanelTab, w: number, tasks: number, scouts: number): Line[] {
  const count: Record<PanelTab, number | undefined> = { tasks, live: undefined, scouts, settings: undefined }
  const width = Math.max(1, Math.floor(w))
  const row = tabRow(PANEL_TABS.map(t => ({ key: t.key, label: t.label, count: count[t.tab] })), width)
  const segs: DrawSeg[] = PANEL_TABS.map((t, i) => ({ text: row.labels[i]!, color: t.tab === tab ? 'ide' : 'inactive', ...(t.tab === tab ? { bold: true } : {}), hit: { tab: t.tab } }))
  return packRows(segs.map(s => s.text.length), width, row.gap.length).map(r => r.flatMap((k, i) => [...(i ? [{ text: row.gap, color: 'subtle' }] : []), segs[k]!]))
}

/** Live segments as panel text, in core's LIVE_TONE colors. */
const liveSegs = (xs: readonly LiveSeg[], hit?: PanelHit): Line => xs.map(x => ({ text: x.text, color: LIVE_TONE[x.tone], ...(liveBold(x.tone) ? { bold: true } : {}), ...(hit ? { hit } : {}) }))

/** How often the Live tab's current station changes between ◉ and ◎ (the terminal panel's LIVE_TICK_MS). */
export const LIVE_BLINK_MS = 1000

/**
 * The Live tab (T-692), as the terminal panel's (T-690), all made by core/live.ts: the mode and busy agents, the
 * station names, two lines per task in doing (a click on its first line, or Enter on it, opens the task),
 * today's numbers, the legend and (T-718) the Organizational memory section; "No task is running right now." when none is in doing. The cursor goes over the
 * lanes; its lane's first column shows "›". The current station blinks with the clock (one step per LIVE_BLINK_MS).
 * T-715: under each lane hang its waiting trains (core's liveTrains and trainRows); the cursor goes over them too, and
 * Enter or a click on one opens its task, as on a lane.
 * T-727: under the lanes, the Branches section (core's liveBranches); the cursor goes over its task rows (liveBranchId).
 * T-747: each section (Tasks, Today, Branches, Organizational memory) starts with a "▍Name" heading (core's
 * liveHeading), its lines indented by LIVE_INDENT.
 */
function liveBody(f: ViewFile, cursor: number, nowMs: number, w: number): Body {
  const b = bodyMaker()
  const v = f.view
  const lanes = liveLanes(v, nowMs)
  const inner = liveInner(w)
  const layout = liveLayout(lanes, liveStations(v.checker === true), inner)
  const frame = Math.floor(nowMs / LIVE_BLINK_MS)
  const trains = liveTrains(v, nowMs, lanes)
  const rows = new Map(lanes.map(l => [l.id, trainRows(trains.lanes[l.id] ?? [], inner)]))
  const om = liveOrgMem(orgMemIn(f), w)
  const br = liveBranches(v, nowMs, w)
  // the cursor's stops, top to bottom: each lane, then its trains; (T-727) the Branches rows; then (T-718) the newest notes and the topics
  const ids = [
    ...lanes.flatMap(l => [l.id, ...rows.get(l.id)!.flatMap(r => (r.id ? [r.id] : []))]),
    ...(br?.rows ?? []).flatMap(r => (r.id ? [liveBranchId(r.id)] : [])),
    ...om.newest.map(x => liveNoteId(x.note.n)),
    ...om.grid.flatMap(r => r.map(c => liveTopicId(c.topic))),
  ]
  const selected = ids.length ? ids[Math.min(Math.max(0, cursor), ids.length - 1)]! : ''
  b.add([{ text: liveHeader(v, lanes), color: 'text', bold: true }])
  b.add(liveSegs(liveHeading(LIVE_SECTIONS.tasks, w)))
  /** A line under a section heading: indented. */
  const under = (xs: readonly LiveSeg[], hit?: PanelHit) => liveSegs(liveIndented(xs), hit)
  b.add(lanes.length ? under(liveLabelSegs(layout)) : [{ text: LIVE_INDENT + LIVE_EMPTY, color: 'inactive' }])
  /** A row that opens task `id`: "›" in its first column when the cursor is on it (a space there otherwise). */
  const opens = (xs: readonly LiveSeg[], id: string) => {
    const line = under(xs, { open: id })
    const head = line[0]
    if (id === selected && head?.text.startsWith(' ')) line.splice(0, 1, { text: '›', color: 'ide', bold: true, hit: { open: id } }, { ...head, text: head.text.slice(1) })
    b.add(line, { open: id })
  }
  for (const l of lanes) {
    const [first, second] = laneLines(l, layout, { nowMs, frame })
    opens(first, l.id)
    b.add(under(second))
    for (const r of rows.get(l.id)!) r.id ? opens(r.segs, r.id) : b.add(under(r.segs))
  }
  // T-738: one empty line above each section after the first (Today, Branches, Organizational memory)
  b.blank()
  b.add(liveSegs(liveHeading(LIVE_SECTIONS.today, w)))
  for (const t of liveTodayLines(v, nowMs, inner)) b.add(under(t))
  if (lanes.length) for (const x of liveLegend(lanes, inner)) b.add([{ text: LIVE_INDENT + x, color: 'inactive' }])
  if (br) {
    b.blank()
    b.add(liveSegs(br.head))
    b.add(under(br.main))
    for (const r of br.rows) r.id ? opens(r.segs, liveBranchId(r.id)) : b.add(under(r.segs))
  }
  // T-718: the Organizational memory section, just above the footer (a click on its header opens all notes)
  b.blank()
  b.add(liveSegs(om.head, { key: ORG_MEM_KEY }), { key: ORG_MEM_KEY })
  b.add([{ text: LIVE_INDENT + om.newestLabel, color: 'inactive' }])
  if (om.empty) b.add([{ text: LIVE_INDENT + om.empty, color: 'inactive' }])
  /** A cell's segments with "›" in its first column when the cursor is on it (the first cell of a row indented). */
  const marked = (xs: readonly LiveSeg[], id: string, first = true): Line => {
    const line = first ? under(xs, { open: id }) : liveSegs(xs, { open: id })
    const head = line[0]
    if (id === selected && head?.text.startsWith(' ')) line.splice(0, 1, { text: '›', color: 'ide', bold: true, hit: { open: id } }, { ...head, text: head.text.slice(1) })
    return line
  }
  for (const x of om.newest) b.add(marked(x.segs, liveNoteId(x.note.n)), { open: liveNoteId(x.note.n) })
  if (om.grid.length) b.add([{ text: LIVE_INDENT + om.topicsLabel, color: 'inactive' }])
  for (const r of om.grid) b.add(r.flatMap((c, j) => marked(c.segs, liveTopicId(c.topic), j === 0)), r.length === 1 ? { open: liveTopicId(r[0]!.topic) } : null)
  for (const k of om.keys) b.add([{ text: LIVE_INDENT + k, color: 'inactive' }])
  return { ...b, ids, selected }
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
    // the how-to, then Claude Code's "+ New scout" button (n, T-706)
    for (const [i, l] of scoutHowTo(f.name).entries()) b.add([{ text: l, color: i === 0 ? 'text' : 'inactive' }])
    for (const l of buttonLines([NEW_SCOUT_BUTTON], w)) b.add(l)
    b.blank()
    backButton(b, w)
    return { ...b, ids: [], selected: '' }
  }
  const ids = scouts.map(x => x.name)
  const selected = ids[Math.min(Math.max(0, choice.cursor), ids.length - 1)]!
  const rows = scoutListRows(scouts, nowMs, w)
  // T-706: Claude Code's "+ New scout" button (n) above the list
  for (const l of buttonLines([NEW_SCOUT_BUTTON], w)) b.add(l)
  b.blank()
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
  // T-751: the page header, as on Claude Code's scout page: ‹ Scouts and its place, its name and what it does, its
  // state, its buttons in groups, a heavy rule; it stays at the top while the rest scrolls
  const last = shown[0]
  for (const l of headerLines({ from: 'scouts', label: sc.name, place: placeIn(scoutListNames(f.view.scouts ?? []), sc.name), title: scoutAbout(sc), color: 'claude', state: scoutStateGroups(sc, nowMs, last), buttons: scoutButtons(sc) }, w)) b.add(l)
  const headLines = b.lines.length
  // the summary from the file's front matter, if one is set (the instructions show in full below)
  if (sc.warning) b.add([{ text: sc.warning, color: 'warning' }])
  const problem = scoutLastRunProblem([...shown].reverse().map(x => x.run))
  if (problem && !sc.running) b.add([{ text: problem, color: 'error' }])
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
  // T-686: its Results figures (last 7 days, then in all) in their own section, just before File
  const results = f.view.scout_results?.[sc.name]
  if (typeof results === 'string' && results) {
    b.blank()
    b.heading('Results')
    for (const l of textLines(results, 'inactive', w)) b.add(l)
  }
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
  // T-706: Claude Code's "+ New role" / "+ New kind" button (n), then its hint
  for (const l of buttonLines([list === 'roles' ? NEW_ROLE_BUTTON : NEW_KIND_BUTTON], w)) b.add(l)
  b.add([{ text: `Enter opens a ${noun} · n makes a new one · or tell the lead`, color: 'inactive' }])
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

/** The edit mode in `choice` when it is for the open role's or kind's page (not a file that can't be read). */
export function editOf(f: ViewFile | null, choice: Pick<PanelChoice, 'tab' | 'opened' | 'edit'>): DefDraft | undefined {
  const e = choice.edit
  if (!e || (choice.tab ?? 'tasks') !== 'settings' || e.page !== choice.opened) return undefined
  const place = settingsPlace(f, choice.opened)
  return place?.def && !place.prompt && !place.def.broken ? e : undefined
}

/** A role's or kind's edit page (T-706, Claude Code's Edit): "tester editing", where Save writes, then Save and
 *  Cancel (x), what Save found wrong, then a box per part of its file with Claude Code's names (Description, Model,
 *  Skills, Tools, Checklist; a kind's Description and Body), each showing its value (or its placeholder); Enter or a
 *  click on a box asks for its new value. The cursor goes over Save, Cancel and the boxes. */
function defEditPage(f: ViewFile, list: DefList, x: ViewDef, draft: DefDraft, cursor: number, w: number): Body {
  const b = bodyMaker()
  const def = list === 'roles' ? 'role' : 'kind'
  const file = `${dataDir(f.name || DEFAULT_NAME)}/${list}/${x.name}.md`
  b.add([{ text: x.name, color: 'claude', bold: true }, { text: ' editing', color: 'warning', bold: true }])
  for (const l of wrapSegs([{ text: `save writes ${file}${x.source === 'built-in' ? ` (a copy of the built-in ${def}; Reset to built-in undoes it)` : ''}`, color: 'inactive' }], w)) b.add(l)
  if (def === 'role') for (const l of wrapSegs([{ text: `the name is the file's name: to rename the role, rename ${file}`, color: 'inactive' }], w)) b.add(l)
  const fields = defEditFields(def)
  // the cursor goes over Save, Cancel and the boxes, as Claude Code's ↑↓ (it starts on the first box: EDIT_FIRST_BOX)
  const ids = [EDIT_SAVE_ID, EDIT_CANCEL_ID, ...fields.map(editBoxId)]
  const selected = ids[Math.min(Math.max(0, cursor), ids.length - 1)]!
  const onButton = selected === EDIT_SAVE_ID ? SAVE_BUTTON : selected === EDIT_CANCEL_ID ? CANCEL_EDIT_BUTTON : undefined
  for (const l of buttonLines([SAVE_BUTTON, CANCEL_EDIT_BUTTON], w - (onButton ? 2 : 0))) {
    if (!onButton) b.add(l)
    else b.add([{ text: '› ', color: 'ide', bold: true }, ...l.map(s => (s.text === buttonText(onButton) ? { ...s, color: 'claude', bold: true } : s))])
  }
  if (draft.error) for (const l of wrapSegs([{ text: draft.error, color: 'error' }], w)) b.add(l)
  const head = b.lines.length
  for (const k of fields) {
    const hit = { editField: k }
    const box = DEF_EDIT_BOXES[k]
    const value = draft.values[k] ?? ''
    b.blank()
    b.add([{ text: editBoxId(k) === selected ? '› ' : '  ', color: 'ide', bold: true }, { text: box.label, color: 'text', bold: true }], hit)
    if (value.trim()) for (const l of textLines(value, 'text', w, 4)) b.add(l, hit)
    else b.add([{ text: `    ${box.placeholder(def)}`, color: 'inactive' }], hit)
  }
  return { ...b, ids, selected, head }
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
function orgMemBody(f: ViewFile, cursor: number, w: number, topic = ''): Body {
  const b = bodyMaker()
  const notes = orgMemOfTopic(orgMemIn(f), topic)
  b.heading(orgMemPageTitle(topic))
  // T-742: Delete (x) (when there are notes) and Back (b) on one row right under the title; they stay at the top with it
  for (const l of buttonLines([...(notes.length ? [DELETE_NOTE_BUTTON] : []), LIST_BACK_BUTTON], w)) b.add(l)
  const headLines = b.lines.length
  for (const l of wrapSegs([{ text: orgMemAbout(orgMemFile(dataDir(f.name))), color: 'inactive' }], w)) b.add(l)
  b.blank()
  if (!notes.length) b.add([{ text: `  ${topic ? orgMemTopicEmpty(topic) : ORG_MEM_EMPTY}`, color: 'inactive' }])
  const ids = notes.map(x => orgMemNoteId(x.n))
  const selected = ids.length ? ids[Math.min(Math.max(0, cursor), ids.length - 1)]! : ''
  for (const x of notes) {
    const id = orgMemNoteId(x.n)
    b.add([{ text: id === selected ? '› ' : '  ', color: 'ide', bold: true }, { text: orgMemNoteHead(x), color: 'claude', bold: true }])
    for (const l of wrapSegs([{ text: x.text, color: 'text' }], w - 4)) b.add([{ text: '    ', color: 'text' }, ...l])
  }
  b.blank()
  b.add([{ text: `↑↓ picks a note · x deletes it (asks first) · or edit ${orgMemFile(dataDir(f.name))} by hand`, color: 'inactive' }])
  return { ...b, ids, selected, head: headLines }
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
  const pages = { roles: defsCount(f, 'roles'), kinds: defsCount(f, 'kinds') }
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
  const matching = filtering ? searchTasks(v.tasks, query, nowMs, v.archived_done) : v.tasks
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
function openedPage(f: ViewFile, id: string, nowMs: number, w: number, sent = '', report?: PanelChoice['taskReport'], merging = false, busy = false, from: PageFrom = 'tasks', search = ''): Body | null {
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
  // T-751: the page header, as on Claude Code's task page: where you are (‹ Tasks or ‹ Live, its place in that list),
  // the title, the state, the buttons in groups (core's taskActions), a heavy rule; it stays at the top while the rest scrolls
  addAll(headerLines({
    from, label: t.id, place: taskPlace(v, t.id, from, nowMs, search), title: t.title, color: taskColor(t, nowMs, merging),
    state: taskStateGroups(t, { nowMs, merging, ...(v.auto_retries !== undefined ? { autoRetries: v.auto_retries } : {}), note: sessionNote(t, v.driving ?? false) }),
    buttons: taskButtons(t, busy),
  }, w))
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
/** The edit page's Save and Cancel (x) buttons (T-706, Claude Code's). */
export const SAVE_BUTTON: PanelButton = { label: 'Save', hit: { save: true } }
export const CANCEL_EDIT_BUTTON: PanelButton = { label: 'Cancel (x)', hit: { key: 'x' } }

/** How a button looks: "[ Back ]". */
export const buttonText = (b: PanelButton) => `[ ${b.label} ]`

/** A button of a page header (T-751): its words, what a click on it does, its group (core's ActionGroup); `fact`:
 *  words that only say something (a scout's "⏸ paused"), no button. */
export type HeadButton = PanelButton & { group: ActionGroup; fact?: boolean }

/** The buttons of task `t`'s page header, in Claude Code's order and groups (core's taskActions, words only: the keys
 *  are in the footer), but Copy and Watch worker, which this panel can't do (`merging`: see panelKeys). A button with
 *  a key presses that key; one without (Drop in review) sends its action. Back is the header's "‹ Tasks". */
export const taskButtons = (t: BoardTask, merging = false): HeadButton[] =>
  taskActions(t, { merging }).filter(a => TASK_ACTION_COMMANDS[a.id]).map(a => ({ label: actionButtonLabel(a), group: a.group, hit: a.key ? { key: a.key as PanelKey } : { action: a.id } }))

/** The buttons of scout `sc`'s page header, as Claude Code's (core's scoutButtons): Run now (not while it runs),
 *  Edit, Pause or Resume, and "⏸ paused" while it is paused. */
export const scoutButtons = (sc: Pick<SymccScout, 'running' | 'paused'>): HeadButton[] =>
  headerScoutButtons(sc).map(x => ({ label: x.label, group: x.group, ...(x.fact ? { fact: true } : {}), hit: { key: (x.key ?? 'p') as PanelKey } }))

/** A page header's lines (T-751, core/page-header.ts): where you are (Back and, with a place, "‹ 2 of 6 ›": each a
 *  click), the title, the state (wrapping between its groups), the buttons in their groups (the next step "▐Pause▌",
 *  the others "[Role]", the danger ones red, the page ones dim; wrapping between groups, never inside a button), then
 *  a heavy rule. */
export function headerLines(hd: { from: PageFrom; label: string; place: ReturnType<typeof placeIn>; title: string; color: string; state: Seg[][]; buttons: HeadButton[] }, w: number): Line[] {
  const where = whereLine(hd.from, hd.label, hd.place, w)
  const go: Record<string, PanelHit> = { back: { key: 'back' }, prev: { key: 'prev' }, next: { key: 'next' } }
  const first: Line = [...where.left, { text: ' '.repeat(where.pad) }, ...where.right].map(p => ({ text: p.text, color: 'inactive', ...('go' in p && p.go ? { hit: go[p.go]! } : {}) }))
  const groups = inGroups(hd.buttons)
  const rows = packGroups(groups.map(g => g.map(x => pillText(x).length)), w).map(row =>
    row.flatMap(({ g, i, gap }): DrawSeg[] => {
      const x = groups[g]![i]!
      return [...(gap ? [{ text: ' '.repeat(gap), color: 'text' }] : []), { text: pillText(x), color: x.fact ? 'inactive' : PILL_COLOR[x.group], ...(x.group === 'main' ? { bold: true } : {}), ...(x.fact ? {} : { hit: x.hit }) }]
    }),
  )
  return [first, ...titleLines(hd.label, hd.title, hd.color, w), ...groupSegLines(hd.state, w), ...rows, [{ text: headerRule(w), color: 'ide' }]]
}

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
  /** (T-706) a new role or kind from the template, one part of a role's or kind's file, a new scout, and setting up git */
  | { kind: 'def-add'; def: 'role' | 'kind'; name: string }
  /** the edit page's Save: its changed boxes in one edit (a bad value saves none) */
  | { kind: 'def-save'; def: 'role' | 'kind'; name: string; fields: Partial<Record<DefEditField, string>> }
  | { kind: 'scout-new'; scout: string; prompt: string }
  | { kind: 'setup-git' }

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
  if (a.kind === 'def-add') return { name: `${name}-settings`, text: `${a.def} ${a.name} add` }
  if (a.kind === 'def-save') return { name: `${name}-settings`, text: `${a.def} ${a.name} save ${JSON.stringify(a.fields)}` }
  if (a.kind === 'scout-new') return { name: `${name}-scout`, text: `${a.scout} new ${a.prompt.trim()}` }
  if (a.kind === 'setup-git') return { name: `${name}-settings`, text: 'git setup' }
  return { name: `${name}-answer`, text: `${a.id} ${a.answer.trim()}` }
}

/** The next cursor after moving `by` rows in a list of `n` (it stops at the ends). */
export const moveCursor = (cursor: number, by: number, n: number) => (n ? Math.min(n - 1, Math.max(0, cursor + by)) : 0)
