// T-954: the task page's Run now button (key e) on the terminal and in VS Code. A task that waits on unfinished tasks
// asks "T-5 waits on T-3 (to do). Start anyway?" first, with Start anyway / Cancel (Cancel has the focus): Cancel
// closes it and runs nothing; Start anyway runs it (the engine side is in run-now.test.tsx).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { PANE } from './board-fixture'
import { seedRich } from './task-page-fixture'

for (const surface of ['terminal', 'vscode'] as const)
  test(`T-954: Run now on T-506's page on ${surface} asks "Start anyway?" (it waits on T-498); Cancel runs nothing, Start anyway runs it`, async ($, on) => {
    const toasts: string[] = []
    seedRich(on, 'T-506', undefined, {}, toasts)
    const ui = await $.ui.mount({ ...PANE, surface })
    const box = surface === 'terminal' ? 'run-now-box' : 'vs-run-now'
    expect((await ui.find({ key: 'run-now' }))?.props.label).toBe('Run now')
    if (surface === 'terminal') {
      // its key: a hidden Button with hotkey e, and "e run now" in the footer
      expect((await ui.find({ key: 'run-now-key' }))?.props.hotkey).toBe('e')
      expect((await ui.find({ key: 'task-keys-footer' }))?.text).toContain('e run now')
    }
    expect(await ui.find({ key: box })).toBeUndefined()
    await ui.press({ key: 'run-now' })
    expect((await ui.find({ key: box }))?.text).toContain('T-506 waits on T-498 (to do). Start anyway?')
    expect((await ui.find({ key: 'run-now-yes' }))?.props.label).toBe('Start anyway')
    const cancel = await ui.find({ key: 'run-now-cancel' })
    expect(cancel?.props.label).toBe('Cancel')
    expect(cancel?.props.autoFocus).toBe(true)
    // Cancel: the question goes, nothing ran
    await ui.press({ key: 'run-now-cancel' })
    expect(await ui.find({ key: box })).toBeUndefined()
    expect(toasts).toEqual([])
    // Start anyway: the question goes and the run tool answers (its words in a toast)
    await ui.press({ key: 'run-now' })
    await ui.press({ key: 'run-now-yes' })
    expect(await ui.find({ key: box })).toBeUndefined()
    expect(toasts.some(t => t.includes('T-506'))).toBe(true)
    await ui.unmount()
  })
