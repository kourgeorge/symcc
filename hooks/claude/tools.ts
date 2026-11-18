// Claude Code's tool calls in symcc's words: which of its tools write or edit a file, and which run a shell command,
// so the logic can tell what a call touched (app/symcc.ts otherToolDone) or would touch (toolCheck, the edit guard)
// without knowing Claude Code's tool names.
import type { FileTouch } from '../host'

/** What a Claude Code tool call (its name as `tool`, its input fields beside it) touched: Write, Edit and MultiEdit a file, Bash a command; null for any other tool. */
export function fileTouch(call: Record<string, unknown>): FileTouch | null {
  const tool = String(call.tool ?? '')
  if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit') return { path: String(call.file_path ?? '') }
  if (tool === 'Bash') return { command: String(call.command ?? '') }
  return null
}

/** The input field of each Claude Code tool the edit guard checks before it runs, that names the file it would write. */
const EDIT_PATH_FIELD: Readonly<Record<string, string>> = { Edit: 'file_path', Write: 'file_path', NotebookEdit: 'notebook_path' }

/**
 * What a Claude Code tool call `tool` with `input` would touch, for the edit guard (app/symcc.ts toolCheck): Edit,
 * Write and NotebookEdit a file, Bash a command (a missing or odd one as ''); null for any other tool.
 */
export function editTouch(tool: string, input: unknown): FileTouch | null {
  const fields = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const field = EDIT_PATH_FIELD[tool]
  if (field) return { path: typeof fields[field] === 'string' ? (fields[field] as string) : '' }
  if (tool === 'Bash') return { command: typeof fields.command === 'string' ? fields.command : '' }
  return null
}
