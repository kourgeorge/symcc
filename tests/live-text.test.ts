// T-902: /symcc-status prints the Live tab's picture as text in the chat (the same sections and order, made by the Live
// tab's own helpers, so the numbers match the panel) and never opens the panel, with a panel or without.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { fakeHost, memoryFs } from './fake-host'
import { type HostFeatures, ALL_FEATURES } from '../hooks/host'
import type { Board } from '../hooks/board'
import { addTask } from '../hooks/core/task'
import { emptyBoard, type BoardTask } from '../hooks/core/board-file'
import { S } from '../hooks/app/state'
import { COMMANDS, runCommand } from '../hooks/app/symcc'
import { manual } from '../hooks/app/tools'
import { liveStatusText, statusHint } from '../hooks/core/live-text'
import { liveHeading, segText } from '../hooks/core/live-seg'
import { liveToday } from '../hooks/core/live-today'
import { textWidth } from '../hooks/core/width'
import { statusBoard, statusHeadings, statusSection, statusTail, statusTailWant, statusTodayLines } from './status-fixture'
import { branchTasks, branchFactsAt, branchStateTasks, branchStateFactsAt } from './branches-fixture'

const ROOT = '/repo'
const BARE: HostFeatures = { panel: false, band: false, wakeLead: 'next-turn', planMode: false, leadUsage: false, startQueue: true }

function world(features: Partial<HostFeatures>, b: Board) {
  const files = new Map<string, string>()
  const opened: { id: string }[] = []
  const f = fakeHost({
    features,
    session: { repo: async () => ({ root: ROOT }), root: async () => ROOT },
    fs: memoryFs(files),
    ui: { open: async p => (opened.push({ id: p.id }), { isPlaced: true }) },
  })
  S.root = ROOT
  files.set(`${ROOT}/${S.N.boardFile}`, JSON.stringify(b, null, 2) + '\n')
  return { ...f, opened }
}

const notes = [1, 2, 3, 4].map(n => ({ n, date: `2026-11-2${n}`, topic: 'tests', text: `note ${n}` }))

// T-1071: fixed local times, never the real clock. Just after midnight T-2's first try (30 minutes back) falls on
// yesterday, so TODAY gets its blank line and the yesterday / last 7 days lines; at noon and before midnight it doesn't.
const at = (h: number, m: number) => new Date(2026, 10, 26, h, m).getTime()
const NOON = at(12, 0)
const AFTER_MIDNIGHT = at(0, 5)
const BEFORE_MIDNIGHT = at(23, 55)
const NOWS = [NOON, AFTER_MIDNIGHT, BEFORE_MIDNIGHT]

test('T-902: the status text has the Live sections in order: needs you, the lanes with their trains, today, the newest notes, the hint', () => {
  for (const now of NOWS) statusTextHasLiveSections(now)
})

test('T-1071: just after midnight TODAY shows the yesterday and last 7 days lines; at noon and before midnight it does not', () => {
  const past = (now: number) => statusSection(liveStatusText(statusBoard(now) as never, notes as never, now), 'TODAY').filter(l => /^ (yesterday|last 7 days):/.test(l)).length
  expect(NOWS.map(past)).toEqual([0, 2, 0])
})

