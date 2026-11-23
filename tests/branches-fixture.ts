// T-727: a sample board for the Live tab's Branches section, the same in the core, terminal, VS Code and OpenCode
// tests: main's 9 latest commits (c1 newest), T-721 in doing 3 ahead / 1 behind (forked at c2), T-725 in review 0 ahead
// / 4 behind (forked at c5), T-726 next up in todo with no branch yet, and T-724 merged (at c1) 3 minutes before `now`.
import type { BranchFacts } from '../hooks/core/live'
import type { TaskBranchFacts } from '../hooks/core/task-branch'

/** A commit's full sha: "c1" → "c1c1c1…" (40 characters). */
export const sha = (name: string) => name.repeat(40 / name.length)

/** The sample tasks at `now` (ms). */
export function branchTasks(now: number) {
  const iso = (sec: number) => new Date(now - sec * 1000).toISOString()
  const task = (id: string, title: string, x: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status: 'doing', note: '', order: Number(id.slice(2)), after: [], attempts: 1, history: [], branch: null, created_at: iso(9000), updated_at: iso(60), ...x })
  return [
    task('T-721', 'Record which test failed', { branch: 'symcc/T-721', runs: [{ started: iso(600) }] }),
    task('T-725', 'Guide: Live tab', { status: 'review', branch: 'symcc/T-725' }),
    task('T-726', 'Text fixes after org-mem', { status: 'todo' }),
    task('T-724', 'Merged just now', { status: 'done', branch: 'symcc/T-724', merged: sha('c1'), history: [{ kind: 'merged', at: iso(180), text: 'try 1 → merged into main' }] }),
  ]
}

/** The sample's branch figures at `now`, as app/branches.ts reads them. */
export function branchFactsAt(now: number): BranchFacts {
  return {
    into: 'main',
    commits: Array.from({ length: 9 }, (_, i) => ({ sha: sha(`c${i + 1}`), at: now - (2 + i * 10) * 60_000 })),
    tasks: { 'T-721': { ahead: 3, behind: 1, base: sha('c2') }, 'T-725': { ahead: 0, behind: 4, base: sha('c5') } },
    at: now,
  }
}

// T-761: one task's branch for its page's Branch section, at `now` (ms): T-733 in doing with 3 commits from tries 2, 4
// and 6, main merged in (caught up) at the start of try 6, and 10 of main's commits behind; the same work merged (the
// merge-time catch-up "cd" landed on main); and a long history of 14 commits.
const min = 60_000
/** main's commits since the fork, oldest first: e1..e4 before the catch-up, e5..ee (10) after it. */
const mainSince = (now: number) => {
  const names = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9', 'ea', 'eb', 'ec', 'ed', 'ee']
  const at = [140, 125, 120, 115, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10]
  return names.map((n, i) => ({ sha: sha(n), at: now - at[i]! * min }))
}
/** The doing task's facts, as app/branches.ts's readTaskBranch reads them. */
export function taskBranchDoing(now: number): TaskBranchFacts {
  const main = mainSince(now)
  return {
    branch: 'symcc/T-733', into: 'main', tip: main[main.length - 1]!, fork: { sha: sha('f0'), at: now - 150 * min }, main,
    commits: [
      { sha: sha('638235d0'), at: now - 145 * min, try: 2 },
      { sha: sha('a077ff80'), at: now - 130 * min, try: 4 },
      { sha: sha('cc'), at: now - 110 * min, try: 6, catchUp: true },
      { sha: sha('4825c840'), at: now - 105 * min, try: 6 },
    ],
    ahead: 4, behind: 10, at: now,
  }
}
/** The same work merged: the merge-time catch-up (cd) is the merged commit; one of main's commits (ef) came after. */
export function taskBranchMerged(now: number): TaskBranchFacts {
  const d = taskBranchDoing(now)
  const tip = { sha: sha('ef'), at: now - 2 * min }
  return { ...d, ahead: undefined, behind: undefined, tip, main: [...d.main, tip], commits: [...d.commits, { sha: sha('cd'), at: now - 5 * min, try: 6, catchUp: true }], merged: { sha: sha('cd'), at: now - 5 * min } } as TaskBranchFacts
}
/** A long history: 14 commits, one per try. */
export function taskBranchLong(now: number): TaskBranchFacts {
  const d = taskBranchDoing(now)
  const hex = '0123456789abcdef'
  return { ...d, commits: Array.from({ length: 14 }, (_, i) => ({ sha: sha(`b${hex[i]}`), at: now - (148 - i * 10) * min, try: i + 1 })), ahead: 14 }
}
/** The tasks the samples are for: T-733 doing (tries 2, 4, 6), T-734 merged, T-735 long, T-736 to do with no branch. */
export function taskBranchTasks(now: number) {
  const iso = (m: number) => new Date(now - m * min).toISOString()
  const task = (id: string, title: string, x: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status: 'doing', note: '', order: Number(id.slice(2)), after: [], attempts: 6, history: [], branch: `symcc/${id}`, created_at: iso(200), updated_at: iso(1), ...x })
  return [
    task('T-733', 'Draw the branch on the task page'),
    task('T-734', 'Merged branch', { status: 'done', merged: sha('cd'), history: [{ kind: 'merged', at: iso(5), text: 'try 6 → merged into main' }] }),
    task('T-735', 'A long history', { attempts: 14 }),
    task('T-736', 'Not started', { status: 'todo', attempts: 0, branch: null }),
  ]
}

