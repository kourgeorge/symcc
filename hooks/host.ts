// What symcc's logic (hooks/plugin/, outside ui/) needs from the program it runs in: files, commands,
// timers, agents, the session, and a few screen calls. Written by hand, with no import from 'claude-code',
// so the logic doesn't depend on Claude Code's types.
//
// First version (T-240, step 1 of docs/research/host-independence.md): the members have the same names and
// shapes as the parts of Claude Code's `$` that symcc uses, so the real `$` fits a Host as it is, with no
// wrapper. tests/host.test.ts checks that. Each parameter is only what symcc passes, and each answer only
// what symcc reads, so another program (an OpenCode plugin's ctx, or plain Node/Bun in a standalone app)
// can be made to fit it too. Later steps rename the members to symcc's own words.

/** What a command's run answers: its exit code and its output. */
export type HostRunResult = { exitCode: number; stdout: string; stderr: string }

/** One entry of a folder listing. */
export type HostFileEntry = { name: string; kind: 'file' | 'dir' | 'other'; size: number; mtimeMs: number; isLink: boolean }

/** What a file's stat answers; `realPath` only when asked to resolve links. */
export type HostFileStat = { kind: 'file' | 'dir' | 'other'; size: number; mtimeMs: number; isLink: boolean; realPath?: string }

/** A started timer. */
export type HostTimer = { cancel: () => void }

/** An agent (worker, scout or checker) of this session, as the agent list answers it. */
export type HostAgent = { id: string; description: string; type: string; status: string; name?: string }

/** How to start an agent: its prompt, its name and short description, its agent type, the folder it works in and its model. */
export type HostAgentStart = { prompt: string; name?: string; description?: string; subagentType?: string; cwd?: string; model?: string }

/** What starting an agent answers: its id, or why it was refused. */
export type HostAgentStarted = { agentId?: string; deny?: undefined } | { deny: string; agentId?: undefined }

/** A panel symcc can open (the board): its id and title; `focus` gives it the keyboard and lets Esc close it. */
export type HostPaneOpen = { id: string; title?: string; focus?: true; closeOnEscape?: true }

/** A panel as the panel list answers it. */
export type HostPane = { id: string; isShown: boolean; isPlaced: boolean }

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
    /** a message to one of this session's agents (how a worker, scout or checker is told to stop) */
    send: (input: { to: { agentId: string }; text: string }) => Promise<unknown>
  }
  /** a prompt for the lead, as if typed: how an idle lead is woken with a board update */
  prompt: { submit: (input: { text: string }) => Promise<unknown> }
  agent: {
    /** starts a background agent */
    spawn: (input: HostAgentStart) => Promise<HostAgentStarted>
    /** this session's agents */
    list: () => Promise<HostAgent[]>
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
    invalidate: (event: 'ui.render') => void
    /** opens a panel; isPlaced false = open but not drawn (no room, or no screen that shows panels) */
    open: (pane: HostPaneOpen) => Promise<{ isPlaced: boolean }>
    /** the panels open now */
    panes: () => Promise<readonly HostPane[]>
  }
}