function statusTextHasLiveSections(now: number) {
  const b = statusBoard(now)
  const text = liveStatusText(b as never, notes as never, now)
  expect(statusHeadings(text)).toEqual(['NEEDS YOU', 'TASKS', 'TODAY', 'ORGANIZATIONAL MEMORY'])
  expect(statusSection(text, 'NEEDS YOU')).toEqual([' ⚠ T-3 ready for review: Fix the login page', ' ⚠ T-1 asks: Postgres or SQLite?'])
  const tasks = statusSection(text, 'TASKS')
  // T-2: its second try in tests (◉ under "tests"), the time there and "↺2"; T-4 waits for it; T-3 sits at "you"
  const labels = tasks[0]!
  const lane = tasks.find(l => l.includes('T-2'))!
  expect(lane.startsWith(' ▶ T-2  Add s')).toBe(true)
  expect(/○ ↺2$/.test(lane)).toBe(true)
  expect(lane.indexOf('◉')).toBe(labels.indexOf('tests'))
  // T-1074: the first line has no time; the second line under it has the try, the time and the task type
  expect(tasks[tasks.indexOf(lane) + 1]).toMatch(/^   try 2\/\d · ⏱ .*change$/)
  expect(tasks[tasks.indexOf(lane) + 2]).toMatch(/^   └─◇ T-4 Write the export  waits$/)
  // T-1228: T-3 (review) needs the owner: it is in NEEDS YOU and keeps its lane in TASKS
  expect(tasks.some(l => l.includes('T-3'))).toBe(true)
  // T-1177: a finished lane's "merged … ago" is on its second line
  const doneAt = tasks.findIndex(l => /^ ✓ /.test(l))
  if (doneAt >= 0) expect(tasks[doneAt + 1]).toMatch(/^   (merged|\d+\w? ago|.*ago)/)
  // TODAY: exactly the Live tab's lines (2 merged today)
  expect(statusSection(text, 'TODAY')).toEqual(statusTodayLines(b, now))
  expect(liveToday(b.tasks, now).merged).toBe(2)
  // T-938: no mode line of its own above the sections: it is TODAY's first row, "Now:"
  expect(text.split('\n')[0]).toMatch(/^─── ❯ NEEDS YOU /)
  expect(text.split('\n').filter(l => l.includes(' busy'))).toEqual([' Now: ⏵ auto merge · agents 0/3 busy'])
  expect(statusSection(text, 'TODAY')[0]).toBe(' Now: ⏵ auto merge · agents 0/3 busy')
  expect(statusSection(text, 'TODAY')[1]!.startsWith(' ✓ 2 merged')).toBe(true)
  // the count and the 3 newest notes
  expect(text).toContain('ORGANIZATIONAL MEMORY   4 / 60')
  expect(statusSection(text, 'ORGANIZATIONAL MEMORY').length).toBe(3)
  // T-933: the ✧ / ⌀ legend is never under the task rows; it is the last lines, after the hint line
  expect(text.includes('✧ =')).toBe(true)
  expect(tasks.some(l => l.includes('✧ ='))).toBe(false)
  expect(statusTail(text, statusHint())).toEqual(statusTailWant(statusHint()))
  const narrow = liveStatusText(b as never, notes as never, now, 'symcc', 30)
  expect(statusTail(narrow, statusHint())).toEqual(statusTailWant(statusHint(), 30))
  expect(statusHint()).toBe('/symcc-board opens the board · /symcc-tasks lists the tasks')
  expect(text.split('\n').every(l => textWidth(l) <= 80)).toBe(true)
}

test('T-1228: a task that needs the owner and the tasks waiting on it stay in TASKS, and it is in NEEDS YOU too', () => {
  const now = Date.now()
  const iso = new Date(now).toISOString()
  let b = emptyBoard()
  for (const [i, title] of ['Asks', 'Waits on asks', 'Runs', 'Waits on both'].entries()) b = addTask(b, { origin: { why: 'a test' }, title, files: ['src/'], after: i === 1 ? ['T-1'] : i === 3 ? ['T-1', 'T-3'] : [] }, iso)[0]
  const run = { started: iso, agents: [] }
  const ask = { by: 'worker', text: 'Which one?', options: ['a', 'b'], asked_at: iso }
  const make = (asking: boolean): Board => ({
    ...b,
    tasks: b.tasks.map(t => ({ ...t, ...(t.id === 'T-1' ? { status: 'doing', runs: [run], ...(asking ? { live: { time_ask: iso } } : {}) } : t.id === 'T-3' ? { status: 'doing', runs: [run] } : {}) }) as BoardTask),
  })
  const tasks = (bb: Board) => statusSection(liveStatusText(bb as never, [], now), 'TASKS').join('\n')
  const shown = tasks(make(true))
  expect(statusSection(liveStatusText(make(true) as never, [], now), 'NEEDS YOU').join('\n')).toContain('T-1')
  expect(shown).toContain('T-1 ')
  expect(shown).toContain('T-2 Waits on asks')
  expect(shown).toContain('+ also')
  const back = tasks(make(false))
  expect(back).toContain('▶ T-1')
  expect(back).toContain('T-2 Waits on asks')
  expect(back).toContain('+ also')
})

