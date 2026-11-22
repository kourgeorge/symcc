// T-761: the task page's Branch section: the task's branch drawn against the branch it merges into, in the Live tab's
// Branches look (core/live.ts: its "●───●" line, its colors, its "2 min ago"):
//
//  ▍Branch  symcc/T-733 · 3 commits · 10 behind main
//     main   ●───●───●───●───●───●───●───●   447d3c8 · just now
//            │ 14:42           ⇣ caught up 15:50
//            ╰──●────────●─────┴──●
//               638235d  a077ff8  4825c84
//               try 2    try 4    try 6
//
// main's line on top (its commits since the fork, the newest one's sha and age), the fork point with its time, the
// task's own commits under it (each one's short sha and the try that made it), a "⇣ caught up" mark for each merge of
// main into the branch, and for a merged task the line going back up into main ("╯ merged 15:50 (4825c84)"). A long
// history keeps its latest commits and says "… N earlier". The figures come from git, read by the app side
// (hooks/app/branches.ts's taskBranchFacts) away from drawing.
import type { SymccTask } from '../../types'
import type { Seg } from './details'
import { agoText, type BranchCommit, LIVE_INDENT, LIVE_TONE, liveInner } from './live'
import { cutTitle, fitSegs, padWidth, textWidth } from './width'
import { historyTime } from './history'
import { taskCommits } from './commits'

/** One commit on the task's branch (its first-parent line): its full sha, when it was made (ms), the try that made it
 *  (its Symcc-Try line), and whether it is a merge of the main branch into it (a catch-up). */
export type TaskBranchCommit = { sha: string; at: number; try?: number; catchUp?: boolean }

/**
 * What git says of one task's branch (T-761): the branch and the one it merges into (`into`), into's newest commit
 * (`tip`), where the branch left it (`fork`), into's commits since then that are not the task's (`main`, oldest first,
 * at most TASK_BRANCH_MAIN), the branch's own commits and catch-ups (`commits`, oldest first), how far it is ahead of
 * and behind `into` (an open branch), the commit that landed (`merged`, a merged task), and when it was read.
 */
export type TaskBranchFacts = { branch: string; into: string; tip: BranchCommit; fork?: BranchCommit; main: BranchCommit[]; commits: TaskBranchCommit[]; ahead?: number; behind?: number; merged?: BranchCommit; at: number }

/** How many of into's commits since the fork are read (older ones are left out of the picture). */
export const TASK_BRANCH_MAIN = 40
/** How many of the branch's commits are read. */
export const TASK_BRANCH_COMMITS = 100

/** The columns a commit's sha takes under its dot, and the least room from one commit of the task to the next. */
const SHA = 7
const OWN_GAP = SHA + 2

type Ev = { kind: 'main' | 'own' | 'catch' | 'merged'; at: number; sha: string; try?: number }
type Placed = Ev & { x: number }

/** A time as the section says it: "14:42" today, else "Nov 19". */
export const branchTime = (ms: number, nowMs: number): string => {
  const t = historyTime(new Date(ms).toISOString(), nowMs)
  return t.replace(/^(\w{3} \d{1,2}) \d\d:\d\d$/, '$1')
}

/** The section's heading (without "▍"): "Branch  symcc/T-733 · 3 commits · 10 behind main" (or "up to date", or "merged into main"). */
export function taskBranchTitle(f: TaskBranchFacts): string {
  const own = f.commits.filter(c => !c.catchUp).length
  const state = f.merged ? `merged into ${f.into}` : f.behind ? `${f.behind} behind ${f.into}` : 'up to date'
  return `Branch  ${f.branch} · ${own} commit${own === 1 ? '' : 's'} · ${state}`
}

/** A line of cells (one character each, with its color) made into pieces of one color. */
function cellSegs(cells: { ch: string; color: string }[]): Seg[] {
  const out: Seg[] = []
  for (const c of cells) {
    const last = out[out.length - 1]
    if (last && last.color === c.color) last.text += c.ch
    else out.push({ text: c.ch, color: c.color })
  }
  return out
}

/**
 * The section's lines for task `t` in `width` columns (see the top of this file), each starting with LIVE_INDENT and
 * none wider than `width`. Its commits get their try from the task's runs (the commits each try saved), else from the
 * commit's own Symcc-Try line. A failed or dropped task's line is dim.
 */
