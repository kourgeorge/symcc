// T-751: the task page and the scout page start with one 4-line header, the same on every board: where you are (Back,
// the place in the list it was opened from, prev/next), the title, the state, the buttons in groups (the next step,
// the task actions, the ones that throw work away, the page ones; since T-775 every one "[Label]" in one style, Back
// "‹ [Tasks]"; words only, the keys in the footer), then a thin rule (T-790). core/page-header.ts makes the lines; these tests check them on the terminal, desktop, mobile and
// VS Code (OpenCode's are in hooks/opencode/tests/opencode-tui.spec.ts).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { PANE, T0 } from './board-fixture'
import { RICH_TASKS, seedRich } from './task-page-fixture'
import { SCOUTS, seedScouts } from './scouts-settings-fixture'
import { taskActions, type BoardTask } from '../hooks/board'
import { groupSegLines, packGroups, placeIn, pillText, scoutListNames, taskListIds, taskStateGroups, titleLines, tryText, whereLine, originShort } from '../hooks/core/page-header'

type Node = { type?: string; key?: string; props?: Record<string, unknown>; children?: unknown[]; text?: string }
const kids = (n: unknown): Node[] => (((n as Node)?.children ?? []) as Node[]).filter(c => c && typeof c === 'object')
const keyOf = (n: Node) => (n.props?.key ?? n.key) as string | undefined
const textOf = (n: unknown): string => (typeof n === 'string' ? n : Array.isArray(n) ? n.map(textOf).join('') : n && typeof n === 'object' ? textOf((n as Node).children ?? []) : '')
const segText = (l: { text: string }[]) => l.map(x => x.text).join('')

/** The rich tasks in the Tasks list's order (what prev and next go through). */
const LIST = taskListIds(RICH_TASKS as never, T0)
const task = (id: string) => RICH_TASKS.find(t => t.id === id)! as unknown as BoardTask

test('core: placeIn goes round at the ends; the where line shortens when narrow; prev/next only with others in the list', () => {
  expect(placeIn(['a', 'b', 'c'], 'a')).toEqual({ n: 1, of: 3, prev: 'c', next: 'b' })
  expect(placeIn(['a', 'b', 'c'], 'c')).toEqual({ n: 3, of: 3, prev: 'b', next: 'a' })
  expect(placeIn(['a'], 'x')).toBeNull()
  const at = (w: number, place = placeIn(['T-1', 'T-738', 'T-3'], 'T-738')) => {
    const l = whereLine('tasks', 'T-738', place, w)
    return segText([...l.left, { text: ' '.repeat(l.pad) }, ...l.right])
  }
  expect(at(40)).toMatch(/^‹ \[Tasks\] +T-738 · ‹ 2 of 3 ›$/)
  expect(at(40).length).toBe(40)
  expect(at(20)).toBe('‹ [Tasks] ‹ 2 of 3 ›')
  // alone in its list: no "1 of 1" and no arrows
  expect(at(40, placeIn(['T-738'], 'T-738'))).toMatch(/^‹ \[Tasks\] +T-738$/)
  expect(segText(whereLine('live', 'T-5', null, 20).left)).toBe('‹ [Live]')
  expect(segText(whereLine('scouts', 'bugs', null, 20).left)).toBe('‹ [Scouts]')
  // the list: what needs you, what runs, what waits, the backlog, done, dropped; a search keeps only its matches
  expect(LIST.slice(0, 3)).toEqual(['T-510', 'T-501', 'T-511'])
  expect(LIST.at(-1)).toBe('T-509')
  expect(taskListIds(RICH_TASKS as never, T0, 'status:failed')).toEqual(['T-502'])
  expect(scoutListNames(SCOUTS as never)[0]).toBe('dependency-updates')
})

