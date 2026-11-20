// The slash commands.
import type { SymccMode, SymccStatus, SymccTask } from '../../types'
import { DEFAULT_NAME } from '../name'
import { isMode, modeOf, normId, STATUS_WORD } from './board-file'
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
  | { kind: 'approve'; id: string }
  | { kind: 'reject'; id: string; reason: string }
  | { kind: 'diff'; id: string; file?: string }
  | { kind: 'scout'; name: string }
  | { kind: 'scout-pause'; name: string; paused: boolean }
  /** /<name>-scout <name> every N | model M | prompt TEXT: changes one part of the scout's file (model none clears it) */
  | { kind: 'scout-edit'; name: string; field: ScoutEditField; value: string }
  /** /<name>-settings role|kind <name> on|off|reset: turns a role or kind on or off, or back to the built-in one */
  | { kind: 'def'; def: 'role' | 'kind'; name: string; action: DefAction }
  | { kind: 'mode'; mode: SymccMode }
  | { kind: 'off' }
  | { kind: 'on' }
  | { kind: 'drive' }
  | { kind: 'help'; topic: string }
  | { kind: 'settings' }
  | { kind: 'set'; setting: SettingName; input: SettingsInput }
  | { kind: 'bad'; message: string }

/** The parts of a scout's file /<name>-scout <name> <part> <value> changes: how often it runs, its model, its instructions. */
export const SCOUT_EDIT_FIELDS = ['every', 'model', 'prompt'] as const
export type ScoutEditField = (typeof SCOUT_EDIT_FIELDS)[number]

/** What /<name>-settings role|kind <name> <action> does to a role or kind. */
export const DEF_ACTIONS = ['on', 'off', 'reset'] as const
export type DefAction = (typeof DEF_ACTIONS)[number]

/** The words after the plugin's name, one per command: /<name>-tasks, /<name>-approve, ... */
export const COMMAND_WORDS = ['tasks', 'scouts', 'task', 'approve', 'reject', 'diff', 'scout', 'mode', 'settings', 'help', 'off', 'on', 'drive'] as const

/** Every slash command's name (without the slash): "<name>" and "<name>-<word>". */
export const commandNames = (name: string = DEFAULT_NAME): string[] => [name, ...COMMAND_WORDS.map(w => `${name}-${w}`)]

const isId = (s: string | undefined) => !!s && /^t-?\d+$/i.test(s)

/**
 * The new mode for /<name>-mode: with no word, review and auto switch (off goes to review, never
 * to off); "off", "review" or "auto" set it; anything else gives a usage line.
 */
export function parseModeCommand(args: string, current: SymccMode, name: string = DEFAULT_NAME): { kind: 'mode'; mode: SymccMode } | { kind: 'bad'; message: string } {
  const s = String(args ?? '').trim().toLowerCase()
  if (!s) return { kind: 'mode', mode: modeOf({ mode: current }) === 'review' ? 'auto' : 'review' }
  if (isMode(s)) return { kind: 'mode', mode: s }
  return { kind: 'bad', message: `Use: /${name}-mode (switch review and auto), or /${name}-mode off|review|auto` }
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
    case 'task':
      return isId(id) && words.length === 1 ? { kind: 'show', id: normId(id!) } : use(`/${name}-task T-3`)
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
      if (words.length >= 3 && SCOUT_EDIT_FIELDS.includes(field)) {
        // the value is the rest of the text as typed (the instructions keep their spacing)
        const value = s.replace(/^\S+\s+\S+\s*/, '').trim()
        return { kind: 'scout-edit', name: id!, field, value: field === 'model' && value.toLowerCase() === 'none' ? '' : value }
      }
      return use(`/${name}-scout <name> (run it now), /${name}-scout <name> pause, or /${name}-scout <name> resume; to change it: /${name}-scout <name> every <minutes>, model <model|none> or prompt <instructions>`)
    }
    case 'mode':
      return parseModeCommand(s, current, name)
    case 'settings': {
      const def = (id ?? '').toLowerCase()
      if (def === 'role' || def === 'kind') {
        const action = (words[2] ?? '').toLowerCase() as DefAction
        return words.length === 3 && DEF_ACTIONS.includes(action) ? { kind: 'def', def, name: words[1]!, action } : use(`/${name}-settings ${def} <name> on, off or reset`)
      }
      return parseSettingsCommand(s, name)
    }
    case 'help':
      return { kind: 'help', topic: s }
    case 'off':
      return s ? use(`/${name}-off (turn ${name} off; /${name}-on turns it back on)`) : { kind: 'off' }
    case 'on':
      return s ? use(`/${name}-on`) : { kind: 'on' }
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

/** Whether a task needs the owner: review, waiting or failed (NEEDS_YOU), or a running task asking for more time. */
export const needsYou = (t: Pick<SymccTask, 'status'> & { time_ask?: string }): boolean => NEEDS_YOU.includes(t.status) || asksMoreTime(t)

/** Whether a task waits for the owner's answer ("waiting"). Every view uses this for "waiting for you". */
export const waitsForYou = (t: { status?: unknown }): boolean => t.status === 'waiting'

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
