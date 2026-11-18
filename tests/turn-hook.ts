// The turn.complete hook of register.tsx, taken out so a test can call it with its own fake `$` (T-402). The test
// kit loads its own copy of the plugin, whose memory (scoutRuns, checkerRuns) a test can't set; this one shares it.
import { register } from '../hooks/register'

type Hook = ($: unknown, e: unknown, next: (e: unknown) => Promise<unknown>) => Promise<unknown>

/** Raises turn.complete for agent `agentId` through register.tsx's hook, with the turn's `answer` and end (`reason`, ...). */
export async function turnComplete($: unknown, agentId: string, answer: string, end: { reason: string; refusal?: unknown }, isAborted = false) {
  let hook: Hook | undefined
  const chain = { catch: () => chain }
  register(((event: string, f: Hook) => ((event === 'turn.complete' ? (hook = f) : undefined), chain)) as never, {} as never)
  await hook!($, { agentId, answer, isAborted, ...end, durationMs: 1000, turnId: `turn-${agentId}` }, async () => ({ text: '' }))
}
