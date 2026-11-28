// T-936: a worker on an old or backlog task is told what changed since the task was written (the commits on the branch it
// merges into that touched its files) and to check first that the task still fits.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { addTask, emptyBoard, patchTask, find, promoteTask, type Board } from '../hooks/board'
import { S } from '../hooks/app/state'
import { WORKER_PROMPT, changedSince } from '../hooks/app/workers'
import { pathsNamed, mayBeStale, changedSinceText, CHANGED_ASK, CHANGED_ASK_NO_TOOLS } from '../hooks/core/changed-since'
import { withoutSymccTools } from '../hooks/core/prompts'
import { fakeHost, done } from './fake-host'
import { gitLines } from '../hooks/app/git'

const ROOT = '/proj'
const WT = `${ROOT}/.symcc/worktrees/T-1`
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-11-23T12:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()
const HEADING = '## Check first: what changed since'
const CHECK = 'Before you start, check that the task still fits'

function setup() {
  S.root = ROOT
  S.enabledNow = true
}

/** A board with T-1 to do, written at `created`, with `files` (and the given details). */
function boardAt(created: number, files: string[] = ['hooks/app/', 'docs/guide.md'], details = 'Make it work.', backlog = false): Board {
  const [b, t] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Do it', details, files, backlog }, iso(created))
  return backlog ? promoteTask(b, t.id, iso(created + 60_000)) : b
}

/** A host whose git answers rev-list --count with `total` and git log with `lines`; the git commands are kept in `calls`. */
function gitHost(total: number, lines: string[], tracked: string[] = []) {
  const calls: string[][] = []
  const { host } = fakeHost({
    run: async argv => {
      calls.push([...argv])
      if (argv[1] === 'ls-files') return done({ stdout: tracked.join('\n') + '\n' })
      if (argv[1] === 'rev-list') return done({ stdout: `${total}\n` })
      if (argv[1] === 'log') return done({ stdout: lines.slice(0, Number(argv[argv.indexOf('-n') + 1])).join('\n') + '\n' })
      return done()
    },
  })
  return { host, calls }
}

const commits = (n: number) => Array.from({ length: n }, (_, i) => `abc${String(i).padStart(4, '0')} change ${i}`)

test('T-936: a 2-day-old task gets the section and the check-first rule, its commits limited to its files and its creation time, cut at 15', async () => {
  setup()
  const created = NOW - 2 * DAY
  const b = boardAt(created)
  const t = find(b, 'T-1')!
  const { host, calls } = gitHost(20, commits(20))
  const since = await changedSince(host, t, WT, NOW)
  for (const c of calls) {
    expect(c).toContain(`--since=${iso(created)}`)
    expect(c).toContain('refs/heads/main')
    expect(c).toContain('--no-merges')
    expect(c.slice(c.indexOf('--') + 1)).toEqual(['hooks/app/', 'docs/guide.md'])
  }
  expect(calls.map(c => c[1])).toEqual(['rev-list', 'log'])
  const p = WORKER_PROMPT(t, b, WT, undefined, '', '', [], since)
  expect(p).toContain(HEADING)
  expect(p).toContain('This task was written ')
  expect(p).toContain('(2 days ago). Since then these commits changed its files:\n- abc0000 change 0\n')
  expect(p).toContain('- abc0014 change 14\n… 5 more')
  expect(p).not.toContain('abc0015')
  expect(p).toContain(CHECK)
  expect(p).toContain('ask the owner with the ask_owner tool, with options such as "drop it" and "do the new plan: …"')
  // the section sits right after the task's details
  expect(p.indexOf(HEADING)).toBeGreaterThan(p.indexOf('## What to do'))
  expect(p.indexOf(HEADING)).toBeLessThan(p.indexOf('## Files you may change'))
})

test('T-936: a task from the backlog gets the section even when it is fresh', async () => {
  setup()
  const b = boardAt(NOW - 60 * 60 * 1000, ['src/'], 'Make it work.', true)
  const t = find(b, 'T-1')!
  expect(mayBeStale(t, NOW)).toBe(true)
  const { host } = gitHost(2, commits(2))
  const p = WORKER_PROMPT(t, b, WT, undefined, '', '', [], await changedSince(host, t, WT, NOW))
  expect(p).toContain(HEADING)
  expect(p).toContain('Since then these commits changed its files:\n- abc0000 change 0\n- abc0001 change 1\n\n')
  expect(p).not.toContain('more')
  expect(p).toContain(CHECK)
})

test('T-936: no section for a fresh task (git is not even asked) or when no commit changed its files', async () => {
  setup()
  const fresh = boardAt(NOW - 60 * 60 * 1000)
  const f = gitHost(3, commits(3))
  expect(await changedSince(f.host, find(fresh, 'T-1')!, WT, NOW)).toBe(null)
  expect(f.calls.length).toBe(0)
  expect(WORKER_PROMPT(find(fresh, 'T-1')!, fresh, WT)).not.toContain(HEADING)

  const old = boardAt(NOW - 3 * DAY)
  const n = gitHost(0, [])
  const since = await changedSince(n.host, find(old, 'T-1')!, WT, NOW)
  expect(since).toBe(null)
  const p = WORKER_PROMPT(find(old, 'T-1')!, old, WT, undefined, '', '', [], since)
  expect(p).not.toContain(HEADING)
  expect(p).not.toContain(CHECK)
})

