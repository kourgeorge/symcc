// The edit guard in GitHub Copilot CLI (T-958): Copilot's onPreToolUse hook input ({ toolName, toolArgs }) is turned
// into symcc's words (FileTouch) and judged by symcc's own checks (toolCall for a stopped agent, toolCheck for a
// worker's or checker's edits and shell commands, hooks/app/symcc.ts), as hooks/opencode/guard.ts does for OpenCode.
// Nothing here decides on its own, and nothing imports the Copilot SDK: the host tasks wire preToolUse into
// joinSession / createSession (hooks: { handlers: { onPreToolUse } }).
//
// What Copilot CLI 1.0.114 hands the hook (the T-955 spike, and the tool schemas in the CLI's own bundle):
// - edit, str_replace {path, old_str, new_str}, create {path, file_text}: one file each.
// - str_replace_editor {command: view|create|str_replace|insert|..., path}: an edit unless its command is view.
// - apply_patch: one raw patch string (the CLI also reads {input} or {patch}); its files are on its
//   "*** Add File: ", "*** Update File: ", "*** Delete File: " and "*** Move to: " lines.
// - bash, powershell, local_shell {command}: a shell command. write_bash, write_powershell {shellId, input}: text
//   typed into a running shell; symcc's agents are refused those, and a shell call with a shellId or async (see splitShell).
//   An agent's shell command is rewritten (modifiedArgs, see shellWrap) to run in a new shell started in its own
//   folder, so Copilot's long-lived session shell never moves and each call is judged from that folder.
// - read-only ones (view, grep, rg, glob, lsp, web_fetch, read_bash, stop_bash, ...): nothing to check.
// symcc's agents may use only the tools named here and symcc's own (knownTool); any other (an MCP tool, a newer
// built-in) is refused them, since the guard can't tell what it touches. The lead may use any tool.
import type { FileTouch, Host } from '../host'
import { toolCall, toolCheck, toolCheckFailed, isSymccTool } from '../app/symcc'
import type { AgentKindOf } from '../app/ask'
import { useName } from '../app/state'
import { normalPath, isAbsolute } from '../app/store'

/** Copilot's onPreToolUse input, as far as the guard reads it (anything else in it is ignored). */
export type CopilotPreToolUse = { toolName?: unknown; toolArgs?: unknown }

/** What onPreToolUse answers to refuse a call; Copilot then tells the model "Denied by preToolUse hook: <reason>". */
export type CopilotDeny = { permissionDecision: 'deny'; permissionDecisionReason: string }

/** What onPreToolUse answers to run a call with changed arguments (the SDK's PreToolUseHookOutput.modifiedArgs). */
export type CopilotModify = { modifiedArgs: unknown; permissionDecision?: undefined; permissionDecisionReason?: undefined }

/** onPreToolUse's answer: refuse, run with changed arguments, or nothing (Copilot goes on as usual). */
export type CopilotPreToolUseAnswer = CopilotDeny | CopilotModify | undefined

/** Copilot's built-in tools that only read, wait or talk: nothing to check (a stopped agent is still refused, see preToolUse). */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'view', 'grep', 'rg', 'glob', 'lsp', 'web_fetch', 'web_search', 'report_intent', 'think', 'update_todo',
  'read_bash', 'stop_bash', 'list_bash', 'read_powershell', 'stop_powershell', 'list_powershell',
  'task', 'read_agent', 'list_agents', 'ask_user', 'skill', 'fetch_copilot_cli_documentation', 'store_memory',
])

const SHELL_TOOLS: ReadonlySet<string> = new Set(['bash', 'powershell', 'local_shell'])
const SHELL_INPUT_TOOLS: ReadonlySet<string> = new Set(['write_bash', 'write_powershell'])
const FILE_TOOLS: ReadonlySet<string> = new Set(['edit', 'create', 'str_replace_editor', 'str_replace'])

/**
 * Whether `tool` is one the guard knows: a Copilot built-in it checks or that only reads, or one of symcc's own
 * (those run symcc's toolCall, which judges them, see hooks/copilot/tools.ts). symcc's agents may use no other tool
 * (an MCP tool, a newer built-in), since the guard can't tell what such a tool touches.
 */
export function knownTool(tool: string): boolean {
  return READ_ONLY_TOOLS.has(tool) || FILE_TOOLS.has(tool) || SHELL_TOOLS.has(tool) || SHELL_INPUT_TOOLS.has(tool) || tool === 'apply_patch' || isSymccTool(tool)
}

/** The refusal of a tool the guard doesn't know, for symcc's agents. */
export const unknownToolText = (tool: string) => `Refused: symcc workers in Copilot may only use known tools; ${tool || 'a tool with no name'} is not one.`

