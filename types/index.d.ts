// symcc's values the panel and status line draw from.
export type SymccStatus = 'todo' | 'doing' | 'paused' | 'waiting' | 'failed' | 'done' | 'dropped'

/**
 * One worker try on a task: when it started and ended (ISO times), and what it used.
 * `tokens` comes from the worker's turn result (all input, cache and output tokens added up).
 * `cost` (US dollars) is kept for when a result reports it: the worker's turn result in the
 * Claude Code types gives token counts but no dollar cost, so today only time and tokens are filled.
 */
export type SymccRun = {
  started: string
  ended?: string
  tokens?: number
  cost?: number
}

export type SymccTask = {
  id: string
  title: string
  details: string
  files: string[]
  status: SymccStatus
  note: string
  question: string | null
  order: number
  after: string[]
  attempts: number
  /** how many times a new try was started because the branch conflicted with main */
  conflict_tries?: number
  /** set when the next try must first merge main into the branch and resolve conflicts */
  merge_main?: boolean
  /** how many times a new try was started on its own because the tests failed */
  test_tries?: number
  /** the end of the failing test output from the last try, shown to the next worker */
  test_output?: string
  history: string[]
  /** one entry per worker try, oldest first */
  runs?: SymccRun[]
  branch: string | null
  /** the agent id of the last worker started on this task */
  agent?: string
  created_at: string
  updated_at: string
}

export type SymccScout = {
  name: string
  every_minutes: number
  last_run: string | null
  running: boolean
}

export type SymccView = {
  tasks: SymccTask[]
  working: { task: string; since: number }[]
  scouts: SymccScout[]
  paused: boolean
  test_commands: string[]
}

declare module 'claude-code' {
  interface PluginState {
    symcc: { view: Shaped<SymccView>; opened: string }
  }
}
