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
import { taskActions, mergeRoles, mergeKinds, when, addTask, emptyBoard, patchTask, bandNote, gitNote, statusCell, STATUS_MARK, type Board } from '../../board'
import type { PaneView } from '../../app/state'
import { bandLines, bandDraw, BAND_CLICK_HINT, panelLines, panelKeys, parseViewFile, viewFileText, lineText, actionCommand, answerOptions, OWN_ANSWER, viewDefs, panelTaskActions, TASK_ACTION_COMMANDS, type ViewFile } from '../board-view'
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

test('a doing row shows only the total work time of all tries in the band and the list, no Σ, never "in all"; a narrow row drops the time (T-557)', () => {
  const f0 = viewFile()
  const min = (m: number) => new Date(NOW - m * 60_000).toISOString()
  const runs = [{ started: min(300), ended: min(250) }, { started: min(200), ended: min(165) }, { started: min(15) }]
  const f = { ...f0, view: { ...f0.view, tasks: f0.view.tasks.map(t => (t.id === 'T-1' ? { ...t, attempts: 3, runs, note: '' } : t)), working: [] } }
  const row = (lines: string[]) => lines.find(l => /T-1 /.test(l))!
  const band = bandLines(f, NOW, 120).map(lineText)
  expect(row(band)).toContain('▶ 1h40m · try 3')
  const list = panelLines(f, { opened: '', cursor: 0 }, NOW, 100).lines.map(lineText)
  expect(row(list)).toContain('▶ 1h40m')
  for (const l of [...band, ...list]) {
    expect(l).not.toContain('in all')
    expect(l).not.toContain('Σ')
  }
  // narrow: the time is left out
  expect(row(bandLines(f, NOW, 40).map(lineText))).not.toContain('1h40m')
  expect(row(panelLines(f, { opened: '', cursor: 0 }, NOW, 30).lines.map(lineText))).not.toContain('1h40m')
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
  expect(panelKeys(f, 'T-2').map(k => k.word)).toEqual(['approve', 'reject', 'show changes', 'back'])
  // T-575: the page's actions are core's taskActions (the terminal's and VS Code's buttons) that have a slash command
  const t2 = f.view.tasks.find(t => t.id === 'T-2')!
  expect(panelTaskActions(t2).map(a => a.id)).toEqual(taskActions(t2).filter(a => a.key && TASK_ACTION_COMMANDS[a.id]).map(a => a.id))
  expect(panelTaskActions(t2).map(a => `${a.key} ${a.id}`)).toEqual(['a approve', 'x reject', 'd show-changes'])
  // an answered investigation in review: done and ask more, as on the other hosts (keep as a note has no slash command)
  const inv = { ...f, view: { ...f.view, tasks: f.view.tasks.map(t => (t.id === 'T-2' ? { ...t, kind: 'investigation' } : t)) } } as ViewFile
  expect(panelKeys(inv, 'T-2').map(k => `${k.key} ${k.word}`)).toEqual(['a done', 'x ask more', 'b back'])
  // a waiting task with no question text says its note, else that it waits (core's taskAsks)
  const noQ = { ...f, view: { ...f.view, tasks: f.view.tasks.map(t => (t.id === 'T-3' ? { ...t, question: null, options: undefined, note: '' } : t)) } } as ViewFile
  expect(panelLines(noQ, { opened: 'T-3', cursor: 0 }, NOW, 100).lines.map(lineText).some(l => l.includes('asks: it waits for your answer'))).toBe(true)
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
  expect(actionCommand({ kind: 'diff', id: 'T-2' })).toEqual({ name: 'symcc-diff', text: 'T-2' })
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
  await board.press('d', 'ses_1')
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
    { sessionID: 'ses_1', name: 'symcc-diff', text: 'T-2' },
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

/** The row boxes of a drawn node, each with its text and its own props (the fake keeps what setProp is given). */
function rowEls(node: unknown): { text: string; el: El; segs: El[] }[] {
  const flat = (x: unknown): unknown[] => (typeof x === 'function' ? flat(x()) : Array.isArray(x) ? x.flatMap(flat) : x == null ? [] : [x])
  const text = (x: unknown): string => flat(x).map(k => (typeof k === 'string' ? k : text((k as El).kids))).join('')
  const rows = (x: unknown): { text: string; el: El; segs: El[] }[] =>
    flat(x).flatMap(k => (typeof k === 'string' ? [] : (k as El).props.flexDirection === 'row' ? [{ text: text((k as El).kids), el: k as El, segs: flat((k as El).kids) as El[] }] : rows((k as El).kids)))
  return rows(node)
}

test('T-567: a click on the band above the prompt: the header opens the board panel (and closes it when open), a task\'s row opens its page; the header shows "(click: board)" when there is room', async () => {
  const f = viewFile()
  // the hint: at the header's end when there is room, dropped first when narrow
  const wide = bandDraw(f, NOW, 160)
  expect(lineText(wide.lines[0]!).endsWith(BAND_CLICK_HINT)).toBe(true)
  expect(wide.hits[0]).toEqual({ board: true })
  expect(wide.hits.length).toBe(wide.lines.length)
  const headLen = lineText(wide.lines[0]!).length - BAND_CLICK_HINT.length
  expect(lineText(bandDraw(f, NOW, headLen + BAND_CLICK_HINT.length - 1).lines[0]!)).not.toContain('(click: board)')
  expect(lineText(bandDraw(f, NOW, 40).lines[0]!)).not.toContain('(click: board)')
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const fc = fakeCtx({})
  const board = startTui({ ...fc.ctx, renderer: { width: 164 } }, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const band = fc.slots.find(s => s.append === 'session.composer.top')!.render({ sessionID: 's' } as never)
  const rows = () => rowEls(band)
  const click = (has: (t: string) => boolean, button = 0) => (rows().find(r => has(r.text))!.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button, stopPropagation: () => undefined })
  expect(rows()[0]!.text).toContain('symcc v0.9.0')
  expect(rows()[0]!.text.endsWith(BAND_CLICK_HINT)).toBe(true)
  expect(typeof rows()[0]!.el.props.onMouseUp).toBe('function')
  // a right click does nothing
  click(t => t.includes('symcc v0.9.0'), 2)
  expect(fc.current()).toBe(undefined)
  // the header opens the board panel, and closes it when it is open (as /symcc-board does)
  click(t => t.includes('symcc v0.9.0'))
  expect(fc.current()?.name).toBe(BOARD_PANEL)
  click(t => t.includes('symcc v0.9.0'))
  expect(fc.current()).toBe(undefined)
  // a task's row opens the panel on that task's page, and keeps it open when it is
  click(t => t.startsWith('T-2'))
  expect(fc.current()?.name).toBe(BOARD_PANEL)
  expect(board.state().opened).toBe('T-2')
  expect(board.state().tab).toBe('tasks')
  click(t => t.startsWith('T-1'))
  expect(fc.current()?.name).toBe(BOARD_PANEL)
  expect(board.state().opened).toBe('T-1')
  // T-568: with T-1's page open, a click on T-2 in the band opens T-2's page, and b puts the list cursor on T-2
  const listIds = panelLines(f, { tab: 'tasks', opened: '', cursor: 0 }, NOW, 120).ids
  expect(listIds.indexOf('T-1')).not.toBe(listIds.indexOf('T-2'))
  click(t => t.startsWith('T-2'))
  expect(board.state().opened).toBe('T-2')
  await board.press('back', 's')
  expect(board.state().opened).toBe('')
  expect(board.state().cursor).toBe(listIds.indexOf('T-2'))
  click(t => t.startsWith('T-1'))
  await board.press('back', 's')
  expect(board.state().cursor).toBe(listIds.indexOf('T-1'))
  expect(fc.toasts).toEqual([])
  board.stop()
})

test('T-558: the mouse works like the keys: a click on a row opens its task, on a group opens or closes it, on a key hint runs its key; the wheel scrolls the list', async () => {
  const f0 = viewFile()
  // more backlog than the list shows, and a dropped task, so the groups and the scroll have something to do
  let b: Board = { ...emptyBoard(), tasks: f0.view.tasks, next_id: 6 } as Board
  for (let i = 0; i < 7; i++) b = addTask(b, { origin: { why: 'a test' }, title: `an idea ${i}`, files: ['src/'] }, AT)[0]
  for (let i = 6; i <= 12; i++) b = patchTask(b, `T-${i}`, { status: 'backlog' }, AT)
  b = patchTask(b, 'T-4', { status: 'dropped' }, AT)
  const f = { ...f0, view: { ...f0.view, tasks: b.tasks } }
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const sent: { sessionID: string; name: string; text: string }[] = []
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 120 },
    client: { session: { command: async input => void sent.push(input) } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => 'too big', select: async () => undefined },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  let focusedBy = 0
  const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 'ses_1', width: 100, focused: false, close: () => undefined, focus: () => void focusedBy++ } as never) as El
  const row = (has: (t: string) => boolean) => rowEls(panel).find(r => has(r.text))!
  const clickRow = async (has: (t: string) => boolean) => {
    const r = row(has)
    expect(typeof r.el.props.onMouseUp).toBe('function')
    ;(r.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0, stopPropagation: () => undefined })
    await Promise.resolve()
  }
  const clickHint = async (hint: string) => {
    const seg = rowEls(panel).at(-1)!.segs.find(s => s.kids.join('') === hint)!
    expect(typeof seg.props.onMouseUp).toBe('function')
    ;(seg.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0, stopPropagation: () => undefined })
    await new Promise<void>(res => setTimeout(res, 0))
  }
  // the list's banner and other plain lines do nothing on a click
  expect(rowEls(panel)[0]!.el.props.onMouseUp).toBe(undefined)
  // a click on a task's row opens its page and gives the panel the keyboard; a right click does nothing
  ;(row(t => t.includes('T-2 ')).el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 2 })
  expect(board.state().opened).toBe('')
  await clickRow(t => t.includes('T-2 '))
  expect(board.state().opened).toBe('T-2')
  expect(focusedBy).toBe(1)
  expect(rowEls(panel).some(r => r.text.startsWith('Status:'))).toBe(true)
  // the page's key hints are buttons: approve, reject (asks the reason), back
  await clickHint('a approve')
  await clickHint('x reject')
  expect(sent).toEqual([
    { sessionID: 'ses_1', name: 'symcc-approve', text: 'T-2' },
    { sessionID: 'ses_1', name: 'symcc-reject', text: 'T-2 too big' },
  ])
  await clickHint('b back')
  expect(board.state().opened).toBe('')
  // a click on a group's row opens it (its tasks show), and again closes it
  expect(rowEls(panel).some(r => r.text.includes('T-4 '))).toBe(false)
  await clickRow(t => t.includes('▸ Dropped'))
  expect(board.state().groups.dropped).toBe(true)
  expect(row(t => t.includes('Dropped')).text).toContain('▾ Dropped')
  expect(rowEls(panel).some(r => r.text.includes('T-4 '))).toBe(true)
  await clickRow(t => t.includes('▾ Dropped'))
  expect(board.state().groups.dropped).toBe(false)
  expect(rowEls(panel).some(r => r.text.includes('T-4 '))).toBe(false)
  // the backlog closes the same way; Enter on a group's row toggles it too
  await clickRow(t => t.includes('▾ Backlog'))
  expect(row(t => t.includes('Backlog')).text).toContain('▸ Backlog')
  expect(rowEls(panel).some(r => r.text.includes('an idea 0'))).toBe(false)
  await board.press('open', 'ses_1')
  expect(board.state().groups.backlog).toBe(true)
  // a click on Done's row opens it: the done task shows, and a click on it opens its page
  await clickRow(t => t.includes('▸ Done'))
  await clickRow(t => t.includes('T-5 '))
  expect(board.state().opened).toBe('T-5')
  await clickHint('b back')
  // the mouse wheel scrolls the list down and back up, never above its top
  const scroll = (direction: string) => (panel.props.onMouseScroll as (e: unknown) => void)({ type: 'scroll', scroll: { direction }, stopPropagation: () => undefined })
  const before = rowEls(panel).map(r => r.text)
  scroll('down')
  expect(board.state().scroll).toBe(3)
  const after = rowEls(panel).map(r => r.text)
  expect(after.length).toBe(before.length - 3)
  // the banner and the footer stay; the list's first lines scroll away
  expect(after[0]).toBe(before[0])
  expect(after.at(-1)).toBe(before.at(-1))
  scroll('up')
  scroll('up')
  expect(board.state().scroll).toBe(0)
  for (let i = 0; i < 50; i++) scroll('down')
  // it stops at the list's last line
  expect(rowEls(panel).map(r => r.text).filter(t => t.includes('▸ Dropped')).length).toBe(1)
  expect(board.state().scroll).toBe(panelLines(f, { opened: '', cursor: 0, groups: board.state().groups, scroll: 999 }, NOW, 98).scroll)
  board.stop()
})

