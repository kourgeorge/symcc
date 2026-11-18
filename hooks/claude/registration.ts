// What symcc registers with Claude Code at session start: the worker agent types (base, and one per set of extra role
// tools), the scout agent type, the lead's tools, the workers' question tool and the slash commands (app/symcc.ts).
import { WEB_SAFETY_LINE, ASK_TOOL } from '../board'
import { claudeNames, workerAgentTypes, EXTRA_TOOLS, scoutAgentTools } from './agent-types'
import { ASK_TOOL_DEF } from '../plugin/ask'
import { S } from '../plugin/state'
import type { $ } from './panel'
import { TOOLS } from '../plugin/tools'
import { COMMANDS } from '../app/symcc'

/** Registers the worker agent types, the scout agent type, the lead's tools and the slash commands. Each one on its own: one failing doesn't stop the rest. */
export async function registerAll($: $) {
  const ok = (p: Promise<unknown>) => p.catch(() => undefined)
  // One worker type for the base tools, and one more per set of extra tools a role can ask for
  // (e.g. "worker-web" for WebSearch and WebFetch); a task is spawned as the type its role needs.
  for (const w of workerAgentTypes(S.N.name))
    await ok($.agent.register({
      name: w.suffix,
      description: `${S.N.name} worker${w.suffix === 'worker' ? '' : ` (with ${w.tools.filter(t => EXTRA_TOOLS.includes(t)).join(', ')})`}: builds one task from the ${S.N.name} board in its own worktree. Started by ${S.N.name} only.`,
      prompt: `You are a ${S.N.name} worker. You get exactly one task and the folder (your own copy of the project) to do it in. Do it there, keep the change small and inside the task's files, run the tests you were given, and finish with a one or two sentence summary. To ask the owner something, call the ${claudeNames(S.N.name).tool(ASK_TOOL)} tool; if an edit is refused as outside your files, stop and hand back.${w.suffix === 'worker' ? '' : ` ${WEB_SAFETY_LINE}`}`,
      tools: w.tools,
      background: true,
      permissionMode: 'acceptEdits',
    }))
  await ok($.agent.register({
    name: 'scout',
    description: `${S.N.name} scout: does what its scout file asks (reading the project, shell commands, the web) and reports to the lead. Started by ${S.N.name} only.`,
    prompt: `You are a ${S.N.name} scout. You do the job your scout file gives you, using the project, the shell and the web, and end with a short plain report (or exactly NOTHING). You never change, create or delete files in the project. To look at the board, use the ${claudeNames(S.N.name).tool('board')} and ${claudeNames(S.N.name).tool('stats')} tools (they only read), not the board file.`,
    tools: scoutAgentTools(S.N.name),
    background: true,
  }))
  for (const t of TOOLS()) await ok($.tool.register({ ...t, isDeferred: false }))
  // the workers' question tool, next to the lead's tools (only a running worker's call is taken; see askCall)
  await ok($.tool.register({ ...ASK_TOOL_DEF(), isDeferred: false }))
  for (const c of COMMANDS()) await ok($.command.register(c))
}
