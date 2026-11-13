// The board health check: finds tasks that are stuck, starving, chained for no reason, or
// waiting on the owner too long. Pure: takes a board and the time, returns what it found.
// The driving session runs it after each board change and on the regular check, and tells the
// lead only about findings it has not told before (see newFindings).
//
// The rules, kept simple on purpose:
// 1. Stuck: a todo or backlog task waits on (after) a task that was dropped, failed or is not on
//    the board (and was not archived as done), so it would wait forever. Or tasks wait on each
//    other in a loop (T-1 after T-2 after T-1).
// 2. Starving: a todo task that could start, or waits only on tasks added after it, and either
//    its after list was changed STARVE_AFTER_CHANGES or more times (history lines "waits on
//    changed: ..."), or it was made more than STARVE_MS ago and STARVE_NEWER or more tasks made
//    after it have already started.
// 3. Too serial: a chain of SERIAL_CHAIN or more todo tasks, each waiting on the one before it,
//    where neighbours share no files (by their files lists), so they could run side by side.
//    A task with no files list may change anything, so it shares files with every task.
// 4. Needs the owner too long: a task waiting for the owner or ready for review, untouched for
//    more than OWNER_IDLE_MS. Said once, and again only after the task changes.
//
// Each finding has a key made of its reason, its tasks and their updated_at, so the same
// problem is told once, and told again only when one of its tasks changes.
import type { Board, BoardTask } from './board-file'
import { find } from './board-file'
import { AFTER_CHANGED } from './history'
import { num } from './text'

export const STARVE_AFTER_CHANGES = 3
export const STARVE_MS = 2 * 60 * 60_000
export const STARVE_NEWER = 2
export const SERIAL_CHAIN = 3
export const OWNER_IDLE_MS = 60 * 60_000

export type HealthReason = 'stuck' | 'loop' | 'starving' | 'serial' | 'owner'

export type HealthFinding = {
  reason: HealthReason
  /** the tasks it is about, the main one first */
  tasks: string[]
  /** told once: changes when the reason, the tasks or any of their updated_at change */
  key: string
  /** the problem, in one plain line */
  text: string
  /** what the lead could do about it */
  consider: string
}

const WAITS: readonly string[] = ['todo', 'backlog']
const byId = (x: BoardTask, y: BoardTask) => num(x.id) - num(y.id)

function finding(b: Board, reason: HealthReason, tasks: string[], text: string, consider: string): HealthFinding {
  const stamp = tasks.map(id => `${id}@${find(b, id)?.updated_at ?? '-'}`).join(',')
  return { reason, tasks, key: `${reason}:${stamp}`, text, consider }
}

