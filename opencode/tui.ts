// symcc's OpenCode 2.x TUI plugin entry (T-462, T-466): the board panel (session.panel) and the band above the prompt
// (session.composer.top), drawn from the view file the server part writes (see hooks/opencode/tui.ts). Solid and
// OpenTUI's Solid renderer are OpenCode's own copies, loaded when the TUI starts the plugin (named in variables, so
// symcc's type check needs neither installed).
import { readFile } from 'node:fs/promises'
import { startTui, type TuiContext, type TuiRuntime } from '../hooks/opencode/tui'

const SOLID = 'solid-js'
const OPENTUI_SOLID = '@opentui/solid'

export default {
  id: 'symcc',
  async setup(ctx: TuiContext) {
    const solid = (await import(SOLID)) as Pick<TuiRuntime, 'createSignal'>
    const tui = (await import(OPENTUI_SOLID)) as Pick<TuiRuntime, 'createElement' | 'setProp' | 'insert'>
    const runtime: TuiRuntime = { createSignal: solid.createSignal, createElement: tui.createElement, setProp: tui.setProp, insert: tui.insert }
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
