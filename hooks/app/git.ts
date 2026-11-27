import type { SymccTask } from '../../types'
import { isFinished, liveWorkersFor, startBranch, type Board, intoOf, type GitState, gitStateOf, noGitText, setupAskText, gitInstallStep, gitNotice, type InstallFacts, gitignoreWith, gitignoreBase, riskyFiles, parseLsTree, ignoreLineFor, setupDoneText, find, worktreesToRemove, branchesToDelete, cleanupText, namedReports, latestReportPattern, latestReportOf,SCRATCH_DIR, SCRATCH_EXCLUDE, commitMessage, isSha, isTaskCommit } from '../board'
import { publish } from './lead'
import { S, workers, starting, finishing, approving, keptDirty, scratchUse } from './state'
import { type Host, agentState } from '../host'
import { load, change, path } from './store'
import { tellLead } from './tell'
import { pump, agentsNow } from './workers'
import { systemOf } from './voice'

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

/**
 * T-1152: the repo a task's git work happens in: its project folder (below the board folder) when it has one, else the
 * board folder. Every git call that belongs to a task takes its folder from here.
 */
export const repoOf = (t?: object | null): string => {
  const pj = (t as { project?: unknown } | null | undefined)?.project
  const p = typeof pj === 'string' ? pj.trim() : ''
  return p ? `${S.root}/${p}` : S.root
}

/** The branch checked out in the project, '' when none (a detached HEAD). */
export async function currentBranch($: Host, cwd = S.root): Promise<string> {
  if (!S.root) return ''
  return (await git($, ['symbolic-ref', '--short', '-q', 'HEAD'], cwd).catch(() => null))?.stdout.trim() ?? ''
}

/** The project's local branches. */
export async function branchList($: Host, cwd = S.root): Promise<string[]> {
  const r = await git($, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], cwd).catch(() => null)
  return (r?.stdout ?? '').split('\n').map(x => x.trim()).filter(Boolean)
}

/** Whether `name` is a local branch. */
export async function branchExists($: Host, name: string, cwd = S.root): Promise<boolean> {
  if (!name || name.startsWith('-')) return false
  return (await git($, ['rev-parse', '--verify', '-q', `refs/heads/${name}`], cwd).catch(() => null))?.exitCode === 0
}

/**
 * The branch a task added now merges into: the branch checked out in the main project folder; on
 * a detached checkout, the repo's main branch (see startBranch).
 */
export async function homeBranch($: Host, cwd = S.root): Promise<string> {
  if (!S.root) return 'main'
  const cur = await currentBranch($, cwd)
  if (cur) return startBranch(cur, '', [])
  // a detached HEAD: only now are the origin head and the branch list needed
  const origin = (await git($, ['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD'], cwd).catch(() => null))?.stdout.trim() ?? ''
  return startBranch('', origin, await branchList($, cwd))
}

/** Whether `git --version` output says the Mac's command-line tools are missing (the /usr/bin/git stub). */
export const macToolsMissing = (out: string) => /xcrun: error: invalid active developer path|No developer tools were found|requires the command line developer tools/i.test(out)

