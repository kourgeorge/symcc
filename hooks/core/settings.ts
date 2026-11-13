// Failing tests, turning things on and off, the settings, and branch conflicts.
import type { SymccTask } from '../../types'
import { DEFAULT_NAME } from '../name'
import { type Board, DEFAULT_ARCHIVE_DAYS, DEFAULT_AUTO_RETRIES, emptyBoard, isMode, modeOf } from './board-file'
import { num } from './text'

/** 'retry' while fewer than `max` tries were used, else 'fail'. */
const retryOrFail = (tries: number | undefined, max: number): 'retry' | 'fail' => ((tries ?? 0) < max ? 'retry' : 'fail')

// ---------------- when the tests fail ----------------

/** How much of the failing test output the next worker is shown (the end of it). */
export const TEST_OUTPUT_CHARS = 3000

/**
 * A task's tests failed. 'retry': send it back to "todo" so a new worker fixes it, with the
 * test output; 'fail': it already had `max` automatic retries, so the lead decides.
 */
export function onTestFail(t: Pick<SymccTask, 'test_tries'>, max = DEFAULT_AUTO_RETRIES): 'retry' | 'fail' {
  return retryOrFail(t.test_tries, max)
}

/** The last `n` characters of the test output, so it fits in the next worker's prompt. */
export function testTail(output: string, n = TEST_OUTPUT_CHARS): string {
  const s = String(output ?? '').trim()
  return s.length > n ? '…' + s.slice(-n) : s
}

/** Should the board panel open by itself when a session starts? Yes unless the board turned it off. */
export const openOnStart = (b: Partial<Pick<Board, 'open_on_start'>>) => b.open_on_start !== false

/** Should a merged task be said out loud? Yes unless the board turned voice off. */
export const voiceOn = (b: Partial<Pick<Board, 'voice'>>) => b.voice !== false

/** Is the plugin on for this project? Yes unless /<name>-off turned it off (old boards have no `enabled`: on). */
export const symccOn = (b: Partial<Pick<Board, 'enabled'>>) => b.enabled !== false

/** The board with the plugin turned on or off; nothing else changes (tasks, mode and scouts are kept). */
export const setEnabled = (b: Board, on: boolean): Board => ({ ...b, enabled: on })

/** What every lead tool answers while the plugin is off. */
export const offAnswer = (name: string = DEFAULT_NAME) => `${name} is off. The owner can turn it on with /${name}-on.`

/** The status line while the plugin is off. */
export const offStatusLine = (name: string = DEFAULT_NAME) => `${name} off · /${name}-on`

/** The spoken line for tasks just merged: "T-3 done", "T-3 and T-4 done", "T-3, T-4 and T-5 done". '' for none. */
export function spokenDone(ids: string[]): string {
  const xs = [...new Set(ids.map(x => String(x ?? '').trim()).filter(Boolean))]
  if (!xs.length) return ''
  const list = xs.length === 1 ? xs[0]! : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
  return `${list} done`
}

/** A settings value for auto_retries: a whole number from 0 to 10. */
export const clampRetries = (n: number) => Math.max(0, Math.min(10, Math.round(Number.isFinite(n) ? n : DEFAULT_AUTO_RETRIES)))

// ---------------- settings ----------------
// One list of settings, used by the lead's settings tool, /<name>-settings and the panel's Settings view.

export const SETTING_NAMES = ['test_commands', 'target_branch', 'max_parallel', 'max_minutes', 'auto_retries', 'archive_days', 'open_on_start', 'voice', 'mode', 'enabled'] as const
export type SettingName = (typeof SETTING_NAMES)[number]
/** commands: test_commands; branch: target_branch; number: a whole number within min-max; onoff: true/false; mode: off/review/auto */
export type SettingKind = 'commands' | 'branch' | 'number' | 'onoff' | 'mode'
export type SettingInfo = { name: SettingName; kind: SettingKind; min?: number; max?: number; default: string; range: string; meaning: string }

/** How many test commands a board keeps. */
export const MAX_TEST_COMMANDS = 5

