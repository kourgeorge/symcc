// What symcc's logic (hooks/app/) needs from the program it runs in: files, commands,
// timers, agents, the session, and a few screen calls. Written by hand, with no import from 'claude-code',
// so the logic doesn't depend on Claude Code's types.
//
// First version (T-240, step 1 of docs/research/host-independence.md): the members have the same names and
// shapes as the parts of Claude Code's `$` that symcc uses. Since T-243 (step 4) the agents are in symcc's own words
// (`agents`), and since T-244 (step 5) the lead (`lead`) and the screen (`ui`: `refresh`, and the board panel's values
// in `panel`, or `noUi` for a host with no screen): Claude Code's adapter (claude/host.ts) builds them from its `$`,
// and tests/host.test.ts checks that the result fits. Each parameter is only what symcc passes, and each answer only
// what symcc reads, so another program (an OpenCode plugin's ctx, or plain Node/Bun in a standalone app)
// can be made to fit it too. Since T-246 (step 7) every member is in symcc's own words (`run`, `env`, `agents` with
// their `kind`, `words` for the names that differ from host to host, `lead.usage`), and tests/fake-host.ts is the
// shared fake Host the app logic's tests run on, the model for a new host. Since T-371 (step 8) the Host says what it
// can do (`features`: a panel, a band, how the lead is woken, plan mode, the lead's usage), and symcc falls back to
// text where a feature is missing.

import type { SymccView } from '../types'
import type { AgentState } from './core/agents'
import type { StatsRange, TeamInput } from './core/stats'

/** What a command's run answers: its exit code and its output. */
export type HostRunResult = { exitCode: number; stdout: string; stderr: string }

/** One entry of a folder listing. */
export type HostFileEntry = { name: string; kind: 'file' | 'dir' | 'other'; size: number; mtimeMs: number; isLink: boolean }

/** What a file's stat answers; `realPath` only when asked to resolve links. */
export type HostFileStat = { kind: 'file' | 'dir' | 'other'; size: number; mtimeMs: number; isLink: boolean; realPath?: string }

/** A started timer. */
export type HostTimer = { cancel: () => void }

/** What symcc starts an agent for: a worker builds one task, a scout does its scout file's job, a checker reviews a finished task. */
export type HostAgentKind = 'worker' | 'scout' | 'checker'

/**
 * An agent of this session, as the agent list answers it, in symcc's words whatever runs it: `kind` is 'worker' for
 * every worker of symcc's (whatever tools it has), 'scout' for a scout or a checker of symcc's, 'other' for any other
 * agent; `status` is "pending", "running" or "waiting" while it is alive, and one of ENDED_STATUSES once it has ended.
 */
export type HostAgent = { id: string; description?: string; kind: 'worker' | 'scout' | 'other'; status: string; name?: string }

/** Agent statuses that mean it has ended; anything else counts as still alive. */
export const ENDED_STATUSES: readonly string[] = ['completed', 'failed', 'killed']

/** An agent from host.agents.list() as core sees it (core/agents.ts): alive unless it has ended, a worker when it is one of symcc's. */
export function agentState(a: HostAgent): AgentState {
  return { ...a, worker: a.kind === 'worker', alive: !ENDED_STATUSES.includes(a.status) }
}

/**
 * How to start an agent: what kind it is, its prompt, its name and short description, the extra tools its role asks
 * for in symcc's words (a worker's, e.g. ['web']; the host maps them to its own tools), the folder it works in and its model. The host picks how to run it (for Claude Code,
 * a background subagent of the agent type that fits; elsewhere a child session, or a process of its own).
 */
export type HostAgentStart = { kind: HostAgentKind; prompt: string; name: string; description: string; tools?: readonly string[]; cwd?: string; model?: string }

/** What starting an agent answers: its id (none: it didn't start). */
export type HostAgentStarted = { agentId?: string }

/**
 * Whether an error from host.agents.spawn only means the host can't start that kind of agent yet (e.g. just after a
 * reload): then the start is tried again shortly. The host marks such an error with `notReady: true`.
 */
export function notReadyYet(err: unknown): boolean {
  return (err as { notReady?: unknown } | null)?.notReady === true
}

