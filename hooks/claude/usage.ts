// Claude Code's token usage and turn end fields. Only the Claude Code adapter knows these names; the rest of
// symcc works on SymccTokens (input, output, cache_write, cache_read) and TurnEnd (see plugin/workers.ts).
import type { TurnEnd } from '../plugin/workers'

/** Token usage as Claude Code reports it (a turn result's usage, or a session log line's message.usage). */
export type ClaudeUsage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }

// usageTokens is still defined in core/runs.ts because register.tsx imports it from ./board (it may not change
// in T-242); take it from here. It moves here with T-243.
export { usageTokens } from '../core/runs'

/** How a turn ended, from Claude Code's turn.complete event: its reason, and the refusal on a refusal alone. */
export function turnEnd(e: { reason: TurnEnd['reason']; refusal?: TurnEnd['refusal'] }): TurnEnd {
  return { reason: e.reason, ...(e.reason === 'refusal' ? { refusal: e.refusal } : {}) }
}
