// T-829: a task page opened on a task the board view slimmed (old done task) reads its details and history from its
// parts file; the stored view stays slim.
import type { On } from 'claude-code'
import { expect, type Engine } from 'claude-code/testing'
import { test } from './reset'
import { PANE, drawnData, seedBoard } from './board-fixture'
import { RICH_TASKS } from './task-page-fixture'
import { readText } from './fakes'
import { partsFileOf, partsText, viewTask } from '../hooks/core/board-parts'

const DETAILS_WORDS = 'Group the details under clear headings'
const HISTORY_WORDS = 'fixed the headings and wrapped every line'

async function open(on: On, $: Engine, id: string, slim: boolean, surface: 'terminal' | 'vscode') {
  const whole = RICH_TASKS.find(t => t.id === id)!
  const shown = slim ? viewTask(whole as never) : whole
  const view = { shape: 'view-1', value: { tasks: [shown], working: [], scouts: [], mode: 'auto', branch: 'main', test_commands: [] } }
  seedBoard(on, { opened: id, view })
  on('fs.read', (_, e, next) => (new RegExp(`\\.symcc/${partsFileOf(id).replace('.', '\\.')}$`).test(e.path) ? readText(partsText({ [id]: whole as never })) : next(e)))
  on('fs.exists', () => ({ value: false }))
  const ui = await $.ui.mount({ ...PANE, surface })
  const text = JSON.stringify(drawnData(await ui.drawn()))
  await ui.unmount()
  return { text, view, shown }
}

for (const surface of ['terminal', 'vscode'] as const) {
  test(`${surface}: a slimmed done task's page shows its details and history, and the view stays slim`, async ($, on) => {
    const r = await open(on, $, 'T-508', true, surface)
    expect('details' in r.shown).toBe(false)
    expect(r.text).toContain(DETAILS_WORDS)
    expect(r.text).toContain(HISTORY_WORDS)
    expect(JSON.stringify(r.view)).not.toContain(DETAILS_WORDS)
    expect('details' in r.shown).toBe(false)
  })

  test(`${surface}: an open task's page is unchanged`, async ($, on) => {
    const r = await open(on, $, 'T-504', false, surface)
    expect(r.text).toContain(DETAILS_WORDS)
  })
}
