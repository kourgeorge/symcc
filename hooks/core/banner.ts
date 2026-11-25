// Board titles, the status line, the banner at the top of the panel, and the board as text.
import type { SymccMode, SymccStatus, SymccTask } from '../../types'
import { DEFAULT_NAME, ICON, ICON_ART, namesFor } from '../name'
import { type Board, type BoardTask, emptyBoard, isFinished, kindOf, modeOf, OPEN, priorityMark, STATUS_WORD } from './board-file'
import { cutTitle, padWidth, textWidth } from './width'
import { boardSections, type BoardSections, localOffset } from './days'
import { fromText } from './origin'
import { modeLabel, modeText } from './review'
import { kindMark } from './kinds'
import { roleMark, tryMark } from './roles'
import { archivedLine, archivedNote, archivedOf } from './archive'
import { PLAN_NOTE } from './plan'
import { type CrewBoard, nextScoutText, STEP_ICON, rowDuration, parseSearch, searchTasks, BOARD_STATUSES, statusCell, STEP_NOTE, STEP_WORD, TITLE_ROOM, rowStates, stateText, rowMark, APPROVED_NOTE, fileWaitText } from './panel'
import { checkStepNow, shownStatus } from './lead'
import { type PhaseStage, type TaskPhase, taskPhase } from './phase'
import { whyFailed } from './failure'
import { CLAIM_NOTES, sessionNote, shownNote, STATUS_MARK } from './details'
import { newestFirst, offStatusParts, testsShort, type OffHere } from './settings'
import { type DriverFacts, type NoticePart, fitForm, followForms, noticeText } from './driver-notice'
import { type OwnerQuestion, askText, openQuestions, questionLine, questionsLabel } from './questions'
import { needsYou } from './commands'
import { fmtCost } from './runs'
import { shortSizeWarns } from './board-parts'
import { type LiveView, liveLanes, liveToday, liveTrains, todayCost } from './live'
import { type LogoFrame, LOGO_MIN_WIDTH, restFrame } from './logo'
import { plural } from './text'

/** The project's folder name, the last part of a path: "/Users/me/repositories/app" → "app". */
export function folderName(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? ''
}

/** A path with the home folder shortened to "~": "/Users/me/x" → "~/x". */
export function shortHome(path: string, home?: string): string {
  const h = (home ?? '').replace(/\/+$/, '')
  if (!h) return path
  if (path === h) return '~'
  return path.startsWith(h + '/') ? '~' + path.slice(h.length) : path
}

// ---------------- the plugin's version in the titles ----------------
// The version is read once when the plugin loads (see loadVersion in app/state.ts, kept in S.version) and passed in
// to each title below; '' = not known: no version shown.

/** The version in plugin.json's text, e.g. "0.3.0"; '' when the text isn't JSON or has no short, plain version. Never throws. */
export function versionOf(text: string): string {
  try {
    const v = (JSON.parse(text) as { version?: unknown } | null)?.version
    return typeof v === 'string' && /^[0-9A-Za-z][0-9A-Za-z.+-]{0,23}$/.test(v) ? v : ''
  } catch {
    return ''
  }
}

/** " v0.3.0", or '' with no version. */
export const versionMark = (v: string) => (v ? ` v${v}` : '')

/** "<icon> <name> v<version>": the bold, colored part of a title (ICON from name.ts, then the name and the version);
 *  with no version known it is "<icon> <name> board". */
export const boardBrand = (name: string = DEFAULT_NAME, v: string = '') => (v ? `${ICON} ${namesFor(name).name}${versionMark(v)}` : `${ICON} ${namesFor(name).boardName}`)
/** " · <folder>": the dimmed project part of a title, or '' when the folder is unknown. */
export const boardWhere = (root: string) => (folderName(root) ? ` · ${folderName(root)}` : '')
/** The board's title: "<icon> <name> v<version> · <folder>" ("<icon> <name> board · <folder>" with no version when `v` is ''), without " · <folder>" when the folder is unknown. */
export const boardTitle = (root: string, name: string = DEFAULT_NAME, v: string = '') => `${boardBrand(name, v)}${boardWhere(root)}`
/** The band above the prompt's header start (Claude Code's band and OpenCode's strip): "<icon> <name>", then
 *  " · <folder>" only when the project's folder isn't called the plugin's name too (no "board", no version):
 *  "𝄞 symcc" in the symcc project, "𝄞 symcc · wats" in another one. */
export const bandBrand = (name: string = DEFAULT_NAME) => `${ICON} ${namesFor(name).name}`
export const bandWhere = (root: string, name: string = DEFAULT_NAME) => (folderName(root) === namesFor(name).name ? '' : boardWhere(root))
/** The status line label, without the mark (Claude Code adds its own): "<name> board · <folder>". */
export const boardLabel = (root: string, name: string = DEFAULT_NAME) => `${namesFor(name).boardName}${boardWhere(root)}`

/**
 * The front of each task row in the band above the prompt, lined up like the board list's rows (fixed-width ID and
 * state columns). Every row shows the list's own mark and short status cell (rowMark, rowCell): a doing task "▶ 1h40m" (the
 * total work time of all its tries), in a check step its icon (STEP_ICON) in place of ▶ and the step word: "⊛ 9m",
 * "✎ 2h5m", "⌕ 5m", "⇢ 40m", in the merge line "⧗ 2h5m", with its try after it from
 * try 2 on ("T-434 ▶ 1h40m ↺3", see rowStates); in a row narrower than `width` the time is left out, then the try;
 * the others "? waiting", "◆ review", "✗ failed". The state column has one width, so every title starts in one column. `since(id)` is when this session's worker started.
 */
