// T-797: the Live tab's ▍Branches section (split out of live.ts).
import type { SymccTask } from '../../types'
import type { BoardTask } from './board-file'
import { stageStep, taskPhase } from './phase'
import { shownStatus } from './lead'
import { cutTitle, fitSegs, padWidth, textWidth } from './width'
import { rowDuration, rowMark, STEP_WORD } from './panel'
import { num, plural } from './text'
import { type LiveView, liveFinishedLanes, liveTrains } from './live'
import { type LiveTone, type LiveSeg, LIVE_SECTIONS, liveInner, liveHeading, segs, segText, fitText, ms } from './live-seg'

// ---------------- T-727: the Branches section under the lanes ----------------
//  ▍Branches
//  main   ●───●───●───●───●───●───●   c11a736 · 2 min ago
//         │       │           │   ╰─◀ T-724  merged 3m ago (c11a736)
//         │       │           ╰─────○ T-721  +3 commits · 1 behind
//         │       ╰─────────────────○ T-725  +0 commits · 4 behind
//         ╰─────────────────────────○ T-726  not started
// The figures come from git, read by the app side (hooks/app/branches.ts) and put in the view (`branches`).

/** One commit of the main line: its full sha and when it was made (ms). */
export type BranchCommit = { sha: string; at: number }
/** What git says of a task's branch: commits on it not in the branch it merges into (`ahead`), commits there not on
 *  it (`behind`), and where it forked (`base`, the merge-base's full sha). */
export type BranchFigures = { ahead: number; behind: number; base: string }
/** The branch figures in the view (T-727): the branch the main line shows (`into`), its latest commits (newest first),
 *  each open task's branch figures by task id (a task whose git command failed is left out), and when they were read. */
export type BranchFacts = { into: string; commits: BranchCommit[]; tasks: Record<string, BranchFigures>; at: number; /** T-1199: on a board with projects, each repo's own figures (its tasks' project is `project`, '' = the board folder's repo); the first fields are then the first repo's */ repos?: BranchRepo[] }
/** T-1199: one repo's branch figures: its project name ('' = the board folder), the name shown, the branch its tasks merge into, its latest commits and its tasks' figures. */
export type BranchRepo = { project: string; name: string; into: string; commits: BranchCommit[]; tasks: Record<string, BranchFigures> }

/** The task statuses whose branch gets a row. */
export const BRANCH_STATUSES: readonly SymccTask['status'][] = ['doing', 'review', 'waiting', 'failed', 'paused']
/** How many commits the main line shows at most. */
export const BRANCH_COMMITS = 7
/** At most this many task rows, then "+N more". */
export const BRANCH_ROWS_MAX = 8
/** At most this many "not started" rows (next-up todo tasks with no branch yet). */
export const BRANCH_NEW_MAX = 3
/** Past this many commits behind, "N behind" is a warning. */
export const BRANCH_BEHIND_WARN = 5

/** What a row of the section is: a task's branch, a just-merged task, a task not started yet, or the "+N more" line. */
export type BranchRowKind = 'branch' | 'merged' | 'new' | 'more'
/**
 * A row of the section: its task (`id`, none on "+N more"), what it is, the commit it hangs from (`col`, 0 = the
 * leftmost shown), the columns of the rows under it whose lines pass by (`lines`), whether one of them hangs from the
 * same commit (`tee`: "├" instead of "╰"), its whole line (`segs`) and the text after its mark (`label`).
 */
export type BranchRow = { id?: string; kind: BranchRowKind; col: number; lines: number[]; tee: boolean; segs: LiveSeg[]; label: LiveSeg[] }
/** The section in a width: its header, the main line (`main`: its segments; `name` the branch, `commits` the shown ones
 *  oldest first, `step` the columns from one dot to the next, `indent` the columns before the first dot, `right` the
 *  newest commit's sha and age), and the rows. */
export type LiveBranches = { /** T-1199: with several repos, the line above this repo's main line ("client · merges into dev"); absent on a board with no projects */ repoHead?: LiveSeg[]; head: LiveSeg[]; main: LiveSeg[]; name: string; commits: BranchCommit[]; step: number; indent: number; right: string; rows: BranchRow[] }

