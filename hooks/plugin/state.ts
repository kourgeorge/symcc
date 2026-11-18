// What the plugin holds while it is loaded, in one place: the plugin's name, the host's words, and every value the
// other modules change. They all use these (S, the maps and sets) directly, never a copy, so a change made in one
// module is seen by all.
import type { SymccView, SymccScout, SymccTokens } from '../../types'
import { type RoleDef, type KindDef, type SettingName, type GitState, type Board, type OwnerQuestion, type Heard, type Notify, emptyHeard, type PlanState, emptyPlan, versionOf } from '../board'
import { namesFor, DEFAULT_NAME, cleanName } from '../name'
import type { Players } from './voice'
import { type Host, type HostWords, type PanelValues, SYMCC_WORDS } from '../host'

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
  readTab: async () => '',
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
export function updateView(host: Host, change: (value: SymccView) => SymccView) {
  return panelOf(host).updateView(change)
}

// ---------------- what this module holds while it is loaded ----------------
// A hot reload starts these over: the board itself is always on disk, and a task
// whose worker was lost to a reload goes back to "todo" at session.start.

/** S's values as a load starts them (a fresh object each call); also used by the tests' resetPlugin(). */
export const startS = () => ({
  N: namesFor(DEFAULT_NAME),
  /** the host's words (see HostWords); toolName below makes a tool's name from them */
  W: SYMCC_WORDS as HostWords,
  named: false,
  /** the plugin's version from plugin.json, for the board's titles; '' = not known (see loadVersion) */
  version: '',
  versionRead: false,
  root: '',
  /** whether the plugin is on, as the board said when it was last read (see load); for the places that can't wait */
  enabledNow: true,
  /** the worker roles: the plugin's roles/ with the project's .<name>/roles/ over them (see loadRoles) */
  roles: [] as RoleDef[],
  /** the task kinds: the plugin's kinds/ with the project's .<name>/kinds/ over them (see loadKinds) */
  kinds: [] as KindDef[],
  /** the home folder, to shorten it to "~" where the project's path is shown */
  home: '',
  watchdog: null as { cancel(): void } | null,
  leadTimer: null as { cancel(): void } | null,
  writing: Promise.resolve() as Promise<unknown>,
  /** this session's id, and whether it drives the board (only the driver starts work; see .<name>/lead.json) */
  me: '',
  driving: false,
  /** board.json's mtime (ms) when this session last read, saved or looked at it; null = not known yet. A session that
   *  does not drive reloads and redraws the board on its heartbeat when the file's mtime differs from this (T-429) */
  boardMtime: null as number | null,
  beat: null as { cancel(): void } | null,
  /** the Settings view's edit box (numbers, test_commands): which setting, what is typed, the last error */
  settingEdit: null as { name: SettingName; value: string; error: string } | null,
  /** the Settings view's pick list (mode, notify): which setting and its choices */
  settingPick: null as { name: SettingName; options: string[] } | null,
  /** the Settings view's groups (SETTING_GROUPS titles) the owner has opened; all start closed. Kept while the session lasts, not on disk */
  settingsOpen: [] as string[],
  /** what the last git check found (see probeGit); work starts only when 'ok' */
  gitState: 'ok' as GitState,
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
  /** the role pick list on an open task in the board panel: the task and the role names; null when it isn't shown */
  rolePick: null as { task: string; options: string[] } | null,
  /** the task whose "Your answer" box is open after Answer… was pressed (a waiting task with answer buttons); null = not open */
  answering: null as string | null,
  /** which try's report the open task shows (its try number); null = the latest */
  reportTry: null as { task: string; try: number } | null,
  /** the task whose report is shown whole on VS Code's task page (else only its first part); null = none */
  reportAll: null as string | null,
  /** the folds opened on VS Code's task page (Files it may change, Waits for, Time and cost: closed by default), for the task shown; null = all closed */
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
   * tasks added to the backlog during it (see core/plan.ts and plugin/plan.ts). Per session: each session's plugin
   * keeps its own; only the driving session's counts for starting work. on null = not seen yet: behave as before.
   */
  plan: emptyPlan() as PlanState,
})

/** Every value of the plugin that is set again while it runs; the other modules use S.<name>, never a copy. */
export const S = startS()

/** Takes the plugin's name from plugin.json (via host.plugin.name; DEFAULT_NAME if it has none) and the host's words, once. */
export function useName(host: Pick<Host, 'plugin' | 'words'>) {
  if (S.named) return
  S.named = true
  S.W = host.words
  const name = cleanName(host.plugin.name)
  if (name === S.N.name) return
  S.N = namesFor(name)
}

