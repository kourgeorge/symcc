// The Scouts and Settings pages in VS Code's side panel have their own layout (hooks/claude/ui/vscode-scouts.tsx and
// vscode-settings.tsx); on the terminal, the desktop and mobile they draw exactly as before (scouts-settings-snapshot.ts
// holds the trees captured from the code before the change).
import { expect, type Engine } from 'claude-code/testing'
import { test } from './reset'
import { PANE, BOARD_VIEW, T0, seedBoard, drawnData, changedTree } from './board-fixture'
import { SCOUTS_SETTINGS_BEFORE } from './scouts-settings-snapshot'
import { SCENES, OLD_SURFACES, ROLE_KIND_SCENES, ROLE_KIND_PAGES } from './scouts-settings-scenes'
import { ROLES_KINDS_BEFORE } from './roles-kinds-snapshot'
import { SCOUTS, SCOUTS_VIEW, seedScouts, seedRolesKinds } from './scouts-settings-fixture'
import { ran, readText } from './fakes'
import type { On } from 'claude-code'
import { SETTINGS, SETTING_GROUPS } from '../hooks/board'
import { CLICK_HINT } from '../hooks/claude/ui/surface'
import { reportStart, scoutRowEnd } from '../hooks/claude/ui/vscode-scouts'
import { vsRowRoom } from '../hooks/claude/ui/vscode-list'
import { scoutListRows } from '../hooks/board'
import { mdLink, vsHref } from '../hooks/claude/ui/vscode'

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
const KEY_HINTS = [/\[[a-z]\]:/, /Enter open/, /Enter on a heading/, /Enter changes/, /Enter saves/, /Enter picks/, /Enter goes on/, /open\/close/, /→ \/ ←/, /↑↓/, /l t s c views/, /Esc back/, /\s\([a-z]\)(\s|$)/]
const STATUS_COLORS = new Set(['warning', 'error', 'ide', 'permission', 'success', 'suggestion'])
const CHOICES = ['mode', 'notify', 'checker', 'scout_findings', 'tests_with_changes', 'open_on_start', 'enabled']
const BOXES = ['max_parallel', 'max_minutes', 'auto_retries', 'archive_days', 'test_commands']

/** The drawn tree without the scout page's Results section (T-622 added it after these trees were saved, T-686 moved
 *  it to its own section before File; scout-runs.test.tsx checks it). */
function withoutResults(tree: unknown): unknown {
  const isResults = (n: unknown) => !!n && typeof n === 'object' && (n as Node).props?.key === 'scout-results'
  const walk = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.filter(c => !isResults(c)).map(walk)
    if (!n || typeof n !== 'object') return n
    const node = n as Node
    return node.children ? { ...node, children: walk(node.children) } : node
  }
  return walk(tree)
}

// one test per surface: what a page keeps in memory (the open groups, a box being typed in) starts fresh in each
for (const sc of SCENES) {
  for (const surface of OLD_SURFACES) {
    test(`${sc.name} on ${surface} draws exactly as before the VS Code pages`, async ($, on) => {
      sc.seed(on)
      const ui = await $.ui.mount({ ...PANE, surface })
      await sc.go(ui as never)
      expect(withoutResults(drawnData(await ui.drawn())), `${surface} ${sc.name}`).toEqual(SCOUTS_SETTINGS_BEFORE[`${surface} ${sc.name}`])
      await ui.unmount()
    })
  }
}

