import { notePlan, planEndText } from '../board'
import { planFromMode } from '../claude/plan'
import { publish } from './lead'
import { S } from './state'
import type { Host } from '../host'
import { load } from './store'
import { tellLead } from './tell'
import { pump } from './workers'

// ---------------- plan mode ----------------
// The host's adapter passes every plan mode signal of the main session here (see core/plan.ts; for Claude Code,
// claude/plan.ts and the hooks in register.tsx).
// A change is shown at once (band and status line). Leaving plan mode tells the lead once which tasks
// went to the backlog during it, and lets ready work start again; backlog tasks are never moved by themselves.

/** A signal about the main session's plan mode: true on, false off, null says nothing. */
export async function seePlan($: Host, on: boolean | null) {
  const r = notePlan(S.plan, on)
  if (!r.changed) return
  S.plan = r.plan
  const b = await load($)
  await publish($, b).catch(() => undefined)
  if (!r.left) return
  const text = planEndText(r.left, b.tasks, S.N.name)
  if (text) tellLead($, text)
  void pump($)
}

/** A classic.* event of the main session (no agent_id; a worker's or scout's is left out): its permission_mode. */
export function seeMainMode($: Host, e: { permission_mode?: string; agent_id?: string }) {
  if (e.agent_id) return
  void seePlan($, planFromMode(e.permission_mode)).catch(() => undefined)
}
