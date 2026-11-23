// What the Cursor extension's board panel draws and sends: the panel view the engine process works out from the board
// (./view.ts), and the messages between the webview, the extension and the engine. Plain data only: the webview
// bundle imports this file too, so nothing here may pull in the engine.
import type { SdkImage, SdkModel, SdkModelInfo } from './sdk'

export type ChatImage = SdkImage
export type LeadModel = SdkModel
export type ModelInfo = SdkModelInfo

export type PanelMode = 'paused' | 'review' | 'auto'

/** A task's stations, as the Live tab draws them (hooks/core/live.ts LiveStation). */
export type PanelStation = 'work' | 'check' | 'queue' | 'tests' | 'you' | 'merged' | 'answer'

export type PanelActionId = 'approve' | 'reject' | 'done' | 'keep-note' | 'ask-more' | 'retry' | 'drop' | 'pause' | 'resume' | 'show-changes' | 'to-todo' | 'merge-now'

/** A button on a card or a task row; `ask` set: it needs the owner's words first (that text is its box's hint). */
export type PanelAction = { id: PanelActionId; label: string; primary?: boolean; ask?: string }

export type PanelFile = { file: string; added: number; removed: number }

/** One thing that needs the owner: a board question (Q-3), or a task that asks, waits for review or failed. */
export type PanelNeed = {
  id: string
  kind: 'question' | 'asks' | 'files' | 'time' | 'review' | 'answer' | 'failed'
  /** the card's heading: the question, or the task's title */
  title: string
  /** the line under it: what it is about, in a few words */
  meta: string
  /** more words when there are any: why it failed, the investigation's answer, the files asked for */
  text?: string
  sinceMs?: number
  /** answer buttons; the last one may be "Answer…" (a box for the owner's own words) */
  choices: string[]
  actions: PanelAction[]
  files?: PanelFile[]
}

export type PanelLane = {
  id: string
  title: string
  kind: string
  stations: PanelStation[]
  /** where it is now: an index into stations */
  at: number
  skipped: PanelStation[]
  sinceMs?: number
  tryNo: number
  tries: number
  tokens?: number
  /** an agent works on it now */
  agent: boolean
  /** the id of the agent on its try now (its steps come as step messages) */
  agentId?: string
  /** set on a lane whose task merged a moment ago */
  doneMs?: number
}

export type PanelTask = {
  id: string
  title: string
  status: 'backlog' | 'todo' | 'doing' | 'paused' | 'waiting' | 'review' | 'failed' | 'done' | 'dropped'
  /** the status as the owner reads it ("running", "ready for review") */
  word: string
  kind: string
  role: string
  attempts: number
  updatedMs?: number
  note?: string
  details?: string
  needsYou: boolean
  actions: PanelAction[]
  /** the agents that worked on it, newest first ("Try 5", "Try 4 checker"), for their sessions */
  sessions: PanelSession[]
}

export type PanelSession = { label: string; agent: string; running: boolean }

/** A board event for the stream: a merge, a failure, the checker's problems, a new task. */
export type PanelNews = { key: string; task: string; title: string; tone: 'good' | 'bad' | 'other'; kind: string; text: string; atMs: number; why?: string }

export type PanelScout = { name: string; summary?: string; every: string; running: boolean; paused: boolean; lastRunMs?: number; nextRunMs?: number; lastReport?: string; warning?: string }

export type PanelView = {
  /** symcc is on in this project (else `off` says why, and the panel offers to turn it on) */
  on: boolean
  off?: string
  project: string
  branch: string
  mode: PanelMode
  /** the mode switch's choices in the board's words ("approve merge") and what each means */
  modes: { mode: PanelMode; name: string; meaning: string }[]
  maxParallel: number
  needs: PanelNeed[]
  lanes: PanelLane[]
  next: PanelTask[]
  tasks: PanelTask[]
  news: PanelNews[]
  scouts: PanelScout[]
  counts: { needs: number; running: number; next: number; doneToday: number; backlog: number }
  /** a note about the board itself (git missing, a data file near its size limit) */
  note?: string
  /** the data folder in the project (".symcc"), where each agent's session is kept: <dir>/sessions/<agent>.jsonl */
  dir: string
  nowMs: number
}

/** The lead chat's events, as the engine sends them (./lead.ts LeadEvent). */
export type PanelLeadEvent =
  | { type: 'message'; from: 'owner' | 'symcc'; text: string }
  | { type: 'answer'; text: string }
  | { type: 'error'; text: string }
  | { type: 'busy'; busy: boolean }
  | { type: 'stopped' }
  | { type: 'summarized'; text: string }