test('T-558: panelLines gives each list row what a click on it does, and scrolls the list between the banner and the footer', () => {
  const f = viewFile()
  const d = panelLines(f, { opened: '', cursor: 0 }, NOW, 100)
  expect(d.hits.length).toBe(d.lines.length)
  const at = (s: string) => d.lines.findIndex(l => lineText(l).includes(s))
  expect(d.hits[at('T-3 ')]).toEqual({ open: 'T-3' })
  expect(d.hits[at('▸ Done')]).toEqual({ group: 'done' })
  expect(d.hits[at('NEEDS YOU')]).toBe(null)
  expect(d.ids).toContain('group:done')
  // the footer's hints are buttons; "move" isn't one
  const foot = d.lines.at(-1)!
  expect(foot.find(s => s.text === 'Enter open')?.hit).toEqual({ key: 'open' })
  expect(foot.find(s => s.text === '↑↓ move')?.hit).toBe(undefined)
  // with the panel's height known, the scroll stops when the list's last line is at the bottom
  const rows = d.lines.length - 2
  expect(panelLines(f, { opened: '', cursor: 0, scroll: 99, rows }, NOW, 100).scroll).toBe(2)
  expect(panelLines(f, { opened: '', cursor: 0, scroll: 99, rows: 200 }, NOW, 100).scroll).toBe(0)
})