/** Looks whether git is installed, the project is inside a git work tree, and it has a commit. */
export async function probeGit($: Host): Promise<GitState> {
  if (!S.root) return 'ok'
  // T-870: a timeout or any other failure is "unknown" (null): the last known state stays, and the next check tries again
  const run = async (args: string[]) => {
    try {
      const r = await git($, args, S.root, 15_000)
      return r.exitCode === 124 ? null : r
    } catch {
      return null
    }
  }
  let v: Awaited<ReturnType<typeof git>> | null = null
  let missing = false
  try {
    v = await git($, ['--version'], S.root, 15_000)
    // T-861: the macOS /usr/bin/git stub without the command-line tools exits 1 with an xcrun message: git is missing too
    missing = v.exitCode === 127 || (v.exitCode !== 0 && v.exitCode !== 124 && macToolsMissing(`${v.stderr}\n${v.stdout}`))
    if (v.exitCode === 124) v = null
  } catch (err) {
    const msg = err instanceof Error ? `${(err as { code?: string }).code ?? ''} ${err.message}` : String(err)
    missing = /ENOENT|not found|no such file/i.test(msg) && !/time(d)? ?out/i.test(msg)
  }
  if (missing) return gitStateOf({ hasGit: false, inside: false, hasHead: false })
  if (!v || v.exitCode !== 0) return S.gitState
  const hasGit = true
  // T-844: the project's own repo only: a repo above the project folder (its show-cdup is "../") is not used
  const [inRepo, up] = hasGit ? await Promise.all([run(['rev-parse', '--is-inside-work-tree']), run(['rev-parse', '--show-cdup'])]) : [null, null]
  if (hasGit && (!inRepo || !up)) return S.gitState
  const inside = hasGit && inRepo?.stdout.trim() === 'true' && !up?.stdout.trim()
  let hasHead = false
  if (inside) {
    const h = await run(['rev-parse', '--verify', '-q', 'HEAD'])
    if (!h) return S.gitState
    hasHead = h.exitCode === 0
  }
  return gitStateOf({ hasGit, inside, hasHead })
}

/** The install step for this machine (what the notice and the lead say when git is missing); looks programs up, runs none. */
export async function installStepOf($: Host): Promise<string> {
  const has = async (name: string) => (await $.run(['sh', '-c', 'command -v "$1" >/dev/null 2>&1', 'sh', name], { timeoutMs: 5000 }).catch(() => null))?.exitCode === 0
  const os = await systemOf($).catch(() => 'other' as const)
  const f: InstallFacts = { os: os === 'mac' || os === 'linux' || os === 'windows' ? os : 'other' }
  if (f.os === 'mac') f.brew = await has('brew')
  if (f.os === 'linux') for (const m of ['apt', 'dnf', 'pacman'] as const) if (await has(m === 'apt' ? 'apt-get' : m)) { f.linux = m; break }
  return gitInstallStep(f)
}

/** Looks at git again while it is not ready (the watchdog, the panel opening, the Check again button); when it just became ready, work starts. Returns a short answer. */
export async function recheckGit($: Host): Promise<string> {
  const was = S.gitState
  const ok = await gitReady($)
  if (ok && was !== 'ok') void pump($).catch(() => undefined)
  return ok ? 'git is ready: this folder is a git repo with commits' : gitNotice(S.gitState, S.gitInstall, S.N.name)
}

/**
 * Whether git is ready for work (a repo with a commit). If not, nothing starts or fails: the
 * banner and status line say so, and the lead (only the driver) is told once per state: how
 * to install git, or the question whether to set up a repo.
 */
export async function gitReady($: Host, b?: Board): Promise<boolean> {
  const s = await probeGit($)
  if (s === 'no-git' && (s !== S.gitState || !S.gitInstall)) S.gitInstall = await installStepOf($).catch(() => '')
  if (s !== 'no-git') S.gitInstall = ''
  const ws = (s === 'no-repo' || s === 'no-commits') && (await holdsRepos($)) ? workspaceText() : ''
  if (s !== S.gitState || ws !== S.gitWorkspace) {
    S.gitState = s
    S.gitWorkspace = ws
    await publish($, b ?? (await load($)))
  }
  if (s === 'ok') {
    // T-968: the lead was told git is not ready (and may be asking the owner about it): a check that finds it ready
    // now (Check again, the owner set it up by hand) tells the lead at once, so it doesn't ask again. Not while
    // setupGit runs: it does its own telling (or none, for the lead's own setup_git).
    if (S.toldGit !== 'ok' && S.driving && !S.settingUp) tellLead($, gitFoundText())
    S.toldGit = 'ok'
  } else if (S.driving && S.toldGit !== s) {
    S.toldGit = s
    tellLead($, s === 'no-git' ? noGitText(S.N.name, S.gitInstall) : ws ? ws : setupAskText(s, S.N.name))
  }
  return s === 'ok'
}

export const workspaceText = () => `This looks like a workspace of several repos; ${S.N.name} can't run a board over several repos yet. Open ${S.W.app} in one repo instead.`

