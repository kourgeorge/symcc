// T-1136: the board banner in a folder whose subfolders are their own repos says "workspace of several repos"
// (no "no git repo here", no Set up git button); an empty folder keeps the button.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { PANE, BOARD_VIEW, seedBoard } from './board-fixture'

const WS = "This looks like a workspace of several repos; symcc can't run a board over several repos yet. Open Claude Code in one repo instead."

for (const surface of ['terminal', 'vscode'] as const)
  test(`T-1136: ${surface} banner: a workspace folder shows the workspace text and no Set up git; an empty folder keeps the button`, async ($, on) => {
    seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, git_state: 'no-repo', git_workspace: WS, branch_note: '' } }, tab: 'tasks' })
    const ui = await $.ui.mount({ ...PANE, surface })
    const row = await ui.find({ key: 'banner-git' })
    expect(row).toBeDefined()
    expect(JSON.stringify(await ui.drawn())).toContain('workspace of several repos')
    expect(await ui.find({ key: 'setup-git' })).toBeUndefined()
    expect(JSON.stringify(await ui.drawn())).not.toContain('set up git')
    await ui.unmount()
  })

for (const surface of ['terminal', 'vscode'] as const)
  test(`T-1136: ${surface} banner: an empty folder (no repo) shows Set up git`, async ($, on) => {
    seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, git_state: 'no-repo' } }, tab: 'tasks' })
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'setup-git' }))?.props.label).toContain('Set up git')
    await ui.unmount()
  })
