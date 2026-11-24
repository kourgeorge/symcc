// T-961: the band line for Copilot CLI's statusLine command (hooks/copilot/statusline.ts, run by hooks/copilot/band.ts):
// for a sample board on disk it prints "symcc: " and the same text the Claude Code status line shows (core's
// statusLine), with the branch from .git/HEAD, who drives from lead.json, and the off text when symcc is turned off.
import { expect, test } from 'claude-code/testing'
import { addTask, emptyBoard, statusLine, statusRoom, offStatusLine, type Board } from '../hooks/board'
import { todayAt } from './day-clock'
import { bandLine, bandOutput, bandStatusText, headBranch, projectRoot } from '../hooks/copilot/statusline'

const NOW = Date.now()
const AT = new Date(NOW).toISOString()

function sampleBoard(): Board {
  const [b] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'a change', files: ['src/a.ts'] }, AT)
  return { ...b, mode: 'review' }
}
const text = (b: Board) => JSON.stringify(b)

test('the band prints the Claude status line text for a sample board, with the branch from .git/HEAD', () => {
  const b = sampleBoard()
  const want = statusLine({ tasks: b.tasks, home_branch: 'main', mode: 'review' }, true, { nowMs: NOW, width: statusRoom() })
  expect(want).toBe('⏸ approve merge · drives here · main · today ✓ 0')
  expect(bandLine({ board: text(b), lead: null, head: 'ref: refs/heads/main\n' }, { nowMs: NOW })).toBe(`symcc: ${want}`)
  expect(headBranch('0123abcd\n')).toBe('')
})

test('a fresh lead.json of another session makes this window follow; off and empty projects', () => {
  const b = sampleBoard()
  const lead = JSON.stringify({ session: 'other', heartbeat: NOW - 1000, since: NOW - 60_000 })
  const follow = bandStatusText({ board: text(b), lead }, { nowMs: NOW, session: 'me' }) ?? ''
  expect(follow.includes('drives here')).toBe(false)
  expect(follow.startsWith('⏸ approve merge · ')).toBe(true)
  // no session known, or an old heartbeat: this window drives
  expect(bandStatusText({ board: text(b), lead }, { nowMs: NOW })?.includes('drives here')).toBe(true)
  expect(bandStatusText({ board: text(b), lead: JSON.stringify({ session: 'other', heartbeat: NOW - 3_600_000 }) }, { nowMs: NOW, session: 'me' })?.includes('drives here')).toBe(true)
  expect(bandStatusText({ board: text({ ...b, enabled: false }), lead: null }, { nowMs: NOW })).toBe(offStatusLine('symcc', false, false, undefined, NOW, statusRoom()))
  expect(bandLine({ board: text(emptyBoard()), lead: null }, { nowMs: NOW })).toBe('')
  expect(bandLine({ board: null, lead: null }, { nowMs: NOW })).toBe('')
})

test('the band finds the project above the folder it runs in', () => {
  const files = new Map([
    ['/w/proj/.symcc/board.json', text(sampleBoard())],
    ['/w/proj/.git/HEAD', 'ref: refs/heads/dev\n'],
  ])
  const readText = (p: string) => files.get(p) ?? null
  expect(projectRoot({ cwd: '/w/proj/src/deep', readText })).toBe('/w/proj')
  expect(projectRoot({ cwd: '/elsewhere', readText })).toBe(null)
  expect(bandOutput({ cwd: '/w/proj/src', readText, nowMs: NOW })).toBe('symcc: ⏸ approve merge · drives here · dev · today ✓ 0')
  expect(bandOutput({ cwd: '/elsewhere', readText, nowMs: NOW })).toBe('')
})

test('a done task kept as a stub counts as merged today, with its cost, from its parts file (T-992)', () => {
  const at = new Date(todayAt(9, 0, NOW)).toISOString()
  const [b0] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'a change', files: ['src/a.ts'] }, AT)
  const stub = { id: 'T-950', title: 'old', status: 'done', parts: 'tasks/T-950.json', created_at: at, updated_at: at }
  const board = JSON.stringify({ ...b0, mode: 'review', tasks: [stub] })
  const parts = JSON.stringify({ tasks: { 'T-950': { id: 'T-950', history: [{ kind: 'merged', at, text: 'merged' }], runs: [{ n: 1, started: at, ended: at, agents: [{ id: 'a1', kind: 'worker', started: at, ended: at, cost: 2.5 }] }] } } })
  const files = new Map([
    ['/p/.symcc/board.json', board],
    ['/p/.symcc/tasks/T-950.json', parts],
  ])
  const line = bandOutput({ cwd: '/p', readText: q => files.get(q) ?? null, nowMs: Math.max(NOW, todayAt(9, 30, NOW)) })
  expect(line.includes('today ✓ 1')).toBe(true)
  expect(line.includes('$2.50')).toBe(true)
})
