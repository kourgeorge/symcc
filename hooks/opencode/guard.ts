// The edit guard in OpenCode (T-462): OpenCode's permission checks ("evaluate") and, as a backstop, its tool calls
// ("execute.before") are turned into symcc's words (FileTouch) and judged by symcc's own checks (toolCall for a
// stopped agent, toolCheck for a worker's or checker's edits and shell commands, hooks/app/symcc.ts). Nothing here
// decides on its own. An agent is known by its OpenCode session id (the agent id symcc gets when it starts one).
import type { FileTouch, Host } from '../host'
import { toolCall, toolCheck, toolCheckFailed } from '../app/symcc'
import { listedKind } from '../app/ask'
import { useName } from '../app/state'
import { normalPath, isAbsolute } from '../app/store'
import { realpath } from 'node:fs/promises'
import type { OcPermissionEvaluation, OcToolBefore } from './ctx'

/** `p` with its links followed, as far as it exists (a file about to be made isn't there yet: its folder is followed). */
export async function realPathOf(p: string): Promise<string> {
  try {
    return await realpath(p)
  } catch {
    const at = p.lastIndexOf('/')
    if (at <= 0) return p
    return `${await realPathOf(p.slice(0, at))}/${p.slice(at + 1)}`
  }
}

/**
 * Where a permission resource (or a tool's path) really is: OpenCode gives an edit's file relative to the copy's
 * folder (on macOS sometimes through /private, e.g. "../../../private/tmp/x"), or absolute.
 */
export async function resourcePath(dir: string, resource: string): Promise<string> {
  return realPathOf(normalPath(isAbsolute(resource) ? resource : `${dir}/${resource}`))
}

/** What a permission check touches, in symcc's words: an edit's files, a shell command's parts; nothing for the rest. */
export async function permissionTouches(dir: string, action: string, resources: ReadonlyArray<string>): Promise<FileTouch[]> {
  if (action === 'edit') return Promise.all(resources.filter(r => r && r !== '*').map(async r => ({ path: await resourcePath(dir, r) })))
  if (action === 'shell') return resources.filter(r => r.trim()).map(command => ({ command }))
  return []
}

/** The files a patch tool's text adds, changes, deletes or moves to ("*** Update File: a.ts", "*** Move to: b.ts"). */
export function patchFiles(text: string): string[] {
  return [...text.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$/gm)].map(m => (m[1] ?? m[2] ?? '').trim()).filter(Boolean)
}

/**
 * What an OpenCode tool call touches, in symcc's words. OpenCode 2.3's built-in tools that change files are edit
 * ({path, oldString, newString}), write ({path, content}) and patch ({patchText}, offered to some models only), and
 * shell ({command, workdir}) runs a command (seen in a real run, T-463; patch's field is from its tool definition).
 * It has no multiedit; one (an older OpenCode's, or a plugin's: {filePath, edits: [{filePath?}]}) is checked too,
 * and so are the older names filePath, file_path, apply_patch and bash. A shell command run in another folder
 * (workdir) is judged as `cd <workdir> && <command>`, so its text shows where it runs.
 */
export async function toolTouches(dir: string, tool: string, input: unknown): Promise<FileTouch[]> {
  const f = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const fileOf = (o: Record<string, unknown>) => str(o.path) || str(o.filePath) || str(o.file_path)
  const touch = async (p: string) => ({ path: await resourcePath(dir, p) })
  if (tool === 'write' || tool === 'edit') return fileOf(f) ? [await touch(fileOf(f))] : []
  if (tool === 'multiedit') {
    const edits = Array.isArray(f.edits) ? f.edits.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object') : []
    return Promise.all([...new Set([fileOf(f), ...edits.map(fileOf)].filter(Boolean))].map(touch))
  }
  if (tool === 'patch' || tool === 'apply_patch') return Promise.all(patchFiles(str(f.patchText) || str(f.patch)).map(touch))
  if (tool === 'shell' || tool === 'bash') {
    const command = str(f.command)
    const workdir = str(f.workdir) || str(f.cwd)
    if (!command) return []
    const elsewhere = workdir && (await resourcePath(dir, workdir)) !== (await realPathOf(dir))
    return [{ command: elsewhere ? `cd '${workdir.replace(/'/g, `'\\''`)}' && ${command}` : command }]
  }
  return []
}

/**
 * Why session `sessionID`'s call is refused, or undefined to let OpenCode decide as usual: an agent symcc stopped is
 * refused anything (toolCall answers that for any tool that isn't symcc's, here "opencode:<what>"), and a worker's or
 * checker's edits and shell commands go through toolCheck from this copy's folder `dir`. An error refuses the call
 * of symcc's own agents only (toolCheckFailed); the owner's own sessions go on. `kind` tells a session's symcc metadata
 * (the kind of symcc agent OpenCode made it for, see agents.ts; nothing for the lead and OpenCode's own subagents): a
 * session symcc has no record of whose metadata names a kind is refused every edit and shell command (T-555, see
 * checkEdit). When the metadata can't be read, the host's agent list decides.
 */
export async function refusal(host: Host, dir: string, sessionID: string, what: string, touches: () => Promise<FileTouch[]>, kind?: SessionKind): Promise<string | undefined> {
  useName(host)
  const kindOf = async () => {
    if (!kind) return listedKind(host, sessionID)
    const k = await Promise.resolve().then(() => kind(sessionID)).then(v => ({ v }), () => undefined)
    return k ? (k.v ? 'symcc' : 'other') : listedKind(host, sessionID)
  }
  try {
    const call = await toolCall(host, `opencode:${what}`, sessionID, {})
    if (call && 'deny' in call) return call.deny
    for (const touch of await touches()) {
      const why = await toolCheck(host, sessionID, touch, dir, kindOf)
      if (why) return why
    }
    return undefined
  } catch (err) {
    return toolCheckFailed(host, sessionID, { kind: 'error', message: (err as Error)?.message ?? String(err) })
  }
}

/** A session's symcc metadata (see refusal); it rejects when the session can't be read. */
export type SessionKind = (sessionID: string) => Promise<unknown>

/** The permission.evaluate hook: a refused check becomes "deny" with symcc's reason. A check already denied is left alone. */
export function onEvaluate(host: Host, dir: string, kind?: SessionKind) {
  return async (e: OcPermissionEvaluation) => {
    if (e.effect === 'deny') return
    const why = await refusal(host, dir, e.sessionID, e.action, () => permissionTouches(dir, e.action, e.resources), kind)
    if (why) {
      e.effect = 'deny'
      e.message = why
    }
  }
}

/** The tool.execute.before hook, the backstop for a call no permission check covers: a refused call throws symcc's reason. */
export function onToolBefore(host: Host, dir: string, kind?: SessionKind) {
  return async (e: OcToolBefore) => {
    const why = await refusal(host, dir, e.sessionID, e.tool, () => toolTouches(dir, e.tool, e.input), kind)
    if (why) throw new Error(why)
  }
}
