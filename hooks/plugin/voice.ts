import type { SymccTask } from '../../types'
import { type Board, voiceOn, symccOn, spokenLine, NEEDS_YOU_MARK } from '../board'
import { type $, S, sayQueue } from './state'

// ---------------- saying it out loud ----------------

export function speakers($: $): Promise<string[][]> {
  S.speaker ??= $.process
    .run(['uname', '-s'], { timeoutMs: 5000 })
    .then(r => {
      const os = String(r.stdout ?? '').trim()
      if (os === 'Darwin') return [['say', '-r', '200']]
      if (os === 'Linux') return [['spd-say', '-w'], ['espeak']]
      return []
    })
    .catch(() => [])
  return S.speaker
}

/** Says "T-3 done" for a merged task, if this session drives the board and voice is on. Never waits, never shows an error. */
export function sayDone($: $, b: Board, id: string) {
  queueSay($, b, id)
}

/** The waiting questions already said ("task id#try#question"), so each one is said only once. */
export const saidNeedsYou = new Set<string>()

/**
 * Says "T-5 needs you" when task `t`'s worker asked the owner something (QUESTION or NEED FILES),
 * once per waiting question, under the same rules and in the same queue as "T-3 done".
 */
export function sayNeedsYou($: $, b: Board, t: Pick<SymccTask, 'id' | 'attempts'>, question = '') {
  const key = `${t.id}#${t.attempts}#${question}`
  if (saidNeedsYou.has(key)) return
  if (queueSay($, b, NEEDS_YOU_MARK + t.id)) saidNeedsYou.add(key)
}

/** Adds `item` to the voice queue and says the queue soon; false when nothing is said here (not the driver, voice or plugin off). */
function queueSay($: $, b: Board, item: string): boolean {
  if (!S.driving || !voiceOn(b) || !symccOn(b)) return false
  sayQueue.push(item)
  if (S.sayTimer || S.saying) return true
  S.sayTimer = $.clock.after(1500, () => {
    S.sayTimer = null
    void sayNext($)
  })
  return true
}

export async function sayNext($: $) {
  if (S.saying) return
  const text = spokenLine(sayQueue.splice(0))
  if (!text) return
  S.saying = true
  try {
    for (const cmd of await speakers($)) {
      const r = await $.process.run([...cmd, text], { timeoutMs: 30_000 }).catch(() => null)
      if (r && r.exitCode === 0) break
    }
  } catch {
    // stay silent
  } finally {
    S.saying = false
  }
  if (sayQueue.length) void sayNext($)
}