export function bandLeads(tasks: (Pick<SymccTask, 'id' | 'status' | 'runs'> & Partial<Pick<SymccTask, 'attempts' | 'note'>> & Pick<BoardTask, 'live' | 'kind'>)[], nowMs: number, since: (id: string) => number | string | undefined = () => undefined, width = Infinity): Map<string, string> {
  const idWidth = Math.max(4, ...tasks.map(t => t.id.length))
  const rows = tasks.map(t => ({ ...t, attempts: t.attempts ?? 0 }))
  const front = (t: (typeof rows)[number]) => `${t.id.padEnd(idWidth)} ${rowMark(t, nowMs)} `
  const frontWidth = Math.max(0, ...rows.map(t => front(t).length))
  // too narrow: the time is left out, then the try, so the titles keep TITLE_ROOM
  const { states } = rowStates(rows, nowMs, since, w => frontWidth + w + 1 + TITLE_ROOM <= width)
  return new Map(rows.map(t => [t.id, `${front(t)}${stateText(states.get(t.id))}`]))
}

// ---------------- Claude Code's band above the prompt (T-748) ----------------

/** The icon of each stage in a running band row: "▶", "⌕", "⧗" (STEP_ICON). No stage name: the icon says it (T-893,
 *  the owner: "the icon is enough"). */
export const BAND_STAGE: Record<PhaseStage, { icon: string }> = {
  worker: { icon: STATUS_MARK.doing },
  prep: { icon: STEP_ICON.prep },
  checker: { icon: STEP_ICON.checker },
  queue: { icon: STEP_ICON.queue },
  test: { icon: STEP_ICON.testing },
  merge: { icon: STEP_ICON.merging },
}
/** What the band's next up row says after the task's id (its icon is STATUS_MARK.todo, "○"). */
export const NEXT_UP_STATE = 'next up'

/** One row of the band: `kind` 'run' (a running task), 'next' (the next task to start), 'you' (a task that needs the
 *  owner, drawn in the warning color); `icon` the mark in front of its id ("▶", "⌕", "○", "?"); `forms` its state after
 *  the id, fullest first (the time goes first, then the try, when narrow). */
export type BandItem = { id: string; title: string; kind: 'run' | 'next' | 'you'; icon: string; forms: string[]; tail: string }

/** What the band's first line (T-776) reads: the tasks, the scouts, the slots and the mode. */
export type BandSummaryView = LiveView & { scouts?: readonly { running?: boolean }[] }

/**
 * The short board summary on the band's first line, after "𝄞 symcc" (T-776): the mode, the agents busy of the slots,
 * how many tasks wait to start, today's merged count, and "⌕ N scouts" while scouts run:
 * "⏵ auto merge · 2/3 agents busy · 3 tasks waiting · 12 completed today · ⌕ 1 scout". Wider than `width`, parts go from the end; the mode always stays.
 */
export function bandSummary(view: BandSummaryView, nowMs: number, width = Infinity, offsetMin?: number): string {
  const tasks = view.tasks ?? []
  const lanes = liveLanes(view, nowMs)
  const max = view.max_parallel ?? emptyBoard().max_parallel
  const waiting = tasks.filter(t => t.status === 'todo').length
  const scouts = (view.scouts ?? []).filter(s => s.running).length
  const parts = [
    modeLabel(modeOf(view)),
    `${lanes.filter(l => l.agent).length}/${max} agents busy`,
    waiting ? `${waiting} ${waiting === 1 ? 'task' : 'tasks'} waiting` : '',
    `${liveToday(tasks, nowMs, offsetMin).merged} completed today`,
    scouts ? `${STEP_ICON.checker} ${plural(scouts, 'scout')}` : '',
  ].filter(Boolean)
  for (let n = parts.length; n > 1; n--) {
    const line = parts.slice(0, n).join(' · ')
    if (textWidth(line) <= width) return line
  }
  return cutTitle(parts[0]!, Math.max(1, width))
}

/**
 * The task rows of Claude Code's band above the prompt (T-748, T-776), in this order: one per running task (the Live
 * tab's lanes: its stage's icon, then the time in that stage, the try from try 2 on: "⌕" + "8m ↺3", T-939),
 * the next task to start ("○" + "next up", the first task of the Live tab's next up that waits for nothing), then the
 * tasks that need the owner (needsYou: "?" + "waiting", "◆" + "review", "✗" + "failed", "▶" + "more time?"). `since(id)`:
 * when this session's worker started (for a worker with no open try yet). The counts are on the band's first line (bandSummary).
 */
