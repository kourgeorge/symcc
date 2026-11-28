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
//     with /<name>-settings NAME VALUE, and the Roles and Task types pages under Settings turn a role or task type off or on
//     (o) or reset it to the built-in one (r) with /<name>-settings role|type <name> on|off|reset; and (T-706) as on
//     Claude Code's panel, edit it (e: an edit page with Save and Cancel, the changed boxes sent in one /<name>-settings
//     role|type <name> save {...}), remove an added one (d, after a yes), make a new one (n on the Roles or Kinds
//     page: /<name>-settings role|type NAME add, then its edit page) and a new scout (n on the Scouts tab: /<name>-scout
//     NAME new INSTRUCTIONS); the banner's Set up git (g) asks for a yes, then sends /<name>-settings git setup;
//   - session.composer.top: the band above the prompt, like Claude Code's (the header line, a click on it opens or closes the board panel, T-567; then the questions, and
//     the tasks that need the owner or run).
// What is drawn comes from board-view.ts (bandLines, panelLines), made with hooks/core's helpers; this file only
// turns those lines into OpenTUI elements (box and text) with Solid signals, and wires the keys and the mouse (T-558:
// OpenTUI gives every box and text onMouseUp and onMouseScroll, and a click bubbles up from the text under it to its
// row and the panel, as OpenCode's own sidebar and panels use them; OpenCode turns the mouse on unless its tui
// config says mouse: false). OpenCode's TUI
// modules (Solid and OpenTUI's Solid renderer) are passed in (TuiRuntime), so this file type-checks and its tests
// run without them. The names and shapes in tui-draw.ts are @opencode/plugin 2.3.0's tui Context (only what is used).
// T-815 split it in four: tui-draw.ts (the types and the OpenTUI drawing helpers), tui-dialogs.ts (the
// ctx.ui.dialog prompts), tui-keys.ts (the key and mouse handlers); this file keeps the panel's signals (handed to
// the other two as one TuiState object), the two slots, the timer, startTui and loadTuiRuntime.
import { DEFAULT_NAME, dataDir } from '../name'
import { bandDraw, panelLines, LETTER_KEYS, type LetterKey, hasPage, actionCommand, PANEL_MARK, GROUPS_OPEN, scoutRunsIn, settingsPlace, SETTINGS_OPEN, CHOICE_KEYS, approveSent, NEW_OPEN_MS, type DefDraft, type ApproveSent, type ChoiceKey, type ViewFile, type Line, type PanelAction, type PanelHit, type PanelKey, type PanelGroup, type PanelTab, type BandHit } from './board-view'
import { SETTING_GROUPS, isScoutRunReport, type SettingName } from '../board'
import { resolveReport, type ReportPick } from '../core/task-sections'
import { PARTS_KEY, safePartsFile, viewStubFilled, withViewParts } from '../core/board-parts'
import { searchParts } from '../core/search-parts'
import { panelRows, drawLines, drawPanel, readViewFile, type TuiBoard, type TuiContext, type TuiDeps, type TuiMouseEvent, type TuiRuntime, type TuiRuntimeLoaders, type TuiState } from './tui-draw'
import { makeDialogs } from './tui-dialogs'
import { makeKeys } from './tui-keys'

// what moved to tui-draw.ts (T-815), still exported from here
export { colorOf, drawLines, drawPanel, FOOTER_LINES, panelRows, readViewFile, SCREEN_ROWS_AROUND, viewPaths, WHEEL_LINES } from './tui-draw'
export type { TuiBoard, TuiContext, TuiDeps, TuiKeyCommand, TuiKeyLayer, TuiMouseEvent, TuiNode, TuiPanelInput, TuiRuntime, TuiRuntimeLoaders, TuiState } from './tui-draw'
export type { PanelKey, PanelHit, PanelTab }

/** The panel's name for ui.panel.open (OpenCode shows the session.panel claims for the open name). */
export const BOARD_PANEL = 'symcc.board'

/** How often the view file is read again (and the times redrawn), in ms. */
export const REFRESH_MS = 1000

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

/** The keymap bindings of the panel's keys: k and j always move (as ↑ and ↓), on every page; no action has them.
 *  [ and ] go to the previous and the next task or scout of the list a page was opened from (T-751). */