// T-460: the Roles and Kinds pages (and a role's and a kind's page) on the terminal, the desktop and mobile, the same
for (const sc of ROLE_KIND_SCENES) {
  for (const surface of OLD_SURFACES) {
    test(`${sc.name} on ${surface} draws exactly as before the VS Code Roles and Kinds pages`, async ($, on) => {
      sc.seed(on)
      const ui = await $.ui.mount({ ...PANE, surface })
      await sc.go(ui as never)
      const saved = ROLES_KINDS_BEFORE[`${surface} ${sc.name}`]
      expect(saved, `${surface} ${sc.name}`).toBeDefined()
      expect(drawnData(await ui.drawn()), `${surface} ${sc.name}`).toEqual(saved)
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
  expect(withoutResults(drawnData(await ui.drawn()))).toEqual(changedTree(SCOUTS_SETTINGS_BEFORE['terminal scout dependency-updates'], [['ran 40m ago', 'ran 50m ago']]))
  await ui.unmount()
})

/** Checks a VS Code page: nothing cut with "…", no key hints, no key marks on buttons, the click hint at the bottom. */
function readable(tree: unknown, page: string) {
  const all = texts(tree)
  expect(all.filter(s => s.includes('…')), page).toEqual([])
  for (const re of KEY_HINTS) expect(all.filter(s => re.test(s)), `${page} ${re}`).toEqual([])
  expect(elements(tree).filter(n => n.type === 'Text' && n.props?.wrap === 'truncate' && !/^[─━]+$/.test(texts(n).join(''))), page).toEqual([])
}

/** A VS Code Scouts list row as plain text: its Texts and its name link's text (no Markdown marks, plain spaces). */
const vsRowText = (box: Node | undefined) =>
  (box?.children ?? [])
    .filter((n): n is Node => !!n && typeof n === 'object')
    .map(n => texts(n).join(''))
    .join('')
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\\(.)/g, '$1')
    .replace(/ /g, ' ')

test('T-697 the Scouts list in VS Code at width 50: one line per scout, the terminal list\'s parts, the state in its color', async ($, on) => {
  seedScouts(on, 'scouts')
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const tree = await ui.drawn()
  expect(await ui.find({ type: 'Text', text: CLICK_HINT })).toBeDefined()
  for (const re of KEY_HINTS) expect(texts(tree).filter(s => re.test(s)), `scouts list ${re}`).toEqual([])
  const room = vsRowRoom(50)
  const rows = scoutListRows(SCOUTS as never, T0, room, 2, 'backlog')
  // T-912: the board default on top
  expect(await ui.find({ type: 'Text', text: 'scout findings by default: backlog' })).toBeDefined()
  for (const [i, s] of SCOUTS.entries()) {
    const box = await ui.find({ key: `vs-scout-${s.name}` })
    expect(box?.props?.flexDirection, s.name).toBe('row')
    // one line: no wrapping Text and no Box in a column inside the row
    expect(elements(box!.children).filter(n => n.props?.wrap === 'wrap' || n.props?.flexDirection === 'column'), s.name).toEqual([])
    expect(elements(box).filter(n => n.type === 'Button'), s.name).toEqual([])
    const line = vsRowText(box)
    expect(line.length, `${s.name}: ${line}`).toBeLessThanOrEqual(room)
    // the same parts as the terminal list's row, in its order: icon, name, how often, state, "last:", findings, model
    const r = rows[i]!
    const parts = [r.icon, s.name, r.every.trim(), r.state.trim(), r.last.trim(), r.findings.trim(), r.model.trim()].filter(Boolean)
    let at = 0
    for (const p of parts) {
      const found = line.indexOf(p, at)
      expect(found, `${s.name}: "${p}" in "${line}"`).toBeGreaterThanOrEqual(0)
      at = found + p.length
    }
    // the name a link that opens the scout; the state in its color, the rest dim
    const open = await ui.find({ key: `scout:${s.name}` })
    expect([open?.type, open?.props.pressableLinks], s.name).toEqual(['Markdown', [vsHref('scout', s.name)]])
    // the row's Texts: the icon (in the scout's tone), then how often, the state, the end
    const raw = (box!.children as Node[]).filter(n => n.type === 'Text').map(n => texts(n).join(''))
    // the cells keep their gaps in VS Code: no plain spaces, only no-break ones
    for (const t of raw) expect(t.includes(' '), `${s.name}: plain space in ${JSON.stringify(t)}`).toBe(false)
    const cells = (box!.children as Node[]).filter(n => n.type === 'Text').map(n => [texts(n).join('').replace(/\u00a0/g, ' '), n.props?.color])
    expect(cells[0], s.name).toEqual([`${r.icon} `, r.tone])
    for (const [text, color] of cells.slice(1)) expect(color, `${s.name}: ${text}`).toBe(text === r.state ? r.stateTone : 'inactive')
    if (r.state.trim()) expect(cells.some(([text]) => text === r.state), s.name).toBe(true)
  }
  const line = (name: string) => ui.find({ key: `vs-scout-${name}` }).then(vsRowText)
  expect(await line('dependency-updates')).toMatch(/^◉ dependency-updates +every 30 min +running now… +board: backlog$/)
  const stateColor = (name: string) => ui.find({ key: `vs-scout-${name}` }).then(b => ((b!.children as Node[]).filter(n => n.type === 'Text').find(n => /running|paused|bad every|next in/.test(texts(n).join('').replace(/ /g, ' '))))?.props?.color)
  expect(await stateColor('dependency-updates')).toBe('ide')
  expect(await stateColor('docs-drift')).toBe('inactive')
  expect(await stateColor('broken')).toBe('warning')
  expect(await line('docs-drift')).toMatch(/paused +last: nothing +board: backlog$/)
  // a long report: its start after "last: found 5", cut with "…" so the row stays one line; T-912: the findings
  // choice keeps its place at the end, so in a narrow row the report start goes first
  const long = await line('security-advisories-for-node-packages')
  expect(long).toMatch(/next in 3h 00m +last: found 5 +board: backlog$/)
  expect(long.length).toBeLessThanOrEqual(room)
  expect(scoutRowEnd(SCOUTS[1] as never, rows[1]!, 60)).toMatch(/^  last: found 5: The package left-pad.*…  board: backlog$/)
  expect(scoutRowEnd(SCOUTS[1] as never, rows[1]!, 60).length).toBeLessThanOrEqual(60)
  expect(scoutRowEnd(SCOUTS[1] as never, rows[1]!, 40).length).toBeLessThanOrEqual(40)
  expect((await ui.find({ key: 'scout-new' }))?.props.variant).toBe('secondary')
  // a new scout: a button, then a box for its name with a Cancel button
  await ui.press({ key: 'scout-new' })
  expect((await ui.find({ key: 'scout-new-name' }))?.type).toBe('Input')
  expect((await ui.find({ key: 'scout-new-cancel' }))?.props.label).toBe('Cancel')
  // a press on a name opens that scout's page
  await ui.press({ key: 'scout-new-cancel' })
  await ui.press({ key: 'scout:docs-drift', link: { href: vsHref('scout', 'docs-drift') } })
  expect(await ui.find({ key: 'vs-page-header' }), 'the scout page').toBeDefined()
  expect((await ui.find({ key: 'scout-back' }))?.props.label).toBe('Scouts')
  expect(texts(await ui.drawn()).join(' ')).toContain('Compare docs/guide.md with the code.')
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
  // T-444: the how-to in a box, and "+ New scout" as the one primary button
  expect((await ui.find({ key: 'vs-scouts-howto' }))?.props.borderStyle).toBe('round')
  expect((await ui.find({ key: 'scout-new' }))?.props.variant).toBe('primary')
  expect(elements(tree).filter(n => n.type === 'Button' && n.props?.variant === 'primary').length).toBe(1)
  await ui.unmount()
})

for (const s of SCOUTS) {
  test(`${s.name}'s scout page in VS Code at width 50: whole text, its facts, buttons for its actions, no report text`, async ($, on) => {
    seedScouts(on, 'scouts', s.name)
    const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
    const tree = await ui.drawn()
    readable(tree, s.name)
    expect(await ui.find({ type: 'Text', text: CLICK_HINT })).toBeDefined()
    // T-751: the page header: ‹ Scouts and its place in the list, the name, the facts as chips, the buttons in groups
    expect((await ui.find({ key: 'scout-back' }))?.props.label).toBe('Scouts')
    const facts = texts(await ui.find({ key: 'vs-state' })).join(' ')
    expect(facts, s.name).toContain(s.every_minutes === 30 ? 'every 30 min' : s.every_minutes === 1440 ? 'every day' : s.every_minutes === 60 ? 'every hour' : 'on demand')
    expect(facts, s.name).toMatch(s.last_run ? /last ran \d[\dhm ]* ago/ : /never ran/)
    if (s.next_run && !s.paused && !s.running) expect(facts, s.name).toMatch(/next in 3h 00m/)
    // the actions are buttons: run now (not while it runs, the next step), edit, pause or resume
    const row = await ui.find({ key: 'vs-actions' })
    const keys = elements(row!.children).filter(n => n.type === 'Button').map(n => n.props?.key)
    expect(keys, s.name).toEqual([...(s.running ? [] : ['scout-run']), 'scout-edit', 'scout-pause'])
    // T-775: every header button secondary, one style (Run now too)
    if (!s.running) expect((await ui.find({ key: 'scout-run' }))?.props.variant, s.name).toBe('secondary')
    for (const b of elements(await ui.find({ key: 'vs-actions' })).filter(n => n.type === 'Button')) expect(b.props?.variant, `${s.name} ${b.props?.key}`).toBe('secondary')
    expect((await ui.find({ key: 'scout-pause' }))?.props.label).toBe(s.paused ? 'Resume' : 'Pause')
    // the instructions are Markdown, given whole; no report text on the page (T-516: a run's page shows its report)
    const md = elements(tree).filter(n => n.type === 'Markdown').map(n => String(n.props?.text))
    expect(md, s.name).toContain(s.prompt)
    expect(md.filter(t => t.includes('Findings') || t.includes('NOTHING')), s.name).toEqual([])
    expect(await ui.find({ key: 'vs-sec-report' }), s.name).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^\(no runs yet\)$/ }), s.name).toBeDefined()
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
  expect((await ui.find({ key: 'setting:mode' }))?.props.options).toEqual([{ value: 'paused' }, { value: 'review', label: 'approve merge' }, { value: 'auto', label: 'auto merge' }])
  // T-695: one notify row with the five choices (the sound set is part of notify); no sound_set row
  expect((await ui.find({ key: 'setting:notify' }))?.props.options).toEqual(['voice', 'sound 1', 'sound 2', 'sound 3', 'off'].map(value => ({ value })))
  expect((await ui.find({ key: 'setting:notify' }))?.props.value).toBe('sound 2')
  expect(await ui.find({ key: 'setting:sound_set' })).toBeUndefined()
  expect(await ui.find({ key: 'vs-setting-sound_set' })).toBeUndefined()
  expect((await ui.find({ key: 'setting:scout_findings' }))?.props.value).toBe('backlog')
  for (const name of BOXES) expect((await ui.find({ key: `setting:${name}` }))?.type, name).toBe('Input')
  expect((await ui.find({ key: 'setting:max_parallel' }))?.props.value).toBe('2')
  // T-460: Roles and Kinds open their pages from links, not Buttons
  expect((await ui.find({ key: 'settings-roles' }))?.props.pressableLinks).toEqual([vsHref('page', 'roles')])
  expect((await ui.find({ key: 'settings-kinds' }))?.props.pressableLinks).toEqual([vsHref('page', 'kinds')])
  await ui.unmount()
})