test('T-1228: "+ also" names both the asking task and the running one', () => {
  const now = Date.now()
  const iso = new Date(now).toISOString()
  let b = emptyBoard()
  const afters: Record<number, string[]> = { 2: ['T-1'], 4: ['T-2', 'T-3'], 6: ['T-3', 'T-5'] }
  for (const [i, title] of ['Asks', 'Waits on asks', 'Runs', 'Waits on two', 'Runs too', 'Waits on lanes'].entries()) b = addTask(b, { origin: { why: 'a test' }, title, files: ['src/'], after: afters[i + 1] ?? [] }, iso)[0]
  const run = { started: iso, agents: [] }
  const ask = { by: 'worker', text: 'Which one?', options: ['a', 'b'], asked_at: iso }
  const board = {
    ...b,
    tasks: b.tasks.map(t => ({ ...t, ...(t.id === 'T-1' ? { status: 'doing', runs: [run], live: { time_ask: iso } } : t.id === 'T-3' || t.id === 'T-5' ? { status: 'doing', runs: [run] } : {}) }) as BoardTask),
  } as Board
  const tasks = statusSection(liveStatusText(board as never, [], now), 'TASKS').join('\n')
  expect(tasks).toContain('T-2 Waits on asks')
  expect(tasks).toMatch(/T-4 Waits on two/)
  expect(tasks).toMatch(/T-6 Waits on lanes.*\+ also T-[35]/)
})

test('T-1228: a running task asking for more time is in NEEDS YOU and stays in TASKS with its trains', () => {
  const now = Date.now()
  const iso = new Date(now).toISOString()
  let b = emptyBoard()
  for (const [i, title] of ['Asks', 'Waits on asks', 'Runs', 'Waits on both'].entries()) b = addTask(b, { origin: { why: 'a test' }, title, files: ['src/'], after: i === 1 ? ['T-1'] : i === 3 ? ['T-1', 'T-3'] : [] }, iso)[0]
  const run = { started: iso, agents: [] }
  const ask = { by: 'worker', text: 'Which one?', asked_at: iso }
  const board = {
    ...b,
    tasks: b.tasks.map(t => ({ ...t, ...(t.id === 'T-1' ? { status: 'doing', runs: [run], live: { time_ask: iso } } : t.id === 'T-3' ? { status: 'doing', runs: [run] } : {}) }) as BoardTask),
  } as Board
  const text = liveStatusText(board as never, [], now)
  const tasks = statusSection(text, 'TASKS').join('\n')
  expect(statusSection(text, 'NEEDS YOU').join('\n')).toContain('T-1')
  expect(tasks).toContain('T-1 ')
  expect(tasks).toContain('T-2 Waits on asks')
  expect(tasks).toContain('T-4 Waits on both')
})

test('T-1228: an asking task still counts as a busy agent, and the idle line says needs you', () => {
  const now = Date.now()
  const iso = new Date(now).toISOString()
  let b = emptyBoard()
  for (const title of ['Asks', 'Runs']) b = addTask(b, { origin: { why: 'a test' }, title, files: ['src/'] }, iso)[0]
  const run = { started: iso, agents: [{ id: 'a', role: 'worker', started: iso }] }
  const ask = { by: 'worker', text: 'Which one?', asked_at: iso }
  const board = { ...b, tasks: b.tasks.map(t => ({ ...t, status: 'doing' as const, runs: [run], ...(t.id === 'T-1' ? { live: { time_ask: iso } } : {}) }) as unknown as BoardTask) } as Board
  const text = liveStatusText(board as never, [], now)
  expect(statusSection(text, 'TASKS').join('\n')).toContain('T-1 ')
  expect(text).toMatch(/agents 2\/\d+ busy/)
  const alone = { ...board, tasks: board.tasks.filter(t => t.id === 'T-1') }
  expect(statusSection(liveStatusText(alone as never, [], now), 'TASKS').join('\n')).not.toContain('stopped')
})

test('T-902: NEEDS YOU is left out when nothing waits; BRANCHES comes between the tasks and today once git was read', () => {
  const now = Date.now()
  const quiet = liveStatusText(statusBoard(now, true) as never, [], now)
  expect(statusHeadings(quiet)).toEqual(['TASKS', 'TODAY', 'ORGANIZATIONAL MEMORY'])
  const br = liveStatusText({ tasks: branchTasks(now), branches: branchFactsAt(now) } as never, [], now)
  expect(statusHeadings(br)).toEqual(['NEEDS YOU', 'TASKS', 'BRANCHES', 'TODAY', 'ORGANIZATIONAL MEMORY'])
  expect(statusSection(br, 'BRANCHES')[0]!.startsWith('  main   ●')).toBe(true)
  expect(statusSection(br, 'BRANCHES').some(l => l.includes('T-721 ▶ running · +3 commits · 1 behind'))).toBe(true)
  // T-913: a paused, a failed, a waiting, a review and a running task's row each say their state
  const st = liveStatusText({ tasks: branchStateTasks(now), branches: branchStateFactsAt(now) } as never, [], now)
  const rows = statusSection(st, 'BRANCHES')
  for (const x of ['T-5 ✗ failed', 'T-6 ? waiting', 'T-7 ◆ in review', 'T-8 ⊛ test', 'T-47 ‖ paused']) expect(rows.some(l => l.includes(`${x} · +1 commit · 155 behind`)), x).toBe(true)
})

