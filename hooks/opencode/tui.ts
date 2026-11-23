// symcc's OpenCode TUI part (T-466): what opencode/tui.ts exports. OpenCode runs it in its TUI, apart from the server
// part that runs symcc's engine, so it draws from the view file the engine writes on every publish
// (.<name>/view.json, see view.ts), read again every second, and sends the owner's actions back as symcc's slash
// commands in the TUI's session (approve, reject, diff, answer: board-view.ts's actionCommand). It claims two places of
// OpenCode's screen (docs/research/opencode-spike-can-a-small-symcc-plugin-refuse-edits-start-a.md, point 4):
//   - session.panel: the board (opened with ui.panel.open(BOARD_PANEL), from the "/symcc-board" keymap command or the
//     command palette's "symcc board"; plain "/symcc" stays the server's text board, T-505; and by itself once a
//     session is shown, when open_on_start is on, T-756): the task
//     list grouped by state, with the terminal list's marks, short states and times, and a task's (or question's)
//     page when one is opened; and, like the Claude Code board, the Live, Scouts and Settings tabs (keys l, t, s and c,
//     or a click on a tab, T-559, T-692; Live's lanes open their task on Enter or a click): a scout's page runs it now (r) or pauses it (p) with /<name>-scout, and edits it (e:
//     how often, model or instructions, /<name>-scout <name> every|model|prompt VALUE, T-562); a setting is changed
//     with /<name>-settings NAME VALUE, and the Roles and Kinds pages under Settings turn a role or kind off or on
//     (o) or reset it to the built-in one (r) with /<name>-settings role|kind <name> on|off|reset; and (T-706) as on
//     Claude Code's panel, edit it (e: an edit page with Save and Cancel, the changed boxes sent in one /<name>-settings
//     role|kind <name> save {...}), remove an added one (d, after a yes), make a new one (n on the Roles or Kinds
//     page: /<name>-settings role|kind NAME add, then its edit page) and a new scout (n on the Scouts tab: /<name>-scout
//     NAME new INSTRUCTIONS); the banner's Set up git (g) asks for a yes, then sends /<name>-settings git setup;
//   - session.composer.top: the band above the prompt, like Claude Code's (the header line, a click on it opens or closes the board panel, T-567; then the questions, and
//     the tasks that need the owner or run).
// What is drawn comes from board-view.ts (bandLines, panelLines), made with hooks/core's helpers; this file only
// turns those lines into OpenTUI elements (box and text) with Solid signals, and wires the keys and the mouse (T-558:
// OpenTUI gives every box and text onMouseUp and onMouseScroll, and a click bubbles up from the text under it to its
// row and the panel, as OpenCode's own sidebar and panels use them; OpenCode turns the mouse on unless its tui
// config says mouse: false). OpenCode's TUI
// modules (Solid and OpenTUI's Solid renderer) are passed in (TuiRuntime), so this file type-checks and its tests
// run without them. The names and shapes below are @opencode/plugin 2.3.0's tui Context (only what is used).
import { DEFAULT_NAME, dataDir } from '../name'
import { VIEW_FILE, parseViewFile, bandDraw, panelLines, pagePlace, panelKeys, panelTaskActions, approveInProgress, panelRoleChoices, TASK_ACTION_COMMANDS, LETTER_KEYS, type LetterKey, hasPage, answerOptions, actionCommand, PANEL_MARK, moveCursor, OWN_ANSWER, GROUPS_OPEN, groupOf, groupId, scoutRunsIn, settingsPlace, orgMemNoteOf, ORG_MEM_PAGE, orgMemPageId, orgMemPageTopic, LIVE_OM_ALL_ID, liveNoteId, liveTopicId, branchIdTask, orgMemIn, defPageId, rolePromptId, SETTINGS_OPEN, settingGroupOf, settingGroupId, PANEL_TABS, CHOICE_KEYS, approveSent, editOf, defDraftOf, draftChanges, draftError, editBoxId, boardPageOf, removeAsk, resetAsk, DEF_EDIT_BOXES, SETUP_GIT_ASK, newNameError, NEW_OPEN_MS, EDIT_SAVE_ID, EDIT_CANCEL_ID, EDIT_FIRST_BOX, type DefDraft, type ApproveSent, type ChoiceKey, type ViewFile, type Line, type PanelAction, type PanelHit, type PanelKey, type PanelGroup, type PanelTab, type BandHit } from './board-view'
import { SETTING_GROUPS, isScoutRunReport, taskReports, taskActions, type TaskAction, type TaskActionId, parseSettingValue, settingChoices, settingInfo, settingShown, settingValue, viewAsBoard, isSettingPage, everyText, nextFindings, everyMinutesOf, nextMode, modeOf, promptsOfRole, SEARCH_WORDS, NEW_SCOUT_EVERY, showsHeader, defEditFields, type SettingName, type ScoutEditField, type DefEditField } from '../board'
import type { SymccScout } from '../../types'
import { orgMemDeleteAsk, orgMemFile, orgMemNoteKey, orgMemTopicCounts } from '../core/org-mem'
import { PARTS_KEY, safePartsFile, viewStubFilled, withViewParts } from '../core/board-parts'
import { searchParts } from '../core/search-parts'

export type { PanelKey, PanelHit, PanelTab }

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

/** How opencode/tui.ts loads the two modules of OpenCode's TUI (T-500): each loader is `() => import('<name>')`
 *  with the name written out. OpenCode 2.3 gives a TUI plugin its own copies (the same Solid its TUI uses) by
 *  rewriting those plain names in the plugin's files; a name kept in a variable is not rewritten, so Bun looks for it
 *  next to the plugin, where nothing is installed ("Cannot find package 'solid-js'"). */
export type TuiRuntimeLoaders = { solid: () => Promise<unknown>; opentui: () => Promise<unknown> }

/** The two packages, and what is taken from each. */
export const TUI_PACKAGES = { solid: { name: 'solid-js', uses: ['createSignal'] }, opentui: { name: '@opentui/solid', uses: ['createElement', 'setProp', 'insert'] } } as const

/** Loads OpenCode's Solid and OpenTUI for the TUI part. When one can't be loaded, or lacks a function symcc uses, it
 *  fails with an error that names the package and says where it comes from, instead of a bare import error. */
export async function loadTuiRuntime(load: TuiRuntimeLoaders): Promise<TuiRuntime> {
  const got: Record<string, Record<string, unknown>> = {}
  for (const key of ['solid', 'opentui'] as const) {
    const { name, uses } = TUI_PACKAGES[key]
    let mod: unknown
    try {
      mod = await load[key]()
    } catch (e) {
      throw new Error(`symcc's OpenCode board can't load '${name}', which OpenCode's TUI gives its plugins (OpenCode 2.3 or newer; check with: opencode --version): ${e instanceof Error ? e.message : String(e)}`)
    }
    const m = (mod && typeof mod === 'object' ? mod : {}) as Record<string, unknown>
    const missing = uses.filter(f => typeof m[f] !== 'function')
    if (missing.length) throw new Error(`symcc's OpenCode board: '${name}' from OpenCode's TUI has no ${missing.join(', ')} (symcc needs OpenCode 2.3 or newer; check with: opencode --version)`)
    got[key] = m
  }
  const solid = got.solid!
  const tui = got.opentui!
  return {
    createSignal: solid.createSignal as TuiRuntime['createSignal'],
    createElement: tui.createElement as TuiRuntime['createElement'],
    setProp: tui.setProp as TuiRuntime['setProp'],
    insert: tui.insert as TuiRuntime['insert'],
  }
}

