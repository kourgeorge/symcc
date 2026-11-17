// Failing tests, turning things on and off, the settings, and branch conflicts.
import type { SymccTask } from '../../types'
import { DEFAULT_NAME } from '../name'
import { type Board, type Notify, DEFAULT_ARCHIVE_DAYS, DEFAULT_AUTO_RETRIES, NOTIFY_CHOICES, emptyBoard, isMode, isNotify, isScoutFindings, isTestsWithChanges, modeOf, scoutFindingsOf, testsWithChangesOf } from './board-file'
import { num } from './text'

/** 'retry' while fewer than `max` tries were used, else 'fail'. */
const retryOrFail = (tries: number | undefined, max: number): 'retry' | 'fail' => ((tries ?? 0) < max ? 'retry' : 'fail')

// ---------------- when the tests fail ----------------

/** How much of the failing test output the next worker is shown (the end of it). */
export const TEST_OUTPUT_CHARS = 3000

/**
 * A task's tests failed. 'retry': send it back to "todo" so a new worker fixes it, with the
 * test output; 'fail': it already had `max` automatic retries, so the lead decides. `max` is the count of its kind's
 * `tests` check (`on fail: back to <stage> N times`, see testRetriesOf in stages.ts), else the board's auto_retries.
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

// ---------------- notify: off, sound or voice ----------------

/** The system a session runs on, as far as notify cares. */
export type NotifySystem = 'mac' | 'linux' | 'windows' | 'other'

/** What this machine can play (found once per session, without playing anything). */
export type Playable = { system: NotifySystem; sound: boolean; voice: boolean }

/** The default notify for a machine: voice where it can speak, else sound where it can chime, else off. */
export const bestNotify = (can: Pick<Playable, 'sound' | 'voice'>): Notify => (can.voice ? 'voice' : can.sound ? 'sound' : 'off')

/**
 * The notify setting in use: the board's own choice, or (none saved) the best this machine can
 * play. Without `can` (the machine not known yet) an unsaved choice reads as 'voice'.
 */
export const notifyOf = (b: Partial<Pick<Board, 'notify'>>, can?: Pick<Playable, 'sound' | 'voice'>): Notify => (isNotify(b.notify) ? b.notify : can ? bestNotify(can) : 'voice')

/** Does this machine play `n`? off always "plays" (nothing). */
export const canPlay = (n: Notify, can: Pick<Playable, 'sound' | 'voice'>) => n === 'off' || !!can[n]

/** The notify choices this machine can play, in order: off always, then sound and voice when found. */
export const notifyChoices = (can: Pick<Playable, 'sound' | 'voice'>): Notify[] => NOTIFY_CHOICES.filter(n => canPlay(n, can))

/** What is missing for `n` here, with what to install: "no speech program found (install espeak or speech-dispatcher)". */
export function missingText(n: 'sound' | 'voice', system: NotifySystem): string {
  if (n === 'voice') {
    if (system === 'mac') return 'no speech program found (the say command is missing)'
    if (system === 'linux') return 'no speech program found (install espeak or speech-dispatcher)'
    if (system === 'windows') return 'no speech program found (PowerShell is missing)'
    return 'no speech program found (voice works on macOS, Linux and Windows)'
  }
  if (system === 'mac') return 'no sound player found (the afplay command or its sounds are missing)'
  if (system === 'linux') return 'no sound player found (install pulseaudio-utils or libcanberra, and the freedesktop sound theme)'
  if (system === 'windows') return 'no sound player found (PowerShell is missing)'
  return 'no sound player found (sound works on macOS, Linux and Windows)'
}

/** Why `n` can't be turned on here ("voice isn't available here: no speech program found (...)"), or '' when it can. */
export function notifyRefusal(n: Notify, can: Playable): string {
  if (n === 'off' || canPlay(n, can)) return ''
  return `${n} isn't available here: ${missingText(n, can.system)}`
}

/** The one-time note when the saved choice can't play on this machine, or '' when it can. */
export function unplayableNote(n: Notify, can: Playable): string {
  if (n === 'off' || canPlay(n, can)) return ''
  return `notify is '${n}' but no ${n === 'voice' ? 'speech program' : 'sound player'} was found here; nothing will play`
}

