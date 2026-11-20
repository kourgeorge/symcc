// symcc's OpenCode TUI part (T-466): what opencode/tui.ts exports. OpenCode runs it in its TUI, apart from the server
// part that runs symcc's engine, so it draws from the view file the engine writes on every publish
// (.<name>/view.json, see view.ts), read again every second, and sends the owner's actions back as symcc's slash
// commands in the TUI's session (approve, reject, diff, answer: board-view.ts's actionCommand). It claims two places of
// OpenCode's screen (docs/research/opencode-spike-can-a-small-symcc-plugin-refuse-edits-start-a.md, point 4):
//   - session.panel: the board (opened with ui.panel.open(BOARD_PANEL), from the "/symcc-board" keymap command or the
//     command palette's "symcc board"; plain "/symcc" stays the server's text board, T-505): the task
//     list grouped by state, with the terminal list's marks, short states and times, and a task's (or question's)
//     page when one is opened; and, like the Claude Code board, the Scouts and Settings tabs (keys t, s and c, or a
//     click on a tab, T-559): a scout's page runs it now (r) or pauses it (p) with /<name>-scout, and edits it (e:
//     how often, model or instructions, /<name>-scout <name> every|model|prompt VALUE, T-562); a setting is changed
//     with /<name>-settings NAME VALUE, and the Roles and Kinds pages under Settings turn a role or kind off or on
//     (o) or reset it to the built-in one (r) with /<name>-settings role|kind <name> on|off|reset;
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
import { VIEW_FILE, parseViewFile, bandDraw, panelLines, panelKeys, panelTaskActions, panelRoleChoices, TASK_ACTION_COMMANDS, LETTER_KEYS, type LetterKey, hasPage, answerOptions, actionCommand, moveCursor, OWN_ANSWER, GROUPS_OPEN, groupOf, groupId, scoutRunsIn, settingsPlace, SETTINGS_OPEN, settingGroupOf, settingGroupId, PANEL_TABS, CHOICE_KEYS, type ChoiceKey, type ViewFile, type Line, type PanelAction, type PanelHit, type PanelKey, type PanelGroup, type PanelTab, type BandHit } from './board-view'
import { SETTING_GROUPS, isScoutRunReport, taskReports, parseSettingValue, settingChoices, settingInfo, settingValue, isSettingPage, everyText, everyMinutesOf, type SettingName, type ScoutEditField } from '../board'
import type { SymccScout } from '../../types'

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
  readonly renderer: { readonly width?: number }
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
  /** the panel's state: the tab, the open task or scout ('' = the list), the open run of that scout, the cursor, the
   *  open groups, the open Settings groups (their titles) and the scroll */
  state: () => { tab: PanelTab; opened: string; run: string; cursor: number; groups: Record<PanelGroup, boolean>; settingsOpen: string[]; scroll: number }
  /** runs one of the panel's keys, as the keymap does */
  press: (key: PanelKey, sessionID: string) => Promise<void>
  stop: () => void
}