export const KEY_BINDS: Record<PanelKey, string> = {
  up: 'up,k', down: 'down,j', open: 'return', back: 'b,left', close: 'escape', prev: '[', next: ']',
  ...(Object.fromEntries(LETTER_KEYS.map(k => [k, k])) as Record<LetterKey, string>),
  ...(Object.fromEntries(CHOICE_KEYS.map(k => [k, k])) as Record<ChoiceKey, string>),
}

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
  // T-945: the whole backlog shown (Enter or a click on its "… N more" row), as the terminal's S.backlogAll
  const [backlogAll, setBacklogAll] = r.createSignal(false)
  // T-946: the older days open in the Done group ("2026-11-22"), as the terminal's openDays
  const [openDays, setOpenDays] = r.createSignal<string[]>([])
  const [scroll, setScroll] = r.createSignal(0)
  // the Settings groups open (T-585), and the setting whose pick list or box is open ('' = none)
  const [settingsOpen, setSettingsOpen] = r.createSignal<string[]>([...SETTINGS_OPEN])
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
  // T-1104: the agent picked in the page's Runs section; its report is the one read (none: the latest worker report)
  const [taskPick, setTaskPick] = r.createSignal<ReportPick | undefined>(undefined)
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
  let width = 80
  // the panel's height in rows (panelRows): it bounds the scroll, and the panel is drawn exactly that high, so the
  // footer stays at the bottom and no row of a longer page is left over; OpenTUI says when the box's size changes
  const [rows, setRows] = r.createSignal<number | undefined>(undefined)
  /** Back to the list when the open task or scout left the view, and to the scout's page when its open run did. */
  const keepPage = (f: ViewFile | null) => {
    if (opened() && !hasPage(f, opened(), tab())) openPage('')
    if (run() && !scoutRunsIn(f, opened()).some(x => x.run.ended === run())) setRun('')
  }
  // T-675: a done or dropped task's long parts (timeline, details, ...) are not in the view file; its page reads them
  // from its parts file (.<name>/tasks/T-n.json), read again on each refresh while the page is open
  let rawFile: ViewFile | null = null
  let parts: { id: string; file: string; text: string | null } | undefined
  const openTask = (f: ViewFile | null) => (f && tab() === 'tasks' && opened() ? f.view.tasks.find(x => x.id === opened()) : undefined)
  const withParts = (f: ViewFile | null): ViewFile | null => {
    if (!f) return f
    const t = openTask(f) as (Record<string, unknown> & { id: string }) | undefined
    const p = t && parts && parts.id === t.id && parts.file === t[PARTS_KEY] ? parts : undefined
    // a slim task is drawn with empty details and timeline until (or if never) its parts are read
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
  /** T-841: /symcc-enable writes a one-time "open now" mark with its session's id into the view file.
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
  /** Opens the page of the role, kind or scout just made here once the view file has it (a new role or task type in its
   *  edit mode, as Claude Code's New role does). */
  const openMade = () => {
    const p = s.pendingOpen
    if (!p) return
    // the engine refused it after all (or it never came): stop waiting, so it doesn't open later
    if (tab() !== p.tab || d.now() - p.at > NEW_OPEN_MS) return void (s.pendingOpen = undefined)
    if (!hasPage(file(), p.id, p.tab)) return
    s.pendingOpen = undefined
    openPage(p.id)
    const place = p.edit ? settingsPlace(file(), p.id) : null
    if (place?.def) openEdit(place.list, place.def)
  }
  /** Reads the report the open task's page shows (the agent picked in Runs, else the latest worker report), unless it is the one already read (or being read). */
  const readTaskReport = () => {
    const f = file()
    const t = tab() === 'tasks' && opened() ? f?.view.tasks.find(x => x.id === opened()) : undefined
    const shown = t ? resolveReport(t, taskPick()) : null
    if (!f || !shown) return void (taskReport() && setTaskReport(undefined))
    if (taskReport()?.file === shown.file) return
    const id = opened()
    setTaskReport({ file: shown.file, text: undefined })
    void d.readText(`${f.root}/${shown.file}`).then(
      text => opened() === id && taskReport()?.file === shown.file && setTaskReport({ file: shown.file, text }),
      () => opened() === id && taskReport()?.file === shown.file && setTaskReport({ file: shown.file, text: null }),
    )
  }
  /** T-1104: shows the report of `p` (an agent line of Runs, or a try's number key) on the open task's page. */
  const pickReport = (p: ReportPick) => {
    setTaskPick(p)
    readTaskReport()
  }
  // T-700: a task opened from the Live tab goes back there (to its lane) on b, as on the terminal panel and VS Code;
  // T-751: its page says "‹ Live" then (fromLive), and [ and ] go through the Live tab's tasks
  const [fromLive, setFromLive] = r.createSignal(false)
  /** Opens a page ('' = back to the list), from its top. */
  const openPage = (id: string) => {
    s.backTo = undefined
    setFromLive(false)
    setEdit(undefined)
    setOpened(id)
    setSent(undefined)
    setTaskReport(undefined)
    setTaskPick(undefined)
    readTaskReport()
    readTaskParts()
    setRun('')
    setRunCursor(0)
    setScroll(0)
  }
  /** Shows another tab, at its list's top. */
  const showTab = (t: PanelTab) => {
    s.pendingOpen = undefined
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
  /** T-946: opens or folds an older day's row in the Done group. */
  const toggleDay = (day: string) => setOpenDays(openDays().includes(day) ? openDays().filter(d => d !== day) : [...openDays(), day])
  /** Opens or closes Settings group `title`; closing it cancels a pick list or box left open for a setting in it
   *  (its answer is not sent), as on the Claude Code board. */
  const toggleSettingGroup = (title: string) => {
    const open = settingsOpen().includes(title)
    setSettingsOpen(open ? settingsOpen().filter(t => t !== title) : [...settingsOpen(), title])
    if (open && SETTING_GROUPS.find(g => g.title === title)?.items.includes(s.asking as SettingName)) s.asking = ''
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
    return panelLines(file(), { tab: tab(), opened: opened(), run: run(), report: report(), cursor: onPage() ? runCursor() : cursor(), groups: groups(), backlogAll: backlogAll(), openDays: openDays(), settingsOpen: settingsOpen(), scroll: scroll(), ...(rows() ? { rows: rows()! } : {}), ...(sent() ? { sent: sent()! } : {}), ...(taskReport() ? { taskReport: taskReport()! } : {}), ...(taskPick() ? { taskPick: taskPick()! } : {}), pageCursor: runCursor(), ...(approving() ? { approving: approving()! } : {}), ...searchChoice(), ...(edit() ? { edit: edit()! } : {}), ...(fromLive() ? { from: 'live' as const } : {}) }, now(), width)
  }
  /** The rows of the Tasks tab's list, even while a task's page is open (whose draw has no rows), so "open this id"
   *  can put the list cursor on that task and b comes back to it (T-568). */
  const listIds = () => panelLines(file(), { tab: 'tasks', opened: '', cursor: cursor(), groups: groups(), backlogAll: backlogAll(), openDays: openDays(), scroll: 0, ...searchChoice() }, now(), width).ids
  /** Sets the list's search ('' = none), from the list's top. */
  const searchFor = (text: string) => {
    setSearch(text.trim())
    setCursor(0)
    setScroll(0)
    loadSearch()
  }
  const s: TuiState = { d, name, file, now, opened, tab, run, draw, cursor, setCursor, runCursor, setRunCursor, scroll, setScroll, edit, setEdit, search, searchFor, searchChoice, approving, setApproving, setSent, setBacklogAll, fromLive, setFromLive, openPage, showTab, openRun, toggle, toggleDay, toggleSettingGroup, keepPage, listIds, say, send, sendOk, pickReport, asking: '', pendingOpen: undefined, backTo: undefined }
  // the dialogs (tui-dialogs.ts) and the keys and mouse (tui-keys.ts) work on the panel through `s`
  const dialogs = makeDialogs(ctx, s)
  const { openEdit } = dialogs
  const { press, click, wheel, openOnList } = makeKeys(ctx, s, dialogs)
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
    state: () => ({ tab: tab(), opened: opened(), run: run(), cursor: onPage() ? runCursor() : cursor(), groups: groups(), backlogAll: backlogAll(), openDays: openDays(), settingsOpen: settingsOpen(), scroll: scroll() }),
    press,
    stop: () => {
      stopTimer()
      for (const x of disposers.splice(0)) x()
    },
  }
}