/** A panel symcc can open (the board): its id and title; `focus` gives it the keyboard and lets Esc close it. */
export type HostPaneOpen = { id: string; title?: string; focus?: true; closeOnEscape?: true }

/** A panel as the panel list answers it. */
export type HostPane = { id: string; isShown: boolean; isPlaced: boolean }

/**
 * The lead: the main chat symcc reports to. `send` gives it a message from symcc (a board update) as if the owner
 * typed it: an idle lead wakes up and answers it, a busy one gets it once its turn ends. For Claude Code it is a
 * submitted prompt; for OpenCode a queued session prompt; a standalone app that runs the lead chat itself adds it to
 * that chat. Rejects when it can't be given.
 */
export type HostLead = {
  send: (text: string) => Promise<unknown>
  /**
   * The lead's model calls for the stats, for project folder `root` in `range` (each call's tokens, how many sessions,
   * where they were read from), or why they can't be told (`leadProblem`). A host that can't tell answers {}.
   */
  usage: (root: string, range: StatsRange, nowMs: number) => Promise<LeadUsage>
}

/** What host.lead.usage answers. */
export type LeadUsage = Pick<TeamInput, 'lead' | 'leadSessions' | 'leadProblem' | 'leadFrom'>

/**
 * The names that differ from host to host: what the model calls symcc's tools, what the prompts call its file tools,
 * its plan mode and its question dialog. A role's `tools:` line is in symcc's words (core/roles.ts ROLE_TOOL_WORDS)
 * in every host; each host maps them to its own tools when it starts a worker (HostAgentStart.tools).
 */
export type HostWords = {
  /** the name the model calls symcc's tool `tool` (e.g. "board") by, for plugin `name` */
  tool: (name: string, tool: string) => string
  /** what a worker uses on files, after "Use absolute paths under that folder for every " (Claude Code: "Read, Edit and Write") */
  fileTools: string
  /** what the host's plan mode is and how it is turned on, for the lead guide (Claude Code: "Claude Code's own planning mode, Shift+Tab") */
  planMode: string
  /** the host's tool that asks the owner in a dialog in the chat, which stays open when they answer on the board; '' when it has none (Claude Code: "AskUserQuestion") */
  askPopup: string
}

/**
 * symcc's own words, for a host that adds nothing: its tools are called by their plain names, and the prompts name no
 * tools.
 */
export const SYMCC_WORDS: HostWords = {
  tool: (_name, tool) => tool,
  fileTools: 'file you read or change',
  planMode: "the host's own planning mode",
  askPopup: '',
}

/**
 * What the host can do, beyond the members every Host has; symcc falls back to text where one is missing (T-371, step 8
 * of docs/research/host-independence.md). Claude Code has them all (claude/host.ts); an OpenCode plugin has a panel and
 * a composer strip but no plan mode; a standalone app may have no screen at all, and runs the lead chat itself.
 */
export type HostFeatures = {
  /** a board panel symcc draws (ui.open, ui.panel); without it /<name> and /<name>-tasks answer with the text board, and no panel is opened */
  panel: boolean
  /** a line above the prompt (ui.status) that shows the board's status text; without it that text goes nowhere */
  band: boolean
  /**
   * how a board update reaches the lead: 'now' sends it with lead.send (an idle lead wakes up); 'next-turn' keeps it
   * until the host asks for it on its next hook that can carry text (leadUpdate in app/symcc.ts)
   */
  wakeLead: 'now' | 'next-turn'
  /** the host tells symcc when the lead is in a read-only plan mode; without it symcc is never "in plan", and the lead guide leaves plan mode out */
  planMode: boolean
  /** lead.usage can tell the lead's model calls; without it the stats say they can't be read here */
  leadUsage: boolean
}

/** Every feature on: Claude Code's, and what symcc does when the host doesn't say. */
export const ALL_FEATURES: HostFeatures = { panel: true, band: true, wakeLead: 'now', planMode: true, leadUsage: true }

/**
 * What a file-changing tool call touches, in symcc's words: a file it writes or edits (`path`), or a shell command it
 * runs (`command`). The host turns its own tool calls into these (for Claude Code see claude/tools.ts), both after a
 * call (otherToolDone) and before one (toolCheck, the edit guard), so symcc's logic never sees a host's tool names.
 */
