// Plan mode (Claude Code's read-only planning mode, Shift+Tab): while the main session is in it,
// nothing starts. New tasks go to the backlog, pump and the scout timer skip, workers already
// running keep going. Claude Code has no call for the mode and no event when it changes, so
// symcc learns it from fields on some events (see docs/research/plan-mode.md):
//   classic.* events (not classic.PreToolUse): e.permission_mode
//   agent.spawn: e.permissionMode
//   prompt.attachment of type plan_mode / plan_mode_reentry (on) and plan_mode_exit (off)
// Until one of those is seen the mode is unknown, and symcc behaves as if not in plan mode.
// Everything here is pure, so it can be tested without Claude.
import type { SymccTask } from '../../types'
import { DEFAULT_NAME } from '../name'

/** What this session knows about plan mode: `on` null = not known yet; `added` = tasks put in the backlog during it. */
export type PlanState = { on: boolean | null; added: string[] }

export const emptyPlan = (): PlanState => ({ on: null, added: [] })

/** The words shown on the band and the status strip while in plan mode. */
export const PLAN_NOTE = 'plan mode: nothing starts'

/** A permission mode name read from an event → plan mode on (true), off (false), or not known (null). */
export function planFromMode(mode: unknown): boolean | null {
  if (typeof mode !== 'string' || !mode.trim()) return null
  return mode.trim() === 'plan'
}

/** A prompt.attachment type → plan mode on (true), off (false), or says nothing about it (null). */
export function planFromAttachment(type: unknown): boolean | null {
  if (type === 'plan_mode' || type === 'plan_mode_reentry') return true
  if (type === 'plan_mode_exit') return false
  return null
}

/** Whether the session is in plan mode now; an unknown mode counts as not (behave as before). */
export const inPlan = (p: Pick<PlanState, 'on'>) => p.on === true

/**
 * What a new signal does. `on` null changes nothing. Leaving plan mode (on → off) gives `left`: the tasks added
 * to the backlog during it, so the lead is told once; the list starts over. Otherwise `left` is null.
 */
export function notePlan(p: PlanState, on: boolean | null): { plan: PlanState; left: string[] | null; changed: boolean } {
  if (on === null || on === p.on) return { plan: p, left: null, changed: false }
  if (p.on === true && !on) return { plan: { on: false, added: [] }, left: p.added, changed: true }
  return { plan: { on, added: on ? p.added : [] }, left: null, changed: true }
}

/** `symcc add`: in plan mode a new task goes to the backlog, as if backlog: true. */
export const planBacklog = (asked: boolean, p: Pick<PlanState, 'on'>) => asked || inPlan(p)

/** Notes task `id` as added during plan mode (once). */
export function planAdded(p: PlanState, id: string): PlanState {
  return p.added.includes(id) ? p : { ...p, added: [...p.added, id] }
}

/** The add tool's answer for a task put in the backlog because of plan mode. */
export const planAddText = (id: string, title: string) => `plan mode: ${id} ${title} added to the backlog; nothing starts`

/** Why a scout doesn't start in plan mode. */
export const planScoutText = (scout: string) => `plan mode: nothing starts, so scout ${scout} waits; leave plan mode first`

/** The band's plan mode words: with workers still running, say they keep going. */
export function planBandText(running: number): string {
  if (running <= 0) return PLAN_NOTE
  return `${PLAN_NOTE} (${running === 1 ? '1 worker keeps' : `${running} workers keep`} going)`
}

/**
 * The message for the lead when plan mode ends: the tasks added during it that are still in the backlog
 * ('' when there are none, so the lead isn't woken for nothing). It asks the lead to let the owner choose;
 * nothing is moved by itself.
 */
export function planEndText(added: readonly string[], tasks: readonly Pick<SymccTask, 'id' | 'title' | 'status'>[], name: string = DEFAULT_NAME): string {
  const still = added.map(id => tasks.find(t => t.id === id)).filter((t): t is Pick<SymccTask, 'id' | 'title' | 'status'> => !!t && t.status === 'backlog')
  if (!still.length) return ''
  return [
    `Plan mode is off. ${still.length === 1 ? '1 task was' : `${still.length} tasks were`} added to the backlog during plan mode:`,
    ...still.map(t => `- ${t.id} ${t.title}`),
    `Ask the owner which ones to move to todo (${name} change backlog: false); don't move them without asking.`,
  ].join('\n')
}