/** The keymap bindings of the panel's keys. */
const KEY_BINDS: Record<PanelKey, string> = {
  up: 'up', down: 'down,j', open: 'return', back: 'b,left', close: 'escape',
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
  const [tab, setTab] = r.createSignal<PanelTab>('tasks')
  // the open run of the open scout ('' = the scout's page), the cursor over its page's runs, and the run's report
  // (undefined while it is read, null when it can't be)
  const [run, setRun] = r.createSignal('')
  const [runCursor, setRunCursor] = r.createSignal(0)
  const [report, setReport] = r.createSignal<string | null | undefined>(undefined)
  // the answer just sent from the open page (T-583), so the page says it was sent
  const [sent, setSent] = r.createSignal<{ id: string; answer: string } | undefined>(undefined)
  // the open task's latest report (T-580), read from its file when the page opens or a newer try's report comes
  const [taskReport, setTaskReport] = r.createSignal<{ file: string; text: string | null | undefined } | undefined>(undefined)
  let width = 80
  // the panel's height in rows, once OpenTUI has laid it out (it bounds the scroll)
  let rows: number | undefined
  /** Back to the list when the open task or scout left the view, and to the scout's page when its open run did. */
  const keepPage = (f: ViewFile | null) => {
    if (opened() && !hasPage(f, opened(), tab())) openPage('')
    if (run() && !scoutRunsIn(f, opened()).some(x => x.run.ended === run())) setRun('')
  }
  const refresh = async () => {
    const f = await readViewFile(dir, d.readText, name)
    setFile(f)
    setNow(d.now())
    // the open task left the view: back to the list, so the list's keys work again
    keepPage(f)
    readTaskReport()
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
  /** Opens a page ('' = back to the list), from its top. */
  const openPage = (id: string) => {
    setOpened(id)
    setSent(undefined)
    setTaskReport(undefined)
    readTaskReport()
    setRun('')
    setRunCursor(0)
    setScroll(0)
  }
  /** Shows another tab, at its list's top. */
  const showTab = (t: PanelTab) => {
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
    return ctx.client.session.command({ sessionID, name: c.name, text: c.text }).then(
      () => (setTimeout(() => void refresh(), 300), true),
      (err: Error) => (say(`/${c.name} ${c.text} failed: ${err?.message ?? err}`, 'error'), false),
    )
  }
  const send = async (sessionID: string, a: PanelAction): Promise<void> => void (await sendOk(sessionID, a))
  /** Whether the cursor is on a page's own rows (a scout's runs, the Roles or Kinds list), not the tab's list. */
  const onPage = () => tab() !== 'tasks' && !!opened()
  const draw = () => {
    return panelLines(file(), { tab: tab(), opened: opened(), run: run(), report: report(), cursor: onPage() ? runCursor() : cursor(), groups: groups(), settingsOpen: settingsOpen(), scroll: scroll(), ...(rows ? { rows } : {}), ...(sent() ? { sent: sent()! } : {}), ...(taskReport() ? { taskReport: taskReport()! } : {}) }, now(), width)
  }
  /** The rows of the Tasks tab's list, even while a task's page is open (whose draw has no rows), so "open this id"
   *  can put the list cursor on that task and b comes back to it (T-568). */
  const listIds = () => panelLines(file(), { tab: 'tasks', opened: '', cursor: cursor(), groups: groups(), scroll: 0 }, now(), width).ids
  /** Changes setting `setting` (Enter or a click on its row): on/off flips, a setting with choices is picked from a
   *  list, the rest is typed; then /<name>-settings NAME VALUE sets it. */
  const changeSetting = async (setting: SettingName, sessionID: string) => {
    const info = settingInfo(setting)
    const f = file()
    if (!info || !f) return
    const now = settingValue(f.view, setting)
    const choices = settingChoices(setting, f.view.notify_choices)
    let value: string | undefined
    if (info.kind === 'onoff') value = now === 'on' ? 'off' : 'on'
    else {
      asking = setting
      if (choices.length) value = await ctx.ui.dialog.select({ title: `${setting} (now ${now})`, options: choices.map(c => ({ title: c === now ? `${c} (now)` : c, value: c })) })
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
        { title: 'Instructions', value: 'prompt' },
      ],
    })
    if (!field) return
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
  /** The Settings tab's keys: the list moves, changes a setting or opens the Roles or Kinds page; that page moves and
   *  opens a role or kind; its page turns it off or on (o) or resets it (r); b goes back one page. */
  const pressSettings = async (key: PanelKey, sessionID: string) => {
    const f = file()
    const open = opened()
    const ids = draw().ids
    const [cur, setCur] = open ? [runCursor, setRunCursor] : [cursor, setCursor]
    if (key === 'up' || key === 'down') return void setCur(moveCursor(cur(), key === 'up' ? -1 : 1, ids.length))
    const place = open ? settingsPlace(f, open) : null
    if (key === 'back') return place?.def ? openPage(place.list) : open ? openPage('') : showTab('tasks')
    if (key === 'open' && ids.length && !place?.def) {
      const id = ids[moveCursor(cur(), 0, ids.length)]!
      const g = open ? null : settingGroupOf(id)
      if (g) return toggleSettingGroup(g)
      return open || isSettingPage(id) ? openPage(id) : changeSetting(id as SettingName, sessionID)
    }
    const d = place?.def
    if (!d) return
    const def = place.list === 'roles' ? 'role' : 'kind'
    if (key === 'o' && d.canOff) return send(sessionID, { kind: 'def', def, name: d.name, action: d.off ? 'on' : 'off' })
    if (key === 'r' && d.canReset) return send(sessionID, { kind: 'def', def, name: d.name, action: 'reset' })
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
      return
    }
    if (run()) return void (key === 'back' && openRun(''))
    if (key === 'back') return openPage('')
    if (key === 'up' || key === 'down') return void setRunCursor(moveCursor(runCursor(), key === 'up' ? -1 : 1, ids.length))
    if (key === 'open' && ids.length) return openRun(ids[moveCursor(runCursor(), 0, ids.length)]!)
    const offered = panelKeys(f, open, 'scouts').map(k => k.word)
    const sc = f?.view.scouts.find(x => x.name === open)
    if (key === 'r' && offered.includes('run now')) return send(sessionID, { kind: 'scout', scout: open })
    if (key === 'p' && sc) return send(sessionID, { kind: 'scout', scout: open, paused: !sc.paused })
    if (key === 'e' && sc) return editScout(sc, sessionID)
  }
  const press = async (pressed: PanelKey, sessionID: string) => {
    // Esc closes the panel (OpenCode 2.3 leaves closing to the panel's own keys)
    if (pressed === 'close') return ctx.ui.panel.close()
    // k moves up (as ↑), except on a task's page that has an action on k (Stash to backlog, Keep as a note)
    const onTask = tab() === 'tasks' && opened() ? file()?.view.tasks.find(x => x.id === opened()) : undefined
    const key: PanelKey = pressed === 'k' && !(onTask && panelTaskActions(onTask).some(a => a.key === 'k')) ? 'up' : pressed
    const to = TAB_OF[key]
    if (to) return showTab(to)
    const f = file()
    keepPage(f)
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
      return
    }
    if (key === 'back') return openPage('')
    // the task's own actions (core's taskActions, panelTaskActions), each by its key, sent as a slash command
    const t = f?.view.tasks.find(x => x.id === open)
    const act = t ? panelTaskActions(t).find(x => x.key === key) : undefined
    const command = act ? TASK_ACTION_COMMANDS[act.id] : undefined
    if (command === 'reject') {
      const ask = act!.id === 'ask-more'
        ? { title: `Ask more on ${open}`, description: 'What else to find out; it gets a fresh try with your question', placeholder: 'your follow-up question' }
        : { title: `Reject ${open}`, description: 'What is wrong and what to change, for the next worker', placeholder: 'the reason' }
      const reason = (await ctx.ui.dialog.prompt(ask))?.trim()
      if (reason) await send(sessionID, { kind: 'reject', id: open, reason })
      return
    }
    if (command === 'approve' || command === 'diff') return send(sessionID, { kind: command, id: open })
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
    // a number key picks that choice of the page, as a click on its line does (T-583)
    const n = CHOICE_KEYS.indexOf(key as ChoiceKey)
    if (n >= 0) return pick(n + 1, sessionID)
    if (key !== 'a' || !panelKeys(f, open).some(k => k.word === 'answer')) return
    const choices = answerOptions(f, open)
    const picked = choices.length > 1 ? await ctx.ui.dialog.select({ title: `Answer ${open}`, options: choices.map(c => ({ title: c, value: c })) }) : OWN_ANSWER
    if (picked) await answerWith(picked, sessionID)
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
    const ids = draw().ids
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
  const drawn = <H,>(where: string, make: () => { lines: Line[]; hits: (H | null)[] }, onHit?: (hit: H) => void) => {
    try {
      const got = make()
      return drawLines<H>(r, ctx.theme, got.lines, got.hits, onHit)
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
        r.insert(col, () => {
          if (input.name !== BOARD_PANEL) return null
          width = Math.max(20, (input.width || 80) - 2)
          const h = (col as { height?: unknown }).height
          rows = typeof h === 'number' && h > 0 ? h : undefined
          panelSession = input.sessionID
          return drawn('board panel', draw, onHit)
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
    if (!ctx.ui.panel.open(BOARD_PANEL)) say(`Open or start a session first: the ${name} board opens next to a session (then /${name}-board, or "${name} board" in the command palette, ctrl+p).`)
  }
  const clickBand = (hit: BandHit) => {
    if ('board' in hit) return openBoard()
    if (ctx.ui.panel.current()?.name !== BOARD_PANEL && !ctx.ui.panel.open(BOARD_PANEL)) return say(`Open or start a session first: the ${name} board opens next to a session.`)
    if (tab() !== 'tasks') showTab('tasks')
    const at = listIds().indexOf(hit.open)
    if (at >= 0) setCursor(at)
    if (hasPage(file(), hit.open)) openPage(hit.open)
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
