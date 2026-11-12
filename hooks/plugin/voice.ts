import { type Board, voiceOn, symccOn, spokenDone } from '../board'
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
  if (!S.driving || !voiceOn(b) || !symccOn(b)) return
  sayQueue.push(id)
  if (S.sayTimer || S.saying) return
  S.sayTimer = $.clock.after(1500, () => {
    S.sayTimer = null
    void sayNext($)
  })
}

export async function sayNext($: $) {
  if (S.saying) return
  const text = spokenDone(sayQueue.splice(0))
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
