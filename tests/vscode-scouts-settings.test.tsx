// The Scouts and Settings pages in VS Code's side panel have their own layout (hooks/plugin/ui/vscode-scouts.tsx and
// vscode-settings.tsx); on the terminal, the desktop and mobile they draw exactly as before (scouts-settings-snapshot.ts
// holds the trees captured from the code before the change).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { PANE, BOARD_VIEW, T0, seedBoard, drawnData, changedTree } from './board-fixture'
import { SCOUTS_SETTINGS_BEFORE } from './scouts-settings-snapshot'
import { SCENES, OLD_SURFACES } from './scouts-settings-scenes'
import { LONG_REPORT, SCOUTS, SCOUTS_VIEW, seedScouts } from './scouts-settings-fixture'
import { ran, readText } from './fakes'
import type { On } from 'claude-code'
import { SETTINGS, SETTING_GROUPS } from '../hooks/board'
import { CLICK_HINT } from '../hooks/plugin/ui/surface'
import { reportStart } from '../hooks/plugin/ui/vscode-scouts'

type Node = { type?: string; key?: string; props?: Record<string, unknown>; children?: unknown[] }

/** Every element of a drawn tree, depth first. */
function elements(tree: unknown): Node[] {
  const out: Node[] = []
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    out.push(n as Node)
    for (const c of (n as Node).children ?? []) walk(c)
  }
  walk(tree)
  return out
}
/** All the text of a tree: string children, labels, placeholders, Markdown texts and Select option labels. */
function texts(tree: unknown): string[] {
  const out: string[] = []
  for (const e of elements(tree)) {
    for (const c of e.children ?? []) if (typeof c === 'string') out.push(c)
    for (const p of ['label', 'placeholder', 'text'] as const) if (typeof e.props?.[p] === 'string') out.push(e.props[p] as string)
    if (Array.isArray(e.props?.options)) for (const o of e.props.options as { value: string; label?: string }[]) out.push(o.label ?? o.value)
  }
  return out
}
const KEY_HINTS = [/\[[a-z]\]:/, /Enter open/, /Enter on a heading/, /Enter changes/, /Enter saves/, /Enter picks/, /Enter goes on/, /open\/close/, /→ \/ ←/, /↑↓/, /t s c views/, /Esc back/, /\s\([a-z]\)(\s|$)/]
const STATUS_COLORS = new Set(['warning', 'error', 'ide', 'permission', 'success', 'suggestion'])
const CHOICES = ['mode', 'notify', 'checker', 'scout_findings', 'tests_with_changes', 'open_on_start', 'enabled']
const BOXES = ['max_parallel', 'max_minutes', 'auto_retries', 'archive_days', 'test_commands']

// one test per surface: what a page keeps in memory (the open groups, a box being typed in) starts fresh in each
for (const sc of SCENES) {
  for (const surface of OLD_SURFACES) {
    test(`${sc.name} on ${surface} draws exactly as before the VS Code pages`, async ($, on) => {
      sc.seed(on)
      const ui = await $.ui.mount({ ...PANE, surface })
      await sc.go(ui as never)
      expect(drawnData(await ui.drawn()), `${surface} ${sc.name}`).toEqual(SCOUTS_SETTINGS_BEFORE[`${surface} ${sc.name}`])
      await ui.unmount()
    })
  }
}

// The scouts' times are set from T0 and the pages are drawn at the host's clock (the kit's mock clock), so the saved
// trees are compared exactly: a real change (one indent, one time) fails, and moving the clock moves only the times.
test('the scouts list snapshot comparison fails on a changed indent or next-run time, and passes as drawn', async ($, on) => {
  seedScouts(on, 'scouts')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const drawn = drawnData(await ui.drawn())
  const saved = SCOUTS_SETTINGS_BEFORE['terminal scouts list']
  expect(drawn).toEqual(saved)
  expect(drawn).not.toEqual(changedTree(saved, [['"  + New scout"', '"      + New scout"']]))
  expect(drawn).not.toEqual(changedTree(saved, [['next in 3h 00m', 'next in 2h 59m']]))
  await ui.unmount()
})

