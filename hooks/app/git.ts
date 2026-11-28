import { isFinished, isInvestigation, startBranch, type Board, type GitState, gitStateOf, noGitText, setupAskText, gitInstallStep, gitNotice, type InstallFacts, gitignoreWith, gitignoreBase, riskyFiles, parseLsTree, ignoreLineFor, setupDoneText, isProjectName } from '../board'
import { publish } from './lead'
import { S } from './state'
import { type Host } from '../host'
import { load, change } from './store'
import { tellLead } from './tell'
import { pump } from './workers'
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
/** T-948: git's output lines, trimmed, without blank ones; [] when git fails or can't run. */
export async function gitLines($: Host, args: string[], cwd = S.root): Promise<string[]> {
  const r = await git($, args, cwd).catch(() => null)
  return r && r.exitCode === 0 ? r.stdout.split('\n').map(l => l.trim()).filter(Boolean) : []
}

/** T-1196: the repo path of project `p` from the board's project table, undefined when `p` is not in it. */
export const projectPath = (p: unknown): string | undefined => (typeof p === 'string' && Object.prototype.hasOwnProperty.call(S.projects, p) ? S.projects[p] : undefined)

/** T-1196: the project names of this board (its table), sorted. */
export const projectNames = (): string[] => Object.keys(S.projects).sort()

/** T-1205: task `t`'s project as written on it; undefined when it has none (no field, null or ''). */
export const taskProject = (t?: object | null): unknown => {
  const p = (t as { project?: unknown } | null | undefined)?.project
  return p === null || p === '' ? undefined : p
}

/** T-1196: the sentence for a task whose project is not in the board's project table; '' when it is (or it has none). */
export const projectGone = (t?: object | null): string => {
  const p = taskProject(t)
  return p === undefined || projectPath(p) ? '' : `project '${String(p).slice(0, 80)}' is not in this board's project table`
}

/**
 * T-1152: the repo a task's git work happens in: its project's path from the board's project table (T-1196: a repo
 * anywhere on disk) when it has one, else the board folder. Every git call that belongs to a task takes its folder
 * from here. A project that is not in the table is refused.
 */