export function bandItems(view: LiveView, nowMs: number, since: (id: string) => number | string | undefined = () => undefined, note: (t: BoardTask) => string = t => shownNote(t, nowMs)): BandItem[] {
  const tasks = view.tasks as BoardTask[]
  const you = tasks.filter(t => needsYou(t, nowMs)).sort(newestFirst)
  const youIds = new Set(you.map(t => t.id))
  const lanes = liveLanes(view, nowMs).filter(l => !youIds.has(l.id))
  const byId = new Map(tasks.map(t => [t.id, t]))
  const tail = (t: BoardTask) => rowEndText(t, taskPhase(t, nowMs), note(t))
  const runs = lanes.map((l): BandItem => {
    const s = BAND_STAGE[l.stage]
    // the Live tab counts prep (and a checker with the setting off) at the work station, from the try's start; the
    // band says the stage, so it counts from the hand-back
    const ended = toMs(byId.get(l.id)?.runs?.at(-1)?.ended)
    const at = l.stage === 'worker' ? (ended === undefined ? (l.sinceMs ?? toMs(since(l.id))) : (toMs(since(l.id)) ?? l.sinceMs)) :l.station === 'work' ? (ended ?? l.sinceMs) : l.sinceMs
    const time = at !== undefined ? rowDuration(Math.max(0, nowMs - at)) : ''
    const tries = l.tryNo > 1 ? `↺${l.tryNo}` : ''
    return { id: l.id, title: l.title, kind: 'run', icon: s.icon, forms: [[time, tries].filter(Boolean).join(' '), tries, ''], tail: tail(byId.get(l.id)!) }
  })
  const next = liveTrains(view, nowMs).next.find(x => !x.stuck.length)
  const nextRow: BandItem[] = next ? [{ id: next.id, title: next.title, kind: 'next', icon: STATUS_MARK.todo, forms: [NEXT_UP_STATE], tail: '' }] : []
  const yours = you.map((t): BandItem => ({ id: t.id, title: t.title, kind: 'you', icon: rowMark(t, nowMs), forms: [statusCell(t, nowMs, since(t.id))], tail: tail(t) }))
  return [...runs, ...nextRow, ...yours]
}

const toMs = (x: number | string | undefined): number | undefined => {
  const n = typeof x === 'number' ? x : Date.parse(x ?? '')
  return Number.isFinite(n) ? n : undefined
}

/** The columns in front of a band row's id: the 1-space indent, the icon and a space (" ▶ "). */
export const BAND_INDENT = 3

/**
 * The fronts of band rows (bandItems) after their icon, lined up: the id padded to one width, a space, then the
 * state padded to one width and a space, so every title starts in one column: "T-740 8m ↺3 ". The
 * first state form that leaves TITLE_ROOM for the title in `width` columns (the whole row, BAND_INDENT included) is
 * used (the time goes first, then the try).
 */
export function bandFronts(items: readonly Pick<BandItem, 'id' | 'forms'>[], width = Infinity): Map<string, string> {
  const idWidth = Math.max(4, ...items.map(x => x.id.length))
  const most = Math.max(1, ...items.map(x => x.forms.length))
  const formOf = (x: Pick<BandItem, 'forms'>, i: number) => x.forms[Math.min(i, x.forms.length - 1)] ?? ''
  let pick = most - 1
  for (let i = 0; i < most; i++) {
    const w = Math.max(0, ...items.map(x => textWidth(formOf(x, i))))
    if (BAND_INDENT + idWidth + 1 + w + (w > 0 ? 1 : 0) + TITLE_ROOM <= width) {
      pick = i
      break
    }
  }
  const stateWidth = Math.max(0, ...items.map(x => textWidth(formOf(x, pick))))
  return new Map(items.map(x => [x.id, `${x.id.padEnd(idWidth)} ${padWidth(formOf(x, pick), stateWidth)}${stateWidth > 0 ? ' ' : ''}`]))
}

/** Whether a doing row in the band has a state to show (see bandLeads); without one its note says what goes on. */
export const bandHasState = (t: Pick<SymccTask, 'status' | 'runs'> & Pick<BoardTask, 'live' | 'kind'>, nowMs: number, since?: number | string): boolean => t.status === 'doing' && statusCell(t, nowMs, since) !== ''

/** The notes a doing row's state already says ("▶ 12m", "⊛ 9m", "⇢ 40s"), so the band leaves them out when it shows one:
 *  also both claim notes (app/starts.ts: QUEUED_NOTE "starting at the next turn" with the start queue, STARTING_NOTE
 *  "worker starting" without it, e.g. on OpenCode). */
const STATE_NOTES = new Set(['worker on it', STEP_NOTE.testing, STEP_NOTE.merging, 'starting at the next turn', 'worker starting'])

/** The note a doing row in the band shows as its tail: '' when its state already says it (see STATE_NOTES), else the note.
 *  `driving` false (another session drives the board): a claim note ("starting at the next turn") becomes
 *  OTHER_SESSION_NOTE, as that task's worker starts in the driving session, not here (T-643). */
export const bandNote = (t: Pick<SymccTask, 'status' | 'runs' | 'note'> & Pick<BoardTask, 'live' | 'kind'>, nowMs: number, since?: number | string, driving = true): string =>
  !shownNote(t, nowMs) || (STATE_NOTES.has(shownNote(t, nowMs)) && bandHasState(t, nowMs, since)) ? '' : sessionNote(t, driving, nowMs)

// ---------------- another session drives the board (T-643) ----------------

/** A task claimed this long ago whose worker still hasn't started makes the "another session drives" warning add "it looks idle". */
export const DRIVER_IDLE_MS = 5 * 60_000

