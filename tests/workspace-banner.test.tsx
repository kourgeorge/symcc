// T-1136/T-1199: a folder with no repo shows the Set up git button (the old several-repos text is gone).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { PANE, BOARD_VIEW, seedBoard } from './board-fixture'

for (const surface of ['terminal', 'vscode'] as const)
  test(`T-1136: ${surface} banner: an empty folder (no repo) shows Set up git`, async ($, on) => {
    seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, git_state: 'no-repo' } }, tab: 'tasks' })
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'setup-git' }))?.props.label).toContain('Set up git')
    await ui.unmount()
  })