/** The view file with two scouts (docs-check paused, with two runs; deps waiting) and its runs, as view.ts writes them. */
function scoutsViewFile(): ViewFile {
  const f = viewFile()
  const scouts = [
    { name: 'docs-check', every_minutes: 60, last_run: '2026-11-19T11:50:00.000Z', running: false, paused: true, prompt: 'Look for stale docs.\nSay NOTHING when all is fine.', last_report: '1. README is stale' },
    { name: 'deps', every_minutes: 30, last_run: null, running: false, next_run: '2026-11-19T12:10:00.000Z', prompt: 'Check the dependencies.' },
  ]
  const scout_runs = {
    'docs-check': [
      { run: { started: '2026-11-19T11:45:00.000Z', ended: '2026-11-19T11:50:00.000Z', outcome: 'found' as const, findings: 1, report: '.symcc/reports/scouts/docs-check-2026-11-19T11-50-00-000Z.md' }, tasks: ['T-4'] },
      { run: { started: '2026-11-19T10:45:00.000Z', ended: '2026-11-19T10:50:00.000Z', outcome: 'nothing' as const, findings: 0 }, tasks: [] },
    ],
  }
  return { ...f, view: { ...f.view, scouts, scout_runs, notify_choices: ['off', 'sound'], notify: 'sound' } }
}

