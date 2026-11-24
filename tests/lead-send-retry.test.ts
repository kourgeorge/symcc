// T-490: a board update whose send to the lead fails is not lost: its lines go back to the front of the queue (still
// urgent if they were), one debug line is logged, and it goes out once with the next update, or after LEAD_RETRY_MS.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { fakeHost } from './fake-host'
import { S, leadQueue } from '../hooks/app/state'
import { tellLead, noteForLead, LEAD_RETRY_MS } from '../hooks/app/tell'
import type { LeadSend } from '../hooks/host'

/** A host that wakes the lead at once, whose lead.send rejects `fails` times; its timers fire only when the test says. */
function world(fails: number) {
  const sent: { text: string; urgent: boolean }[] = []
  const logged: string[] = []
  const due: { ms: number; run: () => void; off: boolean }[] = []
  let left = fails
  const f = fakeHost({
    lead: {
      send: async (text: string, how?: LeadSend) => {
        if (left > 0) {
          left--
          throw new Error('the lead session is gone')
        }
        sent.push({ text, urgent: how?.urgent === true })
      },
    },
    clock: {
      after: (ms, run) => {
        const t = { ms, run, off: false }
        due.push(t)
        return { cancel: () => void (t.off = true) }
      },
    },
    ui: { log: (text, o) => void (o?.to === 'debug' && logged.push(text)) },
  })
  /** Runs the timers that are set now (and not cancelled), then lets the sends settle. */
  const tick = async () => {
    for (const t of due.splice(0)) if (!t.off) t.run()
    for (let i = 0; i < 5; i++) await Promise.resolve()
  }
  return { host: f.host, sent, logged, due, tick }
}

test('a board update whose send fails goes back in the queue, still urgent, and arrives once with the next update', async () => {
  const w = world(1)
  noteForLead('The owner approved T-1')
  tellLead(w.host, 'T-5 needs you.', { urgent: true })
  await w.tick()
  // the send failed: nothing arrived, the line waits again (still urgent), one debug line
  expect(w.sent).toEqual([])
  expect(leadQueue).toEqual(['T-5 needs you.'])
  expect(S.leadUrgent).toBe(true)
  expect(w.logged.length).toBe(1)
  expect(w.logged[0]).toContain('the lead session is gone')
  // not a tight loop: one retry, two minutes away
  expect(w.due.map(t => t.ms)).toEqual([LEAD_RETRY_MS])
  // the next update carries it at once (the retry wait is dropped), once and urgent
  tellLead(w.host, 'T-6 was merged.')
  expect(w.due.filter(t => !t.off).map(t => t.ms)).toEqual([1500])
  await w.tick()
  expect(w.sent.length).toBe(1)
  expect(w.sent[0]!.urgent).toBe(true)
  expect(w.sent[0]!.text).toContain('Meanwhile (nothing to answer):\n- The owner approved T-1\n\nT-5 needs you.\n\nT-6 was merged.')
  expect(w.sent[0]!.text.split('T-5 needs you.').length).toBe(2)
  expect(w.sent[0]!.text.split('Board update:').length).toBe(2)
  expect(leadQueue).toEqual([])
  expect(S.leadUrgent).toBe(false)
  // nothing more goes out
  await w.tick()
  expect(w.sent.length).toBe(1)
})

test('with no new update, a failed board update is tried again after the retry wait, and not sent twice', async () => {
  const w = world(1)
  tellLead(w.host, 'T-7 failed its tests.')
  await w.tick()
  expect(w.sent).toEqual([])
  await w.tick() // the retry timer
  expect(w.sent.length).toBe(1)
  expect(w.sent[0]!.urgent).toBe(false)
  expect(w.sent[0]!.text).toContain('T-7 failed its tests.')
  expect(w.due).toEqual([])
  expect(w.logged.length).toBe(1)
})
