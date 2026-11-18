// The time a board page or the band is drawn at: the running times ("▶ 9m", "try 2: 6m (running)", "total: 26m"),
// the banner and the day groups. It is read from the host's clock ($.clock.now), not from Date.now(), so a test
// that fixes the clock (the kit's mock.clock) draws the same page whatever the time of day the tests run at.
import { type $ } from '../../claude/panel'

/** Milliseconds since the epoch, now, from the host's clock; Date.now() if the host can't answer. */
export async function drawNow($: $): Promise<number> {
  try {
    const ms = await $.clock.now()
    return Number.isFinite(ms) ? ms : Date.now()
  } catch {
    return Date.now()
  }
}