test('T-559: the Scouts tab lists the scouts from view.json, a scout\'s page shows its prompt and runs, a run its report; the Settings tab shows every setting in its group with its value and default', () => {
  const f = scoutsViewFile()
  expect(parseViewFile(viewFileText(f))).toEqual(f)
  // the tabs under the banner, on every tab, each a button
  const tasks = panelLines(f, { opened: '', cursor: 0 }, NOW, 100)
  const tabs = tasks.lines.find(l => lineText(l).includes('[Tasks]'))!
  expect(lineText(tabs)).toContain('Scouts')
  expect(tabs.find(s => s.text.includes('Settings'))?.hit).toEqual({ tab: 'settings' })
  expect(lineText(tasks.lines.at(-1)!)).toContain('t s c views')
  // the list: name, how often, paused or the next run, last result; the waiting one first, the paused one after
  const list = panelLines(f, { tab: 'scouts', opened: '', cursor: 0 }, NOW, 100)
  const text = list.lines.map(lineText)
  expect(text.some(l => l.includes('[Scouts]'))).toBe(true)
  expect(list.ids).toEqual(['deps', 'docs-check'])
  const deps = text.find(l => l.includes('deps'))!
  expect(deps).toMatch(/^› /)
  expect(deps).toContain('every 30 min')
  expect(deps).toContain('next in 10m')
  expect(deps).toContain('never ran')
  const docs = text.find(l => l.includes('docs-check'))!
  expect(docs).toContain('every hour')
  expect(docs).toContain('paused')
  expect(docs).toContain('last: found 1')
  expect(list.hits[list.lines.findIndex(l => lineText(l).includes('docs-check'))]).toEqual({ scout: 'docs-check' })
  expect(panelKeys(f, '', 'scouts').map(k => k.word)).toEqual(['move', 'open', 'views', 'close'])
  // no scouts: how to add one
  expect(panelLines({ ...f, view: { ...f.view, scouts: [] } }, { tab: 'scouts', opened: '', cursor: 0 }, NOW, 100).lines.map(lineText).some(l => l.startsWith('No scouts yet'))).toBe(true)
  // a scout's page: its state, its prompt, its runs (newest first, the cursor on one) and its file
  const page = panelLines(f, { tab: 'scouts', opened: 'docs-check', cursor: 0 }, NOW, 100)
  const p = page.lines.map(lineText)
  expect(p.some(l => l.startsWith('docs-check') && l.includes('paused') && l.includes('every hour'))).toBe(true)
  expect(p).toContain('Instructions')
  expect(p).toContain('  Look for stale docs.')
  expect(p).toContain('Runs')
  expect(page.ids).toEqual(['2026-11-19T11:50:00.000Z', '2026-11-19T10:50:00.000Z'])
  expect(p.find(l => l.includes('found · 1 finding · task T-4'))).toMatch(/^› 10m ago/)
  expect(p.some(l => l.includes('nothing · 0 findings · no tasks'))).toBe(true)
  expect(p).toContain('  .symcc/scouts/docs-check.md')
  expect(panelKeys(f, 'docs-check', 'scouts').map(k => k.word)).toEqual(['run now', 'resume', 'edit', 'move', 'report', 'back'])
  // a running scout has no "run now"; a waiting one pauses
  const running = { ...f, view: { ...f.view, scouts: f.view.scouts.map(s => ({ ...s, running: s.name === 'deps' })) } }
  expect(panelKeys(running, 'deps', 'scouts').map(k => k.word)).toEqual(['pause', 'edit', 'back'])
  // a run's page: its line and its report (read by the TUI from its file)
  const run = (report?: string | null) => panelLines(f, { tab: 'scouts', opened: 'docs-check', run: '2026-11-19T11:50:00.000Z', report, cursor: 0 }, NOW, 100).lines.map(lineText)
  expect(run('1. README is stale\n2. no guide')).toContain('  2. no guide')
  expect(run('x').some(l => l.includes('run that ended 2026-11-19T11:50:00.000Z'))).toBe(true)
  expect(run(undefined)).toContain('  (reading the report…)')
  expect(run(null).some(l => l.includes("can't be read"))).toBe(true)
  expect(panelKeys(f, 'docs-check', 'scouts', '2026-11-19T11:50:00.000Z').map(k => k.word)).toEqual(['back'])
  // Settings: every group's title, every setting with its value and default
  const settings = panelLines(f, { tab: 'settings', opened: '', cursor: 0 }, NOW, 140)
  const s = settings.lines.map(lineText)
  for (const g of ['Work', 'Checks before merging', 'Workers', 'Scouts', 'Board and alerts']) expect(s).toContain(g)
  expect(s.find(l => l.includes('max_parallel'))).toMatch(/max_parallel +2 · default 3 · 1-8/)
  expect(s.find(l => l.includes('test_commands'))).toContain('bun test')
  expect(s.find(l => /^› /.test(l))).toContain('mode')
  expect(settings.ids[0]).toBe('mode')
  expect(settings.ids).toContain('notify')
  expect(settings.hits[s.findIndex(l => l.includes('max_minutes'))]).toEqual({ setting: 'max_minutes' })
  expect(panelKeys(f, '', 'settings').map(k => k.word)).toEqual(['move', 'change', 'views', 'close'])
  // the actions as slash commands
  expect(actionCommand({ kind: 'scout', scout: 'deps' })).toEqual({ name: 'symcc-scout', text: 'deps' })
  expect(actionCommand({ kind: 'scout', scout: 'deps', paused: true })).toEqual({ name: 'symcc-scout', text: 'deps pause' })
  expect(actionCommand({ kind: 'setting', setting: 'max_parallel', value: ' 5 ' })).toEqual({ name: 'symcc-settings', text: 'max_parallel 5' })
})