/** "just now", "2 min ago", "3 h ago", "4 d ago". */
export function agoText(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`
}

type BranchItem = { id: string; kind: 'branch' | 'merged' | 'new'; fig?: BranchFigures; merged?: string; atMs?: number; state?: BranchState }

/** T-913: a branch row's task state after its id, in the board list's own mark and colour (rowMark, LIST_TONE): the
 *  mark ("‖", "✗", "?", "◆", or a running task's stage icon "▶", "⊛", ...) and a short word ("paused", "in review"). */
export type BranchState = { mark: string; word: string; tone: LiveTone }
/** The short word of each state a branch row shows (BRANCH_STATUSES); a running task shows its step's word instead. */
export const BRANCH_STATE_WORD: Record<string, string> = { doing: 'running', review: 'in review', waiting: 'waiting', failed: 'failed', paused: 'paused' }
const BRANCH_STATE_TONE: Record<string, LiveTone> = { doing: 'bar', review: 'warning', waiting: 'warning', failed: 'failed', paused: 'paused' }

/** T-913: the state a branch row shows for task `t` at `nowMs`: a task shown as doing (shownStatus: also one in review or
 *  waiting while its approve runs) has its stage's icon and word ("⊛ test", "▶ running"), the others their status. */
export function branchState(t: LiveView['tasks'][number], nowMs: number): BranchState {
  const shown = shownStatus(t as BoardTask, nowMs)
  const step = stageStep(taskPhase(t as BoardTask, nowMs).stage)
  const word = shown === 'doing' && step ? STEP_WORD[step] : BRANCH_STATE_WORD[shown] ?? shown
  return { mark: rowMark(t as BoardTask, nowMs), word, tone: BRANCH_STATE_TONE[shown] ?? 'dim' }
}

/** The tasks the section shows, in the order they are kept when there are too many: the open tasks with a branch git
 *  answered for (by id), then (T-794) the tasks ▍Tasks keeps as finished lanes (liveFinishedLanes: merged in the last
 *  LIVE_FINISHED_MS, at most LIVE_FINISHED_MAX, newest first), then up to BRANCH_NEW_MAX next-up tasks with no branch yet. */
function branchItems(view: LiveView, facts: Pick<BranchFacts, 'tasks'>, nowMs: number, project?: string): BranchItem[] {
  const open: BranchItem[] = []
  // T-1199: with a project ('' = none), only that repo's tasks
  const mine = (id: string) => project === undefined || ((view.tasks.find(t => t.id === id) as { project?: string } | undefined)?.project ?? '') === project
  for (const t of view.tasks) {
    if (t.status === 'done' || !mine(t.id)) continue
    const fig = facts.tasks[t.id]
    if (BRANCH_STATUSES.includes(t.status) && t.branch && fig) open.push({ id: t.id, kind: 'branch', fig, state: branchState(t, nowMs) })
  }
  const merged = liveFinishedLanes(view, nowMs).filter(l => mine(l.id)).map((l): BranchItem => {
    const sha = view.tasks.find(t => t.id === l.id)?.merged
    return { id: l.id, kind: 'merged', ...(sha ? { merged: sha } : {}), atMs: l.done?.atMs ?? nowMs }
  })
  const next = liveTrains(view, nowMs)
    .next.filter(x => mine(x.id) && !x.stuck.length && !(view.tasks.find(t => t.id === x.id)?.branch))
    .slice(0, BRANCH_NEW_MAX)
    .map((x): BranchItem => ({ id: x.id, kind: 'new' }))
  const byId = (a: BranchItem, b: BranchItem) => num(a.id) - num(b.id)
  return [...open.sort(byId), ...merged, ...next]
}

/** The text after a row's mark, longest first: " T-721  +3 commits · 1 behind" (warning past BRANCH_BEHIND_WARN), then shorter. */
function branchLabels(x: BranchItem, nowMs: number): LiveSeg[][] {
  const id: LiveSeg = { text: ` ${x.id}`, tone: 'id' }
  if (x.kind === 'merged') {
    const time = rowDuration(Math.max(0, nowMs - (x.atMs ?? nowMs)))
    const sha = x.merged ? x.merged.slice(0, 7) : ''
    return [
      ...(sha ? [[id, { text: `  merged ${time} ago (${sha})`, tone: 'dim' as const }]] : []),
      [id, { text: `  merged ${time} ago`, tone: 'dim' }],
      [id, { text: ` merged ${time}`, tone: 'dim' }],
    ]
  }
  if (x.kind === 'new') return [[id, { text: '  not started', tone: 'dim' }]]
  const { ahead, behind } = x.fig!
  const late: LiveTone = behind > BRANCH_BEHIND_WARN ? 'warning' : 'dim'
  const dot: LiveSeg = { text: ' · ', tone: 'dim' }
  const st = x.state
  // T-913: the state after the id ("‖ paused"); when narrow the word goes first, the mark stays
  const word: LiveSeg[] = st ? [{ text: ` ${st.mark} ${st.word}`, tone: st.tone }, dot] : [{ text: ' ', tone: 'dim' }]
  const mark: LiveSeg[] = st ? [{ text: ` ${st.mark}`, tone: st.tone }, { text: ' ', tone: 'dim' }] : [{ text: ' ', tone: 'dim' }]
  const long: LiveSeg[] = [{ text: `+${plural(ahead, 'commit')}`, tone: 'text' }, dot, { text: `${behind} behind`, tone: late }]
  const mid: LiveSeg[] = [{ text: `+${ahead}`, tone: 'text' }, dot, { text: `${behind} behind`, tone: late }]
  return [
    [id, ...word, ...long],
    [id, ...mark, ...long],
    [id, ...word, ...mid],
    [id, ...mark, ...mid],
    [id, ...mark, { text: `+${ahead}`, tone: 'text' }, { text: ` ↓${behind}`, tone: late }],
  ]
}
const LABEL_ROOM = textWidth(' T-000 ‖ +0 · 0 behind')

/**
 * The Branches section (see above) for the view's branch figures in `width` columns, or null when there are none
 * (git isn't ready, or not read yet). The main line shows up to BRANCH_COMMITS of the newest commits, fewer and closer
 * when narrow, so each row keeps room for its words; a row hangs from the commit its branch forked from (a just-merged
 * task from its merge commit, else the newest), or from the leftmost commit when that one isn't shown (and a task not
 * started). Rows are ordered so their lines never cross; past BRANCH_ROWS_MAX rows, "+N more". The heading is in
 * `width`, the lines under it in liveInner(width) (words are cut with "…"), for the client to indent (LIVE_INDENT).
 */
export function liveBranches(view: LiveView, nowMs: number, width: number): LiveBranches | null {
  return liveBranchBlocks(view, nowMs, width)[0] ?? null
}

/**
 * T-1199: the Branches section as one block per repo (a board with no projects has one block, drawn as ever; its
 * `repoHead` is absent). Each block is a liveBranches-shaped section: its main line is its own repo's, its rows hang off
 * that line, and (with several repos or projects) `repoHead` names the repo and the branch its tasks merge into.
 * Only repos with open or just-merged tasks have a block; the clients draw the heading once, above the first.
 */
export function liveBranchBlocks(view: LiveView, nowMs: number, width: number): LiveBranches[] {
  const facts = view.branches
  if (!facts) return []
  if (!facts.repos) return [branchBlock(view, facts, nowMs, width)].flatMap(x => (x ? [x] : []))
  return facts.repos.flatMap(r => {
    const x = branchBlock(view, r, nowMs, width, r.project)
    if (!x) return []
    const head: LiveSeg[] = [{ text: ` ${r.name}`, tone: 'title' }, { text: ` · merges into ${r.into}`, tone: 'dim' }]
    return [{ ...x, repoHead: head }]
  })
}

function branchBlock(view: LiveView, facts: Pick<BranchFacts, 'into' | 'commits' | 'tasks'>, nowMs: number, width: number, project?: string): LiveBranches | null {
  if (!facts.commits.length) return null
  const full = Math.max(1, Math.floor(width))
  const w = liveInner(full)
  const items = branchItems(view, facts, nowMs, project)
  if (!items.length) return null
  const kept = items.slice(0, BRANCH_ROWS_MAX)
  const hidden = items.length - kept.length
  const nameW = Math.min(12, Math.max(4, textWidth(facts.into)))
  const n = Math.min(BRANCH_COMMITS, facts.commits.length)
  // the most commits, then the widest step, that leave each row room for its words
  let pick: { k: number; step: number; indent: number } | undefined
  for (const gap of [3, 1])
    for (let k = n; k >= Math.min(2, n) && !pick; k--)
      for (const step of [4, 3, 2]) {
        const indent = 1 + nameW + gap
        if (indent + 1 + (k - 1) * step + 2 + LABEL_ROOM <= w) {
          pick = { k, step, indent }
          break
        }
      }
  const { k, step, indent } = pick ?? { k: Math.min(2, n), step: 2, indent: 1 + nameW + 1 }
  const shown = facts.commits.slice(0, k).reverse()
  const trackW = 1 + (k - 1) * step
  const markAt = trackW + 1
  const colOf = (sha: string | undefined, none: number) => {
    const i = sha ? shown.findIndex(c => c.sha === sha || (sha.length >= 7 && c.sha.startsWith(sha))) : -1
    return i >= 0 ? i : none
  }
  const placed = kept.map(x => ({ x, col: x.kind === 'merged' ? colOf(x.merged, 0) : x.kind === 'branch' ? colOf(x.fig!.base, 0) : 0 }))
  // same commit: the open tasks first, then the finished ones (newest first), then the ones not started
  const rank = (x: BranchItem) => (x.kind === 'branch' ? 0 : x.kind === 'merged' ? 1 : 2)
  placed.sort((a, b) => b.col - a.col || rank(a.x) - rank(b.x) || (b.x.atMs ?? 0) - (a.x.atMs ?? 0) || num(a.x.id) - num(b.x.id))
  // the header
  const head = liveHeading(LIVE_SECTIONS.branches, full)
  // the main line
  const newest = shown[shown.length - 1]!
  const sha = newest.sha.slice(0, 7)
  const room = w - indent - trackW
  const right = [`   ${sha} · ${agoText(nowMs - newest.at)}`, `  ${sha}`, ''].find(s => textWidth(s) <= room) ?? ''
  const name = cutTitle(facts.into, nameW)
  const track: LiveSeg[] = []
  shown.forEach((_, i) => {
    if (i) track.push({ text: '─'.repeat(step - 1), tone: 'dim' })
    track.push({ text: '●', tone: 'bar' })
  })
  const main = fitSegs<LiveSeg>([{ text: ` ${padWidth(name, indent - 1)}`, tone: 'title' }, ...track, ...(right ? [{ text: right, tone: 'dim' as const }] : [])], w)
  // the rows
  const rows: BranchRow[] = placed.map(({ x, col }, i) => {
    const below = placed.slice(i + 1).map(p => p.col)
    const tee = below.includes(col)
    const cells = Array.from({ length: markAt }, () => ' ')
    for (const c of below) cells[c * step] = '│'
    cells[col * step] = tee ? '├' : '╰'
    for (let c = col * step + 1; c < markAt; c++) cells[c] = '─'
    const graph = cells.join('')
    const mark: LiveSeg = { text: x.kind === 'merged' ? '◀' : '○', tone: x.kind === 'merged' ? 'dim' : 'future' }
    const lead: LiveSeg[] = [{ text: ' '.repeat(indent), tone: 'text' }, { text: graph, tone: 'dim' }, mark]
    const leadW = textWidth(segText(lead))
    const labels = branchLabels(x, nowMs)
    const label = labels.find(l => leadW + textWidth(segText(l)) <= w) ?? fitSegs(labels[labels.length - 1]!, Math.max(0, w - leadW))
    return { id: x.id, kind: x.kind, col, lines: below, tee, segs: fitSegs([...lead, ...label], w), label }
  })
  if (hidden) rows.push({ kind: 'more', col: 0, lines: [], tee: false, segs: [{ text: fitText(`${' '.repeat(indent)}+${hidden} more`, w), tone: 'dim' }], label: [{ text: `+${hidden} more`, tone: 'dim' }] })
  return { head, main, name, commits: shown, step, indent, right: right.trim(), rows }
}
