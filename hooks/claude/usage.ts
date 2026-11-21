// Claude Code's token usage and turn end fields. Only the Claude Code adapter knows these names; the rest of
// symcc works on SymccTokens (input, output, cache_write, cache_read) and TurnEnd (see app/workers.ts).
import type { TurnEnd } from '../app/workers'
import type { SymccTokens } from '../../types'
import { cleanTokens } from '../core/runs'
import { stopBackground } from './background'

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

/**
 * How a turn ended, from Claude Code's turn.complete event: its reason, the refusal on a refusal alone, and the
 * agent's own background commands still running (`background`, from its SubagentStop; see background.ts) when known.
 */
export function turnEnd(e: { reason: TurnEnd['reason']; refusal?: TurnEnd['refusal']; agentId?: string }, background?: readonly string[]): TurnEnd {
  // T-724: with commands still running, the agent's own ones can be stopped (by their task ids, see stopBackground)
  const agentId = e.agentId
  const stop = background?.length && agentId ? { stopBackground: () => stopBackground(agentId) } : {}
  return { reason: e.reason, ...(e.reason === 'refusal' ? { refusal: e.refusal } : {}), ...(background ? { background } : {}), ...stop }
}
