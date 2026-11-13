// What the plugin holds while it is loaded, in one place: the plugin's name, the panel's state
// values, and every value the other modules change. They all use these (S, the maps and sets)
// directly, never a copy, so a change made in one module is seen by all.
import { type EngineInterface, atom, read, update } from 'claude-code'
import type { SymccView, SymccScout } from '../../types'
import { type RoleDef, type SettingName, type GitState, type Board, type Heard, type Notify, emptyHeard } from '../board'
import { namesFor, DEFAULT_NAME, cleanName } from '../name'
import type { Players } from './voice'

export type $ = EngineInterface

// ---------------- the plugin's name ----------------
// Everything made from the name (data folder, branches, agent types, tool names, text) comes
// from S.N. It starts as DEFAULT_NAME and is set once, from $.plugin.name (plugin.json), the
// first time any hook runs: every hook calls useName($) first.

// The one exception: the panel's state values. Claude Code reads which values a plugin keeps
// from its code before it runs, so their owner must be written out here as text. It must be
// the plugin's name: on a rename, change it in these four lines and in types/index.d.ts too.
/** which task the board panel has open; '' = the list */
const opened = atom({ plugin: 'symcc', key: 'opened' } as const, '')
/** which view the board panel shows: 'scouts', or anything else for the tasks; kept while the panel is open */
const tab = atom({ plugin: 'symcc', key: 'tab' } as const, '')
/** which scout the Scouts view has open; '' = the list */
const scoutOpen = atom({ plugin: 'symcc', key: 'scout' } as const, '')
const view = atom({ plugin: 'symcc', key: 'view' } as const, { tasks: [], working: [], scouts: [], mode: 'auto', test_commands: [] } as SymccView, { shape: 'view-1' })

// The loader lets read and update take only an atom written in the same file, so the other
// modules read and change these four through the functions below.
export function readOpened($: $) {
  return read($, opened)
}
export function updateOpened($: $, change: (value: string) => string) {
  return update($, opened, change)
}
export function readTab($: $) {
  return read($, tab)
}
export function updateTab($: $, change: (value: string) => string) {
  return update($, tab, change)
}
export function readScoutOpen($: $) {
  return read($, scoutOpen)
}
export function updateScoutOpen($: $, change: (value: string) => string) {
  return update($, scoutOpen, change)
}
export function readView($: $) {
  return read($, view)
}
export function updateView($: $, change: (value: SymccView) => SymccView) {
  return update($, view, change)
}

// ---------------- what this module holds while it is loaded ----------------
// A hot reload starts these over: the board itself is always on disk, and a task
// whose worker was lost to a reload goes back to "todo" at session.start.

/** Every value of the plugin that is set again while it runs; the other modules use S.<name>, never a copy. */
export const S = {
  N: namesFor(DEFAULT_NAME),
  named: false,
  root: '',
  /** whether the plugin is on, as the board said when it was last read (see load); for the places that can't wait */
  enabledNow: true,
  /** the worker roles: the plugin's roles/ with the project's .<name>/roles/ over them (see loadRoles) */
  roles: [] as RoleDef[],
  /** the home folder, to shorten it to "~" where the project's path is shown */
  home: '',
  watchdog: null as { cancel(): void } | null,
  leadTimer: null as { cancel(): void } | null,
  writing: Promise.resolve() as Promise<unknown>,
  /** this session's id, and whether it drives the board (only the driver starts work; see .<name>/lead.json) */
  me: '',
  driving: false,
  beat: null as { cancel(): void } | null,
  /** the Settings view's edit box (numbers, test_commands): which setting, what is typed, the last error */
  settingEdit: null as { name: SettingName; value: string; error: string } | null,
  /** the Settings view's pick list (mode, target_branch): which setting and its choices */
  settingPick: null as { name: SettingName; options: string[] } | null,
  /** set by pump when target_branch doesn't exist (no work starts then); '' when it does */
  missingBranch: '',
  /** the target_branch the lead was last told is missing, so it is told once, not every check */
  toldMissing: '',
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
  draft: null as ScoutDraft | null,
  /** the "new scout" name box on the Scouts view, or null when it isn't shown */
  naming: null as { name: string; error: string } | null,
  /** the changes of a task in review shown in the board panel: `file` '' = all files; null = not shown */
  diffOpen: null as { task: string; file: string } | null,
  /** the reason box for rejecting a task in review from the board panel, or null when it isn't shown */
  rejecting: null as { task: string; reason: string } | null,
  /** the role pick list on an open task in the board panel: the task and the role names; null when it isn't shown */
  rolePick: null as { task: string; options: string[] } | null,
  /** which try's report the open task shows (its try number); null = the latest */
  reportTry: null as { task: string; try: number } | null,
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
}

/** Takes the plugin's name from plugin.json (via $.plugin.name), once; DEFAULT_NAME if it has none. */
export function useName($: $) {
  if (S.named) return
  S.named = true
  const name = cleanName($.plugin.name)
  if (name === S.N.name) return
  S.N = namesFor(name)
}

/** The view as published: SymccView plus the facts the panel's banner shows. */
export type PaneView = SymccView & Partial<Pick<Board, 'target_branch' | 'max_parallel' | 'max_minutes' | 'auto_retries' | 'archive_days' | 'archived' | 'archived_done' | 'open_on_start' | 'notify' | 'enabled'> & { driving: boolean; notify_choices: Notify[]; branch_note: string; git_state: GitState }>

/** the role files already reported as skipped (file → reason), so the owner and the lead hear it once */
export const skippedRoles = new Map<string, string>()
export type Worker = { task: string; worktree: string; branch: string; since: number }
export const workers = new Map<string, Worker>() // agentId → work
/** tasks this copy has claimed and is starting a worker for (not yet in `workers`) */
export const starting = new Set<string>()
/** tasks whose worker finished and whose work is being checked and merged now */
export const finishing = new Set<string>()
export const scoutRuns = new Map<string, string>() // agentId → scout name
/** agents this plugin has stopped: every tool they try is refused, so they can't change anything and end soon */
export const stopped = new Set<string>()
/** failed tasks the lead has already been reminded about (task id → its updated_at then) */
export const reminded = new Map<string, string>()
export const scoutState = new Map<string, SymccScout>()
export const timers: { cancel(): void }[] = []
export const leadQueue: string[] = []
/** the owner's own actions since the last board update: short lines put at the top of the next one (see noteForLead) */
export const meanwhile: string[] = []
/** task id → spawns in a row that failed only because the plugin wasn't ready yet (see isNotReady) */
export const notReady = new Map<string, number>()
/** the older days ("YYYY-MM-DD") the owner has opened in the board panel; kept only while the panel is open */
export const openDays = new Set<string>()
/** the scout being edited in the board panel (its edit mode), or null; `isNew` for one made with "new scout" */
export type ScoutDraft = { scout: string; isNew: boolean; every: string; model: string; body: string; error: string }

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
