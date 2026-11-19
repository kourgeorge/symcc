// symcc's OpenCode TUI part (T-466), run with bun test (scripts/test-opencode-host.sh). What the TUI draws comes from
// board-view.ts, made with hooks/core's helpers, so the band's and the panel's lines are checked as data: the band's
// row fronts (bandLeads) with no stray note for a "worker starting" row (T-470's claim note), the list grouped by state
// with the terminal list's marks and short states, a task's page, and its keys. Then startTui runs on a fake tui
// context and a fake Solid runtime (no OpenCode needed): it reads .symcc/view.json from a folder above its own, draws
// the panel and the band from it, opens the panel from the "/symcc" keymap command, and sends the panel's approve,
// reject and answer as symcc's slash commands in the panel's session.
import { test, expect } from 'bun:test'
import { addTask, emptyBoard, patchTask, bandNote, statusCell, STATUS_MARK, type Board } from '../../board'
import type { PaneView } from '../../app/state'
import { bandLines, panelLines, panelKeys, parseViewFile, viewFileText, lineText, actionCommand, answerOptions, OWN_ANSWER, type ViewFile } from '../board-view'
import { startTui, viewPaths, BOARD_PANEL, type TuiContext, type TuiRuntime, type TuiPanelInput, type TuiKeyCommand } from '../tui'

const NOW = Date.parse('2026-11-19T12:00:00.000Z')
const AT = '2026-11-19T11:00:00.000Z'

/** A board: T-1 doing (its worker just claimed it: "worker starting", started 3 minutes ago), T-2 in review, T-3
 *  waiting with choices, T-4 to do, T-5 done; and the view file the engine would write for it. */
function viewFile(): ViewFile {
  let b: Board = emptyBoard()
  for (const title of ['a change in src', 'a reviewed change', 'which database', 'a later one', 'an old one']) b = addTask(b, { origin: { why: 'a test' }, title, files: ['src/'] }, AT)[0]
  b = patchTask(b, 'T-1', { status: 'doing', note: 'worker starting' }, AT)
  b = patchTask(b, 'T-2', { status: 'review' }, AT)
  b = patchTask(b, 'T-3', { status: 'waiting', question: 'Which database?', options: ['mysql', 'postgres'] }, AT)
  b = patchTask(b, 'T-5', { status: 'done' }, AT)
  const view: PaneView = { tasks: b.tasks, working: [{ task: 'T-1', since: NOW - 3 * 60_000 }], scouts: [], mode: 'auto', test_commands: ['bun test'], max_parallel: 2, max_minutes: 30, auto_retries: 1, driving: true, branch: 'main', branch_note: '' }
  return { root: '/work/proj', home: '/work', name: 'symcc', version: '0.9.0', written_at: NOW, view }
}

test('the view file round-trips, and a broken or foreign one reads as none', () => {
  const f = viewFile()
  expect(parseViewFile(viewFileText(f))).toEqual(f)
  for (const bad of [null, '', '{', '{"view":{}}', '[]']) expect(parseViewFile(bad)).toBe(null)
  expect(viewPaths('/work/proj/.symcc/worktrees/T-1')).toContain('/work/proj/.symcc/view.json')
})

test('the band: the header, then the tasks that need you or run with the list\'s marks and short states; a "worker starting" row shows its time and no stray note', () => {
  const f = viewFile()
  const lines = bandLines(f, NOW, 120).map(lineText)
  expect(lines[0]).toContain('symcc v0.9.0')
  expect(lines[0]).toContain('· proj')
  expect(lines[0]).toContain('1 doing')
  const t1 = f.view.tasks.find(t => t.id === 'T-1')!
  const row1 = lines.find(l => l.startsWith('T-1'))!
  expect(row1).toContain(`${STATUS_MARK.doing} ${statusCell(t1, NOW, NOW - 3 * 60_000)}`)
  expect(row1).toContain('3m')
  expect(row1).not.toContain('worker starting')
  expect(bandNote(t1, NOW, NOW - 3 * 60_000)).toBe('')
  // with no time to show, the note says what goes on
  expect(bandNote(t1, NOW)).toBe('worker starting')
  expect(lines.find(l => l.startsWith('T-3'))).toContain('— Which database?')
  expect(lines.find(l => l.startsWith('T-2'))).toContain(`${STATUS_MARK.review} review`)
  expect(lines.some(l => l.startsWith('T-4') || l.startsWith('T-5'))).toBe(false)
  // nothing on the board, or symcc off: no band
  expect(bandLines({ ...f, view: { ...f.view, tasks: [] } }, NOW, 120)).toEqual([])
  expect(bandLines({ ...f, view: { ...f.view, enabled: false } }, NOW, 120)).toEqual([])
  expect(bandLines(null, NOW, 120)).toEqual([])
})

