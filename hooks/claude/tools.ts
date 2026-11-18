// Claude Code's tool calls in symcc's words: which of its tools write or edit a file, and which run a shell command,
// so the logic (app/symcc.ts otherToolDone) can tell what a call touched without knowing Claude Code's tool names.
import type { FileTouch } from '../host'

/** What a Claude Code tool call (its name as `tool`, its input fields beside it) touched: Write, Edit and MultiEdit a file, Bash a command; null for any other tool. */
export function fileTouch(call: Record<string, unknown>): FileTouch | null {
  const tool = String(call.tool ?? '')
  if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit') return { path: String(call.file_path ?? '') }
  if (tool === 'Bash') return { command: String(call.command ?? '') }
  return null
}
