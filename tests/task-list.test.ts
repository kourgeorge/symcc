// T-901: /symcc-tasks prints the open tasks as a short grouped list in the chat and never opens the panel (with a
// panel or without); /symcc-board opens the panel on Live where there is one, and says plainly where there is none.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { fakeHost, memoryFs } from './fake-host'
import { type HostFeatures, ALL_FEATURES } from '../hooks/host'
import { emptyBoard, addQuestion, type Board } from '../hooks/board'
import { S } from '../hooks/app/state'
import { BOARD_OPENED, COMMANDS, noPanelText, runCommand } from '../hooks/app/symcc'
import { tasksListText } from '../hooks/core/task-list'
import { taskListBoard, TASK_LIST_TEXT, EMPTY_TASK_LIST_TEXT } from './task-list-fixture'

const ROOT = '/repo'
const BARE: HostFeatures = { panel: false, band: false, wakeLead: 'next-turn', planMode: false, leadUsage: false, startQueue: true }

function world(features: Partial<HostFeatures>, b: Board) {
  const files = new Map<string, string>()
  const opened: { id: string; tab?: unknown }[] = []
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

test('T-901: the tasks list groups the open tasks as the board does, then the counts and the hint', () => {
  const now = Date.now()
  expect(tasksListText(taskListBoard(now), now)).toBe(TASK_LIST_TEXT)
  expect(tasksListText(emptyBoard(), now)).toBe(EMPTY_TASK_LIST_TEXT)
  // open questions come first; a long title is cut to the width
  const [q] = addQuestion(taskListBoard(now), 'Raise the version?', ['yes', 'no'], new Date(now).toISOString())
  const text = tasksListText({ ...q, tasks: q.tasks.map(t => (t.id === 'T-5' ? { ...t, title: 'x'.repeat(200) } : t)) }, now, 'symcc', 60)
  expect(text.split('\n').slice(0, 3)).toEqual(['Questions for you (1)', '  ? Q-1 Raise the version? (yes | no)', ''])
  expect(text.split('\n').slice(0, -1).every(l => l.length <= 60)).toBe(true)
  expect(text).toContain('  ○ T-5  to do      xxx')
})

test('T-901: /symcc-tasks answers with the list and opens no panel, with a panel and without', async () => {
  for (const features of [ALL_FEATURES, BARE]) {
    const w = world(features, taskListBoard(Date.now()))
    const r = await runCommand(w.host, `${S.N.name}-tasks`, '')
    expect(r?.text).toBe(TASK_LIST_TEXT)
    expect(r?.isTextDisplayOnly).toBe(true)
    expect(w.opened).toEqual([])
    const e = world(features, emptyBoard())
    expect((await runCommand(e.host, `${S.N.name}-tasks`, ''))?.text).toBe(EMPTY_TASK_LIST_TEXT)
    expect(e.opened).toEqual([])
  }
})

test('T-901: /symcc-board opens the panel where there is one, and says so plainly where there is none', async () => {
  const c = world(ALL_FEATURES, taskListBoard(Date.now()))
  expect((await runCommand(c.host, `${S.N.name}-board`, ''))?.text).toBe(BOARD_OPENED)
  expect(c.opened).toEqual([{ id: S.N.pane }])
  const n = world(BARE, taskListBoard(Date.now()))
  expect((await runCommand(n.host, `${S.N.name}-board`, ''))?.text).toBe(noPanelText())
  expect(n.opened).toEqual([])
})

test('T-901: the command list has /symcc-tasks (a list in the chat) and, with a panel, /symcc-board', () => {
  const panel = COMMANDS(ALL_FEATURES)
  expect(panel.find(c => c.name === `${S.N.name}-tasks`)?.description).toBe(`List the open ${S.N.name} tasks in the chat, grouped as on the board (what needs you, running, in review, failed, to do), with the backlog and today's counts`)
  expect(panel.find(c => c.name === `${S.N.name}-board`)?.description).toBe(`Open the ${S.N.name} board panel (on Live); html writes the board as a web page and opens it`)
  // OpenCode's TUI part registers its own /symcc-board, so a host with no panel doesn't list it
  expect(COMMANDS(BARE).some(c => c.name === `${S.N.name}-board`)).toBe(false)
  expect(COMMANDS(BARE).some(c => c.name === `${S.N.name}-tasks`)).toBe(true)
})