/** True when a folder one or two levels below the project holds its own .git (hidden folders, the data folder and node_modules skipped). */
async function holdsRepos($: Host): Promise<boolean> {
  const dirs = async (path: string) =>
    (await $.fs.list(path).catch(() => [])).filter(e => e.kind === 'dir' && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== S.N.dir).map(e => e.name)
  for (const a of await dirs(S.root)) {
    if (await $.fs.exists(`${S.root}/${a}/.git`)) return true
    for (const b of await dirs(`${S.root}/${a}`)) if (await $.fs.exists(`${S.root}/${a}/${b}/.git`)) return true
  }
  return false
}

/**
 * T-1137: the projects of this board: the folders directly below the board folder that hold their own .git (found by
 * folder name, nothing stored), sorted. None when the board folder is itself a repo (a board inside one repo).
 */
export async function projectNames($: Host): Promise<string[]> {
  if (await $.fs.exists(`${S.root}/.git`)) return []
  const dirs = (await $.fs.list(S.root).catch(() => [])).filter(e => e.kind === 'dir' && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== S.N.dir).map(e => e.name)
  const found: string[] = []
  for (const d of dirs) if (await $.fs.exists(`${S.root}/${d}/.git`)) found.push(d)
  return found.sort()
}

/** T-1137: why `name` is not a project, or '' when it is one of `names`. */
export const projectRefusal = (name: string, names: readonly string[]): string =>
  names.includes(name) ? '' : names.length ? `'${name}' is not a project here. The project folders are: ${names.join(', ')}.` : `'${name}' is not a project: this board has no project folders (a project is a folder below the board folder with its own .git).`

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
  if (s === 'no-git') return noGitText(S.N.name, S.gitInstall)
  if ((s === 'no-repo' || s === 'no-commits') && (await holdsRepos($))) return workspaceText()
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
    await change($, b => ({ ...b, tasks: b.tasks.map(t => (isFinished(t) ? t : { ...t, merge_into: branch })) }))
    S.toldGit = 'ok'
    S.gitState = 'ok'
    await publish($, await load($))
    const out = setupDoneText({ init, branch, files, left, gitignore: old === null ? 'made' : text === old ? 'kept' : 'added', name: S.N.name })
    // T-968: the lead's own setup_git call hears it in its tool answer; anyone else's (the board, a command) wakes the lead now
    if (who !== 'the lead') tellLead($, ownerSetGitText(branch, await gitOk($, ['rev-parse', '--short', 'HEAD'], top).catch(() => ''), out))
    void pump($)
    return out
  } finally {
    S.settingUp = false
  }
}

/** The board update when someone other than the lead set up git (the board's button, the g key, a command). */
export const ownerSetGitText = (branch: string, sha: string, out: string) =>
  `The owner set up git here (branch ${branch}${sha ? `, first commit ${sha}` : ''}): ${out} Tasks can start now; don't ask the owner about git again.`

/** The board update when a check finds git ready after the lead was told it was not. */
export const gitFoundText = () => 'Git is ready here now: this folder is a git repo with commits (the owner set it up, or a check found it). Tasks can start now; don\'t ask the owner about git again.'

/**
 * T-844: git init and a first commit in `dir` (a folder with no .git of its own), for /<name>-init. It names `dir`
 * everywhere and never reads or sets the session's state (S.root, S.gitState, ...). Throws with git's error on failure.
 */
export async function initGitIn($: Host, dir: string): Promise<void> {
  const ignoreFile = `${dir}/.gitignore`
  const before = (await $.fs.exists(ignoreFile)) ? await $.fs.read(ignoreFile) : null
  try {
    await initGitSteps($, dir)
  } catch (err) {
    // nothing may be left behind, so a second try starts from the same folder (no .git, the old .gitignore)
    await $.run(['rm', '-rf', `${dir}/.git`], { cwd: dir }).catch(() => undefined)
    if (before === null) await $.run(['rm', '-f', ignoreFile], { cwd: dir }).catch(() => undefined)
    else await $.fs.write(ignoreFile, before).catch(() => undefined)
    throw err
  }
}