type DriveTask = Pick<SymccTask, 'status'> & Partial<Pick<SymccTask, 'note' | 'runs' | 'updated_at'>>

/**
 * Whether the session that drives the board looks idle: a doing task was claimed (a claim note, no try running) more
 * than DRIVER_IDLE_MS ago and its worker still hasn't started. (The driver's heartbeat is fresh, else this session
 * would have taken the board over; but its workers start only on its own turns, see app/starts.ts.)
 */
export function driverLooksIdle(tasks: readonly DriveTask[], nowMs: number): boolean {
  return tasks.some(t => t.status === 'doing' && CLAIM_NOTES.has(t.note ?? '') && !t.runs?.some(r => !r.ended) && nowMs - Date.parse(t.updated_at ?? '') > DRIVER_IDLE_MS)
}

/**
 * The warning a window that follows (symcc on here, another window drives the board) shows, '' when it drives: the
 * line under the board's banner (right under its tests/limits line) and the band's warning row (T-952, the same words
 * on both, see core/driver-notice.ts followForms): "⚠ this window follows (driver started Nov 23 09:26, active 3 min
 * ago); /symcc-drive to drive from here", the longest form that fits in `width`. `driver`: what lead.json says of the
 * driving window (none known: no brackets). Says that the driver looks idle when driverLooksIdle says so.
 */
export function driveWarning(driving: boolean, tasks: readonly DriveTask[], nowMs: number, name: string = DEFAULT_NAME, width = Infinity, driver?: DriverFacts): string {
  if (driving) return ''
  return `⚠ ${noticeText(driveNoticeParts(tasks, nowMs, name, width, driver))}`
}
/** T-973: driveWarning's words after its "⚠ " in parts (the slash command marked), for a client that makes the command
 *  something to press (VS Code's notice row). */
export function driveNoticeParts(tasks: readonly DriveTask[], nowMs: number, name: string = DEFAULT_NAME, width = Infinity, driver?: DriverFacts): NoticePart[] {
  return fitForm(followForms(namesFor(name).name, driver, nowMs, driverLooksIdle(tasks, nowMs)), width, '⚠ ')
}

/**
 * The end text of a task's row, the same in both bands (Claude Code's and OpenCode's) and the lead's text board,
 * read from `phase` (taskPhase): the owner's own files in the way of its merge (fileWaitText), "approved, merging"
 * while its approve runs (APPROVED_NOTE), its question while it asks one (an answer or files outside its list),
 * why it failed (whyFailed), else `note` (the task's note; the bands pass bandNote, which leaves out what the row's
 * state already says). '' when there is nothing to say.
 */
export function rowEndText(t: Pick<SymccTask, 'note' | 'history'> & Partial<Pick<SymccTask, 'test_output' | 'runs'>> & Partial<Pick<BoardTask, 'ask'>> & Pick<BoardTask, 'status' | 'live' | 'merge_into'>, phase: Pick<TaskPhase, 'waitsFor' | 'approved' | 'stage'>, note: string = shownNote(t)): string {
  if (phase.waitsFor === 'your-files') return fileWaitText(t)
  if (phase.approved && phase.stage) return APPROVED_NOTE
  if (phase.waitsFor === 'answer' || phase.waitsFor === 'files') return askText(t.ask) || (t.note ?? '')
  if (phase.waitsFor === 'failed') return whyFailed(t)
  return note
}

/** About how wide the line above the prompt may be: Claude Code puts "<name>: " (and its own mark) in front. */
export const STATUS_WIDTH = 80
/** The room the status text has in STATUS_WIDTH after Claude Code's "⚠ <name>: " in front of it. */
export const statusRoom = (name: string = DEFAULT_NAME) => STATUS_WIDTH - `⚠ ${name}: `.length

/** The status line's scout part (T-748): "scout bugs running" while one runs, else "next scout bugs in 38m" ("… now"
 *  when it is due); '' with no timed scout, and no "next" in plan mode or board mode paused (no scout starts then). */
export function nextScoutPart(scouts: CrewBoard['scouts'], nowMs: number, quiet = false): string {
  const running = scouts.find(s => s.running)
  if (running) return `scout ${running.name} running`
  if (quiet) return ''
  const m = /^next: (.+?) (now|in .+)$/.exec(nextScoutText(scouts, nowMs))
  return m ? `next scout ${m[1]} ${m[2]}` : ''
}

/** A day's cost, short: "$312" from ten dollars on, else to the cent ("$4.20", "<$0.01"); '' for none. */
export const shortCost = (usd: number): string => (!Number.isFinite(usd) || usd <= 0 ? '' : usd >= 10 ? `$${Math.round(usd)}` : fmtCost(usd))

/** What the status line reads (statusLine): the tasks (for today's numbers and what needs you), the lead's questions,
 *  the scouts, the branch (or `branch_note`, a warning shown in its place) and the board mode. */
export type StatusBoard = {
  tasks: (Pick<SymccTask, 'id' | 'status'> & Partial<Pick<SymccTask, 'runs' | 'history' | 'note' | 'updated_at'>> & Partial<Pick<BoardTask, 'live'>>)[]
  questions?: readonly Pick<OwnerQuestion, 'answered_at' | 'dropped'>[]
  scouts?: CrewBoard['scouts']
  home_branch?: string
  branch_note?: string
  mode?: SymccMode
}

