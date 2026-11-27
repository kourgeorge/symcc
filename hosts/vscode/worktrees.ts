// The project's git worktrees for the board panel's Worktrees page: each worker's folder (<dir>/worktrees/<task>), the
// project itself and any other checkout of the repo (the owner's own), with where each stands against the branch it
// is compared with. Everything here only reads git, except removing a finished task's folder (removeLeftover), which
// goes through the engine's own removeWorktree and its rules.
import { realpath, stat } from 'node:fs/promises'
import { basename, relative, sep } from 'node:path'
import { homedir } from 'node:os'
import type { Host } from '../../hooks/host'
import { git, removeWorktree } from '../../hooks/app/git'
import { S, workers, starting, finishing, approving } from '../../hooks/app/state'
import { intoOf, isFinished } from '../../hooks/board'
import type { SymccTask } from '../../types'
import type { PanelFile, PanelWorktree } from './protocol'

/** How many of a worktree's commits and changed files the page gets. */
const COMMITS_SHOWN = 8
const FILES_SHOWN = 200

export type WorktreeEntry = { path: string; head: string; branch: string; locked: boolean; prunable: boolean; bare: boolean }

/** `git worktree list --porcelain`'s entries. */
export function parseWorktreeList(text: string): WorktreeEntry[] {
  const out: WorktreeEntry[] = []
  for (const block of text.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.split('\n').filter(Boolean)
    const path = lines.find(l => l.startsWith('worktree '))?.slice(9)
    if (!path) continue
    const ref = lines.find(l => l.startsWith('branch '))?.slice(7) ?? ''
    out.push({
      path,
      head: lines.find(l => l.startsWith('HEAD '))?.slice(5) ?? '',
      branch: ref.replace(/^refs\/heads\//, ''),
      locked: lines.some(l => l === 'locked' || l.startsWith('locked ')),
      prunable: lines.some(l => l === 'prunable' || l.startsWith('prunable ')),
      bare: lines.includes('bare'),
    })
  }
  return out
}

/** `git diff --numstat`'s files (a binary file counts no lines; a rename is named by its new path). */
export function parseNumstat(text: string): PanelFile[] {
  return text
    .split('\n')
    .filter(Boolean)
    .map(l => {
      const [a = '', d = '', ...rest] = l.split('\t')
      const file = rest
        .join('\t')
        .replace(/\{[^{}]* => ([^{}]*)\}/g, '$1')
        .replace(/^.* => /, '')
        .replace(/\/\//g, '/')
      return { file, added: Number(a) || 0, removed: Number(d) || 0 }
    })
    .filter(f => f.file)
}

/** `git log --format=%h%x1f%ct%x1f%s`'s commits. */
export function parseLog(text: string): PanelWorktree['commits'] {
  return text
    .split('\n')
    .filter(Boolean)
    .map(l => {
      const [sha = '', at = '', ...subject] = l.split('\x1f')
      return { sha, atMs: Number(at) * 1000 || 0, subject: subject.join('\x1f') }
    })
}

const real = (p: string) => realpath(p).catch(() => p)
const inside = (dir: string, p: string) => p === dir || p.startsWith(dir.endsWith(sep) ? dir : dir + sep)

/** The folder as the owner reads it: inside the project relative to it, else with ~ for the home folder. */
function whereOf(path: string, root: string): string {
  if (inside(root, path)) return relative(root, path) || basename(root)
  const home = homedir()
  return inside(home, path) ? `~${path.slice(home.length)}` : path
}

type Facts = { worktree: PanelWorktree; fork?: string }

async function factsOf($: Host, e: WorktreeEntry, kind: PanelWorktree['kind'], task: SymccTask | undefined, id: string | undefined, where: string, home: string): Promise<Facts> {
  const w: PanelWorktree = { path: e.path, where, kind, ...(id ? { task: id } : {}), branch: e.branch, head: e.head.slice(0, 9), ahead: 0, behind: 0, files: [], dirty: 0, untracked: 0, commits: [], ...(e.locked ? { locked: true } : {}) }
  if (e.prunable || !(await stat(e.path).catch(() => null))?.isDirectory()) return { worktree: { ...w, missing: true } }
  const run = async (args: string[]) => {
    const r = await git($, args, e.path, 30_000).catch(() => null)
    return r && r.exitCode === 0 ? r.stdout : null
  }
  const upstream = kind === 'task' ? null : (await run(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']))?.trim() || null
  const base = kind === 'task' ? (task ? intoOf(task) : home) : (upstream ?? (kind === 'other' ? home : undefined))
  const [status, last] = await Promise.all([run(['status', '--porcelain=v1', '--untracked-files=normal']), run(['log', '-1', '--format=%ct', 'HEAD'])])
  if (status === null) return { worktree: { ...w, error: "git couldn't read this folder" } }
  const lines = status.split('\n').filter(Boolean)
  w.dirty = lines.length
  w.untracked = lines.filter(l => l.startsWith('??')).length
  if (last && Number(last.trim())) w.lastCommitMs = Number(last.trim()) * 1000
  let fork: string | undefined
  if (base && base !== e.branch) {
    const ref = (await run(['rev-parse', '--verify', '-q', `${base}^{commit}`]))?.trim()
    if (ref) {
      w.base = base
      const [counts, mb] = await Promise.all([run(['rev-list', '--left-right', '--count', `${ref}...HEAD`]), run(['merge-base', ref, 'HEAD'])])
      const [behind = 0, ahead = 0] = (counts ?? '').trim().split(/\s+/).map(Number)
      w.behind = behind || 0
      w.ahead = ahead || 0
      fork = mb?.trim() || undefined
      if (w.ahead) w.commits = parseLog((await run(['log', `-${COMMITS_SHOWN}`, '--format=%h%x1f%ct%x1f%s', `${ref}..HEAD`])) ?? '')
    }
  }
  // a task's folder: everything since it left its base, committed or not; any other: what isn't committed yet
  const against = kind === 'task' && fork ? fork : 'HEAD'
  w.files = parseNumstat((await run(['diff', '--numstat', '-M', against])) ?? '').slice(0, FILES_SHOWN)
  return { worktree: w, ...(fork ? { fork } : {}) }
}

export type Worktrees = {
  /** every worktree of the project's repo, symcc's workers' first */
  list: () => Promise<PanelWorktree[]>
  /** what changed in worktree `path` (as `list` compares it), as one diff text */
  diff: (path: string) => Promise<string>
  /** file `file` as it was where worktree `path` is compared from ('' for a file that is new there) */
  base: (path: string, file: string) => Promise<{ text: string; ref: string }>
  /** removes a finished task's leftover folder; answers what happened */
  remove: (path: string) => Promise<string>
}

/** The project's worktrees, read with git through `$` (its tasks from `tasks()`, its home branch from `home()`). */
export function projectWorktrees($: Host, root: string, tasks: () => readonly SymccTask[], home: () => string): Worktrees {
  let reading: Promise<{ worktrees: PanelWorktree[]; forks: Map<string, string> }> | undefined
  const read = async () => {
    const listed = await git($, ['worktree', 'list', '--porcelain'], root, 30_000).catch(() => null)
    if (!listed || listed.exitCode !== 0) throw new Error(`git couldn't list the worktrees${listed?.stderr ? `: ${listed.stderr.trim().slice(0, 200)}` : ''}`)
    const [main, own] = await Promise.all([real(root), real(`${root}/${S.N.worktrees}`)])
    const byId = new Map(tasks().map(t => [t.id, t]))
    const entries = parseWorktreeList(listed.stdout).filter(e => !e.bare)
    const facts = await Promise.all(
      entries.map(async e => {
        const at = await real(e.path)
        const kind: PanelWorktree['kind'] = at === main ? 'main' : inside(own, at) ? 'task' : 'other'
        const id = kind === 'task' ? relative(own, at).split(sep)[0] : undefined
        const where = kind === 'main' ? basename(root) : kind === 'task' ? `${S.N.worktrees}/${id}` : whereOf(at, main)
        return factsOf($, e, kind, id ? byId.get(id) : undefined, id, where, home() || 'main')
      }),
    )
    const order = { task: 0, main: 1, other: 2 }
    const worktrees = facts.map(f => f.worktree).sort((a, b) => order[a.kind] - order[b.kind] || a.where.localeCompare(b.where, undefined, { numeric: true }))
    return { worktrees, forks: new Map(facts.filter(f => f.fork).map(f => [f.worktree.path, f.fork!])) }
  }
  const latest = () => (reading ??= read().finally(() => setTimeout(() => (reading = undefined), 500)))
  const known = async (path: string) => {
    const r = await latest()
    const w = r.worktrees.find(x => x.path === path)
    if (!w) throw new Error(`${path} is not one of this project's worktrees`)
    if (w.missing) throw new Error(`${w.where} is gone from the disk`)
    return { w, against: (w.kind === 'task' && r.forks.get(path)) || 'HEAD' }
  }
  const out = async (args: string[], cwd: string) => {
    const r = await git($, args, cwd, 60_000)
    if (r.exitCode !== 0) throw new Error(`git ${args[0]}: ${(r.stderr || r.stdout).trim().slice(0, 300)}`)
    return r.stdout
  }
  return {
    list: async () => (await latest()).worktrees,
    async diff(path) {
      const { w, against } = await known(path)
      const [stat, patch, fresh] = await Promise.all([out(['diff', '--stat', '-M', against], path), out(['diff', '-M', against], path), out(['ls-files', '--others', '--exclude-standard'], path)])
      const what = against === 'HEAD' ? `${w.where}: what isn't committed yet` : `${w.where}: its changes since it left ${w.base ?? 'its base'} (committed or not)`
      const added = fresh.split('\n').filter(Boolean)
      return [`# ${what}`, stat.replace(/\s+$/, '') || '(no changes to files git tracks)', added.length ? `# new files git doesn't track yet:\n${added.map(f => `#   ${f}`).join('\n')}` : '', patch].filter(Boolean).join('\n\n')
    },
    async base(path, file) {
      const { against } = await known(path)
      if (!file || file.startsWith('-') || file.includes('\0')) throw new Error('no such file')
      const r = await git($, ['show', `${against}:${file}`], path, 30_000)
      return { text: r.exitCode === 0 ? r.stdout : '', ref: against === 'HEAD' ? 'HEAD' : against.slice(0, 9) }
    },
    async remove(path) {
      const { w } = await known(path)
      const id = w.task
      if (w.kind !== 'task' || !id) return `${w.where} isn't a worker's folder, so ${S.N.name} leaves it alone.`
      const t = tasks().find(x => x.id === id)
      if (t && !isFinished(t)) return `${id} is still ${t.status}, so its folder stays.`
      if ([...workers.values()].some(x => x.task === id) || starting.has(id) || finishing.has(id) || approving.has(id)) return `An agent still works in ${w.where}, so it stays.`
      if (!(await removeWorktree($, id, path))) return `${w.where} is still in use, so it stays.`
      reading = undefined
      return `Removed ${w.where}.${w.branch ? ` Its branch ${w.branch} is kept.` : ''}`
    },
  }
}
