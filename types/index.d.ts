// symcc's values the panel and status line draw from.
/** "review": the worker is done and the checks passed, but nothing is merged until the owner approves. */
/** The board mode: "paused" (nothing runs), "review" (finished work waits for the owner), "auto" (finished work that passes merges on its own; the default). */
export type SymccMode = 'paused' | 'review' | 'auto'

/** "backlog": an idea or not-yet-clear work; it never starts a worker until it is moved to "todo". */
export type SymccStatus = 'backlog' | 'todo' | 'doing' | 'paused' | 'waiting' | 'review' | 'failed' | 'done' | 'dropped'

/**
 * One worker try on a task: when it started and ended (ISO times), and who worked on it.
 * T-805: `agents` is the only place a try's agents, tokens and cost are kept; the try's sums are worked out from it
 * (tryTokens, checkerTokensOf, tryCost in hooks/core/runs.ts). Tokens come from each agent's turn result, each kind
 * kept apart (see SymccTokens); cost (US dollars) is filled when the host reports it (OpenCode does; Claude Code's turn
 * result gives token counts only).
 */
export type SymccRun = {
  started: string
  ended?: string
  /**
   * Each agent that worked on this try (its workers: one more after each restart symcc did itself; its checkers),
   * oldest first, with what each used. The current worker and checker are the last open worker / checker entries.
   * Only the last few tries (AGENT_TRIES_KEPT) keep the agents' ids (for the guard); every try keeps its entries' tokens.
   */
  agents?: SymccRunAgent[]
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
  /** T-846: set when this try's commit changed only docs files, so its checker was skipped (the Live lanes draw check as skipped) */
  docs_only?: true
  /** set when this try first had to merge main into the branch, after a clash with main */
  merge_main?: true
  /** T-743: the restarts symcc did itself on this try (oldest first), see RunRestart */
  restarts?: RunRestart[]
  /**
   * T-882: the closed-app stretches (ISO times, oldest first) of the restarts trimmed off `restarts` (only the latest few
   * are kept), each at its real time, so the try's active time stays the same after the trim (see gapsOf).
   */
  idle?: { from: string; to: string }[]
}

/**
 * T-743: one restart symcc did itself on a try: when (the end time it took off the try), why (the try's end note then),
 * and when the next worker's part of the try started (its time limit counts from then). The worker it stopped is the
 * agent entry ended with ended_by "restarted".
 */
export type RunRestart = { at: string; why: string; started?: string }
/** A try as kept on the board (the restarts are part of SymccRun now). */
export type TryRun = SymccRun

/**
 * T-774, T-805: one agent of a try: its agent id (cut on old tries), worker or checker, when it started and ended, why
 * it ended (a worker symcc stopped to restart it: "restarted"), and what it used (when the host said).
 */
export type SymccRunAgent = {
  id?: string
  kind: 'worker' | 'checker'
  started: string
  ended?: string
  ended_by?: SymccRunEnd
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
export type SymccRunEnd = 'finished' | 'restarted' | 'stopped' | 'timed out' | 'asked' | 'dropped'

/**
 * One event in a task's history: when it happened (`at`, an ISO time; missing on an entry converted from an old board
 * whose time could not be guessed), what kind of event it is (`kind`, one of HISTORY_KINDS in hooks/core/history.ts,
 * e.g. "created", "checker-ok", "merged", "note") and its line as the owner reads it (`text`, e.g. "try 1: checker: OK").
 */
export type SymccHistoryEntry = {
  at?: string
  kind: string
  text: string
  /** T-806: the facts of the line, set where it is written (readers never read them back out of `text`): the try number it is about */
  try?: number
  /** a stage line's step: the worker started or handed back, or the check stage the try went into */
  step?: SymccHistoryStep
  /** a merge-queue line's place in the queue */
  place?: number
  /** a try's result line: the words after its " → " */
  result?: string
  /** T-859: a checker-problems line's problems, one short line each, taken from the checker's report when it was recorded */
  problems?: string[]
  /** why the try counts as sent back or failed (see FailReason in hooks/core/stats.ts) */
  reason?: SymccFailReason
  /** a merged line: by its own try, by the owner's approve, or outside the board */
  how?: 'own' | 'approved' | 'outside'
  /** the line puts the task to wait for the owner's answer */
  owner?: true
  /** a moved-backlog line that moves the task into the backlog (else out of it) */
  backlog?: true
}

/** T-806: the step of a 'stage' history line. */
export type SymccHistoryStep = 'worker-start' | 'handed-back' | 'prep' | 'checker' | 'queue' | 'tests' | 'merge'

/** T-806: why a try was sent back or failed, as a history line records it. */
export type SymccFailReason = 'tests' | 'checker' | 'clash' | 'scope' | 'timeout' | 'noresult' | 'nochange' | 'notmerged' | 'other' | 'changed' | 'stopped' | 'rejected'

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

/**
 * T-808: one question for the owner, in every place one is kept: `task.ask` (a worker's question or file request, the
 * lead's ask, symcc's own question), `live.ask` (a worker's question, until its try is handed back) and `board.questions`
 * (the lead's questions that are not about one task). `by`: who asked. `files`: the files a worker asked to change (the
 * owner can allow them), shown as Allow / Don't allow. `options`: the choices, shown as buttons. `lead`: the lead's own
 * wording from its pop-up tied to the question (T-801), which the board shows instead of `text` (and `options`).
 */
export type SymccAsk = {
  by: 'worker' | 'lead' | 'symcc'
  text: string
  options?: string[]
  files?: string[]
  asked_at: string
  answer?: string
  answered_at?: string
  lead?: { text: string; options?: string[] }
}

export type SymccTask = {
  id: string
  title: string
  details: string
  files: string[]
  status: SymccStatus
  note: string
  order: number
  after: string[]
  attempts: number
  /** set (only ever to true) when the next try must first merge main into the branch and resolve conflicts */
  merge_main?: true
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
  /** the question the task waits on (a worker's, the lead's, or symcc's own: a file request, a gone branch); only while waiting, or while the owner is asked for more time (see SymccAsk) */
  ask?: SymccAsk
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
  /** set in the view while a running scout's agent has really started (not only queued) */
  started?: boolean
  /** the model from the scout file's front matter, if set */
  model?: string
  /** the scout's own choice for the tasks its findings become (front matter `findings:`): auto = the lead decides, backlog = they go to the backlog; not set = the board's scout_findings setting decides */
  findings?: 'auto' | 'backlog'
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