/**
 * The status line Claude Code shows under the prompt after "symcc" (T-748): the board's facts, plain text (Claude
 * Code's status line can't show colors), never the task counts or ids (the band above the prompt shows the work):
 * the mode ("⏵ auto merge", "⏸ approve merge", "⏸ paused"), who drives ("drives here" / the follow notice naming the driver, T-952), the
 * branch, the next scout and when ("next scout bugs in 38m"), today's merged count ("today ✓ 58") and today's cost
 * ("$312"), e.g. "⏵ auto merge · drives here · main · next scout bugs in 38m · today ✓ 58 · $312". In plan mode
 * PLAN_NOTE comes first. A `branch_note` warning (git, or the T-675 file-size warning) comes right after the mode and
 * is never dropped; when the line is too narrow for it, size warnings take their short form (shortSizeWarns). symcc
 * adds no "⚠" of its own: Claude Code draws one in front of every plugin's status line, and the band above the prompt
 * shows what needs you. When wider than `width`, parts go from the end (the cost, then today, the scout, the
 * branch); the mode, the branch note and who drives always stay. undefined for a fresh project: an empty board this session drives, in mode auto, with
 * no scouts, no question and no branch note.
 */
export function statusLine(b: StatusBoard, driving: boolean, o: { plan?: boolean; nowMs?: number; width?: number; offsetMin?: number; driver?: DriverFacts } = {}): string | undefined {
  const nowMs = o.nowMs ?? Date.now()
  const width = o.width ?? Infinity
  const m = modeOf({ mode: b.mode })
  const scouts = b.scouts ?? []
  const needs = openQuestions(b).length > 0 || b.tasks.some(t => needsYou(t as Parameters<typeof needsYou>[0], nowMs))
  if (!b.tasks.length && !scouts.length && !needs && m === 'auto' && driving && !o.plan && !b.branch_note) return undefined
  const head = [o.plan ? PLAN_NOTE : '', modeLabel(m)].filter(Boolean)
  // T-952: a following window names the driver, in the longest form that fits beside the mode (and the branch note's short form)
  const before = [...head, b.branch_note ? shortSizeWarns(b.branch_note) : ''].filter(Boolean).join(' · ')
  const drive = driving ? 'drives here' : noticeText(fitForm(followForms(DEFAULT_NAME, o.driver, nowMs, driverLooksIdle(b.tasks, nowMs)), width, before ? `${before} · ` : ''))
  const fits = (note: string) => [...head, note, drive].join(' · ').length <= width
  let note = b.branch_note ? (fits(b.branch_note) ? b.branch_note : shortSizeWarns(b.branch_note)) : ''
  // safety net: a note still too wide is cut to fit with "…", so the line never goes past the width (statusRoom);
  // at least 20 characters of it stay, for a width far narrower than any status line
  if (note && !fits(note)) {
    const room = Math.max(20, width - [...head, '', drive].join(' · ').length)
    if (note.length > room) note = note.slice(0, room - 1).trimEnd() + '…'
  }
  const fixed = [...head, note, drive].filter(Boolean)
  const today = b.tasks.length ? liveToday(b.tasks as SymccTask[], nowMs, o.offsetMin).merged : 0
  const rest = [
    b.home_branch || '',
    nextScoutPart(scouts, nowMs, !!o.plan || m === 'paused'),
    b.tasks.length ? `today ✓ ${today}` : '',
    shortCost(todayCost(b.tasks, nowMs, o.offsetMin)),
  ].filter(Boolean)
  // parts go from the end until the line fits; the mode, the branch note and who drives always stay
  for (let n = rest.length; n >= 0; n--) {
    const line = [...fixed, ...rest.slice(0, n)].join(' · ')
    if (line.length <= width || n === 0) return line
  }
  return undefined
}

// ---------------- the banner at the top of the board panel ----------------

/** Below this many columns the drawing is dropped and only the text lines are shown. */
export const BANNER_NARROW = LOGO_MIN_WIDTH
/** How a piece of banner text is drawn: accent (the 'ide' theme color), plain, dim or warning. */
export type BannerTone = 'accent' | 'plain' | 'dim' | 'warning'
export type BannerPart = { text: string; tone: BannerTone; bold?: boolean }
/** One banner line: the drawing part on the left ('' or spaces when none) and the text beside it. */
export type BannerLine = { art: string; parts: BannerPart[] }
/** What the banner needs from the board. */
/** `branch`: the branch checked out in the project now (new tasks merge into it); `branch_note`: a warning (e.g. no git), shown in place of it.
 *  `enabled` false (symcc disabled) or `mode` 'paused' puts a warning on the first line, after the name. */
export type BannerBoard = Pick<Board, 'test_commands' | 'max_parallel' | 'max_minutes' | 'auto_retries'> & Partial<Pick<Board, 'archived'>> & { tasks: (Pick<SymccTask, 'status' | 'runs'> & Partial<Pick<SymccTask, 'note' | 'updated_at'>> & Pick<BoardTask, 'live'>)[]; home_branch?: string; branch_note?: string; mode?: SymccMode; on_here?: boolean; off_here?: OffHere; /** T-952: the driving window (from lead.json) when this one doesn't drive */ driver?: DriverFacts }

