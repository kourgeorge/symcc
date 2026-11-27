// T-1173: sends the lead its periodic digest (see core/digest.ts) as a board update; called by the watchdog.
import { digestText, DIGEST_EVERY_MS } from '../core/digest'
import type { Host } from '../host'
import { S } from './state'
import { load } from './store'
import { tellLead } from './tell'

/**
 * At most one digest every DIGEST_EVERY_MS, and only the driving session's, and only when there is something to say.
 * The first call after a start only sets the time (no digest at once after a restart). `nowMs` is for the tests.
 */
export async function digestTick(host: Host, nowMs = Date.now()): Promise<boolean> {
  if (!S.enabledNow || !S.driving || S.fresh || S.guardOnly) return false
  if (!S.lastDigest) {
    S.lastDigest = nowMs
    return false
  }
  if (nowMs - S.lastDigest < DIGEST_EVERY_MS) return false
  const b = await load(host).catch(() => null)
  if (!b) return false
  const text = digestText(b.tasks, S.lastDigest, nowMs)
  if (!text) return false
  S.lastDigest = nowMs
  tellLead(host, text)
  return true
}