/** A fake board.json with the fixture's settings: a save (a temp file, then mv over it) is kept, so the next read sees it. */
function boardFile(on: On) {
  const { tasks, mode, test_commands, scout_findings, max_parallel, notify } = SCOUTS_VIEW.value
  const files: Record<string, string | null> = { '/board.json': JSON.stringify({ tasks, mode, test_commands, scout_findings, max_parallel, notify }), '/board.lock': null }
  // a parts file (.symcc/tasks/T-n.json) is kept as soon as it is written (an exists check that fails would make the
  // board broken, T-681)
  const fileOf = (p: string) => {
    const parts = /\.symcc(\/tasks\/T-\d+\.json)$/.exec(p)?.[1]
    if (parts && !(parts in files)) files[parts] = null
    return Object.keys(files).find(f => p.endsWith(`.symcc${f}`))
  }
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
  // T-908: docs_test_commands is a box under Checks before merging too
  await ui.input({ key: 'setting:docs_test_commands', text: 'sh tests/build-site.sh' })
  expect(board().docs_test_commands).toEqual(['sh tests/build-site.sh'])
  expect(board().test_commands).toEqual(['npm test'])
  await ui.unmount()
})

test('a report start loses only Markdown markers, not the _ and ` inside names', async () => {
  expect(reportStart('1. The setting `max_parallel` in board_file.json is ignored')).toBe('The setting max_parallel in board_file.json is ignored')
  expect(reportStart('## Findings\n**2. A __big__ and *small* thing**')).toBe('A big and small thing')
})