/** Is the plugin on for this project? Yes unless /<name>-off turned it off (a board without `enabled`, or no board: on). */
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

/** The mark a queued item starts with when it is a task that waits for the owner ("T-5 needs you"), not a merged one. */
export const NEEDS_YOU_MARK = '?'

/** The spoken line for tasks waiting for the owner: "T-5 needs you", "T-5 and T-6 need you". '' for none. */
export function spokenNeedsYou(ids: string[]): string {
  const xs = [...new Set(ids.map(x => String(x ?? '').trim()).filter(Boolean))]
  if (!xs.length) return ''
  const list = xs.length === 1 ? xs[0]! : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
  return `${list} ${xs.length === 1 ? 'needs' : 'need'} you`
}

/** The one spoken line for the notify queue: merged ids ("T-3 done") and ids marked with NEEDS_YOU_MARK ("T-5 needs you"). */
export function spokenLine(items: string[]): string {
  const needs = items.filter(x => String(x ?? '').startsWith(NEEDS_YOU_MARK)).map(x => x.slice(NEEDS_YOU_MARK.length))
  const done = items.filter(x => !String(x ?? '').startsWith(NEEDS_YOU_MARK))
  return [spokenDone(done), spokenNeedsYou(needs)].filter(Boolean).join('. ')
}

/** A settings value for auto_retries: a whole number from 0 to 10. */
export const clampRetries = (n: number) => Math.max(0, Math.min(10, Math.round(Number.isFinite(n) ? n : DEFAULT_AUTO_RETRIES)))

// ---------------- settings ----------------
// One list of settings, used by the lead's settings tool, /<name>-settings and the panel's Settings view.

export const SETTING_NAMES = ['test_commands', 'max_parallel', 'max_minutes', 'auto_retries', 'archive_days', 'open_on_start', 'notify', 'scout_findings', 'tests_with_changes', 'mode', 'enabled'] as const
export type SettingName = (typeof SETTING_NAMES)[number]
/** commands: test_commands; number: a whole number within min-max; onoff: true/false; mode: off/review/auto; notify: off/sound/voice; findings: auto/backlog; untested: off/ask/review */
export type SettingKind = 'commands' | 'number' | 'onoff' | 'mode' | 'notify' | 'findings' | 'untested'
export type SettingInfo = { name: SettingName; kind: SettingKind; min?: number; max?: number; default: string; range: string; meaning: string }

/** How many test commands a board keeps. */
export const MAX_TEST_COMMANDS = 5

export const SETTINGS: SettingInfo[] = [
  { name: 'test_commands', kind: 'commands', default: 'none', range: 'one shell line, or a list of up to 5 lines', meaning: 'must all pass before work is merged' },
  { name: 'max_parallel', kind: 'number', min: 1, max: 8, default: '3', range: '1-8', meaning: 'how many workers run at once' },
  { name: 'max_minutes', kind: 'number', min: 5, max: 600, default: '45', range: '5-600', meaning: 'a worker running longer makes symcc ask the owner for more time' },
  { name: 'auto_retries', kind: 'number', min: 0, max: 10, default: String(DEFAULT_AUTO_RETRIES), range: '0-10', meaning: 'new tries on their own after failing tests' },
  { name: 'archive_days', kind: 'number', min: 0, max: 3650, default: String(DEFAULT_ARCHIVE_DAYS), range: '0-3650 (0 = never)', meaning: 'done and dropped tasks older than this move to archive.json' },
  { name: 'open_on_start', kind: 'onoff', default: 'on', range: 'on / off', meaning: 'open the board panel when a session starts' },
  { name: 'notify', kind: 'notify', default: 'voice (else sound, else off)', range: 'off / sound / voice', meaning: 'when a task is merged or a worker asks you something: a chime (sound), or "symcc: T-3 done" / "symcc: T-5 needs you" out loud, the project name first (voice)' },
  { name: 'scout_findings', kind: 'findings', default: 'auto', range: 'auto / backlog', meaning: 'auto: the lead decides, a scout finding it adds goes to todo and runs; backlog: every task added from a scout finding goes to the backlog and waits for you' },
  { name: 'tests_with_changes', kind: 'untested', default: 'ask', range: 'off / ask / review', meaning: 'a change task that edits code but no test file: ask: it merges and the lead is told "T-3 changed code but no test"; review: it waits for your review instead; off: nothing (test files are in test/, tests/, __tests__/, spec/, e2e/ or cypress/ folders or have a test name like a.test.ts, a-test.ts, a.cy.ts, login.e2e.ts, FooTest.java; docs-only changes such as .md files, images and non-code files under docs/ are never flagged)' },
  { name: 'mode', kind: 'mode', default: 'auto', range: 'off / review / auto', meaning: 'off: nothing runs; review: finished work waits for you; auto: it merges on its own' },
  { name: 'enabled', kind: 'onoff', default: 'on', range: 'on / off', meaning: 'off: the whole plugin rests and Claude works as normal' },
]

