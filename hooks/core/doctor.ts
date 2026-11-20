// /<name>-doctor (T-676): a check of the project's data folder (.<name>/) and git, the pure part. It finds old
// migration backups, task branches already in their branch, leftover task folders, stale git worktree entries, data
// files near the 4 MB read limit, stray files and a board that looks stuck, and lists them with their sizes. Only the
// items marked fixable can be fixed, and only when the owner says so (`/<name>-doctor fix`, or `fix 1 3` for some);
// everything else is only listed. app/doctor.ts gathers the facts and does the fixes.
import { mbText } from './board-parts'

/** What a found item is about. */
export type DoctorKind = 'backup' | 'worktree' | 'prune' | 'branch' | 'size' | 'stray' | 'board'

/** One thing the doctor found: `fixable` ones get a number in the list and can be fixed; the rest are only listed. */
export type DoctorItem = { kind: DoctorKind; text: string; bytes?: number; fixable: boolean }

/** The mark in the name of a copy of board.json (or archive.json) kept before a migration. */
export const BACKUP_MARK = '.before-migrate-'

/** How long a running task may have no live worker before the doctor names it (minutes). */
export const DOCTOR_STUCK_MIN = 10

/** Folders in the data folder that are only listed when empty (nothing in them is ever deleted). */
export const STRAY_DIRS = ['scratch', 'ideas', 'artifacts']

/**
 * The migration backups to offer for deletion among the data folder's `files`: for each file they copy (board.json,
 * archive.json, ...), every backup but the newest (by name: the name ends with the time it was made; by mtime when
 * two names are the same up to it).
 */
export function oldBackups<F extends { name: string; mtimeMs?: number }>(files: F[]): F[] {
  const groups = new Map<string, F[]>()
  for (const f of files) {
    const i = f.name.indexOf(BACKUP_MARK)
    if (i <= 0) continue
    const base = f.name.slice(0, i)
    groups.set(base, [...(groups.get(base) ?? []), f])
  }
  const out: F[] = []
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => b.name.localeCompare(a.name) || (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0))
    out.push(...sorted.slice(1))
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Bytes as the owner reads them: "1.4 MB", "12 KB", "300 B". */
export function sizeText(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes >= 1024 * 1024) return mbText(bytes)
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

/** What /<name>-doctor's words ask: only the list, fix every fixable item, or fix the ones numbered. */
export type DoctorAsk = { fix: null } | { fix: 'all' } | { fix: number[] } | { bad: string }

/** Reads /<name>-doctor's words: nothing (list), "fix" or "fix all" (fix all), "fix 1 3" / "fix 1,3" (fix those). */
export function parseDoctorArgs(args: string, name: string): DoctorAsk {
  const words = String(args ?? '').trim().toLowerCase().split(/[\s,]+/).filter(Boolean)
  if (!words.length) return { fix: null }
  const use = { bad: `Use: /${name}-doctor (list what it finds), /${name}-doctor fix (fix every numbered item), or /${name}-doctor fix 1 3 (only those)` }
  if (words[0] !== 'fix') return use
  const rest = words.slice(1)
  if (!rest.length || (rest.length === 1 && rest[0] === 'all')) return { fix: 'all' }
  const nums = rest.map(Number)
  if (nums.some(n => !Number.isInteger(n) || n < 1)) return use
  return { fix: [...new Set(nums)].sort((a, b) => a - b) }
}

/** The doctor's list: the fixable items numbered (the numbers `fix` takes), then the ones only listed, then how to fix. */
export function doctorText(items: DoctorItem[], name: string, dir: string): string {
  const fix = items.filter(i => i.fixable)
  const keep = items.filter(i => !i.fixable)
  if (!items.length) return `${name} doctor: ${dir}/ and git look fine; nothing to clean up.`
  const size = (i: DoctorItem) => (i.bytes !== undefined && sizeText(i.bytes) ? `  (${sizeText(i.bytes)})` : '')
  const lines = [`${name} doctor: what I found in ${dir}/ and git.`]
  if (fix.length) {
    const total = fix.reduce((n, i) => n + (i.bytes ?? 0), 0)
    lines.push(`Can be cleaned up (nothing changes until you say so)${total ? `, about ${sizeText(total)}` : ''}:`)
    fix.forEach((i, n) => lines.push(`  ${n + 1}. ${i.text}${size(i)}`))
  }
  if (keep.length) {
    lines.push('Only listed (left alone):')
    for (const i of keep) lines.push(`  - ${i.text}${size(i)}`)
  }
  if (fix.length) lines.push(`To clean up all ${fix.length}: /${name}-doctor fix · only some: /${name}-doctor fix 1 3`)
  return lines.join('\n')
}

/** What one fix did: the item's number and text, and '' when it was done or the reason it was not. */
export type DoctorFixed = { n: number; text: string; bytes?: number; failed: string }

/** The answer after fixing: each item done (✓) or kept with the reason (✗), and the space freed. */
export function fixedText(done: DoctorFixed[], name: string): string {
  if (!done.length) return `${name} doctor: nothing to clean up.`
  const ok = done.filter(d => !d.failed)
  const freed = ok.reduce((n, d) => n + (d.bytes ?? 0), 0)
  return [
    `${name} doctor cleaned up ${ok.length} of ${done.length}:`,
    ...done.map(d => (d.failed ? `  ✗ ${d.n}. ${d.text}: kept, ${d.failed}` : `  ✓ ${d.n}. ${d.text}`)),
    ...(freed ? [`Freed about ${sizeText(freed)}.`] : []),
  ].join('\n')
}

/** Why the doctor doesn't run now: a merge (task `id`'s, or one git is in the middle of) is going on. */
export const mergeRunsText = (name: string, id?: string) =>
  `${name} doctor doesn't run while a merge is in progress (${id ? `${id}'s work is being checked and merged` : 'git is in the middle of a merge in the project folder'}); nothing was checked or changed. Try /${name}-doctor again when it is done.`

/** The lines of `git worktree prune --dry-run` (git says each on stderr, "Removing worktrees/x: ..."). */
export const pruneLines = (out: string): string[] =>
  out
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^Removing /.test(l))