/** "2 doing", "1 to do", ... for each status in `order` that has tasks, in that order. */
export function statusCounts(tasks: (Pick<SymccTask, 'status'> & Pick<BoardTask, 'live'>)[], order: SymccStatus[], nowMs: number = Date.now()): string[] {
  // an approved task in review whose approve runs counts as doing (see shownStatus)
  return order.map(st => [tasks.filter(t => shownStatus(t, nowMs) === st).length, STATUS_WORD[st]] as const).filter(([n]) => n > 0).map(([n, word]) => `${n} ${word}`)
}

const BANNER_ORDER: SymccStatus[] = ['doing', 'review', 'waiting', 'failed', 'paused', 'todo', 'backlog', 'done']

/** One count of the banner's counts line: its text ("2 doing", "3 in backlog", "5 done (+2 archived)") and the status it
 *  counts. The all-time total of the tries is not on the board (T-630); /<name>-stats shows it. */
export type BannerCount = { text: string; status?: SymccStatus }

/** The banner's counts, in BANNER_ORDER; none on an empty board with nothing archived. */
export function bannerCounts(b: BannerBoard, nowMs?: number): BannerCount[] {
  const gone = archivedOf(b).done
  if (!b.tasks.length && !gone) return []
  const counts: BannerCount[] = BANNER_ORDER.map(st => [st, b.tasks.filter(t => shownStatus(t, nowMs ?? Date.now()) === st).length] as const)
    .filter(([, n]) => n > 0)
    .map(([st, n]) => ({ status: st, text: st === 'backlog' ? `${n} in backlog` : st === 'done' ? `${n} done${gone ? ` ${archivedNote(gone)}` : ''}` : `${n} ${STATUS_WORD[st]}` }))
  if (gone && !b.tasks.some(t => t.status === 'done')) counts.push({ status: 'done', text: `${gone} done (archived)` })
  return counts
}

/** Cuts parts so their text fits in `room` columns, ending with "…" when something was cut. */
function cutParts(parts: BannerPart[], room: number): BannerPart[] {
  const len = parts.reduce((s, p) => s + p.text.length, 0)
  if (len <= room) return parts
  const out: BannerPart[] = []
  let left = Math.max(0, room - 1)
  for (const p of parts) {
    if (left <= 0) break
    out.push({ ...p, text: p.text.slice(0, left) })
    left -= p.text.length
  }
  if (room > 0) out.push({ text: '…', tone: out[out.length - 1]?.tone ?? 'plain' })
  return out
}

/**
 * The banner lines for the board panel: the name and folder (and a warning when nothing starts), where and who drives, the
 * settings, and (when there are tasks) the counts. With `width` of at least
 * BANNER_NARROW the drawing sits on the left; narrower, only the text, cut to fit.
 * The separator under it is `bannerRule(width)`. `logo`: the drawing's frame now (see core/logo.ts; the logo at rest when not given),
 * LOGO_AREA columns wide, so the text beside it never moves. `version`: the plugin's version for the first line ('' = none);
 * it is left out first when that line doesn't fit.
 */
export function bannerLines(b: BannerBoard, root: string, home: string, driving: boolean, width: number, nowMs?: number, name: string = DEFAULT_NAME, logo: LogoFrame = restFrame(), version: string = ''): BannerLine[] {
  // Facts are plain (the panel draws them in the same color as the tabs that aren't selected,
  // which reads well on light and dark themes), not bold; only the " · " separators are dim.
  const sep: BannerPart = { text: ' · ', tone: 'dim' }
  const join = (groups: BannerPart[][]) => groups.flatMap((g, i) => (i ? [sep, ...g] : g))
  const fact = (text: string): BannerPart[] => [{ text, tone: 'plain' }]
  const folder = folderName(root)
  // nothing starts while symcc is disabled or the board is paused: say so on the first line, in the warning color
  // disabled: "symcc is disabled · /symcc-enable to turn it back on", the command in the accent color (bold) so it stands out
  const off: BannerPart[] =
    b.on_here === false
      ? offStatusParts(name, true, b.off_here).map(p => (p.command ? { text: p.text, tone: 'accent' as const, bold: true } : { text: p.text, tone: 'warning' as const }))
      : b.mode && modeOf({ mode: b.mode }) === 'paused'
        ? [{ text: `${modeLabel('paused')}: nothing starts`, tone: 'warning' }]
        : []
  const line1 = (v: string): BannerPart[] => [
    ...(v
      ? [{ text: namesFor(name).name, tone: 'accent' as const, bold: true }, { text: versionMark(v), tone: 'plain' as const }]
      : [{ text: namesFor(name).boardName, tone: 'accent' as const, bold: true }]),
    ...(folder ? [{ text: ` · ${folder}`, tone: 'plain' as const }] : []),
    ...(off.length ? [sep, ...off] : []),
  ]
  const l2 = join([
    ...(root ? [fact(shortHome(root, home))] : []),
    ...(b.branch_note ? [[{ text: b.branch_note, tone: 'warning' as const }]] : b.home_branch ? [fact(b.home_branch)] : []),
    fact(driving ? 'this session drives' : 'driven by another session'),
  ])
  const l3 = join([
    b.test_commands.length ? fact(`tests: ${testsShort(b.test_commands)}`) : [{ text: 'no test command', tone: 'warning' as const }],
    fact(`${b.max_parallel} at once`),
    fact(`${b.max_minutes} min`),
    fact(`${b.auto_retries} ${b.auto_retries === 1 ? 'retry' : 'retries'}`),
  ])
  // the version is the least important part of the first line: it goes first when the line doesn't fit
  const w0 = Math.max(1, Math.floor(width))
  const room1 = w0 - (w0 >= BANNER_NARROW && logo[0] !== undefined ? logo[0].length + 1 : 0)
  const withV = line1(version)
  const l1 = withV.reduce((n, p) => n + p.text.length, 0) <= room1 ? withV : line1('')
  const texts = [l1, l2, l3]
  const w = Math.max(1, Math.floor(width))
  const wide = w >= BANNER_NARROW
  // T-643/T-694: a session that doesn't drive says so in the warning color right under the tests/limits line, with how to take over
  const room4 = w - (wide && logo[3] !== undefined ? logo[3].length + 1 : 0)
  const warn = driveWarning(driving, b.tasks, nowMs ?? Date.now(), name, room4, b.driver)
  if (warn) texts.push([{ text: warn, tone: 'warning' }])
  // The fixed lines sit beside the drawing; the drawing's lower lines (the clef's hook) stand alone when nothing
  // is beside them, and the counts line goes under the drawing, from the left edge, so it keeps the full width.
  if (wide) texts.push(...Array.from({ length: Math.max(0, ICON_ART.length - texts.length) }, () => [] as BannerPart[]))
  // as before: a board with tasks (or archived ones) always gets a counts line, even an empty one
  if (b.tasks.length || archivedOf(b).done) texts.push(join(bannerCounts(b, nowMs).map(c => fact(c.text))))
  return texts.map((parts, i) => {
    const art = wide && logo[i] !== undefined ? `${logo[i]} ` : ''
    return { art, parts: cutParts(parts, w - art.length) }
  })
}

