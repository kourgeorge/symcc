// T-936: a task that waited (it came from the backlog, or was written more than a day before its try) may no longer fit the
// code: files split, lines moved, the work was done elsewhere. Its worker's prompt then gets a "what changed since" section:
// the commits on the branch it merges into that touched its files after it was written, and the rule to check first that the
// task still fits (and to ask the owner when it doesn't). The git log itself is run by hooks/app/workers.ts (changedSince);
// everything here is pure.
import type { SymccTask } from '../../types'
import { when } from './days'

/** A task written longer ago than this gets the section (when commits changed its files since). */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000
/** At most this many commit lines; the rest are "… N more". */
export const CHANGED_SINCE_MAX = 15

/** What changed since the task was written, as the worker's prompt shows it. */
export type ChangedSince = {
  /** when the task was written (its created_at) */
  created: string
  /** when the try starts (ms), for "2 days ago" */
  nowMs: number
  /** the newest commits first, "abc1234 subject" each, at most CHANGED_SINCE_MAX */
  commits: string[]
  /** how many commits there are in all */
  total: number
  /** what the commits were limited to: the task's files, the paths its details name, or nothing (a count only) */
  scope: 'files' | 'named' | 'none'
}

/** The task was moved from the backlog to todo at some point (its history says so). */
export const cameFromBacklog = (t: Pick<SymccTask, 'history'>): boolean =>
  (t.history ?? []).some(e => e.kind === 'moved-backlog' && !e.backlog && !/^moved to the backlog\b/.test(e.text))

/** A try on `t` starting at `nowMs` gets the check: it came from the backlog, or was written more than STALE_AFTER_MS ago. */
export function mayBeStale(t: Pick<SymccTask, 'history' | 'created_at'>, nowMs: number): boolean {
  const made = Date.parse(t.created_at || '')
  if (!Number.isFinite(made)) return false
  return cameFromBacklog(t) || nowMs - made > STALE_AFTER_MS
}

const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|sh|py|go|rs|css|html|yml|yaml|toml|txt)$/

/** The file and folder paths a text names ("hooks/app/workers.ts", "docs/", "README.md"), each once, in order. */
export function pathsNamed(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/[\s`'"(),;<>[\]{}]+/)) {
    const p = raw.replace(/[.:!?]+$/, '').replace(/:\d+(-\d+)?$/, '')
    if (!p || p.includes('://') || p.startsWith('-') || p.includes('..') || p.startsWith('/') || p.startsWith('~')) continue
    if (!/^[\w.@-]+(\/[\w.@-]*)*$/.test(p) || !/[A-Za-z]/.test(p)) continue
    if (!(p.includes('/') && /\w/.test(p.split('/')[0]!)) && !EXT.test(p)) continue
    if (!out.includes(p)) out.push(p)
  }
  return out
}

/** The paths the commits are limited to: the task's files, else the paths its details name, else none.
 *  `tracked`: the repository's files among the named ones (git ls-files); a named word counts only when it is one of them
 *  (or a folder holding one), or when it looks like a file (it has a file extension), so "A/B" or "and/or" don't count. */
export function changedSincePaths(t: Pick<SymccTask, 'files' | 'details' | 'title'>, tracked: readonly string[] = []): { paths: string[]; scope: ChangedSince['scope'] } {
  if (t.files?.length) return { paths: [...t.files], scope: 'files' }
  const named = realPaths(pathsNamed(`${t.title ?? ''}\n${t.details ?? ''}`), tracked)
  return named.length ? { paths: named, scope: 'named' } : { paths: [], scope: 'none' }
}

/** The `named` paths that are real: in `tracked` (a file, or a folder holding one), or file-like (a file extension). */
export function realPaths(named: readonly string[], tracked: readonly string[]): string[] {
  return named.filter(p => {
    const dir = p.endsWith('/') ? p : `${p}/`
    if (tracked.some(f => f === p || f.startsWith(dir))) return true
    return !p.endsWith('/') && EXT.test(p)
  })
}

const ago = (ms: number): string => {
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return 'less than an hour ago'
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

/** The section's text; null (no section) when nothing changed. `tool`: what the worker calls the ask_owner tool. */
export function changedSinceText(s: ChangedSince | null | undefined, tool = 'ask_owner'): string | null {
  if (!s || s.total <= 0) return null
  const made = Date.parse(s.created)
  const written = `This task was written ${when(s.created)}${Number.isFinite(made) ? ` (${ago(s.nowMs - made)})` : ''}.`
  const n = `${s.total} commit${s.total === 1 ? '' : 's'}`
  let changed: string
  if (s.scope === 'none' || !s.commits.length) changed = `${written} Since then ${n} landed on the branch it merges into.`
  else {
    const head = s.scope === 'files' ? 'Since then these commits changed its files:' : 'Since then these commits changed files its details name:'
    const more = s.total - s.commits.length
    changed = `${written} ${head}\n${s.commits.map(l => `- ${l}`).join('\n')}${more > 0 ? `\n… ${more} more` : ''}`
  }
  const check = `Before you start, check that the task still fits: the files, functions and line numbers it names still exist (adapt to small moves and say so in your report), the work isn't already done by a later commit, and it doesn't clash with what changed. If the task no longer makes sense or needs a clearly different plan, don't guess: ask the owner with the ${tool} tool, with options such as "drop it" and "do the new plan: …".`
  return `${changed}\n\n${check}`
}