async function initGitSteps($: Host, dir: string): Promise<void> {
  const r = await git($, ['init', '-q', '-b', 'main'], dir)
  if (r.exitCode !== 0) {
    await gitOk($, ['init', '-q'], dir)
    await gitOk($, ['symbolic-ref', 'HEAD', 'refs/heads/main'], dir)
  }
  const ignoreFile = `${dir}/.gitignore`
  const old = (await $.fs.exists(ignoreFile)) ? await $.fs.read(ignoreFile) : null
  let text = gitignoreWith(old, gitignoreBase(S.N.dir))
  if (text !== (old ?? '')) await $.fs.write(ignoreFile, text)
  await gitOk($, ['add', '-A'], dir)
  const tree = await gitOk($, ['write-tree'], dir)
  const left = riskyFiles(parseLsTree((await git($, ['ls-tree', '-r', '-l', '-z', tree], dir)).stdout))
  if (left.length) {
    text = gitignoreWith(text, left.map(x => ignoreLineFor(x.file)))
    await $.fs.write(ignoreFile, text)
    for (let i = 0; i < left.length; i += 100) await gitOk($, ['rm', '-q', '--cached', '--ignore-unmatch', '--', ...left.slice(i, i + 100).map(x => x.file)], dir)
    await gitOk($, ['add', '--', '.gitignore'], dir)
  }
  await gitOk($, [...asSymcc(), 'commit', '-q', '--no-verify', '--allow-empty', '-m', `Initial commit (by ${S.N.name})`], dir)
}

export const worktreeDir =(id: string) => `${S.root}/${S.N.worktrees}/${id}`

/** The branch task `t` works on: its own, or the usual one for its id. */
export const taskBranch = (t: Pick<SymccTask, 'id' | 'branch'>) => t.branch ?? S.N.branch(t.id)

/**
 * Makes (or reuses) task `t`'s folder and branch. `target`: the branch it merges into, which a new branch starts from.
 * With `catchUp` (a new try starts, T-482), an old branch is first brought to `target`'s tip when that is safe (see
 * catchUpBranch); `behind` then says how many of `target`'s commits it still lacks, and `why` why it was not moved.
 */
export async function prepareWorktree($: Host, t: SymccTask, target: string, catchUp = false) {
  const dir = worktreeDir(t.id)
  const branch = taskBranch(t)
  const repo = repoOf(t)
  let made = false
  if (!(await $.fs.exists(`${dir}/.git`))) {
    await git($, ['worktree', 'prune'], repo)
    const has = (await git($, ['rev-parse', '--verify', '-q', `refs/heads/${branch}`], repo)).exitCode === 0
    if (has) await gitOk($, ['worktree', 'add', dir, branch], repo)
    else {
      await gitOk($, ['worktree', 'add', '-b', branch, dir, target], repo)
      made = true
    }
  }
  const kept: CatchUp = catchUp && !made ? await catchUpBranch($, dir, branch, target, t).catch(() => ({ behind: 0 })) : { behind: 0 }
  await copyTypes($, dir, repo).catch(() => false)
  await prepareScratch($, dir).catch(() => false)
  return { dir, branch, ...kept }
}

/**
 * Brings an old task branch up to `target` (the branch it merges into) before a new try (T-482): when its folder `dir`
 * has no uncommitted changes, a branch with no commits `target` lacks is fast-forwarded to `target`'s tip, and one with
 * its own commits (a retry, T-745) gets `target` merged in (the same kind of merge as the "bring up to date" step at
 * merge time; `t` names the merge commit), so a new try starts from today's `target`. A merge that clashes is aborted
 * and the branch left as it was. A folder with changes is left as it is (the merge step handles it). Returns how many
 * of `target`'s commits the branch still lacks afterwards (0 when it was moved, is up to date, or git could not tell),
 * `merged` (how many were merged in, when that happened), and, when `behind` is more than 0, why it was not moved
 * (T-483): uncommitted changes, a clash, or the move failed (also when `git status` itself fails). `commit`: the merge
 commit made, or the one an undone claim of this same try already made (earlierCatchUp) (T-764). `t.attempts` must already be the new try's number: the merge commit's Symcc-Try trailer names it.
 */