/** The strong separator under the banner and tabs, as wide as the panel's body (drawn in the accent color). */
export const bannerRule = (width: number) => '━'.repeat(Math.max(1, Math.floor(width)))

/** The light dotted break inside the list, under the Backlog section (drawn in the subtle color). */
export const listRule = (width: number) => '┄'.repeat(Math.max(1, Math.floor(width)))

/** The light line over the footer at the bottom of every page of the panel (drawn in the subtle color). */
export const footerRule = (width: number) => '─'.repeat(Math.max(1, Math.floor(width)))

/** A banner line as plain text (for tests and plain output). */
export const bannerText = (l: BannerLine) => l.art + l.parts.map(p => p.text).join('')

/** What the lead's board tool lists: tasks with one of `status` and matching `search` (see parseSearch: plain words and
 *  filter words like last:5 or type:bug); `limit` and `sort` are the same as last:N ("newest", the default) and
 *  top:N ("order"). `kinds`: the known kinds, so an unknown type: word gives an error. */
export type BoardFilter = { status?: SymccStatus[]; search?: string; limit?: number; sort?: 'newest' | 'order'; kinds?: readonly string[]; /** false: another session drives the board (see sessionNote) */ driving?: boolean }

/** The board tool's status words (a list, or one string like "todo, doing") as statuses; "open" adds every OPEN one.
 *  Undefined when none were given; throws on an unknown word. */
export function parseStatusFilter(words: unknown): SymccStatus[] | undefined {
  const list = (Array.isArray(words) ? words : typeof words === 'string' ? [words] : []).flatMap(w => String(w).toLowerCase().split(/[\s,]+/)).filter(Boolean)
  if (!list.length) return undefined
  const out = new Set<SymccStatus>()
  for (const w of list) {
    if (w === 'open') OPEN.forEach(x => out.add(x))
    else if ((BOARD_STATUSES as string[]).includes(w)) out.add(w as SymccStatus)
    else throw new Error(`unknown status "${w}": use ${BOARD_STATUSES.join(', ')} or open`)
  }
  return [...out]
}

/** One row (and its "from:" line) of the board as text. */
function boardRow(t: SymccTask, autoRetries: number | undefined, nowMs: number, driving = true): string[] {
  // the end text every view shows (rowEndText); the lead also reads "asks:" before a question, and "review" when nothing else is said
  const phase = taskPhase(t, nowMs)
  // in a session that doesn't drive the board a claim note says the worker runs in the other session (sessionNote)
  const end = rowEndText(t, phase, sessionNote(t, driving, nowMs))
  const asks = (phase.waitsFor === 'answer' || phase.waitsFor === 'files') && askText(t.ask) ? 'asks: ' : ''
  const extra = end ? ` — ${asks}${end}` : t.status === 'review' ? ` — ${STATUS_WORD.review}` : ''
  const after = t.after.length && (t.status === 'todo' || t.status === 'backlog') ? ` (after ${t.after.join(', ')})` : ''
  // the kind, the role and a priority other than 0, e.g. " [bug · tester · p-1]" (a plain change with the general role and priority 0 shows nothing)
  const tag = [kindMark(t), roleMark(t), isFinished(t) ? '' : priorityMark(t.priority)].filter(Boolean).join(' · ')
  const role = tag ? ` [${tag}]` : ''
  // a later try: "T-5   ▶ doing   · try 2/3 <title>" (see tryMark)
  const mark = tryMark(t, autoRetries)
  // the step a finished task is in: its icon as the mark (rowMark, like every other view) and its short word (STEP_WORD)
  // for the lead: "T-5   ⊛ doing   test · title"
  const step = checkStepNow(t, nowMs)
  // with both, one separator between them: "prep · try 2 title" (not "prep · · try 2")
  const lead = step ? `${STEP_WORD[step]} · ${mark ? `${mark} ` : ''}` : mark ? `· ${mark} ` : ''
  // the task's own mark first (● a to do task worked on before, ⧗ in the merge line, see rowMark): "T-5   ● todo    title"
  return [`${t.id.padEnd(5)} ${rowMark(t, nowMs)} ${t.status.padEnd(7)} ${lead}${t.title}${role}${after}${extra}`, `${' '.repeat(16)}${fromText(t)}`]
}