test('the panel: the banner, then the list grouped by state (NEEDS YOU, what runs and waits, Done folded) with the cursor; a task\'s page with its rows, choices and keys', () => {
  const f = viewFile()
  const list = panelLines(f, { opened: '', cursor: 0 }, NOW, 100)
  const text = list.lines.map(lineText)
  expect(text[0]).toContain('symcc')
  expect(text.some(l => l.includes('tests: bun test'))).toBe(true)
  const needs = text.indexOf('NEEDS YOU')
  expect(needs).toBeGreaterThan(0)
  expect(list.ids.slice(0, 2).sort()).toEqual(['T-2', 'T-3'])
  expect(list.ids).toContain('T-1')
  expect(list.ids).toContain('T-4')
  expect(list.ids).not.toContain('T-5')
  expect(list.selected).toBe(list.ids[0])
  expect(text.find(l => l.includes(list.ids[0]!))).toMatch(/^› /)
  expect(text.find(l => l.includes('T-2'))).toContain(`${STATUS_MARK.review} review`)
  expect(text.find(l => l.includes('T-1 '))).toContain(`${STATUS_MARK.doing} 3m`)
  expect(text.some(l => l.includes('▸ Done') && l.includes('1'))).toBe(true)
  expect(lineText(list.lines.at(-1)!)).toContain('Enter open')
  // the cursor moves down a row, and stops at the end
  expect(panelLines(f, { opened: '', cursor: 1 }, NOW, 100).selected).toBe(list.ids[1])
  expect(panelLines(f, { opened: '', cursor: 99 }, NOW, 100).selected).toBe(list.ids.at(-1))
  // a task in review: its page and the approve and reject keys
  const page = panelLines(f, { opened: 'T-2', cursor: 0 }, NOW, 100).lines.map(lineText)
  expect(page.some(l => l.startsWith('T-2 a reviewed change'))).toBe(true)
  expect(page.some(l => l.startsWith('Status:') && l.includes('ready for review'))).toBe(true)
  expect(panelKeys(f, 'T-2').map(k => k.word)).toEqual(['approve', 'reject', 'back'])
  // a waiting task: its question and the numbered choices, the last one the owner's own answer
  const asks = panelLines(f, { opened: 'T-3', cursor: 0 }, NOW, 100).lines.map(lineText)
  expect(asks.some(l => l.includes('asks: Which database?'))).toBe(true)
  expect(asks).toContain('  2 postgres')
  expect(answerOptions(f, 'T-3')).toEqual(['mysql', 'postgres', OWN_ANSWER])
  expect(panelKeys(f, 'T-3').map(k => k.word)).toEqual(['answer', 'back'])
  // a running worker whose time is up: its page asks for more time, with Claude's +30 min / +60 min / Stop it
  const over = { ...f, view: { ...f.view, tasks: f.view.tasks.map(t => (t.id === 'T-1' ? { ...t, time_ask: AT, note: 'time is up' } : t)) } }
  expect(panelKeys(over, 'T-1').map(k => k.word)).toEqual(['answer', 'back'])
  expect(answerOptions(over, 'T-1')).toEqual(['+30 min', '+60 min', 'Stop it', OWN_ANSWER])
  expect(panelLines(over, { opened: 'T-1', cursor: 0 }, NOW, 100).lines.map(lineText)).toContain('  1 +30 min')
  // a waiting task whose finished work only waits for the owner's files: nothing to answer
  const files = { ...f, view: { ...f.view, tasks: f.view.tasks.map(t => (t.id === 'T-3' ? { ...t, merge_wait: { dirty: ['src/a.ts'] } } : t)) } }
  expect(panelKeys(files, 'T-3').map(k => k.word)).toEqual(['back'])
  expect(answerOptions(files, 'T-3')).toEqual([])
  expect(panelLines(files, { opened: 'T-3', cursor: 0 }, NOW, 100).lines.map(lineText).some(l => l.includes('asks:'))).toBe(false)
  // the actions are symcc's slash commands
  expect(actionCommand({ kind: 'approve', id: 'T-2' })).toEqual({ name: 'symcc-approve', text: 'T-2' })
  expect(actionCommand({ kind: 'reject', id: 'T-2', reason: ' too big ' })).toEqual({ name: 'symcc-reject', text: 'T-2 too big' })
  expect(actionCommand({ kind: 'answer', id: 'Q-1', answer: 'yes' })).toEqual({ name: 'symcc-answer', text: 'Q-1 yes' })
  // no view file yet: says so
  expect(panelLines(null, { opened: '', cursor: 0 }, NOW, 100).lines.map(lineText).join('\n')).toContain('No board yet')
})

/** A fake of OpenTUI's Solid renderer: elements are plain objects, insert keeps what it is given (functions are drawn when read). */
type El = { tag: string; props: Record<string, unknown>; kids: unknown[] }
function fakeRuntime(): TuiRuntime {
  return {
    createSignal: <T,>(value: T) => {
      let v = value
      return [() => v, (x: T) => void (v = x)] as [() => T, (value: T) => void]
    },
    createElement: tag => ({ tag, props: {}, kids: [] }) as El,
    setProp: (n, name, value) => void ((n as El).props[name] = value),
    insert: (p, value) => void (p as El).kids.push(value),
  }
}