export async function catchUpBranch($: Host, dir: string, branch: string, target: string, t?: Pick<SymccTask, 'id' | 'title' | 'attempts'>): Promise<CatchUp> {
  const count = async (range: string) => {
    const r = await git($, ['rev-list', '--count', range], dir)
    const n = r.exitCode === 0 ? Number(r.stdout.trim() || '0') : NaN
    return Number.isFinite(n) ? n : null
  }
  const behind = await count(`refs/heads/${branch}..refs/heads/${target}`)
  if (!behind) return { behind: 0, ...(t ? await earlierCatchUp($, dir, t) : {}) }
  const own = await count(`refs/heads/${target}..refs/heads/${branch}`)
  if (own === null) return { behind: 0 }
  const st = await git($, ['status', '--porcelain'], dir)
  if (st.exitCode !== 0) return { behind, why: 'failed' } // status itself failed: don't claim uncommitted work
  if (st.stdout.trim()) return { behind, why: 'changes' }
  if (own === 0) {
    const r = await git($, ['merge', '--ff-only', '-q', `refs/heads/${target}`], dir)
    return r.exitCode === 0 ? { behind: 0 } : { behind, why: 'failed' }
  }
  // T-745: a retry's branch has its own commits: main is merged in now, not only at merge time
  const subject = `${t?.id ?? branch}: bring up to date with ${target}`
  const message = t ? commitMessage(t, { name: S.N.name, subject }) : subject
  const m = await git($, [...asSymcc(), 'merge', '--no-edit', '--no-verify', '-m', message, `refs/heads/${target}`], dir)
  if (m.exitCode === 0) {
    // T-764: the merge commit, so the new try's run saves it (as the merge-line catch-up does)
    const head = (await git($, ['rev-parse', 'HEAD'], dir)).stdout.trim()
    return { behind: 0, merged: behind, ...(isSha(head) ? { commit: head } : {}) }
  }
  await git($, ['merge', '--abort'], dir)
  return { behind, why: /^CONFLICT|fix conflicts|unmerged/im.test(`${m.stdout}\n${m.stderr}`) ? 'clash' : 'failed' }
}

/**
 * T-764: the catch-up merge an earlier claim of this same try already made (`commit`), when the branch tip in `dir` is
 * a merge commit of task `t` naming try `t.attempts`. A claim undone before its worker started (see unclaimed in
 * workers.ts) drops the run that saved it, and the branch, already up to date, is not merged again: the re-claim saves
 * it from here. Empty when the tip is anything else or git can't tell.
 */
async function earlierCatchUp($: Host, dir: string, t: Pick<SymccTask, 'id' | 'attempts'>): Promise<{ commit?: string }> {
  if (!(t.attempts > 0)) return {}
  const r = await git($, ['log', '-1', '--format=%H %P%n%B', 'HEAD'], dir)
  if (r.exitCode !== 0) return {}
  const [first = '', ...body] = String(r.stdout ?? '').split('\n')
  const [head = '', ...parents] = first.trim().split(/\s+/)
  return isSha(head) && parents.length > 1 && isTaskCommit(body.join('\n'), t.id, S.N.name, t.attempts) ? { commit: head } : {}
}

