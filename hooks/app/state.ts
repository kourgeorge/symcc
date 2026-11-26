// What the plugin holds while it is loaded, in one place: the plugin's name, the host's words, and every value the
// other modules change. They all use these (S, the maps and sets) directly, never a copy, so a change made in one
// module is seen by all.
import type { SymccView, SymccScout, SymccTokens } from '../../types'
import { type RoleDef, type KindDef, type SettingName, type GitState, type Board, type OwnerQuestion, type Heard, type Notify, emptyHeard, type PlanState, emptyPlan, useAssistantWord, type OffHere } from '../board'
import { namesFor, DEFAULT_NAME, cleanName } from '../name'
import type { DriverFacts } from '../core/driver-notice'
import type { Players } from './voice'
import type { BranchFacts, TodayTeam } from '../core/live'
import type { TaskBranchFacts } from '../core/task-branch'
import { type Host, type HostWords, type PanelValues, SYMCC_WORDS, manifestVersion, wordsOf } from '../host'

// ---------------- the plugin's name and the host's words ----------------
// Everything made from the name (data folder, branches, text) comes from S.N, and the names that differ from host to
// host (what the model calls symcc's tools, the tools a role may add) from S.W. They start as DEFAULT_NAME and
// SYMCC_WORDS and are set once, from the host (host.plugin.name, from plugin.json, and host.words), the first time
// any hook runs: every hook calls useName(host) first.

// ---------------- the board panel's values ----------------
// A host with a board panel keeps which task, view and scout it has open, and the published view, where its panel
// reads them, and carries them as its Host's ui.panel (PanelValues, in host.ts; for Claude Code see claude/panel.ts).
// The functions below take a Host, because the logic (publish, saveScout, openPane) calls them with one. A host with
// no panel leaves `ui.panel` out (noPanel below).

export type { PanelValues }

/** A host with no board panel: each value reads as its start value, and a change goes nowhere. */
const noPanel: PanelValues = {
  readOpened: async () => '',
  updateOpened: async () => undefined,
  readTab: async () => 'live',
  updateTab: async () => undefined,
  readScoutOpen: async () => '',
  updateScoutOpen: async () => undefined,
  readView: async () => ({ tasks: [], working: [], scouts: [], mode: 'auto', test_commands: [] }) as SymccView,
  updateView: async () => undefined,
}

/** A Host's board panel values, or noPanel for a host without them. */
function panelOf(host: Host): PanelValues {
  return host.ui.panel ?? noPanel
}

export function readOpened(host: Host) {
  return panelOf(host).readOpened()
}
export function updateOpened(host: Host, change: (value: string) => string) {
  return panelOf(host).updateOpened(change)
}
export function readTab(host: Host) {
  return panelOf(host).readTab()
}
export function updateTab(host: Host, change: (value: string) => string) {
  return panelOf(host).updateTab(change)
}
export function readScoutOpen(host: Host) {
  return panelOf(host).readScoutOpen()
}
export function updateScoutOpen(host: Host, change: (value: string) => string) {
  return panelOf(host).updateScoutOpen(change)
}
export function readView(host: Host) {
  return panelOf(host).readView()
}
/**
 * T-891: `v` as the host's panel keeps it, worked out once (`fitted`: it was, so updateView may keep it as it is), and
 * the warning when the panel had to trim it ('' on a host that keeps every task, or when nothing was left out).
 */
export function fitView(host: Host, v: SymccView): { view: SymccView; note: string; fitted: boolean } {
  try {
    const r = panelOf(host).fitView?.(v)
    return r ? { ...r, fitted: true } : { view: v, note: '', fitted: false }
  } catch {
    return { view: v, note: '', fitted: false }
  }
}
/** Sets the published view (`fitted`: `change` gives back a view fitView made). A refused value (too big, or any failure) never fails a board change or a worker start: the next publish tries again. */
export async function updateView(host: Host, change: (value: SymccView) => SymccView, fitted = false) {
  try {
    await panelOf(host).updateView(change, fitted)
  } catch {
    // dropped on purpose, see above
  }
}

// ---------------- what this module holds while it is loaded ----------------
// A hot reload starts these over: the board itself is always on disk, and a task
// whose worker was lost to a reload goes back to "todo" at session.start.