/** Whether two files lists may touch the same file: an empty list means anywhere. Globs count up to their first * or ?. */
export function shareFiles(a: readonly string[], b: readonly string[]): boolean {
  if (!a.length || !b.length) return true
  const base = (g: string) => g.trim().replace(/^\.\//, '').replace(/[*?].*$/, '')
  return a.some(x => b.some(y => {
    const p = base(x)
    const q = base(y)
    return !p || !q || p.startsWith(q) || q.startsWith(p)
  }))
}

/** How many times task `t`'s after list was changed, by its history lines. */
export const afterChanges = (t: Pick<BoardTask, 'history'>) => (t.history ?? []).filter(l => l.startsWith(AFTER_CHANGED)).length

function stuck(b: Board): HealthFinding[] {
  const out: HealthFinding[] = []
  for (const t of b.tasks.filter(x => WAITS.includes(x.status)).sort(byId)) {
    for (const a of t.after) {
      const d = find(b, a)
      if (!d) {
        if ((b.archived_done ?? []).includes(a)) continue
        out.push(finding(b, 'stuck', [t.id, a], `${t.id} waits on ${a}, which is not on the board — it will never start`, `remove ${a} from ${t.id}'s after, or drop ${t.id}`))
      } else if (d.status === 'dropped') {
        out.push(finding(b, 'stuck', [t.id, d.id], `${t.id} waits on ${d.id}, which was dropped — it will never start`, `remove ${d.id} from ${t.id}'s after, or drop ${t.id}`))
      } else if (d.status === 'failed') {
        out.push(finding(b, 'stuck', [t.id, d.id], `${t.id} waits on ${d.id}, which failed — it won't start until ${d.id} is retried and done`, `retry ${d.id}, or remove it from ${t.id}'s after, or drop ${t.id}`))
      }
    }
  }
  return out
}

/** Loops in the after lists among tasks not done yet (each loop once, starting from its lowest id). */
function loops(b: Board): HealthFinding[] {
  const open = new Map(b.tasks.filter(t => t.status !== 'done' && t.status !== 'dropped').map(t => [t.id, t]))
  const seen = new Set<string>()
  const out: HealthFinding[] = []
  const state = new Map<string, 'on' | 'off'>()
  const path: string[] = []
  const walk = (id: string) => {
    state.set(id, 'on')
    path.push(id)
    for (const a of open.get(id)!.after) {
      if (!open.has(a)) continue
      if (state.get(a) === 'on') {
        const ring = path.slice(path.indexOf(a))
        const low = ring.reduce((m, x, i) => (num(x) < num(ring[m]!) ? i : m), 0)
        const cycle = [...ring.slice(low), ...ring.slice(0, low)]
        const k = cycle.join('>')
        if (!seen.has(k)) {
          seen.add(k)
          const shown = [...cycle, cycle[0]!].join(' after ')
          out.push(finding(b, 'loop', cycle, `${shown}: these tasks wait on each other in a loop — none of them will ever start`, 'take one link out of the loop (change its after)'))
        }
      } else if (!state.has(a)) walk(a)
    }
    path.pop()
    state.set(id, 'off')
  }
  for (const id of [...open.keys()].sort((x, y) => num(x) - num(y))) if (!state.has(id)) walk(id)
  return out
}

const started = (t: BoardTask) => !!t.runs?.length || ['doing', 'review', 'done'].includes(t.status)

function starving(b: Board, nowMs: number): HealthFinding[] {
  const out: HealthFinding[] = []
  for (const t of b.tasks.filter(x => x.status === 'todo').sort(byId)) {
    const blockers = t.after.map(a => find(b, a)).filter((d): d is BoardTask => !!d && d.status !== 'done')
    if (t.after.some(a => !find(b, a) && !(b.archived_done ?? []).includes(a))) continue // that is "stuck"
    if (!blockers.every(d => num(d.id) > num(t.id))) continue // it waits on an older task: fair
    const changes = afterChanges(t)
    const newer = b.tasks.filter(x => num(x.id) > num(t.id) && started(x)).length
    const age = nowMs - Date.parse(t.created_at || '')
    const why = changes >= STARVE_AFTER_CHANGES ? `its after list was changed ${changes} times` : age > STARVE_MS && newer >= STARVE_NEWER ? `it has waited ${Math.floor(age / 3_600_000)}+ hours while ${newer} newer tasks already started` : ''
    if (!why) continue
    const on = blockers.length ? `waits only on newer tasks (${blockers.map(d => d.id).join(', ')})` : 'could start but has not'
    out.push(finding(b, 'starving', [t.id], `${t.id} ${on}, and ${why} — it keeps getting pushed back`, `let ${t.id} go first: give it a lower order, and make newer tasks that share its files wait on it`))
  }
  return out
}

function serial(b: Board): HealthFinding[] {
  const todo = new Map(b.tasks.filter(t => t.status === 'todo').map(t => [t.id, t]))
  // next.get(a) = todo tasks that wait on a, with no files in common with it
  const next = new Map<string, string[]>()
  const hasPrev = new Set<string>()
  for (const t of [...todo.values()].sort(byId)) {
    for (const a of t.after) {
      const p = todo.get(a)
      if (!p || shareFiles(p.files, t.files)) continue
      next.set(a, [...(next.get(a) ?? []), t.id])
      hasPrev.add(t.id)
    }
  }
  const longest = (id: string, seen: Set<string>): string[] => {
    let best: string[] = []
    for (const n of next.get(id) ?? []) {
      if (seen.has(n)) continue
      const p = longest(n, new Set([...seen, n]))
      if (p.length > best.length) best = p
    }
    return [id, ...best]
  }
  const out: HealthFinding[] = []
  for (const id of [...next.keys()].filter(x => !hasPrev.has(x)).sort((x, y) => num(x) - num(y))) {
    const chain = longest(id, new Set([id]))
    if (chain.length < SERIAL_CHAIN) continue
    out.push(finding(b, 'serial', chain, `${chain.join(' → ')} run one after another, but each shares no files with the one before it — they could run side by side`, 'remove the after links between tasks that really share no files'))
  }
  return out
}

function owner(b: Board, nowMs: number): HealthFinding[] {
  return b.tasks
    .filter(t => (t.status === 'waiting' || t.status === 'review') && nowMs - Date.parse(t.updated_at || '') > OWNER_IDLE_MS)
    .sort(byId)
    .map(t => {
      const h = Math.floor((nowMs - Date.parse(t.updated_at)) / 3_600_000)
      const what = t.status === 'review' ? 'is ready for review' : 'waits for the owner'
      return finding(b, 'owner', [t.id], `${t.id} ${what} and nothing happened for ${h}+ hour${h > 1 ? 's' : ''}`, t.status === 'review' ? `remind the owner to approve or reject ${t.id}` : `remind the owner of ${t.id}'s question, or answer it yourself if you can`)
    })
}

/** Everything wrong with the board now; empty when it is healthy. */
export function boardHealth(b: Board, nowMs: number): HealthFinding[] {
  return [...stuck(b), ...loops(b), ...starving(b, nowMs), ...serial(b), ...owner(b, nowMs)]
}

/**
 * The findings not told yet (by key), and the keys to remember from now on: only those found
 * now, so a problem that went away and comes back is told again.
 */
export function newFindings(found: readonly HealthFinding[], told: ReadonlySet<string>): { fresh: HealthFinding[]; told: Set<string> } {
  return { fresh: found.filter(f => !told.has(f.key)), told: new Set(found.map(f => f.key)) }
}

/** The one "triage needed" message for the lead. */
export function healthText(found: readonly HealthFinding[]): string {
  return [`Triage needed: the board health check found ${found.length === 1 ? 'a problem' : `${found.length} problems`}:`, ...found.map(f => `- ${f.text}. Consider: ${f.consider}.`), 'Older tasks first unless the owner said one is urgent; bugs and safety fixes before features. Fix it with the board tools (change after / order, retry, drop), or ask the owner if it is their call.'].join('\n')
}