test("the scouts follow the host clock: 10 minutes later only the list's next run and the scout page's times change", async ($, on) => {
  const clock = seedBoard(on, { view: SCOUTS_VIEW, tab: 'scouts' })
  on('ui.toast', () => ({ value: undefined }))
  await clock.set(T0 + 10 * 60_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(drawnData(await ui.drawn())).toEqual(changedTree(SCOUTS_SETTINGS_BEFORE['terminal scouts list'], [['next in 3h 00m', 'next in 2h 50m']]))
  await ui.press({ key: 'scout:dependency-updates' })
  expect(drawnData(await ui.drawn())).toEqual(changedTree(SCOUTS_SETTINGS_BEFORE['terminal scout dependency-updates'], [['ran 40m ago', 'ran 50m ago']]))
  await ui.unmount()
})

/** Checks a VS Code page: nothing cut with "…", no key hints, no key marks on buttons, the click hint at the bottom. */
function readable(tree: unknown, page: string) {
  const all = texts(tree)
  expect(all.filter(s => s.includes('…')), page).toEqual([])
  for (const re of KEY_HINTS) expect(all.filter(s => re.test(s)), `${page} ${re}`).toEqual([])
  expect(elements(tree).filter(n => n.type === 'Text' && n.props?.wrap === 'truncate' && !/^[─━]+$/.test(texts(n).join(''))), page).toEqual([])
}

test('the Scouts list in VS Code at width 50: whole names, summaries and report starts, the color on the mark only', async ($, on) => {
  seedScouts(on, 'scouts')
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const tree = await ui.drawn()
  readable(tree, 'scouts list')
  expect(await ui.find({ type: 'Text', text: CLICK_HINT })).toBeDefined()
  for (const s of SCOUTS) {
    const box = await ui.find({ key: `vs-scout-${s.name}` })
    expect(box, s.name).toBeDefined()
    const open = await ui.find({ key: `scout:${s.name}` })
    expect(open?.type, s.name).toBe('Button')
    expect(texts(open).join(''), s.name).toContain(s.name)
    // the status color is on the mark only, never on the name or the summary
    const colored = elements(box!.children).filter(n => n.type === 'Text' && STATUS_COLORS.has(String(n.props?.color)))
    for (const n of colored) expect(texts(n).join(''), s.name).not.toContain(s.name)
    if (s.summary) {
      const sum = await ui.find({ type: 'Text', text: s.summary })
      expect(sum?.props.wrap, s.name).toBe('wrap')
    }
  }
  const row = (name: string) => ui.find({ key: `vs-scout-${name}` }).then(n => texts(n).join(' '))
  expect(await row('dependency-updates')).toMatch(/◉ running now/)
  expect(await row('dependency-updates')).toMatch(/every 30 min · haiku · ran 40m ago/)
  expect(await row('security-advisories-for-node-packages')).toMatch(/next in 3h 00m/)
  expect(await row('security-advisories-for-node-packages')).toMatch(/found 5: The package left-pad has a security advisory/)
  expect(await row('docs-drift')).toMatch(/○ paused/)
  expect(await row('docs-drift')).toMatch(/last report: nothing/)
  expect(await row('on-demand-check')).toMatch(/on demand · never ran/)
  expect(await row('broken')).toMatch(/every_minutes "-5" is not valid/)
  // a new scout: a button, then a box for its name with a Cancel button
  await ui.press({ key: 'scout-new' })
  readable(await ui.drawn(), 'new scout')
  expect((await ui.find({ key: 'scout-new-name' }))?.type).toBe('Input')
  expect((await ui.find({ key: 'scout-new-cancel' }))?.props.label).toBe('Cancel')
  // a press on a row opens the scout's page
  await ui.press({ key: 'scout-new-cancel' })
  await ui.press({ key: 'scout:docs-drift' })
  expect(await ui.find({ key: 'vs-scout-facts' }), 'the scout page').toBeDefined()
  await ui.unmount()
})

test('the Scouts list in VS Code with no scouts: the how-to text without terminal key marks', async ($, on) => {
  seedBoard(on, { view: { shape: BOARD_VIEW.shape, value: { ...BOARD_VIEW.value, scouts: [] } }, tab: 'scouts' })
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const tree = await ui.drawn()
  readable(tree, 'no scouts')
  const all = texts(tree).join('\n')
  expect(all).toContain('No scouts yet.')
  expect(all).toContain('Or press "New scout" to write one right here.')
  expect(all).not.toContain('(n)')
  expect((await ui.find({ key: 'scout-new' }))?.type).toBe('Button')
  await ui.unmount()
})

for (const s of SCOUTS) {
  test(`${s.name}'s scout page in VS Code at width 50: whole text, its facts, buttons for its actions, the report as Markdown`, async ($, on) => {
    seedScouts(on, 'scouts', s.name)
    const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
    const tree = await ui.drawn()
    readable(tree, s.name)
    expect(await ui.find({ type: 'Text', text: CLICK_HINT })).toBeDefined()
    expect((await ui.find({ key: 'scout-back' }))?.props.label).toBe('← Scouts')
    const facts = texts(await ui.find({ key: 'vs-scout-facts' })).join(' ')
    expect(facts, s.name).toContain(s.every_minutes === 30 ? 'every 30 min' : s.every_minutes === 1440 ? 'every day' : s.every_minutes === 60 ? 'every hour' : 'on demand')
    expect(facts, s.name).toMatch(s.last_run ? /last run: ran \d[\dhm ]* ago/ : /last run: never ran/)
    if (s.next_run) expect(facts, s.name).toMatch(/next run: in 3h 00m/)
    // the actions are buttons: run now (not while it runs), pause or resume, edit
    const row = await ui.find({ key: 'vs-scout-actions' })
    const keys = elements(row!.children).filter(n => n.type === 'Button').map(n => n.props?.key)
    expect(keys, s.name).toEqual([...(s.running ? [] : ['scout-run']), 'scout-pause', 'scout-edit'])
    expect((await ui.find({ key: 'scout-pause' }))?.props.label).toBe(s.paused ? 'Resume' : 'Pause')
    // the instructions and the report are Markdown, given whole
    const md = elements(tree).filter(n => n.type === 'Markdown').map(n => String(n.props?.text))
    expect(md, s.name).toContain(s.prompt)
    if (s.last_report === LONG_REPORT) expect(md, s.name).toContain(LONG_REPORT)
    await ui.unmount()
  })
}

test('Settings in VS Code at width 50: groups as headings, a Select for each choice, a box for numbers and tests, no key hints', async ($, on) => {
  seedScouts(on, 'settings')
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const tree = await ui.drawn()
  readable(tree, 'settings')
  const all = texts(tree)
  for (const g of SETTING_GROUPS) expect(all, g.title).toContain(g.title)
  // no fold rows: every setting is drawn, on its own row
  expect(elements(tree).filter(n => String(n.props?.key ?? '').startsWith('group:'))).toEqual([])
  for (const x of SETTINGS) expect(await ui.find({ key: `vs-setting-${x.name}` }), x.name).toBeDefined()
  for (const name of CHOICES) {
    const el = await ui.find({ key: `setting:${name}` })
    expect(el?.type, name).toBe('Select')
    expect(el?.props.label, name).toBe(name)
  }
  expect((await ui.find({ key: 'setting:mode' }))?.props.value).toBe('auto')
  expect((await ui.find({ key: 'setting:notify' }))?.props.options).toEqual([{ value: 'off' }, { value: 'sound' }, { value: 'voice' }])
  expect((await ui.find({ key: 'setting:notify' }))?.props.value).toBe('sound')
  expect((await ui.find({ key: 'setting:scout_findings' }))?.props.value).toBe('backlog')
  for (const name of BOXES) expect((await ui.find({ key: `setting:${name}` }))?.type, name).toBe('Input')
  expect((await ui.find({ key: 'setting:max_parallel' }))?.props.value).toBe('2')
  expect((await ui.find({ key: 'settings-roles' }))?.type).toBe('Button')
  expect((await ui.find({ key: 'settings-kinds' }))?.type).toBe('Button')
  await ui.unmount()
})

/** A fake board.json with the fixture's settings: a save (a temp file, then mv over it) is kept, so the next read sees it. */
function boardFile(on: On) {
  const { tasks, mode, test_commands, scout_findings, max_parallel, notify } = SCOUTS_VIEW.value
  const files: Record<string, string | null> = { '/board.json': JSON.stringify({ tasks, mode, test_commands, scout_findings, max_parallel, notify }), '/board.lock': null }
  const fileOf = (p: string) => Object.keys(files).find(f => p.endsWith(`.symcc${f}`))
  on('fs.exists', (_, e, next) => (fileOf(e.path) ? { value: files[fileOf(e.path)!] !== null } : next(e)))
  on('fs.read', (_, e, next) => (fileOf(e.path) ? readText(files[fileOf(e.path)!]) : next(e)))
  const temp: Record<string, string> = {}
  on('fs.write', (_, e) => {
    const f = fileOf(e.path)
    if (f) files[f] = String(e.text)
    else temp[e.path] = String(e.text)
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    const argv = (e as { argv?: string[] }).argv ?? []
    const [src, dest] = argv.slice(-2)
    if (argv[0] === 'mv' && src! in temp && fileOf(dest!)) files[fileOf(dest!)!] = temp[src!]!
    return { value: ran() }
  })
  return () => JSON.parse(files['/board.json']!) as Record<string, unknown>
}

test('in VS Code a pick in a Select saves the setting, and a number box saves on Save (or says what is wrong)', async ($, on) => {
  const toasts: string[] = []
  seedScouts(on, 'settings', '', e => void toasts.push(JSON.stringify(e)))
  const board = boardFile(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.select({ key: 'setting:scout_findings', value: 'auto' })
  expect(board().scout_findings, toasts.join('\n')).toBe('auto')
  await ui.select({ key: 'setting:tests_with_changes', value: 'review' })
  expect(board().tests_with_changes).toBe('review')
  await ui.select({ key: 'setting:checker', value: 'on' })
  expect(board().checker).toBe(true)
  await ui.select({ key: 'setting:mode', value: 'review' })
  expect(board().mode).toBe('review')
  // a number box: a wrong value says why and saves nothing; a good one saves
  await ui.input({ key: 'setting:max_parallel', text: 'lots' })
  expect((await ui.find({ key: 'vs-setting-max_parallel' }))?.text).toMatch(/max_parallel must be a whole number, 1-8/)
  expect(board().max_parallel).toBe(2)
  await ui.input({ key: 'setting:max_parallel', text: '5' })
  expect((await ui.find({ key: 'vs-setting-max_parallel' }))?.text).not.toMatch(/must be/)
  expect(board().max_parallel).toBe(5)
  await ui.input({ key: 'setting:test_commands', text: 'npm test' })
  expect(board().test_commands).toEqual(['npm test'])
  await ui.unmount()
})

test('a report start loses only Markdown markers, not the _ and ` inside names', async () => {
  expect(reportStart('1. The setting `max_parallel` in board_file.json is ignored')).toBe('The setting max_parallel in board_file.json is ignored')
  expect(reportStart('## Findings\n**2. A __big__ and *small* thing**')).toBe('A big and small thing')
})
