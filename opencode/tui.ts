// symcc's OpenCode 2.x TUI plugin entry (T-462, T-466): the board panel (session.panel) and the band above the prompt
// (session.composer.top), drawn from the view file the server part writes (see hooks/opencode/tui.ts). Solid and
// OpenTUI's Solid renderer are OpenCode's own copies (T-500): nothing is installed next to this file, OpenCode 2.3's
// TUI swaps the plain names 'solid-js' and '@opentui/solid' in a plugin's files for its own modules, so the same Solid
// runs the TUI and this board. Keep the names written out in the import() calls below: a name in a variable is not
// swapped and fails with "Cannot find package". This file is apart from server.ts, so a failure here never stops the
// server part (lead, tools, workers). hooks/opencode/opentui.d.ts types the two names for symcc's type check.
import { readFile } from 'node:fs/promises'
import { startTui, loadTuiRuntime, type TuiContext } from '../hooks/opencode/tui'

export default {
  id: 'symcc',
  async setup(ctx: TuiContext) {
    const runtime = await loadTuiRuntime({ solid: () => import('solid-js'), opentui: () => import('@opentui/solid') })
    const board = startTui(ctx, {
      runtime,
      readText: path => readFile(path, 'utf8'),
      every: (ms, fn) => {
        const t = setInterval(fn, ms)
        return () => clearInterval(t)
      },
      now: () => Date.now(),
    })
    return () => board.stop()
  },
}
