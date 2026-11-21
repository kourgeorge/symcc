// T-700: the one rule every board (the terminal panel, VS Code's side panel, OpenCode's panel) uses for when the board
// header shows (the banner with its tests/limits line and drive warning, then the tabs row): only on the list pages.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { showsHeader, type BoardPage } from '../hooks/board'

test('T-700: showsHeader: the header on the Tasks, Live, Scouts and Settings lists and the Roles, Kinds and org-mem lists; never on a page of one thing', () => {
  const lists: BoardPage[] = ['tasks', 'live', 'scouts', 'settings', 'roles', 'kinds', 'orgmem']
  const pages: BoardPage[] = ['task', 'question', 'scout', 'scout-run', 'scout-edit', 'role', 'role-edit', 'role-prompt', 'kind', 'kind-edit']
  for (const p of lists) expect([p, showsHeader(p)]).toEqual([p, true])
  for (const p of pages) expect([p, showsHeader(p)]).toEqual([p, false])
})
