// What symcc registers with Claude Code at session start: the worker agent types (base, and one per set of extra role
// tools), the scout agent type, the lead's tools, the workers' question tool and the slash commands (app/symcc.ts).
import { WORKER_BASE, SCOUT_BASE } from '../core/prompts'
import { claudeNames, workerAgentTypes, EXTRA_TOOLS, scoutAgentTools } from './agent-types'
import { ASK_TOOL_DEF } from '../app/ask'
import { S } from '../app/state'
import type { $ } from './panel'
import { TOOLS } from '../app/tools'
import { COMMANDS } from '../app/symcc'

/** Registers the worker agent types, the scout agent type, the lead's tools and the slash commands. Each one on its own: one failing doesn't stop the rest. */
export async function registerAll($: $) {
  const ok = (p: Promise<unknown>) => p.catch(() => undefined)
  const extras = (tools: readonly string[]) => tools.filter(t => EXTRA_TOOLS.includes(t)).join(', ')
  // One worker type for the base tools, and one more per set of tool words a role can ask for
  // (e.g. "worker-web" for web: WebSearch and WebFetch); a task is spawned as the type its role needs.
  for (const w of workerAgentTypes(S.N.name))
    await ok($.agent.register({
      name: w.suffix,
      description: `${S.N.name} worker${extras(w.tools) ? ` (with ${extras(w.tools)})` : ''}${w.prose ? ' for prose only (a role with code: false)' : ''}: builds one task from the ${S.N.name} board in its own worktree. Started by ${S.N.name} only.`,
      prompt: WORKER_BASE(S.N.name, claudeNames(S.N.name).tool, !!extras(w.tools), true, w.prose),
      tools: w.tools,
      background: true,
      permissionMode: 'acceptEdits',
    }))
  await ok($.agent.register({
    name: 'scout',
    description: `${S.N.name} scout: does what its scout file asks (reading the project, shell commands, the web) and reports to the lead. Started by ${S.N.name} only.`,
    prompt: SCOUT_BASE(S.N.name, claudeNames(S.N.name).tool),
    tools: scoutAgentTools(S.N.name),
    background: true,
  }))
  // T-831: the hidden starter agent: it only says OK; its end is a hook where symcc starts the queued agents (app/starts.ts)
  await ok($.agent.register({
    name: 'starter',
    description: `${S.N.name} start trigger: does nothing. Started by ${S.N.name} only.`,
    prompt: 'Reply OK',
    tools: [],
    model: 'haiku',
    background: true,
  }))
  for (const t of TOOLS()) await ok($.tool.register({ ...t, isDeferred: false }))
  // the workers' question tool, next to the lead's tools (only a running worker's call is taken; see askCall)
  await ok($.tool.register({ ...ASK_TOOL_DEF(), isDeferred: false }))
  for (const c of COMMANDS()) await ok($.command.register(c))
}
