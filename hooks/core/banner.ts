// Board titles, the status line, the banner at the top of the panel, and the board as text.
import type { SymccMode, SymccStatus, SymccTask } from '../../types'
import { DEFAULT_NAME, ICON, ICON_ART, namesFor } from '../name'
import { type Board, type BoardTask, kindOf, modeOf, OPEN, STATUS_WORD } from './board-file'
import { boardSections, type BoardSections, localOffset } from './days'
import { fromText } from './origin'
import { modeLabel, modeText } from './review'
import { kindMark } from './kinds'
import { roleMark, tryMark } from './roles'
import { archivedLine, archivedNote, archivedOf } from './archive'
import { PLAN_NOTE } from './plan'
import { type CrewBoard, withCrew, parseSearch, searchTasks, BOARD_STATUSES, statusCell, STEP_NOTE, STEP_WORD, TITLE_ROOM, rowStates, stateText, rowMark, APPROVED_NOTE, fileWaitText } from './panel'
import { checkStepNow, shownStatus } from './lead'
import { type TaskPhase, taskPhase } from './phase'
import { whyFailed } from './failure'
import { offStatusParts, testsShort } from './settings'
import { type OwnerQuestion, openQuestions, questionsForYou, questionLine, questionsLabel } from './questions'
import { type LogoFrame, LOGO_MIN_WIDTH, restFrame } from './logo'

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

/** At most this many task IDs are listed for one state in the status line; the rest show as "+N". */
export const STATUS_IDS = 3

/** "T-1, T-2, T-3 +2" for the first STATUS_IDS IDs. */
function idList(ids: string[]): string {
  const shown = ids.slice(0, STATUS_IDS).join(', ')
  return ids.length > STATUS_IDS ? `${shown} +${ids.length - STATUS_IDS}` : shown
}

/** The try marks of the doing tasks for the status line (see tryMark): " (try 2)" when one task is doing, " (T-2 try 2)"
 *  naming the task when several are; '' when every one is on its first try. */
function triesNote(doing: (Pick<SymccTask, 'id' | 'status'> & Partial<Pick<SymccTask, 'attempts'>>)[]): string {
  const marks = doing.slice(0, STATUS_IDS).map(t => ({ id: t.id, mark: tryMark({ status: t.status, attempts: t.attempts ?? 0 }) })).filter(x => x.mark)
  if (!marks.length) return ''
  return doing.length === 1 ? ` (${marks[0]!.mark})` : ` (${marks.map(x => `${x.id} ${x.mark}`).join(', ')})`
}

/**
 * The front of each task row in the band above the prompt, lined up like the board list's rows (fixed-width ID and
 * state columns). Every row shows the list's own mark and short status cell (rowMark, rowCell): a doing task "▶ 1h40m" (the
 * total work time of all its tries), in a check step its icon (STEP_ICON) in place of ▶ and the step word: "⧗ 9m",
 * "✎ 2h5m", "⌕ 5m", "⇢ 40m", in the merge line "⋯ 2h5m", with its try after it from
 * try 2 on ("T-434 ▶ 1h40m (3)", see rowStates); in a row narrower than `width` the time is left out, then the try;
 * the others "? waiting", "◆ review", "✗ failed". The state column has one width, so every title starts in one column. `since(id)` is when this session's worker started.
 */
export function bandLeads(tasks: (Pick<SymccTask, 'id' | 'status' | 'runs'> & Partial<Pick<SymccTask, 'attempts' | 'note'>> & Pick<BoardTask, 'checking' | 'time_ask' | 'kind'>)[], nowMs: number, since: (id: string) => number | string | undefined = () => undefined, width = Infinity): Map<string, string> {
  const idWidth = Math.max(4, ...tasks.map(t => t.id.length))
  const rows = tasks.map(t => ({ ...t, attempts: t.attempts ?? 0 }))
  const front = (t: (typeof rows)[number]) => `${t.id.padEnd(idWidth)} ${rowMark(t, nowMs)} `
  const frontWidth = Math.max(0, ...rows.map(t => front(t).length))
  // too narrow: the time is left out, then the try, so the titles keep TITLE_ROOM
  const { states } = rowStates(rows, nowMs, since, w => frontWidth + w + 1 + TITLE_ROOM <= width)
  return new Map(rows.map(t => [t.id, `${front(t)}${stateText(states.get(t.id))}`]))
}

/** Whether a doing row in the band has a state to show (see bandLeads); without one its note says what goes on. */
export const bandHasState = (t: Pick<SymccTask, 'status' | 'runs'> & Pick<BoardTask, 'checking' | 'time_ask' | 'kind'>, nowMs: number, since?: number | string): boolean => t.status === 'doing' && statusCell(t, nowMs, since) !== ''

