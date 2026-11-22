// Which branch work is merged into, cleaning up after merged tasks, and a folder without git.
import type { SymccTask } from '../../types'
import { DEFAULT_NAME } from '../name'
import { DATA_DIR, intoOf } from './board-file'

// ---------------- which branch work is merged into ----------------

/**
 * The branch a new task merges into: the branch checked out now (`current`). With none
 * (a detached HEAD), the repo's main branch: origin's HEAD (e.g. "origin/main") if set,
 * else "main" or "master", whichever of `branches` exists; "main" when nothing helps.
 */
export function startBranch(current: string, originHead: string, branches: string[]): string {
  const cur = String(current ?? '').trim()
  if (cur) return cur
  const origin = String(originHead ?? '').trim().replace(/^(refs\/remotes\/)?origin\//, '')
  if (origin && origin !== 'HEAD') return origin
  return ['main', 'master'].find(x => branches.includes(x)) ?? 'main'
}

/**
 * The question a task waits with when the branch it merges into (`gone`) no longer exists, and
 * the answer that moves it to `instead` (the branch checked out now, or the repo's main branch).
 */
export const goneBranchQuestion = (gone: string, instead: string) => `branch ${gone} is gone: merge into ${instead} instead?`
export const goneBranchOptions = (gone: string, instead: string) => [`Yes, merge into ${instead}`, `No, I'll bring back ${gone}`]

/** The two branches in a goneBranchQuestion (the missing one, the one offered), or null when `q` is not one. */
export function parseGoneBranch(q: string | null | undefined): { gone: string; instead: string } | null {
  const m = /^branch (\S+) is gone: merge into (\S+) instead\?$/.exec(String(q ?? '').trim())
  return m ? { gone: m[1]!, instead: m[2]! } : null
}

/** Whether the owner's answer to a goneBranchQuestion says yes (merge into the offered branch). */
export function saysMergeInstead(answer: string, instead: string): boolean {
  const a = String(answer ?? '').trim().toLowerCase()
  if (!a || /^(no|don'?t|do not|wait|keep)\b/.test(a)) return false
  return /^(yes|y|ok|okay|sure|do it|merge)\b/.test(a) || a.includes(instead.toLowerCase())
}

/**
 * The notes for task `t` that waits (after) for a task merging into another branch: that task's
 * change won't be in `t`'s copy. One line each; none when every task it waits for is on its branch.
 */
export function crossBranchNotes(t: Pick<SymccTask, 'id' | 'after' | 'merge_into'>, all: Pick<SymccTask, 'id' | 'merge_into'>[]): string[] {
  const mine = intoOf(t)
  return (t.after ?? []).flatMap(id => {
    const dep = all.find(x => x.id === id)
    if (!dep || intoOf(dep) === mine) return []
    return [`${t.id} is on ${mine} but waits for ${dep.id}, which merges into ${intoOf(dep)}; ${dep.id}'s change won't be in ${t.id}`]
  })
}

// ---------------- cleaning up after merged tasks ----------------
// A done task's branch and worktree are removed (the branch only when git lists it as merged).
// A dropped task keeps its branch (it may hold work the owner wants to see), but loses its worktree.

/** A task's branch: its own `branch`, else `prefix` + id (prefix is e.g. "symcc/"). */
const branchOf = (t: Pick<SymccTask, 'id' | 'branch'>, prefix: string) => t.branch ?? `${prefix}${t.id}`

/**
 * The branches that may be deleted: those of done tasks only, that start with `prefix` (the
 * plugin's own branches) and that `merged` (from `git branch --merged <target>`) lists.
 */
export function branchesToDelete(tasks: Pick<SymccTask, 'id' | 'status' | 'branch'>[], merged: string[], prefix: string): string[] {
  if (!prefix) return []
  const ok = new Set(merged.map(x => x.replace(/^[*+]?\s*/, '').trim()).filter(Boolean))
  const out = tasks.filter(t => t.status === 'done').map(t => branchOf(t, prefix)).filter(x => x.startsWith(prefix) && ok.has(x))
  return [...new Set(out)]
}

/** The tasks whose leftover worktree may be removed: done or dropped, with a folder still there (`existing` = task ids with a worktree). */
export function worktreesToRemove(tasks: Pick<SymccTask, 'id' | 'status'>[], existing: string[]): string[] {
  const has = new Set(existing)
  return tasks.filter(t => (t.status === 'done' || t.status === 'dropped') && has.has(t.id)).map(t => t.id)
}

/** The one line for the lead after a cleanup, or '' when it cleaned only a few (`few` or less). */
export function cleanupText(branches: number, worktrees: number, few = 3): string {
  if (branches + worktrees <= few) return ''
  const parts = [branches ? `${branches} merged task branch${branches === 1 ? '' : 'es'}` : '', worktrees ? `${worktrees} leftover task folder${worktrees === 1 ? '' : 's'}` : ''].filter(Boolean)
  return `Cleaned up ${parts.join(' and ')}.`
}

// ---------------- a folder without git ----------------
// Workers each get a git worktree, so the project must be a git repo with at least one commit.
// With none, no worker starts; the board shows a notice and symcc offers to set one up (on the
// owner's yes: it makes a .git folder and commits the owner's files).

/** ok: a repo with commits; no-git: the git program is missing; no-repo: not inside a git work tree; no-commits: a repo with no commit yet. */
export type GitState = 'ok' | 'no-git' | 'no-repo' | 'no-commits'

/** What the three checks found, as a GitState. */
export function gitStateOf(p: { hasGit: boolean; inside: boolean; hasHead: boolean }): GitState {
  if (!p.hasGit) return 'no-git'
  if (!p.inside) return 'no-repo'
  return p.hasHead ? 'ok' : 'no-commits'
}

/** The short note on the banner and status line; '' when git is fine. `how`: how to set git up, in brackets after it
 * ('g', the board panel's key, by default; '' for none, where the panel has no such key). */
export function gitNote(s: GitState, how = 'g'): string {
  const setup = `set up git${how ? ` (${how})` : ''}`
  if (s === 'no-git') return 'git is not installed'
  if (s === 'no-repo') return `no git repo here; ${setup}`
  if (s === 'no-commits') return `no commits yet; ${setup}`
  return ''
}

/** What the machine offers for installing git (see gitInstallStep). */
export type InstallFacts = { os: 'mac' | 'linux' | 'windows' | 'other'; brew?: boolean; linux?: 'apt' | 'dnf' | 'pacman' }

/** The install step for this machine, as one command line (or a web address when nothing fits); '' never. */
export function gitInstallStep(f: InstallFacts): string {
  if (f.os === 'mac') return f.brew ? 'brew install git' : 'xcode-select --install'
  if (f.os === 'windows') return 'winget install --id Git.Git'
  if (f.os === 'linux') {
    if (f.linux === 'apt') return 'sudo apt install git'
    if (f.linux === 'dnf') return 'sudo dnf install git'
    if (f.linux === 'pacman') return 'sudo pacman -S git'
  }
  return 'get git from https://git-scm.com'
}

/** The notice the board shows at the top for a git state ('' when git is fine); `step` = gitInstallStep when git is missing. */
export function gitNotice(s: GitState, step = '', name: string = DEFAULT_NAME): string {
  if (s === 'no-git') return `Git is not installed: ${step || 'get it from https://git-scm.com'}. No worker starts until it is.`
  if (s === 'no-repo') return `No git repo here: ${name} needs git for task branches. No worker starts until it is set up.`
  if (s === 'no-commits') return `No commits yet: ${name} needs a first commit for task branches. No worker starts until it is set up.`
  return ''
}

/** The one message the lead gets when the git program is missing; `step` = how to install it on this machine (gitInstallStep). */
export function noGitText(name: string = DEFAULT_NAME, step = ''): string {
  const how = step ? `The install step for this machine is \`${step}\`.` : 'On macOS run `xcode-select --install` (or `brew install git`); on Linux use the package manager (e.g. `sudo apt install git`); on Windows `winget install --id Git.Git`; or get it from https://git-scm.com.'
  return `No work can start: git is not installed. ${name} needs git to give each worker its own copy of the project (git worktrees), so it can't work without it. Ask the owner whether to install it. ${how} Only on their yes run it yourself, and only if it needs no sudo and no installer window; otherwise tell them to run it. Then ${name} sees git on its own and the next step is setting up the repo.`
}

/** The question the lead passes on to the owner when the folder has no repo (or no commits); `setup` = how to say yes. */
export function setupAskText(s: GitState, name: string = DEFAULT_NAME, setup = `${name} setup_git`): string {
  const what = s === 'no-commits' ? 'This folder has a git repo but no commits yet' : 'This folder has no git repo'
  const steps = s === 'no-commits' ? 'a .gitignore, a first commit of the current files' : 'git init, a .gitignore, a first commit of the current files'
  return `${what}. ${name} needs one to give each worker its own copy. Set it up? (${steps}.) Nothing starts until it's done. Ask the owner; only if they say yes, run ${setup} (or they press g in the board panel). It never pushes and adds no remote.`
}

/**
 * Name endings that mark a committed template, not a real secret: .env.example, .env.local.sample, id_rsa.example, ...
 * Lower case only, so it agrees with the setup .gitignore's `!.env*.example` lines (git matches them case-sensitively on
 * Linux): .env.EXAMPLE is still a secret.
 */
export const TEMPLATE_ENDINGS = ['example', 'sample', 'template', 'dist', 'defaults'] as const

const isTemplateName = (base: string) => TEMPLATE_ENDINGS.some(e => base.endsWith(`.${e}`))

/** The lines a .gitignore made by setup holds (the data folder first). */
export const gitignoreBase = (dir: string = DATA_DIR) => [`${dir}/`, 'node_modules/', '.env', '.env.*', ...TEMPLATE_ENDINGS.map(e => `!.env*.${e}`), '.DS_Store', 'dist/', 'build/', '__pycache__/', '.venv/']

/** A .gitignore line as git matches it, to spot one already there: no leading "/", no trailing "/", no spaces around. */
const ignoreKey = (line: string) => line.trim().replace(/^\//, '').replace(/\/+$/, '')

/** The ending (".sample") of a line's last part, lower case; '' when it has none. */
const lineEnding = (line: string) => {
  const last = ignoreKey(line).split('/').pop() ?? ''
  const dot = last.lastIndexOf('.')
  return dot > 0 ? last.slice(dot).toLowerCase() : ''
}

/**
 * The .gitignore text after adding `lines` to `old` (null = no file yet): only the lines not
 * there already (and each once), at the end. Returns `old` unchanged when nothing is missing.
 * A `!` line (such as `!.env*.sample`) is skipped when the old file already ignores a name with the
 * same ending (`.env.sample`, `config/.env.sample`, `*.sample`): added last it would win over the
 * owner's line and commit a file they ignored on purpose.
 */
export function gitignoreWith(old: string | null, lines: string[]): string {
  const text = old ?? ''
  const own = text.split(/\r?\n/).map(x => x.trim()).filter(x => x && !x.startsWith('#'))
  const have = new Set(own.map(ignoreKey).filter(Boolean))
  const ownEndings = new Set(own.filter(x => !x.startsWith('!')).map(lineEnding).filter(Boolean))
  const add: string[] = []
  for (const l of lines.map(x => x.trim()).filter(Boolean)) {
    const k = ignoreKey(l)
    if (!k || have.has(k)) continue
    if (l.startsWith('!') && ownEndings.has(lineEnding(l))) continue
    have.add(k)
    add.push(l)
  }
  if (!add.length) return text
  const head = text && !text.endsWith('\n') ? `${text}\n` : text
  return `${head}${add.join('\n')}\n`
}

/** Files bigger than this are left out of the first commit. */
export const BIG_FILE_BYTES = 50 * 1024 * 1024

/** Whether a file's name looks like a secret: .env and .env.*, *.pem, *.key, and SSH private keys (id_rsa, id_ed25519, ...; not their .pub). Templates (a name ending in .example, .sample, .template, .dist or .defaults, lower case) are not secrets. */
export function isSecretName(file: string): boolean {
  const base = file.split('/').pop() ?? ''
  if (isTemplateName(base)) return false
  if (base === '.env' || base.startsWith('.env.')) return true
  if (/\.(pem|key)$/i.test(base)) return true
  return /^id_(rsa|dsa|ecdsa|ed25519)$/.test(base)
}

/** One file `git ls-tree -r -l -z` lists: its path and size in bytes (null for a submodule). */
export type TreeFile = { file: string; size: number | null }

/** Reads `git ls-tree -r -l -z` output ("mode type hash size\tpath", NUL between entries). */
export function parseLsTree(text: string): TreeFile[] {
  return text
    .split('\0')
    .filter(Boolean)
    .map(e => {
      const tab = e.indexOf('\t')
      const size = Number(e.slice(0, tab).trim().split(/\s+/)[3])
      return { file: e.slice(tab + 1), size: Number.isFinite(size) ? size : null }
    })
    .filter(f => f.file)
}

/** The files to leave out of the first commit, each with why: a secret-like name or over `max` bytes. */
export function riskyFiles(files: TreeFile[], max = BIG_FILE_BYTES): { file: string; why: string }[] {
  const out: { file: string; why: string }[] = []
  for (const f of files) {
    if (isSecretName(f.file)) out.push({ file: f.file, why: 'looks like a secret' })
    else if (f.size !== null && f.size > max) out.push({ file: f.file, why: `${Math.round(f.size / 1024 / 1024)} MB, over ${Math.round(max / 1024 / 1024)} MB` })
  }
  return out
}

/** The .gitignore line for one left-out file: its exact path from the repo's top (special characters escaped). */
export const ignoreLineFor = (file: string) => `/${file.replace(/([*?[\]!#\\])/g, '\\$1').replace(/^ /, '\\ ')}`

/** What setup tells the lead and owner when it is done. */
export function setupDoneText(o: { init: boolean; branch: string; files: number; left: { file: string; why: string }[]; gitignore: 'made' | 'added' | 'kept'; name?: string }): string {
  const name = o.name ?? DEFAULT_NAME
  const steps = [o.init ? 'made a git repo' : '', o.gitignore === 'made' ? 'wrote a .gitignore' : o.gitignore === 'added' ? 'added lines to .gitignore' : '', `committed ${o.files} file${o.files === 1 ? '' : 's'} on ${o.branch} ("Initial commit (by ${name})")`].filter(Boolean)
  const warn = o.left.length ? ` Warning: left out of the commit and added to .gitignore: ${o.left.slice(0, 10).map(x => `${x.file} (${x.why})`).join(', ')}${o.left.length > 10 ? `, and ${o.left.length - 10} more` : ''}.` : ''
  return `Git is set up: ${steps.join(', ')}. Work merges into ${o.branch}; nothing was pushed and no remote was added.${warn}`
}
