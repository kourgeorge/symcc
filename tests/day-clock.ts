// T-792: clocks for tests that build "today" data relative to now. A test that puts its data "20 minutes ago" from the
// real clock fails between 00:00 and 00:20, when that lands on yesterday; these give a time that is always inside today.
import { localOffset } from '../hooks/core/days'

/** Today (the real clock's local day) at hh:mm local time, in ms. Not a fixed date: the day is always the current one. */
export function todayAt(h: number, m = 0, base = Date.now()): number {
  const d = new Date(base)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

/** The start of nowMs's local day, worked out the way the board does (the time zone offset at nowMs). */
export function dayStartOf(nowMs: number): number {
  const off = localOffset(nowMs)
  return nowMs - ((((nowMs + off * 60_000) % 86_400_000) + 86_400_000) % 86_400_000)
}

/** A moment between nowMs's local midnight and nowMs: `share` 0 is midnight, 1 is nowMs. Always inside today. */
export function inToday(nowMs: number, share: number): number {
  const start = dayStartOf(nowMs)
  return start + Math.round((nowMs - start) * share)
}