/** S's values as a load starts them (a fresh object each call); also used by the tests' resetPlugin(). */
export const startS = () => ({
  N: namesFor(DEFAULT_NAME),
  /** the host's words (see HostWords); toolName below makes a tool's name from them */
  W: SYMCC_WORDS as Required<HostWords>,
  named: false,
  /** the plugin's version from plugin.json, for the board's titles; '' = not known (see loadVersion) */
  version: '',
  versionRead: false,
  root: '',
  /** whether the plugin is on, as the board said when it was last read (see load); for the places that can't wait */
  enabledNow: true,
  /** T-795: a new project: the folder had no board when the session started and the owner has not run /<name>-enable; symcc is off and writes nothing */
  fresh: false,
  /** T-793: this window only is turned off (/<name>-disable here); never saved, gone when the session ends */
  offHere: false,
  /** T-952: what lead.json said of the driving window at this window's last look, while another window drives (see seeDriver) */
  driver: undefined as DriverFacts | undefined,
  /** T-952: when the owner last typed a prompt here or the lead's turn last ended (saved in lead.json as `active` while this window drives) */
  activeAt: null as number | null,
  /** the worker roles: the plugin's roles/ with the project's .<name>/roles/ over them (see loadRoles) */
  roles: [] as RoleDef[],
  /** the task types: the plugin's kinds/ with the project's .<name>/kinds/ over them (see loadKinds) */
  kinds: [] as KindDef[],
  /** the home folder, to shorten it to "~" where the project's path is shown */
  home: '',
  watchdog: null as { cancel(): void } | null,
  leadTimer: null as { cancel(): void } | null,
  /** a line waiting in leadQueue is urgent (tellLead's `urgent`): the next board update is sent as urgent (LeadSend) */
  leadUrgent: false,
  /** a board update whose send failed waits for this timer (or the next update) to try again (see tellLead) */
  leadRetry: null as { cancel(): void } | null,
  /** the board health findings already told to the lead (their keys; see newFindings); kept per project, and saved in the data folder so a reload keeps them */
  healthTold: new Set<string>(),
  /** the read of that saved list (started once per load) */
  healthLoad: null as Promise<void> | null,
  writing: Promise.resolve() as Promise<unknown>,
  /** this session's id, and whether it drives the board (only the driver starts work; see .<name>/lead.json) */
  me: '',
  driving: false,
  /** T-1098: the owner writes from a chat app: '' = no; 'dam' = DAM's Slack (board updates carry the guide's core and a post line, see app/dam.ts);
   *  else the channel server's name (e.g. "telegram"). Questions go as numbered text and replies are posted to the chat. */
  chat: '',
  /** set by guardStart: this copy runs in a worker's folder and only guards tool calls (no lead, no timers, no board writes) */
  guardOnly: false,
  /** board.json's mtime (ms) of the state this session last drew (publish) or saved; null = not known yet. A session that
   *  does not drive reloads and redraws the board on its heartbeat when the file's mtime differs from this (T-429).
   *  A plain load does not set it, so reading the board just after another session wrote it still redraws (T-431) */
  boardMtime: null as number | null,
  /** board.json's mtime (ms) when this session last loaded or saved it; publish copies it to boardMtime (T-431) */
  readMtime: null as number | null,
  beat: null as { cancel(): void } | null,
  /** the Settings view's edit box (numbers, test_commands): which setting, what is typed, the last error */
  settingEdit: null as { name: SettingName; value: string; error: string } | null,
  /** the Settings view's pick list (mode, notify): which setting and its choices */
  settingPick: null as { name: SettingName; options: string[] } | null,
  /** the Settings view's groups (SETTING_GROUPS titles) the owner has opened; all start closed. Kept while the session lasts, not on disk */
  settingsOpen: [] as string[],
  /** what the last git check found (see probeGit); work starts only when 'ok' */
  gitState: 'ok' as GitState,
  /** the install step for this machine while git is missing (see installStepOf) */
  gitInstall: '',
  /** the git state the lead was last told about, so it is told once, not every check */
  toldGit: 'ok' as GitState,
  /** set while setupGit runs, so a second press waits */
  settingUp: false,
  /** set at the end of session.start: until then pump starts no work (the worker type may not be registered yet) */
  startupDone: false,
  /** whether the owner has opened the Backlog section in the board panel (folded by default); folded again when the panel closes */
  backlogOpen: false,
  /** whether the owner asked to see every backlog item (not just the first BACKLOG_SHOWN); reset when the panel closes */
  backlogAll: false,
  /** whether the owner has opened the Done section in the board panel (folded by default); folded again when the panel closes */
  doneOpen: false,
  /** whether the owner has opened the Dropped section in the board panel (folded by default); folded again when the panel closes */
  droppedOpen: false,
  /** the search on the board panel's Tasks list (f): its text, and `typing` while its box is open; null = no search. Cleared by Enter on the empty box, by [x] clear search, by Esc (when it reaches the panel) and when the panel closes */
  search: null as { text: string; typing: boolean } | null,
  draft: null as ScoutDraft | null,
  /** the "new scout" name box on the Scouts view, or null when it isn't shown */
  naming: null as { name: string; error: string } | null,
  /** the changes of a task in review shown in the board panel: `file` '' = all files; null = not shown */
  diffOpen: null as { task: string; file: string } | null,
  /** the reason box for rejecting a task in review from the board panel, or null when it isn't shown */
  rejecting: null as { task: string; reason: string } | null,
  /** T-954: the task whose Run now asks "T-5 waits on T-3 (running). Start anyway?" on its page, or null */
  runNowAsk: null as string | null,
  /** the role pick list on an open task in the board panel: the task and the role names; null when it isn't shown */
  rolePick: null as { task: string; options: string[] } | null,
  /** the task whose "Your answer" box is open after Answer… was pressed (a waiting task with answer buttons); null = not open */
  answering: null as string | null,
  /** which agent's report the open task shows (try, worker or checker, agent id); null = the latest worker report */
  reportTry: null as { task: string; try: number; kind: 'worker' | 'checker'; id?: string } | null,
  /** the task whose report is shown whole on VS Code's task page (else only its first part); null = none */
  reportAll: null as string | null,
  /** the folds opened on VS Code's task page (Time and cost: closed by default), for the task shown; null = all closed */
  taskFolds: null as { task: string; open: string[] } | null,
  sayTimer: null as { cancel(): void } | null,
  saying: false,
  /** this machine's speech and sound commands (see voice.ts), found once per session; null until looked for */
  players: null as Promise<Players> | null,
  /** the board's notify choice when the queue was last filled (null: none saved, the machine's best) */
  notifyWanted: null as Notify | null,
  /** whether the owner was told the saved notify can't play on this machine (once per session) */
  toldUnplayable: false,
  /** when this session last looked for old tasks to archive (ms; at most once an hour, see archiveOld) */
  lastArchive: 0,
  /** the archive.json text found broken and already reported, so the owner is told once; '' when none */
  archiveBroken: '',
  /** whether the lead was told about a bigger cleanup already (once per session) */
  toldCleanup: false,
  /**
   * Whether this session (the main chat, not a worker or scout) is in plan mode, as last seen on an event, and the
   * tasks added to the backlog during it (see core/plan.ts and app/plan.ts). Per session: each session's plugin
   * keeps its own; only the driving session's counts for starting work. on null = not seen yet: behave as before.
   */
  plan: emptyPlan() as PlanState,
})

