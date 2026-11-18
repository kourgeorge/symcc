// Claude Code's tool calls in symcc's words: which of its tools write or edit a file, and which run a shell command,
// so the logic can tell what a call touched (app/symcc.ts otherToolDone) or would touch (toolCheck, the edit guard)
// without knowing Claude Code's tool names.
import type { FileTouch } from '../host'

/**
 * The one list of Claude Code tools that write a file, each with the input field naming that file (as in
 * .claude-plugin/types: Edit and Write file_path, NotebookEdit notebook_path; MultiEdit is not in the types but takes
 * file_path). Both fileTouch (after a call) and editTouch (the edit guard, before it) read it, so they can't drift apart.
 */
export const FILE_PATH_FIELD: Readonly<Record<string, string>> = Object.freeze({
  Edit: 'file_path',
  Write: 'file_path',
  MultiEdit: 'file_path',
  NotebookEdit: 'notebook_path',
})

/** The path field of `tool` if it writes a file (own keys only, so 'toString' and the like are not tools), else undefined. */
function pathField(tool: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(FILE_PATH_FIELD, tool) ? FILE_PATH_FIELD[tool] : undefined
}

/** What a Claude Code tool call (its name as `tool`, its input fields beside it) touched: a file for each FILE_PATH_FIELD tool, Bash a command; null for any other tool. */
export function fileTouch(call: Record<string, unknown>): FileTouch | null {
  const tool = String(call.tool ?? '')
  const field = pathField(tool)
  if (field) return { path: String(call[field] ?? '') }
  if (tool === 'Bash') return { command: String(call.command ?? '') }
  return null
}

/**
 * What a Claude Code tool call `tool` with `input` would touch, for the edit guard (app/symcc.ts toolCheck): a file
 * for each FILE_PATH_FIELD tool, Bash a command (a missing or odd one as ''); null for any other tool.
 */
export function editTouch(tool: string, input: unknown): FileTouch | null {
  const fields = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const field = pathField(tool)
  if (field) return { path: typeof fields[field] === 'string' ? (fields[field] as string) : '' }
  if (tool === 'Bash') return { command: typeof fields.command === 'string' ? fields.command : '' }
  return null
}
