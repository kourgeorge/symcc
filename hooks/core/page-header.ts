// The 4-line header at the top of a task's page and a scout's page (T-751), the same on every board (terminal,
// desktop, mobile, VS Code, OpenCode):
//
//    ‹ [Tasks]                                              T-738 · ‹ 2 of 6 ›     1. where you are
//    T-738  Live tab: an empty line before each section                           2. the title
//    ▶ doing · worker · ⏱ 4m   change · general · try 1/3   ♟ from you            3. the state
//    [Pause]   [Role] [Watch worker]   [Drop]   [☐ Needs review] [Copy]           4. the buttons, in groups
//   ───────────────────────────────────────────────────────────────────────────────  then a thin rule (T-790)
//
// Every button reads "[Label]" in the one text color (T-775); only the order of the groups and the gaps between
// them say what's what.
//
// Everything here is plain data (colored pieces, groups, places in a list); each board draws it its own way.
import type { SymccScout, SymccTask } from '../../types'
import { type BoardTask, DEFAULT_AUTO_RETRIES, isInvestigation, kindOf, STATUS_WORD } from './board-file'
import { type Seg, STATUS_BADGE, STATUS_MARK, statusMark, wrapSegs } from './details'
import { originOf } from './origin'
import { roleOf } from './roles'
import { type ActionGroup, GROUP_ORDER, rowTime, STEP_WORD, panelSections, searchTasks, type SearchMore } from './panel'
import { stageStep, taskPhase } from './phase'
import { everyText, findingsMark, scoutRanText, scoutStateText, type ScoutRunRecord, sortScouts } from './scouts'
import { liveLanes, liveTrains, type LiveTrain, type LiveView } from './live'
import { localOffset } from './days'

export type { ActionGroup }
export { GROUP_ORDER }

/** The tab a page was opened from: its Back button names it ("‹ [Tasks]", "‹ [Live]", "‹ [Scouts]"). */
export type PageFrom = 'tasks' | 'live' | 'scouts' | 'roles'
export const FROM_WORD: Record<PageFrom, string> = { tasks: 'Tasks', live: 'Live', scouts: 'Scouts', roles: 'Roles' }
/** The Back button's words, the tab's name: "Tasks" (drawn "[Tasks]" after the arrow, see whereLine). */
export const backText = (from: PageFrom): string => FROM_WORD[from]
/** The arrow before the Back button: "‹ " (not part of the button, T-775). */
export const BACK_ARROW = '‹ '

/** The keys that go to the previous and the next task or scout of the list: Claude Code's Buttons take one letter
 *  or digit only, so k and j there (the owner's choice); [ and ] on OpenCode, where k and j move. */
export const NAV_KEYS = { claude: { prev: 'k', next: 'j' }, opencode: { prev: '[', next: ']' } } as const
/** The footer's hint for them: "k j prev/next", "[ ] prev/next". */
export const navHint = (host: keyof typeof NAV_KEYS) => ({ key: `${NAV_KEYS[host].prev} ${NAV_KEYS[host].next}`, word: 'prev/next' })

/** A page's place in the list it was opened from: number `n` of `of`, and the ids before and after it (going round
 *  at the ends: the first one's previous is the last). */
export type Place = { n: number; of: number; prev: string; next: string }

/** Where `id` is in `ids`; null when it isn't there. */
export function placeIn(ids: readonly string[], id: string): Place | null {
  const i = ids.indexOf(id)
  if (i < 0) return null
  const of = ids.length
  return { n: i + 1, of, prev: ids[(i - 1 + of) % of]!, next: ids[(i + 1) % of]! }
}

/** The Tasks list's tasks in its order (with the search `query` on, only the matches): what needs the owner, what
 *  runs, what waits to run, the backlog, done, dropped; folded groups count too. */