/** Every value of the plugin that is set again while it runs; the other modules use S.<name>, never a copy. */
export const S = startS()

/** T-793: whether symcc works in this window: on in the board (not disabled for the project) and not turned off here. */
export const onHere = (b: { enabled?: boolean }): boolean => b.enabled !== false && !S.offHere && !S.fresh

/** Takes the plugin's name from plugin.json (via host.plugin.name; DEFAULT_NAME if it has none) and the host's words, once. */
export function useName(host: Pick<Host, 'plugin' | 'words'>) {
  if (S.named) return
  S.named = true
  S.W = wordsOf(host.words)
  useAssistantWord(S.W.assistant)
  const name = cleanName(host.plugin.name)
  if (name === S.N.name) return
  S.N = namesFor(name)
}

/** Reads the plugin's version through the host (host.plugin.version, else its manifest) into S.version, once, for the titles.
 *  A version that can't be read leaves none (''); it never throws. */
export async function loadVersion(host: Pick<Host, 'plugin' | 'fs'>) {
  if (S.versionRead) return
  S.versionRead = true
  const read = host.plugin.version ?? (() => manifestVersion(host.fs, host.plugin.root))
  S.version = await read().catch(() => '')
}

/** What the model calls symcc's tool `tool` (e.g. "board") on this host (see HostWords). */
export const toolName = (tool: string): string => S.W.tool(S.N.name, tool)