export const SETTINGS: SettingInfo[] = [
  { name: 'test_commands', kind: 'commands', default: 'none', range: 'commands joined with " && "', meaning: 'must all pass before work is merged' },
  { name: 'target_branch', kind: 'branch', default: 'the branch checked out', range: 'an existing local branch', meaning: 'the branch finished work is merged into' },
  { name: 'max_parallel', kind: 'number', min: 1, max: 8, default: '3', range: '1-8', meaning: 'how many workers run at once' },
  { name: 'max_minutes', kind: 'number', min: 5, max: 600, default: '45', range: '5-600', meaning: 'a worker running longer is stopped' },
  { name: 'auto_retries', kind: 'number', min: 0, max: 10, default: String(DEFAULT_AUTO_RETRIES), range: '0-10', meaning: 'new tries on their own after failing tests' },
  { name: 'archive_days', kind: 'number', min: 0, max: 3650, default: String(DEFAULT_ARCHIVE_DAYS), range: '0-3650 (0 = never)', meaning: 'done and dropped tasks older than this move to archive.json' },
  { name: 'open_on_start', kind: 'onoff', default: 'on', range: 'on / off', meaning: 'open the board panel when a session starts' },
  { name: 'voice', kind: 'onoff', default: 'on', range: 'on / off', meaning: 'say "T-3 done" out loud when a task is merged' },
  { name: 'mode', kind: 'mode', default: 'auto', range: 'off / review / auto', meaning: 'off: nothing runs; review: finished work waits for you; auto: it merges on its own' },
  { name: 'enabled', kind: 'onoff', default: 'on', range: 'on / off', meaning: 'off: the whole plugin rests and Claude works as normal' },
]

export const settingInfo = (name: string): SettingInfo | undefined => SETTINGS.find(s => s.name === name)

/** A setting's current value as text: "npm test && npm run lint", "on", "5", "none". */
export function settingValue(b: Partial<Board>, name: SettingName): string {
  const d = emptyBoard()
  switch (name) {
    case 'test_commands':
      return (b.test_commands ?? []).join(' && ') || 'none'
    case 'target_branch':
      return b.target_branch ?? d.target_branch
    case 'open_on_start':
      return openOnStart(b) ? 'on' : 'off'
    case 'voice':
      return voiceOn(b) ? 'on' : 'off'
    case 'enabled':
      return symccOn(b) ? 'on' : 'off'
    case 'mode':
      return modeOf(b)
    default:
      return String(b[name] ?? d[name])
  }
}

/** What the settings tool takes: each key optional; anything of the wrong type is left alone. */
export type SettingsInput = Record<string, unknown>

/** One changed setting: `value` as text, `said` the lead's wording, `cut` a note when the value was cut to its limit ('' if not). */
export type SettingChange = { name: SettingName; value: string; said: string; cut: string }

/**
 * Applies the settings in `a` to the board, with the same limits for the lead and the owner:
 * max_parallel 1-8, max_minutes 5-600, auto_retries 0-10, up to 5 test commands. A value
 * outside its limit is cut to it, and the change says so. target_branch must already be
 * checked to exist; mode and enabled are not set here (see setBoardMode and setEnabled).
 */
export function applySettings(b: Board, a: SettingsInput): { board: Board; changes: SettingChange[] } {
  const y = { ...b }
  const changes: SettingChange[] = []
  const add = (name: SettingName, said: string, cut = '') => changes.push({ name, value: settingValue(y, name), said, cut })
  const target = typeof a.target_branch === 'string' ? a.target_branch.trim() : ''
  if (target) ((y.target_branch = target), add('target_branch', `work merges into ${target}`))
  if (Array.isArray(a.test_commands)) {
    const all = a.test_commands.map(x => String(x).trim()).filter(Boolean)
    y.test_commands = all.slice(0, MAX_TEST_COMMANDS)
    add('test_commands', `tests: ${y.test_commands.join(' && ') || 'none'}`, all.length > MAX_TEST_COMMANDS ? ` (only the first ${MAX_TEST_COMMANDS} kept: test_commands holds up to ${MAX_TEST_COMMANDS})` : '')
  }
  for (const name of ['max_parallel', 'max_minutes', 'auto_retries', 'archive_days'] as const) {
    const n = a[name]
    if (typeof n !== 'number' || !Number.isFinite(n)) continue
    const s = settingInfo(name)!
    const v = Math.max(s.min!, Math.min(s.max!, Math.round(n)))
    y[name] = v
    const cut = v !== Math.round(n) ? ` (cut from ${n} to the limit: ${name} must be ${s.range})` : ''
    const said =
      name === 'max_parallel' ? `up to ${v} at once`
      : name === 'max_minutes' ? `a worker may run ${v} min`
      : name === 'archive_days' ? (v ? `done and dropped tasks older than ${v} ${v === 1 ? 'day' : 'days'} are archived` : 'old tasks are never archived')
      : `${v} automatic ${v === 1 ? 'retry' : 'retries'} after failing tests`
    add(name, said, cut)
  }
  if (typeof a.open_on_start === 'boolean') ((y.open_on_start = a.open_on_start), add('open_on_start', a.open_on_start ? 'the board opens when a session starts' : 'the board no longer opens when a session starts'))
  if (typeof a.voice === 'boolean') ((y.voice = a.voice), add('voice', a.voice ? 'merged tasks are said out loud' : 'merged tasks are no longer said out loud'))
  return { board: y, changes }
}