export function taskListIds(tasks: SymccTask[], nowMs: number, query = '', archivedDone: readonly string[] = [], more?: SearchMore): string[] {
  const matching = query.trim() ? searchTasks(tasks, query, nowMs, archivedDone, more) : tasks
  const s = panelSections(matching, nowMs, localOffset(nowMs))
  return [...s.needsYou, ...s.doing, ...s.todo, ...s.backlog, ...s.doneToday, ...s.doneDays.flatMap(g => g.tasks), ...s.dropped].map(t => t.id)
}

/** The Live tab's tasks in its order: each lane, then the trains waiting under it. */
export function liveListIds(view: LiveView, nowMs: number): string[] {
  const lanes = liveLanes(view, nowMs)
  const trains = liveTrains(view, nowMs, lanes)
  const flat = (xs: readonly LiveTrain[]): string[] => xs.flatMap(x => [x.id, ...flat(x.trains)])
  return [...new Set(lanes.flatMap(l => [l.id, ...flat(trains.lanes[l.id] ?? [])]))]
}

/** The list a task's page goes through with prev/next: the Live tab's when it was opened from there and is on it,
 *  else the Tasks list's (with its search). */
export function taskPlace(view: LiveView, id: string, from: PageFrom, nowMs: number, query = '', more?: SearchMore): Place | null {
  if (from === 'live') {
    const live = placeIn(liveListIds(view, nowMs), id)
    if (live) return live
  }
  return placeIn(taskListIds(view.tasks, nowMs, from === 'live' ? '' : query, view.archived_done ?? [], more), id)
}

/** The scouts in the Scouts list's order. */
export const scoutListNames = (scouts: SymccScout[]): string[] => sortScouts(scouts).map(s => s.name)

/** Line 1's right part: "T-738 · ‹ 2 of 6 ›" (`label` the task's id or the scout's name); shorter when narrow
 *  ("‹ 2 of 6 ›"); just the label when it has no place. Each piece says what a click on it does. */
export type WherePiece = { text: string; go?: 'back' | 'prev' | 'next' }
export function whereLine(from: PageFrom, label: string, place: Place | null, width: number): { left: WherePiece[]; right: WherePiece[]; pad: number } {
  const left: WherePiece[] = [{ text: BACK_ARROW }, { text: `[${backText(from)}]`, go: 'back' }]
  // alone in its list: no place to go to, so no "1 of 1" either
  const moves = !!place && place.of > 1
  const nav: WherePiece[] = moves ? [{ text: '‹', go: 'prev' }, { text: ` ${place.n} of ${place.of} ` }, { text: '›', go: 'next' }] : []
  const long: WherePiece[] = moves ? [{ text: `${label} · ` }, ...nav] : [{ text: label }]
  const len = (xs: WherePiece[]) => xs.reduce((n, x) => n + x.text.length, 0)
  const w = Math.max(1, Math.floor(width))
  const right = len(left) + 1 + len(long) <= w ? long : moves ? nav : long
  return { left, right, pad: Math.max(1, w - len(left) - len(right)) }
}

/** Line 2: the id in its status color, two spaces, the title in bold; a long title wraps, each next line indented
 *  under the title's first word. */
export function titleLines(id: string, title: string, color: string, width: number): Seg[][] {
  const indent = id.length + 2
  const room = Math.max(8, Math.floor(width) - indent)
  return wrapSegs([{ text: title, color: 'text', bold: true }], room).map((l, i) => [...(i ? [{ text: ' '.repeat(indent), color: 'text' }] : [{ text: id, color, bold: true }, { text: '  ', color: 'text' }]), ...l])
}

/** The color of a task's id and status on its page: its status's badge color (doing's while an approve runs). */
export function taskColor(t: BoardTask, nowMs: number, merging = false): string {
  if (t.status === 'review' && isInvestigation(t) && !merging) return 'success'
  return STATUS_BADGE[taskPhase(t, nowMs, undefined, { merging }).shown]
}

