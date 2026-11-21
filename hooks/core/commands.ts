// The slash commands.
import type { SymccMode, SymccStatus, SymccTask } from '../../types'
import { DEFAULT_NAME } from '../name'
import { type BoardTask, isMode, modeOf, normId, STATUS_WORD } from './board-file'
import { taskPhase } from './phase'
import { type DiffFile, statCount, YOUR_EDITS } from './review'
import { parseSettingsCommand, type SettingName, type SettingsInput } from './settings'

// ---------------- the slash commands ----------------

/**
 * What a slash command asks for (see parseCommand). Every command starts with the plugin's name:
 * /<name> opens the panel, /<name>-<word> does one thing.
 */
export type Command =
  | { kind: 'open' }
  | { kind: 'tasks' }
  | { kind: 'scouts' }
  | { kind: 'show'; id: string }
  /** /<name>-task T-5 <verb> [...]: one of the task page's actions, as the lead's tools do it (see TASK_VERBS) */
  | { kind: 'task-do'; id: string; verb: TaskVerb; reason?: string; role?: string; on?: boolean }
  | { kind: 'approve'; id: string }
  | { kind: 'reject'; id: string; reason: string }
  | { kind: 'diff'; id: string; file?: string }
  | { kind: 'scout'; name: string }
  | { kind: 'scout-pause'; name: string; paused: boolean }
  /** /<name>-scout <name> every N | model M | prompt TEXT: changes one part of the scout's file (model none clears it) */
  | { kind: 'scout-edit'; name: string; field: ScoutEditField; value: string }
  /** /<name>-scout <name> new <instructions>: a new scout (its file), run every NEW_SCOUT_EVERY minutes, as the lead's
   *  scouts tool's add (the name comes first, as in every scout form, so any name works) */
  | { kind: 'scout-new'; name: string; prompt: string }
  /** /<name>-settings role|kind <name> on|off|reset|remove: turns a role or kind on or off, back to the built-in one, or
   *  deletes an added one (the boards ask for a yes first) */
  | { kind: 'def'; def: 'role' | 'kind'; name: string; action: DefAction }
  /** /<name>-settings role|kind <name> add: a new role or kind, from the panel's template (NEW_ROLE_TEMPLATE,
   *  NEW_KIND_TEMPLATE); the name comes first, as in every role|kind form, so any name works */
  | { kind: 'def-add'; def: 'role' | 'kind'; name: string }
  /** /<name>-settings role|kind <name> edit <field> <value>: changes one part of its file (a built-in is copied first);
   *  model, skills and tools "none" clear it */
  | { kind: 'def-edit'; def: 'role' | 'kind'; name: string; field: DefEditField; value: string }
  /** /<name>-settings role|kind <name> save {"field":"value",...}: changes several parts at once, as the panel's Save
   *  (one edit of the lead's tool: a bad value saves none of them) */
  | { kind: 'def-save'; def: 'role' | 'kind'; name: string; fields: Partial<Record<DefEditField, string>> }
  /** /<name>-settings git setup: sets up git as the lead's setup_git does (the boards ask for a yes first) */
  | { kind: 'setup-git' }
  /** /<name>-settings orgmem delete <n> [key]: deletes note n (its place in the file) from organizational memory
   *  (T-619); `key`: the note's check word (orgMemNoteKey), so a number that moved deletes nothing */
  | { kind: 'orgmem-delete'; n: number; key?: string }
  | { kind: 'mode'; mode: SymccMode }
  | { kind: 'disable'; here?: boolean }
  | { kind: 'enable'; here?: boolean }
  | { kind: 'drive' }
  | { kind: 'help'; topic: string }
  | { kind: 'settings' }
  | { kind: 'set'; setting: SettingName; input: SettingsInput }
  | { kind: 'bad'; message: string }

/** The parts of a scout's file /<name>-scout <name> <part> <value> changes: how often it runs, its model, its instructions. */
export const SCOUT_EDIT_FIELDS = ['every', 'model', 'prompt'] as const
export type ScoutEditField = (typeof SCOUT_EDIT_FIELDS)[number]

/** How often a scout made with /<name>-scout <name> new runs, in minutes (the panel's new scout starts with it too). */
export const NEW_SCOUT_EVERY = 60

/** What /<name>-settings role|kind <name> <action> does to a role or kind. */
export const DEF_ACTIONS = ['on', 'off', 'reset', 'remove'] as const
export type DefAction = (typeof DEF_ACTIONS)[number]

/** The parts of a role's or kind's file /<name>-settings role|kind <name> edit <field> <value> changes (the lead's
 *  roles and kinds tools' fields, in the order the edit pages show them). */