// ---------------- T-460: Settings, Roles and Kinds in VS Code: links to go somewhere, no Button rows that run together ----------------

/** The Box rows of a tree that hold more than one Button and don't wrap (VS Code's Buttons never wrap their labels, so
 *  such a row overlaps or runs off the edge at a narrow width). */
const crowdedRows = (tree: unknown) =>
  elements(tree)
    // the shared page header's ‹ n of m › (T-751, on a role's page since T-871) is two small arrows, not a crowded row
    .filter(n => n.type === 'Box' && n.props?.flexDirection === 'row' && n.props?.flexWrap !== 'wrap' && n.props?.key !== 'vs-pager')
    .filter(n => (n.children ?? []).filter(c => (c as Node)?.type === 'Button').length > 1)
    .map(n => String(n.props?.key))

/** Checks a VS Code page as T-460 wants it: readable (no "…", no key hints) and no crowded Button row. */
function tidy(tree: unknown, page: string) {
  readable(tree, page)
  expect(crowdedRows(tree), page).toEqual([])
}

/** Presses the link `href` in the Markdown keyed `key`. */
const follow = (ui: { press: (t: { key: string; link: { href: string } }) => Promise<unknown> }, key: string, href: string) => ui.press({ key, link: { href } })
const act = (key: string, id: string) => vsHref('do', `${key}/${id}`)

