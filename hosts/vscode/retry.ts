// A run the agent service ended, not the agent (a gateway timeout, a dropped stream, an overloaded service): symcc
// waits and sends the agent on from where it stopped, a few times, instead of failing a worker's try or the lead's
// turn on it. The SDK's own retries cover a request; these cover a run that already ended on such an error.
import { short } from './steps'

/** How long symcc waits before each new try of a run the agent service cut off. */
export const RETRY_DELAYS_MS: readonly number[] = [15_000, 45_000, 120_000]

const SERVICE_ERROR = /\b(?:50[0234]|429)\b|unavailable|deadline|timed? ?out|overloaded|rate.?limit|resource.?exhausted|internal (?:server )?error|bad gateway|stream (?:closed|ended|stalled|reset)|connection (?:closed|reset|lost)|network|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up/i
const NOT_SERVICE = /unauthenticated|unauthori[sz]ed|forbidden|api key|not logged in|\b40[13]\b|context (?:length|window|limit)|too long|maximum context/i

/** The service's error in `text`, shortened, when another try may get through; undefined for any other error. */
export function serviceErrorText(text: string): string | undefined {
  let t = text.trim()
  try {
    const m = (JSON.parse(t) as { message?: unknown }).message
    if (typeof m === 'string') t = m
  } catch {
    // not JSON: the text as it is
  }
  if (!SERVICE_ERROR.test(t) || NOT_SERVICE.test(t)) return undefined
  return short(t, 160)
}

/** The service's error a run ended on, when another try may get through. */
export function serviceError(r: { status: string; error?: unknown }): string | undefined {
  if (r.status !== 'error' || r.error === undefined) return undefined
  return serviceErrorText(typeof r.error === 'string' ? r.error : JSON.stringify(r.error))
}

/** What sends an agent on after the service cut its turn off: a worker finishes and hands back, the lead answers. */
export const resumeText = (why: string, lead = false): string =>
  `Your last turn was cut off by an error on the agent service (${why}), not by anything you did. Carry on from where you stopped: ` +
  (lead ? 'what you did so far still stands, so finish it and answer the owner.' : 'look at the files as they are now (what you changed so far is still there), finish the work, and end your turn as your instructions say.')

/** What the board shows while symcc waits to send an agent on. */
export const retryingText = (why: string, ms: number, n: number, of: number): string => `retrying: ${why}; symcc sends it on in ${Math.round(ms / 1000)}s (${n} of ${of})`

/** Waits `ms`; `wake` ends the wait early (a stop). */
export function pause(ms: number): { done: Promise<void>; wake: () => void } {
  let wake!: () => void
  const done = new Promise<void>(r => {
    const timer = setTimeout(r, ms)
    wake = () => (clearTimeout(timer), r())
  })
  return { done, wake }
}
