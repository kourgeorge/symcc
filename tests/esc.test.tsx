// Esc in the board panel (T-150): one step back on every page; on the board list with no search it closes.
// Claude Code turns the person's Esc into `ui.close` with origin person, which a test can't raise (the test's
// `$` has no ui.close, and a hook's `$` is the test's own, not the plugin's). So these check escStep, what the
// ui.close hook decides from the page and the open boxes; escBack applying it, and takeKeysBack asking for
// the keyboard back, need a real panel.
import { expect, test } from 'claude-code/testing'
import { escStep, escGoesBack, type EscStep, type PanePlace } from '../hooks/plugin/ui/esc'
import { scoutListKeys, settingsKeys } from '../hooks/board'

type Boxes = Parameters<typeof escStep>[1]
const NONE: Boxes = { settingEdit: null, settingPick: null, draft: null, naming: null, rolePick: null, rejecting: null, diffOpen: null, answering: null, search: null }
const at = (o: Partial<PanePlace> = {}): PanePlace => ({ tab: '', opened: '', scout: '', ...o })
const draft = { scout: 'bugs', isNew: false, every: '30', model: '', body: '', error: '' } as unknown as Boxes['draft']

const CASES: [string, PanePlace, Partial<Boxes>, EscStep][] = [
  // the board list
  ['board list, search box open', at(), { search: { text: 'not', typing: true } }, 'clear search'],
  ['board list, search kept', at({ tab: 'tasks' }), { search: { text: 'not', typing: false } }, 'clear search'],
  ['board list, no search', at(), {}, null],
  ['board list on the tasks tab, no search', at({ tab: 'tasks' }), {}, null],
  // a task page
  ['task page', at({ opened: 'T-5' }), {}, 'board list'],
  ['task page, a search kept on the list', at({ opened: 'T-5' }), { search: { text: 'x', typing: false } }, 'board list'],
  ['task page, reject box', at({ opened: 'T-5' }), { rejecting: { task: 'T-5', reason: '' } }, 'cancel reject'],
  ['task page, role pick list', at({ opened: 'T-5' }), { rolePick: { task: 'T-5', options: ['general'] } }, 'cancel role pick'],
  ['task changes', at({ opened: 'T-5' }), { diffOpen: { task: 'T-5', file: '' } }, 'close changes'],
  ['task changes, reject box over them', at({ opened: 'T-5' }), { diffOpen: { task: 'T-5', file: '' }, rejecting: { task: 'T-5', reason: '' } }, 'cancel reject'],
  ['waiting task, "Your answer" opened with Answer…', at({ opened: 'T-6' }), { answering: 'T-6' }, 'cancel answer'],
  ['waiting task, Answer… pressed on another task', at({ opened: 'T-6' }), { answering: 'T-2' }, 'board list'],
  // Scouts
  ['Scouts list', at({ tab: 'scouts' }), {}, 'board list'],
  ['Scouts list, new scout name box', at({ tab: 'scouts' }), { naming: { name: 'x', error: '' } }, 'cancel scout edit'],
  ['scout page', at({ tab: 'scouts', scout: 'bugs' }), {}, 'scouts list'],
  ["scout's edit page", at({ tab: 'scouts', scout: 'bugs' }), { draft }, 'cancel scout edit'],
  // Settings
  ['Settings', at({ tab: 'settings' }), {}, 'board list'],
  ["Settings, a setting's edit box", at({ tab: 'settings' }), { settingEdit: { name: 'max_parallel', value: '3', error: '' } }, 'cancel setting'],
  ["Settings, a setting's pick list", at({ tab: 'settings' }), { settingPick: { name: 'mode', options: ['review', 'auto'] } }, 'cancel setting'],
]

for (const [name, place, boxes, step] of CASES)
  test(`Esc on the ${name}: ${step ?? 'closes the panel'}`, () => {
    expect(escStep(place, { ...NONE, ...boxes })).toBe(step)
  })

test('the Scouts list and Settings say "Esc back"; their other keys are kept', () => {
  expect(escGoesBack(scoutListKeys()).map(k => `${k.key} ${k.word}`)).toEqual(['Enter open', 't s c views', 'Esc back'])
  expect(escGoesBack(settingsKeys()).map(k => `${k.key} ${k.word}`)).toEqual(['Enter change', '↑↓ move', 't s c views', 'Esc back'])
})