/** The notes a doing row's state already says ("▶ 12m", "⧗ 9m", "⇢ 40s"), so the band leaves them out when it shows one:
 *  also both claim notes (app/starts.ts: QUEUED_NOTE "starting at the next turn" with the start queue, STARTING_NOTE
 *  "worker starting" without it, e.g. on OpenCode). */
const STATE_NOTES = new Set(['worker on it', STEP_NOTE.testing, STEP_NOTE.merging, 'starting at the next turn', 'worker starting'])

/** The note a doing row in the band shows as its tail: '' when its state already says it (see STATE_NOTES), else the note.
 *  `driving` false (another session drives the board): a claim note ("starting at the next turn") becomes
 *  OTHER_SESSION_NOTE, as that task's worker starts in the driving session, not here (T-643). */
export const bandNote = (t: Pick<SymccTask, 'status' | 'runs' | 'note'> & Pick<BoardTask, 'checking' | 'time_ask' | 'kind'>, nowMs: number, since?: number | string, driving = true): string =>
  !t.note || (STATE_NOTES.has(t.note) && bandHasState(t, nowMs, since)) ? '' : !driving && t.status === 'doing' && CLAIM_NOTES.has(t.note) ? OTHER_SESSION_NOTE : t.note

// ---------------- another session drives the board (T-643) ----------------

/** The notes a task gets when claimed, before its worker started (app/starts.ts: QUEUED_NOTE and STARTING_NOTE). */
const CLAIM_NOTES = new Set(['starting at the next turn', 'worker starting'])
/** The end text of a doing task whose worker starts in the session that drives the board, shown in the other sessions. */
export const OTHER_SESSION_NOTE = 'runs in the other session'
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
 * The warning a session that doesn't drive the board shows, '' when it drives. `where` 'board': the line under the
 * board's banner, the longest form that fits in `width` ("⚠ Another session drives this board — its workers run there,
 * not here. /symcc-drive to drive it from here."); 'band': the short mark at the start of the band above the prompt
 * ("⚠ driven by another session"). Both add that the driver looks idle when driverLooksIdle says so.
 */
export function driveWarning(driving: boolean, tasks: readonly DriveTask[], nowMs: number, name: string = DEFAULT_NAME, where: 'board' | 'band' = 'board', width = Infinity): string {
  if (driving) return ''
  const idle = driverLooksIdle(tasks, nowMs)
  if (where === 'band') return `⚠ driven by another session${idle ? ' (it looks idle)' : ''}`
  const cmd = `/${namesFor(name).name}-drive`
  const who = `Another session drives this board${idle ? ', but it looks idle' : ''}`
  const forms = [
    `⚠ ${who} — its workers run there, not here. ${cmd} to drive it from here.`,
    `⚠ ${who}. ${cmd} to drive it from here.`,
    `⚠ ${who}. ${cmd} to take over.`,
    `⚠ Other session drives${idle ? ' (idle?)' : ''} · ${cmd}`,
    `⚠ ${cmd} to drive here`,
  ]
  return forms.find(f => f.length <= width) ?? forms[forms.length - 1]!
}

/**
 * The end text of a task's row, the same in both bands (Claude Code's and OpenCode's) and the lead's text board,
 * read from `phase` (taskPhase): the owner's own files in the way of its merge (fileWaitText), "approved, merging"
 * while its approve runs (APPROVED_NOTE), its question while it asks one (an answer or files outside its list),
 * why it failed (whyFailed), else `note` (the task's note; the bands pass bandNote, which leaves out what the row's
 * state already says). '' when there is nothing to say.
 */
export function rowEndText(t: Pick<SymccTask, 'note' | 'history'> & Partial<Pick<SymccTask, 'question' | 'test_output' | 'runs'>> & Pick<BoardTask, 'status' | 'merge_wait' | 'merge_into'>, phase: Pick<TaskPhase, 'waitsFor' | 'approved' | 'stage'>, note: string = t.note ?? ''): string {
  if (phase.waitsFor === 'your-files') return fileWaitText(t)
  if (phase.approved && phase.stage) return APPROVED_NOTE
  if (phase.waitsFor === 'answer' || phase.waitsFor === 'files') return t.question ?? t.note ?? ''
  if (phase.waitsFor === 'failed') return whyFailed(t)
  return note
}

/** About how wide the line above the prompt may be: Claude Code puts "<name>: " (and its own mark) in front. */
export const STATUS_WIDTH = 80
/** The room the status text has in STATUS_WIDTH after Claude Code's "⚠ <name>: " in front of it. */
export const statusRoom = (name: string = DEFAULT_NAME) => STATUS_WIDTH - `⚠ ${name}: `.length

