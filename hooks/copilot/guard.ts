// The edit guard in GitHub Copilot CLI (T-958): Copilot's onPreToolUse hook input ({ toolName, toolArgs }) is turned
// into symcc's words (FileTouch) and judged by symcc's own checks (toolCall for a stopped agent, toolCheck for a
// worker's or checker's edits and shell commands, hooks/app/symcc.ts), as hooks/opencode/guard.ts does for OpenCode.
// Nothing here decides on its own, and nothing imports the Copilot SDK: the host tasks wire preToolUse into
// joinSession / createSession (hooks: { handlers: { onPreToolUse } }).
//
// What Copilot CLI 1.0.114 hands the hook (the T-955 spike, and the tool schemas in the CLI's own bundle):
// - edit {path, old_str, new_str}, create {path, file_text}: one file each.
// - str_replace_editor {command: view|create|str_replace|insert|..., path}: an edit unless its command is view.
// - apply_patch: one raw patch string (the CLI also reads {input} or {patch}); its files are on its
//   "*** Add File: ", "*** Update File: ", "*** Delete File: " and "*** Move to: " lines.
// - bash, powershell, local_shell {command}: a shell command. write_bash, write_powershell {shellId, input}: text
//   typed into a running shell, so judged as a command too.
// - read-only ones (view, grep, rg, glob, lsp, web_fetch, read_bash, stop_bash, ...): nothing to check.
// A tool not named here (an MCP tool, a newer built-in) has its path-like and command-like fields checked, so a file
// tool symcc doesn't know is still kept inside the task's folder.
import type { FileTouch, Host } from '../host'
import { toolCall, toolCheck, toolCheckFailed } from '../app/symcc'
import type { AgentKindOf } from '../app/ask'
import { useName } from '../app/state'
import { normalPath, isAbsolute } from '../app/store'

/** Copilot's onPreToolUse input, as far as the guard reads it (anything else in it is ignored). */
export type CopilotPreToolUse = { toolName?: unknown; toolArgs?: unknown }

/** What onPreToolUse answers to refuse a call; Copilot then tells the model "Denied by preToolUse hook: <reason>". */
export type CopilotDeny = { permissionDecision: 'deny'; permissionDecisionReason: string }

/** Copilot's built-in tools that only read, wait or talk: nothing to check (a stopped agent is still refused, see preToolUse). */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'view', 'grep', 'rg', 'glob', 'lsp', 'web_fetch', 'web_search', 'report_intent', 'think', 'update_todo',
  'read_bash', 'stop_bash', 'list_bash', 'read_powershell', 'stop_powershell', 'list_powershell',
  'task', 'read_agent', 'list_agents', 'ask_user', 'skill', 'fetch_copilot_cli_documentation', 'store_memory',
])

const SHELL_TOOLS: ReadonlySet<string> = new Set(['bash', 'powershell', 'local_shell'])
const SHELL_INPUT_TOOLS: ReadonlySet<string> = new Set(['write_bash', 'write_powershell'])
const FILE_TOOLS: ReadonlySet<string> = new Set(['edit', 'create', 'str_replace_editor'])

/** Path-like and command-like fields of a tool symcc doesn't know (an MCP tool's, a newer built-in's). */
const PATH_FIELDS = ['path', 'file_path', 'filePath', 'file', 'filename', 'target', 'destination', 'dest', 'notebook_path']
const PATHS_FIELDS = ['paths', 'files', 'file_paths', 'filePaths']
const COMMAND_FIELDS = ['command', 'cmd', 'script']

