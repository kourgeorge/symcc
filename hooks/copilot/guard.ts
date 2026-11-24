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
// - read-only ones (view, grep, rg, glob, lsp, web_fetch, read_bash, stop_bash, ...): nothing to check.
// symcc's agents may use only the tools named here and symcc's own (knownTool); any other (an MCP tool, a newer
// built-in) is refused them, since the guard can't tell what it touches. The lead may use any tool.
import type { FileTouch, Host } from '../host'
import { toolCall, toolCheck, toolCheckFailed, isSymccTool } from '../app/symcc'
import type { AgentKindOf } from '../app/ask'
import { useName } from '../app/state'
import { normalPath, isAbsolute } from '../app/store'
import { rawWords, shellPieces, type RawWord } from '../core/shell-words'

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
  // the patch can come raw, in {input}/{patch}, or as a JSON text of those: every place is read, so none hides a file
  if (toolName === 'apply_patch') return [...new Set([raw, str(f.input), str(f.patch), str(f.patchText)].flatMap(patchFiles))].map(file)
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
 * or async: true): each command goes in one call and is judged whole, and no typed-text history is needed.
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
 * Copilot's bash session keeps its folder between calls, but each call is judged as if it starts in the agent's own
 * folder. So symcc's agents (not the lead) may not move the shell anywhere else: see folderMoves and stayInside.
 */
export const leaveFolderText = 'Refused: symcc workers stay in their own folder; use full paths instead of cd.'

/** Commands that change the shell's folder (bash and PowerShell names, compared in lower case). */
const FOLDER_CMDS = new Set(['cd', 'pushd', 'popd', 'chdir', 'set-location', 'sl', 'push-location', 'pop-location'])
/** Words that may come before a command's name and still run it in this shell. */
const LEAD_WORDS = new Set(['builtin', 'command', 'exec', 'time', 'nohup', 'noglob', 'if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{'])
/** Settings that make a later, harmless-looking command move the shell (a cd searched in CDPATH, a cd to a variable's value, a command run before each prompt). */
const FOLDER_SETTINGS = /CDPATH|cdable_vars|PROMPT_COMMAND|autocd/i

/**
 * Where a cd's target word `w` (quotes already dropped) goes, from folder `dir`; undefined when it can't be told (an
 * option, `-`, `~`, a variable, odd characters) or when it climbs above `dir` on the way (`../x`): the shell may be
 * deeper in the folder than `dir`, so only a path that never climbs above where it starts surely stays inside.
 */
function cdPlace(dir: string, w: RawWord): string | undefined {
  if (w.expands || w.sign || !/^[\w./+@%,-]+$/.test(w.w) || /^[-+]/.test(w.w)) return undefined
  if (w.w.startsWith('/')) return normalPath(w.w)
  let depth = 0
  for (const part of w.w.split('/')) {
    if (part === '..') depth--
    else if (part && part !== '.') depth++
    if (depth < 0) return undefined
  }
  return normalPath(`${dir}/${w.w}`)
}

/**
 * The folders shell command `command` (run from folder `dir`) may move the shell to, each inside `dir` as written (the
 * caller then looks on disk where each really leads, see stayInside), or undefined when it may leave `dir` in a way
 * that can't be told: a cd, pushd, popd, chdir or Set-Location (also after `builtin`, `command`, `x=1` and such) whose
 * target is outside, can't be told, or missing (`cd` alone goes home); a cd after any other command of the line (that
 * command could first turn its target into a link out, `ln -s / x && cd x`); text run again in this shell (`eval`,
 * `trap`, `alias`) that holds a cd; `source` or `.` (the file read could cd); a command name from a variable; or a
 * setting that makes a later cd go elsewhere (FOLDER_SETTINGS). A cd inside a subshell (`( cd x && ... )`, `$(cd x)`)
 * changes nothing after it.
 */
