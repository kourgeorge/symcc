// symcc's values the panel and status line draw from.
/** "review": the worker is done and the checks passed, but nothing is merged until the owner approves. */
export type SymccStatus = 'todo' | 'doing' | 'paused' | 'waiting' | 'review' | 'failed' | 'done' | 'dropped'

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
  /** wait for the owner's review before merging, even when the board's approval is "auto" */
  needs_review?: boolean
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
  /** the model from the scout file's front matter, if set */
  model?: string
  /** the scout's instructions: the body of its file */
  prompt?: string
  /** what the scout answered last time (its first ~2000 characters) */
  last_report?: string
  /** when its timer fires next (ISO time) */
  next_run?: string
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
    // keyed by the plugin's name: keep it the same as "name" in .claude-plugin/plugin.json
    symcc: { view: Shaped<SymccView>; opened: string; tab: string; scout: string }
  }
}
