// T-768: a board with something in every part of /symcc-stats (tries, timed stages, failed tries and tests, roles,
// origins with scouts, the whole team and this session's $), for the drawn stats in Claude Code's chat.
import type { SymccRun, SymccTask } from '../types'
import type { StatsInput } from '../hooks/core/stats'
import { addScoutRun, parseScoutUsage } from '../hooks/core/stats'
import { oldHistoryFacts } from '../hooks/core/old-data'

/** The time the fixture is read at: dates are relative to it (one day, one hour ago ...). */
export const VIEW_NOW = Date.now()
const iso = (minAgo: number) => new Date(VIEW_NOW - minAgo * 60_000).toISOString()

/** A try from `from` to `to` minutes ago, with `tok` input tokens (and a tenth of them output). */
const run = (from: number, to: number, tok: number, over: Partial<SymccRun> = {}): SymccRun => ({ started: iso(from), ended: iso(to), ...over, agents: [{ kind: 'worker' as const, started: iso(from), ended: iso(to), tokens: { input: tok, output: tok / 10, cache_read: tok * 2 } }] })
/** A done change task made `made` minutes ago: one try of work, then prep, check, the queue, tests and the merge, each timed. */
function done(id: string, title: string, made: number, tries: SymccRun[], over: Partial<SymccTask> = {}): SymccTask {
  const end = tries[tries.length - 1]!
  const endMin = (VIEW_NOW - Date.parse(end.ended!)) / 60_000
  const at = (m: number) => iso(endMin - m)
  // T-806: the facts of each line (step, reason, how ...) as the writers set them, here read out of the text by the doctor's old parsers
  const withFacts = (t: SymccTask): SymccTask => ({ ...t, history: t.history.map(e => ({ ...e, ...oldHistoryFacts(e) })) })
  return withFacts({
    id, title, details: '', files: [], status: 'done', note: '', question: null, order: 0, after: [], attempts: tries.length, branch: null,
    created_at: iso(made), updated_at: at(9), runs: tries,
    history: [
      { at: iso(made), kind: 'added', text: 'added' },
      { at: at(1), kind: 'stage', text: `try ${tries.length}: prep started` },
      { at: at(2), kind: 'stage', text: `try ${tries.length}: checker started` },
      { at: at(4), kind: 'stage', text: `try ${tries.length}: waits in the merge queue (place 1)` },
      { at: at(5), kind: 'stage', text: `try ${tries.length}: tests started` },
      { at: at(8), kind: 'stage', text: `try ${tries.length}: merge started` },
      { at: at(9), kind: 'merged', text: `try ${tries.length}: done → merged into main (abc1234)` },
    ],
    ...over,
  })
}

/** The stats input: done tasks (one sent back by the tests, one by the checker), a running one, a dropped one, an
 *  investigation, tasks from scouts, the lead's calls and this session's $. */
export function viewInput(over: Partial<StatsInput> = {}): StatsInput {
  const failedTests = run(300, 280, 4000, { ended_by: 'finished', ended_note: 'tests failed', failed_command: 'sh scripts/test-files.sh', failed_tests: ['stats draws its bars'] })
  const sentBack = run(200, 190, 2000, { ended_by: 'finished', ended_note: 'the checker found problems' })
  const tasks: SymccTask[] = [
    done('T-1', 'Parser for the stats command', 400, [run(390, 360, 12_000)], { role: 'general', origin: { by: 'owner' } as SymccTask['origin'] }),
    done('T-2', 'Bars line up on narrow screens', 320, [failedTests, run(270, 240, 9000)], {
      role: 'ui', origin: { by: 'scout', scout: 'bugs' } as SymccTask['origin'],
      history: [{ at: iso(320), kind: 'added', text: 'added' }, { at: iso(280), kind: 'failed', text: 'try 1: done → tests failed (sh scripts/test-files.sh)' }, { at: iso(279), kind: 'failed', text: 'try 1: done → tests failed (sh scripts/test-files.sh)' }, { at: iso(278), kind: 'failed', text: 'try 1: done → tests failed (sh scripts/test-files.sh)' }, { at: iso(235), kind: 'stage', text: 'try 2: tests started' }, { at: iso(230), kind: 'merged', text: 'try 2: done → merged into main (abc1234)' }],
    }),
    done('T-3', 'Colors by meaning', 210, [sentBack, run(185, 170, 3000)], {
      role: 'ui', origin: { by: 'lead' } as SymccTask['origin'],
      history: [{ at: iso(210), kind: 'added', text: 'added' }, { at: iso(190), kind: 'checker-problems', text: 'try 1: done → the checker found problems: a bar is too wide' }, { at: iso(189), kind: 'checker-problems', text: 'try 1: done → the checker found problems: a bar is too wide' }, { at: iso(188), kind: 'checker-problems', text: 'try 1: done → the checker found problems: a bar is too wide' }, { at: iso(165), kind: 'stage', text: 'try 2: tests started' }, { at: iso(160), kind: 'merged', text: 'try 2: done → merged into main (abc1234)' }],
    }),
    done('T-4', 'Footer hints', 120, [run(110, 100, 1500)], { origin: { by: 'scout', scout: 'bugs' } as SymccTask['origin'] }),
    { id: 'T-5', title: 'Still going', details: '', files: [], status: 'doing', note: '', question: null, order: 0, after: [], attempts: 1, history: [], branch: null, created_at: iso(60), updated_at: iso(5), runs: [{ started: iso(50), agents: [{ kind: 'worker' as const, started: iso(50), tokens: { input: 800 } }] }], origin: { by: 'worker', task: 'T-1' } as SymccTask['origin'] },
    { id: 'T-6', title: 'Dropped idea', details: '', files: [], status: 'dropped', note: '', question: null, order: 0, after: [], attempts: 0, history: [], branch: null, created_at: iso(90), updated_at: iso(80), origin: { by: 'scout', scout: 'ideas' } as SymccTask['origin'] },
    { id: 'T-7', title: 'Why is the lead slow?', details: '', files: [], status: 'done', kind: 'investigation', note: '', question: null, order: 0, after: [], attempts: 1, history: [], branch: null, created_at: iso(150), updated_at: iso(100), runs: [run(140, 130, 700, { ended_by: 'finished', ended_note: 'answered' })], origin: { by: 'owner' } as SymccTask['origin'] },
  ]
  let scouts = addScoutRun(null, 'bugs', { endMs: VIEW_NOW - 3_600_000, ms: 120_000, tokens: { input: 5000, output: 400 } })
  scouts = addScoutRun(scouts, 'ideas', { endMs: VIEW_NOW - 7_200_000, ms: 60_000, tokens: { input: 1200 } })
  scouts = addScoutRun(scouts, 'quiet', { endMs: VIEW_NOW - 7_200_000, ms: 30_000, tokens: { input: 300 } })
  const lead = [
    { id: 'a', atMs: VIEW_NOW - 3_600_000, tokens: { input: 3000, output: 900, cache_read: 40_000, cache_write: 2000 } },
    { id: 'b', atMs: VIEW_NOW - 600_000, tokens: { input: 1000, output: 300, cache_read: 20_000 } },
  ]
  return {
    tasks, nowMs: VIEW_NOW, offsetMin: 0, name: 'symcc',
    team: { lead, leadSessions: 1, scouts: parseScoutUsage(scouts), sessionUsd: 3.25 },
    scoutRuns: { bugs: [{ ended: iso(500), tasks: ['T-2'] }] },
    ...over,
  }
}