test('T-559: startTui: t, s and c switch tabs (a click on a tab too); on a scout r runs it now and p resumes it, a run opens its report; Enter on a setting changes it with /symcc-settings', async () => {
  const f = scoutsViewFile()
  const files = new Map([
    ['/work/proj/.symcc/view.json', viewFileText(f)],
    ['/work/proj/.symcc/reports/scouts/docs-check-2026-11-19T11-50-00-000Z.md', '1. README is stale (from the file)'],
  ])
  const sent: { sessionID: string; name: string; text: string }[] = []
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const answers = { prompt: '7' as string | undefined, select: 'review' as string | undefined }
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 140 },
    client: { session: { command: async input => void sent.push(input) } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: () => undefined },
      dialog: { prompt: async () => answers.prompt, select: async <V,>() => answers.select as V | undefined },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 'ses_1', width: 142, focused: true, close: () => undefined } as never) as El
  const lines = () => rowEls(panel).map(r => r.text)
  expect(board.state().tab).toBe('tasks')
  await board.press('s', 'ses_1')
  expect(board.state().tab).toBe('scouts')
  expect(lines().some(l => l.includes('docs-check') && l.includes('paused'))).toBe(true)
  // down to docs-check, open it: its page
  await board.press('down', 'ses_1')
  await board.press('open', 'ses_1')
  expect(board.state().opened).toBe('docs-check')
  expect(lines()).toContain('  Look for stale docs.')
  await board.press('r', 'ses_1')
  await board.press('p', 'ses_1')
  // Enter on its newest run: the run's page with the report read from its file; b goes back to the scout's page
  await board.press('open', 'ses_1')
  expect(board.state().run).toBe('2026-11-19T11:50:00.000Z')
  await new Promise<void>(res => setTimeout(res, 0))
  expect(lines()).toContain('  1. README is stale (from the file)')
  await board.press('back', 'ses_1')
  expect(board.state().run).toBe('')
  expect(board.state().opened).toBe('docs-check')
  // a click on a run row opens it too
  const runRow = rowEls(panel).find(r => r.text.includes('nothing · 0 findings'))!
  ;(runRow.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0 })
  expect(board.state().run).toBe('2026-11-19T10:50:00.000Z')
  expect(lines()).toContain('  (this run reported nothing)')
  // c: the Settings tab; Enter on mode picks from a list, on max_parallel asks for a number, on checker flips it
  await board.press('c', 'ses_1')
  expect([board.state().tab, board.state().opened, board.state().run, board.state().cursor]).toEqual(['settings', '', '', 0])
  expect(lines().some(l => l.includes('max_parallel') && l.includes('default 3'))).toBe(true)
  await board.press('open', 'ses_1')
  await board.press('down', 'ses_1')
  await board.press('open', 'ses_1')
  const checker = rowEls(panel).find(r => r.text.includes('checker ') && r.text.includes('default off'))!
  ;(checker.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0 })
  await new Promise<void>(res => setTimeout(res, 0))
  // a bad value is not sent
  answers.prompt = 'lots'
  const maxMinutes = rowEls(panel).find(r => r.text.includes('max_minutes'))!
  ;(maxMinutes.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0 })
  await new Promise<void>(res => setTimeout(res, 0))
  expect(board.state().cursor).toBe(2)
  expect(sent).toEqual([
    { sessionID: 'ses_1', name: 'symcc-scout', text: 'docs-check' },
    { sessionID: 'ses_1', name: 'symcc-scout', text: 'docs-check resume' },
    { sessionID: 'ses_1', name: 'symcc-settings', text: 'mode review' },
    { sessionID: 'ses_1', name: 'symcc-settings', text: 'max_parallel 7' },
    { sessionID: 'ses_1', name: 'symcc-settings', text: 'checker on' },
  ])
  // a click on the Tasks tab goes back to the task list; t does too
  const tabSeg = rowEls(panel).find(r => r.text.includes('[Settings]'))!.segs.find(s => s.kids.join('').includes('Tasks'))!
  ;(tabSeg.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0 })
  expect(board.state().tab).toBe('tasks')
  expect(lines().some(l => l.includes('NEEDS YOU'))).toBe(true)
  await board.press('s', 'ses_1')
  await board.press('t', 'ses_1')
  expect(board.state().tab).toBe('tasks')
  board.stop()
})

