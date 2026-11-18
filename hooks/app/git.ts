import type { SymccTask } from '../../types'
import { liveWorkersFor, startBranch, type Board, intoOf, type GitState, gitStateOf, noGitText, setupAskText, gitignoreWith, gitignoreBase, riskyFiles, parseLsTree, ignoreLineFor, setupDoneText, find, worktreesToRemove, branchesToDelete, cleanupText, namedReports, SCRATCH_DIR, SCRATCH_EXCLUDE } from '../board'
import { publish } from './lead'
import { S, workers, starting, finishing, approving, keptDirty, scratchUse } from './state'
import { type Host, agentState } from '../host'
import { load, change, path } from './store'
import { tellLead, noteForLead, brief } from './tell'
import { pump, agentsNow } from './workers'

// ---------------- git ----------------

/** git options that make a commit (or merge) authored by symcc: put them before the git command. */
export const asSymcc = () => ['-c', `user.name=${S.N.author.name}`, '-c', `user.email=${S.N.author.email}`]

export async function git($: Host, args: string[], cwd = S.root, timeoutMs = 120_000) {
  return $.run(['git', ...args], { cwd, timeoutMs })
}
export async function gitOk($: Host, args: string[], cwd = S.root, timeoutMs = 120_000) {
  const r = await git($, args, cwd, timeoutMs)
  if (r.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || r.stdout).trim().slice(0, 300)}`)
  return r.stdout.trim()
}

/** The branch checked out in the project, '' when none (a detached HEAD). */
export async function currentBranch($: Host): Promise<string> {
  if (!S.root) return ''
  return (await git($, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => null))?.stdout.trim() ?? ''
}

/** The project's local branches. */
export async function branchList($: Host): Promise<string[]> {
  const r = await git($, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).catch(() => null)
  return (r?.stdout ?? '').split('\n').map(x => x.trim()).filter(Boolean)
}

/** Whether `name` is a local branch. */
export async function branchExists($: Host, name: string): Promise<boolean> {
  if (!name || name.startsWith('-')) return false
  return (await git($, ['rev-parse', '--verify', '-q', `refs/heads/${name}`]).catch(() => null))?.exitCode === 0
}

/**
 * The branch a task added now merges into: the branch checked out in the main project folder; on
 * a detached checkout, the repo's main branch (see startBranch).
 */
export async function homeBranch($: Host): Promise<string> {
  if (!S.root) return 'main'
  const origin = (await git($, ['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD']).catch(() => null))?.stdout.trim() ?? ''
  return startBranch(await currentBranch($), origin, await branchList($))
}

/** Looks whether git is installed, the project is inside a git work tree, and it has a commit. */
export async function probeGit($: Host): Promise<GitState> {
  if (!S.root) return 'ok'
  const run = (args: string[]) => git($, args, S.root, 15_000).catch(() => null)
  const v = await run(['--version'])
  const hasGit = !!v && v.exitCode === 0
  const inside = hasGit && (await run(['rev-parse', '--is-inside-work-tree']))?.stdout.trim() === 'true'
  const hasHead = inside && (await run(['rev-parse', '--verify', '-q', 'HEAD']))?.exitCode === 0
  return gitStateOf({ hasGit, inside, hasHead })
}

/**
 * Whether git is ready for work (a repo with a commit). If not, nothing starts or fails: the
 * banner and status line say so, and the lead (only the driver) is told once per state: how
 * to install git, or the question whether to set up a repo.
 */
export async function gitReady($: Host, b?: Board): Promise<boolean> {
  const s = await probeGit($)
  if (s !== S.gitState) {
    S.gitState = s
    await publish($, b ?? (await load($)))
  }
  if (s === 'ok') S.toldGit = 'ok'
  else if (S.driving && S.toldGit !== s) {
    S.toldGit = s
    tellLead($, s === 'no-git' ? noGitText(S.N.name) : setupAskText(s, S.N.name))
  }
  return s === 'ok'
}

/**
 * Sets up git in the project, once the owner said yes: git init on main (if there is no repo),
 * a .gitignore with the data folder and common safe lines, and a first commit of the current
 * files, leaving out files that look like secrets or are over 50 MB (they go in .gitignore).
 * Never pushes, never adds a remote. Then the open tasks (made before there was any branch) merge into the new branch, and work starts.
 */
export async function setupGit($: Host, who: string): Promise<string> {
  if (S.settingUp) return 'git is being set up already'
  const s = await probeGit($)
  if (s === 'ok') return 'git is set up already: this folder is a git repo with commits'
  if (s === 'no-git') return noGitText(S.N.name)
  S.settingUp = true
  try {
    const init = s === 'no-repo'
    if (init) {
      const r = await git($, ['init', '-q', '-b', 'main'])
      if (r.exitCode !== 0) {
        // an old git has no -b: init, then point HEAD at main
        await gitOk($, ['init', '-q'])
        await gitOk($, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
      }
    }
    // The branch the first commit lands on: whatever HEAD points at (main after our init).
    const branch = (await git($, ['symbolic-ref', '--short', '-q', 'HEAD'])).stdout.trim() || 'main'
    // The repo's top: with an existing repo it may be above this folder.
    const top = (await gitOk($, ['rev-parse', '--show-toplevel'])) || S.root
    const ignoreFile = `${top}/.gitignore`
    const old = (await $.fs.exists(ignoreFile)) ? await $.fs.read(ignoreFile) : null
    const rel = top === S.root ? S.N.dir : `${S.root.slice(top.length + 1)}/${S.N.dir}`
    let text = gitignoreWith(old, gitignoreBase(rel))
    if (text !== (old ?? '')) await $.fs.write(ignoreFile, text)
    // Stage everything, look at what would be committed, and take out the risky files.
    await gitOk($, ['add', '-A'], top)
    const tree = await gitOk($, ['write-tree'], top)
    const left = riskyFiles(parseLsTree((await git($, ['ls-tree', '-r', '-l', '-z', tree], top)).stdout))
    if (left.length) {
      text = gitignoreWith(text, left.map(x => ignoreLineFor(x.file)))
      await $.fs.write(ignoreFile, text)
      for (let i = 0; i < left.length; i += 100) await gitOk($, ['rm', '-q', '--cached', '--ignore-unmatch', '--', ...left.slice(i, i + 100).map(x => x.file)], top)
      await gitOk($, ['add', '--', '.gitignore'], top)
    }
    const files = (await gitOk($, ['ls-files', '--cached'], top)).split('\n').filter(Boolean).length
    await gitOk($, [...asSymcc(), 'commit', '-q', '--no-verify', '--allow-empty', '-m', `Initial commit (by ${S.N.name})`], top)
    // There was no branch before, so every open task's branch was a guess: it merges into this one.
    await change($, b => ({ ...b, tasks: b.tasks.map(t => (t.status === 'done' || t.status === 'dropped' ? t : { ...t, merge_into: branch })) }))
    S.toldGit = 'ok'
    S.gitState = 'ok'
    await publish($, await load($))
    const out = setupDoneText({ init, branch, files, left, gitignore: old === null ? 'made' : text === old ? 'kept' : 'added', name: S.N.name })
    if (who !== 'the lead') noteForLead(`The owner set up git: ${brief(out)}`)
    void pump($)
    return out
  } finally {
    S.settingUp = false
  }
}

export const worktreeDir = (id: string) => `${S.root}/${S.N.worktrees}/${id}`

/** The branch task `t` works on: its own, or the usual one for its id. */
export const taskBranch = (t: Pick<SymccTask, 'id' | 'branch'>) => t.branch ?? S.N.branch(t.id)

export async function prepareWorktree($: Host, t: SymccTask, target: string) {
  const dir = worktreeDir(t.id)
  const branch = taskBranch(t)
  if (!(await $.fs.exists(`${dir}/.git`))) {
    await git($, ['worktree', 'prune'])
    const has = (await git($, ['rev-parse', '--verify', '-q', `refs/heads/${branch}`])).exitCode === 0
    if (has) await gitOk($, ['worktree', 'add', dir, branch])
    else await gitOk($, ['worktree', 'add', '-b', branch, dir, target])
  }
  await copyTypes($, dir).catch(() => false)
  await prepareScratch($, dir).catch(() => false)
  return { dir, branch }
}

/**
 * Whether the project keeps any file under SCRATCH_DIR in git in the worker folder `dir` (`git ls-files -- .scratch`
 * prints something). Then the scratch feature is off there: those are the project's own files. A git failure counts as
 * kept, so nothing is ever removed or let through on a guess.
 */
export async function scratchTracked($: Host, dir: string): Promise<boolean> {
  const r = await git($, ['ls-files', '--', SCRATCH_DIR], dir)
  return r.exitCode !== 0 || r.stdout.trim() !== ''
}

/**
 * Whether the worker folder `dir` uses its SCRATCH_DIR (T-456): worked out once (scratchTracked, when the folder is
 * made or reused) and kept in scratchUse; a folder not seen yet (after a reload) is checked then.
 */
export async function scratchOn($: Host, dir: string): Promise<boolean> {
  const known = scratchUse.get(dir)
  if (known !== undefined) return known
  const on = !(await scratchTracked($, dir))
  scratchUse.set(dir, on)
  return on
}

/**
 * Gives the worker folder `dir` an empty SCRATCH_DIR for throwaway scripts and notes (T-456): SCRATCH_EXCLUDE is added
 * to that checkout's local ignore list (the file `git rev-parse --git-path info/exclude` names; never .gitignore, so
 * nothing is committed), then the folder is cleared (clearScratch). Returns whether the folder is ready. When the
 * project keeps files under SCRATCH_DIR in git (scratchTracked), the feature is off for that folder: no line, no clearing.
 */
export async function prepareScratch($: Host, dir: string): Promise<boolean> {
  const on = !(await scratchTracked($, dir))
  scratchUse.set(dir, on)
  if (!on) return false
  const r = await git($, ['rev-parse', '--git-path', 'info/exclude'], dir)
  const where = r.exitCode === 0 ? r.stdout.trim() : ''
  if (!where) return false
  const file = where.startsWith('/') ? where : `${dir}/${where}`
  const old = await Promise.resolve().then(() => $.fs.read(file)).then(x => String(x), () => '')
  if (!old.split('\n').some(l => l.trim() === SCRATCH_EXCLUDE)) {
    if ((await $.run(['mkdir', '-p', file.slice(0, file.lastIndexOf('/')) || '/'])).exitCode !== 0) return false
    await $.fs.write(file, `${old}${old && !old.endsWith('\n') ? '\n' : ''}${SCRATCH_EXCLUDE}\n`)
  }
  return clearScratch($, dir)
}

/**
 * Empties SCRATCH_DIR in the worker folder `dir` (a try ended, or the folder is used again). Only where the project
 * keeps no file there in git (scratchTracked, asked again right before) and git in `dir` ignores it (check-ignore), so
 * the project's own files are never removed.
 */
export async function clearScratch($: Host, dir: string): Promise<boolean> {
  if (await scratchTracked($, dir)) {
    scratchUse.set(dir, false)
    return false
  }
  if ((await git($, ['check-ignore', '-q', '--', `${SCRATCH_DIR}/x`], dir)).exitCode !== 0) return false
  const to = `${dir}/${SCRATCH_DIR}`
  if ((await $.run(['rm', '-rf', to], { cwd: dir })).exitCode !== 0) return false
  return (await $.run(['mkdir', '-p', to], { cwd: dir })).exitCode === 0
}

/** The generated, git-ignored types folder the project's tsconfig.json extends. */
export const TYPES_DIR = '.claude-plugin/types'

/**
 * Gives the worker folder `dir` a fresh copy of the main folder's .claude-plugin/types (T-358): it is generated
 * and git-ignored, so a new worktree lacks it and `tsc` there falls back to loose settings. A copy, not a link,
 * so symcc's edit checks (which refuse links leading outside the folder) and git see plain files. Skipped quietly
 * when the main folder has none, and when git in `dir` would not ignore it, so it never lands in the task's
 * commit or scope check. Returns whether the folder has the copy.
 */
export async function copyTypes($: Host, dir: string): Promise<boolean> {
  const from = `${S.root}/${TYPES_DIR}`
  const to = `${dir}/${TYPES_DIR}`
  if (!(await $.fs.exists(from))) return false
  // Only where git in `dir` ignores it (exit 0; tracked files are never "ignored"): else it could land in the
  // task's commit or scope check, or the old copy removed below could be the project's own files.
  if ((await git($, ['check-ignore', '-q', '--', `${TYPES_DIR}/tsconfig.json`], dir)).exitCode !== 0) return false
  const run = async (argv: string[]) => (await $.run(argv, { cwd: dir })).exitCode === 0
  if (!(await run(['rm', '-rf', to]))) return false
  if (!(await run(['mkdir', '-p', `${dir}/.claude-plugin`]))) return false
  if (!(await run(['cp', '-R', from, to]))) {
    await run(['rm', '-rf', to])
    return false
  }
  return true
}

/**
 * Copies the report files task `t`'s details name (<data dir>/reports/<id>-try-<N>.md, e.g. a keep-note task's
 * earlier answers) from the main project into its folder `dir`, at the same path: the data dir is git-ignored, so a
 * new worktree has none, and its worker may not read the main project folder. A .gitignore of "*" in the copied data
 * dir keeps them out of the commit even where the project's .gitignore lacks it. Returns the files copied; a report
 * that can't be read is skipped.
 */
export async function copyReports($: Host, t: Pick<SymccTask, 'details'>, dir: string): Promise<string[]> {
  const files = namedReports(t.details, S.N.dir)
  if (!files.length) return []
  const copied: string[] = []
  for (const f of files) {
    const text = await Promise.resolve().then(() => $.fs.read(path(f))).then(x => String(x), () => null)
    if (text === null) continue
    if (!copied.length) {
      const mk = await $.run(['mkdir', '-p', `${dir}/${S.N.dir}/reports`])
      if (mk.exitCode !== 0) return []
      await $.fs.write(`${dir}/${S.N.dir}/.gitignore`, '*\n')
    }
    await $.fs.write(`${dir}/${f}`, text)
    copied.push(f)
  }
  return copied
}

/**
 * What task `t` already has from earlier tries: `commits`, the commits on its branch that the branch it
 * merges into doesn't have (0 when it has no branch; null when git could not tell), and `dirty`, whether
 * its folder has uncommitted changes (false when it has no folder).
 */
export async function taskWork($: Host, t: SymccTask): Promise<{ commits: number | null; dirty: boolean }> {
  const branch = taskBranch(t)
  let commits: number | null = 0
  if (await branchExists($, branch)) {
    const r = await git($, ['rev-list', '--count', `refs/heads/${intoOf(t)}..refs/heads/${branch}`]).catch(() => null)
    const n = r && r.exitCode === 0 ? Number(r.stdout.trim() || '0') : NaN
    commits = Number.isFinite(n) ? n : null
  }
  const dir = worktreeDir(t.id)
  let dirty = false
  if (await $.fs.exists(`${dir}/.git`)) {
    const st = await git($, ['status', '--porcelain'], dir).catch(() => null)
    dirty = !st || st.exitCode !== 0 || !!st.stdout.trim()
  }
  return { commits, dirty }
}

/** Throws away the uncommitted changes in task `id`'s folder (an investigation's scratch edits), if it has one. Commits stay. */
export async function resetScratch($: Host, id: string): Promise<void> {
  const dir = worktreeDir(id)
  if (!(await $.fs.exists(`${dir}/.git`))) return
  await gitOk($, ['reset', '-q', '--hard'], dir)
  await gitOk($, ['clean', '-fdq'], dir)
}

/**
 * Removes a task's worktree, but never while a live agent may still use it (`except` = the
 * worker that just finished there), and never while its work is being checked or approved and
 * merged there, unless that check itself is done with it (`ownCheck`). Returns whether it was removed.
 */
export async function removeWorktree($: Host, taskId: string, dir: string, except?: string, ownCheck = false): Promise<boolean> {
  if (!ownCheck && (finishing.has(taskId) || approving.has(taskId))) return false
  const agents = await agentsNow($)
  if (!agents) return false
  const t = find(await load($), taskId)
  if (liveWorkersFor({ id: taskId, agent: t?.agent }, agents.map(agentState), S.N.name).some(a => a.id !== except)) return false
  await git($, ['worktree', 'remove', '--force', dir])
  await git($, ['worktree', 'prune'])
  return true
}

/**
 * Part of the regular check: removes leftover worktrees of done and dropped tasks (never with
 * --force, never while a worker runs there) and deletes the branches of done tasks that git
 * lists as merged into the branch they merged into. Only the plugin's own branches (N.branch) are touched.
 */
export async function cleanupMerged($: Host, b: Board) {
  const agents = await agentsNow($)
  if (!agents) return
  const busy = new Set([...workers.values()].map(w => w.task))
  const existing: string[] = []
  for (const t of b.tasks) if ((t.status === 'done' || t.status === 'dropped') && (await $.fs.exists(`${worktreeDir(t.id)}/.git`))) existing.push(t.id)
  let dirs = 0
  for (const id of worktreesToRemove(b.tasks, existing)) {
    const t = find(b, id)
    if (busy.has(id) || starting.has(id) || finishing.has(id) || approving.has(id) || liveWorkersFor({ id, agent: t?.agent }, agents.map(agentState), S.N.name).length) continue
    const dir = worktreeDir(id)
    const st = await git($, ['status', '--porcelain'], dir)
    if (st.exitCode !== 0) continue
    if (st.stdout.trim()) {
      if (!keptDirty.has(id)) tellLead($, `Note: ${id} is ${t?.status ?? 'closed'} but its folder ${S.N.dir}/worktrees/${id} has uncommitted changes, so I left it. Remove it by hand when it is no longer needed.`)
      keptDirty.add(id)
      continue
    }
    if ((await git($, ['worktree', 'remove', dir])).exitCode === 0) dirs++
  }
  await git($, ['worktree', 'prune'])
  let branches = 0
  // Each done task merged into its own branch: ask git per branch which work branches it holds.
  for (const into of [...new Set(b.tasks.filter(t => t.status === 'done').map(intoOf))]) {
    const merged = await git($, ['branch', '--merged', into, '--format=%(refname:short)'])
    if (merged.exitCode !== 0) continue
    const done = b.tasks.filter(t => intoOf(t) === into)
    for (const br of branchesToDelete(done, merged.stdout.split('\n'), S.N.branch(''))) if ((await git($, ['branch', '-d', br])).exitCode === 0) branches++
  }
  const text = S.toldCleanup ? '' : cleanupText(branches, dirs)
  if (text) {
    S.toldCleanup = true
    tellLead($, text)
  }
}