/** The view as published: SymccView plus the facts the panel's banner shows. */
export type PaneView = SymccView & Partial<Pick<Board, 'docs_test_commands' | 'max_parallel' | 'max_minutes' | 'auto_retries' | 'test_minutes' | 'archive_days' | 'archived' | 'archived_done' | 'open_on_start' | 'scout_findings' | 'tests_with_changes' | 'checker'> & { /** T-808: the board is on and this window is not turned off (not the board's own `enabled`) */ on_here: boolean; /** T-808: the notify choice in use now (not the saved one) */ notify_now: Notify; /** T-793: this window is turned off with /<name>-disable here (enabled is false too) */ off_here: OffHere; /** the lead's open questions for the owner (see core/questions.ts), oldest first; absent when none */ questions: OwnerQuestion[]; driving: boolean; /** T-952: what lead.json says of the driving window, while another window drives */ driver: DriverFacts; /** the branch checked out now: new tasks merge into it (see homeBranch); T-808: not a task's work branch */ home_branch: string; notify_choices: Notify[]; branch_note: string; /** T-675: the data files close to the 4 MB read limit, in words (also in branch_note) */ size_note: string; git_state: GitState; /** the install step while git is missing */ git_install: string; plan_mode: boolean; /** T-727: the Live tab's Branches figures (app/branches.ts); absent until read, or with no git or no task branch */ branches: BranchFacts; /** T-769: ▍Today's lead, scout and cost figures (app/lead.ts todayTeam); absent until read or when there are none */ today_team: TodayTeam; /** T-761: the task pages' Branch section facts by task id (app/branches.ts's taskBranchesView): the open tasks with a branch and the latest merged ones */ task_branches: Record<string, TaskBranchFacts>; }>

/** the role files already reported as skipped (file → reason), so the owner and the lead hear it once */
export const skippedRoles = new Map<string, string>()
/** the kind files already reported as skipped (file → reason), so the owner and the lead hear it once */
export const skippedKinds = new Map<string, string>()
/**
 * A running worker. What its try records for its hand-back (its ask_owner question, its refused edits) is kept
 * on its task on the board (try_question, try_refused), not here, so a reload doesn't lose it.
 */
export type Worker = { task: string; worktree: string; branch: string; since: number }
export const workers = new Map<string, Worker>() // agentId → work
/** tasks this copy has claimed and is starting a worker for (not yet in `workers`) */
export const starting = new Set<string>()
/** of those, the workers whose start waits in the start queue (see app/starts.ts): task id → work; a stop takes them out */
export const queuedWorkers = new Map<string, Worker>()
/** tasks whose worker finished and whose work is being checked and merged now */
export const finishing = new Set<string>()
export const scoutRuns = new Map<string, string>() // agentId → scout name
/** How a checker's run ended: its answer (and tokens), or `answer` null when it was stopped or never answered (`why`). */
export type CheckerEnd = { answer: string | null; why?: string; tokens?: SymccTokens }
/**
 * checkers running now (the checker setting, see app/checker.ts): agentId → its task, the task's folder it runs in
 * (its Bash is kept inside it, see checkEdit), and how to hand its end to the step waiting for it
 */
export const checkerRuns = new Map<string, { task: string; worktree: string; end: (e: CheckerEnd) => void; held?: { answer: string; tokens?: SymccTokens } }>()
/** agents this plugin has stopped: every tool they try is refused, so they can't change anything and end soon */
export const stopped = new Set<string>()

/** Tasks whose running checker the lead stopped to move the task to another stage: its result is dropped with no line and no message. */
export const movedAway = new Set<string>()
/** Why a session stops its runs when the owner moves driving the board to another session (/<name>-drive there, see stepDown). */
export const MOVED_WHY = 'the owner moved driving to another session'
/** Why a session stops its runs when another session took the board over (this one stopped answering for too long). */
export const TAKEN_WHY = 'another session drives the board now'
/** T-759: the plain note a run gets when it is stopped because driving the board moved to another session. */
export const DRIVING_MOVED = 'stopped: driving moved to another session'
/** T-759: of the agents in `stopped`, the ones stopped because driving the board moved to another session (MOVED_WHY, TAKEN_WHY). */
export const movedAgents = new Set<string>()
const MOVED_REFUSED_KEY = '__symccMovedRefused'
/**
 * T-759: the agents any copy of symcc loaded in this process refused with the "driving moved" note (movedText), kept
 * on globalThis so every copy sees them: the copy that holds such a scout in scoutRuns (and so ends its run) is not
 * the one that refused it, and counts its run as stopped by this, whatever it answered.
 */
export function movedRefused(): Set<string> {
  const g = globalThis as unknown as Record<string, unknown>
  if (!(g[MOVED_REFUSED_KEY] instanceof Set)) g[MOVED_REFUSED_KEY] = new Set<string>()
  return g[MOVED_REFUSED_KEY] as Set<string>
}
const HALTED_KEY = '__symccHalted'
const HALTED_MAX = 500
/**
 * T-883: the agents any copy of symcc loaded in this process told to stop (halt), kept on globalThis so every copy sees
 * them: after a reload or a takeover, the copy that still tracks such a worker is often not the one that stopped it, and
 * its session then ends on an error that is no real API error (see stoppedBySymcc in workers.ts). Kept small.
 */