/** The line under the default board for the done and dropped tasks it hides: "143 done, 3 dropped; ask with status: done to see them". */
export function hiddenLine(done: number, dropped: number): string {
  if (!done && !dropped) return ''
  const counts = [done ? `${done} done` : '', dropped ? `${dropped} dropped` : ''].filter(Boolean).join(', ')
  return `${counts}; ask with status: ${done ? 'done' : 'dropped'} to see them`
}

/** The board for the model (the lead's board tool): the project's path (with `where`), the settings line, then the rows,
 *  newest first (with a short "from:" line under each, see fromText), then the archived count.
 *  With no `filter`: the open tasks and the backlog in full, the done and dropped ones only as counts (see hiddenLine).
 *  With a filter: every task on the board with one of its statuses and matching its search words (as the panel's search).
 *  `version`: the plugin's version for the top line ('' = none). */
export function boardText(b: Board, nowMs?: number, where?: string, name: string = DEFAULT_NAME, offsetMin: number = localOffset(nowMs), filter: BoardFilter = {}, version: string = ''): string {
  const top = where ? [`${boardBrand(name, version)} · ${where}`] : []
  const gone = archivedLine(b, name)
  // the lead's open questions for the owner, first (see core/questions.ts)
  const open = openQuestions(b)
  const asks = open.length ? [`${questionsLabel(open.length)}:`, ...open.map(q => `  ${questionLine(q)}`)] : []
  if (!b.tasks.length) return [...top, ...asks, 'The board is empty.', ...(gone ? [gone] : [])].join('\n')
  const s: BoardSections = boardSections(b.tasks, nowMs ?? NaN, offsetMin)
  const closed = [...s.today, ...s.days.flatMap(g => g.tasks)]
  const all = [...s.open, ...s.backlog, ...closed]
  const head = `${modeText(modeOf(b))} · tests: ${testsShort(b.test_commands)} · up to ${b.max_parallel} at once · a worker may run ${b.max_minutes} min · ${b.auto_retries} auto retries on failing tests`
  const search = filter.search?.trim() ?? ''
  let body: string[]
  if (filter.status?.length || search || filter.limit !== undefined || filter.sort) {
    const kinds = filter.kinds ? [...new Set([...filter.kinds, ...b.tasks.map(kindOf)])] : undefined
    const q = parseSearch(search, nowMs ?? Date.now(), offsetMin, kinds)
    if (q.errors.length) throw new Error(q.errors[0])
    if (filter.status?.length) q.status = q.status ? q.status.filter(x => filter.status!.includes(x)) : filter.status
    if (filter.limit !== undefined || filter.sort) {
      const n = filter.limit !== undefined && Number.isFinite(filter.limit) && filter.limit > 0 ? Math.floor(filter.limit) : undefined
      q.pick = { by: filter.sort ?? q.pick?.by ?? 'newest', n: n ?? q.pick?.n }
    }
    const matched = searchTasks(all, { ...q, pick: undefined }, nowMs ?? Date.now(), b.archived_done)
    const rows = q.pick ? searchTasks(all, q, nowMs ?? Date.now(), b.archived_done) : matched
    const picked = q.pick ? `${q.pick.by === 'newest' ? 'last' : 'top'}${q.pick.n ? `: ${q.pick.n}` : ''}` : ''
    const asked = [picked, filter.status?.length ? `status: ${filter.status.join(', ')}` : '', search ? `search: ${search}` : ''].filter(Boolean).join('; ')
    // with last / top the line says how many matched in all: "10 of 37 matching shown (484 tasks on the board; ...)"
    const count = q.pick ? `${rows.length} of ${q.pick.by === 'order' && !q.status ? matched.filter(t => t.status === 'todo').length : matched.length} matching shown (${b.tasks.length} tasks on the board; ${asked})` : `${rows.length} of ${b.tasks.length} tasks (${asked})`
    body = rows.length ? [...rows.flatMap(t => boardRow(t, b.auto_retries, nowMs ?? Date.now(), filter.driving)), count] : [`No tasks match (${asked}).`]
  } else {
    const hidden = hiddenLine(closed.filter(t => t.status === 'done').length, closed.filter(t => t.status === 'dropped').length)
    body = [...[...s.open, ...s.backlog].flatMap(t => boardRow(t, b.auto_retries, nowMs ?? Date.now(), filter.driving)), ...(hidden ? [hidden] : [])]
  }
  return [...top, head, ...asks, ...body, ...(gone ? [gone] : [])].join('\n')
}