/** Says in a toast that the TUI part could not start, in plain words, and gives the error back for opencode/tui.ts to
 *  throw (OpenCode then lists the plugin as failed in /plugins). Without it a failure here leaves the owner with no
 *  band, no panel and no word why (T-505). */
export function setupFailed(ctx: Pick<TuiContext, 'ui'>, e: unknown, name: string = DEFAULT_NAME): Error {
  const err = e instanceof Error ? e : new Error(String(e))
  try {
    ctx.ui.toast.show({ title: name, message: `${name}'s board could not start in OpenCode, so there is no band above the prompt and no board panel: ${err.message}. The lead and its tools still work; /plugins shows the details.`, variant: 'error' })
  } catch {
    // no toast (OpenCode's UI isn't there): OpenCode still logs the thrown error
  }
  return err
}

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
  state: () => { tab: PanelTab; opened: string; run: string; cursor: number; groups: Record<PanelGroup, boolean>; settingsOpen: string[]; scroll: number }
  /** runs one of the panel's keys, as the keymap does */
  press: (key: PanelKey, sessionID: string) => Promise<void>
  stop: () => void
}

/** The keymap bindings of the panel's keys: k and j always move (as ↑ and ↓), on every page; no action has them.
 *  [ and ] go to the previous and the next task or scout of the list a page was opened from (T-751). */
export const KEY_BINDS: Record<PanelKey, string> = {
  up: 'up,k', down: 'down,j', open: 'return', back: 'b,left', close: 'escape', prev: '[', next: ']',
  ...(Object.fromEntries(LETTER_KEYS.map(k => [k, k])) as Record<LetterKey, string>),
  ...(Object.fromEntries(CHOICE_KEYS.map(k => [k, k])) as Record<ChoiceKey, string>),
}

/** The tab each tab key goes to. */
const TAB_OF: Partial<Record<PanelKey, PanelTab>> = Object.fromEntries(PANEL_TABS.map(t => [t.key, t.tab]))

