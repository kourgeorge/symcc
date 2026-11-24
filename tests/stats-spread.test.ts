// T-845: /symcc-stats "Per done task" has two spread charts (time and tokens): 6 rows centered on the median,
// edges at median ÷4, ÷2, ×1, ×2, ×4; a value on an edge goes to the upper bucket; too few tasks shows no chart.
import { expect, test } from 'claude-code/testing'
import type { SymccTask } from '../types'
import { statsData, statsReport } from '../hooks/board'
import { statsHtml } from '../hooks/core/stats-html'
import { statsLines } from '../hooks/claude/stats-lines'

const NOW = Date.parse('2026-11-13T12:00:00Z')
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString()
const AGE = 600

function task(id: string, min: number, tokens: number, over: Partial<SymccTask> = {}): SymccTask {
  const run = { started: iso(AGE), ended: iso(AGE - min), agents: [{ kind: 'worker' as const, started: iso(AGE), ended: iso(AGE - min), tokens: { input: tokens } }] }
  return { id, title: `task ${id}`, details: '', files: [], status: 'done', note: '', priority: 0, after: [], attempts: 1, history: [], branch: null, created_at: iso(AGE), updated_at: iso(0), runs: [run], ...over }
}

// times (minutes): median 8; tokens: median 1200
const MINUTES = [1, 1, 3, 5, 7, 8, 8, 8, 15, 20, 40, 50, 60, 70]
const TOKENS = [100, 200, 400, 700, 1000, 1200, 1200, 1200, 2400, 3000, 5000, 6000, 7000, 9000]
const tasks = (): SymccTask[] => MINUTES.map((m, i) => task(`T-${i + 1}`, m, TOKENS[i]!))
const data = () => statsData({ tasks: tasks(), nowMs: NOW })

test('T-845: edges come from the median (÷4, ÷2, ×2, ×4) with the counts per bucket', () => {
  const d = data()
  expect(d.spreadTime.medianText).toBe('8m')
  expect(d.spreadTime.rows!.map(r => [r.label, r.n])).toEqual([['< 2m', 2], ['2m – 4m', 1], ['4m – 8m', 2], ['8m – 16m', 4], ['16m – 32m', 1], ['> 32m', 4]])
  expect(d.spreadTok.medianText).toBe('1.2k')
  expect(d.spreadTok.rows!.map(r => [r.label, r.n])).toEqual([['< 300', 2], ['300 – 600', 1], ['600 – 1.2k', 2], ['1.2k – 2.4k', 3], ['2.4k – 4.8k', 2], ['> 4.8k', 4]])
})

test('T-845: the outer rows: very fast / very small, and the 3 biggest by id and value; an edge value goes up', () => {
  const d = data()
  expect(d.spreadTime.rows![0]!.note).toBe('very fast')
  expect(d.spreadTime.rows![5]!.top).toEqual([{ id: 'T-14', value: 70 * 60_000 }, { id: 'T-13', value: 60 * 60_000 }, { id: 'T-12', value: 50 * 60_000 }])
  expect(d.spreadTime.rows![5]!.note).toBe('slowest: T-14 1h 10m · T-13 1h 00m · T-12 50m')
  expect(d.spreadTok.rows![0]!.note).toBe('very small')
  expect(d.spreadTok.rows![5]!.note).toBe('biggest: T-14 9k · T-13 7k · T-12 6k')
  // 8m (the median, an edge) is in "8m – 16m"; 2400 tokens (an edge) is in "2.4k – 4.8k"
  expect(d.spreadTime.rows![3]!.n).toBe(4)
  expect(d.spreadTok.rows![4]!.n).toBe(2)
})

test('T-845: too few tasks, or a median of 0, shows no chart', () => {
  const few = statsData({ tasks: tasks().slice(0, 9), nowMs: NOW })
  expect(few.spreadTime.rows).toBe(undefined)
  expect(statsReport({ tasks: tasks().slice(0, 9), nowMs: NOW })).toContain('too few tasks for a chart')
  expect(statsReport({ tasks: tasks().slice(0, 9), nowMs: NOW })).not.toContain('median 8m ──')
  const zero = statsData({ tasks: MINUTES.map((_, i) => task(`T-${i + 1}`, 0, 0)), nowMs: NOW })
  expect(zero.spreadTok.rows).toBe(undefined)
})

test('T-845: the text, colored and HTML outputs all have both charts', () => {
  const text = statsReport({ tasks: tasks(), nowMs: NOW })
  expect(text).toContain('Time per done task · median 8m · 14 tasks')
  expect(text).toContain('Tokens per done task · median 1.2k · 14 tasks')
  expect(text).toContain('median 8m')
  expect(text).toMatch(/> 32m\s+▇+\s+4\s+slowest: T-14/)
  expect(text).toMatch(/< 300\s+▇+\s+2\s+very small/)
  expect(text.split('\n').every(l => [...l].length <= 80)).toBe(true)

  const lines = statsLines(data(), 100).map(l => l.segs.map(s => s.text).join(''))
  expect(lines.some(l => l.includes('Time per done task') && l.includes('median 8m · 14 tasks'))).toBe(true)
  expect(lines.some(l => l.includes('Tokens per done task'))).toBe(true)
  expect(lines.filter(l => l.includes('── median')).length).toBe(2)
  expect(lines.some(l => l.includes('> 4.8k') && l.includes('biggest: T-14 9k · T-13 7k · T-12 6k'))).toBe(true)
  expect(lines.some(l => l.includes('< 2m') && l.includes('very fast'))).toBe(true)

  const html = statsHtml(data(), 'p')
  expect(html).toContain('Time per done task · median 8m · 14 tasks')
  expect(html).toContain('Tokens per done task · median 1.2k · 14 tasks')
  expect(html).toContain('slowest: T-14 1h 10m')
  expect(html).toContain('biggest: T-14 9k')
})
