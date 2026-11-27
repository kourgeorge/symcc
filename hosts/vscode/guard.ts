// symcc's edit guard for GitHub Copilot's agents in the Cursor host: the Copilot CLI host's guard (hooks/copilot/guard.ts,
// T-958) turns each Copilot tool call into symcc's words and judges it with symcc's own checks; here it is bound to one
// agent and the folder it runs in. A worker's edit outside its task's files, or anything written outside its folder,
// is refused before it runs, and its shell commands run from its folder (Cursor's agents have no such hook).
import type { Host } from '../../hooks/host'
import { preToolUse } from '../../hooks/copilot/guard'
import type { SdkToolGuard } from './sdk'

export const copilotGuard =
  (agent: { host: Host; dir: string; agentId?: string }): SdkToolGuard =>
  async call => {
    const r = await preToolUse(agent.host, agent.dir, agent.agentId, call, async () => 'symcc')
    if (!r) return undefined
    return r.permissionDecision === 'deny' ? { deny: r.permissionDecisionReason } : { args: r.modifiedArgs }
  }