test('T-559: the view file carries each scout\'s recent runs, newest first, with the tasks made from them (scoutRunsOf)', async () => {
  const { scoutRunsOf } = await import('../view')
  const runs = { runs: [
    { started: '2026-11-19T10:45:00.000Z', ended: '2026-11-19T10:50:00.000Z', outcome: 'nothing', findings: 0 },
    { started: '2026-11-19T11:45:00.000Z', ended: '2026-11-19T11:50:00.000Z', outcome: 'found', findings: 1, tasks: ['T-4'] },
  ] }
  const read = async (p: string) => (p === '/work/proj/.symcc/scouts/docs-check.runs.json' ? JSON.stringify(runs) : Promise.reject(new Error('missing')))
  const v = scoutsViewFile().view
  const got = await scoutRunsOf({ fs: { read } } as never, '/work/proj', v)
  expect(Object.keys(got)).toEqual(['docs-check'])
  expect(got['docs-check']!.map(x => x.run.ended)).toEqual(['2026-11-19T11:50:00.000Z', '2026-11-19T10:50:00.000Z'])
  expect(got['docs-check']![0]!.tasks).toEqual(['T-4'])
})

/** The view file with roles and kinds as view.ts writes them (viewDefs): general and checker built-in, tester the
 *  owner's copy and off, oops a role file that can't be read; the kinds change (always on) and bug (the owner's copy). */
function defsViewFile(): ViewFile {
  const f = scoutsViewFile()
  const general = { name: 'general', description: 'Any task', skills: [], prompt: 'Do the task.' }
  const checker = { name: 'checker', description: 'Checks a worker\'s work', skills: [], prompt: 'Check it.', off: true }
  const tester = { name: 'tester', description: 'Writes tests', skills: [], prompt: 'Test it.' }
  const myTester = { name: 'tester', description: 'My tester', skills: ['tdd'], model: 'opus', prompt: 'Test it well.\nRun them twice.', off: true }
  const broken = [{ name: 'oops', file: '.symcc/roles/oops.md', reason: 'no description' }]
  const roles = viewDefs('role', mergeRoles([general, checker, tester], [myTester]), [general, checker, tester], [myTester], broken, '.symcc/roles')
  const change = { name: 'change', description: 'A change to make', body: 'Make it.' }
  const bug = { name: 'bug', description: 'Something broken', body: 'Fix it.' }
  const myBug = { ...bug, description: 'A bug to fix', body: 'Fix it, with a test.' }
  const kinds = viewDefs('kind', mergeKinds([change, bug], [myBug]), [change, bug], [myBug], [], '.symcc/kinds')
  return { ...f, view: { ...f.view, roles, kinds, checker: true } }
}

test('T-562: viewDefs gives each role and kind where it comes from, whether it can be turned off and reset, and its file', () => {
  const f = defsViewFile()
  const roles = f.view.roles!
  expect(roles.map(r => [r.name, r.source, r.off, r.canOff, r.canReset])).toEqual([
    ['general', 'built-in', false, false, false],
    ['checker', 'built-in', false, false, false],
    ['tester', 'replaced', true, true, true],
    ['oops', '', false, false, false],
  ])
  expect(roles[0]!.file).toBe('roles/general.md (in the plugin)')
  expect([roles[2]!.file, roles[2]!.model, roles[2]!.skills, roles[2]!.text]).toEqual(['.symcc/roles/tester.md', 'opus', ['tdd'], 'Test it well.\nRun them twice.'])
  expect(roles[3]!.broken).toBe("your file can't be read: no description")
  expect(f.view.kinds!.map(k => [k.name, k.source, k.canOff, k.canReset, k.text])).toEqual([
    ['change', 'built-in', false, false, 'Make it.'],
    ['bug', 'replaced', true, true, 'Fix it, with a test.'],
  ])
  // they ride in the view file
  expect(parseViewFile(viewFileText(f))!.view.roles).toEqual(roles)
  expect(parseViewFile(viewFileText({ ...f, view: { ...f.view, roles: 'x' as never } }))!.view.roles).toBe(undefined)
})