/**
 * A line of the stream that the extension keeps (the chat's side; the board's news comes with each view). `note`: a
 * command's answer or a word about the chat (stopped, summarized), not from the lead. A lead answer keeps the turn's
 * steps (what it thought and the tools it used) and the model it ran on; an owner's message the pictures sent with it
 * (`images` while the window is open, `pictures` their count after).
 */
export type ChatItem = {
  key: string
  who: 'owner' | 'lead' | 'error' | 'note'
  text: string
  atMs: number
  steps?: PanelStep[]
  model?: string
  images?: string[]
  pictures?: number
}

/** The model and mode the lead's turns run on (`model` none: the chat's own, `modelLabel` its name). */
export type LeadSettings = { model?: LeadModel; modelLabel?: string; mode: 'agent' | 'plan' }

/** A slash command of the lead chat: one of symcc's, a skill (the project's or the user's), or the chat's own. */
export type SlashItem = { name: string; description: string; hint?: string; kind: 'symcc' | 'skill' | 'chat'; scope?: 'project' | 'user' }

/**
 * A git worktree of the project: a worker's folder (<dir>/worktrees/<task>, `task` set), the project itself (`main`)
 * or another checkout of the repo (`other`, the owner's own), with where it stands against `base`.
 */
export type PanelWorktree = {
  /** the folder (absolute) and the same as the owner reads it (".symcc/worktrees/T-12", "~/src/x") */
  path: string
  where: string
  kind: 'main' | 'task' | 'other'
  task?: string
  /** the branch checked out ('' for a detached HEAD) and its tip */
  branch: string
  head: string
  /** what it is compared with: a task's branch it merges into, else the branch's upstream (origin/main) */
  base?: string
  ahead: number
  behind: number
  /** a task's folder: what changed since it left `base`, committed or not; any other: what isn't committed yet */
  files: PanelFile[]
  /** files not committed yet, of which `untracked` are new ones git doesn't track */
  dirty: number
  untracked: number
  /** its newest commits that `base` lacks, newest first */
  commits: { sha: string; subject: string; atMs: number }[]
  lastCommitMs?: number
  locked?: boolean
  /** the folder is gone from the disk (git still lists it) */
  missing?: boolean
  error?: string
}

/** What the owner can do with a worktree on the Worktrees page. */
export type WorktreeAction = 'window' | 'terminal' | 'reveal' | 'copy' | 'changes' | 'file' | 'remove'

export type EngineState = { state: 'starting' | 'ready' | 'stopped' | 'failed'; text?: string }

/** One step of an agent's turn (hosts/cursor/sdk.ts SdkStep), with when it happened. */
export type PanelStep = { atMs: number; kind: 'text' | 'thinking' | 'tool' | 'status'; text: string; tool?: string; callId?: string; status?: 'running' | 'completed' | 'error' }

/** The engine could not reach Cursor's servers: `text` is the error, `proxy` the proxy it ran with ('' for none). */
export type NetworkProblem = { text: string; proxy: string }

/** From the extension to the webview. */
export type ToWebview =
  | { type: 'view'; view: PanelView }
  | { type: 'chat'; items: ChatItem[]; busy: boolean }
  | { type: 'engine'; engine: EngineState }
  | { type: 'network'; problem: NetworkProblem | null }
  | { type: 'steps'; all: Record<string, PanelStep[]> }
  | { type: 'step'; agent: string; step: PanelStep }
  | { type: 'reply'; id: number; ok: boolean; text: string }
  | { type: 'scouts'; text: string }
  | { type: 'models'; models: ModelInfo[] }
  | { type: 'slash'; items: SlashItem[] }
  | { type: 'lead'; settings: LeadSettings }
  | { type: 'worktrees'; list: PanelWorktree[]; atMs: number; error?: string }

/** From the webview to the extension; `id` comes back on the reply. */
export type FromWebview =
  | { type: 'ready' }
  | { type: 'send'; id: number; text: string; images?: ChatImage[] }
  | { type: 'lead-set'; settings: LeadSettings }
  | { type: 'lead-stop' }
  | { type: 'summarize'; id: number }
  | { type: 'act'; id: number; task: string; action: PanelActionId; text?: string }
  | { type: 'answer'; id: number; need: string; text: string }
  | { type: 'mode'; id: number; mode: PanelMode }
  | { type: 'command'; id: number; name: string; args?: string }
  | { type: 'scout'; id: number; name: string }
  | { type: 'proxy'; id: number; proxy: string }
  | { type: 'log' }
  | { type: 'session'; agent: string; title: string }
  | { type: 'restart' }
  | { type: 'open-file'; path: string; line?: number }
  | { type: 'worktrees' }
  | { type: 'worktree'; id: number; path: string; action: WorktreeAction; file?: string }
