// The merge refuses a worker's whole try when it changed a file outside its task (hooks/app/review.ts, outOfScope).
// In Claude Code symcc's guard refuses such an edit before it runs (hooks/app/ask.ts). Cursor's agents have no hook
// before a call, so the Cursor host looks when a worker's turn ends and, finding any, has it undo them before it hands
// back (agents.ts handBack). The rule is the merge's own: the task's files, plus the throwaway .scratch/ where the
// project keeps nothing there in git (its info/exclude line keeps it out of what git lists).
import type { Host } from '../../hooks/host'
import { find, intoOf, isInvestigation, outOfScope } from '../../hooks/board'
import { S, workers } from '../../hooks/app/state'
import { load } from '../../hooks/app/store'
import { git } from '../../hooks/app/git'

/** How many files the note to the worker names. */
const NAMED = 10

/** Every file worker folder `dir` changed since it left branch `target`: in its commits, and not committed yet (new files too). */
export async function changedInFolder($: Host, dir: string, target: string): Promise<{ base: string; files: string[] }> {
  const list = async (args: string[]) => {
    const r = await git($, args, dir)
    if (r.exitCode !== 0) throw new Error(`git ${args[0]}: ${(r.stderr || r.stdout).trim().slice(0, 200)}`)
    return r.stdout.split('\0').map(f => f.replace(/^\n+/, '')).filter(Boolean)
  }
  const main = (await git($, ['rev-parse', '--verify', '-q', `refs/heads/${target}`], dir)).stdout.trim()
  const base = (main && (await git($, ['merge-base', main, 'HEAD'], dir)).stdout.trim()) || 'HEAD'
  const files = new Set([
    ...(base === 'HEAD' ? [] : await list(['log', '--cc', '--format=', '--name-only', '--no-renames', '-z', `${base}..HEAD`])),
    ...(await list(['diff', '--name-only', '--no-renames', '-z', 'HEAD'])),
    ...(await list(['ls-files', '--others', '--exclude-standard', '-z'])),
  ])
  return { base, files: [...files] }
}

/** What a worker is told when its folder holds changes to `bad`, outside its task's files `allowed`. */
export function outsideTaskText(bad: readonly string[], allowed: readonly string[], base: string): string {
  const named = bad.slice(0, NAMED).join(', ') + (bad.length > NAMED ? ` and ${bad.length - NAMED} more` : '')
  const at = base === 'HEAD' ? 'HEAD' : base.slice(0, 12)
  return [
    `Before you hand back: you changed files outside this task's files, and symcc's merge refuses the whole try while any of them is left: ${named}.`,
    `This task may change only ${allowed.join(', ')}.`,
    `Undo them now. Delete the files you added there (helper scripts and notes too), and put back the ones you changed or deleted with \`git checkout ${at} -- <file>\` (also when you committed them already; then commit again).`,
    'For throwaway files use a folder outside the project, such as /tmp.',
    "If the task needs one of these files, undo it anyway and say so in your report, so the lead can add it to the task's files.",
    'Then end your turn with your report, as before.',
  ].join(' ')
}

/** What worker `agentId` is told before it hands back, when it changed files outside its task; nothing otherwise. */
export async function handBackNote($: Host, agentId: string): Promise<string | undefined> {
  const w = workers.get(agentId)
  if (!w) return undefined
  const t = find(await load($), w.task)
  if (!t || isInvestigation(t) || !t.files.length) return undefined
  const { base, files } = await changedInFolder($, w.worktree, intoOf(t))
  const bad = outOfScope(files, t.files, S.N.dir)
  return bad.length ? outsideTaskText(bad, t.files, base) : undefined
}