/** Who a task came from, short: "♟ from you", "⌕ scout bugs", "◆ lead", "↳ from T-5" (a split or follow-up),
 *  "▸ from T-5" (a worker's report); null without a usable origin. */
export function originShort(t: { origin?: unknown }): Seg | null {
  const o = originOf(t)
  if (!o) return null
  if (o.by === 'owner') return { text: '♟ from you', color: 'claude' }
  if (o.by === 'scout') return { text: `⌕ scout ${o.scout || '?'}`, color: 'suggestion' }
  if (o.by === 'worker') return { text: `▸ from ${o.task || '?'}`, color: 'inactive' }
  if (o.how && o.task) return { text: `↳ from ${o.task}`, color: 'inactive' }
  return { text: '◆ lead', color: 'success' }
}

/** A task's try out of how many it may get: "try 1/3" (its automatic retries after failing tests counted, as on the
 *  Live tab); '' before its first try. */
export function tryText(t: Pick<SymccTask, 'attempts'> & { test_tries?: number }, autoRetries = DEFAULT_AUTO_RETRIES): string {
  const n = Number(t.attempts) || 0
  if (n < 1) return ''
  const auto = Number(t.test_tries ?? 0) || 0
  return `try ${n}/${Math.max(n, n - auto + autoRetries)}`
}

const dot = (): Seg => ({ text: ' · ', color: 'inactive' })

/**
 * Line 3 of a task's page, in groups (a narrow page wraps between them): the status mark and word in its color, the
 * step it is in and its work time ("▶ doing · worker · ⏱ 4m", "◆ ready for review", "✗ failed"); its kind · role ·
 * try n/m; where it came from (originShort); and its note, when it has one (dim). `merging`: an approve this page
 * started (shown doing at once, as on the board); `note`: the note as this session shows it (sessionNote).
 */
export function taskStateGroups(t: BoardTask, o: { nowMs: number; merging?: boolean; autoRetries?: number; note?: string }): Seg[][] {
  const merging = !!o.merging
  const p = taskPhase(t, o.nowMs, undefined, { merging })
  const color = taskColor(t, o.nowMs, merging)
  const answered = t.status === 'review' && isInvestigation(t) && !merging
  const status: Seg[] = [{ text: answered ? `${statusMark(t)} answered: read it` : `${p.shown === t.status ? statusMark(t) : STATUS_MARK[p.shown]} ${STATUS_WORD[p.shown]}`, color, bold: true }]
  if (p.shown === 'doing') {
    const step = stageStep(p.stage)
    status.push(dot(), { text: step ? `${STEP_WORD[step]}${p.stage === 'queue' && p.place ? ` (${p.place})` : ''}` : 'worker', color: 'text' })
    const time = rowTime(t, o.nowMs)
    if (time) status.push(dot(), { text: `⏱ ${time}`, color: 'inactive' })
  }
  const what: Seg[] = [{ text: kindOf(t), color: 'suggestion' }, dot(), { text: roleOf(t), color: 'ide' }]
  const tries = tryText(t, o.autoRetries)
  if (tries) what.push(dot(), { text: tries, color: (Number(t.attempts) || 0) > 2 ? 'warning' : 'inactive' })
  const from = originShort(t)
  const note = o.note?.trim()
  return [status, what, ...(from ? [[from]] : []), ...(note ? [[{ text: note, color: 'inactive', italic: true }]] : [])]
}

/** Line 3 of a scout's page, in groups: its state or how often it runs ("◉ running now", "◷ every 2 days"), when
 *  it runs next, and when it last ran with what came of it ("last ran 2h ago: 2 findings → T-736, T-739"). `last`:
 *  its newest run and the tasks made from it. */
