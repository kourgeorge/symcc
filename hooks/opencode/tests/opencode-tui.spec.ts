// symcc's OpenCode TUI part (T-466), run with bun test (scripts/test-opencode-host.sh). What the TUI draws comes from
// board-view.ts, made with hooks/core's helpers, so the band's and the panel's lines are checked as data: the band's
// row fronts (bandLeads) with no stray note for a "worker starting" row (T-470's claim note), the list grouped by state
// with the terminal list's marks and short states, a task's page, and its keys. Then startTui runs on a fake tui
// context and a fake Solid runtime (no OpenCode needed): it reads .symcc/view.json from a folder above its own, draws
// the panel and the band from it, opens the panel from the "/symcc" keymap command, and sends the panel's approve,
// reject and answer as symcc's slash commands in the panel's session. And how the TUI part gets OpenCode's Solid and
// OpenTUI (T-500): opencode/tui.ts imports them by their written-out names (what OpenCode swaps for its own copies),
// and loadTuiRuntime names a package that is missing or lacks a function instead of failing with a bare import error.
import { test, expect } from 'bun:test'
import { addTask, emptyBoard, patchTask, bandNote, gitNote, statusCell, STATUS_MARK, type Board } from '../../board'
import type { PaneView } from '../../app/state'
import { bandLines, panelLines, panelKeys, parseViewFile, viewFileText, lineText, actionCommand, answerOptions, OWN_ANSWER, type ViewFile } from '../board-view'
import { readFile } from 'node:fs/promises'
import { PLUGIN_ROOT } from '../host'
import { startTui, viewPaths, loadTuiRuntime, BOARD_PANEL, setupFailed, colorOf, drawLines, type TuiContext, type TuiRuntime, type TuiPanelInput, type TuiKeyLayer } from '../tui'

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