for (const bodyColumns of [40, 80]) {
  const at = (page: string) => `${page} at width ${bodyColumns}`
  const mount = ($: Engine) => $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'vscode' })

  test(`T-460 Settings, Roles and one role in VS Code at width ${bodyColumns}: links to go somewhere, badges, no crowded Button rows`, async ($, on) => {
    const { mine } = seedRolesKinds(on)
    const ui = await mount($)
    tidy(await ui.drawn(), at('settings'))
    // Roles is a link that opens its page
    await follow(ui, 'settings-roles', vsHref('page', 'roles'))
    const list = await ui.drawn()
    tidy(list, at('roles'))
    expect(elements(list).filter(n => n.type === 'Button').map(n => n.props?.key), at('roles')).toEqual(['role-new'])
    for (const name of ROLE_KIND_PAGES.roles) {
      const link = await ui.find({ key: `roleRow:${name}` })
      expect([link?.type, link?.props.pressableLinks], name).toEqual(['Markdown', [vsHref('role', name)]])
    }
    // T-918: the heading with its count, then a table: the column heads, one line per role, its cells in columns
    expect((await ui.find({ type: 'Text', text: /^Roles {2}/ }))?.text).toBe('Roles  6 roles · 3 changed by you · 1 off')
    const cells = async (key: string) => (await ui.find({ key }))?.children?.map(c => texts(c).join('').replace(/\*\*|\[|\]\([^)]*\)/g, ''))
    // wide: every column; at width 40 MODEL goes (the long name leaves less room)
    const wide = bodyColumns === 80
    expect(await cells('vs-roles-cols')).toEqual(wide ? ['NAME', 'FROM', 'MODEL', 'WEB', 'WRITES', "WHAT IT'S FOR"] : ['NAME', 'FROM', 'WEB', 'WRITES', "WHAT IT'S FOR"])
    expect(await cells('vs-role-general')).toEqual(wide ? ['general', 'built-in', '—', '—', 'code', 'a plain worker for any task; use it when no other role fits'] : ['general', 'built-in', '—', 'code', 'a plain worker for any task; use it when no other role fits'])
    expect((await cells('vs-role-tester'))?.slice(0, 3)).toEqual(['tester', 'changed', wide ? 'sonnet' : '—'])
    expect((await cells('vs-role-docs'))?.slice(0, 2)).toEqual(['docs', 'off'])
    expect((await cells('vs-role-mobile-apps-and-tablets-everywhere'))?.slice(0, 2)).toEqual(['mobile-apps-and-tablets-everywhere', 'added by you'])
    expect(await cells('vs-role-bad')).toEqual(['bad', "— your file can't be read: no front matter (it starts with a --- line, then description: ..., then ---)"])
    // the description is never cut here: it wraps under itself
    const about = elements(await ui.find({ key: 'vs-role-mobile-apps-and-tablets-everywhere' })).find(n => n.type === 'Text' && texts(n).join('').startsWith('builds and fixes'))
    expect([about?.props?.wrap, about?.props?.color]).toEqual(['wrap', 'text'])
    // New role: a box for the name with a Cancel link
    await ui.press({ key: 'role-new' })
    tidy(await ui.drawn(), at('new role'))
    await follow(ui, 'role-new-cancel', act('role-new-cancel', 'cancel'))
    expect(await ui.find({ key: 'role-new-name' })).toBeUndefined()
    // each role's page
    for (const name of ROLE_KIND_PAGES.roles) {
      await follow(ui, `roleRow:${name}`, vsHref('role', name))
      tidy(await ui.drawn(), at(`role ${name}`))
      // a file that can't be read keeps its own page with a Back link
      if (name === 'bad') {
        expect((await ui.find({ key: 'role-back' }))?.type, name).toBe('Markdown')
        await follow(ui, 'role-back', vsHref('page', 'back/role-back'))
        expect(await ui.find({ key: `roleRow:${name}` }), name).toBeDefined()
        continue
      }
      // T-871: the shared page header (as a task's or scout's page): its Back is a Button
      expect((await ui.find({ key: 'vs-page-header' })), name).toBeDefined()
      expect((await ui.find({ key: 'role-back' }))?.props.label, name).toBe('Roles')
      await ui.press({ key: 'role-back' })
      expect(await ui.find({ key: `roleRow:${name}` }), name).toBeDefined()
    }
    // an added role: the header's Edit, Prompt, Turn off and Remove; nothing to compare
    const actions = async () => elements(await ui.find({ key: 'vs-actions' })).filter(n => n.type === 'Button').map(n => n.props?.label)
    await follow(ui, 'roleRow:mobile-apps-and-tablets-everywhere', vsHref('role', 'mobile-apps-and-tablets-everywhere'))
    expect(await actions()).toEqual(['Edit', 'Prompt', 'Remove', 'Turn off'])
    // T-918: the page says what the role writes
    expect(await ui.find({ type: 'Text', text: 'Writes: code (tests run before merging)' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'added: no built-in to compare' })).toBeDefined()
    // Remove asks first: one "Yes, remove" Button and a Cancel link
    await ui.press({ key: 'role-remove' })
    tidy(await ui.drawn(), at('role remove'))
    expect((await ui.find({ key: 'role-remove-yes' }))?.props.variant).toBe('primary')
    await follow(ui, 'role-remove-cancel', act('role-remove-cancel', 'cancel'))
    expect(await ui.find({ key: 'role-remove-yes' })).toBeUndefined()
    // the prompt page and the edit page
    await ui.press({ key: 'role-prompt' })
    tidy(await ui.drawn(), at('role prompt'))
    await follow(ui, 'role-prompt-back', vsHref('page', 'back/role-prompt-back'))
    await ui.press({ key: 'role-edit' })
    tidy(await ui.drawn(), at('role edit'))
    expect((await ui.find({ key: 'role-save' }))?.type).toBe('Button')
    expect((await ui.find({ key: 'role-description' }))?.props.label).toBe('Description')
    // T-918: the Writes pick (two links): prose only, then Save, writes code: false, and the page says so
    expect((await ui.find({ key: 'role-code' }))?.props.text).toContain('● code')
    await follow(ui, 'role-code', act('role-code', 'prose'))
    expect((await ui.find({ key: 'role-code' }))?.props.text).toContain('● prose only')
    await ui.press({ key: 'role-save' })
    expect(mine['mobile-apps-and-tablets-everywhere.md']).toContain('code: false')
    expect(await ui.find({ type: 'Text', text: 'Writes: prose only (code: false; only docs checks run)' })).toBeDefined()
    await ui.press({ key: 'role-edit' })
    await follow(ui, 'role-edit-cancel', act('role-edit-cancel', 'cancel'))
    expect(await ui.find({ key: 'role-save' })).toBeUndefined()
    // a built-in role has no Remove; a replaced one has Reset to built-in
    await ui.press({ key: 'role-back' })
    await follow(ui, 'roleRow:tester', vsHref('role', 'tester'))
    expect(await actions()).toEqual(['Edit', 'Prompt', 'Reset to built-in', 'Turn off'])
    // T-871: its state says how many changes; Changed from built-in lists them, a checklist only its changed lines
    expect(await ui.find({ type: 'Text', text: 'replaced · 3 changes' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'skills: (none) → testing, review' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'checklist: 1 line changed' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '+ - cover empty input' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /[−+] - cover errors$/ })).toBeUndefined()
    // Reset to built-in asks first
    await ui.press({ key: 'role-reset' })
    expect((await ui.find({ key: 'role-reset-yes' }))?.props.label).toBe('Yes, reset')
    await follow(ui, 'role-reset-cancel', act('role-reset-cancel', 'cancel'))
    expect(await ui.find({ key: 'role-reset-yes' })).toBeUndefined()
    // back to Settings
    await ui.press({ key: 'role-back' })
    await follow(ui, 'roles-back', vsHref('page', 'back/roles-back'))
    expect(await ui.find({ key: 'settings-roles' })).toBeDefined()
    await ui.unmount()
  })

  test(`T-460 Kinds and one kind in VS Code at width ${bodyColumns}: links to go somewhere, badges, no crowded Button rows`, async ($, on) => {
    const toasts: string[] = []
    const { kinds } = seedRolesKinds(on, e => void toasts.push(JSON.stringify(e)))
    const ui = await mount($)
    await follow(ui, 'settings-kinds', vsHref('page', 'kinds'))
    const list = await ui.drawn()
    tidy(list, at('kinds'))
    expect(elements(list).filter(n => n.type === 'Button').map(n => n.props?.key), at('kinds')).toEqual(['kind-new'])
    for (const name of ROLE_KIND_PAGES.kinds) expect((await ui.find({ key: `kindRow:${name}` }))?.props.pressableLinks, name).toEqual([vsHref('kind', name)])
    // T-918: the same table as the Roles page: NAME, FROM, WHAT IT'S FOR
    const cells = async (key: string) => (await ui.find({ key }))?.children?.map(c => texts(c).join('').replace(/\*\*|\[|\]\([^)]*\)/g, ''))
    expect(await cells('vs-kinds-cols')).toEqual(['NAME', 'FROM', "WHAT IT'S FOR"])
    expect(await cells('vs-kind-bug')).toEqual(['bug', 'off', 'something that works wrongly'])
    expect((await cells('vs-kind-chore-and-upkeep-of-the-build'))?.slice(0, 2)).toEqual(['chore-and-upkeep-of-the-build', 'added by you'])
    for (const name of ROLE_KIND_PAGES.kinds) {
      await follow(ui, `kindRow:${name}`, vsHref('kind', name))
      tidy(await ui.drawn(), at(`kind ${name}`))
      await follow(ui, 'kind-back', vsHref('page', 'back/kind-back'))
    }
    // change is always on: no Turn off; bug is off: Turn on writes its file
    await follow(ui, 'kindRow:change', vsHref('kind', 'change'))
    expect((await ui.find({ key: 'kind-actions' }))?.props.pressableLinks).toEqual([act('kind-actions', 'edit')])
    await follow(ui, 'kind-back', vsHref('page', 'back/kind-back'))
    await follow(ui, 'kindRow:bug', vsHref('kind', 'bug'))
    await follow(ui, 'kind-actions', act('kind-actions', 'off'))
    expect(kinds['bug.md'], toasts.join('\n')).not.toContain('off: true')
    // the edit page: one Save Button and a Cancel link
    await follow(ui, 'kind-actions', act('kind-actions', 'edit'))
    tidy(await ui.drawn(), at('kind edit'))
    await follow(ui, 'kind-edit-cancel', act('kind-edit-cancel', 'cancel'))
    await follow(ui, 'kind-back', vsHref('page', 'back/kind-back'))
    await follow(ui, 'kinds-back', vsHref('page', 'back/kinds-back'))
    expect(await ui.find({ key: 'settings-kinds' })).toBeDefined()
    await ui.unmount()
  })
}