export const repoOf = (t?: object | null): string => {
  const p = taskProject(t)
  if (p === undefined) return S.root
  const path = projectPath(p)
  if (!path) throw new Error(`'${String(p).slice(0, 80)}' is not in this board's project table`)
  return path
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
export async function probeGit($: Host, repo = S.root): Promise<GitState> {
  if (!S.root) return 'ok'
  const last = repo === S.root ? S.gitRoot : S.repoGit.get(repo) ?? 'ok'
  // T-870: a timeout or any other failure is "unknown" (null): the last known state stays, and the next check tries again
  const run = async (args: string[]) => {
    try {
      const r = await git($, args, repo, 15_000)
      return r.exitCode === 124 ? null : r
    } catch {
      return null
    }
  }
  let v: Awaited<ReturnType<typeof git>> | null = null
  let missing = false
  try {
    v = await git($, ['--version'], repo, 15_000)
    // T-861: the macOS /usr/bin/git stub without the command-line tools exits 1 with an xcrun message: git is missing too
    missing = v.exitCode === 127 || (v.exitCode !== 0 && v.exitCode !== 124 && macToolsMissing(`${v.stderr}\n${v.stdout}`))
    if (v.exitCode === 124) v = null
  } catch (err) {
    const msg = err instanceof Error ? `${(err as { code?: string }).code ?? ''} ${err.message}` : String(err)
    missing = /ENOENT|not found|no such file/i.test(msg) && !/time(d)? ?out/i.test(msg)
  }
  if (missing) return gitStateOf({ hasGit: false, inside: false, hasHead: false })
  if (!v || v.exitCode !== 0) return last
  const hasGit = true
  // T-844: the project's own repo only: a repo above the project folder (its show-cdup is "../") is not used
  const [inRepo, up] = hasGit ? await Promise.all([run(['rev-parse', '--is-inside-work-tree']), run(['rev-parse', '--show-cdup'])]) : [null, null]
  if (hasGit && (!inRepo || !up)) return last
  const inside = hasGit && inRepo?.stdout.trim() === 'true' && !up?.stdout.trim()
  let hasHead = false
  if (inside) {
    const h = await run(['rev-parse', '--verify', '-q', 'HEAD'])
    if (!h) return last
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

/** T-1154: the projects (folders below the board) that open tasks (not backlog, done or dropped) work in, sorted. */
const isOpenTask = (t: { status?: unknown }) => !isFinished(t) && t.status !== 'backlog'
export const openProjects = (b: Board): string[] => [...new Set(b.tasks.filter(t => isOpenTask(t)).map(t => taskProject(t)).filter(isProjectName))].sort()

/** T-1154: what the last check found in the repo task `t` works in (the board's own repo when it has no project). */
export const gitStateOfTask = (t?: object | null): GitState => {
  if (projectGone(t)) return 'ok' // taskGitReady refuses it, with projectGone's words
  const repo = repoOf(t)
  return repo === S.root ? S.gitRoot : S.repoGit.get(repo) ?? 'ok'
}

/**
 * T-1154: a short note per project whose repo is not ready ("client: no commits yet"); '' when all are. T-1196: also
 * a note for each of `names` that is not in the project table.
 */
export const projectNotes = (names?: readonly string[]): string => {
  const byPath = new Map(Object.entries(S.projects).map(([n, p]) => [p, n] as const))
  return [
    ...[...S.repoGit]
      .map(([r, s]) => [byPath.get(r) ?? r, s] as const)
      .filter(([p, s]) => s !== 'ok' && (!names || names.includes(p)))
      .map(([p, s]) => `${p}: ${s === 'no-git' ? 'git is not installed' : s === 'no-repo' ? 'no git repo' : 'no commits yet'}`),
    ...(names ?? []).filter(p => !projectPath(p)).map(p => `${p}: not in the project table`),
  ].join('; ')
}

/** T-1154: whether every repo looked at so far is ready (the board's and each project's). */
export const allGitReady = () => S.gitState === 'ok' && [...S.repoGit.values()].every(s => s === 'ok')

/** T-1154: whether git is ready in the repo task `t` works in: looks at that repo (the board's, or its project's). */
export async function taskGitReady($: Host, b: Board, t: object | null | undefined): Promise<boolean> {
  if (projectGone(t)) return false
  const repo = repoOf(t)
  if (repo === S.root) {
    await gitReady($, b)
    return S.gitRoot === 'ok'
  }
  if (S.gitState === 'no-git') return false
  return gitReady($, b, repo)
}

/** T-1165: forgets the repos of projects with no open (todo/doing/waiting/review/failed/paused) task: they no longer count. */
function forgetClosedRepos(b: Board): void {
  const open = new Set(openProjects(b).flatMap(p => projectPath(p) ?? []))
  for (const r of [...S.repoGit.keys()]) if (!open.has(r)) S.repoGit.delete(r)
}

/** T-1154: looks at the repo of each project that has open tasks (not the board's own). */
export async function checkProjects($: Host, b: Board): Promise<void> {
  forgetClosedRepos(b)
  if (S.gitState === 'no-git') return
  for (const p of openProjects(b)) {
    const repo = projectPath(p)
    if (repo) await gitReady($, b, repo).catch(() => false)
  }
}

/** Looks at git again while it is not ready (the watchdog, the panel opening, the Check again button); when it just became ready, work starts. Returns a short answer. */
export async function recheckGit($: Host): Promise<string> {
  forgetClosedRepos(await load($))
  const was = allGitReady()
  const ok = await gitReady($)
  const b = await load($)
  await checkProjects($, b)
  const bad = [...S.repoGit].filter(([, s]) => s !== 'ok')
  if (ok && !was && !bad.length) void pump($).catch(() => undefined)
  if (!ok) return gitNotice(S.gitState, S.gitInstall, S.N.name)
  if (bad.length) return projectNotes()
  return 'git is ready: this folder is a git repo with commits'
}

/**
 * Whether git is ready for work (a repo with a commit). If not, nothing starts or fails: the
 * banner and status line say so, and the lead (only the driver) is told once per state: how
 * to install git, or the question whether to set up a repo.
 * T-1154: with `repo` (a project's folder) it looks at that repo only, and says nothing to the lead (its tasks wait). The
 * board folder of a workspace (no .git of its own, projects below) counts as ready: each task needs only its own repo.
 */
export async function gitReady($: Host, b?: Board, repo = S.root): Promise<boolean> {
  if (repo !== S.root) {
    const s = await probeGit($, repo)
    if (s !== (S.repoGit.get(repo) ?? 'ok')) {
      S.repoGit.set(repo, s)
      await publish($, b ?? (await load($)))
    } else if (!S.repoGit.has(repo)) S.repoGit.set(repo, s)
    return s === 'ok'
  }
  const real = await probeGit($)
  S.gitRoot = real
  // T-1178: a workspace (projects below, no repo of its own) is fine as it is; a task with no project holds back only itself
  const board = b ?? (await load($))
  const s: GitState = real === 'no-repo' && projectNames().length ? 'ok' : real
  if (s === 'no-git' && (s !== S.gitState || !S.gitInstall)) S.gitInstall = await installStepOf($).catch(() => '')
  if (s !== 'no-git') S.gitInstall = ''
  if (s !== S.gitState) {
    S.gitState = s
    await publish($, b ?? (await load($)))
  }
  const loose = noProjectText(board)
  if (S.driving && loose !== S.toldLoose) {
    S.toldLoose = loose
    if (loose) tellLead($, loose)
  }
  if (s === 'ok') {
    // T-968: the lead was told git is not ready (and may be asking the owner about it): a check that finds it ready
    // now (Check again, the owner set it up by hand) tells the lead at once, so it doesn't ask again. Not while
    // setupGit runs: it does its own telling (or none, for the lead's own setup_git).
    if (S.toldGit !== 'ok' && S.driving && !S.settingUp) tellLead($, gitFoundText())
    S.toldGit = 'ok'
  } else if (S.driving && S.toldGit !== s) {
    S.toldGit = s
    tellLead($, s === 'no-git' ? noGitText(S.N.name, S.gitInstall) : setupAskText(s, S.N.name))
  }
  return s === 'ok'
}

/** T-1182: whether this is a workspace board (the board folder is no repo, projects below it), as the last check found. */
export const workspaceNow = (): boolean => S.gitState === 'ok' && S.gitRoot === 'no-repo'

/** T-1182: a task that runs in a plain folder (no git copy, no branch): an investigation or errand with no project on a workspace board. */
export const plainTask = (t: object | null | undefined): boolean => workspaceNow() && taskProject(t) === undefined && isInvestigation(t as { kind?: unknown })

/** T-1182: why a change task can't have no project on a board over several repos; '' when there are no project folders. */
export const changeNeedsProject = (names: readonly string[]): string =>
  names.length ? `on a board over several repos a change task needs a project: ${names.join(', ')} (only an investigation or an errand may have none)` : ''

/** T-1178: on a workspace board, the open change tasks with no project (they can't start there; investigations and errands may have none, T-1182); '' when none or not a workspace. */
export function noProjectText(b: Board): string {
  if (!workspaceNow()) return ''
  const ids = b.tasks.filter(t => isOpenTask(t) && !isProjectName(taskProject(t)) && !isInvestigation(t)).map(t => t.id)
  if (!ids.length) return ''
  const many = ids.length > 1
  return `${ids.join(', ')} ${many ? 'have' : 'has'} no project, so ${many ? "they can't" : "it can't"} start on a board over several repos (a change task needs a project); give ${many ? 'each' : 'it'} a project (${S.N.name} change project)`
}

/** T-1199: what setup_git answers in a folder that holds repos of its own: add them as projects instead of one git repo over them. */
export const workspaceText = () => `This folder holds several repos, so ${S.N.name} won't set up one git repo over them. Add each repo as a project (${S.N.name} settings with project and path), or open ${S.W.app} in one repo.`

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

/** T-1137: why `name` is not a project, or '' when it is one of `names` (the board's project table). */
export const projectRefusal = (name: string, names: readonly string[]): string =>
  names.includes(name) ? '' : names.length ? `'${name}' is not a project here. The projects are: ${names.join(', ')}.` : `'${name}' is not a project: this board has no projects in its project table.`

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
    S.gitRoot = 'ok'
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
