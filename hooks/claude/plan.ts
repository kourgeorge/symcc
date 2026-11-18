// Claude Code's plan mode signals. Claude Code has no call for the mode and no event when it changes, so
// symcc learns it from fields on some events (see docs/research/plan-mode.md):
//   classic.* events (not classic.PreToolUse): e.permission_mode
//   agent.spawn: e.permissionMode
//   prompt.attachment of type plan_mode / plan_mode_reentry (on) and plan_mode_exit (off)
// core/plan.ts and plugin/plan.ts work on plain on (true) / off (false) / says nothing (null).
import type { Host } from '../host'
import { seePlan } from '../plugin/plan'

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

/** A classic.* event of the main session (no agent_id; a worker's or scout's is left out): its permission_mode. */
export function seeMainMode($: Host, e: { permission_mode?: string; agent_id?: string }) {
  if (e.agent_id) return
  void seePlan($, planFromMode(e.permission_mode)).catch(() => undefined)
}

/** An agent.spawn event: a spawn from the main chat (no parentAgentId) carries the main chat's permissionMode. */
export function seeSpawnMode($: Host, e: { parentAgentId?: string; permissionMode?: string }) {
  if (!e.parentAgentId) void seePlan($, planFromMode(e.permissionMode)).catch(() => undefined)
}

/** A prompt.attachment event of the main session (no agentId): plan_mode / plan_mode_reentry while plan mode is on, plan_mode_exit when it ended. */
export function seeAttachment($: Host, e: { agentId?: string; type?: string }) {
  if (!e.agentId) void seePlan($, planFromAttachment(e.type)).catch(() => undefined)
}