export const ROLE_EDIT_FIELDS = ['description', 'model', 'skills', 'tools', 'checklist'] as const
export const KIND_EDIT_FIELDS = ['description', 'body'] as const
export type DefEditField = (typeof ROLE_EDIT_FIELDS)[number] | (typeof KIND_EDIT_FIELDS)[number]
/** The fields whose value "none" clears them (a list or the model). */
export const CLEARED_BY_NONE: readonly DefEditField[] = ['model', 'skills', 'tools']
/** The fields of a role or a kind. */
export const defEditFields = (def: 'role' | 'kind'): readonly DefEditField[] => (def === 'role' ? ROLE_EDIT_FIELDS : KIND_EDIT_FIELDS)

/** The usage line of /<name>-settings role|kind. */
export const defUsage = (def: 'role' | 'kind', name: string = DEFAULT_NAME) =>
  `/${name}-settings ${def} <name> on, off, reset or remove; /${name}-settings ${def} <name> add (a new one); /${name}-settings ${def} <name> edit ${defEditFields(def).join('|')} <value>; or /${name}-settings ${def} <name> save {"<field>":"<value>",...}`

/** The fields of a save's JSON text (`{"description":"...","tools":"web"}`), or null when it is not an object of
 *  known fields with text values, or it empties the description. */
export function defSaveFields(def: 'role' | 'kind', text: string): Partial<Record<DefEditField, string>> | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: Partial<Record<DefEditField, string>> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!defEditFields(def).includes(k as DefEditField) || typeof v !== 'string') return null
    out[k as DefEditField] = v
  }
  if (!Object.keys(out).length || (out.description !== undefined && !out.description.trim())) return null
  return out
}

/** What /<name>-task T-5 <verb> does to the task (each the same as the lead's tool): pause, resume, retry, drop
 *  [reason], merged (its work is already merged outside the board), review on|off (needs_review), stash (to the
 *  backlog), todo (out of the backlog), role <name>, note (an answered investigation: Done and keep it as a note). */
export const TASK_VERBS = ['pause', 'resume', 'retry', 'drop', 'merged', 'review', 'stash', 'todo', 'role', 'note'] as const
export type TaskVerb = (typeof TASK_VERBS)[number]

/** The usage line of /<name>-task. */
export const taskUsage = (name: string = DEFAULT_NAME) => `/${name}-task T-3 (open it), or /${name}-task T-3 pause|resume|retry|drop [reason]|merged|review on|off|stash|todo|role <name>|note`

/** The words after the plugin's name, one per command: /<name>-tasks, /<name>-approve, ... */
export const COMMAND_WORDS = ['tasks', 'scouts', 'task', 'approve', 'reject', 'diff', 'scout', 'mode', 'settings', 'help', 'disable', 'enable', 'drive'] as const

/** Every slash command's name (without the slash): "<name>" and "<name>-<word>". */
export const commandNames = (name: string = DEFAULT_NAME): string[] => [name, ...COMMAND_WORDS.map(w => `${name}-${w}`)]

const isId = (s: string | undefined) => !!s && /^t-?\d+$/i.test(s)

/**
 * The new mode for /<name>-mode: with no word, review and auto switch (paused goes to review, never
 * to paused); "paused", "review" or "auto" set it; anything else gives a usage line.
 */
export function parseModeCommand(args: string, current: SymccMode, name: string = DEFAULT_NAME): { kind: 'mode'; mode: SymccMode } | { kind: 'bad'; message: string } {
  const s = String(args ?? '').trim().toLowerCase()
  if (!s) return { kind: 'mode', mode: modeOf({ mode: current }) === 'review' ? 'auto' : 'review' }
  if (isMode(s)) return { kind: 'mode', mode: s }
  return { kind: 'bad', message: `Use: /${name}-mode (switch review and auto), or /${name}-mode paused|review|auto` }
}

/**
 * Reads a slash command: `command` is its name without the slash ("symcc-approve"), `args` the
 * words after it, `current` the board's mode (for /<name>-mode with no word). null when the
 * command is not one of this plugin's. Wrong use gives `bad` with a short usage line.
 */