/** Reads the plugin's version from its plugin.json (in host.plugin.root) into S.version, once, for the titles.
 *  A missing or broken file leaves no version (''); it never throws. */
export async function loadVersion(host: Pick<Host, 'plugin' | 'fs'>) {
  if (S.versionRead) return
  S.versionRead = true
  const text = await host.fs.read(`${host.plugin.root}/.claude-plugin/plugin.json`).catch(() => '')
  S.version = versionOf(text)
}

/** What the model calls symcc's tool `tool` (e.g. "board") on this host (see HostWords). */
export const toolName = (tool: string): string => S.W.tool(S.N.name, tool)

/** The view as published: SymccView plus the facts the panel's banner shows. */
export type PaneView = SymccView & Partial<Pick<Board, 'max_parallel' | 'max_minutes' | 'auto_retries' | 'archive_days' | 'archived' | 'archived_done' | 'open_on_start' | 'notify' | 'scout_findings' | 'tests_with_changes' | 'checker' | 'enabled'> & { /** the lead's open questions for the owner (see core/questions.ts), oldest first; absent when none */ questions: OwnerQuestion[]; driving: boolean; /** the branch checked out now: new tasks merge into it (see homeBranch) */ branch: string; notify_choices: Notify[]; branch_note: string; git_state: GitState; plan_mode: boolean }>

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
/** of those, the workers whose start waits in the start queue (see plugin/starts.ts): task id → work; a stop takes them out */
export const queuedWorkers = new Map<string, Worker>()
/** tasks whose worker finished and whose work is being checked and merged now */
export const finishing = new Set<string>()
export const scoutRuns = new Map<string, string>() // agentId → scout name
/** How a checker's run ended: its answer (and tokens), or `answer` null when it was stopped or never answered (`why`). */
export type CheckerEnd = { answer: string | null; why?: string; tokens?: SymccTokens }
/**
 * checkers running now (the checker setting, see plugin/checker.ts): agentId → its task, the task's folder it runs in
 * (its Bash is kept inside it, see checkEdit), and how to hand its end to the step waiting for it
 */
export const checkerRuns = new Map<string, { task: string; worktree: string; end: (e: CheckerEnd) => void }>()
/** agents this plugin has stopped: every tool they try is refused, so they can't change anything and end soon */
export const stopped = new Set<string>()
/** Whether agent `agentId` is one of symcc's own that this copy tracks now: a worker, a checker, a scout, or one it stopped. */
export const isOwnAgent = (agentId: string | undefined): agentId is string =>
  !!agentId && (workers.has(agentId) || checkerRuns.has(agentId) || scoutRuns.has(agentId) || stopped.has(agentId))
/**
 * Ends an agent's work: from now on every tool it tries is refused, and it is told to stop. It is in `stopped`
 * before the first await, so a caller that doesn't wait (`void halt(...)`) still refuses its tools at once.
 */
export async function halt(host: Host, agentId: string, why: string) {
  stopped.add(agentId)
  await host.agents.stop(agentId, `Stop now: ${why}. Don't change anything else; answer "stopped" and end.`).catch(() => undefined)
}
/** failed tasks the lead has already been reminded about (task id → its updated_at then) */
export const reminded = new Map<string, string>()
/** the board health findings already told to the lead (their keys; see newFindings) */
export const healthTold = new Set<string>()
export const scoutState = new Map<string, SymccScout>()
export const timers: { cancel(): void }[] = []
export const leadQueue: string[] = []
/** the owner's own actions since the last board update: short lines put at the top of the next one (see noteForLead) */
export const meanwhile: string[] = []
/** task id → spawns in a row that failed only because the plugin wasn't ready yet (see notReadyYet in host.ts) */
export const notReady = new Map<string, number>()
/** task id → checker starts in a row, after a reload (see checkAgain in workers.ts), that failed only because the agent type wasn't loaded yet */
export const checkerNotReady = new Map<string, number>()
/** the older days ("YYYY-MM-DD") the owner has opened in the board panel; kept only while the panel is open */
export const openDays = new Set<string>()
/** the scout being edited in the board panel (its edit mode), or null; `isNew` for one made with "new scout" */
export type ScoutDraft = { scout: string; isNew: boolean; every: string; model: string; summary: string; body: string; error: string }

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
/** read changes, by task, its last change and what was asked; forgotten when the panel closes */
export const changesCache = new Map<string, Promise<string>>()

/** tasks being approved (checked and merged) now in this session, so a second approve waits its turn */
export const approving = new Set<string>()
export const tmpWarned = new Set<string>()