/** The lines the sample draws at 100 columns: the "BRANCHES" heading (T-789, T-810: UPPERCASE, then a thin rule to the width; the Live tab puts an empty line under it), the lines under it indented by 1 (T-767). */
export const BRANCH_LINES_100 = [
  `BRANCHES ${'─'.repeat(91)}`,
  '  main   ●───●───●───●───●───●───●   c1c1c1c · 2 min ago',
  '         │       │           │   ╰─◀ T-724  merged 3m ago (c1c1c1c)',
  '         │       │           ╰─────○ T-721 ▶ running · +3 commits · 1 behind',
  '         │       ╰─────────────────○ T-725 ◆ in review · +0 commits · 4 behind',
  '         ╰─────────────────────────○ T-726  not started',
]

// T-913: a branch row per state a branch row is drawn for (BRANCH_STATUSES): T-5 failed, T-6 waiting, T-7 in review,
// T-8 running (in its test step), T-47 paused; each 1 ahead and 155 behind, forked at the newest commit.
/** The state sample's tasks at `now` (ms). */
export function branchStateTasks(now: number) {
  const iso = (sec: number) => new Date(now - sec * 1000).toISOString()
  const task = (id: string, status: string, x: Record<string, unknown> = {}) => ({ id, title: `A ${status} task`, details: '', files: [], status, note: '', order: Number(id.slice(2)), after: [], attempts: 1, history: [], branch: `symcc/${id}`, created_at: iso(9000), updated_at: iso(60), ...x })
  return [
    task('T-5', 'failed'),
    task('T-6', 'waiting'),
    task('T-7', 'review'),
    task('T-8', 'doing', { runs: [{ started: iso(600), ended: iso(120) }], live: { checking: { step: 'testing', at: iso(30) } } }),
    task('T-47', 'paused'),
  ]
}
/** The state sample's branch figures at `now`. */
export function branchStateFactsAt(now: number): BranchFacts {
  const f = branchFactsAt(now)
  return { ...f, tasks: Object.fromEntries(['T-5', 'T-6', 'T-7', 'T-8', 'T-47'].map(id => [id, { ahead: 1, behind: 155, base: sha('c1') }])) }
}
/** The state sample's rows at 100 columns (after the heading and the main line). */
export const BRANCH_STATE_ROWS_100 = [
  '                                 ├─○ T-5 ✗ failed · +1 commit · 155 behind',
  '                                 ├─○ T-6 ? waiting · +1 commit · 155 behind',
  '                                 ├─○ T-7 ◆ in review · +1 commit · 155 behind',
  '                                 ├─○ T-8 ⊛ test · +1 commit · 155 behind',
  '                                 ╰─○ T-47 ‖ paused · +1 commit · 155 behind',
]
