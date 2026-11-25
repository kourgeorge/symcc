import { type Board, boardHealth, healthText, newFindings, symccOn } from '../board'
import { S, onHere } from './state'
import type { Host } from '../host'
import { path } from './store'
import { tellLead } from './tell'

// ---------------- the board health check ----------------
// Run by the driving session after each board change and on the regular check. It tells the
// lead (one "triage needed" message) only about problems not told before; a healthy board,
// or one whose problems were all told already, sends nothing. The told keys are kept per
// project (in S) and saved in the data folder, so a plugin reload does not tell them again.

const toldFile = () => path(`${S.N.dir}/health-told.json`)

export async function checkHealth($: Host, b: Board, nowMs = Date.now()) {
  if (!S.driving || !onHere(b)) return
  S.healthLoad ??= $.fs.read(toldFile()).then(text => { for (const k of JSON.parse(text) as string[]) S.healthTold.add(k) }).catch(() => undefined)
  await S.healthLoad
  const r = newFindings(boardHealth(b, nowMs), S.healthTold)
  const changed = r.told.size !== S.healthTold.size || r.fresh.length > 0
  S.healthTold.clear()
  for (const k of r.told) S.healthTold.add(k)
  if (changed) await $.fs.write(toldFile(), JSON.stringify([...r.told])).catch(() => undefined)
  if (r.fresh.length) tellLead($, healthText(r.fresh))
}
