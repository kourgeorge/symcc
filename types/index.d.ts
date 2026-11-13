// symcc's values the panel and status line draw from.
/** "review": the worker is done and the checks passed, but nothing is merged until the owner approves. */
/** The board mode: "off" (nothing runs), "review" (finished work waits for the owner), "auto" (finished work that passes merges on its own; the default). */
export type SymccMode = 'off' | 'review' | 'auto'

/** "backlog": an idea or not-yet-clear work; it never starts a worker until it is moved to "todo". */
export type SymccStatus = 'backlog' | 'todo' | 'doing' | 'paused' | 'waiting' | 'review' | 'failed' | 'done' | 'dropped'

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
  /**
   * The full SHAs of the commits symcc made for this try, oldest first: the task's own commit
   * and, if main had moved, the "bring up to date with main" merge commit. Missing on old boards.
   */
  commits?: string[]
  /**
   * The file with this try's full final answer (the worker's report, or its NEED FILES / QUESTION text),
   * relative to the project, e.g. ".symcc/reports/T-3-try-2.md". Missing on old boards and when it could not be saved.
   */
  report?: string
}

/**
 * Where a task came from, so it can be traced back to the request that started it.
 * `by`: who asked for it (the owner, a scout's report, a worker's report, or the lead's own idea).
 * `evidence`: what the plugin itself saw just before the task was added (the last owner prompt,
 * or the scout or worker report delivered to the lead), so the trail does not rest only on the lead's word.
 */
export type SymccOrigin = {
  by: 'owner' | 'scout' | 'worker' | 'lead'
  /** the scout's name, when a scout's report led to this task */
  scout?: string
  /** the task id whose worker report (or which split) led to this task */
  task?: string
  /** "split": part of a bigger task; "follow-up": more work after a task */
  how?: 'split' | 'follow-up'
  /** the owner's words, quoted exactly */
  request?: string
  /** one line: why this task exists */
  why: string
  /** what the plugin saw itself, e.g. the last owner prompt or "scout bugs report at ..." */
  evidence?: string
  /** when the task was added (ISO time) */
  at: string
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
  /** who made the task, why and from which request; missing on tasks made before it was recorded */
  origin?: SymccOrigin
  /** the worker role (a role file's name) the lead picked; missing = "general" */
  role?: string
  /** wait for the owner's review before merging, even when the board's mode is "auto" */
  needs_review?: boolean
  /** one entry per worker try, oldest first */
  runs?: SymccRun[]
  /** the research notes (files under docs/research/) its merged changes added or changed; missing when none */
  research_notes?: string[]
  /** the full SHA that landed on the target branch when the task was merged; missing until then (and on old boards) */
  merged?: string
  branch: string | null
  /** the agent id of the last worker started on this task */
  agent?: string
  created_at: string
  updated_at: string
}

export type SymccScout = {
  name: string
  /** how often it runs on its timer; 0 means only on demand ("run now" or /symcc-scout NAME) */
  every_minutes: number
  /** set when the file's every_minutes is not valid (the scout then runs only on demand), e.g.
   *  'every_minutes "-5" is not valid: runs only on demand until fixed' */
  warning?: string
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
  /** paused by the owner: it doesn't run on its timer or with "run now" until resumed (saved in scouts.json) */
  paused?: boolean
}

export type SymccView = {
  tasks: SymccTask[]
  working: { task: string; since: number }[]
  scouts: SymccScout[]
  mode: SymccMode
  test_commands: string[]
}

declare module 'claude-code' {
  interface PluginState {
    // keyed by the plugin's name: keep it the same as "name" in .claude-plugin/plugin.json
    symcc: { view: Shaped<SymccView>; opened: string; tab: string; scout: string }
  }
}
