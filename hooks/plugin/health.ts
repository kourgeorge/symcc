import { type Board, boardHealth, healthText, newFindings, symccOn } from '../board'
import { S, type $, healthTold } from './state'
import { tellLead } from './tell'

// ---------------- the board health check ----------------
// Run by the driving session after each board change and on the regular check. It tells the
// lead (one "triage needed" message) only about problems not told before; a healthy board,
// or one whose problems were all told already, sends nothing.

export function checkHealth($: $, b: Board, nowMs = Date.now()) {
  if (!S.driving || !symccOn(b)) return
  const r = newFindings(boardHealth(b, nowMs), healthTold)
  healthTold.clear()
  for (const k of r.told) healthTold.add(k)
  if (r.fresh.length) tellLead($, healthText(r.fresh))
}
