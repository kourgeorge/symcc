// T-1105: a setting's box (terminal pick list, number box) starts with its one-sentence description in dim text, an empty
// line, then the choices, each with a dim note; the words come from core's setting-notes list; at 80 columns nothing is
// wider than the box. VS Code's and OpenCode's views are checked in vscode-scouts-settings.test.tsx and opencode-tui.spec.ts.
import { expect, type Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { test } from './reset'
import { PANE, drawnData } from './board-fixture'
import { SCENES } from './scouts-settings-scenes'
import { SETTINGS, settingChoices, settingShown } from '../hooks/board'
import { choiceNote, pickBoxParts, settingAbout, wrapWords } from '../hooks/core/setting-notes'
import { textWidth } from '../hooks/core/width'

type Node = { type?: string; key?: string; props?: Record<string, unknown>; children?: unknown[] }
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
const textOf = (n: Node): string => (n.children ?? []).map(c => (typeof c === 'string' ? c : textOf(c as Node))).join('')
/** The box under setting `name`: its Box element (border round) holding the key. */
const boxWith = (tree: unknown, key: string) => elements(tree).find(n => n.type === 'Box' && n.props?.borderStyle === 'round' && elements(n).some(e => e.props?.key === key))

const scene = (name: string) => SCENES.find(s => s.name === name)!

async function drawBox(name: string, key: string, columns: number, $: Engine, on: On) {
  const sc = scene(name)
  sc.seed(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: columns } })
  await sc.go(ui as never)
  const box = boxWith(drawnData(await ui.drawn()), key)
  await ui.unmount()
  return box
}

test('the Mode pick box: the description in dim text first, an empty line, then each choice with its dim note', async ($, on) => {
  const box = (await drawBox('settings pick mode', 'pick:paused', 80, $, on))!
  expect(box).toBeDefined()
  const rows = (box.children ?? []) as Node[]
  const texts = rows.map(r => (r.type === 'Text' ? textOf(r) : elements(r).filter(e => e.type === 'Text').map(textOf).join('|')))
  const about = wrapWords(settingAbout('mode'), 76)
  expect(texts.slice(0, about.length)).toEqual(about)
  for (const r of rows.slice(0, about.length)) expect(r.props?.color).toBe('inactive')
  expect(texts[about.length]).toBe(' ')
  const joined = texts.join('\n')
  for (const m of ['paused', 'review', 'auto']) expect(joined).toContain(choiceNote('mode', m))
  expect(choiceNote('mode', 'paused')).toBe('nothing starts; running work stops')
  // the notes are dim, and come after the choice itself
  const notes = elements(box).filter(e => e.type === 'Text' && Object.values(['paused', 'review', 'auto']).some(m => textOf(e).includes(choiceNote('mode', m))))
  expect(notes.length).toBe(3)
  for (const n of notes) expect(n.props?.color).toBe('inactive')
  const cancel = rows.findIndex(r => r.props?.key === 'setting-cancel')
  expect(cancel).toBe(rows.length - 2)
  expect(cancel).toBeGreaterThan(about.length + 3)
  expect(joined).toContain('Enter picks · x cancels')
})

test('a number box (Workers at once): the description with its range, then the input', async ($, on) => {
  const box = (await drawBox('settings edit max_parallel', 'setting-edit', 80, $, on))!
  expect(box).toBeDefined()
  const first = (box.children ?? [])[0] as Node
  expect(textOf(first)).toBe(settingAbout('max_parallel'))
  expect(textOf(first)).toContain('1-8')
  expect(first.props?.color).toBe('inactive')
})

test('the words come from the one shared list: every setting has a description, every choice a note', () => {
  expect(settingAbout('test_minutes')).toContain('1-120 minutes')
  for (const x of SETTINGS) expect(settingAbout(x.name), x.name).not.toBe('')
  for (const name of ['mode', 'notify', 'scout_findings', 'tests_with_changes'])
    for (const c of settingChoices(name, ['voice', 'sound 1', 'sound 2', 'sound 3', 'off'])) expect(choiceNote(name, c), `${name} ${c}`).not.toBe('')
  expect(settingShown('mode', 'review')).toBe('approve merge')
})

test('the pick box fits 80 columns: the note shares the line when it fits, else wraps under the choice', () => {
  for (const inner of [76, 40, 24]) {
    for (const name of ['mode', 'notify', 'scout_findings', 'tests_with_changes']) {
      const { about, rows } = pickBoxParts(name, settingChoices(name, ['voice', 'sound 1', 'sound 2', 'sound 3', 'off']), inner)
      for (const l of about) expect(textWidth(l), `${name} about`).toBeLessThanOrEqual(inner)
      for (const r of rows) {
        const lines = r.inline ? [`[ ○ ${r.label} ]${r.pad}${r.note[0] ?? ''}`, ...r.note.slice(1).map(t => `  ${t}`)] : r.note.map(t => `  ${t}`)
        for (const l of lines) expect(textWidth(l), `${name} ${r.value} at ${inner}`).toBeLessThanOrEqual(Math.max(inner, 14))
      }
    }
  }
  const mode = pickBoxParts('mode', ['paused', 'review', 'auto'], 76)
  expect(mode.rows.every(r => r.inline)).toBe(true)
  expect(pickBoxParts('mode', ['paused', 'review', 'auto'], 30).rows.every(r => !r.inline)).toBe(true)
})