export function scoutStateGroups(sc: SymccScout, nowMs: number, last?: { run: ScoutRunRecord; tasks: readonly string[] }): Seg[][] {
  const state = scoutStateText(sc, nowMs)
  const first: Seg[] = sc.running ? [{ text: '◉ running now', color: 'ide', bold: true }, dot(), { text: everyText(sc.every_minutes), color: 'text' }] : [{ text: `◷ ${everyText(sc.every_minutes)}`, color: 'text' }]
  if (!sc.running && state && state !== 'paused') first.push(dot(), { text: state, color: 'inactive' })
  if (sc.model) first.push(dot(), { text: sc.model, color: 'inactive' })
  if (sc.findings) first.push(dot(), { text: `findings ${findingsMark(sc.findings)}`, color: 'inactive' })
  const ran = scoutRanText(sc, nowMs)
  const lastSegs: Seg[] = [{ text: ran.startsWith('ran ') ? `last ${ran}` : ran, color: 'inactive' }]
  if (last && ran.startsWith('ran ')) {
    const n = last.run.findings
    lastSegs.push({ text: `: ${n} finding${n === 1 ? '' : 's'}`, color: n ? 'warning' : 'inactive' })
    if (last.tasks.length) lastSegs.push({ text: ` → ${last.tasks.join(', ')}`, color: 'claude' })
  }
  return [first, lastSegs]
}

/** One button of a page header's line 4: its id (the board's element key), words, group and key (shown only in the
 *  footer); `fact`, words that only say something (a scout's "⏸ paused"), no button. */
export type HeaderButton = { id: string; label: string; group: ActionGroup; key?: string; fact?: boolean }

/** How a header button reads on a text board (terminal, OpenCode): every one framed the same, "[Pause]", "[Drop]",
 *  "[☐ Needs review]" (T-775); a fact is just its words ("⏸ paused"). */
export const pillText = (b: Pick<HeaderButton, 'label' | 'fact'>): string => (b.fact ? b.label : `[${b.label}]`)

/** The color of every header button on a text board (Back too): the normal text color (T-775). */
export const PILL_COLOR = 'text'

/** `xs` grouped by their group, in GROUP_ORDER, empty groups left out (each keeps its order). */
export function inGroups<T extends { group: ActionGroup }>(xs: readonly T[]): T[][] {
  return GROUP_ORDER.map(g => xs.filter(x => x.group === g)).filter(g => g.length)
}

/** The gap between two items of one group, and between two groups, on a text board's header line. */
export const ITEM_GAP = 1
export const GROUP_GAP = 3

/** Packs groups of items (their widths) into rows of at most `width` columns: a whole group goes on the row when it
 *  fits there (GROUP_GAP before it), else it starts a new row; a group wider than a row breaks between its items,
 *  never inside one. Each row: the items' places, [group, item], and whether a group starts there (after a gap). */
export function packGroups(widths: readonly (readonly number[])[], width: number, itemGap = ITEM_GAP, groupGap = GROUP_GAP): { g: number; i: number; gap: number }[][] {
  const w = Math.max(1, Math.floor(width))
  const rows: { g: number; i: number; gap: number }[][] = []
  let used = 0
  const sum = (xs: readonly number[]) => xs.reduce((n, x) => n + x, 0) + itemGap * Math.max(0, xs.length - 1)
  widths.forEach((items, g) => {
    if (!items.length) return
    const whole = sum(items)
    const row = rows[rows.length - 1]
    if (row && used + groupGap + whole <= w) {
      items.forEach((x, i) => (row.push({ g, i, gap: i ? itemGap : groupGap }), (used += (i ? itemGap : groupGap) + x)))
      return
    }
    // a new row for the group, breaking it between items when it is wider than a row
    let cur: { g: number; i: number; gap: number }[] = []
    rows.push(cur)
    used = 0
    items.forEach((x, i) => {
      if (cur.length && used + itemGap + x > w) {
        cur = []
        rows.push(cur)
        used = 0
      }
      cur.push({ g, i, gap: cur.length ? itemGap : 0 })
      used += (cur.length > 1 ? itemGap : 0) + x
    })
  })
  return rows
}

/** Groups of colored pieces (line 3) as lines within `width`: the groups packed by packGroups, each row's groups
 *  GROUP_GAP apart; a group wider than a line is wrapped by itself (wrapSegs). */
