// T-727: a sample board for the Live tab's Branches section, the same in the core, terminal, VS Code and OpenCode
// tests: main's 9 latest commits (c1 newest), T-721 in doing 3 ahead / 1 behind (forked at c2), T-725 in review 0 ahead
// / 4 behind (forked at c5), T-726 next up in todo with no branch yet, and T-724 merged (at c1) 30 seconds before `now`.
import type { BranchFacts } from '../hooks/core/live'

/** A commit's full sha: "c1" → "c1c1c1…" (40 characters). */
export const sha = (name: string) => name.repeat(40 / name.length)

/** The sample tasks at `now` (ms). */
export function branchTasks(now: number) {
  const iso = (sec: number) => new Date(now - sec * 1000).toISOString()
  const task = (id: string, title: string, x: Record<string, unknown> = {}) => ({ id, title, details: '', files: [], status: 'doing', note: '', question: null, order: Number(id.slice(2)), after: [], attempts: 1, history: [], branch: null, created_at: iso(9000), updated_at: iso(60), ...x })
  return [
    task('T-721', 'Record which test failed', { branch: 'symcc/T-721', runs: [{ started: iso(600) }] }),
    task('T-725', 'Guide: Live tab', { status: 'review', branch: 'symcc/T-725' }),
    task('T-726', 'Text fixes after org-mem', { status: 'todo' }),
    task('T-724', 'Merged just now', { status: 'done', branch: 'symcc/T-724', merged: sha('c1'), history: [{ kind: 'merged', at: iso(30), text: 'try 1 → merged into main' }] }),
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

/** The lines the sample draws at 100 columns. */
export const BRANCH_LINES_100 = [
  ` ── Branches ${'─'.repeat(87)}`,
  ' main   ●───●───●───●───●───●───●   c1c1c1c · 2 min ago',
  '        │       │           │   ╰─◀ T-724 merged',
  '        │       │           ╰─────○ T-721  +3 commits · 1 behind',
  '        │       ╰─────────────────○ T-725  +0 commits · 4 behind',
  '        ╰─────────────────────────○ T-726  not started',
]
