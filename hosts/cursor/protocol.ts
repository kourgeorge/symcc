// What the Cursor extension's board panel draws and sends: the panel view the engine process works out from the board
// (./view.ts), and the messages between the webview, the extension and the engine. Plain data only: the webview
// bundle imports this file too, so nothing here may pull in the engine.

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
}

/** A board event for the stream: a merge, a failure, the checker's problems, a new task. */
export type PanelNews = { key: string; task: string; title: string; tone: 'good' | 'bad' | 'other'; kind: string; text: string; atMs: number }

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
  nowMs: number
}

/** The lead chat's events, as the engine sends them (./lead.ts LeadEvent). */
export type PanelLeadEvent =
  | { type: 'message'; from: 'owner' | 'symcc'; text: string }
  | { type: 'answer'; text: string }
  | { type: 'error'; text: string }
  | { type: 'busy'; busy: boolean }

/** A line of the stream that the extension keeps (the chat's side; the board's news comes with each view). */
export type ChatItem = { key: string; who: 'owner' | 'lead' | 'error'; text: string; atMs: number }

export type EngineState = { state: 'starting' | 'ready' | 'stopped' | 'failed'; text?: string }

/** From the extension to the webview. */
export type ToWebview =
  | { type: 'view'; view: PanelView }
  | { type: 'chat'; items: ChatItem[]; busy: boolean }
  | { type: 'engine'; engine: EngineState }
  | { type: 'reply'; id: number; ok: boolean; text: string }
  | { type: 'scouts'; text: string }

/** From the webview to the extension; `id` comes back on the reply. */
export type FromWebview =
  | { type: 'ready' }
  | { type: 'send'; id: number; text: string }
  | { type: 'act'; id: number; task: string; action: PanelActionId; text?: string }
  | { type: 'answer'; id: number; need: string; text: string }
  | { type: 'mode'; id: number; mode: PanelMode }
  | { type: 'command'; id: number; name: string; args?: string }
  | { type: 'scout'; id: number; name: string }
  | { type: 'restart' }
