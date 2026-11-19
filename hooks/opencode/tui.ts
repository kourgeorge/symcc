// symcc's OpenCode TUI part (T-466): what opencode/tui.ts exports. OpenCode runs it in its TUI, apart from the server
// part that runs symcc's engine, so it draws from the view file the engine writes on every publish
// (.<name>/view.json, see view.ts), read again every second, and sends the owner's actions back as symcc's slash
// commands in the TUI's session (approve, reject, answer: board-view.ts's actionCommand). It claims two places of
// OpenCode's screen (docs/research/opencode-spike-can-a-small-symcc-plugin-refuse-edits-start-a.md, point 4):
//   - session.panel: the board (opened with ui.panel.open(BOARD_PANEL), from the "/symcc" keymap command): the task
//     list grouped by state, with the terminal list's marks, short states and times, and a task's (or question's)
//     page when one is opened;
//   - session.composer.top: the band above the prompt, like Claude Code's (the header line, then the questions, and
//     the tasks that need the owner or run).
// What is drawn comes from board-view.ts (bandLines, panelLines), made with hooks/core's helpers; this file only
// turns those lines into OpenTUI elements (box and text) with Solid signals, and wires the keys. OpenCode's TUI
// modules (Solid and OpenTUI's Solid renderer) are passed in (TuiRuntime), so this file type-checks and its tests
// run without them. The names and shapes below are @opencode/plugin 2.3.0's tui Context (only what is used).
import { DEFAULT_NAME, dataDir } from '../name'
import { VIEW_FILE, parseViewFile, bandLines, panelLines, panelKeys, answerOptions, actionCommand, moveCursor, OWN_ANSWER, type ViewFile, type Line, type PanelAction } from './board-view'

/** The panel's name for ui.panel.open (OpenCode shows the session.panel claims for the open name). */
export const BOARD_PANEL = 'symcc.board'

/** How often the view file is read again (and the times redrawn), in ms. */
export const REFRESH_MS = 1000

/** A node of OpenTUI's Solid renderer (a box or a text). */
export type TuiNode = unknown

/** The modules of OpenCode's TUI that this part uses: Solid's signals, and OpenTUI's Solid renderer's element calls
 *  (the calls compiled JSX makes: createElement, setProp, insert). */
export type TuiRuntime = {
  createSignal: <T>(value: T) => [() => T, (value: T) => void]
  createElement: (tag: string) => TuiNode
  setProp: (node: TuiNode, name: string, value: unknown) => void
  insert: (parent: TuiNode, value: unknown) => void
}

/** The session.panel slot's input (PanelInput): the panel's session, width and focus. */
export type TuiPanelInput = { readonly name: string; readonly sessionID: string; readonly width: number; readonly focused: boolean; readonly close: () => void }

/** One keymap command (KeymapCommand), as far as symcc uses it. */
export type TuiKeyCommand = {
  readonly id?: string
  readonly title?: string
  readonly description?: string
  readonly group?: string
  readonly bind?: false | string
  readonly palette?: true
  readonly slash?: { readonly name: string; readonly aliases?: string[] }
  readonly run: (input?: string) => void | false | Promise<void>
}

/** The parts of the tui Context (@opencode/plugin/tui's Context) symcc uses. */
export type TuiContext = {
  readonly location: { readonly directory: string } | undefined
  readonly theme: unknown
  readonly renderer: { readonly width?: number }
  readonly client: { readonly session: { readonly command: (input: { sessionID: string; name: string; text: string }) => Promise<void> } }
  readonly keymap: { readonly layer: (factory: () => { readonly enabled?: boolean | (() => boolean); readonly priority?: number; readonly commands?: readonly TuiKeyCommand[] }) => void }
  readonly ui: {
    readonly toast: { show: (o: { readonly title?: string; readonly message: string; readonly variant?: 'info' | 'success' | 'warning' | 'error' }) => void }
    readonly dialog: {
      prompt: (o: { readonly title: string; readonly description?: string; readonly placeholder?: string }) => Promise<string | undefined>
      select: <V>(o: { readonly title: string; readonly options: readonly { readonly title: string; readonly value: V }[] }) => Promise<V | undefined>
    }
    readonly panel: { open: (name: string) => boolean; close: () => void; current: () => { readonly name: string; readonly sessionID: string } | undefined }
    readonly slot: (claim: { readonly append: 'session.panel'; readonly render: (input: TuiPanelInput) => TuiNode } | { readonly append: 'session.composer.top'; readonly render: (input: { readonly sessionID: string }) => TuiNode }) => () => void
  }
}

