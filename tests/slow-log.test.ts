// T-1048: a step over 200 ms writes one line to .symcc/slow.log; a fast one writes none; the file is capped.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { S } from '../hooks/app/state'
import { timed, timedSync, startLagTimer, slowClock, slowLogSettled, SLOW_LINES } from '../hooks/app/slow-log'
import { fakeHost, memoryFs } from './fake-host'

const FILE = '/repo/.symcc/slow.log'

function world() {
  const files = new Map<string, string>()
  const host = fakeHost({ fs: memoryFs(files) })
  S.root = '/repo'
  let t = 1_000_000
  slowClock.now = () => t
  return { files, host: host.host, tick: (ms: number) => (t += ms) }
}

test('T-1048: a step over 200 ms writes one line, a fast one none', async () => {
  const w = world()
  try {
    await timed(w.host, 'fast step', async () => w.tick(150))
    await slowLogSettled()
    expect(w.files.has(FILE)).toBe(false)
    await timed(w.host, 'slow step', async () => w.tick(300))
    await slowLogSettled()
    const lines = w.files.get(FILE)!.trim().split('\n')
    expect(lines.length).toBe(1)
    expect(lines[0]!.includes('slow step 300 ms')).toBe(true)
    timedSync(w.host, 'gitWriteIn', () => w.tick(250))
    await slowLogSettled()
    expect(w.files.get(FILE)!.trim().split('\n').length).toBe(2)
  } finally {
    slowClock.now = () => Date.now()
  }
})

test('T-1048: the log keeps only the last lines', async () => {
  const w = world()
  try {
    w.files.set(FILE, Array.from({ length: SLOW_LINES }, (_, i) => `old ${i}`).join('\n') + '\n')
    await timed(w.host, 'new step', async () => w.tick(500))
    await slowLogSettled()
    const lines = w.files.get(FILE)!.trim().split('\n')
    expect(lines.length).toBe(SLOW_LINES)
    expect(lines[0]).toBe('old 1')
    expect(lines[lines.length - 1]!.includes('new step 500 ms')).toBe(true)
  } finally {
    slowClock.now = () => Date.now()
  }
})

test('T-1048: the lag timer writes a line when it fires over a second late', async () => {
  const files = new Map<string, string>()
  let beat: () => void = () => undefined
  const h = fakeHost({ fs: memoryFs(files), clock: { every: (_ms, fn) => ((beat = fn), { cancel: () => undefined }) } })
  S.root = '/repo'
  let t = 5_000_000
  slowClock.now = () => t
  try {
    startLagTimer(h.host)
    t += 250
    beat()
    await slowLogSettled()
    expect(files.has(FILE)).toBe(false)
    t += 3000
    beat()
    await slowLogSettled()
    expect(files.get(FILE)!.includes('lag 2750 ms late')).toBe(true)
  } finally {
    slowClock.now = () => Date.now()
  }
})
