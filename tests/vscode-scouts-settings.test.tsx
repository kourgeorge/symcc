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
import { reportStart } from '../hooks/claude/ui/vscode-scouts'
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
const KEY_HINTS = [/\[[a-z]\]:/, /Enter open/, /Enter on a heading/, /Enter changes/, /Enter saves/, /Enter picks/, /Enter goes on/, /open\/close/, /→ \/ ←/, /↑↓/, /t s c views/, /Esc back/, /\s\([a-z]\)(\s|$)/]
const STATUS_COLORS = new Set(['warning', 'error', 'ide', 'permission', 'success', 'suggestion'])
const CHOICES = ['mode', 'notify', 'checker', 'scout_findings', 'tests_with_changes', 'open_on_start', 'enabled']
const BOXES = ['max_parallel', 'max_minutes', 'auto_retries', 'archive_days', 'test_commands']

/** The drawn tree without the scout page's "Results · …" line (T-622 added it after these trees were saved; scout-runs.test.tsx checks it). */
function withoutResults(tree: unknown): unknown {
  const isResults = (n: unknown) => !!n && typeof n === 'object' && (n as Node).type === 'Text' && typeof (n as Node).children?.[0] === 'string' && ((n as Node).children![0] as string).startsWith('Results · ')
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
    expect(open?.type, s.name).toBe('Markdown')
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
  // T-448: each scout's name is a link in a Markdown (no Button: VS Code draws a Button as a filled blue box), its status
  // a filled badge beside it, then dim lines; the start of the last report dim too
  for (const s of SCOUTS) {
    const open = await ui.find({ key: `scout:${s.name}` })
    expect([open?.type, open?.props.pressableLinks], s.name).toEqual(['Markdown', [vsHref('scout', s.name)]])
    const box = await ui.find({ key: `vs-scout-${s.name}` })
    expect(elements(box).filter(n => n.type === 'Button'), s.name).toEqual([])
    const badge = elements(box!.children).find(n => n.type === 'Text' && n.props?.backgroundColor)
    expect([badge?.props?.color, badge?.props?.bold], s.name).toEqual(['inverseText', true])
  }
  const running = elements((await ui.find({ key: 'vs-scout-dependency-updates' }))!.children).find(n => n.props?.backgroundColor)
  expect([texts(running).join(''), running?.props?.backgroundColor]).toEqual([' ◉ running now ', 'ide'])
  const report = elements((await ui.find({ key: 'vs-scout-security-advisories-for-node-packages' }))!.children).find(n => n.type === 'Text' && /^last report: /.test(texts(n).join('')))
  expect(report?.props?.color).toBe('inactive')
  expect((await ui.find({ key: 'scout-new' }))?.props.variant).toBe('secondary')
  // a new scout: a button, then a box for its name with a Cancel button
  await ui.press({ key: 'scout-new' })
  readable(await ui.drawn(), 'new scout')
  expect((await ui.find({ key: 'scout-new-name' }))?.type).toBe('Input')
  expect((await ui.find({ key: 'scout-new-cancel' }))?.props.label).toBe('Cancel')
  // a press on a row opens the scout's page
  await ui.press({ key: 'scout-new-cancel' })
  await ui.press({ key: 'scout:docs-drift', link: { href: vsHref('scout', 'docs-drift') } })
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
  expect((await ui.find({ key: 'setting:notify' }))?.props.options).toEqual([{ value: 'off' }, { value: 'sound' }, { value: 'voice' }])
  expect((await ui.find({ key: 'setting:notify' }))?.props.value).toBe('sound')
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

// ---------------- T-460: Settings, Roles and Kinds in VS Code: links to go somewhere, no Button rows that run together ----------------

/** The Box rows of a tree that hold more than one Button and don't wrap (VS Code's Buttons never wrap their labels, so
 *  such a row overlaps or runs off the edge at a narrow width). */
const crowdedRows = (tree: unknown) =>
  elements(tree)
    .filter(n => n.type === 'Box' && n.props?.flexDirection === 'row' && n.props?.flexWrap !== 'wrap')
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
    seedRolesKinds(on)
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
    // the badges sit beside the name, in the row's top line
    const badges = async (key: string) => elements(await ui.find({ key })).filter(n => n.type === 'Text' && n.props?.backgroundColor).map(n => texts(n).join('').trim())
    expect(await badges('vs-role-general-top')).toEqual(['built-in'])
    expect(await badges('vs-role-tester-top')).toEqual(['replaced'])
    expect(await badges('vs-role-docs-top')).toEqual(['replaced', 'off'])
    expect(await badges('vs-role-mobile-apps-and-tablets-everywhere-top')).toEqual(['added'])
    expect(await badges('vs-role-bad-top')).toEqual(["can't be read"])
    // the description dim and wrapped
    const about = elements(await ui.find({ key: 'vs-role-mobile-apps-and-tablets-everywhere' })).find(n => n.type === 'Text' && texts(n).join('').startsWith('builds and fixes'))
    expect([about?.props?.wrap, about?.props?.color]).toEqual(['wrap', 'inactive'])
    // New role: a box for the name with a Cancel link
    await ui.press({ key: 'role-new' })
    tidy(await ui.drawn(), at('new role'))
    await follow(ui, 'role-new-cancel', act('role-new-cancel', 'cancel'))
    expect(await ui.find({ key: 'role-new-name' })).toBeUndefined()
    // each role's page
    for (const name of ROLE_KIND_PAGES.roles) {
      await follow(ui, `roleRow:${name}`, vsHref('role', name))
      tidy(await ui.drawn(), at(`role ${name}`))
      expect((await ui.find({ key: 'role-back' }))?.type, name).toBe('Markdown')
      await follow(ui, 'role-back', vsHref('page', 'back/role-back'))
      expect(await ui.find({ key: `roleRow:${name}` }), name).toBeDefined()
    }
    // an added role: Edit, See the prompt, Turn off and Remove are links on one line that wraps
    await follow(ui, 'roleRow:mobile-apps-and-tablets-everywhere', vsHref('role', 'mobile-apps-and-tablets-everywhere'))
    expect((await ui.find({ key: 'role-actions' }))?.props.pressableLinks).toEqual(['edit', 'prompt', 'off', 'remove'].map(id => act('role-actions', id)))
    // Remove asks first: one "Yes, remove" Button and a Cancel link
    await follow(ui, 'role-actions', act('role-actions', 'remove'))
    tidy(await ui.drawn(), at('role remove'))
    expect((await ui.find({ key: 'role-remove-yes' }))?.props.variant).toBe('primary')
    await follow(ui, 'role-remove-cancel', act('role-remove-cancel', 'cancel'))
    expect(await ui.find({ key: 'role-remove-yes' })).toBeUndefined()
    // the prompt page and the edit page
    await follow(ui, 'role-actions', act('role-actions', 'prompt'))
    tidy(await ui.drawn(), at('role prompt'))
    await follow(ui, 'role-prompt-back', vsHref('page', 'back/role-prompt-back'))
    await follow(ui, 'role-actions', act('role-actions', 'edit'))
    tidy(await ui.drawn(), at('role edit'))
    expect((await ui.find({ key: 'role-save' }))?.type).toBe('Button')
    expect((await ui.find({ key: 'role-description' }))?.props.label).toBe('Description')
    await follow(ui, 'role-edit-cancel', act('role-edit-cancel', 'cancel'))
    expect(await ui.find({ key: 'role-save' })).toBeUndefined()
    // a built-in role has no Remove; a replaced one has Reset to built-in
    await follow(ui, 'role-back', vsHref('page', 'back/role-back'))
    await follow(ui, 'roleRow:tester', vsHref('role', 'tester'))
    expect((await ui.find({ key: 'role-actions' }))?.props.pressableLinks).toEqual(['edit', 'prompt', 'off', 'reset'].map(id => act('role-actions', id)))
    // back to Settings
    await follow(ui, 'role-back', vsHref('page', 'back/role-back'))
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