test('T-517: with no git repo the banner warns without the "(g)" key hint (this panel has no g key) and says to ask the lead', () => {
  const f = viewFile()
  for (const git_state of ['no-repo', 'no-commits'] as const) {
    const lines = panelLines({ ...f, view: { ...f.view, git_state, branch_note: gitNote(git_state) } }, { opened: '', cursor: 0 }, NOW, 100).lines.map(lineText).join('\n')
    expect(lines).toContain('set up git (ask the lead)')
    expect(lines).not.toContain('(g)')
  }
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

test('a doing row on a later try shows "Σ" with the total work time of all tries in the band and the list, never "in all"; a narrow row drops it (T-545)', () => {
  const f0 = viewFile()
  const min = (m: number) => new Date(NOW - m * 60_000).toISOString()
  const runs = [{ started: min(300), ended: min(250) }, { started: min(200), ended: min(165) }, { started: min(15) }]
  const f = { ...f0, view: { ...f0.view, tasks: f0.view.tasks.map(t => (t.id === 'T-1' ? { ...t, attempts: 3, runs, note: '' } : t)), working: [] } }
  const row = (lines: string[]) => lines.find(l => /T-1 /.test(l))!
  const band = bandLines(f, NOW, 120).map(lineText)
  expect(row(band)).toContain('15m · Σ1h 40m · try 3')
  const list = panelLines(f, { opened: '', cursor: 0 }, NOW, 100).lines.map(lineText)
  expect(row(list)).toContain('15m · Σ1h 40m')
  for (const l of [...band, ...list]) expect(l).not.toContain('in all')
  // narrow: the total is left out, this try's time stays
  expect(row(bandLines(f, NOW, 40).map(lineText))).not.toContain('Σ')
  expect(row(panelLines(f, { opened: '', cursor: 0 }, NOW, 40).lines.map(lineText))).not.toContain('Σ')
  expect(row(panelLines(f, { opened: '', cursor: 0 }, NOW, 40).lines.map(lineText))).toContain('15m')
})

test('a waiting task that only reruns its tests shows with the running ones as "retest", not as waiting for you; a waiting task with a question is unchanged (T-534)', () => {
  const f0 = viewFile()
  const f = { ...f0, view: { ...f0.view, tasks: f0.view.tasks.map(t => (t.id === 'T-4' ? { ...t, status: 'waiting' as const, test_rerun: 1, note: 'tests ran out of time' } : t)) } }
  // the band: the rerun row is green (running) and says "rerunning its tests", not its note
  const band = bandLines(f, NOW, 120)
  const rerun = band.find(l => lineText(l).startsWith('T-4'))!
  expect(rerun[0]!.color).toBe('green')
  expect(lineText(rerun)).toContain('retest')
  // its front shows the running mark, not the waiting one (T-541); the question row keeps the waiting mark
  expect(lineText(rerun)).toMatch(new RegExp(`^T-4 +${STATUS_MARK.doing} retest`))
  expect(lineText(rerun)).toContain('— rerunning its tests')
  expect(lineText(rerun)).not.toContain('tests ran out of time')
  const asked = band.find(l => lineText(l).startsWith('T-3'))!
  expect(asked[0]!.color).toBe('yellow')
  expect(lineText(asked)).toMatch(new RegExp(`^T-3 +\\${STATUS_MARK.waiting} waiting`))
  expect(lineText(asked)).toContain('— Which database?')
  // the list: not under NEEDS YOU, not bold, the running mark and color; the question task stays bold under NEEDS YOU
  const list = panelLines(f, { opened: '', cursor: 0 }, NOW, 100)
  expect(list.ids.slice(0, 2).sort()).toEqual(['T-2', 'T-3'])
  const row = list.lines.find(l => lineText(l).includes('T-4 '))!
  expect(lineText(row)).toContain(`${STATUS_MARK.doing} retest`)
  expect(row[2]!.color).toBe('ide')
  expect(!!row[3]!.bold).toBe(false)
  const q = list.lines.find(l => lineText(l).includes('T-3 '))!
  expect(lineText(q)).toContain(STATUS_MARK.waiting)
  expect(q[3]!.bold).toBe(true)
  // its page asks nothing and has no answer key
  expect(panelKeys(f, 'T-4').map(k => k.word)).toEqual(['back'])
  expect(panelLines(f, { opened: 'T-4', cursor: 0 }, NOW, 100).lines.map(lineText).some(l => l.includes('asks:'))).toBe(false)
  expect(panelKeys(f, 'T-3').map(k => k.word)).toEqual(['answer', 'back'])
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

test('startTui on a fake OpenCode TUI: reads the view file above its folder, draws the panel and the band, opens from /symcc-board, and sends approve, reject and answer as slash commands', async () => {
  const f = viewFile()
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const sent: { sessionID: string; name: string; text: string }[] = []
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const layers: TuiKeyLayer[] = []
  const toasts: string[] = []
  let current: { name: string; sessionID: string } | undefined
  const answers = { prompt: 'too big', select: 'postgres' as string | undefined }
  const ctx: TuiContext = {
    location: { directory: '/work/proj/src' },
    theme: { primary: 'blue' },
    renderer: { width: 120 },
    client: { session: { command: async input => void sent.push(input) } },
    keymap: { layer: factory => void layers.push(factory()) },
    ui: {
      toast: { show: o => void toasts.push(o.message) },
      dialog: { prompt: async () => answers.prompt, select: async <V,>() => answers.select as V | undefined },
      panel: { open: name => ((current = { name, sessionID: 'ses_1' }), true), close: () => (current = undefined), current: () => current },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  let stopped = false
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => void (stopped = true), now: () => NOW })
  await board.refresh()
  // "/symcc-board" and the palette's "symcc board" open the board panel. The layer is "global": OpenCode 2.3 lists a
  // layer of its default "base" mode in neither the palette nor the slash list (T-505). Plain "/symcc" is left to
  // the server's command (the text board), so the slash list has no two "/symcc" rows.
  const openLayer = layers.find(l => l.commands?.some(c => c.id === 'symcc.board.open'))!
  expect(openLayer.mode).toBe('global')
  const open = openLayer.commands!.find(c => c.id === 'symcc.board.open')!
  expect(open.slash?.name).toBe('symcc-board')
  expect(open.palette).toBe(true)
  expect(open.title).toBe('symcc board')
  await open.run()
  expect(current?.name).toBe(BOARD_PANEL)
  // run again while it is open: it closes
  await open.run()
  expect(current).toBe(undefined)
  await open.run()
  expect(current?.name).toBe(BOARD_PANEL)
  expect(toasts).toEqual([])
  // no layer of the panel's keys before the panel is drawn: they are made inside it
  expect(layers.length).toBe(1)
  let focused = true
  const input = { name: BOARD_PANEL, sessionID: 'ses_1', width: 100, get focused() { return focused }, close: () => undefined } as TuiPanelInput
  const panel = slots.find(s => s.append === 'session.panel')!.render(input as never)
  expect(shown(panel).some(l => l.includes('NEEDS YOU'))).toBe(true)
  expect(shown(panel).some(l => l.includes('T-2') && l.includes(`${STATUS_MARK.review} review`))).toBe(true)
  // another plugin's panel: nothing drawn
  expect(shown(slots.find(s => s.append === 'session.panel')!.render({ ...input, name: 'other' } as never))).toEqual([])
  const band = slots.find(s => s.append === 'session.composer.top')!.render({ sessionID: 'ses_1' } as never)
  expect(shown(band)[0]).toContain('symcc')
  expect(shown(band).find(l => l.startsWith('T-1'))).not.toContain('worker starting')
  // the panel's keys: made inside the panel's drawing, and on only while it shows the board and has the keyboard
  const keys = layers.find(l => l.commands?.some(c => c.bind === 'escape'))!
  expect(keys.mode).toBe(undefined)
  const on = () => typeof keys.enabled === 'function' && keys.enabled()
  expect(on()).toBe(true)
  focused = false
  expect(on()).toBe(false)
  focused = true
  // Esc closes the panel
  await keys.commands!.find(c => c.bind === 'escape')!.run()
  expect(current).toBe(undefined)
  await open.run()
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

test('loadTuiRuntime: takes createSignal from solid-js and createElement, setProp, insert from @opentui/solid', async () => {
  const fake = fakeRuntime()
  const r = await loadTuiRuntime({
    solid: async () => ({ createSignal: fake.createSignal, createMemo: () => 0 }),
    opentui: async () => ({ createElement: fake.createElement, setProp: fake.setProp, insert: fake.insert }),
  })
  expect(r.createSignal).toBe(fake.createSignal)
  expect(r.createElement).toBe(fake.createElement)
  expect(r.setProp).toBe(fake.setProp)
  expect(r.insert).toBe(fake.insert)
})

test("loadTuiRuntime: a package that can't load, or lacks a function, fails with an error naming it (not a bare import error)", async () => {
  const fake = fakeRuntime()
  const opentui = async () => ({ createElement: fake.createElement, setProp: fake.setProp, insert: fake.insert })
  const notFound = async () => {
    throw new Error("Cannot find package 'solid-js' imported from /x/opencode/tui.ts")
  }
  const err = (p: Promise<unknown>) => p.then(() => '', (e: unknown) => (e instanceof Error ? e.message : String(e)))
  const a = await err(loadTuiRuntime({ solid: notFound, opentui }))
  expect(a).toContain("can't load 'solid-js'")
  expect(a).toContain('OpenCode 2.3 or newer')
  expect(a).toContain('Cannot find package')
  const b = await err(loadTuiRuntime({ solid: async () => ({ createSignal: fake.createSignal }), opentui: async () => ({ createElement: fake.createElement, insert: fake.insert }) }))
  expect(b).toContain("'@opentui/solid'")
  expect(b).toContain('setProp')
  const c = await err(loadTuiRuntime({ solid: async () => null, opentui }))
  expect(c).toContain("'solid-js'")
  expect(c).toContain('createSignal')
})

test('opencode/tui.ts imports solid-js and @opentui/solid by their written-out names (OpenCode swaps only those for its own copies), never through a variable', async () => {
  const src = await readFile(`${PLUGIN_ROOT}/opencode/tui.ts`, 'utf8')
  const code = src.split('\n').filter((l: string) => !l.trim().startsWith('//')).join('\n')
  expect(code).toContain("import('solid-js')")
  expect(code).toContain("import('@opentui/solid')")
  expect(code).toContain('loadTuiRuntime(')
  // every import() takes a plain string, so none can miss OpenCode's swap
  const dynamic = code.match(/import\(([^)]*)\)/g) ?? []
  expect(dynamic.length).toBe(2)
  for (const d of dynamic) expect(d).toMatch(/^import\('[^']+'\)$/)
  // the server entry doesn't load the TUI's modules, so a TUI failure can't stop the server part
  const server = await readFile(`${PLUGIN_ROOT}/opencode/server.ts`, 'utf8')
  expect(server).not.toContain('solid')
  expect(server).not.toContain('/tui')
})

/** A fake tui context for the T-505 tests: records toasts, layers and slot claims; ui.panel.open answers `opens`. */
function fakeCtx(theme: unknown, opens = true) {
  const toasts: { message: string; variant?: string }[] = []
  const layers: TuiKeyLayer[] = []
  const slots: { append: string; render: (input: never) => unknown }[] = []
  let current: { name: string; sessionID: string } | undefined
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme,
    renderer: { width: 120 },
    client: { session: { command: async () => undefined } },
    keymap: { layer: factory => void layers.push(factory()) },
    ui: {
      toast: { show: o => void toasts.push({ message: o.message, variant: o.variant }) },
      dialog: { prompt: async () => undefined, select: async () => undefined },
      panel: { open: name => (opens ? ((current = { name, sessionID: 's' }), true) : false), close: () => (current = undefined), current: () => current },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  return { ctx, toasts, layers, slots, current: () => current }
}

/** An OpenTUI color as OpenCode 2.3's theme holds it (an RGBA: a buffer of four numbers). */
const rgba = (...n: number[]) => ({ buffer: new Float32Array(n) })

test("colorOf reads OpenCode 2.3's nested theme (text.base, text.feedback.warning.base, hue.blue.200 ...), and never gives a group of colors as a text color", () => {
  const theme = {
    text: { base: rgba(1, 1, 1, 1), muted: rgba(2, 2, 2, 1), feedback: { warning: { base: rgba(3, 3, 3, 1) }, error: { base: rgba(4, 4, 4, 1) }, success: { base: rgba(5, 5, 5, 1) }, info: { base: rgba(6, 6, 6, 1) } } },
    border: { base: rgba(7, 7, 7, 1) },
    hue: { blue: { 200: rgba(8, 8, 8, 1) }, orange: { 200: rgba(9, 9, 9, 1) }, purple: { 200: rgba(10, 10, 10, 1) } },
  }
  expect(colorOf(theme, 'text')).toBe(theme.text.base)
  expect(colorOf(theme, 'inactive')).toBe(theme.text.muted)
  expect(colorOf(theme, 'warning')).toBe(theme.text.feedback.warning.base)
  expect(colorOf(theme, 'error')).toBe(theme.text.feedback.error.base)
  expect(colorOf(theme, 'success')).toBe(theme.text.feedback.success.base)
  expect(colorOf(theme, 'cyan')).toBe(theme.text.feedback.info.base)
  expect(colorOf(theme, 'subtle')).toBe(theme.border.base)
  expect(colorOf(theme, 'ide')).toBe(theme.hue.blue[200])
  expect(colorOf(theme, 'claude')).toBe(theme.hue.orange[200])
  expect(colorOf(theme, 'permission')).toBe(theme.hue.purple[200])
  expect(colorOf(theme, 'no such name')).toBe(theme.text.base)
  // a theme that lacks a field, or has a group where a color should be (OpenCode 2.3's theme.text, read the old
  // flat way): the plain fallback, never the object
  expect(colorOf({}, 'warning')).toBe('#e5c07b')
  expect(colorOf({ text: { base: { action: {} } } }, 'text')).toBe('#d0d0d0')
  expect(colorOf(undefined, 'ide')).toBe('#5c9cf5')
  // every color of a drawing is one color: a string or an RGBA
  const fgs: unknown[] = []
  const r = { ...fakeRuntime() }
  const set = r.setProp
  r.setProp = (n, k, v) => (k === 'fg' && fgs.push(v), set(n, k, v))
  drawLines(r, theme, bandLines(viewFile(), NOW, 120))
  expect(fgs.length).toBeGreaterThan(0)
  for (const v of fgs) expect(typeof v === 'string' || (typeof v === 'object' && v !== null && 'buffer' in v)).toBe(true)
})

test('drawLines: a line too long for its place is cut, not wrapped piece by piece (each colored piece is its own text)', () => {
  const node = drawLines(fakeRuntime(), {}, [[{ text: 'symcc v0.4.1', color: 'ide' }, { text: ' · proj', color: 'inactive' }]]) as El
  const row = (node.kids[0] as El[])[0]!
  expect(row.props.overflow).toBe('hidden')
  for (const t of row.kids[0] as El[]) {
    expect(t.props.wrapMode).toBe('none')
    expect(t.props.flexShrink).toBe(0)
  }
})

test("/symcc-board with no session open (OpenCode's home page, where ui.panel.open says no): a toast says to open a session first", async () => {
  const f = fakeCtx({}, false)
  const board = startTui(f.ctx, { runtime: fakeRuntime(), readText: async () => viewFileText(viewFile()), every: () => () => undefined, now: () => NOW })
  await f.layers.find(l => l.mode === 'global')!.commands![0]!.run()
  expect(f.current()).toBe(undefined)
  expect(f.toasts.length).toBe(1)
  expect(f.toasts[0]!.message).toContain('Open or start a session first')
  expect(f.toasts[0]!.message).toContain('/symcc-board')
  board.stop()
})

test('a band that fails to draw says so once in a toast (not an empty place with no word); a setup that fails says so too', async () => {
  const f = fakeCtx({})
  const r = fakeRuntime()
  const broken: TuiRuntime = { ...r, createElement: tag => (tag === 'text' ? (() => { throw new Error('bad element') })() : r.createElement(tag)) }
  const board = startTui(f.ctx, { runtime: broken, readText: async () => viewFileText(viewFile()), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const band = f.slots.find(s => s.append === 'session.composer.top')!.render({ sessionID: 's' } as never)
  expect(shown(band)).toEqual([])
  shown(band)
  expect(f.toasts.map(t => t.message)).toEqual(["symcc's band above the prompt could not be drawn: bad element"])
  expect(f.toasts[0]!.variant).toBe('error')
  board.stop()
  // setup: the toast names what is missing and what still works; the error is given back to be thrown
  const g = fakeCtx({})
  const err = setupFailed(g.ctx, new Error("symcc's OpenCode board can't load 'solid-js'"))
  expect(err.message).toContain('solid-js')
  expect(g.toasts[0]!.message).toContain('no band above the prompt and no board panel')
  expect(g.toasts[0]!.message).toContain('/plugins')
  expect(g.toasts[0]!.variant).toBe('error')
  // no UI to toast in: still gives the error back
  expect(setupFailed({ ui: { toast: { show: () => { throw new Error('gone') } } } } as never, 'x').message).toBe('x')
})

test('opencode/tui.ts says a failed setup in a toast and throws it on (setupFailed), so /plugins lists it', async () => {
  const src = await readFile(`${PLUGIN_ROOT}/opencode/tui.ts`, 'utf8')
  expect(src).toContain('throw setupFailed(ctx, e)')
})

test('a to do task worked on before shows ● in the panel list and on its page; a fresh one keeps ○ (T-528)', () => {
  const f = viewFile()
  f.view.tasks = f.view.tasks.map(t => (t.id === 'T-4' ? { ...t, attempts: 1 } : t))
  const fresh = viewFile()
  const row = (v: ViewFile) => panelLines(v, { opened: '', cursor: 0 }, NOW, 100).lines.map(lineText).find(l => l.includes('T-4 '))!
  expect(row(fresh)).toContain(`${STATUS_MARK.todo} `)
  expect(row(f)).toContain('● ')
  expect(row(f)).not.toContain(STATUS_MARK.todo)
  expect(panelLines(f, { opened: 'T-4', cursor: 0 }, NOW, 100).lines.map(lineText).some(l => l.includes('● to do'))).toBe(true)
})
