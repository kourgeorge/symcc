// T-391: symcc queues every agent start (hooks/app/starts.ts) and starts them only from session.start, the main
// loop's turn.start and turn.complete. Tests that call the plugin's code directly (not through the loaded plugin)
// play that hook here: drainStarts with the test's host, as register.tsx's hooks do.
import type { Host } from '../hooks/host'
import { drainStarts, queuedStarts } from '../hooks/app/starts'

const later = () => new Promise<void>(r => (globalThis as unknown as { setTimeout(fn: () => void, ms: number): unknown }).setTimeout(r, 0))

/** Waits for `p`, starting each queued agent with `host` as a hook would (a turn's start or end) while it waits. */
export async function withStarts<T>(host: Host, p: Promise<T>): Promise<T> {
  let over = false
  const out = p.finally(() => (over = true))
  out.catch(() => undefined)
  for (let i = 0; !over; i++) {
    if (queuedStarts()) await drainStarts(host)
    if (i % 50 === 49) await later()
    else await Promise.resolve()
  }
  return out
}

/** Starts what is queued now, as a turn's start or end does; returns how many waited. */
export async function turnNow(host: Host): Promise<number> {
  const n = queuedStarts()
  await drainStarts(host)
  return n
}