/** Why catchUpBranch left a branch behind (T-483): its own commits, uncommitted changes in its folder, merging main in clashed (T-745), or the move failed. */
export type BehindWhy = 'commits' | 'changes' | 'clash' | 'failed'
/** What catchUpBranch found: how many commits the branch still lacks, and why (set when `behind` > 0); `merged`: how many of the target's commits were merged into a branch with its own commits (T-745). */
export type CatchUp = { behind: number; why?: BehindWhy; merged?: number; commit?: string }

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
export async function copyTypes($: Host, dir: string, repo = S.root): Promise<boolean> {
  const from = `${repo}/${TYPES_DIR}`
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
 * earlier answers; "<id>-try-*.md" or "T-920's answer" means that task's latest report), plus, for a task with
 * from_task, the latest report of the task it comes from (T-927), from the main project into its folder `dir`, at
 * the same path: the data dir is git-ignored, so a
 * new worktree has none, and its worker may not read the main project folder. A .gitignore of "*" in the copied data
 * dir keeps them out of the commit even where the project's .gitignore lacks it. Returns the files copied; a report
 * that can't be read is skipped.
 */
export async function copyReports($: Host, t: Pick<SymccTask, 'details'> & { origin?: SymccTask['origin'] }, dir: string): Promise<string[]> {
  // T-927: a split or follow-up (from_task) gets the task it comes from's latest report too
  const named = namedReports(t.details, S.N.dir)
  const wanted = t.origin?.task ? [latestReportPattern(S.N.dir, t.origin.task), ...named] : named
  if (!wanted.length) return []
  const reports = `${S.N.dir}/reports`
  let names: string[] | null = null
  const files: string[] = []
  for (const w of wanted) {
    if (!w.endsWith('-try-*.md')) {
      files.push(w)
      continue
    }
    names ??= (await Promise.resolve().then(() => $.fs.list(path(reports))).catch(() => [])).filter(e => e.kind === 'file').map(e => e.name)
    const latest = latestReportOf(w.slice(reports.length + 1, -'-try-*.md'.length), names)
    if (latest) files.push(`${reports}/${latest}`)
  }
  const copied: string[] = []
  for (const f of [...new Set(files)]) {
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
  const repo = repoOf(t)
  if (await branchExists($, branch, repo)) {
    const r = await git($, ['rev-list', '--count', `refs/heads/${intoOf(t)}..refs/heads/${branch}`], repo).catch(() => null)
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
  if (liveWorkersFor({ id: taskId, runs: t?.runs }, agents.map(agentState), S.N.name).some(a => a.id !== except)) return false
  const repo = repoOf(t)
  await git($, ['worktree', 'remove', '--force', dir], repo)
  await git($, ['worktree', 'prune'], repo)
  return true
}

/**
 * Deletes task branch `branch` when all its work is in `into`, the branch the task merged into (T-493). `git branch -d`
 * checks the current HEAD instead, so a task merged into a branch that isn't checked out kept its branch. Here the
 * branch's tip is read, checked to be in `into`, and the branch is deleted only if it is still at that tip (so work
 * added meanwhile is never lost). A branch checked out in a worktree is kept. Returns whether it was deleted.
 */
export async function deleteMergedBranch($: Host, branch: string, into: string, repo = S.root): Promise<boolean> {
  const ref = `refs/heads/${branch}`
  const tip = await git($, ['rev-parse', '--verify', '-q', ref], repo)
  const sha = tip.stdout.trim()
  if (tip.exitCode !== 0 || !/^[0-9a-f]{7,64}$/i.test(sha)) return false
  if ((await git($, ['merge-base', '--is-ancestor', sha, `refs/heads/${into}`], repo)).exitCode !== 0) return false
  const list = await git($, ['worktree', 'list', '--porcelain'], repo)
  if (list.exitCode !== 0 || list.stdout.split('\n').some(l => l.trim() === `branch ${ref}`)) return false
  return (await git($, ['update-ref', '-d', ref, sha], repo)).exitCode === 0
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
  for (const t of b.tasks) if (isFinished(t) && (await $.fs.exists(`${worktreeDir(t.id)}/.git`))) existing.push(t.id)
  let dirs = 0
  for (const id of worktreesToRemove(b.tasks, existing)) {
    const t = find(b, id)
    if (busy.has(id) || starting.has(id) || finishing.has(id) || approving.has(id) || liveWorkersFor({ id, runs: t?.runs }, agents.map(agentState), S.N.name).length) continue
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
    for (const br of branchesToDelete(done, merged.stdout.split('\n'), S.N.branch(''))) if (await deleteMergedBranch($, br, into)) branches++
  }
  const text = S.toldCleanup ? '' : cleanupText(branches, dirs)
  if (text) {
    S.toldCleanup = true
    tellLead($, text)
  }
}