/** Starts the TUI part: the band and the board panel, the keys, and the timer that reads the view file. */
export function startTui(ctx: TuiContext, d: TuiDeps): TuiBoard {
  const r = d.runtime
  const name = d.name ?? DEFAULT_NAME
  const dir = ctx.location?.directory ?? process.cwd()
  const [file, setFile] = r.createSignal<ViewFile | null>(null)
  const [now, setNow] = r.createSignal(d.now())
  const [opened, setOpened] = r.createSignal('')
  const [cursor, setCursor] = r.createSignal(0)
  const [groups, setGroups] = r.createSignal<Record<PanelGroup, boolean>>({ ...GROUPS_OPEN })
  const [scroll, setScroll] = r.createSignal(0)
  // the Settings groups open (T-585), and the setting whose pick list or box is open ('' = none)
  const [settingsOpen, setSettingsOpen] = r.createSignal<string[]>([...SETTINGS_OPEN])
  let asking = ''
  const [tab, setTab] = r.createSignal<PanelTab>('live')
  // the open run of the open scout ('' = the scout's page), the cursor over its page's runs, and the run's report
  // (undefined while it is read, null when it can't be)
  const [run, setRun] = r.createSignal('')
  const [runCursor, setRunCursor] = r.createSignal(0)
  const [report, setReport] = r.createSignal<string | null | undefined>(undefined)
  // the answer just sent from the open page (T-583), so the page says it was sent
  const [sent, setSent] = r.createSignal<{ id: string; answer: string } | undefined>(undefined)
  // the open task's latest report (T-580), read from its file when the page opens or a newer try's report comes
  const [taskReport, setTaskReport] = r.createSignal<{ file: string; text: string | null | undefined } | undefined>(undefined)
  // the approve just sent from a task's page (T-614): until its first step is on the board, the page's badge, Status
  // row and Stage line show it started ("✎ prep"), not "ready for review"
  const [approving, setApproving] = r.createSignal<ApproveSent | undefined>(undefined)
  // the task list's search (T-685, Claude Code's [f] search: core's searchTasks words; '' = none)
  const [search, setSearch] = r.createSignal('')
  // T-904: the finished tasks' details and request for the search on (as Claude Code's list: core's searchParts, read
  // from their parts files only while a search is on, once per search); `searchSeen` goes up when new ones were read
  const searchCache = searchParts()
  const [searchSeen, setSearchSeen] = r.createSignal(0)
  /** What the search gives panelLines: its words and, while it is on, the read details and request. */
  const searchChoice = () => (search() ? { search: search(), searchMore: (searchSeen(), searchCache.more) } : {})
  // the open role's or kind's edit mode (T-706, Claude Code's Edit page; undefined = none)
  const [edit, setEdit] = r.createSignal<DefDraft | undefined>(undefined)
  // a role, kind or scout just made from this panel: its page opens once the view file has it (T-706)
  let pendingOpen: { tab: PanelTab; id: string; edit: boolean; at: number } | undefined
  let width = 80
  // the panel's height in rows (panelRows): it bounds the scroll, and the panel is drawn exactly that high, so the
  // footer stays at the bottom and no row of a longer page is left over; OpenTUI says when the box's size changes
  const [rows, setRows] = r.createSignal<number | undefined>(undefined)
  /** Back to the list when the open task or scout left the view, and to the scout's page when its open run did. */
  const keepPage = (f: ViewFile | null) => {
    if (opened() && !hasPage(f, opened(), tab())) openPage('')
    if (run() && !scoutRunsIn(f, opened()).some(x => x.run.ended === run())) setRun('')
  }
  // T-675: a done or dropped task's long parts (history, details, ...) are not in the view file; its page reads them
  // from its parts file (.<name>/tasks/T-n.json), read again on each refresh while the page is open
  let rawFile: ViewFile | null = null
  let parts: { id: string; file: string; text: string | null } | undefined
  const openTask = (f: ViewFile | null) => (f && tab() === 'tasks' && opened() ? f.view.tasks.find(x => x.id === opened()) : undefined)
  const withParts = (f: ViewFile | null): ViewFile | null => {
    if (!f) return f
    const t = openTask(f) as (Record<string, unknown> & { id: string }) | undefined
    const p = t && parts && parts.id === t.id && parts.file === t[PARTS_KEY] ? parts : undefined
    // a slim task is drawn with empty details and history until (or if never) its parts are read
    return { ...f, view: { ...f.view, tasks: f.view.tasks.map(x => viewStubFilled(p && x.id === p.id ? withViewParts(x, p.text) : x)) } }
  }
  const readTaskParts = () => {
    const f = rawFile
    const t = openTask(f) as Record<string, unknown> | undefined
    const rel = t?.[PARTS_KEY]
    if (!f || !t || !safePartsFile(rel)) return
    const id = String(t.id)
    void d.readText(`${f.root}/${dataDir(f.name || name)}/${rel}`).then(
      text => {
        parts = { id, file: rel, text }
        if (opened() === id) setFile(withParts(rawFile))
      },
      () => undefined,
    )
  }
  /** T-904: reads the slim tasks' details and request for the search on (nothing without one; each file once per
   *  search), then draws again when new ones came. */
  const loadSearch = () => {
    const f = rawFile
    const q = search()
    if (!f) return
    void searchCache.load(f.view.tasks, q, rel => d.readText(`${f.root}/${dataDir(f.name || name)}/${rel}`)).then(
      news => void (news && search() === q && setSearchSeen(searchSeen() + 1)),
      () => undefined,
    )
  }
  const refresh = async () => {
    const f = await readViewFile(dir, d.readText, name)
    rawFile = f
    setFile(withParts(f))
    readTaskParts()
    loadSearch()
    setNow(d.now())
    // a page that got shorter keeps its scroll within its new length
    setScroll(draw().scroll)
    // once the board shows the approve's step (or the task left review, or it is too old), the board carries it
    if (approving() && !approveSent(f, approving(), now())) setApproving(undefined)
    // the open task left the view: back to the list, so the list's keys work again
    keepPage(f)
    readTaskReport()
    openMade()
    openOnStart(f)
    openNow(f)
  }
  /** T-756: opens the board panel by itself once per TUI run, as Claude Code does at session start when open_on_start is
   *  on (and symcc is on). Each view file read checks the setting again and tries until a session is shown
   *  (ui.panel.open says no on OpenCode's home page; no toast then), so a setting turned off while it waits still
   *  counts. Once it is off at a read, or the board is open (also when the owner opened it), it is never opened by
   *  itself again in this run, so a closed board stays closed. */
  let startDone = false
  const openOnStart = (f: ViewFile | null) => {
    if (startDone || !f) return
    if (f.view.open_on_start === false || f.view.on_here === false) startDone = true
    else if (ctx.ui.panel.current()?.name === BOARD_PANEL || ctx.ui.panel.open(BOARD_PANEL)) startDone = true
  }
  /** T-841: /symcc-enable (also spelled enable here) writes a one-time "open now" mark with its session's id into the view file.
   *  Only the TUI window showing that session opens the board for it (unless open_on_start is off or it is open
   *  already); a mark from before this run, or one for another window's session, opens nothing. A write by another
   *  window (enabled false or true) never counts. */
  const startedAt = d.now()
  let shownSession = ''
  let openNowDone = 0
  const openNow = (f: ViewFile | null) => {
    const m = f?.open_now
    if (!f || !m || m.at <= openNowDone || m.at < startedAt || !shownSession || m.session !== shownSession) return
    openNowDone = m.at
    if (f.view.open_on_start === false || f.view.on_here === false) return
    if (ctx.ui.panel.current()?.name !== BOARD_PANEL) {
      ctx.ui.panel.open(BOARD_PANEL)
      showTab('live')
    }
  }
  /** Opens the page of the role, kind or scout just made here once the view file has it (a new role or kind in its
   *  edit mode, as Claude Code's New role does). */
  const openMade = () => {
    const p = pendingOpen
    if (!p) return
    // the engine refused it after all (or it never came): stop waiting, so it doesn't open later
    if (tab() !== p.tab || d.now() - p.at > NEW_OPEN_MS) return void (pendingOpen = undefined)
    if (!hasPage(file(), p.id, p.tab)) return
    pendingOpen = undefined
    openPage(p.id)
    const place = p.edit ? settingsPlace(file(), p.id) : null
    if (place?.def) openEdit(place.list, place.def)
  }
  /** Reads the open task's latest report, unless it is the one already read (or being read). */
  const readTaskReport = () => {
    const f = file()
    const t = tab() === 'tasks' && opened() ? f?.view.tasks.find(x => x.id === opened()) : undefined
    const latest = t ? taskReports(t).at(-1) : undefined
    if (!f || !latest) return void (taskReport() && setTaskReport(undefined))
    if (taskReport()?.file === latest.file) return
    const id = opened()
    setTaskReport({ file: latest.file, text: undefined })
    void d.readText(`${f.root}/${latest.file}`).then(
      text => opened() === id && taskReport()?.file === latest.file && setTaskReport({ file: latest.file, text }),
      () => opened() === id && taskReport()?.file === latest.file && setTaskReport({ file: latest.file, text: null }),
    )
  }
  // T-700: a task opened from the Live tab goes back there (to its lane) on b, as on the terminal panel and VS Code;
  // T-751: its page says "‹ Live" then (fromLive), and [ and ] go through the Live tab's tasks
  let backTo: { tab: PanelTab; cursor: number } | undefined
  const [fromLive, setFromLive] = r.createSignal(false)
  /** Opens a page ('' = back to the list), from its top. */
  const openPage = (id: string) => {
    backTo = undefined
    setFromLive(false)
    setEdit(undefined)
    setOpened(id)
    setSent(undefined)
    setTaskReport(undefined)
    readTaskReport()
    readTaskParts()
    setRun('')
    setRunCursor(0)
    setScroll(0)
  }
  /** Shows another tab, at its list's top. */
  const showTab = (t: PanelTab) => {
    pendingOpen = undefined
    setTab(t)
    openPage('')
    setCursor(0)
  }
  /** Opens run `ended` of the open scout ('' = back to the scout's page), and reads its report from its file. */
  const openRun = (ended: string) => {
    setRun(ended)
    setScroll(0)
    setReport(undefined)
    const f = file()
    const rel = scoutRunsIn(f, opened()).find(x => x.run.ended === ended)?.run.report
    if (!ended || !f || !rel) return
    if (!isScoutRunReport(rel)) return setReport(null)
    void d.readText(`${f.root}/${rel}`).then(
      text => run() === ended && setReport(text),
      () => run() === ended && setReport(null),
    )
  }
  const toggle = (g: PanelGroup) => setGroups({ ...groups(), [g]: !groups()[g] })
  /** Opens or closes Settings group `title`; closing it cancels a pick list or box left open for a setting in it
   *  (its answer is not sent), as on the Claude Code board. */
  const toggleSettingGroup = (title: string) => {
    const open = settingsOpen().includes(title)
    setSettingsOpen(open ? settingsOpen().filter(t => t !== title) : [...settingsOpen(), title])
    if (open && SETTING_GROUPS.find(g => g.title === title)?.items.includes(asking as SettingName)) asking = ''
  }
  const say = (message: string, variant: 'info' | 'error' = 'info') => ctx.ui.toast.show({ title: name, message, variant })
  /** Runs `a`'s slash command; false (and a toast) when it failed. */
  const sendOk = async (sessionID: string, a: PanelAction): Promise<boolean> => {
    const c = actionCommand(a, name)
    return ctx.client.session.command({ sessionID, name: c.name, text: `${c.text}${PANEL_MARK}` }).then(
      () => (setTimeout(() => void refresh(), 300), true),
      (err: Error) => (say(`/${c.name} ${c.text} failed: ${err?.message ?? err}`, 'error'), false),
    )
  }
  const send = async (sessionID: string, a: PanelAction): Promise<void> => void (await sendOk(sessionID, a))
  /** Whether the cursor is on a page's own rows (a scout's runs, the Roles or Kinds list), not the tab's list. */
  const onPage = () => tab() !== 'tasks' && !!opened()
  const draw = () => {
    return panelLines(file(), { tab: tab(), opened: opened(), run: run(), report: report(), cursor: onPage() ? runCursor() : cursor(), groups: groups(), settingsOpen: settingsOpen(), scroll: scroll(), ...(rows() ? { rows: rows()! } : {}), ...(sent() ? { sent: sent()! } : {}), ...(taskReport() ? { taskReport: taskReport()! } : {}), ...(approving() ? { approving: approving()! } : {}), ...searchChoice(), ...(edit() ? { edit: edit()! } : {}), ...(fromLive() ? { from: 'live' as const } : {}) }, now(), width)
  }
  /** The rows of the Tasks tab's list, even while a task's page is open (whose draw has no rows), so "open this id"
   *  can put the list cursor on that task and b comes back to it (T-568). */
  const listIds = () => panelLines(file(), { tab: 'tasks', opened: '', cursor: cursor(), groups: groups(), scroll: 0, ...searchChoice() }, now(), width).ids
  /** Sets the list's search ('' = none), from the list's top. */
  const searchFor = (text: string) => {
    setSearch(text.trim())
    setCursor(0)
    setScroll(0)
    loadSearch()
  }
  /** f on the list ([f] search, [f] change search): asks for the search words; Enter on an empty box clears it, Esc
   *  keeps it as it was. */
  const askSearch = async () => {
    const now = search()
    const text = await ctx.ui.dialog.prompt({ title: now ? `Search the tasks (now: ${now})` : 'Search the tasks', description: `words, or ${SEARCH_WORDS} · Enter on empty clears`, placeholder: `words, or ${SEARCH_WORDS}` })
    if (text !== undefined) searchFor(text)
  }
  /** Changes setting `setting` (Enter or a click on its row): on/off flips, a setting with choices is picked from a
   *  list, the rest is typed; then /<name>-settings NAME VALUE sets it. */
  const changeSetting = async (setting: SettingName, sessionID: string) => {
    const info = settingInfo(setting)
    const f = file()
    if (!info || !f) return
    const now = settingValue(viewAsBoard(f.view), setting)
    const choices = settingChoices(setting, f.view.notify_choices)
    let value: string | undefined
    if (info.kind === 'onoff') value = now === 'on' ? 'off' : 'on'
    else {
      asking = setting
      if (choices.length) value = await ctx.ui.dialog.select({ title: `${setting} (now ${settingShown(setting, now)})`, options: choices.map(c => ({ title: c === now ? `${settingShown(setting, c)} (now)` : settingShown(setting, c), value: c })) })
      else value = (await ctx.ui.dialog.prompt({ title: `${setting} (now ${now})`, description: `${info.range} · ${info.meaning}`, placeholder: info.kind === 'commands' ? 'e.g. npm test, or none' : info.range }))?.trim()
      // its group was closed meanwhile: the pick or box was cancelled
      if (asking !== setting) return
      asking = ''
    }
    if (!value || value === now) return
    const ok = parseSettingValue(setting, value)
    if (!ok.ok) return say(ok.message, 'error')
    await send(sessionID, { kind: 'setting', setting, value })
  }
  /** Edits scout `sc` (e on its page): pick what to change (how often, model, instructions), then type the new value;
   *  /<name>-scout <name> every|model|prompt VALUE saves it in the scout's file. */
  const editScout = async (sc: SymccScout, sessionID: string) => {
    const field = await ctx.ui.dialog.select<ScoutEditField>({
      title: `Change scout ${sc.name}`,
      options: [
        { title: `How often: ${everyText(sc.every_minutes)}`, value: 'every' },
        { title: `Model: ${sc.model || "the session's model"}`, value: 'model' },
        { title: `Findings: ${sc.findings ?? 'default (the board setting)'}`, value: 'findings' },
        { title: 'Instructions', value: 'prompt' },
      ],
    })
    if (!field) return
    if (field === 'findings') {
      const pick = await ctx.ui.dialog.select<string>({ title: `${sc.name}: where its findings' tasks go`, options: [{ title: 'auto: the lead decides', value: 'auto' }, { title: 'backlog: every task waits for you', value: 'backlog' }, { title: 'default: the board setting', value: 'default' }] })
      if (pick) await send(sessionID, { kind: 'scout-edit', scout: sc.name, field, value: pick })
      return
    }
    const ask =
      field === 'every'
        ? { title: `${sc.name}: runs every how many minutes (now ${sc.every_minutes})`, description: '0 = only on demand', placeholder: 'minutes: a whole number, 0 or more' }
        : field === 'model'
          ? { title: `${sc.name}: model (now ${sc.model || "the session's model"})`, description: "none = the session's model", placeholder: 'a model name, or none' }
          : { title: `${sc.name}: new instructions`, description: (sc.prompt ?? '').split('\n').find(l => l.trim())?.trim() ?? '', placeholder: 'what to look for, in plain words (longer ones: edit its file)' }
    const value = (await ctx.ui.dialog.prompt(ask))?.trim()
    if (!value) return
    if (field === 'every' && everyMinutesOf(value) === null) return say('every must be a whole number of minutes: 0 for only on demand, or 1 or more', 'error')
    await send(sessionID, { kind: 'scout-edit', scout: sc.name, field, value: field === 'model' && value.toLowerCase() === 'none' ? '' : value })
  }
  /** Opens the edit mode of the open role or kind, with the cursor on its first box (Claude Code's autoFocus). */
  const openEdit = (list: 'roles' | 'kinds', x: Parameters<typeof defDraftOf>[1]) => {
    setRunCursor(EDIT_FIRST_BOX)
    setScroll(0)
    setEdit(defDraftOf(list, x))
  }
  /** Asks a yes (Claude Code's confirm step) before `what`; true when the owner picked it. */
  const yes = async (title: string, label: string) => (await ctx.ui.dialog.select({ title, options: [{ title: label, value: 'yes' }, { title: 'Cancel', value: 'no' }] })) === 'yes'
  /** "+ New role" / "+ New kind" (n): asks the name, then /<name>-settings role|kind NAME add; its page opens in the edit
   *  mode once the view file has it. Esc or an empty name leaves it. */
  const newDef = async (list: 'roles' | 'kinds', sessionID: string) => {
    const noun = list === 'roles' ? 'role' : 'kind'
    const asked = await askNewName(noun, `New ${noun}'s name`, `Enter makes ${dataDir(file()?.name || name)}/${list}/<name>.md and opens it`, 'letters, digits, - and _')
    if (!asked) return
    if (await sendOk(sessionID, { kind: 'def-add', def: noun, name: asked })) pendingOpen = { tab: 'settings', id: defPageId(list, list === 'kinds' ? asked.toLowerCase() : asked), edit: true, at: d.now() }
  }
  /** Asks a new role's, kind's or scout's name; a name the engine would refuse (bad, or taken: newNameError) asks
   *  again with the reason, as Claude Code's name box stays open with it. Esc or an empty name: undefined. */
  const askNewName = async (what: 'role' | 'kind' | 'scout', title: string, description: string, placeholder: string): Promise<string | undefined> => {
    let error = ''
    for (;;) {
      const asked = (await ctx.ui.dialog.prompt({ title, ...(error || description ? { description: error || description } : {}), placeholder }))?.trim()
      if (!asked) return undefined
      error = newNameError(file(), what, asked)
      if (!error) return asked
    }
  }
  /** "+ New scout" (n): asks the name, then its instructions, then /<name>-scout NAME new INSTRUCTIONS (it runs every
   *  NEW_SCOUT_EVERY minutes; e on its page changes that); its page opens once the view file has it. */
  const newScout = async (sessionID: string) => {
    const scout = await askNewName('scout', "New scout's name", '', 'lowercase letters, digits and dashes')
    if (!scout) return
    const prompt = (await ctx.ui.dialog.prompt({ title: `${scout}: what it does`, description: `in plain words; it runs every ${NEW_SCOUT_EVERY} minutes (Edit on its page changes that)`, placeholder: 'what to look for, in plain words (longer ones: edit its file)' }))?.trim()
    if (!prompt) return
    if (await sendOk(sessionID, { kind: 'scout-new', scout, prompt })) pendingOpen = { tab: 'scouts', id: scout, edit: false, at: d.now() }
  }
  /** Enter or a click on an edit page's box: asks its new value (Enter on an empty box empties it, Esc keeps it). */
  const editBox = async (field: DefEditField) => {
    const e = edit()
    const place = e ? settingsPlace(file(), e.page) : null
    if (!e || !place?.def) return
    const box = DEF_EDIT_BOXES[field]
    const now = (e.values[field] ?? '').split('\n').find(l => l.trim())?.trim() ?? ''
    const value = await ctx.ui.dialog.prompt({ title: `${place.def.name}: ${box.label}${now ? ` (now: ${now})` : ''}`, description: box.placeholder(place.list === 'roles' ? 'role' : 'kind'), placeholder: box.placeholder(place.list === 'roles' ? 'role' : 'kind') })
    if (value === undefined || edit()?.page !== e.page) return
    setEdit({ page: e.page, values: { ...edit()!.values, [field]: value.trim() } })
  }
  /** Save on the edit page: a value the lead's tool would refuse (draftError: an empty description, a tool word a role
   *  may not have, ...) stays on the page with Claude Code's error and sends nothing; else the changed boxes go in one
   *  /<name>-settings role|kind NAME save {...} (one edit: all or none), and the page goes back to the role or kind
   *  once it is sent. */
  const saveEdit = async (sessionID: string) => {
    const e = edit()
    const place = e ? settingsPlace(file(), e.page) : null
    if (!e || !place?.def) return
    const error = draftError(place.list, place.def.name, e)
    if (error) return void setEdit({ ...e, error })
    const def = place.list === 'roles' ? 'role' : 'kind'
    const changed = draftChanges(place.list, place.def, e)
    if (changed.length && !(await sendOk(sessionID, { kind: 'def-save', def, name: place.def.name, fields: Object.fromEntries(changed.map(f => [f, e.values[f] ?? ''])) }))) return
    if (edit()?.page === e.page) setEdit(undefined)
  }
  /** Set up git (g, or the banner's button), where the banner shows it: asks a yes, then /<name>-settings git setup. */
  const setUpGit = async (sessionID: string) => {
    const f = file()
    const gs = f?.view.git_state
    if (!f || (gs !== 'no-repo' && gs !== 'no-commits' && gs !== 'no-git') || !showsHeader(boardPageOf(f, { tab: tab(), opened: opened(), run: run(), ...(edit() ? { edit: edit()! } : {}) }))) return
    if (gs === 'no-git') return void (await send(sessionID, { kind: 'check-git' }))
    if (await yes(SETUP_GIT_ASK, 'Yes, set up git')) await send(sessionID, { kind: 'setup-git' })
  }
  /** The Settings tab's keys: the list moves, changes a setting or opens the Roles or Kinds page; that page moves and
   *  opens a role or kind (n makes a new one); its page turns it off or on (o), resets it (r), edits it (e) or
   *  removes it (d, after a yes); b goes back one page. On the edit page ↑↓ move over Save, Cancel and the boxes,
   *  Enter changes a box or presses the button, x (Cancel) and b leave it without saving. */
  const pressSettings = async (key: PanelKey, sessionID: string) => {
    const f = file()
    const open = opened()
    const ids = draw().ids
    const [cur, setCur] = open ? [runCursor, setRunCursor] : [cursor, setCursor]
    if (key === 'up' || key === 'down') return void setCur(moveCursor(cur(), key === 'up' ? -1 : 1, ids.length))
    const place = open ? settingsPlace(f, open) : null
    if (editOf(f, { tab: tab(), opened: open, ...(edit() ? { edit: edit()! } : {}) })) {
      if (key === 'x' || key === 'back') return void setEdit(undefined)
      const field = ids[moveCursor(cur(), 0, ids.length)]
      // Enter on the Save or Cancel button (↑ from the first box reaches them, as on Claude Code)
      if (key === 'open' && field === EDIT_SAVE_ID) return saveEdit(sessionID)
      if (key === 'open' && field === EDIT_CANCEL_ID) return void setEdit(undefined)
      const k = place?.def ? defEditFields(place.list === 'roles' ? 'role' : 'kind').find(x => editBoxId(x) === field) : undefined
      if (key === 'open' && k) return editBox(k)
      return
    }
    if (key === 'back') return place?.prompt && place.def ? openPage(defPageId('roles', place.def.name)) : place?.def ? openPage(place.list) : open ? openPage('') : showTab('tasks')
    // the built-in prompt page is view only: b goes back to the role
    if (place?.prompt) return
    if (key === 'open' && ids.length && !place?.def) {
      const id = ids[moveCursor(cur(), 0, ids.length)]!
      const g = open ? null : settingGroupOf(id)
      if (g) return toggleSettingGroup(g)
      return open || isSettingPage(id) ? openPage(id) : changeSetting(id as SettingName, sessionID)
    }
    // + New role / + New kind on the Roles or Kinds page
    if (key === 'n' && place && !place.def) return newDef(place.list as 'roles' | 'kinds', sessionID)
    const d = place?.def
    if (!d) return
    const def = place.list === 'roles' ? 'role' : 'kind'
    if (key === 'e' && !d.broken) return openEdit(place.list, d)
    if (key === 'd' && d.canRemove) {
      if (!(await yes(removeAsk(place.list, d), 'Yes, remove'))) return
      if ((await sendOk(sessionID, { kind: 'def', def, name: d.name, action: 'remove' })) && opened() === open) openPage(place.list)
      return
    }
    if (key === 'o' && d.canOff) return send(sessionID, { kind: 'def', def, name: d.name, action: d.off ? 'on' : 'off' })
    if (key === 'r' && d.canReset) {
      // T-871: a role's Reset to built-in asks first, as on Claude Code's page
      if (def === 'role' && !(await yes(resetAsk(d), 'Yes, reset'))) return
      return send(sessionID, { kind: 'def', def, name: d.name, action: 'reset' })
    }
    // T-871: ‹ › (and [ ]) on a role's page go to the role before or after it in the Roles list
    if ((key === 'prev' || key === 'next') && def === 'role' && !d.broken) return goNext(key)
    // See the prompt (T-685): the first built-in prompt the role goes in
    if (key === 'p' && def === 'role' && !d.broken) return openPage(rolePromptId(d.name, promptsOfRole(d.name)[0]!))
  }
  /** The Scouts tab's keys: the list moves and opens; a scout's page moves over its runs, opens one, runs the scout
   *  now (r), pauses or resumes it (p) and edits it (e); a run's page goes back. */
  const pressScouts = async (key: PanelKey, sessionID: string) => {
    const f = file()
    const open = opened()
    const ids = draw().ids
    if (!open) {
      if (key === 'up' || key === 'down') return void setCursor(moveCursor(cursor(), key === 'up' ? -1 : 1, ids.length))
      if (key === 'open' && ids.length) openPage(ids[moveCursor(cursor(), 0, ids.length)]!)
      if (key === 'back') showTab('tasks')
      if (key === 'n') return newScout(sessionID)
      return
    }
    if (run()) return void (key === 'back' && openRun(''))
    if (key === 'back') return openPage('')
    if (key === 'prev' || key === 'next') return goNext(key)
    if (key === 'up' || key === 'down') return void setRunCursor(moveCursor(runCursor(), key === 'up' ? -1 : 1, ids.length))
    if (key === 'open' && ids.length) return openRun(ids[moveCursor(runCursor(), 0, ids.length)]!)
    const offered = panelKeys(f, open, 'scouts').map(k => k.word)
    const sc = f?.view.scouts.find(x => x.name === open)
    if (key === 'r' && offered.includes('run now')) return send(sessionID, { kind: 'scout', scout: open })
    if (key === 'p' && sc) return send(sessionID, { kind: 'scout', scout: open, paused: !sc.paused })
    if (key === 'e' && sc) return editScout(sc, sessionID)
    // T-912: f moves its findings choice on (board default → auto → backlog → board default)
    if (key === 'f' && sc) return send(sessionID, { kind: 'scout-edit', scout: open, field: 'findings', value: nextFindings(sc.findings) })
  }
  /** Opens task `id`'s page on the Tasks tab, with the list's cursor on it (so b comes back to its row). */
  const openOnList = (id: string) => {
    const from = tab() === 'live' ? { tab: 'live' as const, cursor: cursor() } : undefined
    if (tab() !== 'tasks') showTab('tasks')
    const at = listIds().indexOf(id)
    if (at >= 0) setCursor(at)
    if (hasPage(file(), id)) openPage(id), (backTo = from), setFromLive(!!from)
  }
  /** [ or ] (`key` prev or next) on a task's or scout's page: the previous or next one of the list it was opened from
   *  (going round at the ends); a task's page keeps where b goes back to. */
  const goNext = (key: 'prev' | 'next') => {
    const place = pagePlace(file(), { tab: tab(), opened: opened(), run: run(), ...searchChoice(), ...(fromLive() ? { from: 'live' as const } : {}) }, now())
    if (!place || place.of < 2) return
    const to = place[key]
    const keep = backTo
    const live = fromLive()
    openPage(to)
    backTo = keep
    setFromLive(live)
    if (tab() === 'tasks' && !live) {
      const at = listIds().indexOf(to)
      if (at >= 0) setCursor(at)
    }
  }
  /** b on a task's page: back to the tab it was opened from (the Live tab, on its lane), else to the Tasks list. */
  const closeTask = () => {
    const to = backTo
    if (!to) return openPage('')
    showTab(to.tab)
    setCursor(to.cursor)
  }
  /** Enter (or a click) on the Live tab's row `id`: a lane's or train's task opens on the Tasks tab; (T-718) a topic of
   *  the org-mem section opens its notes' page, a newest note all notes with the cursor on it. */
  const openLive = (id: string) => {
    const at = draw().ids.indexOf(id)
    if (at >= 0) setCursor(at)
    if (id.startsWith('om-topic:')) {
      const topic = orgMemTopicCounts(orgMemIn(file())).find(x => liveTopicId(x.topic) === id)?.topic
      return topic ? openPage(orgMemPageId(topic)) : undefined
    }
    if (id === LIVE_OM_ALL_ID) return openPage(ORG_MEM_PAGE)
    if (id.startsWith('om-note:')) {
      const n = orgMemIn(file()).findIndex(x => liveNoteId(x.n) === id)
      openPage(ORG_MEM_PAGE)
      return void setRunCursor(Math.max(0, n))
    }
    // T-727: a Branches row opens its task too
    return openOnList(branchIdTask(id) ?? (id.startsWith('need:') ? id.slice(5) : id))
  }
  /** The Live tab's keys (T-692): ↑↓ move between the lanes (and the org-mem section's notes and topics), Enter opens
   *  the lane's task (or the topic's page, see openLive), b goes back to the list; (T-866) Enter on the org-mem
   *  section's "[all]" opens the Organizational memory page (T-687), whose b comes back to the tab. */
  const pressLive = async (key: PanelKey, sessionID: string) => {
    const f = file()
    const ids = draw().ids
    if (orgMemPageTopic(opened()) !== null) {
      if (key === 'back') return openPage('')
      if (key === 'up' || key === 'down') return void setRunCursor(moveCursor(runCursor(), key === 'up' ? -1 : 1, ids.length))
      // Enter or x on a note asks, then deletes it with /<name>-settings orgmem delete N
      const note = ids.length ? orgMemNoteOf(f, ids[moveCursor(runCursor(), 0, ids.length)]!) : undefined
      if ((key !== 'x' && key !== 'open') || !note) return
      const yes = await ctx.ui.dialog.select({ title: orgMemDeleteAsk(note, orgMemFile(dataDir(f?.name || name))), options: [{ title: 'Yes, delete', value: 'yes' }, { title: 'Cancel', value: 'no' }] })
      if (yes === 'yes') return send(sessionID, { kind: 'orgmem-delete', n: note.n, key: orgMemNoteKey(note.text) })
      return
    }
    if (key === 'up' || key === 'down') return void setCursor(moveCursor(cursor(), key === 'up' ? -1 : 1, ids.length))
    if (key === 'open' && ids.length) return openLive(ids[moveCursor(cursor(), 0, ids.length)]!)
    if (key === 'back') return showTab('tasks')
  }
  const press = async (key: PanelKey, sessionID: string) => {
    // Esc closes the panel (OpenCode 2.3 leaves closing to the panel's own keys)
    if (key === 'close') return ctx.ui.panel.close()
    const f = file()
    const to = TAB_OF[key]
    // on a task's page its own action keys come first (l is Role there, as on the terminal's task page)
    const page = tab() === 'tasks' && opened() ? f?.view.tasks.find(x => x.id === opened()) : undefined
    if (to && !(page && panelTaskActions(page, approveInProgress(f, page, approving(), now())).some(x => x.key === key))) return showTab(to)
    // the banner's Set up git (g), on the pages that show the banner
    if (key === 'g') return setUpGit(sessionID)
    keepPage(f)
    if (tab() === 'live') return pressLive(key, sessionID)
    if (tab() === 'scouts') return pressScouts(key, sessionID)
    if (tab() === 'settings') return pressSettings(key, sessionID)
    const open = opened()
    if (!open) {
      const ids = draw().ids
      if (key === 'up' || key === 'down') return void setCursor(moveCursor(cursor(), key === 'up' ? -1 : 1, ids.length))
      if (key === 'open') {
        const id = ids[moveCursor(cursor(), 0, ids.length)]
        const g = id ? groupOf(id) : null
        if (g) toggle(g)
        else if (id) openPage(id)
      }
      // T-685: Claude Code's list buttons: [f] search (or change it), [x] clear search, [m] the board mode
      if (key === 'f') return askSearch()
      if (key === 'x' && search()) return searchFor('')
      if (key === 'm' && f) return send(sessionID, { kind: 'mode', mode: nextMode(modeOf(f.view)) })
      return
    }
    if (key === 'back') return closeTask()
    if (key === 'prev' || key === 'next') return goNext(key)
    // the task's own actions (core's taskActions, panelTaskActions), each by its key, sent as a slash command
    const t = f?.view.tasks.find(x => x.id === open)
    const act = t ? panelTaskActions(t, approveInProgress(f, t, approving(), now())).find(x => x.key === key) : undefined
    if (act) return doAction(act, sessionID)
    // a number key picks that choice of the page, as a click on its line does (T-583)
    const n = CHOICE_KEYS.indexOf(key as ChoiceKey)
    if (n >= 0) return pick(n + 1, sessionID)
    if (key !== 'a' || !panelKeys(f, open).some(k => k.word === 'answer')) return
    const choices = answerOptions(f, open)
    const picked = choices.length > 1 ? await ctx.ui.dialog.select({ title: `Answer ${open}`, options: choices.map(c => ({ title: c, value: c })) }) : OWN_ANSWER
    if (picked) await answerWith(picked, sessionID)
  }
  /** A click on a task page's button without a key (T-680: Drop in review): the open task's action `id`, when its
   *  page still offers it. */
  const pressAction = (id: TaskActionId, sessionID: string) => {
    const f = file()
    const t = tab() === 'tasks' ? f?.view.tasks.find(x => x.id === opened()) : undefined
    const act = t ? taskActions(t, { merging: approveInProgress(f, t, approving(), now()) }).find(x => x.id === id && TASK_ACTION_COMMANDS[x.id]) : undefined
    if (act) return doAction(act, sessionID)
  }
  /** Sends the open task's action `act` (core's taskActions) as its slash command (TASK_ACTION_COMMANDS); reject,
   *  ask more, drop and role ask first. */
  const doAction = async (act: TaskAction, sessionID: string) => {
    const f = file()
    const open = opened()
    const t = f?.view.tasks.find(x => x.id === open)
    const command = TASK_ACTION_COMMANDS[act.id]
    if (command === 'reject') {
      const ask = act.id === 'ask-more'
        ? { title: `Ask more on ${open}`, description: 'What else to find out; it gets a fresh try with your question', placeholder: 'your follow-up question' }
        : { title: `Reject ${open}`, description: 'What is wrong and what to change, for the next worker', placeholder: 'the reason' }
      const reason = (await ctx.ui.dialog.prompt(ask))?.trim()
      if (reason) await send(sessionID, { kind: 'reject', id: open, reason })
      return
    }
    if (command === 'approve') {
      setApproving({ id: open, at: d.now() })
      if (!(await sendOk(sessionID, { kind: 'approve', id: open })) && approving()?.id === open) setApproving(undefined)
      return
    }
    if (command === 'diff') return send(sessionID, { kind: command, id: open })
    if (command === 'drop') {
      // the reason is optional: Enter on the empty box drops it without one; Esc keeps the task
      const reason = await ctx.ui.dialog.prompt({ title: `Drop ${open}`, description: 'Why (optional): Enter on an empty box drops it without a reason', placeholder: 'the reason, or nothing' })
      if (reason === undefined) return
      return send(sessionID, { kind: 'task', id: open, verb: 'drop', ...(reason.trim() ? { arg: reason.trim() } : {}) })
    }
    if (command === 'role') {
      const now = (t!.role || 'general').toLowerCase()
      const role = await ctx.ui.dialog.select({ title: `Pick a role for ${open}`, options: panelRoleChoices(f).map(r => ({ title: r.toLowerCase() === now ? `${r} (now)` : r, value: r })) })
      if (role) await send(sessionID, { kind: 'task', id: open, verb: 'role', arg: role })
      return
    }
    if (command === 'review') return send(sessionID, { kind: 'task', id: open, verb: 'review', arg: t!.needs_review ? 'off' : 'on' })
    if (command) return send(sessionID, { kind: 'task', id: open, verb: command })
  }
  /** Answers the open task or question with `picked` (OWN_ANSWER: the owner types it first), and the page says so. */
  const answerWith = async (picked: string, sessionID: string) => {
    const open = opened()
    const answer = picked === OWN_ANSWER ? (await ctx.ui.dialog.prompt({ title: `Your answer to ${open}`, placeholder: 'type and press Enter' }))?.trim() : picked
    if (!answer) return
    if ((await sendOk(sessionID, { kind: 'answer', id: open, answer })) && opened() === open) setSent({ id: open, answer })
  }
  /** Picks choice `n` (1 = the first) of the open page's answer choices (a click on its line, or its number key). */
  const pick = async (n: number, sessionID: string) => {
    const open = opened()
    if (tab() !== 'tasks' || !open) return
    const c = answerOptions(file(), open)[n - 1]
    if (c) await answerWith(c, sessionID)
  }
  /** A click on the panel (T-558): a row opens its task or question, a group's row opens or closes it, a key hint
   *  does what its key does. The cursor goes to the clicked row, so the keys go on from there. */
  const click = (hit: PanelHit, sessionID: string) => {
    if ('key' in hit) return press(hit.key, sessionID)
    if ('tab' in hit) return showTab(hit.tab)
    if ('choice' in hit) return pick(hit.choice, sessionID)
    if ('action' in hit) return pressAction(hit.action, sessionID)
    if ('save' in hit) return saveEdit(sessionID)
    const ids = draw().ids
    if ('editField' in hit) {
      const at = ids.indexOf(editBoxId(hit.editField))
      if (at >= 0) setRunCursor(at)
      return editBox(hit.editField)
    }
    if ('scout' in hit) {
      if (ids.indexOf(hit.scout) >= 0) setCursor(ids.indexOf(hit.scout))
      return openPage(hit.scout)
    }
    if ('run' in hit) {
      if (ids.indexOf(hit.run) >= 0) setRunCursor(ids.indexOf(hit.run))
      return openRun(hit.run)
    }
    if ('setting' in hit) {
      if (ids.indexOf(hit.setting) >= 0) setCursor(ids.indexOf(hit.setting))
      return changeSetting(hit.setting, sessionID)
    }
    if ('settingGroup' in hit) {
      const at = ids.indexOf(settingGroupId(hit.settingGroup))
      if (at >= 0) setCursor(at)
      return toggleSettingGroup(hit.settingGroup)
    }
    if ('page' in hit) {
      const at = ids.indexOf(hit.page)
      if (at >= 0) (opened() ? setRunCursor : setCursor)(at)
      return hasPage(file(), hit.page, 'settings') ? openPage(hit.page) : undefined
    }
    // a lane on the Live tab opens its task on the Tasks tab
    if ('open' in hit && tab() === 'live') return openLive(hit.open)
    const id = 'open' in hit ? hit.open : groupId(hit.group)
    const at = (tab() === 'tasks' ? listIds() : draw().ids).indexOf(id)
    if (at >= 0) setCursor(at)
    if ('group' in hit) return void toggle(hit.group)
    if (hasPage(file(), hit.open)) openPage(hit.open)
  }
  /** The mouse wheel: scrolls the list or page by WHEEL_LINES (draw keeps it within the list's or page's length). */
  const wheel = (e: TuiMouseEvent) => {
    const by = e.scroll?.direction === 'up' ? -WHEEL_LINES : e.scroll?.direction === 'down' ? WHEEL_LINES : 0
    if (!by) return
    e.stopPropagation?.()
    setScroll(Math.max(0, scroll() + by))
    setScroll(draw().scroll)
  }
  let panelSession = ''
  // a drawing that fails shows nothing in OpenCode: say it once in a toast instead, so the owner isn't left with an
  // empty place and no word (T-505)
  const told = new Set<string>()
  const failed = (where: string, e: unknown) => {
    const message = `${name}'s ${where} could not be drawn: ${e instanceof Error ? e.message : String(e)}`
    if (told.has(message)) return
    told.add(message)
    say(message, 'error')
  }
  const drawn = <H,>(where: string, make: () => { lines: Line[]; hits: (H | null)[]; footer?: number }, onHit?: (hit: H) => void, footer = false) => {
    try {
      const got = make()
      return footer ? drawPanel<H>(r, ctx.theme, got.lines, got.hits, onHit, got.footer) : drawLines<H>(r, ctx.theme, got.lines, got.hits, onHit)
    } catch (e) {
      failed(where, e)
      return null
    }
  }
  const disposers: (() => void)[] = []
  disposers.push(
    ctx.ui.slot({
      append: 'session.panel',
      render: input => {
        // the panel's own keys: made here, inside the panel (as OpenCode's own diff viewer does), so OpenCode turns
        // them on only while the panel has the keyboard, and takes them away with the panel
        ctx.keymap.layer(() => ({
          enabled: () => input.name === BOARD_PANEL && input.focused,
          priority: 10,
          commands: (Object.keys(KEY_BINDS) as PanelKey[]).map(key => ({ title: `${name} board: ${key}`, group: name, bind: KEY_BINDS[key], run: () => void press(key, input.sessionID || panelSession) })),
        }))
        const col = r.createElement('box')
        r.setProp(col, 'flexDirection', 'column')
        // the board fills the panel, so its height is the panel's (what the scroll is bounded by)
        r.setProp(col, 'flexGrow', 1)
        r.setProp(col, 'minHeight', 0)
        r.setProp(col, 'overflow', 'hidden')
        const session = () => input.sessionID || panelSession
        // a click also gives the panel the keyboard, so the keys go on from the clicked row
        const onHit = (hit: PanelHit) => {
          if (input.name !== BOARD_PANEL) return
          input.focus?.()
          void click(hit, session())
        }
        r.setProp(col, 'onMouseScroll', (e: TuiMouseEvent) => input.name === BOARD_PANEL && wheel(e))
        // OpenTUI calls onSizeChange when the laid-out box changes size (as on a terminal resize): draw that high
        // the box may shrink to the panel's place, so its laid-out height is the place's, not the drawn rows'
        r.setProp(col, 'flexShrink', 1)
        const sized = () => {
          const n = panelRows((col as { height?: unknown }).height, ctx.renderer.height)
          if (n !== undefined && n !== rows()) setRows(n)
        }
        r.setProp(col, 'onSizeChange', sized)
        r.insert(col, () => {
          if (input.name !== BOARD_PANEL) return null
          width = Math.max(20, (input.width || 80) - 2)
          sized()
          panelSession = input.sessionID
          // T-649: the footer (its rule and the key hints, the page's buttons) is its own box that never shrinks,
          // under a body box that does: even if the height is wrong, the layout keeps the footer in sight and cuts
          // the body instead
          return drawn('board panel', draw, onHit, true)
        })
        return col
      },
    }),
  )
  disposers.push(
    ctx.ui.slot({
      append: 'session.composer.top',
      render: input => {
        shownSession = input?.sessionID ?? shownSession
        const col = r.createElement('box')
        r.setProp(col, 'flexDirection', 'column')
        // a click on the header (or the "+N more" line) opens the board panel, or closes it when it is open, as
        // /<name>-board does; a click on a task's or question's row opens its page (T-567). The slot is a plain box in
        // OpenCode 2.3's session view (next to its own "Jump to latest" button, which uses onMouseUp too).
        r.insert(col, () => drawn<BandHit>('band above the prompt', () => bandDraw(file(), now(), Math.max(20, (ctx.renderer.width ?? 80) - 4)), clickBand))
        return col
      },
    }),
  )
  // "/symcc-board" and the command palette's "symcc board" open the board panel, or close it when it is open. The
  // layer is "global": a layer in OpenCode's default "base" mode is in neither the palette nor the slash list. The
  // panel goes next to a session, so with none open (OpenCode's home page) a toast says to open one first.
  ctx.keymap.layer(() => ({
    mode: 'global',
    commands: [{ id: 'symcc.board.open', title: `${name} board`, description: `Open the ${name} board panel`, group: name, palette: true, slash: { name: `${name}-board` }, run: () => openBoard() }],
  }))
  const openBoard = () => {
    if (ctx.ui.panel.current()?.name === BOARD_PANEL) return ctx.ui.panel.close()
    if (!ctx.ui.panel.open(BOARD_PANEL)) return say(`Open or start a session first: the ${name} board opens next to a session (then /${name}-board, or "${name} board" in the command palette, ctrl+p).`)
    showTab('live')
    // T-887: no git check is sent here (it would post a message into the chat each time); the regular check looks
    // at no-repo / no-commits again, and Check again (g) at a missing git
  }
  const clickBand = (hit: BandHit) => {
    if ('board' in hit) return openBoard()
    if (ctx.ui.panel.current()?.name !== BOARD_PANEL && !ctx.ui.panel.open(BOARD_PANEL)) return say(`Open or start a session first: the ${name} board opens next to a session.`)
    openOnList(hit.open)
  }
  const reread = () => void refresh().catch(e => failed('board', e))
  reread()
  const stopTimer = d.every(REFRESH_MS, reread)
  return {
    refresh,
    state: () => ({ tab: tab(), opened: opened(), run: run(), cursor: onPage() ? runCursor() : cursor(), groups: groups(), settingsOpen: settingsOpen(), scroll: scroll() }),
    press,
    stop: () => {
      stopTimer()
      for (const x of disposers.splice(0)) x()
    },
  }
}