export function folderMoves(dir: string, command: string, depth = 0): string[] | undefined {
  if (depth > 4 || FOLDER_SETTINGS.test(command)) return undefined
  const top = normalPath(dir)
  const inside = (p: string) => p === top || p.startsWith(`${top}/`)
  const subs: boolean[] = []
  const out: string[] = []
  // `ran`: a command other than a cd at the line's top came before
  let ran = false
  for (const piece of shellPieces(command)) {
    if ('op' in piece) {
      if (piece.op === '(') subs.push(piece.sub)
      else if (piece.op === ')') subs.pop()
      continue
    }
    const words = rawWords(piece.text)
    if (!words.length) continue
    if (piece.doc || subs.includes(true)) {
      ran = true
      continue
    }
    let i = 0
    while (i < words.length && (/^[A-Za-z_]\w*=/.test(words[i]!.raw) || LEAD_WORDS.has(words[i]!.w) || (i > 0 && LEAD_WORDS.has(words[i - 1]!.w) && words[i]!.w.startsWith('-')))) i++
    const name = words[i]
    if (!name) {
      ran = true
      continue
    }
    if (name.expands) return undefined
    const cmd = name.w.toLowerCase()
    const rest = words.slice(i + 1)
    if (FOLDER_CMDS.has(cmd)) {
      if (ran || rest.length !== 1) return undefined
      const to = cdPlace(top, rest[0]!)
      if (to === undefined || !inside(to)) return undefined
      out.push(to)
      continue
    }
    ran = true
    if (cmd === 'source' || cmd === '.') return undefined
    if (cmd === 'eval' || cmd === 'trap' || cmd === 'alias') {
      if (rest.some(w => w.expands)) return undefined
      // alias x='cd /' gives the word "x=cd /": its text after "=" is what runs later
      const text = rest.map(w => (cmd === 'alias' ? w.w.replace(/^[^=]*=/, '') : w.w)).join(cmd === 'eval' ? ' ' : '\n')
      if (folderMoves(dir, text, depth + 1)?.length !== 0) return undefined
    }
  }
  return out
}

/**
 * Whether every folder in `moves` (folderMoves) is a folder on disk that really lies inside `dir`, links followed, so
 * `cd up` with `up` a link to "/" is caught. A folder that can't be looked up (missing, or the host can't tell) fails.
 */
async function stayInside(host: Host, dir: string, moves: string[]): Promise<boolean> {
  if (!moves.length) return true
  const realOf = async (p: string) => {
    const st = await Promise.resolve().then(() => host.fs.stat(p, { resolve: true })).catch(() => undefined)
    return st ? { kind: st.kind, real: normalPath(st.realPath ?? p) } : undefined
  }
  const top = normalPath(dir)
  const tops = [top, (await realOf(top))?.real ?? top]
  for (const to of moves) {
    const st = await realOf(to)
    if (!st || st.kind !== 'dir' || !tops.some(t => st.real === t || st.real.startsWith(`${t}/`))) return false
  }
  return true
}

/** The refusal of an agent's apply_patch call whose files can't be found, so it can't be checked. */
export const patchNoFilesText = "Refused: symcc couldn't find which files this patch changes; give each file a '*** Add File: ', '*** Update File: ' or '*** Delete File: ' line."

/** Copilot's refusal answer with symcc's reason. */
export const deny = (reason: string): CopilotDeny => ({ permissionDecision: 'deny', permissionDecisionReason: reason })

/**
 * Copilot's onPreToolUse answer for agent `agentId`'s call (the session id symcc got when it started the agent;
 * undefined for the owner's own session, the lead): a deny with symcc's reason, or undefined to let Copilot go on as
 * usual. An agent symcc stopped is refused any call (toolCall, here "copilot:<tool>", so a Copilot tool is never
 * taken for one of symcc's own and run); an agent's call that types into a running shell is refused (splitShell);
 * a worker's or checker's edits and shell commands go through toolCheck from the copy's folder `dir`. An error refuses the call of symcc's own agents only (toolCheckFailed); the owner's goes on.
 */
export async function preToolUse(host: Host, dir: string, agentId: string | undefined, input: CopilotPreToolUse | undefined, kindOf?: AgentKindOf): Promise<CopilotDeny | undefined> {
  try {
    useName(host)
    const tool = typeof input?.toolName === 'string' ? input.toolName : ''
    const call = await toolCall(host, `copilot:${tool || 'unknown'}`, agentId, {})
    if (call && 'deny' in call) return deny(call.deny)
    if (agentId && !knownTool(tool)) return deny(unknownToolText(tool))
    if (agentId && splitShell(tool, input?.toolArgs)) return deny(splitShellText)
    if (agentId && SHELL_TOOLS.has(tool)) {
      const moves = folderMoves(dir, commandOf(argsObject(input?.toolArgs).command))
      if (!moves || !(await stayInside(host, dir, moves))) return deny(leaveFolderText)
    }
    const touches = copilotTouches(dir, tool, input?.toolArgs)
    if (agentId && tool === 'apply_patch' && !touches.length) return deny(patchNoFilesText)
    for (const touch of touches) {
      const why = await toolCheck(host, agentId, touch, dir, kindOf)
      if (why) return deny(why)
    }
    return undefined
  } catch (err) {
    const why = toolCheckFailed(host, agentId, { kind: 'error', message: (err as Error)?.message ?? String(err) })
    return why ? deny(why) : undefined
  }
}
