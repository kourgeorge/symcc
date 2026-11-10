// symcc's values the panel and status line draw from.
export type SymccStatus = 'todo' | 'doing' | 'paused' | 'waiting' | 'failed' | 'done' | 'dropped'

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
  history: string[]
  branch: string | null
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