/** What the TUI part needs besides its context: the runtime, reading a file, a timer and the clock (tests fake them). */
export type TuiDeps = {
  runtime: TuiRuntime
  /** a file's text; rejects when it can't be read */
  readText: (path: string) => Promise<string>
  every: (ms: number, fn: () => void) => () => void
  now: () => number
  /** the plugin's name (default: symcc) */
  name?: string
}

/** The OpenCode theme's color for one of core's color names, else a plain fallback (a theme field may be missing). */
const THEME_KEY: Record<string, [string, string]> = {
  ide: ['primary', '#5c9cf5'],
  claude: ['accent', '#d7875f'],
  text: ['text', '#d0d0d0'],
  inactive: ['textMuted', '#808080'],
  subtle: ['borderSubtle', '#555555'],
  warning: ['warning', '#e5c07b'],
  yellow: ['warning', '#e5c07b'],
  error: ['error', '#e06c75'],
  red: ['error', '#e06c75'],
  success: ['success', '#98c379'],
  green: ['success', '#98c379'],
  cyan: ['info', '#56b6c2'],
  suggestion: ['secondary', '#c678dd'],
  permission: ['secondary', '#c678dd'],
  autoAccept: ['success', '#98c379'],
}

/** The fg color for a core color name in theme `theme`. */
export function colorOf(theme: unknown, name: string): unknown {
  const [key, fallback] = THEME_KEY[name] ?? ['text', '#d0d0d0']
  const t = theme && typeof theme === 'object' ? (theme as Record<string, unknown>)[key] : undefined
  return t ?? fallback
}

/** OpenTUI's bold text attribute (TextAttributes.BOLD). */
const BOLD = 1

/** Lines as OpenTUI elements: a column box with one row box per line, a text per colored piece. */
export function drawLines(r: TuiRuntime, theme: unknown, lines: Line[]): TuiNode {
  const col = r.createElement('box')
  r.setProp(col, 'flexDirection', 'column')
  r.insert(
    col,
    lines.map(line => {
      const row = r.createElement('box')
      r.setProp(row, 'flexDirection', 'row')
      r.insert(
        row,
        line.map(seg => {
          const text = r.createElement('text')
          r.setProp(text, 'fg', colorOf(theme, seg.color))
          if (seg.bold) r.setProp(text, 'attributes', BOLD)
          r.insert(text, seg.text)
          return text
        }),
      )
      return row
    }),
  )
  return col
}

/** The view file's folders to look in: `dir` and each folder above it (a worker's folder is inside the main one's). */
export function viewPaths(dir: string, name: string = DEFAULT_NAME): string[] {
  const out: string[] = []
  let d = dir.replace(/\/+$/, '') || '/'
  for (;;) {
    out.push(`${d === '/' ? '' : d}/${dataDir(name)}/${VIEW_FILE}`)
    if (d === '/' || !d.includes('/')) break
    d = d.slice(0, d.lastIndexOf('/')) || '/'
  }
  return out
}

/** The first view file found from `dir` upwards, read and parsed; null when there is none. */
export async function readViewFile(dir: string, readText: TuiDeps['readText'], name?: string): Promise<ViewFile | null> {
  for (const p of viewPaths(dir, name)) {
    const text = await readText(p).catch(() => null)
    if (text !== null) return parseViewFile(text)
  }
  return null
}

/** What a started TUI part holds, for its cleanup and the tests. */
export type TuiBoard = {
  /** reads the view file again now */
  refresh: () => Promise<void>
  /** the panel's state: the open task ('' = the list) and the cursor */
  state: () => { opened: string; cursor: number }
  /** runs one of the panel's keys, as the keymap does */
  press: (key: PanelKey, sessionID: string) => Promise<void>
  stop: () => void
}

/** The panel's keys (see panelKeys for which ones each page offers). */
export type PanelKey = 'up' | 'down' | 'open' | 'back' | 'a' | 'x'

/** The keymap bindings of the panel's keys. */
const KEY_BINDS: Record<PanelKey, string> = { up: 'up,k', down: 'down,j', open: 'return', back: 'b,left', a: 'a', x: 'x' }