export type FileTouch = { path: string } | { command: string }

/**
 * The board panel's values the panel draws from: which task is open ('' = the list), which view (tab) and which scout
 * ('' = the list), and the published board view. A host with a panel keeps them where its panel can read them.
 */
export type PanelValues = {
  readOpened: () => Promise<string>
  updateOpened: (change: (value: string) => string) => Promise<unknown>
  readTab: () => Promise<string>
  updateTab: (change: (value: string) => string) => Promise<unknown>
  readScoutOpen: () => Promise<string>
  updateScoutOpen: (change: (value: string) => string) => Promise<unknown>
  readView: () => Promise<SymccView>
  updateView: (change: (value: SymccView) => SymccView) => Promise<unknown>
}

export interface Host {
  /** what this host can do (see HostFeatures) */
  features: HostFeatures
  /** this plugin: its name (from plugin.json) and its folder, where roles/, kinds/ and examples/ ship */
  plugin: { name: string; root: string }
  session: {
    /** this session's id */
    id: () => Promise<string>
    /** the project's git repository, or null outside one */
    repo: () => Promise<{ root: string } | null>
    /** the project's folder */
    root: () => Promise<string>
    /** what this session has cost so far, when known */
    usage: () => Promise<{ cost?: { usd: number } }>
  }
  /** the lead: the main chat symcc reports to (see HostLead) */
  lead: HostLead
  /** the workers, scouts and checkers symcc runs; for Claude Code see claude/host.ts */
  agents: {
    /** starts an agent in the background; rejects when it can't start (see notReadyYet) */
    spawn: (input: HostAgentStart) => Promise<HostAgentStarted>
    /** this session's agents; rejects when they can't be told */
    list: () => Promise<HostAgent[]>
    /** a message to a running agent (e.g. a worker told to wrap up) */
    send: (agentId: string, text: string) => Promise<unknown>
    /** ends an agent's work: `text` tells it to stop and end (a host that can, may also end it outright) */
    stop: (agentId: string, text: string) => Promise<unknown>
  }
  /** the names that differ from host to host (see HostWords) */
  words: HostWords
  /** an environment variable (symcc reads HOME, and the Claude adapter USERPROFILE and CLAUDE_CONFIG_DIR) */
  env: (name: string) => Promise<string | undefined>
  fs: {
    read: (path: string) => Promise<string>
    write: (path: string, text: string) => Promise<void>
    exists: (path: string) => Promise<boolean>
    list: (path: string) => Promise<HostFileEntry[]>
    stat: (path: string, options?: { resolve: boolean }) => Promise<HostFileStat>
  }
  /** runs a command (no shell) and answers its exit code and output */
  run: (argv: readonly string[], init?: { cwd?: string; env?: Record<string, string>; timeoutMs?: number }) => Promise<HostRunResult>
  clock: {
    after: (ms: number, fn: () => void) => HostTimer
    every: (ms: number, fn: () => void) => HostTimer
    sleep: (ms: number) => Promise<void>
  }
  ui: {
    /** a short notice to the owner */
    toast: (text: string) => void
    /** the line above the prompt; undefined clears it */
    status: (text: string | undefined) => void
    /** a line in the debug log */
    log: (text: string, options?: { to?: 'transcript' | 'debug' }) => void
    /** asks for the board panel to be drawn again */
    refresh: () => void
    /** opens a panel; isPlaced false = open but not drawn (no room, or no screen that shows panels) */
    open: (pane: HostPaneOpen) => Promise<{ isPlaced: boolean }>
    /** the panels open now */
    panes: () => Promise<readonly HostPane[]>
    /** the board panel's own values (see PanelValues); none: a host with no board panel (they read as their start values) */
    panel?: PanelValues
  }
}

/**
 * A ui for a host with no screen at all (e.g. a standalone app run headless, or a test): nothing is shown, no panel
 * opens (isPlaced false), and none is open.
 */
export const noUi: Host['ui'] = {
  toast: () => undefined,
  status: () => undefined,
  log: () => undefined,
  refresh: () => undefined,
  open: async () => ({ isPlaced: false }),
  panes: async () => [],
}