export function parseCommand(command: string, args: string, current: SymccMode = 'auto', name: string = DEFAULT_NAME): Command | null {
  const s = String(args ?? '').trim()
  const words = s ? s.split(/\s+/) : []
  const id = words[0]
  const use = (text: string): Command => ({ kind: 'bad', message: `Use: ${text}` })
  const c = String(command ?? '').trim().replace(/^\//, '')
  if (c === name) return s ? use(`/${name} (open the board), or /${name}-help for every command`) : { kind: 'open' }
  if (!c.startsWith(`${name}-`)) return null
  switch (c.slice(name.length + 1)) {
    case 'tasks':
      return s ? use(`/${name}-tasks`) : { kind: 'tasks' }
    case 'scouts':
      return s ? use(`/${name}-scouts (to run one: /${name}-scout <name>)`) : { kind: 'scouts' }
    case 'task': {
      if (!isId(id)) return use(taskUsage(name))
      if (words.length === 1) return { kind: 'show', id: normId(id!) }
      const verb = words[1]!.toLowerCase() as TaskVerb
      if (!TASK_VERBS.includes(verb)) return use(taskUsage(name))
      const rest = s.replace(/^\S+\s+\S+\s*/, '').trim()
      const at = { kind: 'task-do' as const, id: normId(id!), verb }
      if (verb === 'drop') return rest ? { ...at, reason: rest } : at
      if (verb === 'role') return words.length === 3 ? { ...at, role: words[2]! } : use(`/${name}-task ${at.id} role <name>`)
      if (verb === 'review') {
        const on = (words[2] ?? '').toLowerCase()
        return words.length === 3 && (on === 'on' || on === 'off') ? { ...at, on: on === 'on' } : use(`/${name}-task ${at.id} review on|off`)
      }
      return words.length === 2 ? at : use(taskUsage(name))
    }
    case 'approve':
      return isId(id) && words.length === 1 ? { kind: 'approve', id: normId(id!) } : use(`/${name}-approve T-5`)
    case 'reject': {
      if (!isId(id)) return use(`/${name}-reject T-5 <reason>`)
      const reason = s.replace(/^\S+\s*/, '').trim()
      if (!reason) return { kind: 'bad', message: `Say why, so the next worker knows what to fix: /${name}-reject ${normId(id!)} <reason>` }
      return { kind: 'reject', id: normId(id!), reason }
    }
    case 'diff': {
      if (!isId(id)) return use(`/${name}-diff T-5, or /${name}-diff T-5 <file>`)
      const file = s.replace(/^\S+\s*/, '').trim()
      return file ? { kind: 'diff', id: normId(id!), file } : { kind: 'diff', id: normId(id!) }
    }
    case 'scout': {
      if (words.length === 1) return { kind: 'scout', name: id! }
      if (words.length === 2 && /^(pause|resume)$/i.test(words[1]!)) return { kind: 'scout-pause', name: id!, paused: words[1]!.toLowerCase() === 'pause' }
      const field = (words[1] ?? '').toLowerCase() as ScoutEditField
      // <name> new <instructions>: the name comes first, so a new scout may have any name
      if (words.length >= 3 && field === ('new' as string)) return { kind: 'scout-new', name: id!, prompt: s.replace(/^\S+\s+\S+\s*/, '').trim() }
      if (words.length >= 3 && SCOUT_EDIT_FIELDS.includes(field)) {
        // the value is the rest of the text as typed (the instructions keep their spacing)
        const value = s.replace(/^\S+\s+\S+\s*/, '').trim()
        return { kind: 'scout-edit', name: id!, field, value: field === 'model' && value.toLowerCase() === 'none' ? '' : value }
      }
      return use(`/${name}-scout <name> (run it now), /${name}-scout <name> pause, or /${name}-scout <name> resume; to change it: /${name}-scout <name> every <minutes>, model <model|none> or prompt <instructions>; a new one: /${name}-scout <name> new <instructions>`)
    }
    case 'mode':
      return parseModeCommand(s, current, name)
    case 'settings': {
      const def = (id ?? '').toLowerCase()
      if (def === 'role' || def === 'kind') {
        const action = (words[2] ?? '').toLowerCase()
        if (words.length === 3 && DEF_ACTIONS.includes(action as DefAction)) return { kind: 'def', def, name: words[1]!, action: action as DefAction }
        if (words.length === 3 && action === 'add') return { kind: 'def-add', def, name: words[1]! }
        if (words.length >= 4 && action === 'save') {
          const fields = defSaveFields(def, s.replace(/^\S+\s+\S+\s+\S+\s*/, '').trim())
          return fields ? { kind: 'def-save', def, name: words[1]!, fields } : use(defUsage(def, name))
        }
        const field = (words[3] ?? '').toLowerCase() as DefEditField
        if (words.length >= 4 && action === 'edit' && defEditFields(def).includes(field)) {
          // the value is the rest of the text as typed (a checklist keeps its lines)
          const value = s.replace(/^\S+\s+\S+\s+\S+\s+\S+\s*/, '').trim()
          if (field === 'description' && !value) return use(`/${name}-settings ${def} ${words[1]} edit description <a few words>`)
          return { kind: 'def-edit', def, name: words[1]!, field, value: CLEARED_BY_NONE.includes(field) && value.toLowerCase() === 'none' ? '' : value }
        }
        return use(defUsage(def, name))
      }
      if (def === 'git') return words.length === 2 && words[1]!.toLowerCase() === 'setup' ? { kind: 'setup-git' } : use(`/${name}-settings git setup (git init on main if there is no repo, a .gitignore and a first commit; never pushes)`)
      if (def === 'orgmem') {
        const n = Number(words[2])
        const key = words[3]
        const ok = (words.length === 3 || (words.length === 4 && /^[0-9a-f]{6}$/i.test(key ?? ''))) && (words[1] ?? '').toLowerCase() === 'delete' && Number.isInteger(n) && n > 0
        return ok ? { kind: 'orgmem-delete', n, ...(key ? { key: key.toLowerCase() } : {}) } : use(`/${name}-settings orgmem delete <n> (n: the note's number on the Organizational memory page)`)
      }
      return parseSettingsCommand(s, name)
    }
    case 'help':
      return { kind: 'help', topic: s }
    case 'disable':
      if (s.toLowerCase() === 'here') return { kind: 'disable', here: true }
      return s ? use(`/${name}-disable [here] (turn ${name} off entirely, or only in this window; /${name}-enable [here] turns it back on)`) : { kind: 'disable' }
    case 'enable':
      if (s.toLowerCase() === 'here') return { kind: 'enable', here: true }
      return s ? use(`/${name}-enable [here]`) : { kind: 'enable' }
    case 'drive':
      return s ? use(`/${name}-drive (make this session drive the board)`) : { kind: 'drive' }
  }
  return null
}

/** The changed files as text lines for /<name>-diff: "hooks/board.ts  +12 -3", then a total. */
export function statText(id: string, files: DiffFile[], name: string = DEFAULT_NAME): string {
  if (!files.length) return `${id} has no changes against the target branch.`
  const w = Math.max(...files.map(f => f.file.length))
  const add = files.reduce((n, f) => n + f.added, 0)
  const del = files.reduce((n, f) => n + f.removed, 0)
  return [`${id} changes ${files.length} ${files.length === 1 ? 'file' : 'files'} (+${add} -${del})${files.some(f => f.edited) ? ` ${YOUR_EDITS}` : ''}:`, ...files.map(f => `  ${f.file.padEnd(w)}  ${statCount(f)}`), `One file in full: /${name}-diff ${id} <file>`].join('\n')
}

/** Where the review/waiting/failed tasks go in the panel's list: those first (in this order), the rest after. */
export const NEEDS_YOU: SymccStatus[] = ['review', 'waiting', 'failed']

/** A task being worked on whose worker ran over its time limit while the owner is asked "give it more time?" (time_ask set). */
export const asksMoreTime = (t: Pick<SymccTask, 'status'> & { time_ask?: string }): boolean => t.status === 'doing' && !!t.time_ask

/** Whether it is the owner's turn on task `t`: it is in review, waiting or failed (NEEDS_YOU) and no approve of it runs
 *  at `nowMs` (approveRunning: prep, in line, test, merge). The lists show such a task's title in bold; VS Code shows how
 *  long it has waited. */
export const ownersTurn = (t: Pick<SymccTask, 'status'> & Pick<BoardTask, 'checking'>, nowMs: number = Date.now()): boolean => {
  const w = taskPhase(t, nowMs).waitsFor
  return !!w && w !== 'time'
}

/** Whether a task needs the owner: its owner's turn (ownersTurn), or a running task asking for more time. A task
 *  in review (or waiting) whose approve runs at `nowMs` does not: it is listed and counted with the running tasks
 *  until the approve ends. */
export const needsYou = (t: Pick<SymccTask, 'status'> & { time_ask?: string } & Pick<BoardTask, 'checking'>, nowMs: number = Date.now()): boolean =>
  ownersTurn(t, nowMs) || asksMoreTime(t)

/** Whether a task waits for the owner's answer ("waiting"), and no merge of it runs at `nowMs` (approveRunning).
 *  Every view uses this for "waiting for you". */
export const waitsForYou = (t: { status?: unknown } & Pick<BoardTask, 'checking'>, nowMs: number = Date.now()): boolean =>
  t.status === 'waiting' && !taskPhase(t as Pick<BoardTask, 'status' | 'checking'>, nowMs).stage

/** The lead's line after the owner answered task `t`'s question with `answer` on a board panel. */
export const answeredLeadLine = (t: { id: string }, answer: string, brief: (s: string) => string = s => s): string => `The owner answered ${t.id} ("${brief(answer)}"); it went back to work.`

/** For the panel: tasks that need the owner (see needsYou) first, the rest keep their order. A task asking for
 *  more time sorts with the waiting ones (both wait for an answer). */
export function needsYouFirst<T extends Pick<SymccTask, 'status'> & { time_ask?: string }>(tasks: T[]): T[] {
  const rank = (t: T) => {
    const i = NEEDS_YOU.indexOf(asksMoreTime(t) ? 'waiting' : t.status)
    return i < 0 ? NEEDS_YOU.length : i
  }
  return tasks.map((t, i) => [t, i] as const).sort(([a, i], [b, j]) => rank(a) - rank(b) || i - j).map(([t]) => t)
}
