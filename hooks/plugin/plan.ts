import { notePlan, planEndText, planFromMode } from '../board'
import { publish } from './lead'
import { type $, S } from './state'
import { load } from './store'
import { tellLead } from './tell'
import { pump } from './workers'

// ---------------- plan mode ----------------
// The hooks in register.tsx pass every plan mode signal of the main session here (see core/plan.ts).
// A change is shown at once (band and status line). Leaving plan mode tells the lead once which tasks
// went to the backlog during it, and lets ready work start again; backlog tasks are never moved by themselves.

/** A signal about the main session's plan mode: true on, false off, null says nothing. */
export async function seePlan($: $, on: boolean | null) {
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
export function seeMainMode($: $, e: { permission_mode?: string; agent_id?: string }) {
  if (e.agent_id) return
  void seePlan($, planFromMode(e.permission_mode)).catch(() => undefined)
}
