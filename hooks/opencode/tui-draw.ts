// The drawing half of symcc's OpenCode TUI part (T-815, split from tui.ts): the Tui* types (OpenCode's tui Context as
// far as symcc uses it, the runtime, the deps, the shared panel state), the theme colors and the helpers that turn
// board-view.ts's lines into OpenTUI elements, and where the view file is read from. tui.ts re-exports all of it.
import { DEFAULT_NAME, dataDir } from '../name'
import { VIEW_FILE, parseViewFile, type DefDraft, type ApproveSent, type ViewFile, type Line, type PanelAction, type PanelHit, type PanelKey, type PanelGroup, type PanelTab, type PanelDraw, type PanelChoice } from './board-view'
import type { ReportPick } from '../core/task-sections'

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

/** How opencode/tui.ts loads the two modules of OpenCode's TUI (T-500): each loader is `() => import('<name>')`
 *  with the name written out. OpenCode 2.3 gives a TUI plugin its own copies (the same Solid its TUI uses) by
 *  rewriting those plain names in the plugin's files; a name kept in a variable is not rewritten, so Bun looks for it
 *  next to the plugin, where nothing is installed ("Cannot find package 'solid-js'"). */
export type TuiRuntimeLoaders = { solid: () => Promise<unknown>; opentui: () => Promise<unknown> }

/** The session.panel slot's input (PanelInput): the panel's session, width and focus. */
export type TuiPanelInput = { readonly name: string; readonly sessionID: string; readonly width: number; readonly focused: boolean; readonly close: () => void; readonly focus?: () => void }

/** An OpenTUI mouse event, as far as symcc uses it: the button (0 = left) and, for the wheel, its direction. */
export type TuiMouseEvent = { readonly type?: string; readonly button?: number; readonly scroll?: { readonly direction?: string }; stopPropagation?: () => void }

/** How many lines one turn of the mouse wheel scrolls (as OpenTUI's own scroll boxes). */
export const WHEEL_LINES = 3

/** How many rows of OpenCode's screen are surely not the panel's (its own header and status lines): the panel is
 *  never taken to be taller than the terminal less these. */
export const SCREEN_ROWS_AROUND = 2

/** The panel's height in rows (T-627, T-649): the panel box's own height once OpenTUI has laid it out, but never more
 *  than the terminal's height less OpenCode's lines around the panel. Before the layout it is not known (undefined):
 *  a guess from the terminal's height was too tall when the prompt area sits below the panel, and the padding pushed
 *  the footer with the buttons out of sight, so with no height the panel is drawn with no padding. */
export function panelRows(boxHeight: unknown, screenHeight: unknown): number | undefined {
  if (typeof boxHeight !== 'number' || !(boxHeight > 0)) return undefined
  const box = Math.floor(boxHeight)
  return typeof screenHeight === 'number' && screenHeight > SCREEN_ROWS_AROUND ? Math.min(box, Math.floor(screenHeight) - SCREEN_ROWS_AROUND) : box
}

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

/** One keymap layer (KeymapLayer). `mode` is the input mode it works in: OpenCode 2.3 defaults to "base", and a
 *  base layer's commands are not in the command palette (it opens in its own mode) nor in the prompt's slash list, so
 *  the command that opens the board uses "global" (as OpenCode's own plugins do, T-505). */
export type TuiKeyLayer = { readonly mode?: string; readonly enabled?: boolean | (() => boolean); readonly priority?: number; readonly commands?: readonly TuiKeyCommand[] }

