// symcc's values the panel and status line draw from.
/** "review": the worker is done and the checks passed, but nothing is merged until the owner approves. */
/** The board mode: "paused" (nothing runs), "review" (finished work waits for the owner), "auto" (finished work that passes merges on its own; the default). */
export type SymccMode = 'paused' | 'review' | 'auto'

/** "backlog": an idea or not-yet-clear work; it never starts a worker until it is moved to "todo". */
export type SymccStatus = 'backlog' | 'todo' | 'doing' | 'paused' | 'waiting' | 'review' | 'failed' | 'done' | 'dropped'

/**
 * One worker try on a task: when it started and ended (ISO times), and what it used.
 * `tokens` comes from the worker's turn result, each kind kept apart (see SymccTokens).
 * `cost` (US dollars) is filled when the host reports it (OpenCode does; Claude Code's turn result gives token counts only).
 */
export type SymccRun = {
  started: string
  ended?: string
  tokens?: SymccTokens
  /**
   * T-769: the part of `tokens` this try's checkers used (added into `tokens` too), so the Live tab can tell checkers
   * from workers. Missing on tries from before it, and on tries no checker looked at.
   */
  checker_tokens?: SymccTokens
  cost?: number
  /**
   * The full SHAs of the commits symcc made for this try, oldest first: the task's own commit
   * and, if main had moved, the "bring up to date with main" merge commit. Missing on old boards.
   */
  commits?: string[]
  /**
   * The file with this try's full final answer (the worker's hand-back: its report, or an investigation's answer),
   * relative to the project, e.g. ".symcc/reports/T-3-try-2.md". Missing on old boards and when it could not be saved.
   */
  report?: string
  /** how this try ended (see ended_note for the details); missing while it runs and on old boards */
  ended_by?: SymccRunEnd
  /** a short note on how it ended, worded like the task's history lines, e.g. "merged" or "the task was changed (details)" */
  ended_note?: string
  /** T-721: when this try failed its tests, the test command that failed (one of the board's test_commands) */
  failed_command?: string
  /** T-721: and the failing tests' names read from its output (at most FAILED_TESTS_KEPT, long names cut); missing when none could be read */
  failed_tests?: string[]
  /** set when this try first had to merge main into the branch, after a clash with main */
  merge_main?: true
  /**
   * The agent id of this try's worker, and of each checker it had (oldest first), kept when the try ends, so every copy
   * of the plugin refuses an agent that has ended (T-479). Only the last few tries keep them (see AGENT_TRIES_KEPT).
   */
  agent?: string
  checkers?: string[]
  /**
   * T-774: each agent that worked on this try (its workers: one more after each restart symcc did itself; its checkers),
   * oldest first, with what each used. The try's `tokens` and `cost` are their sum (plus what their follow-up debrief
   * turns used). Only the latest few agents (AGENTS_KEPT) and only on the last few tries (AGENT_TRIES_KEPT); older tries
   * keep only their sums, and tries from before T-774 have none.
   */
  agents?: SymccRunAgent[]
}

/** T-774: one agent of a try: its agent id, worker or checker, when it started and ended, and what it used (when the host said). */
export type SymccRunAgent = {
  id: string
  kind: 'worker' | 'checker'
  started: string
  ended?: string
  tokens?: SymccTokens
  cost?: number
}

/**
 * Token counts kept apart by kind, as the API reports them: `input` (normal input), `output`,
 * `cache_write` (input written to the prompt cache) and `cache_read` (input read from the cache).
 * Each kind is billed differently, so they are never added into one number when saved.
 * `unsplit`: an old count saved before the kinds were kept apart (one sum of all of them).
 * A missing field is 0.
 */
export type SymccTokens = { input?: number; output?: number; cache_write?: number; cache_read?: number; unsplit?: number }

/** How a try ended: its work was checked, it was stopped and sent back to work, stopped, ran too long, or the worker asked something. */
export type SymccRunEnd = 'finished' | 'restarted' | 'stopped' | 'timed out' | 'asked'

/**
 * One event in a task's history: when it happened (`at`, an ISO time; missing on an entry converted from an old board
 * whose time could not be guessed), what kind of event it is (`kind`, one of HISTORY_KINDS in hooks/core/history.ts,
 * e.g. "created", "checker-ok", "merged", "note") and its line as the owner reads it (`text`, e.g. "try 1: checker: OK").
 */
export type SymccHistoryEntry = { at?: string; kind: string; text: string }

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
  /** set when the next try must first merge main into the branch and resolve conflicts */
  merge_main?: boolean
  /** how many times a new try was started on its own because the tests failed */
  test_tries?: number
  /** the end of the failing test output from the last try, shown to the next worker */
  test_output?: string
  /** what happened to the task, oldest first: one record per event (see SymccHistoryEntry) */
  history: SymccHistoryEntry[]
  /** who made the task, why and from which request (a task from before origins were kept was given one by the lead, why "made before origins were kept") */
  origin?: SymccOrigin
  /** the worker role (a role file's name) the lead picked; missing = "general" */
  role?: string
  /** the task's kind (a kind file's name, e.g. "bug" or "investigation") the lead picked; missing = "change" */
  kind?: string
  /** wait for the owner's review before merging, even when the board's mode is "auto" */
  needs_review?: boolean
  /** one entry per worker try, oldest first */
  runs?: SymccRun[]
  /** the research notes (files under docs/research/) its merged changes added or changed; missing when none */
  research_notes?: string[]
  /** the full SHA that landed on the task's branch (merge_into) when it was merged; missing until then (and on old boards) */
  merged?: string
  /**
   * The branch this task merges into: the branch checked out in the project when the task was
   * made (on a detached checkout, the repo's main branch). Its worker's copy starts from it too.
   */
  merge_into?: string
  /** the task's own work branch (its worker's copy), e.g. "symcc/T-3"; null until a worker starts */
  branch: string | null
  /** the agent id of the last worker started on this task */
  agent?: string
  /** the files a worker asked for (its edits refused as outside the task's files) while the task waits (the owner can allow them from the board); only while waiting */
  asked_files?: string[]
  /** the choices a worker gave with its ask_owner question, shown as buttons; only while waiting */
  options?: string[]
  /** the lead's own wording of this task's question, from its pop-up tied to the task (T-801); the board shows it instead of the question's text; only while the question is open */
  question_lead?: string
  /** the answer choices of the lead's pop-up for this question (T-801), shown as the buttons of a worker's question */
  options_lead?: string[]
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
  /** the one-line subheader from the scout file's front matter (`summary:`), if set; else the page shows the first line of the instructions */
  summary?: string
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