/** The text lines a drawn node shows: one per row box. */
function shown(node: unknown): string[] {
  const flat = (x: unknown): unknown[] => (typeof x === 'function' ? flat(x()) : Array.isArray(x) ? x.flatMap(flat) : x == null ? [] : [x])
  const text = (x: unknown): string => flat(x).map(k => (typeof k === 'string' ? k : text((k as El).kids))).join('')
  const rows = (x: unknown): string[] => flat(x).flatMap(k => (typeof k === 'string' ? [] : (k as El).props.flexDirection === 'row' ? [text((k as El).kids)] : rows((k as El).kids)))
  return rows(node)
}

test('startTui on a fake OpenCode TUI: reads the view file above its folder, draws the panel and the band, opens from /symcc, and sends approve, reject and answer as slash commands', async () => {
  const f = viewFile()
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const sent: { sessionID: string; name: string; text: string }[] = []
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const layers: { enabled?: boolean | (() => boolean); commands?: readonly TuiKeyCommand[] }[] = []
  let current: { name: string; sessionID: string } | undefined
  const answers = { prompt: 'too big', select: 'postgres' as string | undefined }
  const ctx: TuiContext = {
    location: { directory: '/work/proj/src' },
    theme: { primary: 'blue' },
    renderer: { width: 120 },
    client: { session: { command: async input => void sent.push(input) } },
    keymap: { layer: factory => void layers.push(factory()) },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => answers.prompt, select: async <V,>() => answers.select as V | undefined },
      panel: { open: name => ((current = { name, sessionID: 'ses_1' }), true), close: () => (current = undefined), current: () => current },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  let stopped = false
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => void (stopped = true), now: () => NOW })
  await board.refresh()
  // the /symcc keymap command opens the board panel
  const open = layers.flatMap(l => l.commands ?? []).find(c => c.slash?.name === 'symcc')!
  await open.run()
  expect(current?.name).toBe(BOARD_PANEL)
  const input: TuiPanelInput = { name: BOARD_PANEL, sessionID: 'ses_1', width: 100, focused: true, close: () => undefined }
  const panel = slots.find(s => s.append === 'session.panel')!.render(input as never)
  expect(shown(panel).some(l => l.includes('NEEDS YOU'))).toBe(true)
  expect(shown(panel).some(l => l.includes('T-2') && l.includes(`${STATUS_MARK.review} review`))).toBe(true)
  // another plugin's panel: nothing drawn
  expect(shown(slots.find(s => s.append === 'session.panel')!.render({ ...input, name: 'other' } as never))).toEqual([])
  const band = slots.find(s => s.append === 'session.composer.top')!.render({ sessionID: 'ses_1' } as never)
  expect(shown(band)[0]).toContain('symcc')
  expect(shown(band).find(l => l.startsWith('T-1'))).not.toContain('worker starting')
  // the panel's keys work only while it is open and has the keyboard
  const keys = layers.find(l => l.enabled !== undefined)!
  expect(typeof keys.enabled === 'function' && keys.enabled()).toBe(true)
  const ids = panelLines(f, { opened: '', cursor: 0 }, NOW, 98).ids
  const goTo = async (id: string) => {
    await board.press('back', 'ses_1')
    for (let i = 0; i < 9; i++) await board.press('up', 'ses_1')
    for (let i = 0; i < ids.indexOf(id); i++) await board.press('down', 'ses_1')
    await board.press('open', 'ses_1')
    expect(board.state().opened).toBe(id)
  }
  await goTo('T-2')
  expect(shown(panel).some(l => l.startsWith('Status:'))).toBe(true)
  await board.press('a', 'ses_1')
  await board.press('x', 'ses_1')
  await goTo('T-3')
  await board.press('a', 'ses_1')
  answers.select = OWN_ANSWER
  answers.prompt = 'sqlite, it is small'
  await board.press('a', 'ses_1')
  // a key a page doesn't offer does nothing
  await board.press('x', 'ses_1')
  expect(sent).toEqual([
    { sessionID: 'ses_1', name: 'symcc-approve', text: 'T-2' },
    { sessionID: 'ses_1', name: 'symcc-reject', text: 'T-2 too big' },
    { sessionID: 'ses_1', name: 'symcc-answer', text: 'T-3 postgres' },
    { sessionID: 'ses_1', name: 'symcc-answer', text: 'T-3 sqlite, it is small' },
  ])
  board.stop()
  expect(stopped).toBe(true)
})

test('startTui: when the open task leaves the view (or the view file goes away), the panel goes back to the list and its keys work again', async () => {
  const f = viewFile()
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 120 },
    client: { session: { command: async () => undefined } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => undefined, select: async () => undefined },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: () => () => undefined,
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  await board.press('open', 's')
  const first = board.state().opened
  expect(first).not.toBe('')
  // the open task is archived: the view file no longer has it
  files.set('/work/proj/.symcc/view.json', viewFileText({ ...f, view: { ...f.view, tasks: f.view.tasks.filter(t => t.id !== first) } }))
  await board.refresh()
  expect(board.state().opened).toBe('')
  await board.press('down', 's')
  expect(board.state().cursor).toBe(1)
  await board.press('open', 's')
  expect(board.state().opened).not.toBe('')
  // the view file goes away: back to the list too
  files.clear()
  await board.refresh()
  expect(board.state().opened).toBe('')
  board.stop()
})