/** The parts of the tui Context (@opencode/plugin/tui's Context) symcc uses. */
export type TuiContext = {
  readonly location: { readonly directory: string } | undefined
  readonly theme: unknown
  readonly renderer: { readonly width?: number; readonly height?: number }
  readonly client: { readonly session: { readonly command: (input: { sessionID: string; name: string; text: string }) => Promise<void> } }
  readonly keymap: { readonly layer: (factory: () => TuiKeyLayer) => void }
  readonly ui: {
    readonly toast: { show: (o: { readonly title?: string; readonly message: string; readonly variant?: 'info' | 'success' | 'warning' | 'error' }) => void }
    readonly dialog: {
      prompt: (o: { readonly title: string; readonly description?: string; readonly placeholder?: string }) => Promise<string | undefined>
      select: <V>(o: { readonly title: string; readonly options: readonly { readonly title: string; readonly description?: string; readonly value: V }[] }) => Promise<V | undefined>
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

/** Where the OpenCode theme keeps the color for one of core's color names, and a plain fallback. OpenCode 2.3's theme
 *  (ResolvedTheme) is nested: text.base, text.muted, text.feedback.warning.base, border.base, and hue.<color>.<100..900>
 *  scales; its leaves are OpenTUI colors (RGBA). Before T-505 symcc read flat names (theme.text, theme.warning...), so
 *  it got whole groups of colors as a text color, and OpenCode drew neither the band nor the panel. */
const THEME_KEY: Record<string, [string, string]> = {
  ide: ['hue.blue.200', '#5c9cf5'],
  claude: ['hue.orange.200', '#d7875f'],
  text: ['text.base', '#d0d0d0'],
  inactive: ['text.muted', '#808080'],
  subtle: ['border.base', '#555555'],
  warning: ['text.feedback.warning.base', '#e5c07b'],
  yellow: ['text.feedback.warning.base', '#e5c07b'],
  error: ['text.feedback.error.base', '#e06c75'],
  red: ['text.feedback.error.base', '#e06c75'],
  success: ['text.feedback.success.base', '#98c379'],
  green: ['text.feedback.success.base', '#98c379'],
  cyan: ['text.feedback.info.base', '#56b6c2'],
  suggestion: ['hue.purple.200', '#c678dd'],
  permission: ['hue.purple.200', '#c678dd'],
  autoAccept: ['text.feedback.success.base', '#98c379'],
}

/** Whether a theme value is one color (a color string, or an OpenTUI RGBA), not a group of colors. */
const isColor = (v: unknown) => typeof v === 'string' || (!!v && typeof v === 'object' && 'buffer' in v)

/** The fg color for a core color name in theme `theme`: the theme's color at its path, else the plain fallback (a
 *  theme may lack a field, and anything that isn't one color is never passed on as a text color). */
export function colorOf(theme: unknown, name: string): unknown {
  const [path, fallback] = THEME_KEY[name] ?? THEME_KEY.text!
  let v: unknown = theme
  for (const k of path.split('.')) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined
  return isColor(v) ? v : fallback
}

/** OpenTUI's bold text attribute (TextAttributes.BOLD). */
const BOLD = 1

/** Lines as OpenTUI elements: a column box with one row box per line, a text per colored piece. With `onHit`, a left
 *  click on a line with a hit (`hits`, by line) or on a piece with its own hit (a key hint) calls it. */
export function drawLines<H = PanelHit>(r: TuiRuntime, theme: unknown, lines: Line[], hits: (H | null)[] = [], onHit?: (hit: H) => void): TuiNode {
  const clicked = (hit: H) => (e?: TuiMouseEvent) => {
    if (e?.button !== undefined && e.button !== 0) return
    e?.stopPropagation?.()
    onHit?.(hit)
  }
  const col = r.createElement('box')
  r.setProp(col, 'flexDirection', 'column')
  r.insert(
    col,
    lines.map((line, i) => {
      const row = r.createElement('box')
      r.setProp(row, 'flexDirection', 'row')
      // a line too long for its place is cut at the edge, not wrapped piece by piece (each piece is its own text)
      r.setProp(row, 'overflow', 'hidden')
      const hit = onHit ? hits[i] : null
      if (hit) r.setProp(row, 'onMouseUp', clicked(hit))
      r.insert(
        row,
        line.map(seg => {
          const text = r.createElement('text')
          r.setProp(text, 'flexShrink', 0)
          r.setProp(text, 'wrapMode', 'none')
          r.setProp(text, 'fg', colorOf(theme, seg.color))
          if (seg.bold) r.setProp(text, 'attributes', BOLD)
          if (seg.hit && onHit) r.setProp(text, 'onMouseUp', clicked(seg.hit as H))
          r.insert(text, seg.text)
          return text
        }),
      )
      return row
    }),
  )
  return col
}

/** How many lines at the end of the panel's drawing are its footer when it doesn't say (the rule and the key hints). */
export const FOOTER_LINES = 2

/** The panel's lines as OpenTUI elements (T-649): a column with the body (every line but the last `footer`, the
 *  footer: its rule, the list's mode row and the key hints, T-685) in a box that shrinks and cuts what does not fit,
 *  and the footer in a box that never shrinks, so the footer stays in sight. */
export function drawPanel<H = PanelHit>(r: TuiRuntime, theme: unknown, lines: Line[], hits: (H | null)[] = [], onHit?: (hit: H) => void, footer = FOOTER_LINES): TuiNode {
  const cut = Math.max(0, lines.length - footer)
  const col = r.createElement('box')
  r.setProp(col, 'flexDirection', 'column')
  r.setProp(col, 'flexGrow', 1)
  r.setProp(col, 'minHeight', 0)
  const body = drawLines<H>(r, theme, lines.slice(0, cut), hits.slice(0, cut), onHit)
  r.setProp(body, 'flexGrow', 1)
  r.setProp(body, 'flexShrink', 1)
  r.setProp(body, 'minHeight', 0)
  r.setProp(body, 'overflow', 'hidden')
  const foot = drawLines<H>(r, theme, lines.slice(cut), hits.slice(cut), onHit)
  r.setProp(foot, 'flexShrink', 0)
  r.insert(col, [body, foot])
  return col
}

/** The view file's folder to look in (T-860): `dir` only, never a folder above it. */
export function viewPaths(dir: string, name: string = DEFAULT_NAME): string[] {
  const d = dir.replace(/\/+$/, '') || '/'
  return [`${d === '/' ? '' : d}/${dataDir(name)}/${VIEW_FILE}`]
}

/** The view file in `dir`, read and parsed; null when there is none. */
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
  /** the panel's state: the tab, the open task or scout ('' = the list), the open run of that scout, the cursor, the
   *  open groups, the open Settings groups (their titles) and the scroll */
  state: () => { tab: PanelTab; opened: string; run: string; cursor: number; groups: Record<PanelGroup, boolean>; backlogAll: boolean; openDays: string[]; settingsOpen: string[]; scroll: number }
  /** runs one of the panel's keys, as the keymap does */
  press: (key: PanelKey, sessionID: string) => Promise<void>
  stop: () => void
}

/** The board panel's state and its shared helpers, made by startTui and handed to makeDialogs and makeKeys (T-815):
 *  the Solid signals (a getter and, where the dialogs or keys change it, its setter), three plain fields they change
 *  in place, and the helpers that open pages, move between tabs and send slash commands. */
export type TuiState = {
  readonly d: TuiDeps
  readonly name: string
  readonly file: () => ViewFile | null
  readonly now: () => number
  readonly opened: () => string
  readonly tab: () => PanelTab
  readonly run: () => string
  readonly cursor: () => number
  readonly setCursor: (n: number) => void
  readonly runCursor: () => number
  readonly setRunCursor: (n: number) => void
  readonly scroll: () => number
  readonly setScroll: (n: number) => void
  readonly edit: () => DefDraft | undefined
  readonly setEdit: (e: DefDraft | undefined) => void
  readonly search: () => string
  readonly approving: () => ApproveSent | undefined
  readonly setApproving: (a: ApproveSent | undefined) => void
  readonly setSent: (s: { id: string; answer: string } | undefined) => void
  readonly setBacklogAll: (all: boolean) => void
  readonly fromLive: () => boolean
  readonly setFromLive: (live: boolean) => void
  /** the panel's drawing now (its lines, hits, row ids and scroll) */
  readonly draw: () => PanelDraw
  /** the Tasks tab's list rows, even while a page is open */
  readonly listIds: () => string[]
  /** what the search gives panelLines */
  readonly searchChoice: () => Pick<PanelChoice, 'search' | 'searchMore'>
  readonly searchFor: (text: string) => void
  readonly openPage: (id: string) => void
  readonly showTab: (t: PanelTab) => void
  readonly openRun: (ended: string) => void
  readonly toggle: (g: PanelGroup) => void
  readonly toggleDay: (day: string) => void
  readonly toggleSettingGroup: (title: string) => void
  readonly keepPage: (f: ViewFile | null) => void
  readonly pickReport: (p: ReportPick) => void
  readonly say: (message: string, variant?: 'info' | 'error') => void
  readonly sendOk: (sessionID: string, a: PanelAction) => Promise<boolean>
  readonly send: (sessionID: string, a: PanelAction) => Promise<void>
  /** the setting whose pick list or box is open ('' = none) */
  asking: string
  /** a role, kind or scout just made from this panel: its page opens once the view file has it (T-706) */
  pendingOpen: { tab: PanelTab; id: string; edit: boolean; at: number } | undefined
  /** where b on a task's page goes back to (T-700: the Live tab, on its lane) */
  backTo: { tab: PanelTab; cursor: number } | undefined
}