/** Starts the TUI part: the band and the board panel, the keys, and the timer that reads the view file. */
export function startTui(ctx: TuiContext, d: TuiDeps): TuiBoard {
  const r = d.runtime
  const name = d.name ?? DEFAULT_NAME
  const dir = ctx.location?.directory ?? process.cwd()
  const [file, setFile] = r.createSignal<ViewFile | null>(null)
  const [now, setNow] = r.createSignal(d.now())
  const [opened, setOpened] = r.createSignal('')
  const [cursor, setCursor] = r.createSignal(0)
  const [focused, setFocused] = r.createSignal(false)
  let width = 80
  const refresh = async () => {
    setFile(await readViewFile(dir, d.readText, name))
    setNow(d.now())
  }
  const say = (message: string, variant: 'info' | 'error' = 'info') => ctx.ui.toast.show({ title: name, message, variant })
  const send = async (sessionID: string, a: PanelAction) => {
    const c = actionCommand(a, name)
    await ctx.client.session.command({ sessionID, name: c.name, text: c.text }).then(
      () => setTimeout(() => void refresh(), 300),
      (err: Error) => say(`/${c.name} ${c.text} failed: ${err?.message ?? err}`, 'error'),
    )
  }
  const draw = () => panelLines(file(), { opened: opened(), cursor: cursor() }, now(), width)
  const press = async (key: PanelKey, sessionID: string) => {
    const f = file()
    const open = opened()
    if (!open) {
      const ids = draw().ids
      if (key === 'up' || key === 'down') return void setCursor(moveCursor(cursor(), key === 'up' ? -1 : 1, ids.length))
      if (key === 'open') {
        const id = ids[moveCursor(cursor(), 0, ids.length)]
        if (id) setOpened(id)
      }
      return
    }
    if (key === 'back') return void setOpened('')
    const offered = panelKeys(f, open).map(k => k.word)
    if (key === 'x' && offered.includes('reject')) {
      const reason = (await ctx.ui.dialog.prompt({ title: `Reject ${open}`, description: 'What is wrong and what to change, for the next worker', placeholder: 'the reason' }))?.trim()
      if (reason) await send(sessionID, { kind: 'reject', id: open, reason })
      return
    }
    if (key !== 'a') return
    if (offered.includes('approve')) return send(sessionID, { kind: 'approve', id: open })
    if (!offered.includes('answer')) return
    const choices = answerOptions(f, open)
    const picked = choices.length > 1 ? await ctx.ui.dialog.select({ title: `Answer ${open}`, options: choices.map(c => ({ title: c, value: c })) }) : OWN_ANSWER
    if (!picked) return
    const answer = picked === OWN_ANSWER ? (await ctx.ui.dialog.prompt({ title: `Your answer to ${open}`, placeholder: 'type and press Enter' }))?.trim() : picked
    if (answer) await send(sessionID, { kind: 'answer', id: open, answer })
  }
  let panelSession = ''
  const disposers: (() => void)[] = []
  disposers.push(
    ctx.ui.slot({
      append: 'session.panel',
      render: input => {
        const col = r.createElement('box')
        r.setProp(col, 'flexDirection', 'column')
        r.insert(col, () => {
          if (input.name !== BOARD_PANEL) return null
          width = Math.max(20, (input.width || 80) - 2)
          panelSession = input.sessionID
          setFocused(input.focused)
          return drawLines(r, ctx.theme, draw().lines)
        })
        return col
      },
    }),
  )
  disposers.push(
    ctx.ui.slot({
      append: 'session.composer.top',
      render: () => {
        const col = r.createElement('box')
        r.setProp(col, 'flexDirection', 'column')
        r.insert(col, () => drawLines(r, ctx.theme, bandLines(file(), now(), Math.max(20, (ctx.renderer.width ?? 80) - 4))))
        return col
      },
    }),
  )
  // "/symcc" (and the command palette) opens the board panel
  ctx.keymap.layer(() => ({
    commands: [{ id: 'symcc.board.open', title: `${name} board`, description: `Open the ${name} board panel`, group: name, palette: true, slash: { name }, run: () => void ctx.ui.panel.open(BOARD_PANEL) }],
  }))
  // the panel's own keys, only while it is open and has the keyboard
  ctx.keymap.layer(() => ({
    enabled: () => ctx.ui.panel.current()?.name === BOARD_PANEL && focused(),
    priority: 10,
    commands: (Object.keys(KEY_BINDS) as PanelKey[]).map(key => ({ title: `${name} board: ${key}`, group: name, bind: KEY_BINDS[key], run: () => void press(key, panelSession || ctx.ui.panel.current()?.sessionID || '') })),
  }))
  void refresh()
  const stopTimer = d.every(REFRESH_MS, () => void refresh())
  return {
    refresh,
    state: () => ({ opened: opened(), cursor: cursor() }),
    press,
    stop: () => {
      stopTimer()
      for (const x of disposers.splice(0)) x()
    },
  }
}
