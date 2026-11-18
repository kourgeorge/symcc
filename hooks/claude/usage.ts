// Claude Code's token usage and turn end fields. Only the Claude Code adapter knows these names; the rest of
// symcc works on SymccTokens (input, output, cache_write, cache_read) and TurnEnd (see plugin/workers.ts).
import type { SymccTokens } from '../../types'
import { cleanTokens } from '../core/runs'
import type { TurnEnd } from '../plugin/workers'

/** Token usage as Claude Code reports it (a turn result's usage, or a session log line's message.usage). */
export type ClaudeUsage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }

/**
 * The tokens a turn result reports, each kind kept apart (input, output, cache writes, cache
 * reads), or undefined if it reports none. The worker's turn result gives token counts only, no dollar cost.
 */
export function usageTokens(u: ClaudeUsage | undefined): SymccTokens | undefined {
  if (!u) return undefined
  return cleanTokens({ input: u.input_tokens, output: u.output_tokens, cache_write: u.cache_creation_input_tokens, cache_read: u.cache_read_input_tokens })
}

/** How a turn ended, from Claude Code's turn.complete event: its reason, and the refusal on a refusal alone. */
export function turnEnd(e: { reason: TurnEnd['reason']; refusal?: TurnEnd['refusal'] }): TurnEnd {
  return { reason: e.reason, ...(e.reason === 'refusal' ? { refusal: e.refusal } : {}) }
}