/** The owner's wording of a change: "max_parallel set to 5", plus the cut note. */
export const settingSetText = (c: SettingChange) => `${c.name} set to ${c.value}${c.cut}`

const unquoteValue = (s: string) => {
  const t = s.trim()
  return t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0] ? t.slice(1, -1).trim() : t
}

/**
 * Reads a typed value for one setting into settings tool input: numbers as whole numbers
 * (outside the limit they are cut later, by applySettings), on/off, a mode, one branch name,
 * or test commands joined with " && " ("none" or "" for none).
 */
export function parseSettingValue(name: SettingName, raw: string): { ok: true; input: SettingsInput } | { ok: false; message: string } {
  const s = settingInfo(name)!
  const v = unquoteValue(String(raw ?? ''))
  const bad = (message: string) => ({ ok: false as const, message })
  switch (s.kind) {
    case 'number':
      return /^[+-]?\d+(\.\d+)?$/.test(v) ? { ok: true, input: { [name]: Number(v) } } : bad(`${name} must be a whole number, ${s.range}`)
    case 'onoff': {
      const w = v.toLowerCase()
      if (['on', 'true', 'yes'].includes(w)) return { ok: true, input: { [name]: true } }
      if (['off', 'false', 'no'].includes(w)) return { ok: true, input: { [name]: false } }
      return bad(`${name} must be on or off`)
    }
    case 'mode': {
      const w = v.toLowerCase()
      return isMode(w) ? { ok: true, input: { mode: w } } : bad('mode must be off, review or auto')
    }
    case 'branch':
      return v && !/\s/.test(v) ? { ok: true, input: { target_branch: v } } : bad('target_branch must be one existing branch name')
    case 'commands':
      return { ok: true, input: { test_commands: v.toLowerCase() === 'none' ? [] : v.split(/\s+&&\s+/).map(x => x.trim()).filter(Boolean) } }
  }
}

/**
 * /<name>-settings: no words opens the Settings view; "NAME VALUE" sets one setting
 * (e.g. "max_parallel 5", "voice off", 'test_commands "npm test"').
 */
export function parseSettingsCommand(args: string, name: string = DEFAULT_NAME): { kind: 'settings' } | { kind: 'set'; setting: SettingName; input: SettingsInput } | { kind: 'bad'; message: string } {
  const s = String(args ?? '').trim()
  if (!s) return { kind: 'settings' }
  const word = s.split(/\s+/)[0]!
  const info = settingInfo(word.toLowerCase().replace(/-/g, '_'))
  if (!info) return { kind: 'bad', message: `There is no setting called ${word}; settings are: ${SETTING_NAMES.join(', ')}` }
  const rest = s.slice(word.length).trim()
  if (!rest) return { kind: 'bad', message: `Give a value: /${name}-settings ${info.name} <${info.range}> (${info.meaning})` }
  const r = parseSettingValue(info.name, rest)
  return r.ok ? { kind: 'set', setting: info.name, input: r.input } : { kind: 'bad', message: r.message }
}

/** The settings as text lines: name, value, default, range and meaning (when the panel can't be shown). */
export function settingsText(b: Partial<Board>, name: string = DEFAULT_NAME): string {
  const w = Math.max(...SETTING_NAMES.map(n => n.length))
  return [
    ...SETTINGS.map(s => `${s.name.padEnd(w)}  ${settingValue(b, s.name)}  (default ${s.default} · ${s.range}) ${s.meaning}`),
    `Change one: /${name}-settings NAME VALUE, e.g. /${name}-settings max_parallel 5`,
  ].join('\n')
}

// ---------------- when the branch conflicts with main ----------------

/** How many new tries a task gets to merge main into its branch after a conflict. */
export const MAX_CONFLICT_TRIES = DEFAULT_AUTO_RETRIES

/**
 * A task's branch conflicted with the latest main. 'retry': send it back to "todo" so a new
 * worker merges main and resolves the conflict; 'fail': it was already tried `max` times.
 */
export function onConflict(t: Pick<SymccTask, 'conflict_tries'>, max = MAX_CONFLICT_TRIES): 'retry' | 'fail' {
  return retryOrFail(t.conflict_tries, max)
}

/** For showing the board: newest task first (by when it was made, then by its number). */
export function newestFirst(x: SymccTask, y: SymccTask): number {
  return (y.created_at || '').localeCompare(x.created_at || '') || num(y.id) - num(x.id)
}