test('core: the title wraps under itself; the state groups say status, step, time, kind, role, try and origin; they wrap between groups', () => {
  const lines = titleLines('T-738', 'Live tab: an empty line before each section (all boards)', 'ide', 30).map(segText)
  expect(lines[0]!.startsWith('T-738  Live tab:')).toBe(true)
  expect(lines.slice(1).every(l => l.startsWith(' '.repeat(7)) && l[7] !== ' ')).toBe(true)
  const doing = { ...task('T-504'), kind: 'bug', role: 'tester', origin: { by: 'scout', scout: 'bugs', why: 'w' } } as BoardTask
  const groups = taskStateGroups(doing, { nowMs: T0, autoRetries: 2 })
  expect(groups.map(segText)).toEqual(['▶ doing · worker · ⏱ 25m', 'bug · tester · try 2/4', '⌕ scout bugs'])
  expect(groups[0]![0]).toMatchObject({ color: 'ide', bold: true })
  expect(groupSegLines(groups, 80).map(segText)).toEqual(['▶ doing · worker · ⏱ 25m   bug · tester · try 2/4   ⌕ scout bugs'])
  // narrow: between the groups, never inside one
  expect(groupSegLines(groups, 40).map(segText)).toEqual(['▶ doing · worker · ⏱ 25m', 'bug · tester · try 2/4   ⌕ scout bugs'])
  expect(segText(taskStateGroups(task('T-501'), { nowMs: T0 })[0]!)).toBe('◆ ready for review')
  expect(segText(taskStateGroups(task('T-502'), { nowMs: T0 })[0]!)).toBe('✗ failed')
  expect(taskStateGroups(task('T-502'), { nowMs: T0 })[0]![0]!.color).toBe('error')
  // where it came from
  const from = (origin: unknown) => originShort({ origin })?.text
  expect(from({ by: 'owner', why: 'w' })).toBe('♟ from you')
  expect(from({ by: 'lead', why: 'w' })).toBe('◆ lead')
  expect(from({ by: 'lead', task: 'T-3', how: 'split', why: 'w' })).toBe('↳ from T-3')
  expect(from(undefined)).toBeUndefined()
  // try n/m: the board's automatic retries count; none before the first try
  expect(tryText({ attempts: 1 }, 2)).toBe('try 1/3')
  expect(tryText({ attempts: 0 }, 2)).toBe('')
})

test('core: the buttons pack whole groups on a row, breaking a group only between buttons when it is wider than a row', () => {
  const groups = [[7], [18, 6, 16], [6], [14]]
  expect(packGroups(groups, 140).map(r => r.map(x => `${x.g}.${x.i}`))).toEqual([['0.0', '1.0', '1.1', '1.2', '2.0', '3.0']])
  expect(packGroups(groups, 40).map(r => r.map(x => `${x.g}.${x.i}`))).toEqual([['0.0'], ['1.0', '1.1'], ['1.2', '2.0'], ['3.0']])
  // the page group alone on its own row when there is no room left
  expect(packGroups([[7], [10]], 18).map(r => r.map(x => x.g))).toEqual([[0], [1]])
  // T-775: every button framed the same, whatever its group; a fact is just its words
  expect(pillText({ label: 'Pause' })).toBe('[Pause]')
  expect(pillText({ label: 'Drop' })).toBe('[Drop]')
  expect(pillText({ label: 'Copy' })).toBe('[Copy]')
  expect(pillText({ label: '⏸ paused', fact: true })).toBe('⏸ paused')
})

/** The header Box of a drawn page. */
async function header(ui: { find: (q: object) => Promise<unknown> }, vscode = false) {
  const h = (await ui.find({ key: vscode ? 'vs-page-header' : 'page-header' })) as Node | undefined
  expect(h).toBeDefined()
  return h!
}