test('T-936: with no files list the commits are limited to the paths the details name, else only their count is told', async () => {
  setup()
  const named = boardAt(NOW - 2 * DAY, [], 'Fix `hooks/app/workers.ts:40` and the line in docs/guide.md. See https://x.io/a/b.')
  const t = find(named, 'T-1')!
  const { host, calls } = gitHost(1, commits(1))
  const since = await changedSince(host, t, WT, NOW)
  const revList = calls.find(c => c[1] === 'rev-list')!
  expect(revList.slice(revList.indexOf('--') + 1)).toEqual(['hooks/app/workers.ts', 'docs/guide.md'])
  expect(changedSinceText(since)).toContain('Since then these commits changed files its details name:\n- abc0000 change 0')

  // words with a slash that are not in the repo ("A/B", "and/or") don't count: only the count is told
  const slashy = boardAt(NOW - 2 * DAY, [], 'Pick option A/B and/or C.')
  const s = gitHost(172, [])
  const sinceS = await changedSince(s.host, find(slashy, 'T-1')!, WT, NOW)
  expect(s.calls.map(x => x[1])).toEqual(['ls-files', 'rev-list'])
  expect(s.calls[1]!.includes('--')).toBe(false)
  expect(changedSinceText(sinceS)).toContain('Since then 172 commits landed on the branch it merges into.')

  // a named folder or extension-less file that is in the repo does count; a folder not in the repo does not
  const real = boardAt(NOW - 2 * DAY, [], 'Look at hooks/app/ and scripts/run, not gone/.')
  const r = gitHost(2, commits(2), ['hooks/app/workers.ts', 'scripts/run'])
  const sinceR = await changedSince(r.host, find(real, 'T-1')!, WT, NOW)
  const rl = r.calls.find(c => c[1] === 'rev-list')!
  expect(rl.slice(rl.indexOf('--') + 1)).toEqual(['hooks/app/', 'scripts/run'])
  expect(sinceR?.scope).toBe('named')

  const plain = boardAt(NOW - 2 * DAY, [], 'Make the board faster.')
  const c = gitHost(7, [])
  const s2 = await changedSince(c.host, find(plain, 'T-1')!, WT, NOW)
  expect(c.calls.map(x => x[1])).toEqual(['rev-list'])
  expect(c.calls[0]!.includes('--')).toBe(false)
  const text = changedSinceText(s2)!
  expect(text).toContain('Since then 7 commits landed on the branch it merges into.')
  expect(text).toContain(CHECK)
})

test('T-936: pathsNamed finds file and folder paths, not URLs or plain words', () => {
  expect(pathsNamed('Change hooks/core/x.ts:12, README.md and tests/ (not https://a.b/c, -n, or 2/3 words).')).toEqual(['hooks/core/x.ts', 'README.md', 'tests/'])
})

test('T-936: an investigation from long ago gets the section too', async () => {
  setup()
  const [b0, t0] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Why is hooks/app/lead.ts slow?', details: 'Find out.', kind: 'investigation' }, iso(NOW - 5 * DAY))
  const b = patchTask(b0, t0.id, { status: 'doing' }, iso(NOW))
  const t = find(b, 'T-1')!
  const { host } = gitHost(1, commits(1))
  const p = WORKER_PROMPT(t, b, WT, undefined, '', '', [], await changedSince(host, t, WT, NOW))
  expect(p).toContain('(5 days ago). Since then these commits changed files its details name:\n- abc0000 change 0')
  expect(p).toContain(CHECK)
})

test('T-942: a worker with no symcc tools is told to write the question in its report, not to call ask_owner', async () => {
  setup()
  const b = boardAt(NOW - 3 * DAY)
  const t = find(b, 'T-1')!
  const { host } = gitHost(1, commits(1))
  const p = WORKER_PROMPT(t, b, WT, undefined, '', '', [], await changedSince(host, t, WT, NOW))
  // a normal worker keeps its ask tool
  expect(p).toContain(CHANGED_ASK('ask_owner'))
  const none = withoutSymccTools(p, n => n)
  expect(none).toContain(HEADING)
  expect(none).toContain(CHECK)
  expect(none).toContain(`don't guess: ${CHANGED_ASK_NO_TOOLS}`)
  expect(none).toContain('write the question for the owner in your report, with options such as "drop it"')
  expect(none.includes('ask_owner')).toBe(false)
})

test('T-1063: an errand worker is told to do the work and hand back a short report, not to investigate', () => {
  setup()
  const b = boardAt(NOW - 60 * 60 * 1000)
  const errand = { ...find(b, 'T-1')!, kind: 'errand' }
  const p = WORKER_PROMPT(errand, b, WT)
  expect(p).toContain('This task is an errand')
  expect(p).toContain('hand back a short report of what you did and where (paths, results)')
  expect(p).not.toContain('find the answer')
  expect(p).not.toContain('read-only')
  expect(WORKER_PROMPT({ ...errand, kind: 'investigation' }, b, WT)).toContain('find the answer')
})

test('T-948: gitLines gives the trimmed, non-blank output lines; [] when git fails or cannot run', async () => {
  setup()
  const ok = fakeHost({ run: async () => done({ stdout: '  a1 one \n\n b2 two\n' }) }).host
  expect(await gitLines(ok, ['log'], ROOT)).toEqual(['a1 one', 'b2 two'])
  const failed = fakeHost({ run: async () => done({ exitCode: 1, stdout: 'a1 one\n' }) }).host
  expect(await gitLines(failed, ['log'], ROOT)).toEqual([])
  const broken = fakeHost({ run: async () => { throw new Error('no git') } }).host
  expect(await gitLines(broken, ['log'], ROOT)).toEqual([])
})