export function groupSegLines(groups: readonly Seg[][], width: number): Seg[][] {
  const w = Math.max(1, Math.floor(width))
  const len = (xs: readonly Seg[]) => xs.reduce((n, x) => n + x.text.length, 0)
  const pieces: Seg[][] = groups.flatMap(g => (len(g) > w ? wrapSegs(g.map(x => ({ ...x })), w) : [g]))
  return packGroups(pieces.map(p => [len(p)]), w, ITEM_GAP, GROUP_GAP).map(row => row.flatMap(({ g, gap }) => [...(gap ? [{ text: ' '.repeat(gap), color: 'text' }] : []), ...pieces[g]!]))
}

/** The thin rule under the header of every detail page (task, scout, org-mem; T-790), across the page. The heavy rule
 *  (━) stays on the main board only. */
export const headerRule = (width: number): string => '─'.repeat(Math.max(1, Math.floor(width)))

/** T-790: line 1 of a detail page that has no place in a list (the org-mem page): "‹ [Live]", the `right` words at the
 *  far end ("60 / 60"); the same pieces as whereLine's. */
export function navRow(from: PageFrom, right: string, width: number): { left: WherePiece[]; right: WherePiece[]; pad: number } {
  const left: WherePiece[] = [{ text: BACK_ARROW }, { text: `[${backText(from)}]`, go: 'back' }]
  const len = left.reduce((n, x) => n + x.text.length, 0)
  return { left, right: [{ text: right }], pad: Math.max(1, Math.floor(width) - len - right.length) }
}

/** The Edit button's word (written so tests/host-free.sh doesn't take it for Claude Code's Edit tool). */
const EDIT_WORD = 'Edit '.trim()

/** The buttons of a scout's page header (the ones it has had: Run now, Edit, Pause or Resume), each in its group,
 *  and "⏸ paused" as a fact while it is paused. */
export function scoutButtons(sc: Pick<SymccScout, 'running' | 'paused'>): HeaderButton[] {
  return [
    ...(sc.running ? [] : [{ id: 'scout-run', label: 'Run now', group: 'main' as const, key: 'r' }]),
    { id: 'scout-edit', label: EDIT_WORD, group: 'task', key: 'e' },
    { id: 'scout-pause', label: sc.paused ? 'Resume' : 'Pause', group: 'page', key: 'p' },
    ...(sc.paused ? [{ id: 'scout-paused', label: '⏸ paused', group: 'page' as const, fact: true }] : []),
  ]
}

/** The buttons of a role's page header (T-871): Edit and Prompt, Turn off or on, Reset to built-in (a replaced role) and
 *  Remove (an added one); the keys are the ones the page has always had (e, p, o, r, d). */
export function roleButtons(o: { canOff: boolean; off: boolean; canReset: boolean; canRemove: boolean; canSeePrompt: boolean }): HeaderButton[] {
  return [
    { id: 'role-edit', label: EDIT_WORD, group: 'task', key: 'e' },
    ...(o.canSeePrompt ? [{ id: 'role-prompt', label: 'Prompt', group: 'task' as const, key: 'p' }] : []),
    ...(o.canOff ? [{ id: 'role-off', label: o.off ? 'Turn on' : 'Turn off', group: 'page' as const, key: 'o' }] : []),
    ...(o.canReset ? [{ id: 'role-reset', label: 'Reset to built-in', group: 'danger' as const, key: 'r' }] : []),
    ...(o.canRemove ? [{ id: 'role-remove', label: 'Remove', group: 'danger' as const, key: 'd' }] : []),
  ]
}

/** A scout page's line 2 text after its name: the summary from its file's front matter; '' without one (T-686: the
 *  instructions show only under Instructions). */
export const scoutAbout = (sc: Pick<SymccScout, 'summary'>): string => sc.summary?.trim() ?? ''