// a doing, a review and a failed task, on the terminal, desktop and mobile
const CASES: [string, string, string, string[]][] = [
  ['T-504', '▶ doing · worker · ⏱ 25m', 'ide', ['main pause', 'danger drop', 'page needs-review', 'page copy']],
  ['T-501', '◆ ready for review', 'warning', ['main approve', 'task show-changes', 'danger reject', 'danger drop', 'page needs-review', 'page copy']],
  ['T-502', '✗ failed', 'error', ['main retry', 'task run-now', 'task stash', 'task role', 'task already-merged', 'danger drop', 'page needs-review', 'page copy']],
]
for (const [id, status, color, groups] of CASES)
  for (const surface of ['terminal', 'desktop', 'mobile'] as const)
    test(`T-751: ${id}'s page on ${surface}: the 4 header lines in order, then the thin rule; buttons in groups, words only; keys in the footer`, async ($, on) => {
      seedRich(on, id)
      const ui = await $.ui.mount({ ...PANE, surface })
      const h = await header(ui)
      const parts = kids(h).map(keyOf)
      const rows = parts.filter(k => k?.startsWith('hdr-buttons-'))
      expect(parts).toEqual(['hdr-where', 'hdr-title', 'hdr-state', ...rows, 'hdr-keys', 'hdr-rule'])
      // line 1: Back and the place in the list
      const place = placeIn(LIST, id)!
      expect(textOf(kids(h)[0])).toMatch(new RegExp(`^‹ ${surface === 'terminal' ? '\\[Tasks\\]' : ''} +${id} · ‹ ${place.n} of ${LIST.length} ›$`))
      // line 2: the id in the board orange whatever the status (T-914), the title in bold
      const title = kids(kids(h)[1])[0]!
      expect(kids(title)[0]).toMatchObject({ props: { bold: true, color: 'claude' }, children: [id] })
      // the status keeps its own color on line 3
      expect(kids(kids(kids(h)[2])[0])[0]?.props?.color).toBe(color)
      // line 3: the state (status, step, time; kind · role · try; origin) and no Status/Stage/Now rows in Details
      const state = textOf(kids(h)[2])
      expect(state.startsWith(status)).toBe(true)
      expect(state).toContain('change · worker · try 2/4')
      expect(state).toContain('♟ from you')
      const page = textOf(await ui.drawn())
      for (const gone of ['Status:', 'Stage:', 'Now:']) expect(page, gone).not.toContain(gone)
      // line 4: the buttons in group order (core's taskActions), words only, no key inside one
      const acts = taskActions(task(id))
      expect(acts.map(a => `${a.group} ${a.id}`)).toEqual(groups)
      const pills = rows.flatMap(r => kids(kids(h).find(k => keyOf(k) === r)).filter(n => n.type === 'Button'))
      expect(pills.map(keyOf)).toEqual(acts.map(a => a.id))
      for (const p of pills) {
        expect(p.props?.hotkey, keyOf(p)).toBeUndefined()
        expect(String(p.props?.label), keyOf(p)).not.toMatch(/\([a-z]\)/)
      }
      if (surface === 'terminal') {
        // T-775: every button "[Label]" in the text color, one Text each: no filled pill, no red, no dim plain word
        const inner = (k: string) => kids(pills.find(p => keyOf(p) === k))
        for (const a of acts) {
          expect(inner(a.id).length, a.id).toBe(1)
          expect(textOf(inner(a.id)), a.id).toBe(`[${a.label}]`)
          expect(inner(a.id)[0]?.props, a.id).toEqual({ color: 'text' })
        }
        expect(textOf(inner('needs-review'))).toBe('[☐ Needs review]')
        expect(textOf(inner('copy'))).toBe('[Copy]')
        // Back: the arrow outside, the tab name a button in the same style
        const back = kids(kids(h)[0]).find(n => keyOf(n) === 'back')!
        expect(textOf(back)).toBe('[Tasks]')
        expect(kids(back)[0]?.props).toEqual({ color: 'text' })
      } else {
        for (const p of pills) expect(p.props?.variant, keyOf(p)).toBe('secondary')
        // Back off the terminal: a native secondary Button "Tasks", no brackets, no children (like the other buttons)
        const back = kids(kids(h)[0]).find(n => keyOf(n) === 'back')!
        expect(back.type).toBe('Button')
        expect(back.props?.label).toBe('Tasks')
        expect(back.props?.variant).toBe('secondary')
        expect(back.props?.plain).toBeUndefined()
        expect(kids(back).length).toBe(0)
      }
      // the keys: hidden Buttons, and in the footer
      const hidden = kids(kids(h).find(k => keyOf(k) === 'hdr-keys'))
      expect(hidden.map(b => `${keyOf(b)} ${b.props?.hotkey}`)).toEqual(['back-key b', 'prev-key k', 'next-key j', ...acts.filter(a => a.key).map(a => `${a.id}-key ${a.key}`)])
      const foot = textOf(await ui.find({ key: 'task-keys-footer' }))
      for (const a of acts.filter(x => x.key)) expect(foot).toContain(`${a.key} ${a.word}`)
      expect(foot).toContain('k j prev/next')
      // the thin rule
      expect(textOf(kids(h).at(-1))).toMatch(/^─{50}$/)
      await ui.unmount()
    })

