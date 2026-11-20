// T-508: with symcc disabled, OpenCode's board panel header says how to turn it back on in words, with the command in
// its own color (the accent 'ide', bold), as the terminal and VS Code boards do; and its band shows nothing.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { panelLines, bandLines, lineText, type ViewFile } from '../hooks/opencode/board-view'
import type { PaneView } from '../hooks/app/state'

const NOW = Date.parse('2026-11-19T10:00:00.000Z')

const viewFile = (view: Partial<PaneView>): ViewFile => ({
  root: '/Users/me/repositories/rubrica',
  home: '/Users/me',
  name: 'symcc',
  version: '0.4.1',
  written_at: NOW,
  view: { tasks: [], working: [], scouts: [], mode: 'auto', test_commands: [], ...view } as PaneView,
})

test('OpenCode panel, symcc disabled: the header reads "symcc is disabled · /symcc-enable to turn it back on", the command in its own color', () => {
  const f = viewFile({ enabled: false, tasks: [{ id: 'T-1', title: 'Add search', status: 'todo' }] as never[] })
  const head = panelLines(f, { cursor: 0, opened: '' }, NOW, 100).lines[0]!
  expect(lineText(head)).toMatch(/symcc is disabled · \/symcc-enable to turn it back on$/)
  expect(lineText(head)).not.toMatch(/symcc off|symcc: symcc/)
  expect(head.slice(-3)).toEqual([
    { text: 'symcc is disabled · ', color: 'warning' },
    { text: '/symcc-enable', color: 'ide', bold: true },
    { text: ' to turn it back on', color: 'warning' },
  ])
  // the band above the prompt shows nothing while symcc is disabled
  expect(bandLines(f, NOW, 100)).toEqual([])
  // enabled: no disabled words in the header
  const on = panelLines(viewFile({ enabled: true }), { cursor: 0, opened: '' }, NOW, 100).lines[0]!
  expect(lineText(on)).not.toMatch(/is disabled|symcc-enable/)
})