test("T-460 a scout's edit page in VS Code: one Save Button and a Cancel link, no crowded Button row", async ($, on) => {
  seedScouts(on, 'scouts', 'docs-drift')
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 40 }, surface: 'vscode' })
  await ui.press({ key: 'scout-edit' })
  tidy(await ui.drawn(), 'scout edit')
  expect((await ui.find({ key: 'scout-save' }))?.type).toBe('Button')
  expect((await ui.find({ key: 'scout-every' }))?.props.label).toBe('Runs every')
  await follow(ui, 'scout-cancel', vsHref('do', 'scout-edit/cancel'))
  expect(await ui.find({ key: 'scout-save' })).toBeUndefined()
  await ui.unmount()
})

// the checker's case: a question's page in VS Code had its answers in a row of Buttons that doesn't wrap, plus a Back Button
// (T-651: now one numbered link line per answer)
const QUESTION = { id: 'Q-3', text: 'Should the board open by itself?', options: ['Yes', 'No'], asked_at: new Date(T0 - 5 * 60_000).toISOString() }
for (const bodyColumns of [40, 80]) {
  test(`T-460 a question's page in VS Code at width ${bodyColumns}: answers as numbered link lines, "← Tasks" a link`, async ($, on) => {
    seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, questions: [QUESTION] } } })
    on('ui.toast', () => ({ value: undefined }))
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'vscode' })
    await follow(ui, 'Q-3', vsHref('question', 'Q-3'))
    const tree = await ui.drawn()
    tidy(tree, `question at width ${bodyColumns}`)
    expect(texts(tree).join(' ')).toContain(QUESTION.text)
    // T-651: the answers are numbered link lines, one under the other (they wrap as text does), not a row of Buttons;
    // the only Buttons are the hidden ones holding the number keys
    const row = await ui.find({ key: 'vs-answers' })
    expect(row?.props.flexDirection).toBe('column')
    for (const [i, c] of QUESTION.options.entries())
      expect((await ui.find({ key: `choice-${i + 1}` }))?.props.text).toBe(mdLink(`${i + 1}. ${c}`, vsHref('choice', String(i + 1))))
    expect(elements(tree).filter(n => n.type === 'Button').map(n => [n.props?.label, n.props?.hotkey])).toEqual([['Yes', '1'], ['No', '2']])
    expect((await ui.find({ key: 'answer' }))?.type).toBe('Input')
    expect((await ui.find({ key: 'question-back' }))?.props.pressableLinks).toEqual([vsHref('page', 'back/question-back')])
    await follow(ui, 'question-back', vsHref('page', 'back/question-back'))
    expect(await ui.find({ key: 'vs-answers' })).toBeUndefined()
    expect(await ui.find({ key: 'Q-3' })).toBeDefined()
    await ui.unmount()
  })
}