/**
 * The short status text Claude Code shows after "symcc:", e.g. "⏵ auto · 1/3 workers · T-26 doing · 1 to do · 5 scouts (next: gaps-bot in 1h 00m)".
 * It starts with the board mode (modeLabel: "⏸ paused", "⏸ review merge", "⏵ auto"), so the mode is always in the same spot.
 * With `crew` (see withCrew): the busy workers right after the mode (left out while none run) and the scouts after the
 * counts; when the text is wider than `width`, the try marks of the doing tasks go first, then the "(next: …)" part, then the scouts.
 * Tasks being done, in review and failed are listed by ID; other open states are counts. No folder name (the pane title has it).
 * The text itself never has a "⚠": it says what needs attention in words ("1 failed (T-7)", "1 waiting for you", "⏸ paused").
 * undefined when there is nothing to say: an empty board this session drives, in mode auto, with no branch note and no scouts.
 */
export function statusLine(b: { tasks: (Pick<SymccTask, 'id' | 'status'> & Partial<Pick<SymccTask, 'attempts'>> & Pick<BoardTask, 'checking'>)[]; questions?: readonly Pick<OwnerQuestion, 'answered_at' | 'dropped'>[] }, driving: boolean, branch_note = '', mode: SymccMode = 'auto', plan = false, crew?: CrewBoard, nowMs = Date.now(), width = Infinity): string | undefined {
  const join0 = (xs: (string | false | undefined)[]) => xs.filter(Boolean).join(' · ')
  // in plan mode the line says so first (see core/plan.ts)
  const join = (xs: (string | false | undefined)[]) => join0(plan ? [PLAN_NOTE, ...xs] : xs)
  // an approved task in review whose approve runs is listed as doing (see shownStatus)
  const ids = (st: SymccStatus) => b.tasks.filter(t => shownStatus(t, nowMs) === st).map(t => t.id)
  // T-643: not driving is said right after the mode (and the questions), so it is never cut off
  const other = driving ? '' : driveWarning(false, b.tasks, nowMs, DEFAULT_NAME, 'band').replace(/^⚠ /, '')
  const m = modeOf({ mode })
  const label = modeLabel(m)
  const c = crew && { ...crew, mode: m, plan_mode: plan }
  // the lead's open questions for the owner come right after the mode, so they are never cut ("2 questions for you")
  const asks = questionsForYou(openQuestions(b).length)
  if (b.tasks.length) {
    const doing = ids('doing'), review = ids('review'), failed = ids('failed')
    const note = triesNote(b.tasks.filter(t => t.status === 'doing'))
    const line = (tries: string) => {
      const parts = [
        doing.length && `${idList(doing)} ${STATUS_WORD.doing}${tries}`,
        review.length && `${review.length} to review (${idList(review)})`,
        ...statusCounts(b.tasks, ['todo', 'paused', 'waiting'], nowMs),
        failed.length && `${failed.length} ${STATUS_WORD.failed} (${idList(failed)})`,
      ].filter((x): x is string => !!x)
      // backlog stays out of the line, except when it is all that is left: then say so, so parked ideas aren't hidden
      const parked = ids('backlog').length
      const counts = join0(parts) || (parked ? `all done · ${parked} in backlog` : 'all done')
      return withCrew((w, s) => join([label, other, asks, w, counts, s, branch_note]), c, nowMs, width)
    }
    // the try marks are extra: they are kept only when they fit without cutting anything else (scouts, "(next: …)")
    const plain = line('')
    if (!note) return plain
    const full = line(note)
    return full.length <= width && full.length === plain.length + note.length ? full : plain
  }
  if (!driving) return withCrew((w, s) => join([label, other, asks, w, 'empty', s, branch_note]), c, nowMs, width)
  // an empty board in mode auto stays quiet (unless there are scouts), so a fresh project shows nothing
  if (m !== 'auto') return withCrew((w, s) => join([label, asks, w, s, branch_note]), c, nowMs, width)
  return withCrew((w, s) => join([(s || asks) && label, asks, w, s, branch_note]), c, nowMs, width) || undefined
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
export type BannerBoard = Pick<Board, 'test_commands' | 'max_parallel' | 'max_minutes' | 'auto_retries'> & Partial<Pick<Board, 'archived'>> & { tasks: (Pick<SymccTask, 'status' | 'runs'> & Partial<Pick<SymccTask, 'note' | 'updated_at'>> & Pick<BoardTask, 'checking'>)[]; branch?: string; branch_note?: string; mode?: SymccMode; enabled?: boolean }

/** "2 doing", "1 to do", ... for each status in `order` that has tasks, in that order. */
export function statusCounts(tasks: (Pick<SymccTask, 'status'> & Pick<BoardTask, 'checking'>)[], order: SymccStatus[], nowMs: number = Date.now()): string[] {
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
    b.enabled === false
      ? offStatusParts(name).map(p => (p.command ? { text: p.text, tone: 'accent' as const, bold: true } : { text: p.text, tone: 'warning' as const }))
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
    ...(b.branch_note ? [[{ text: b.branch_note, tone: 'warning' as const }]] : b.branch ? [fact(b.branch)] : []),
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
  // as before: a board with tasks (or archived ones) always gets a counts line, even an empty one
  if (b.tasks.length || archivedOf(b).done) texts.push(join(bannerCounts(b, nowMs).map(c => fact(c.text))))
  const w = Math.max(1, Math.floor(width))
  const wide = w >= BANNER_NARROW
  // The three fixed lines sit beside the drawing; the drawing's lower lines (the clef's hook)
  // stand alone, and the counts line goes under the drawing, from the left edge, so it keeps the full width.
  if (wide) texts.splice(3, 0, ...Array.from({ length: Math.max(0, ICON_ART.length - 3) }, () => [] as BannerPart[]))
  // T-643: a session that doesn't drive says so in the warning color under it all, with how to take over
  const warn = driveWarning(driving, b.tasks, nowMs ?? Date.now(), name, 'board', w)
  if (warn) texts.push([{ text: warn, tone: 'warning' }])
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
 *  filter words like last:5 or kind:bug); `limit` and `sort` are the same as last:N ("newest", the default) and
 *  top:N ("order"). `kinds`: the known kinds, so an unknown kind: word gives an error. */
export type BoardFilter = { status?: SymccStatus[]; search?: string; limit?: number; sort?: 'newest' | 'order'; kinds?: readonly string[] }

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
function boardRow(t: SymccTask, autoRetries: number | undefined, nowMs: number): string[] {
  // the end text every view shows (rowEndText); the lead also reads "asks:" before a question, and "review" when nothing else is said
  const phase = taskPhase(t, nowMs)
  const end = rowEndText(t, phase)
  const asks = (phase.waitsFor === 'answer' || phase.waitsFor === 'files') && t.question ? 'asks: ' : ''
  const extra = end ? ` — ${asks}${end}` : t.status === 'review' ? ` — ${STATUS_WORD.review}` : ''
  const after = t.after.length && (t.status === 'todo' || t.status === 'backlog') ? ` (after ${t.after.join(', ')})` : ''
  // the kind and the role, e.g. " [bug · tester]" (a plain change with the general role shows nothing)
  const tag = [kindMark(t), roleMark(t)].filter(Boolean).join(' · ')
  const role = tag ? ` [${tag}]` : ''
  // a later try: "T-5   ▶ doing   · try 2/3 <title>" (see tryMark)
  const mark = tryMark(t, autoRetries)
  // the step a finished task is in: its icon as the mark (rowMark, like every other view) and its short word (STEP_WORD)
  // for the lead: "T-5   ⧗ doing   test · title"
  const step = checkStepNow(t, nowMs)
  // with both, one separator between them: "prep · try 2 title" (not "prep · · try 2")
  const lead = step ? `${STEP_WORD[step]} · ${mark ? `${mark} ` : ''}` : mark ? `· ${mark} ` : ''
  // the task's own mark first (● a to do task worked on before, ⋯ in the merge line, see rowMark): "T-5   ● todo    title"
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
    const matched = searchTasks(all, { ...q, pick: undefined }, nowMs ?? Date.now())
    const rows = q.pick ? searchTasks(all, q, nowMs ?? Date.now()) : matched
    const picked = q.pick ? `${q.pick.by === 'newest' ? 'last' : 'top'}${q.pick.n ? `: ${q.pick.n}` : ''}` : ''
    const asked = [picked, filter.status?.length ? `status: ${filter.status.join(', ')}` : '', search ? `search: ${search}` : ''].filter(Boolean).join('; ')
    // with last / top the line says how many matched in all: "10 of 37 matching shown (484 tasks on the board; ...)"
    const count = q.pick ? `${rows.length} of ${q.pick.by === 'order' && !q.status ? matched.filter(t => t.status === 'todo').length : matched.length} matching shown (${b.tasks.length} tasks on the board; ${asked})` : `${rows.length} of ${b.tasks.length} tasks (${asked})`
    body = rows.length ? [...rows.flatMap(t => boardRow(t, b.auto_retries, nowMs ?? Date.now())), count] : [`No tasks match (${asked}).`]
  } else {
    const hidden = hiddenLine(closed.filter(t => t.status === 'done').length, closed.filter(t => t.status === 'dropped').length)
    body = [...[...s.open, ...s.backlog].flatMap(t => boardRow(t, b.auto_retries, nowMs ?? Date.now())), ...(hidden ? [hidden] : [])]
  }
  return [...top, head, ...asks, ...body, ...(gone ? [gone] : [])].join('\n')
}