test('T-902: /symcc-status answers with the Live text and opens no panel, with a panel and without', async () => {
  for (const features of [ALL_FEATURES, BARE]) {
    // the command reads the real clock (hooks/app/slash-commands.ts); statusSection keeps TODAY's past lines, so this
    // holds at any time of day (the fixed times are checked on liveStatusText above)
    const now = Date.now()
    const b = statusBoard(now)
    const w = world(features, b)
    const r = await runCommand(w.host, `${S.N.name}-status`, '')
    expect(r?.isTextDisplayOnly).toBe(true)
    expect(statusHeadings(r!.text)).toEqual(['NEEDS YOU', 'TASKS', 'TODAY', 'ORGANIZATIONAL MEMORY'])
    expect(statusSection(r!.text, 'TODAY')).toEqual(statusTodayLines(b, now))
    expect(statusTail(r!.text, statusHint(S.N.name))).toEqual(statusTailWant(statusHint(S.N.name)))
    expect(w.opened).toEqual([])
    const q = world(features, statusBoard(now, true))
    expect(statusHeadings((await runCommand(q.host, `${S.N.name}-status`, ''))!.text)).toEqual(['TASKS', 'TODAY', 'ORGANIZATIONAL MEMORY'])
    expect(q.opened).toEqual([])
  }
})

test('T-902: the manual lists /symcc-status, and the entries around it start their text in the same column', () => {
  for (const f of [ALL_FEATURES, BARE]) {
    const lines = manual('commands', f).split('\n')
    const col = (start: string) => lines.find(l => l.startsWith(`  /${S.N.name}${start}`))!.search(/(?<=\S {2,})\S/)
    expect(lines.some(l => l.startsWith(`  /${S.N.name}-status              the Live tab as text in the chat`))).toBe(true)
    expect([col('-scout '), col('-status '), col('-task T-3 '), col('-task T-3 WORD'), col('-approve ')]).toEqual([29, 29, 29, 29, 29])
  }
})

test('T-902: the command list has /symcc-status in every client', () => {
  for (const f of [ALL_FEATURES, BARE]) expect(COMMANDS(f).find(c => c.name === `${S.N.name}-status`)?.description).toBe(`Show the ${S.N.name} Live tab as text in the chat: what needs you, the running tasks and what waits for them, the branches, today's numbers and the newest notes`)
})

// T-915: every Live heading is "─── ❯ NAME ───…" to the right edge; when narrow "─ ❯ NAME", the name cut
test('T-915: liveHeading at 80 columns and narrow, and the /symcc-status headings at 80 and 30 columns', () => {
  const t = (name: string, w: number) => segText(liveHeading(name, w))
  expect(t('Tasks', 80)).toBe(`─── ❯ TASKS ${'─'.repeat(68)}`)
  expect(t('Branches', 80)).toBe(`─── ❯ BRANCHES ${'─'.repeat(65)}`)
  expect(liveHeading('Tasks', 80).map(s => s.tone)).toEqual(['heading', 'heading', 'heading'])
  expect(t('Tasks', 10)).toBe('─ ❯ TASKS')
  expect(t('Branches', 8)).toBe('─ ❯ BRA…')
  for (const w of [80, 30, 12, 8, 5, 3]) for (const n of ['Needs you', 'Tasks', 'Branches', 'Today', 'Organizational memory']) expect([n, w, textWidth(t(n, w)) <= w]).toEqual([n, w, true])
  const now = Date.now()
  const b = statusBoard(now)
  for (const w of [80, 30]) {
    const heads = liveStatusText({ tasks: b.tasks }, notes, now, 'symcc', w).split('\n').filter(l => l.startsWith('─'))
    expect(heads.length >= 3).toBe(true)
    for (const h of heads) expect([h, h.startsWith('─── ❯ '), textWidth(h)]).toEqual([h, true, w])
  }
})
