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
//   typed into a running shell, so judged as a command too, together with all text typed into that shell before.
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

/**
 * A field of a tool symcc doesn't know (an MCP tool's, a newer built-in's) that may name a file: by a word in its name
 * (path, file, dir, source, src, dest, target, ...: so both ends of a move like {source, destination} or
 * {old_path, new_path} are checked) or by being one of the short move words (from, to, old, new). Fields that carry a
 * file's text (content, text, data, body) are not paths.
 */
export function pathField(key: string): boolean {
  if (/content|text|data|body/i.test(key)) return false
  // the key's words: snake_case, kebab-case and camelCase are split ("old_path", "newPath" -> old, path / new, path)
  const words = key.split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/).map(w => w.toLowerCase()).filter(Boolean)
  return words.some(w => PATH_WORDS.has(w) || /(path|paths|filename|filenames)$/.test(w)) || MOVE_KEYS.has(words.join(''))
}
const PATH_WORDS: ReadonlySet<string> = new Set([
  'path', 'paths', 'file', 'files', 'filename', 'filenames', 'dir', 'dirs', 'directory', 'directories', 'folder', 'folders',
  'source', 'sources', 'src', 'dest', 'destination', 'target', 'location', 'cwd', 'root',
])
/** Whole keys a move or rename names its two files by ("new" alone is a file, "new_str" is not). */
const MOVE_KEYS: ReadonlySet<string> = new Set(['from', 'to', 'old', 'new', 'oldname', 'newname'])
const COMMAND_FIELDS = ['command', 'cmd', 'script']

/** How deep the fields of an unknown tool's arguments are walked (so {edits: [{path}]} is read too). */
const WALK_DEPTH = 4

/** The path-like strings among an unknown tool's fields, nested objects and lists included. */
function pathValues(v: unknown, key: string | undefined, depth: number, out: string[]) {
  if (typeof v === 'string') {
    if (key !== undefined && pathField(key) && v.trim()) out.push(v.trim())
  } else if (Array.isArray(v)) {
    if (depth < WALK_DEPTH) for (const x of v) pathValues(x, key, depth + 1, out)
  } else if (v && typeof v === 'object' && depth < WALK_DEPTH) {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) pathValues(x, k, depth + 1, out)
  }
}

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
  const paths: string[] = []
  pathValues(f, undefined, 0, paths)
  const patch = raw || str(f.input) || str(f.patch) || str(f.patchText)
  const all = [...paths, ...patchFiles(patch)].filter((p, i, a) => p && a.indexOf(p) === i)
  return [...all.map(file), ...COMMAND_FIELDS.flatMap(k => shell(commandOf(f[k])))]
}

/**
 * Text typed into a running shell (write_bash, write_powershell) builds up there across calls, so a command split over
 * two calls ("echo x > /re", then "po/README.md\n") would pass if each piece were judged alone. symcc keeps what each
 * agent typed into each shell so far and judges the whole of it, the new piece included; stop_bash / stop_powershell
 * forget it. Keys that edit a line already typed (escape sequences, backspace, Copilot's {left}-style key names) could
 * turn harmless-looking text into another command, so they are refused.
 */
const typedSoFar = new Map<string, string>()
/** The most text kept for one shell; more is refused, so a new shell is needed (the check stays whole and cheap). */
export const TYPED_MAX = 64 * 1024
/** The most shells kept at once; typing into one more is refused until one is stopped. */
const TYPED_SHELLS_MAX = 200
const STOP_TOOLS: Readonly<Record<string, string>> = { stop_bash: 'write_bash', stop_powershell: 'write_powershell' }

/** Forget every shell's typed text (for tests). */
export function forgetTypedShells() {
  typedSoFar.clear()
}

export const typedEditKeyText = 'Refused: the text typed into the shell has keys that edit a line (escape, backspace, arrows or other control keys). Type whole commands as plain text instead.'
export const typedTooLongText = `Refused: more than ${TYPED_MAX} characters were typed into this shell. Stop it and start a new one.`
export const typedTooManyText = `Refused: text was typed into more than ${TYPED_SHELLS_MAX} shells. Stop the ones you no longer need first.`

/** Control keys that may be typed: tab, new line, return, Ctrl-C and Ctrl-D (they end or cancel a line, never change its words). */
const EDIT_KEYS = /[\x00-\x02\x05-\x08\x0b\x0c\x0e-\x1f\x7f]|\{(?:left|right|up|down|backspace|delete|del|home|end|tab|escape|esc)\}/i

const shellKey = (agentId: string, tool: string, shellId: unknown) => `${agentId}\0${tool}\0${typeof shellId === 'string' || typeof shellId === 'number' ? String(shellId) : ''}`

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
    if (agentId && STOP_TOOLS[tool]) typedSoFar.delete(shellKey(agentId, STOP_TOOLS[tool], argsObject(input?.toolArgs).shellId))
    if (agentId && SHELL_INPUT_TOOLS.has(tool)) return await typedInput(host, dir, agentId, tool, argsObject(input?.toolArgs), kindOf)
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

/** A piece of text typed into a running shell: judged together with all text typed there before (see typedSoFar). */
async function typedInput(host: Host, dir: string, agentId: string, tool: string, f: Record<string, unknown>, kindOf?: AgentKindOf): Promise<CopilotDeny | undefined> {
  const piece = str(f.input)
  if (EDIT_KEYS.test(piece)) return deny(typedEditKeyText)
  const key = shellKey(agentId, tool, f.shellId)
  // Copilot's {enter} key name is a new line here, so the shell check sees the line end
  const whole = (typedSoFar.get(key) ?? '') + piece.replace(/\{enter\}/gi, '\n')
  if (whole.length > TYPED_MAX) return deny(typedTooLongText)
  if (whole.trim()) {
    const why = await toolCheck(host, agentId, { command: whole }, dir, kindOf)
    if (why) return deny(why)
  }
  // never forget a shell to make room (its earlier text would then go unjudged): a new one past the limit is refused
  if (!typedSoFar.has(key) && typedSoFar.size >= TYPED_SHELLS_MAX) return deny(typedTooManyText)
  typedSoFar.set(key, whole)
  return undefined
}
