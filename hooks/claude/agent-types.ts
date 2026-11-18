// Claude Code's tool names and agent types for symcc's workers and scouts. Only the Claude Code adapter knows these:
// core/roles.ts reads a role's `tools:` line with whatever tool names it is given (RoleTools), and this file gives
// it Claude Code's (claude/host.ts hands them to the logic as host.words.roleTools).
import { DEFAULT_NAME, cleanName } from '../name'
import { ASK_TOOL } from '../core/ask'
import type { RoleDef, RoleTools } from '../core/roles'

/** Claude Code's names made from the plugin's name: its worker and scout agent types, and a tool's full name as the model sees it. */
export function claudeNames(raw: string = DEFAULT_NAME) {
  const name = cleanName(raw)
  return {
    worker: `${name}:worker`,
    scout: `${name}:scout`,
    /** "mcp__<name>__board" */
    tool: (t: string) => `mcp__${name}__${t}`,
  }
}

/** The tools every worker has. */
export const BASE_WORKER_TOOLS: readonly string[] = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash']

/** The extra tools a role may ask for in its front matter (tools: WebSearch, WebFetch); anything else is refused. */
export const EXTRA_TOOLS: readonly string[] = ['WebSearch', 'WebFetch']

/** The tools a scout has: it reads and runs commands, and may search and read the web, but never edits. */
export const SCOUT_TOOLS: readonly string[] = ['Read', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch']

/** Claude Code's tool names for a role's `tools:` line: both extra tools reach the web. */
export const ROLE_TOOLS: RoleTools = { extra: EXTRA_TOOLS, web: ['WebSearch', 'WebFetch'] }

/** The agent type (without the "<name>:" part) for a set of extra tools: "worker" for none, "worker-web" for both web tools, else "worker-websearch" and so on. */
export function workerTypeSuffix(tools: readonly string[] | undefined): string {
  const set = EXTRA_TOOLS.filter(t => tools?.includes(t))
  if (!set.length) return 'worker'
  if (set.length === EXTRA_TOOLS.length) return 'worker-web'
  return `worker-${set.map(t => t.toLowerCase()).join('-')}`
}

/** The agent type a role's task is spawned as: "<name>:worker", or "<name>:worker-web" for a role with web tools. */
export const workerTypeFor = (r: Pick<RoleDef, 'tools'> | undefined, name: string = DEFAULT_NAME): string => `${name}:${workerTypeSuffix(r?.tools)}`

/** Whether agent type `type` is one of the plugin's worker types ("<name>:worker", "<name>:worker-web", ...). */
export function isWorkerType(type: string | undefined, name: string = DEFAULT_NAME): boolean {
  const t = String(type ?? '')
  return t === `${name}:worker` || t.startsWith(`${name}:worker-`)
}

/** The agents with every worker type shown as the base "<name>:worker", so code that looks for workers finds them all. */
export function asBaseWorkers<A extends { type?: string }>(agents: A[], name: string = DEFAULT_NAME): A[] {
  return agents.map(a => (isWorkerType(a.type, name) && a.type !== `${name}:worker` ? { ...a, type: `${name}:worker` } : a))
}

/**
 * Every worker agent type to register: the base one, and one per set of extra tools a role can ask for.
 * Each also gets the workers' question tool (mcp__<name>__ask_owner), last, since Claude Code takes
 * AskUserQuestion away from every subagent.
 */
export function workerAgentTypes(name: string = DEFAULT_NAME): { suffix: string; tools: string[] }[] {
  const sets: string[][] = [[]]
  for (const t of EXTRA_TOOLS) for (const s of [...sets]) sets.push([...s, t])
  return sets.map(s => ({ suffix: workerTypeSuffix(s), tools: [...BASE_WORKER_TOOLS, ...EXTRA_TOOLS.filter(t => s.includes(t)), claudeNames(name).tool(ASK_TOOL)] }))
}