// Copilot's patch reader (native, like Codex's) splits lines on \n only and trims each line of every Unicode space
// (\v, \f, \u0085, \u00a0, \u2000-\u200a, \u3000, ...), so the guard does the same: a JS regex's `.`, `^`/`$` and
// `\s` would stop at or miss some of those, and a header could hide behind one or end early at a \r.
const SPACE = '\\s\\u0085'
const LEAD_SPACE = new RegExp(`^[${SPACE}]+`)
const EDGE_SPACE = new RegExp(`^[${SPACE}]+|[${SPACE}]+$`, 'g')
const HEADER = new RegExp(`^\\*\\*\\*[${SPACE}]*(?:(?:add|update|delete)[${SPACE}]+file|move[${SPACE}]+to)[${SPACE}]*:([^\\n]*)$`, 'i')
// Characters a header line may not hold: control characters but tab, line and paragraph separators, \u0085, and
// the byte order mark, since readers split or trim on them differently.
const ODD_CHAR = /[\u0000-\u0008\u000a-\u001f\u007f-\u009f\u2028\u2029\ufeff]/

/** A patch's header lines: every \n-line that starts with "***" once its leading spaces are stripped. */
const patchHeaders = (text: string) => text.split('\n').filter(line => line.replace(LEAD_SPACE, '').startsWith('***'))

/** The files a patch's text adds, changes, deletes or moves to; lenient on spaces and case, so no header slips past. */
export function patchFiles(text: string): string[] {
  const out: string[] = []
  for (const line of patchHeaders(text)) {
    const m = HEADER.exec(line.replace(LEAD_SPACE, ''))
    const p = (m?.[1] ?? '').replace(EDGE_SPACE, '')
    if (p && !out.includes(p)) out.push(p)
  }
  return out
}

/** Whether a patch's text has a header line holding a character readers may read differently (see ODD_CHAR). */
export function patchOddHeader(text: string): boolean {
  return patchHeaders(text).some(line => ODD_CHAR.test(line))
}

/** The refusal of an agent's apply_patch call with an odd character in a header line. */
export const patchOddText = "Refused: symcc can't read this patch's file names safely; remove control characters (like \\r) and odd line breaks from its '***' lines."

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

/** Every place an apply_patch call's patch text can be: raw, in {input}/{patch}/{patchText}, or a JSON text of those. */
function patchTexts(toolArgs: unknown): string[] {
  const f = argsObject(toolArgs)
  return [typeof toolArgs === 'string' ? toolArgs : '', str(f.input), str(f.patch), str(f.patchText)]
}

/** What a Copilot tool call touches, in symcc's words (see the list at the top). Relative paths are from `dir`, the folder the session runs in. */
export function copilotTouches(dir: string, toolName: string, toolArgs: unknown): FileTouch[] {
  if (READ_ONLY_TOOLS.has(toolName)) return []
  const f = argsObject(toolArgs)
  const file = (p: string): FileTouch => ({ path: normalPath(isAbsolute(p) ? p : `${dir}/${p}`) })
  const shell = (c: string): FileTouch[] => (c.trim() ? [{ command: c }] : [])
  // the patch can come raw, in {input}/{patch}, or as a JSON text of those: every place is read, so none hides a file
  if (toolName === 'apply_patch') return [...new Set(patchTexts(toolArgs).flatMap(patchFiles))].map(file)
  if (FILE_TOOLS.has(toolName)) return toolName === 'str_replace_editor' && f.command === 'view' ? [] : str(f.path) ? [file(str(f.path))] : []
  if (SHELL_TOOLS.has(toolName)) return shell(commandOf(f.command))
  if (SHELL_INPUT_TOOLS.has(toolName)) return shell(str(f.input))
  // symcc's own tools, and any tool the guard doesn't know: nothing here (an agent is refused the unknown ones, see preToolUse)
  return []
}

/**
 * A running shell keeps what was typed into it across calls, so a command split over two calls ("echo x > /re\\",
 * then "po/README.md") would pass if each piece were judged alone. So symcc's agents (not the lead) may not type into a
 * running shell (write_bash, write_powershell) nor start or reach one by id (a bash or powershell call with a shellId,
 * or async: true): each command goes in one call and is judged whole, and no typed-text timeline is needed.
 */
export const splitShellText = 'Refused: symcc workers run each shell command on its own; send the whole command in one bash call (no shellId, no async, no write_bash).'

/** Whether a shell call types into, or starts, a running shell that later calls could add to. */
function splitShell(tool: string, args: unknown): boolean {
  if (SHELL_INPUT_TOOLS.has(tool)) return true
  if (!SHELL_TOOLS.has(tool)) return false
  const f = argsObject(args)
  return (f.shellId !== undefined && f.shellId !== null) || (f.async !== undefined && f.async !== false)
}

/**
 * Copilot's bash session lives on between calls, and a command could move it (`cd /`), leave a child shell reading
 * its next input (`exec bash -c "cd /; exec bash"`), or define a function or alias that runs later. So an agent's shell
 * command (not the lead's) is handed back rewritten (modifiedArgs) to run in a new shell, started in the agent's own
 * folder, whose input is empty: the session shell never runs any of the agent's text itself, so it never moves and
 * keeps nothing from one call to the next, and every call is judged whole from the agent's folder.
 *
 * The command goes to the new shell as one quoted word (bash `-c '<command>'`, PowerShell `-EncodedCommand`), not
 * pasted between the wrap's own lines: pasted, a command holding `)` or an open here-document could end the wrap early
 * and run its rest in the session shell.
 */