// T-914: the id in the title is always the board orange ('claude'), whatever the task's status, on every surface
for (const [id, status] of [['T-506', 'todo'], ['T-504', 'doing'], ['T-502', 'failed'], ['T-508', 'done'], ['T-509', 'dropped']] as const)
  for (const surface of ['terminal', 'vscode'] as const)
    test(`T-914: a ${status} task's id (${id}) in its page header on ${surface} is the board orange`, async ($, on) => {
      seedRich(on, id)
      const ui = await $.ui.mount({ ...PANE, surface })
      const idText = surface === 'vscode' ? kids(kids(await ui.find({ key: 'vs-head' }))[0])[0] : kids(kids(kids(await header(ui))[1])[0])[0]
      expect(textOf(idText)).toBe(id)
      expect(idText?.props?.color).toBe('claude')
      await ui.unmount()
    })

test('T-751: k and j (and the ‹ › buttons) go to the previous and the next task of the Tasks list, going round at the ends', async ($, on) => {
  seedRich(on, LIST[0]!)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const shown = async () => textOf(kids(await header(ui))[1]).split(' ')[0]
  // a press changes the open page after it returns: draw again to see it
  const press = async (key: string) => (await ui.press({ key }), await ui.redraw())
  expect(await shown()).toBe(LIST[0])
  await press('next-key')
  expect(await shown()).toBe(LIST[1])
  await press('prev-key')
  expect(await shown()).toBe(LIST[0])
  // going round: before the first is the last, and after the last the first
  await press('prev')
  expect(await shown()).toBe(LIST.at(-1))
  await press('next')
  expect(await shown()).toBe(LIST[0])
  // the Back link still goes back to the list
  await press('back')
  expect(await ui.find({ key: 'page-header' })).toBeUndefined()
  await ui.unmount()
})

test('T-751: a narrow terminal page wraps the state and the buttons between groups, never inside a button', async ($, on) => {
  seedRich(on, 'T-502')
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 30 }, surface: 'terminal' })
  const h = await header(ui)
  const rows = kids(h).filter(k => keyOf(k)?.startsWith('hdr-buttons-')).map(textOf)
  expect(rows).toEqual(['[Retry]', '[Run now] [Stash to backlog]', '[Role] [Already merged]', '[Drop]', '[☐ Needs review] [Copy]'])
  for (const r of rows) expect(r.length).toBeLessThanOrEqual(30)
  const state = kids(kids(h)[2]).map(textOf)
  expect(state).toEqual(['✗ failed', 'change · worker · try 2/4', '♟ from you   tests failed'])
  await ui.unmount()
})

test('T-751: in VS Code the same header: Back and a pager, the title, state chips, the buttons in groups (secondary, one style, T-775; the main action primary, T-973), a divider', async ($, on) => {
  seedRich(on, 'T-501')
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const h = await header(ui, true)
  expect(kids(h).map(keyOf)).toEqual(['vs-where', 'vs-head', 'vs-state', 'vs-actions'])
  expect((await ui.find({ key: 'back' }))?.props.label).toBe('Tasks')
  expect(textOf(await ui.find({ key: 'vs-back' }))).toMatch(/^‹/)
  const place = placeIn(LIST, 'T-501')!
  expect(textOf(await ui.find({ key: 'vs-pager' }))).toBe(`${place.n} of ${LIST.length}`)
  const actions = kids(await ui.find({ key: 'vs-actions' }))
  expect(actions.filter(n => n.type === 'Button' || n.type === 'Markdown').map(keyOf)).toEqual(['approve', 'show-changes', 'reject', 'drop', 'needs-review', 'copy'])
  for (const b of actions.filter(n => n.type === 'Button')) {
    expect(b.props?.variant, keyOf(b)).toBe(keyOf(b) === 'approve' ? 'primary' : 'secondary')
    expect(kids(b).length, keyOf(b)).toBe(0)
  }
  expect(actions.find(n => keyOf(n) === 'needs-review')?.type).toBe('Button')
  expect(actions.find(n => keyOf(n) === 'needs-review')?.props?.label).toBe('☐ Needs review')
  // the pager goes to the next task
  await ui.press({ key: 'next' })
  await ui.redraw()
  expect(textOf(await ui.find({ key: 'vs-head' })).startsWith(place.next)).toBe(true)
  await ui.unmount()
})