test('T-562: the Settings tab opens the Roles and Kinds pages from view.json; a role\'s and a kind\'s page show it, and turn it off or on or reset it with /symcc-settings role|kind', () => {
  const f = defsViewFile()
  // the Settings list: the Roles and Kinds rows with their counts, each a row the cursor goes over
  const settings = panelLines(f, { tab: 'settings', opened: '', cursor: 0 }, NOW, 140)
  const s = settings.lines.map(lineText)
  expect(s.find(l => l.includes('Roles'))).toMatch(/Roles +4 roles · 1 off/)
  expect(s.find(l => /^ +Kinds/.test(l))).toMatch(/Kinds +2 kinds/)
  expect(settings.ids).toContain('roles')
  expect(settings.ids).toContain('kinds')
  expect(settings.hits[s.findIndex(l => l.includes('4 roles'))]).toEqual({ page: 'roles' })
  // the Roles page: a row per role, the broken one with why
  const list = panelLines(f, { tab: 'settings', opened: 'roles', cursor: 2 }, NOW, 140)
  const l = list.lines.map(lineText)
  expect(l).toContain('Roles')
  expect(list.ids).toEqual(['role:general', 'role:checker', 'role:tester', 'role:oops'])
  expect(list.selected).toBe('role:tester')
  expect(l.find(x => x.includes('tester'))).toMatch(/^› tester  replaced, off · My tester/)
  expect(l.find(x => x.includes('general'))).toContain('built-in · Any task')
  expect(l.find(x => x.includes('oops'))).toContain("— your file can't be read: no description")
  expect(list.hits[l.findIndex(x => x.includes('tester'))]).toEqual({ page: 'role:tester' })
  expect(panelKeys(f, 'roles', 'settings').map(k => k.word)).toEqual(['move', 'open', 'back'])
  // a role's page: its model, skills, checklist and file; o turns it on (it is off), r resets it
  const page = panelLines(f, { tab: 'settings', opened: 'role:tester', cursor: 0 }, NOW, 140)
  const p = page.lines.map(lineText)
  expect(p).toContain('tester · replaced, off')
  expect(p).toContain('My tester')
  expect(p).toContain('  opus')
  expect(p).toContain('  tdd')
  expect(p).toContain('  Run them twice.')
  expect(p).toContain('  .symcc/roles/tester.md')
  expect(panelKeys(f, 'role:tester', 'settings').map(k => k.word)).toEqual(['turn on', 'reset', 'back'])
  expect(page.lines.at(-1)!.find(x => x.text === 'o turn on')?.hit).toEqual({ key: 'o' })
  // general can't be turned off; the checker role says the checker setting runs it; a broken one can only be fixed
  expect(panelKeys(f, 'role:general', 'settings').map(k => k.word)).toEqual(['back'])
  expect(panelLines(f, { tab: 'settings', opened: 'role:checker', cursor: 0 }, NOW, 200).lines.map(lineText).some(x => x.includes('the checker setting runs it (Settings → checker, now on)'))).toBe(true)
  expect(panelLines(f, { tab: 'settings', opened: 'role:oops', cursor: 0 }, NOW, 140).lines.map(lineText)).toContain('Fix the file by hand: .symcc/roles/oops.md.')
  // the Kinds page and a kind's page
  const kinds = panelLines(f, { tab: 'settings', opened: 'kinds', cursor: 0 }, NOW, 140)
  expect(kinds.ids).toEqual(['kind:change', 'kind:bug'])
  const bug = panelLines(f, { tab: 'settings', opened: 'kind:bug', cursor: 0 }, NOW, 140).lines.map(lineText)
  expect(bug).toContain('bug · replaced')
  expect(bug).toContain('Body')
  expect(bug).toContain('  Fix it, with a test.')
  expect(panelKeys(f, 'kind:bug', 'settings').map(k => k.word)).toEqual(['turn off', 'reset', 'back'])
  expect(panelKeys(f, 'kind:change', 'settings').map(k => k.word)).toEqual(['back'])
  // a role that left the view has no page
  expect(panelKeys(f, 'role:gone', 'settings').map(k => k.word)).toEqual(['move', 'change', 'views', 'close'])
  // the actions as slash commands
  expect(actionCommand({ kind: 'def', def: 'role', name: 'tester', action: 'on' })).toEqual({ name: 'symcc-settings', text: 'role tester on' })
  expect(actionCommand({ kind: 'def', def: 'kind', name: 'bug', action: 'reset' })).toEqual({ name: 'symcc-settings', text: 'kind bug reset' })
  expect(actionCommand({ kind: 'scout-edit', scout: 'deps', field: 'every', value: ' 15 ' })).toEqual({ name: 'symcc-scout', text: 'deps every 15' })
  expect(actionCommand({ kind: 'scout-edit', scout: 'deps', field: 'model', value: '' })).toEqual({ name: 'symcc-scout', text: 'deps model none' })
})

