// What symcc's logic (hooks/plugin/, outside ui/) needs from the program it runs in: files, commands,
// timers, agents, the session, and a few screen calls. Written by hand, with no import from 'claude-code',
// so the logic doesn't depend on Claude Code's types.
//
// First version (T-240, step 1 of docs/research/host-independence.md): the members have the same names and
// shapes as the parts of Claude Code's `$` that symcc uses. Since T-243 (step 4) the agents are in symcc's own words
// (`agents`), and since T-244 (step 5) the lead (`lead`) and the screen (`ui`: `refresh`, and the board panel's values
// in `panel`, or `noUi` for a host with no screen): Claude Code's adapter (claude/host.ts) builds them from its `$`,
// and tests/host.test.ts checks that the result fits. Each parameter is only what symcc passes, and each answer only
// what symcc reads, so another program (an OpenCode plugin's ctx, or plain Node/Bun in a standalone app)
// can be made to fit it too. Later steps rename the members to symcc's own words.

import type { SymccView } from '../types'

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
 * An agent (worker, scout or checker) of this session, as the agent list answers it, in symcc's words whatever runs it:
 * `type` is "<name>:worker" for every worker (whatever tools it has) and "<name>:scout" for a scout or a checker (any
 * other agent has some other type); `status` is "pending", "running" or "waiting" while it is alive, and "completed",
 * "failed" or "killed" once it has ended.
 */
export type HostAgent = { id: string; description: string; type: string; status: string; name?: string }

/**
 * How to start an agent: what kind it is, its prompt, its name and short description, the extra tools its role asks
 * for (a worker's; see roles), the folder it works in and its model. The host picks how to run it (for Claude Code,
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
export type HostLead = { send: (text: string) => Promise<unknown> }

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
  env: { get: (name: string) => Promise<string | undefined> }
  fs: {
    read: (path: string) => Promise<string>
    write: (path: string, text: string) => Promise<void>
    exists: (path: string) => Promise<boolean>
    list: (path: string) => Promise<HostFileEntry[]>
    stat: (path: string, options?: { resolve: boolean }) => Promise<HostFileStat>
  }
  process: { run: (argv: readonly string[], init?: { cwd?: string; env?: Record<string, string>; timeoutMs?: number }) => Promise<HostRunResult> }
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