export function taskBranchLines(t: Pick<SymccTask, 'status' | 'runs' | 'merged'>, f: TaskBranchFacts, nowMs: number, width: number): Seg[][] {
  const inner = liveInner(width)
  const dim = t.status === 'failed' || t.status === 'dropped'
  const tries = new Map(taskCommits(t).filter(c => c.try !== undefined).map(c => [c.sha, c.try!]))
  const taskShas = new Set(f.commits.map(c => c.sha))
  // the events, oldest first: main's commits, the branch's own commits and catch-ups, the merge
  const evs: Ev[] = [
    ...f.main.filter(c => !taskShas.has(c.sha)).map((c): Ev => ({ kind: 'main', at: c.at, sha: c.sha })),
    ...f.commits
      .filter(c => !(f.merged && c.catchUp && c.sha === f.merged.sha))
      .map((c): Ev => ({ kind: c.catchUp ? 'catch' : 'own', at: c.at, sha: c.sha, ...(tries.get(c.sha) ?? c.try ? { try: tries.get(c.sha) ?? c.try } : {}) })),
  ]
  const order = { main: 0, catch: 1, own: 2, merged: 3 }
  evs.sort((a, b) => a.at - b.at || order[a.kind] - order[b.kind])
  if (f.merged) evs.push({ kind: 'merged', at: Math.max(f.merged.at, evs[evs.length - 1]?.at ?? -Infinity), sha: f.merged.sha })
  // main commits after the merge come after it
  const mergedAt = evs.findIndex(e => e.kind === 'merged')
  if (mergedAt >= 0) {
    const late = evs.filter((e, i) => i < mergedAt && e.kind === 'main' && f.merged && e.at > f.merged.at)
    if (late.length) {
      const rest = evs.filter(e => !late.includes(e))
      evs.splice(0, evs.length, ...rest, ...late)
    }
  }
  const ownAll = evs.filter(e => e.kind === 'own')
  const name = cutTitle(f.into, 12)
  const indent = Math.max(4, textWidth(name)) + 3
  const mergedLabels = f.merged ? [` merged ${branchTime(f.merged.at, nowMs)} (${f.merged.sha.slice(0, SHA)})`, ` merged (${f.merged.sha.slice(0, SHA)})`, ' merged'] : []

  /** The events placed with `step` columns between dots, at most `keep` main dots in a row, the first `cut` own commits left out. */
  const place = (step: number, keep: number, cut: number): { placed: Placed[]; need: number; mainNeed: number } => {
    let list = evs
    if (cut > 0) {
      const first = evs.indexOf(ownAll[cut]!)
      list = evs.slice(first)
    }
    // at most `keep` main dots in a row (the newest of each run)
    const kept: Ev[] = []
    let run: Ev[] = []
    const flush = () => (kept.push(...run.slice(Math.max(0, run.length - keep))), (run = []))
    for (const e of list) {
      if (e.kind === 'main') run.push(e)
      else (flush(), kept.push(e))
    }
    flush()
    const placed: Placed[] = []
    let x = 0
    let lastOwn = -Infinity
    for (const e of kept) {
      x += step
      if (e.kind === 'own') (x = Math.max(x, lastOwn + OWN_GAP)), (lastOwn = x)
      placed.push({ ...e, x })
    }
    const end = placed.length ? placed[placed.length - 1]!.x : 0
    const m = placed.find(p => p.kind === 'merged')
    const need = indent + Math.max(lastOwn + SHA, m ? m.x + 1 + textWidth(mergedLabels[0]!) : 0, step + 2 + textWidth(' no commits yet'))
    return { placed, need, mainNeed: indent + end + 1 }
  }
  // the fewest commits left out, then the most main dots, then room for main's "sha · age" on its line, then the
  // widest step that fit
  const rightW = textWidth(`   ${f.tip.sha.slice(0, SHA)} · ${agoText(nowMs - f.tip.at)}`)
  let pick: { placed: Placed[]; cut: number } | undefined
  let last: { placed: Placed[]; cut: number } | undefined
  for (let cut = 0; cut < Math.max(1, ownAll.length) && !pick; cut++)
    for (const keep of [Infinity, 6, 3, 1, 0]) {
      for (const extra of [rightW, 0]) {
        for (const step of [4, 3, 2]) {
          const p = place(step, keep, cut)
          last = { placed: p.placed, cut }
          if (p.need <= inner && p.mainNeed + extra <= inner) {
            pick = last
            break
          }
        }
        if (pick) break
      }
      if (pick) break
    }
  const { placed, cut } = pick ?? last!
  const cutStart = cut > 0
  const end = placed.length ? placed[placed.length - 1]!.x : 0
  const branchEvs = placed.filter(p => p.kind !== 'main')
  const branchEnd = branchEvs.length ? branchEvs[branchEvs.length - 1]!.x : 0
  const line = LIVE_TONE.dim
  const bTone = (color: string) => (dim ? LIVE_TONE.dim : color)
  const cells = (n: number) => Array.from({ length: n }, () => ({ ch: ' ', color: 'text' }))
  const lead = (): Seg => ({ text: LIVE_INDENT + ' '.repeat(indent), color: 'text' })

  // main's line: its name, the dots, the newest commit and its age
  const mainCells = cells(end + 1).map(() => ({ ch: '─', color: line }))
  mainCells[0] = cutStart ? { ch: '┄', color: line } : { ch: '●', color: LIVE_TONE.bar }
  for (const p of placed) if (p.kind === 'main' || p.kind === 'merged') mainCells[p.x] = { ch: '●', color: LIVE_TONE.bar }
  const tipSha = f.tip.sha.slice(0, SHA)
  const room = inner - indent - (end + 1)
  const right = [`   ${tipSha} · ${agoText(nowMs - f.tip.at)}`, `  ${tipSha}`, ''].find(s => textWidth(s) <= room) ?? ''
  const mainLine: Seg[] = [{ text: LIVE_INDENT + padWidth(name, indent), color: LIVE_TONE.title }, ...cellSegs(mainCells), ...(right ? [{ text: right, color: LIVE_TONE.dim }] : [])]

  // the line between: the fork (│ and its time), each catch-up (⇣ caught up 15:50), the merge (│)
  type Mark = { x: number; ch: string; color: string; labels: string[]; labelColor: string }
  const marks: Mark[] = []
  marks.push(cutStart ? { x: 0, ch: '┊', color: line, labels: [''], labelColor: LIVE_TONE.dim } : { x: 0, ch: '│', color: line, labels: f.fork ? [` ${branchTime(f.fork.at, nowMs)}`, ''] : [''], labelColor: LIVE_TONE.dim })
  for (const p of placed) {
    if (p.kind === 'catch') marks.push({ x: p.x, ch: '⇣', color: bTone(LIVE_TONE.bar), labels: [` caught up ${branchTime(p.at, nowMs)}`, ` ${branchTime(p.at, nowMs)}`, ''], labelColor: LIVE_TONE.dim })
    if (p.kind === 'merged') marks.push({ x: p.x, ch: '│', color: bTone(LIVE_TONE.passed), labels: [''], labelColor: LIVE_TONE.dim })
  }
  const midSegs: Seg[] = []
  let at = 0
  marks.forEach((m, i) => {
    const limit = (marks[i + 1]?.x ?? inner - indent + 1) - 1
    if (m.x > at) midSegs.push({ text: ' '.repeat(m.x - at), color: 'text' })
    midSegs.push({ text: m.ch, color: m.color })
    const label = m.labels.find(l => m.x + 1 + textWidth(l) <= limit || !l) ?? ''
    if (label) midSegs.push({ text: label, color: m.labelColor })
    at = m.x + 1 + textWidth(label)
  })
  const midLine: Seg[] = [lead(), ...midSegs]

  // the task's line: from the fork, a dot per own commit, ┴ under each catch-up, ╯ up into main at the merge
  const bCells = cells(branchEnd + 1).map(() => ({ ch: '─', color: bTone(line) }))
  bCells[0] = { ch: cutStart ? '┄' : '╰', color: bTone(line) }
  for (const p of branchEvs) bCells[p.x] = p.kind === 'own' ? { ch: '●', color: bTone(LIVE_TONE.current) } : p.kind === 'catch' ? { ch: '┴', color: bTone(line) } : { ch: '╯', color: bTone(LIVE_TONE.passed) }
  const mergedRoom = inner - indent - (branchEnd + 1)
  const mergedLabel = mergedLabels.find(l => textWidth(l) <= mergedRoom) ?? ''
  const branchLine: Seg[] = [
    lead(),
    ...cellSegs(branchEvs.length ? bCells : [...bCells, { ch: '─', color: bTone(line) }]),
    ...(mergedLabel ? [{ text: mergedLabel, color: bTone(LIVE_TONE.passed) }] : []),
    ...(!branchEvs.length ? [{ text: ' no commits yet', color: LIVE_TONE.dim }] : []),
  ]

  // under each own commit: its sha, then the try that made it
  const own = placed.filter(p => p.kind === 'own')
  const under = (text: (p: Placed) => string, color: string): Seg[] | null => {
    const parts: Seg[] = []
    let pos = 0
    for (const p of own) {
      const s = text(p)
      if (!s) continue
      if (p.x > pos) parts.push({ text: ' '.repeat(p.x - pos), color: 'text' })
      parts.push({ text: s, color: bTone(color) })
      pos = p.x + textWidth(s)
    }
    return parts.length ? [lead(), ...parts] : null
  }
  const shas = under(p => p.sha.slice(0, SHA), LIVE_TONE.text)
  const tryLine = under(p => (p.try ? `try ${p.try}` : ''), LIVE_TONE.dim)
  const earlier: Seg[] | null = cut > 0 ? [lead(), { text: `… ${cut} earlier`, color: LIVE_TONE.dim }] : null
  return [mainLine, midLine, branchLine, ...[shas, tryLine, earlier].filter((x): x is Seg[] => !!x)].map(l => fitSegs(l, Math.max(1, Math.floor(width))))
}
