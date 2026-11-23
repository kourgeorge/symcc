// Claude Code's tool names and agent types for symcc's workers and scouts. Only the Claude Code adapter knows these:
// a role's `tools:` line is in symcc's words (core/roles.ts ROLE_TOOL_WORDS, e.g. web), and this file maps each word to
// Claude Code's tools (web: WebSearch and WebFetch) and to the worker agent type that has them.
import { DEFAULT_NAME, cleanName } from '../name'
import { ASK_TOOL } from '../core/ask'
import { SCOUT_BOARD_TOOLS, SCOUT_LIST_TOOL } from '../core/scouts'
import { type RoleDef, ROLE_TOOL_WORDS } from '../core/roles'

/** Claude Code's names made from the plugin's name: its worker and scout agent types, and a tool's full name as the model sees it. */
export function claudeNames(raw: string = DEFAULT_NAME) {
  const name = cleanName(raw)
  return {
    worker: `${name}:worker`,
    scout: `${name}:scout`,
    /** T-831: the hidden agent whose end gives symcc a hook to start agents in (see app/starts.ts) */
    starter: `${name}:starter`,
    /** "mcp__<name>__board" */
    tool: (t: string) => `mcp__${name}__${t}`,
  }
}

/** The tools every worker has. */
export const BASE_WORKER_TOOLS: readonly string[] = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash']

/** Claude Code's tools for each of symcc's role tool words: a role with `tools: web` gets WebSearch and WebFetch. */
export const ROLE_TOOL_MAP: Readonly<Record<string, readonly string[]>> = { web: ['WebSearch', 'WebFetch'] }

/** Every extra tool a role can give a worker, in Claude Code's names. */
export const EXTRA_TOOLS: readonly string[] = ROLE_TOOL_WORDS.flatMap(w => ROLE_TOOL_MAP[w] ?? [])

/** Claude Code's tools for a role's tool words (unknown words give none), each once. */
export const claudeRoleTools = (words: readonly string[] | undefined): string[] => [...new Set((words ?? []).flatMap(w => ROLE_TOOL_MAP[w] ?? []))]

/** The tools a scout has: it reads and runs commands, and may search and read the web, but never edits. */
export const SCOUT_TOOLS: readonly string[] = ['Read', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch']

/**
 * Every tool the scout agent type gets (checkers run as it too): SCOUT_TOOLS, then symcc's read-only board tools
 * (mcp__<name>__board, mcp__<name>__stats) and mcp__<name>__scouts (T-895: only its action list runs, and only for a scout).
 */
export const scoutAgentTools = (name: string = DEFAULT_NAME): string[] => [...SCOUT_TOOLS, ...[...SCOUT_BOARD_TOOLS, SCOUT_LIST_TOOL].map(t => claudeNames(name).tool(t))]

/** The agent type (without the "<name>:" part) for a role's tool words: "worker" for none, "worker-web" for web (more words join with "-"). */
export function workerTypeSuffix(words: readonly string[] | undefined): string {
  const set = ROLE_TOOL_WORDS.filter(w => words?.includes(w))
  return set.length ? `worker-${set.join('-')}` : 'worker'
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
 * Every worker agent type to register: the base one, and one per set of tool words a role can ask for, with the
 * Claude Code tools those words map to.
 * Each also gets the workers' question tool (mcp__<name>__ask_owner), last, since Claude Code takes
 * AskUserQuestion away from every subagent.
 */
export function workerAgentTypes(name: string = DEFAULT_NAME): { suffix: string; tools: string[] }[] {
  const sets: string[][] = [[]]
  for (const w of ROLE_TOOL_WORDS) for (const s of [...sets]) sets.push([...s, w])
  return sets.map(s => ({ suffix: workerTypeSuffix(s), tools: [...BASE_WORKER_TOOLS, ...claudeRoleTools(s), claudeNames(name).tool(ASK_TOOL)] }))
}