export const settingInfo = (name: string): SettingInfo | undefined => SETTINGS.find(s => s.name === name)

/**
 * Test commands as text: one command as it is ("cd web && npm test" is one shell line),
 * several as a list in brackets (["npm test", "npm run lint"]), none as "none".
 * parseSettingValue reads the same text back.
 */
export const testCommandsText = (cmds: readonly string[]): string => (!cmds.length ? 'none' : cmds.length === 1 && !cmds[0]!.trim().startsWith('[') ? cmds[0]! : JSON.stringify(cmds))

/** A setting's current value as text: "npm test", '["npm test", "npm run lint"]', "on", "5", "none". */
export function settingValue(b: Partial<Board>, name: SettingName): string {
  const d = emptyBoard()
  switch (name) {
    case 'test_commands':
      return testCommandsText(b.test_commands ?? [])
    case 'open_on_start':
      return openOnStart(b) ? 'on' : 'off'
    case 'notify':
      return notifyOf(b)
    case 'enabled':
      return symccOn(b) ? 'on' : 'off'
    case 'mode':
      return modeOf(b)
    case 'scout_findings':
      return scoutFindingsOf(b)
    case 'tests_with_changes':
      return testsWithChangesOf(b)
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
 * outside its limit is cut to it, and the change says so. There is no branch setting: each task
 * merges into the branch it was made on. Mode and enabled are not set here (see setBoardMode and setEnabled).
 */
export function applySettings(b: Board, a: SettingsInput): { board: Board; changes: SettingChange[] } {
  const y = { ...b }
  const changes: SettingChange[] = []
  const add = (name: SettingName, said: string, cut = '') => changes.push({ name, value: settingValue(y, name), said, cut })
  if (Array.isArray(a.test_commands)) {
    const all = a.test_commands.map(x => String(x).trim()).filter(Boolean)
    y.test_commands = all.slice(0, MAX_TEST_COMMANDS)
    add('test_commands', `tests: ${testCommandsText(y.test_commands)}`, all.length > MAX_TEST_COMMANDS ? ` (only the first ${MAX_TEST_COMMANDS} kept: test_commands holds up to ${MAX_TEST_COMMANDS})` : '')
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
  if (isNotify(a.notify)) ((y.notify = a.notify), add('notify', a.notify === 'voice' ? 'merged tasks and questions are said out loud' : a.notify === 'sound' ? 'a chime plays when a task is merged or a question waits' : 'nothing plays when a task is merged or a question waits'))
  if (isScoutFindings(a.scout_findings)) ((y.scout_findings = a.scout_findings), add('scout_findings', a.scout_findings === 'backlog' ? 'tasks from scout findings go to the backlog' : 'tasks from scout findings go where the lead decides (todo unless it says backlog)'))
  if (isTestsWithChanges(a.tests_with_changes)) ((y.tests_with_changes = a.tests_with_changes), add('tests_with_changes', a.tests_with_changes === 'review' ? 'a code change with no test file waits for review' : a.tests_with_changes === 'ask' ? 'a code change with no test file merges and the lead is told' : 'code changes with no test file are not flagged'))
  return { board: y, changes }
}

/** With scout_findings backlog, a task added from a scout finding (origin_by scout) always goes to the backlog. */
export const findingToBacklog = (b: Partial<Pick<Board, 'scout_findings'>>, originBy: unknown): boolean => originBy === 'scout' && scoutFindingsOf(b) === 'backlog'

/** The owner's wording of a change: "max_parallel set to 5", plus the cut note. */
export const settingSetText = (c: SettingChange) => `${c.name} set to ${c.value}${c.cut}`

const unquoteValue = (s: string) => {
  const t = s.trim()
  const q = t[0]
  // strip outer quotes only when they wrap the whole value: that quote mark appears nowhere inside
  return t.length >= 2 && (q === '"' || q === "'") && t[t.length - 1] === q && !t.slice(1, -1).includes(q) ? t.slice(1, -1).trim() : t
}

export const BAD_LIST_MESSAGE = `that looks like a list but isn't valid JSON: use double quotes, like ["npm test", "npm run lint"]`

/**
 * A value meant as a list rather than a shell line: it starts with "[" and either has no space
 * after it (a shell "[" test always does), or has a comma between quoted parts, or is quoted
 * parts inside brackets. "[ -f a ] && npm test" and "[[ -f a ]] && npm test" (a bash test) are not.
 */
const looksLikeList = (v: string) =>
  v.startsWith('[') && !/^\[\[\s/.test(v) && (/^\[\S/.test(v) || /["']\s*,\s*["']/.test(v) || /^\[\s*["'][\s\S]*["']\s*\]$/.test(v))

/** Typed test commands: a JSON list of strings is several commands, else each line is one whole command; null for a broken list. */
function commandList(v: string): string[] | null {
  if (v.startsWith('[')) {
    try {
      const a: unknown = JSON.parse(v)
      if (Array.isArray(a) && a.every(x => typeof x === 'string')) return a.map(x => x.trim()).filter(Boolean)
    } catch {}
    if (looksLikeList(v)) return null
  }
  return v.split(/\r?\n/).map(x => x.trim()).filter(Boolean)
}

/**
 * Reads a typed value for one setting into settings tool input: numbers as whole numbers
 * (outside the limit they are cut later, by applySettings), on/off, a mode,
 * or test commands: a typed line is one command, run as one shell line (so "cd web && npm test"
 * works as in a shell); several are a list in brackets (["npm test", "npm run lint"]) or one per
 * line; "none" or "" for none.
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
    case 'notify': {
      const w = v.toLowerCase()
      return isNotify(w) ? { ok: true, input: { notify: w } } : bad('notify must be off, sound or voice')
    }
    case 'findings': {
      const w = v.toLowerCase()
      return isScoutFindings(w) ? { ok: true, input: { scout_findings: w } } : bad('scout_findings must be auto or backlog')
    }
    case 'untested': {
      const w = v.toLowerCase()
      return isTestsWithChanges(w) ? { ok: true, input: { tests_with_changes: w } } : bad('tests_with_changes must be off, ask or review')
    }
    case 'mode': {
      const w = v.toLowerCase()
      return isMode(w) ? { ok: true, input: { mode: w } } : bad('mode must be off, review or auto')
    }
    case 'commands': {
      const list = v.toLowerCase() === 'none' ? [] : commandList(v)
      return list ? { ok: true, input: { test_commands: list } } : bad(BAD_LIST_MESSAGE)
    }
  }
}

/**
 * /<name>-settings: no words opens the Settings view; "NAME VALUE" sets one setting
 * (e.g. "max_parallel 5", "notify sound", 'test_commands "npm test"').
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

/**
 * The lead's settings tool called with nothing to change: every setting, one per line, with its
 * current value and default in plain words; notify also says which choices this machine can play.
 */
export function leadSettingsText(b: Partial<Board>, can: Pick<Playable, 'sound' | 'voice'>): string {
  return [
    'Settings now (name: value, default, what it does):',
    ...SETTINGS.map(s => {
      const value = s.name === 'notify' ? notifyOf(b, can) : settingValue(b, s.name)
      const extra = s.name === 'notify' ? `; this machine can play: ${notifyChoices(can).join(', ')}` : s.name === 'enabled' ? '; only the owner can change it' : ''
      return `${s.name}: ${value} (default ${s.default}, can be ${s.range}) ${s.meaning}${extra}`
    }),
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
