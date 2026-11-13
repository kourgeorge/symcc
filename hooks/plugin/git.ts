import type { SymccTask } from '../../types'
import { emptyBoard, startBranch, type Board, missingBranchText, type GitState, gitStateOf, noGitText, setupAskText, gitignoreWith, gitignoreBase, riskyFiles, parseLsTree, ignoreLineFor, setupDoneText, find, liveWorkersFor, worktreesToRemove, branchesToDelete, cleanupText } from '../board'
import { publish } from './lead'
import { type $, S, workers, starting, finishing, approving, keptDirty } from './state'
import { load, change } from './store'
import { tellLead, noteForLead, brief } from './tell'
import { pump, agentsNow } from './workers'

// ---------------- git ----------------

export async function git($: $, args: string[], cwd = S.root, timeoutMs = 120_000) {
  return $.process.run(['git', ...args], { cwd, timeoutMs })
}
export async function gitOk($: $, args: string[], cwd = S.root, timeoutMs = 120_000) {
  const r = await git($, args, cwd, timeoutMs)
  if (r.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || r.stdout).trim().slice(0, 300)}`)
  return r.stdout.trim()
}

/** The branch checked out in the project, '' when none (a detached HEAD). */
export async function currentBranch($: $): Promise<string> {
  if (!S.root) return ''
  return (await git($, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => null))?.stdout.trim() ?? ''
}

/** The project's local branches. */
export async function branchList($: $): Promise<string[]> {
  const r = await git($, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).catch(() => null)
  return (r?.stdout ?? '').split('\n').map(x => x.trim()).filter(Boolean)
}

/** Whether `name` is a local branch. */
export async function branchExists($: $, name: string): Promise<boolean> {
  if (!name || name.startsWith('-')) return false
  return (await git($, ['rev-parse', '--verify', '-q', `refs/heads/${name}`]).catch(() => null))?.exitCode === 0
}

/** The branch a new board merges into: see startBranch. */
export async function firstBranch($: $): Promise<string> {
  if (!S.root) return emptyBoard().target_branch
  const origin = (await git($, ['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD']).catch(() => null))?.stdout.trim() ?? ''
  return startBranch(await currentBranch($), origin, await branchList($))
}

/**
 * Whether target_branch exists, so work may start. If not, nothing starts or fails: the lead
 * is told once (per branch name) and the banner and status line say so until it is fixed.
 */
export async function targetReady($: $, b: Board): Promise<boolean> {
  const ok = await branchExists($, b.target_branch)
  const note = ok ? '' : missingBranchText(b.target_branch)
  if (note !== S.missingBranch) {
    S.missingBranch = note
    await publish($, b)
  }
  if (ok) S.toldMissing = ''
  else if (S.toldMissing !== b.target_branch) {
    S.toldMissing = b.target_branch
    const some = (await branchList($)).slice(0, 5)
    tellLead($, `No work can start: the ${S.N.name} board merges into branch '${b.target_branch}', which doesn't exist in this project. Set an existing branch with ${S.N.name} settings target_branch${some.length ? ` (branches here: ${some.join(', ')})` : ''}.`)
  }
  return ok
}

/** Looks whether git is installed, the project is inside a git work tree, and it has a commit. */
export async function probeGit($: $): Promise<GitState> {
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
export async function gitReady($: $, b?: Board): Promise<boolean> {
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
 * Never pushes, never adds a remote. Then target_branch is set to the new branch and work starts.
 */
export async function setupGit($: $, who: string): Promise<string> {
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
    await gitOk($, ['-c', `user.name=${S.N.author.name}`, '-c', `user.email=${S.N.author.email}`, 'commit', '-q', '--no-verify', '--allow-empty', '-m', `Initial commit (by ${S.N.name})`], top)
    await change($, b => ({ ...b, target_branch: branch }))
    S.missingBranch = ''
    S.toldMissing = ''
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

export async function prepareWorktree($: $, t: SymccTask, target: string) {
  const dir = worktreeDir(t.id)
  const branch = t.branch ?? S.N.branch(t.id)
  if (await $.fs.exists(`${dir}/.git`)) return { dir, branch }
  await git($, ['worktree', 'prune'])
  const has = (await git($, ['rev-parse', '--verify', '-q', `refs/heads/${branch}`])).exitCode === 0
  if (has) await gitOk($, ['worktree', 'add', dir, branch])
  else await gitOk($, ['worktree', 'add', '-b', branch, dir, target])
  return { dir, branch }
}

/**
 * Removes a task's worktree, but never while a live agent may still use it (`except` = the
 * worker that just finished there), and never while its work is being checked or approved and
 * merged there, unless that check itself is done with it (`ownCheck`). Returns whether it was removed.
 */
export async function removeWorktree($: $, taskId: string, dir: string, except?: string, ownCheck = false): Promise<boolean> {
  if (!ownCheck && (finishing.has(taskId) || approving.has(taskId))) return false
  const agents = await agentsNow($)
  if (!agents) return false
  const t = find(await load($), taskId)
  if (liveWorkersFor({ id: taskId, agent: t?.agent }, agents, S.N.name).some(a => a.id !== except)) return false
  await git($, ['worktree', 'remove', '--force', dir])
  await git($, ['worktree', 'prune'])
  return true
}

/**
 * Part of the regular check: removes leftover worktrees of done and dropped tasks (never with
 * --force, never while a worker runs there) and deletes the branches of done tasks that git
 * lists as merged into the target branch. Only the plugin's own branches (N.branch) are touched.
 */
export async function cleanupMerged($: $, b: Board) {
  const agents = await agentsNow($)
  if (!agents) return
  const busy = new Set([...workers.values()].map(w => w.task))
  const existing: string[] = []
  for (const t of b.tasks) if ((t.status === 'done' || t.status === 'dropped') && (await $.fs.exists(`${worktreeDir(t.id)}/.git`))) existing.push(t.id)
  let dirs = 0
  for (const id of worktreesToRemove(b.tasks, existing)) {
    const t = find(b, id)
    if (busy.has(id) || starting.has(id) || finishing.has(id) || approving.has(id) || liveWorkersFor({ id, agent: t?.agent }, agents, S.N.name).length) continue
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
  const merged = await git($, ['branch', '--merged', b.target_branch, '--format=%(refname:short)'])
  let branches = 0
  if (merged.exitCode === 0) {
    for (const br of branchesToDelete(b.tasks, merged.stdout.split('\n'), S.N.branch(''))) if ((await git($, ['branch', '-d', br])).exitCode === 0) branches++
  }
  const text = S.toldCleanup ? '' : cleanupText(branches, dirs)
  if (text) {
    S.toldCleanup = true
    tellLead($, text)
  }
}
