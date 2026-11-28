// T-1080: how big a task's change is ("25 files · +539 −3,722") and what the whole task has done ("Done:" line of its
// worker's report): the pure parts, a finished Live row, and the task page on the terminal, desktop, mobile and VS Code.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { liveFinishedLanes, laneLines, liveLayout, liveStations } from '../hooks/core/live'
import { segText } from '../hooks/core/live-seg'
import { parseShortstat, sizeText, commitMessage } from '../hooks/core/commits'
import { doneLine } from '../hooks/core/reports'
import { sizeSegs } from '../hooks/core/page-header'
import { taskSections } from '../hooks/core/task-sections'
import { taskText } from '../hooks/app/tools'
import TEXT from '../prompts/change'
import { PANE, T0, seedBoard } from './board-fixture'

const iso = (minAgo: number) => new Date(T0 - minAgo * 60_000).toISOString()
const SIZE = { files: 25, added: 539, removed: 3722 }
const SHA = 'c2fb0c16aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const task = (id: string, title: string, x: Record<string, unknown> = {}) => ({ id, title, details: 'Do it.', files: [], status: 'doing', note: '', priority: 0, after: [], attempts: 9, timeline: [], branch: null, created_at: iso(300), updated_at: iso(1), ...x })
const merged = task('T-1062', 'Slim the worker guards', {
  status: 'done', branch: 'symcc/T-1062', merged: SHA, size: SIZE, done: 'Git is checked against a short allowed list; the shell parser is gone.',
  runs: [{ started: iso(100), ended: iso(2), agents: [{ kind: 'worker' as const, started: iso(100), ended: iso(2), tokens: { input: 6_100_000 } }] }],
  timeline: [{ kind: 'merged', at: iso(1), text: 'try 9 → merged into main' }],
})
const inReview = task('T-1063', 'In review', { status: 'review', branch: 'symcc/T-1063', size: SIZE })
const errand = task('T-1064', 'An errand', { status: 'review', kind: 'investigation', branch: null })
const view = (tasks: unknown[]) => ({ tasks: tasks as never[], checker: true, mode: 'auto' as const, max_parallel: 3 })

test('T-1080: git shortstat becomes a size, and a size reads "25 files · +539 −3,722" (no files part for a Live row)', () => {
  expect(parseShortstat(' 25 files changed, 539 insertions(+), 3722 deletions(-)\n')).toEqual(SIZE)
  expect(parseShortstat(' 1 file changed, 2 insertions(+)\n')).toEqual({ files: 1, added: 2, removed: 0 })
  expect(parseShortstat('')).toBe(undefined)
  expect(sizeText(SIZE)).toBe('25 files · +539 −3,722')
  expect(sizeText(SIZE, false)).toBe('+539 −3,722')
})

test('T-1080: the line under the title says "merged <sha>" once merged and "branch <name>" before; none without a size', () => {
  const text = (t: object) => sizeSegs(t as never)?.map(x => x.text).join('')
  expect(text(merged)).toBe('merged c2fb0c16 · 25 files · +539 −3,722')
  expect(text(inReview)).toBe('branch symcc/T-1063 · 25 files · +539 −3,722')
  expect(text(errand)).toBe(undefined)
})

test('T-1080: the "Done:" line at the top of a report is kept; a report without one gives none', () => {
  expect(doneLine('Done: Git is checked.\n\nI changed it.')).toBe('Git is checked.')
  expect(doneLine('**Done:** Both sentences. Here.\nrest')).toBe('Both sentences. Here.')
  expect(doneLine('I changed src/a.ts.\nlater\nDone: not at the top\n\n\n\nx\ny\nz\nDone: far')).toBe('not at the top')
  expect(doneLine('I changed src/a.ts.')).toBe('')
})

test('T-1080: the commit message carries the Done sentence above its trailers, only when given', () => {
  const t = { id: 'T-1', title: 'Do it', attempts: 1 }
  expect(commitMessage(t, { done: 'It is all done.' })).toContain('T-1: Do it\n\nIt is all done.\n\nSymcc-Task: T-1')
  expect(commitMessage(t)).toBe('T-1: Do it\n\nSymcc-Task: T-1\nSymcc-From: unknown\nSymcc-Try: 1\n')
})

test('T-1080: the change worker prompt asks for the Done line', () => {
  expect(TEXT).toContain('beginning "Done:"')
})

test('T-1080: the task page has a Done section only when the task has a Done sentence, and the text view shows size and Done', () => {
  const facts = { width: 80, nowMs: T0, detail: { roles: [], kinds: [], all: [], when: (s: string) => s, board: view([]) as never, merging: false, driving: false } }
  const withDone = taskSections(merged as never, facts as never)
  expect(withDone[0]!.id).toBe('done')
  expect(withDone[0]!.lines.map(l => l.segs.map(s => s.text).join('')).join(' ')).toContain('the shell parser is gone')
  expect(taskSections(inReview as never, facts as never).some(s => s.id === 'done')).toBe(false)
  const text = taskText(merged as never, false)
  expect(text).toContain('merged c2fb0c16 · 25 files · +539 −3,722')
  expect(text).toContain('Done: Git is checked against a short allowed list')
})

test('T-1080: a finished Live row ends with +A −D after the tokens, and drops it first when narrow', () => {
  const lane = liveFinishedLanes(view([merged]), T0)[0]!
  expect(lane.size).toEqual(SIZE)
  const second = (w: number) => segText(laneLines(lane, liveLayout([lane], liveStations(true), w), { nowMs: T0, frame: 0 })[1])
  expect(second(100)).toMatch(/try 9\/\d+ · ⏱ .* · ⌀ 6\.1M.* · \+539 −3,722 {2}\S+$/)
  // narrower: the size goes before any other part
  const full = second(100)
  const without = full.replace(' · +539 −3,722', '')
  let found = ''
  for (let w = 100; w >= 20; w--) {
    const s = second(w)
    if (!s.includes('+539')) {
      found = s
      break
    }
  }
  expect(found.startsWith(without.slice(0, 20))).toBe(true)
  expect(found).toContain('try 9/')
  expect(found).toContain('⏱')
})

const SEEDED = { shape: 'view-1', value: { tasks: [merged, inReview, errand], working: [], scouts: [], mode: 'auto', home_branch: 'main', test_commands: [], driving: true, checker: true, max_parallel: 3 } }

for (const surface of ['terminal', 'desktop', 'mobile', 'vscode'] as const)
  for (const id of ['T-1062', 'T-1063', 'T-1064'])
    test(`T-1080: the ${surface} page of ${id}: size under the title (merged, branch, or none), the Done section above What to do only with a Done sentence`, async ($, on) => {
      seedBoard(on, { opened: id, view: SEEDED })
      const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface })
      const page = JSON.stringify(await ui.drawn())
      if (id === 'T-1062') {
        expect(page).toContain('merged c2fb0c16')
        expect(page).toContain('+539')
        expect(page).toContain('the shell parser is gone')
        expect(page.indexOf('the shell parser is gone')).toBeLessThan(page.indexOf('Do it.'))
      }
      if (id === 'T-1063') {
        expect(page).toContain('branch symcc/T-1063')
        expect(page).toContain('+539')
        expect(page).not.toContain('Done')
      }
      if (id === 'T-1064') expect(page).not.toContain(' files')
      await ui.unmount()
    })
