// T-829: a task page opened on a task the board view slimmed (old done task) reads its details and timeline from its
// parts file; the stored view stays slim.
import type { On } from 'claude-code'
import { expect, type Engine } from 'claude-code/testing'
import { test } from './reset'
import { PANE, drawnData, seedBoard } from './board-fixture'
import { RICH_TASKS } from './task-page-fixture'
import { readText } from './fakes'
import { partsFileOf, partsText, viewStubFilled, viewTask } from '../hooks/core/board-parts'
import { slimView } from '../hooks/core/view-slim'
import type { SymccView } from '../types'

const DETAILS_WORDS = 'Group the details under clear headings'
const TIMELINE_WORDS = 'fixed the headings'

/** The task updated a minute before the real now (T-891: before it, the view kept such a finished task whole). */
const JUST = new Date(Date.now() - 60_000).toISOString()

async function open(on: On, $: Engine, id: string, slim: boolean | 'view', surface: 'terminal' | 'vscode', fresh = false) {
  const given = RICH_TASKS.find(t => t.id === id)!
  const whole = fresh ? { ...given, updated_at: JUST } : given
  // 'view': the task as the published view keeps it (slimView), finished just now
  const shown = slim === 'view' ? slimView({ tasks: [whole], working: [], scouts: [], mode: 'auto', test_commands: [] } as unknown as SymccView).tasks[0]! : slim ? viewStubFilled(viewTask(whole as never)) : whole
  const view = { shape: 'view-1', value: { tasks: [shown], working: [], scouts: [], mode: 'auto', home_branch: 'main', test_commands: [] } }
  const stored: string[] = []
  // every value the panel saves into its stored state is recorded on its way through seedBoard's own handler
  const recording = ((name: string, fn: (...a: never[]) => unknown) =>
    name === 'state.set' ? on(name as never, ((c: unknown, e: { value: unknown }, next: (e: unknown) => unknown) => (stored.push(JSON.stringify(e.value)), (fn as Function)(c, e, next))) as never) : on(name as never, fn as never)) as unknown as On
  seedBoard(recording, { opened: id, view })
  on('fs.read', (_, e, next) => (new RegExp(`\\.symcc/${partsFileOf(id).replace('.', '\\.')}$`).test(e.path) ? readText(partsText({ [id]: whole as never })) : next(e)))
  on('fs.exists', () => ({ value: false }))
  const ui = await $.ui.mount({ ...PANE, surface })
  const text = JSON.stringify(drawnData(await ui.drawn()))
  await ui.unmount()
  return { text, view, shown, stored }
}

/** Each surface and task's page drawn from the whole task, to compare the slim one with. */
const wholePage = new Map<string, string>()

for (const surface of ['terminal', 'vscode'] as const) {
  test(`${surface}: a slimmed done task's page shows its details and timeline, and the view stays slim`, async ($, on) => {
    const r = await open(on, $, 'T-508', true, surface)
    expect((r.shown as { details?: string }).details).toBe('')
    expect(r.text).toContain(DETAILS_WORDS)
    expect(r.text).toContain(TIMELINE_WORDS)
    expect(r.stored.join('\n')).not.toContain(DETAILS_WORDS)
    expect(r.stored.join('\n')).not.toContain(TIMELINE_WORDS)
  })

  // T-891: a task finished just now is slimmed in the view too; its page (timeline, details, tries, report) is the same as from the whole task
  // (a page can be mounted once per test: the whole task's page is drawn in a test of its own, just before)
  for (const id of ['T-508', 'T-509']) {
    test(`${surface}: the page of ${id} drawn from the whole task`, async ($, on) => {
      wholePage.set(`${surface} ${id}`, (await open(on, $, id, false, surface, true)).text)
      expect(wholePage.get(`${surface} ${id}`)).toContain(DETAILS_WORDS)
    })
    test(`${surface}: the page of ${id}, just finished, is the same from the slim view as from the whole task`, async ($, on) => {
      const r = await open(on, $, id, 'view', surface, true)
      expect(Date.now() - Date.parse(String((r.shown as { updated_at?: string }).updated_at))).toBeLessThan(10 * 60_000)
      expect((r.shown as { details?: string }).details).toBe('')
      expect(r.stored.join('\n')).not.toContain(DETAILS_WORDS)
      expect(r.text).toContain(DETAILS_WORDS)
      expect(r.text).toContain(TIMELINE_WORDS)
      expect(r.text === wholePage.get(`${surface} ${id}`)).toBe(true)
    })
  }

  test(`${surface}: an open task's page is unchanged`, async ($, on) => {
    const r = await open(on, $, 'T-504', false, surface)
    expect(r.text).toContain(DETAILS_WORDS)
  })
}