export function shellWrap(dir: string, tool: string, command: string | string[]): string | string[] {
  if (Array.isArray(command)) {
    // an argument list (local_shell's) is run as is, from the folder: no text of it is read by a shell
    return ['bash', '-c', 'cd -- "$0" || exit 1\nexec "$@"', dir, ...command]
  }
  if (tool === 'powershell') {
    const child = `Set-Location -LiteralPath ${psQuote(dir)} -ErrorAction Stop\n${command}`
    return `$null | & (Get-Process -Id $PID).Path -NoProfile -NonInteractive -EncodedCommand ${utf16Base64(child)}`
  }
  return `( cd -- ${shQuote(dir)} || exit 1\nexec bash -c ${shQuote(command)}\n) </dev/null`
}

/** `s` as one bash word: in single quotes, each ' written as '\''. */
const shQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

/** `s` as one PowerShell word: in single quotes, each single-quote mark (PowerShell also takes the curly ones) doubled. */
const psQuote = (s: string) => `'${s.replace(/['‘’‚‛]/g, m => m + m)}'`

/** `s` as UTF-16LE bytes in base64, what PowerShell's -EncodedCommand reads (no Buffer or btoa needed). */
function utf16Base64(s: string): string {
  const bytes: number[] = []
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    bytes.push(c & 0xff, c >> 8)
  }
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i]!, bytes[i + 1], bytes[i + 2]]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += abc[(n >> 18) & 63]! + abc[(n >> 12) & 63]! + (b === undefined ? '=' : abc[(n >> 6) & 63]!) + (c === undefined ? '=' : abc[n & 63]!)
  }
  return out
}

/** The refusal of an agent's shell call whose command is neither a text nor a list of texts, so it can't be checked. */
export const shellUnreadText = "Refused: symcc couldn't read this shell command; give the command as one text."

/** The refusal of an agent's apply_patch call whose files can't be found, so it can't be checked. */
export const patchNoFilesText = "Refused: symcc couldn't find which files this patch changes; give each file a '*** Add File: ', '*** Update File: ' or '*** Delete File: ' line."

/** Copilot's refusal answer with symcc's reason. */
export const deny = (reason: string): CopilotDeny => ({ permissionDecision: 'deny', permissionDecisionReason: reason })

/**
 * Copilot's onPreToolUse answer for agent `agentId`'s call (the session id symcc got when it started the agent;
 * undefined for the owner's own session, the lead): a deny with symcc's reason, or undefined to let Copilot go on as
 * usual. An agent symcc stopped is refused any call (toolCall, here "copilot:<tool>", so a Copilot tool is never
 * taken for one of symcc's own and run); an agent's call that types into a running shell is refused (splitShell);
 * a worker's or checker's edits and shell commands go through toolCheck from the copy's folder `dir`, and an agent's
 * shell call that passes is answered with its command wrapped to run from `dir` (modifiedArgs, see shellWrap). An
 * error refuses the call of symcc's own agents only (toolCheckFailed); the owner's goes on.
 */
export async function preToolUse(host: Host, dir: string, agentId: string | undefined, input: CopilotPreToolUse | undefined, kindOf?: AgentKindOf): Promise<CopilotPreToolUseAnswer> {
  try {
    useName(host)
    const tool = typeof input?.toolName === 'string' ? input.toolName : ''
    const call = await toolCall(host, `copilot:${tool || 'unknown'}`, agentId, {})
    if (call && 'deny' in call) return deny(call.deny)
    if (agentId && !knownTool(tool)) return deny(unknownToolText(tool))
    if (agentId && splitShell(tool, input?.toolArgs)) return deny(splitShellText)
    // an agent's shell command must be readable, since it is checked and then wrapped (see shellWrap)
    const args = argsObject(input?.toolArgs)
    const command = args.command
    const shellCall = !!agentId && SHELL_TOOLS.has(tool)
    if (shellCall && typeof command !== 'string' && !(Array.isArray(command) && command.length && command.every(x => typeof x === 'string'))) return deny(shellUnreadText)
    if (agentId && tool === 'apply_patch' && patchTexts(input?.toolArgs).some(patchOddHeader)) return deny(patchOddText)
    const touches = copilotTouches(dir, tool, input?.toolArgs)
    if (agentId && tool === 'apply_patch' && !touches.length) return deny(patchNoFilesText)
    for (const touch of touches) {
      const why = await toolCheck(host, agentId, touch, dir, kindOf)
      if (why) return deny(why)
    }
    if (!shellCall) return undefined
    const wrapped = { ...args, command: shellWrap(normalPath(dir), tool, command as string | string[]) }
    // handed back in the shape it came in: an object, or a JSON text of one
    return { modifiedArgs: typeof input?.toolArgs === 'string' ? JSON.stringify(wrapped) : wrapped }
  } catch (err) {
    const why = toolCheckFailed(host, agentId, { kind: 'error', message: (err as Error)?.message ?? String(err) })
    return why ? deny(why) : undefined
  }
}
