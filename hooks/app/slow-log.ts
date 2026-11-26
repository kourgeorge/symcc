import type { Host, HostTimer } from '../host'
import { S } from './state'

// T-1048: a small log of slow steps, for the next "the hooks worker is wedged". One line per step that took over
// SLOW_MS: when it ended, its name and how long it took. A lag timer adds a "lag" line when the worker's own
// timer fires over a second late (the worker was busy). The file keeps only the last SLOW_LINES lines.

/** A step slower than this (ms) gets a line. */
export const SLOW_MS = 200
/** The lag timer's beat (ms), and how much later than that it must fire to get a line. */
export const LAG_BEAT_MS = 250
export const LAG_LATE_MS = 1000
/** The file keeps this many lines. */
export const SLOW_LINES = 500
/** The file, inside the board's folder. */
export const SLOW_LOG_FILE = 'slow.log'

/** What the log reads the time from (the tests set it). */
export const slowClock = { now: () => Date.now() }

let queue: Promise<void> = Promise.resolve()

/** Adds one line to the file (never throws, never waits for the caller). */
function addLine(host: Host, line: string): Promise<void> {
  // T-1119: no board here (fresh or guard only): write nothing, so no stray .symcc/ folder appears.
  if (!S.root || S.fresh || S.guardOnly) return Promise.resolve()
  const file = `${S.root}/${S.N.dir}/${SLOW_LOG_FILE}`
  queue = queue.then(async () => {
    const old = await host.fs.read(file).catch(() => '')
    const lines = old.split('\n').filter(Boolean)
    lines.push(line)
    await host.fs.write(file, lines.slice(-SLOW_LINES).join('\n') + '\n')
  }).catch(() => undefined)
  return queue
}

function note(host: Host, step: string, started: number) {
  const ms = slowClock.now() - started
  if (ms > SLOW_MS) void addLine(host, `${new Date(slowClock.now()).toISOString()} ${step} ${ms} ms`)
}

/** Runs fn; a run over SLOW_MS writes a line (also when fn throws). Gives back what fn gives. */
export async function timed<T>(host: Host, step: string, fn: () => Promise<T>): Promise<T> {
  const started = slowClock.now()
  try {
    return await fn()
  } finally {
    note(host, step, started)
  }
}

/** The same for a step that does not wait. */
export function timedSync<T>(host: Host, step: string, fn: () => T): T {
  const started = slowClock.now()
  try {
    return fn()
  } finally {
    note(host, step, started)
  }
}

let lag: HostTimer | undefined

/** Starts (again) the lag timer: when it fires more than LAG_LATE_MS later than its beat, a "lag" line says by how much. */
export function startLagTimer(host: Host) {
  lag?.cancel()
  let last = slowClock.now()
  lag = host.clock.every(LAG_BEAT_MS, () => {
    const t = slowClock.now()
    const late = t - last - LAG_BEAT_MS
    last = t
    if (late > LAG_LATE_MS) void addLine(host, `${new Date(t).toISOString()} lag ${late} ms late`)
  })
}

/** For the tests: waits until the lines asked for so far are written. */
export const slowLogSettled = () => queue