/** The files a patch's text adds, changes, deletes or moves to; lenient on spaces and case, so no header slips past. */
export function patchFiles(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/^[ \t]*\*\*\*[ \t]*(?:(?:add|update|delete)[ \t]+file|move[ \t]+to)[ \t]*:(.*)$/gim)) {
    const p = (m[1] ?? '').trim()
    if (p && !out.includes(p)) out.push(p)
  }
  return out
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** A shell argument list as one command line, each odd part quoted, so the shell check reads the same words. */
const quoted = (parts: ReadonlyArray<string>) => parts.map(s => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`)).join(' ')

/** The command a shell tool runs: a string, or an argument list (local_shell's) quoted into one line. */
function commandOf(v: unknown): string {
  if (typeof v === 'string') return v
  if (Array.isArray(v) && v.length && v.every(x => typeof x === 'string')) return quoted(v as string[])
  return ''
}

/** The tool's arguments as an object: Copilot gives an object, but a JSON text of one is read too. */
function argsObject(args: unknown): Record<string, unknown> {
  if (args && typeof args === 'object' && !Array.isArray(args)) return args as Record<string, unknown>
  if (typeof args === 'string' && args.trimStart().startsWith('{')) {
    try {
      const v: unknown = JSON.parse(args)
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
    } catch {
      // not JSON: read as raw text (a patch) below
    }
  }
  return {}
}

/** What a Copilot tool call touches, in symcc's words (see the list at the top). Relative paths are from `dir`, the folder the session runs in. */
export function copilotTouches(dir: string, toolName: string, toolArgs: unknown): FileTouch[] {
  if (READ_ONLY_TOOLS.has(toolName)) return []
  const f = argsObject(toolArgs)
  const raw = typeof toolArgs === 'string' ? toolArgs : ''
  const file = (p: string): FileTouch => ({ path: normalPath(isAbsolute(p) ? p : `${dir}/${p}`) })
  const shell = (c: string): FileTouch[] => (c.trim() ? [{ command: c }] : [])
  if (toolName === 'apply_patch') return patchFiles(raw || str(f.input) || str(f.patch) || str(f.patchText)).map(file)
  if (FILE_TOOLS.has(toolName)) return toolName === 'str_replace_editor' && f.command === 'view' ? [] : str(f.path) ? [file(str(f.path))] : []
  if (SHELL_TOOLS.has(toolName)) return shell(commandOf(f.command))
  if (SHELL_INPUT_TOOLS.has(toolName)) return shell(str(f.input))
  // a tool symcc doesn't know: every path-like and command-like field it has is checked, and patch text too
  const paths = [...PATH_FIELDS.map(k => str(f[k])), ...PATHS_FIELDS.flatMap(k => (Array.isArray(f[k]) ? (f[k] as unknown[]).map(str) : []))]
  const patch = raw || str(f.input) || str(f.patch) || str(f.patchText)
  return [...[...paths, ...patchFiles(patch)].filter(Boolean).map(file), ...COMMAND_FIELDS.flatMap(k => shell(commandOf(f[k])))]
}

/** Copilot's refusal answer with symcc's reason. */
export const deny = (reason: string): CopilotDeny => ({ permissionDecision: 'deny', permissionDecisionReason: reason })

/**
 * Copilot's onPreToolUse answer for agent `agentId`'s call (the session id symcc got when it started the agent;
 * undefined for the owner's own session, the lead): a deny with symcc's reason, or undefined to let Copilot go on as
 * usual. An agent symcc stopped is refused any call (toolCall, here "copilot:<tool>", so a Copilot tool is never
 * taken for one of symcc's own and run); a worker's or checker's edits and shell commands go through toolCheck from
 * the copy's folder `dir`. An error refuses the call of symcc's own agents only (toolCheckFailed); the owner's goes on.
 */
export async function preToolUse(host: Host, dir: string, agentId: string | undefined, input: CopilotPreToolUse | undefined, kindOf?: AgentKindOf): Promise<CopilotDeny | undefined> {
  try {
    useName(host)
    const tool = typeof input?.toolName === 'string' ? input.toolName : ''
    const call = await toolCall(host, `copilot:${tool || 'unknown'}`, agentId, {})
    if (call && 'deny' in call) return deny(call.deny)
    for (const touch of copilotTouches(dir, tool, input?.toolArgs)) {
      const why = await toolCheck(host, agentId, touch, dir, kindOf)
      if (why) return deny(why)
    }
    return undefined
  } catch (err) {
    const why = toolCheckFailed(host, agentId, { kind: 'error', message: (err as Error)?.message ?? String(err) })
    return why ? deny(why) : undefined
  }
}