export function haltedAnywhere(): Set<string> {
  const g = globalThis as unknown as Record<string, unknown>
  if (!(g[HALTED_KEY] instanceof Set)) g[HALTED_KEY] = new Set<string>()
  return g[HALTED_KEY] as Set<string>
}
function rememberHalted(agentId: string) {
  const s = haltedAnywhere()
  if (s.has(agentId)) return
  if (s.size >= HALTED_MAX) s.delete(s.values().next().value!)
  s.add(agentId)
}
/** Whether agent `agentId` is one of symcc's own that this copy tracks now: a worker, a checker, a scout, or one it stopped. */
export const isOwnAgent = (agentId: string | undefined): agentId is string =>
  !!agentId && (workers.has(agentId) || checkerRuns.has(agentId) || scoutRuns.has(agentId) || stopped.has(agentId))
/**
 * Agents the guards found on the board (T-471: a worker, checker or ended agent of a task, whatever copy of the plugin
 * started it), so a guard that crashes later (guardFailed, which can't read the board) still refuses their calls.
 * Only for that: a hand-back still goes by lateHandBack's own rule. Kept small (rememberOnBoard).
 */
export const boardAgents = new Set<string>()
const BOARD_AGENTS_MAX = 500
/** Notes agent `agentId` as found on the board (see boardAgents). */
export function rememberOnBoard(agentId: string) {
  if (boardAgents.has(agentId)) return
  if (boardAgents.size >= BOARD_AGENTS_MAX) boardAgents.delete(boardAgents.values().next().value!)
  boardAgents.add(agentId)
}
/**
 * Ends an agent's work: from now on every tool it tries is refused, and it is told to stop. It is in `stopped`
 * before the first await, so a caller that doesn't wait (`void halt(...)`) still refuses its tools at once.
 */
export async function halt(host: Host, agentId: string, why: string) {
  stopped.add(agentId)
  rememberHalted(agentId)
  if (why === MOVED_WHY || why === TAKEN_WHY) movedAgents.add(agentId)
  await host.agents.stop(agentId, `Stop now: ${why}. Don't change anything else; answer "stopped" and end.`).catch(() => undefined)
}
/** failed tasks the lead has already been reminded about (task id → its updated_at then) */
export const reminded = new Map<string, string>()
/** T-675: the data files close to the 4 MB read limit (their name as the owner knows it → the warning), shown on the board */
export const sizeNotes = new Map<string, string>()
export const scoutState = new Map<string, SymccScout>()
export const timers: { cancel(): void }[] = []
export const leadQueue: string[] = []
/** the owner's own actions since the last board update: short lines put at the top of the next one (see noteForLead) */
export const meanwhile: string[] = []
/** task id → spawns in a row that failed only because the plugin wasn't ready yet (see notReadyYet in host.ts) */
export const notReady = new Map<string, number>()
/** task id → the id of its checker agent that survived a plugin reload: the next checker step waits for it instead of starting a new one (T-1068) */
export const adoptedCheckers = new Map<string, { id: string; early?: CheckerEnd }>()
/** task id → checker starts in a row, after a reload (see checkAgain in workers.ts), that failed only because the agent type wasn't loaded yet */
export const checkerNotReady = new Map<string, number>()
/** the older days ("YYYY-MM-DD") the owner has opened in the board panel; kept only while the panel is open */
export const openDays = new Set<string>()
/** the scout being edited in the board panel (its edit mode), or null; `isNew` for one made with "new scout" */
export type ScoutDraft = { scout: string; isNew: boolean; every: string; model: string; summary: string; findings: string; body: string; error: string }

/**
 * What reached the lead in this session, for a new task's evidence (see evidenceText): the owner's
 * last typed prompt (from prompt.submit) and when each scout's and worker's report was sent to the lead.
 * Kept in memory only: a new session starts empty.
 */
export const heard: Heard = emptyHeard()

/** task ids merged (or, marked, waiting for the owner) but not yet told; joined into one line so lines never talk over each other */
export const sayQueue: string[] = []

/** task ids whose leftover folder was skipped for uncommitted changes (told once each) */
export const keptDirty = new Set<string>()
/** worker folder → whether its .scratch/ throwaway folder is in use (false: the project keeps files there in git), worked out once (see scratchOn, T-456) */
export const scratchUse = new Map<string, boolean>()
/** read changes, by task, its last change and what was asked; forgotten when the panel closes */
export const changesCache = new Map<string, Promise<string>>()

/** tasks being approved (checked and merged) now in this session, so a second approve waits its turn */
export const approving = new Set<string>()
export const tmpWarned = new Set<string>()