test('T-562: startTui: Settings opens Roles, a role\'s page turns it on and resets it; Kinds and a kind\'s page turn it off; e on a scout\'s page edits it with /symcc-scout', async () => {
  const f = defsViewFile()
  const files = new Map([['/work/proj/.symcc/view.json', viewFileText(f)]])
  const sent: { sessionID: string; name: string; text: string }[] = []
  const slots: { append: string; render: (input: never) => unknown }[] = []
  const answers = { prompt: [] as (string | undefined)[], select: [] as unknown[] }
  const toasts: string[] = []
  const ctx: TuiContext = {
    location: { directory: '/work/proj' },
    theme: {},
    renderer: { width: 140 },
    client: { session: { command: async input => void sent.push(input) } },
    keymap: { layer: () => undefined },
    ui: {
      toast: { show: o => void toasts.push(o.message) },
      dialog: { prompt: async () => answers.prompt.shift(), select: async <V,>() => answers.select.shift() as V | undefined },
      panel: { open: () => true, close: () => undefined, current: () => undefined },
      slot: claim => (slots.push(claim as never), () => undefined),
    },
  }
  const board = startTui(ctx, { runtime: fakeRuntime(), readText: async p => files.get(p) ?? Promise.reject(new Error('missing')), every: () => () => undefined, now: () => NOW })
  await board.refresh()
  const panel = slots.find(s => s.append === 'session.panel')!.render({ name: BOARD_PANEL, sessionID: 'ses_1', width: 142, focused: true, close: () => undefined } as never) as El
  const lines = () => rowEls(panel).map(r => r.text)
  const clickRow = (has: string) => (rowEls(panel).find(r => r.text.includes(has))!.el.props.onMouseUp as (e: unknown) => void)({ type: 'up', button: 0 })
  await board.press('c', 'ses_1')
  // a click on the Roles row opens the Roles page; down twice and Enter opens tester
  clickRow('4 roles')
  expect(board.state().opened).toBe('roles')
  expect(lines().some(l => l.includes('tester') && l.includes('replaced, off'))).toBe(true)
  await board.press('down', 'ses_1')
  await board.press('down', 'ses_1')
  await board.press('open', 'ses_1')
  expect(board.state().opened).toBe('role:tester')
  expect(lines()).toContain('  Run them twice.')
  await board.press('o', 'ses_1')
  await board.press('r', 'ses_1')
  // b: back to the Roles page, then to the Settings list
  await board.press('back', 'ses_1')
  expect(board.state().opened).toBe('roles')
  await board.press('back', 'ses_1')
  expect([board.state().tab, board.state().opened]).toEqual(['settings', ''])
  // general can't be turned off: o does nothing on its page
  clickRow('4 roles')
  clickRow('Any task')
  expect(board.state().opened).toBe('role:general')
  await board.press('o', 'ses_1')
  // Enter on the Kinds row (the cursor goes there), then bug, o turns it off
  await board.press('back', 'ses_1')
  await board.press('back', 'ses_1')
  // the cursor is still on the Roles row: one down is Kinds
  await board.press('down', 'ses_1')
  await board.press('open', 'ses_1')
  expect(board.state().opened).toBe('kinds')
  clickRow('A bug to fix')
  expect(board.state().opened).toBe('kind:bug')
  await board.press('o', 'ses_1')
  // a scout's page: e asks what to change, then the new value; a bad number is not sent
  await board.press('s', 'ses_1')
  await board.press('open', 'ses_1')
  expect(board.state().opened).toBe('deps')
  answers.select.push('every', 'model', 'prompt', 'every')
  answers.prompt.push('15', 'none', 'Check the lock file too.', 'often')
  for (let i = 0; i < 4; i++) await board.press('e', 'ses_1')
  expect(toasts.some(t => t.includes('whole number'))).toBe(true)
  expect(sent).toEqual([
    { sessionID: 'ses_1', name: 'symcc-settings', text: 'role tester on' },
    { sessionID: 'ses_1', name: 'symcc-settings', text: 'role tester reset' },
    { sessionID: 'ses_1', name: 'symcc-settings', text: 'kind bug off' },
    { sessionID: 'ses_1', name: 'symcc-scout', text: 'deps every 15' },
    { sessionID: 'ses_1', name: 'symcc-scout', text: 'deps model none' },
    { sessionID: 'ses_1', name: 'symcc-scout', text: 'deps prompt Check the lock file too.' },
  ])
  board.stop()
})

test('T-574: OpenCode\'s task page shows local times with the shared when, and the role and kind info from view.json', () => {
  const f = defsViewFile()
  const tasks = f.view.tasks.map(t => (t.id === 'T-4' ? { ...t, role: 'tester', kind: 'bug' } : t))
  const page = panelLines({ ...f, view: { ...f.view, tasks } }, { opened: 'T-4', cursor: 0 }, NOW, 200).lines.map(lineText).join('\n')
  // the same local text Claude Code's page shows, not the UTC slice of the ISO time
  expect(page).toContain(`added ${when(AT)}`)
  expect(page).not.toContain('2026-11-19 11:00')
  // the owner's tester role (its description and model) and bug kind (its description)
  expect(page).toContain('tester — My tester · model opus')
  expect(page).toContain('bug — A bug to fix')
})
