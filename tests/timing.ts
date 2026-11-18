// T-478: speed checks that don't flake when the machine is busy. A tight wall-clock limit (500 ms) failed at 549 ms
// while the full suite ran, so instead each speed test (1) checks the work grows slowly: the big case takes at most
// `times` the small case, plus a little slack for timer noise, and (2) keeps a generous absolute cap. The bugs these
// catch were doubling per cd or brace (2^40 steps for 40 cd lines): that never finishes, so it fails both checks.

// the absolute cap for one speed check: far above a normal run, far below the seconds-long doubling bug
export const SPEED_CAP_MS = 3000
// timer noise allowed on top of the growth ratio, so a tiny small case (well under 1 ms) can't make the check flaky
export const GROWTH_SLACK_MS = 50

// how long f takes, in ms
export const msOf = (f: () => unknown): number => {
  const t0 = performance.now()
  f()
  return performance.now() - t0
}
export const msOfAsync = async (f: () => Promise<unknown>): Promise<number> => {
  const t0 = performance.now()
  await f()
  return performance.now() - t0
}

// the fastest of a few runs: one run slowed by a busy machine doesn't count, a real slowdown shows in every run
export const bestMsOf = (f: () => unknown, runs = 3): number =>
  Math.min(...Array.from({ length: runs }, () => msOf(f)))
export const bestMsOfAsync = async (f: () => Promise<unknown>, runs = 3): Promise<number> => {
  let best = Infinity
  for (let i = 0; i < runs; i++) best = Math.min(best, await msOfAsync(f))
  return best
}

// true when the big case took at most `times` the small one (plus slack) and stayed under the cap
export const growsSlowly = (smallMs: number, bigMs: number, times: number): boolean =>
  bigMs < times * smallMs + GROWTH_SLACK_MS && bigMs < SPEED_CAP_MS