test('T-751: a task opened from the Live tab says "‹ [Live]" and goes through the Live tab\'s tasks', async ($, on) => {
  seedRich(on, 'T-504', undefined, { tab: 'live' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // T-846: a task in review keeps a lane (at "you"), so the Live tab has two lanes and T-504 is the second
  expect(textOf(kids(await header(ui))[0])).toMatch(/^‹ \[Live\] +T-504 · ‹ 2 of 2 ›$/)
  expect(await ui.find({ key: 'next-key' })).toBeDefined()
  await ui.unmount()
})

for (const surface of ['terminal', 'desktop', 'mobile', 'vscode'] as const)
  test(`T-751: a scout's page on ${surface}: the same header (‹ [Scouts] and its place, name and summary, state, buttons, rule); j goes to the next scout`, async ($, on) => {
    seedScouts(on, 'scouts', 'docs-drift')
    const names = scoutListNames(SCOUTS as never)
    const place = placeIn(names, 'docs-drift')!
    const ui = await $.ui.mount({ ...PANE, surface })
    const vs = surface === 'vscode'
    const h = await header(ui, vs)
    if (!vs) {
      const parts = kids(h).map(keyOf)
      expect(parts).toEqual(['hdr-where', 'hdr-title', 'hdr-state', 'hdr-buttons-0', 'hdr-keys', 'hdr-rule'])
      if (surface !== 'terminal') {
        const back = kids(kids(h)[0]).find(n => keyOf(n) === 'scout-back')!
        expect(back.props?.label).toBe('Scouts')
        expect(back.props?.variant).toBe('secondary')
        expect(kids(back).length).toBe(0)
      }
      expect(textOf(kids(h)[0])).toMatch(new RegExp(`^‹ ${surface === 'terminal' ? '\\[Scouts\\]' : '(Scouts)?'} +docs-drift · ‹ ${place.n} of ${names.length} ›$`))
      expect(textOf(kids(h)[1]).replace(/\s+/g, ' ')).toBe('docs-drift Finds places where the guide no longer matches what the code does')
      expect(textOf(kids(h)[2])).toMatch(/^◷ every hour/)
      // the buttons it had (Run now, Edit, Resume, all "[Label]", T-775) and paused said as a fact
      const row = kids(kids(h)[3])
      expect(row.filter(n => n.type === 'Button').map(keyOf)).toEqual(['scout-run', 'scout-edit', 'scout-pause'])
      expect(textOf(kids(h)[3])).toMatch(surface === 'terminal' ? /^\[Run now\]   \[Edit\]   \[Resume\] ⏸ paused$/ : /⏸ paused$/)
      expect(kids(kids(h).find(k => keyOf(k) === 'hdr-keys')).map(b => b.props?.hotkey)).toEqual(['b', 'k', 'j', 'r', 'e', 'p'])
      expect(textOf(await ui.find({ key: 'scout-keys-footer' }))).toContain('k j prev/next')
      await ui.press({ key: 'next-key' })
      await ui.redraw()
    } else {
      expect(kids(h).map(keyOf)).toEqual(['vs-where', 'vs-head', 'vs-state', 'vs-actions'])
      expect((await ui.find({ key: 'scout-back' }))?.props.label).toBe('Scouts')
      for (const b of kids(await ui.find({ key: 'vs-actions' })).filter(n => n.type === 'Button')) expect(b.props?.variant, keyOf(b)).toBe(keyOf(b) === 'scout-run' ? 'primary' : 'secondary')
      await ui.press({ key: 'next' })
      await ui.redraw()
    }
    expect(textOf(await ui.find({ key: vs ? 'vs-head' : 'hdr-title' })).startsWith(place.next)).toBe(true)
    await ui.unmount()
  })
