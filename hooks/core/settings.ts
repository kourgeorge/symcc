// Failing tests, turning things on and off, and the settings.
import type { SymccTask } from '../../types'
import { DEFAULT_NAME } from '../name'
import { type Board, type Notify, notifyKind, soundNotify, soundSetFor, DEFAULT_ARCHIVE_DAYS, DEFAULT_AUTO_RETRIES, DEFAULT_TEST_MINUTES, testMinutesOf, NOTIFY_CHOICES, MODES, SCOUT_FINDINGS_CHOICES, TESTS_WITH_CHANGES_CHOICES, emptyBoard, isMode, isNotify, isScoutFindings, isTestsWithChanges, modeOf, scoutFindingsOf, testsWithChangesOf } from './board-file'
import { ellipsis, num } from './text'
import { MODE_NAME } from './review'
import { MAX_TEST_MINUTES } from './test-timeout'
import { testOutputHeading } from './test-output-heading'
import { type DriverFacts, fitForm, noticeText, otherDrivesForms } from './driver-notice'

/** 'retry' while fewer than `max` tries were used, else 'fail'. */
const retryOrFail = (tries: number | undefined, max: number): 'retry' | 'fail' => ((tries ?? 0) < max ? 'retry' : 'fail')

// ---------------- when the tests fail ----------------

/** How much of the failing test output the next worker is shown (the end of it). */
export const TEST_OUTPUT_CHARS = 3000

/**
 * A task's try failed (its tests or the checker failed, or it clashed with the branch it merges into, T-548).
 * 'retry': send it back to "todo" so a new worker fixes it; 'fail': it already had `max` automatic retries
 * (counted in test_tries), so the lead decides.
 */
export function onTestFail(t: Pick<SymccTask, 'test_tries'>, max = DEFAULT_AUTO_RETRIES): 'retry' | 'fail' {
  return retryOrFail(t.test_tries, max)
}

/** How much room the failed tests get, in front of the end of long test output (see testTail). */
export const FAIL_BLOCK_CHARS = 4000

/** At most this many error lines are kept with each "(fail)" line (the first ones). */
export const FAIL_ERROR_LINES = 12

/** The line in front of the failed tests that testTail keeps from long test output (`n` of them failed). */
export const failedTestsHead = (n: number) => `${n} failed ${n === 1 ? 'test' : 'tests'}, each "(fail)" line with its error (the end of the output comes after):`

const MARK_LINE = /^\((pass|fail|skip|todo)\)\s/
const FILE_LINE = /^\S.*\.test\.[cm]?[jt]sx?:$/
/** The runner's count lines at the end: " 935 pass", " 1 fail", " 3 expect() calls", "Ran 936 tests across 43 files." */
const SUMMARY_LINE = /^\s*(\d+ (pass|fail|skip|todo)|\d+ expect\(\) calls?|Ran \d+ tests?\b)/

/**
 * Every failing test in test output, as one block each: the test file's line (for the first failure in that
 * file), then the "(fail) <name>" line with its error in the order printed: the indented lines right after it
 * (`claude plugin test`), or the lines from "error:" (or a named error such as "TypeError:") down to it (plain `bun test` prints the error above). Each error keeps at most
 * FAIL_ERROR_LINES lines of at most 300 characters. [] when nothing failed.
 */
export function failBlocks(output: string): string[] {
  const lines = String(output ?? '').split('\n').map(l => l.replace(/\s+$/, ''))
  const blocks: string[] = []
  let file = ''
  let fileShown = ''
  let lastMark = -1
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!
    if (FILE_LINE.test(l)) {
      file = l
      lastMark = i
      continue
    }
    if (!MARK_LINE.test(l)) continue
    if (!l.startsWith('(fail)')) {
      lastMark = i
      continue
    }
    const prev = lines.slice(lastMark + 1, i)
    const from = prev.findIndex(a => /^\w*error:/i.test(a.trim()))
    const before = from < 0 ? [] : prev.slice(from)
    const after: string[] = []
    let j = i + 1
    for (; j < lines.length; j++) {
      const a = lines[j]!
      if (MARK_LINE.test(a) || FILE_LINE.test(a) || SUMMARY_LINE.test(a) || (a !== '' && !/^\s/.test(a))) break
      after.push(a)
    }
    while (after.length && after.at(-1)!.trim() === '') after.pop()
    // in the order printed: plain bun's error above the "(fail)" line, `claude plugin test`'s below it
    const tidy = (part: string[]) => part.filter((a, k) => a.trim() !== '' || (k > 0 && part[k - 1]!.trim() !== ''))
    const cut = (a: string) => (a.length > 300 ? a.slice(0, 299) + '…' : a)
    const above = tidy(before)
    const below = tidy(after)
    const up = above.slice(0, FAIL_ERROR_LINES).map(cut)
    const down = below.slice(0, FAIL_ERROR_LINES - up.length).map(cut)
    const left = above.length + below.length - up.length - down.length
    if (left > 0) down.push(`  … (${left} more error lines)`)
    const head = file && file !== fileShown ? [file] : []
    fileShown = file || fileShown
    blocks.push([...head, ...up, l, ...down].join('\n'))
    // past this test's own error lines, so the next "(fail)" never takes them as its error
    lastMark = j - 1
  }
  return blocks
}

/** Past the room for errors, at most this many failing tests keep their short "(fail)" line (with its test file line); the rest are only counted. */
export const FAIL_LINES_SHOWN = 30

/** And those short lines take at most this many characters in all. */
export const FAIL_LINES_CHARS = 3000

/** The line after the short "(fail)" lines, for the `m` failing tests left out. */
export const moreFailingLine = (m: number) => `… and ${m} more failing ${m === 1 ? 'test' : 'tests'}`

/**
 * The test output a task keeps (test_output), so it fits in the next worker's prompt: all of it when it is at
 * most `n` characters; else the failing tests (failBlocks: with their error while FAIL_BLOCK_CHARS last, then
 * only the "(fail)" lines, up to FAIL_LINES_SHOWN of them in FAIL_LINES_CHARS, then "… and M more failing tests"),
 * then the last `n` characters. So it stays under about FAIL_BLOCK_CHARS + FAIL_LINES_CHARS + `n`, however many
 * tests fail. The heading in front says how many failed in all. The "$ command (exit N)" first line stays first.
 */
export function testTail(output: string, n = TEST_OUTPUT_CHARS): string {
  const s = String(output ?? '').trim()
  if (s.length <= n) return s
  const end = '…' + s.slice(-n)
  const blocks = failBlocks(s)
  if (!blocks.length) return end
  const first = s.slice(0, s.indexOf('\n') < 0 ? s.length : s.indexOf('\n'))
  const kept: string[] = []
  let used = 0
  let shortUsed = 0
  let shortShown = 0
  let left = 0
  for (const b of blocks) {
    if (used + b.length <= FAIL_BLOCK_CHARS) {
      used += b.length
      kept.push(b)
      continue
    }
    const short = b.split('\n').filter(l => FILE_LINE.test(l) || l.startsWith('(fail)')).map(l => (l.length > 300 ? l.slice(0, 299) + '…' : l)).join('\n')
    if (shortShown < FAIL_LINES_SHOWN && shortUsed + short.length <= FAIL_LINES_CHARS) {
      shortShown++
      shortUsed += short.length
      kept.push(short)
    } else left++
  }
  if (left) kept.push(moreFailingLine(left))
  return [...(first.startsWith('$ ') ? [first] : []), failedTestsHead(blocks.length), ...kept, end].join('\n')
}

export { testOutputHeading }

/** Should the board panel open by itself when a session starts? Yes unless the board turned it off. */
export const openOnStart = (b: Partial<Pick<Board, 'open_on_start'>>) => b.open_on_start !== false

// ---------------- notify: voice, sound 1 / 2 / 3 or off ----------------

/** The system a session runs on, as far as notify cares. */
export type NotifySystem = 'mac' | 'linux' | 'windows' | 'other'

/** What this machine can play (found once per session, without playing anything). */
export type Playable = { system: NotifySystem; sound: boolean; voice: boolean }

/**
 * The default notify for a machine: voice where it can speak, else the chime of the project's own sound set
 * ("sound 2", picked from the folder name in `root`, see soundSetFor) where it can chime, else off.
 */
export const bestNotify = (can: Pick<Playable, 'sound' | 'voice'>, root = ''): Notify => (can.voice ? 'voice' : can.sound ? soundNotify(soundSetFor(root)) : 'off')

/**
 * The notify setting in use: the board's own choice, or (none saved) the best this machine can
 * play. Without `can` (the machine not known yet) an unsaved choice reads as 'voice'.
 */
export const notifyOf = (b: Partial<Pick<Board, 'notify'>>, can?: Pick<Playable, 'sound' | 'voice'>, root = ''): Notify => (isNotify(b.notify) ? b.notify : can ? bestNotify(can, root) : 'voice')

/**
 * A typed or picked notify choice as a Notify, or null: "Sound 2", "sound  2" and "sound2" all read as "sound 2".
 * The old bare "sound" is not a choice any more (it needs a set number).
 */
export const readNotify = (x: unknown): Notify | null => {
  const w = typeof x === 'string' ? x.trim().toLowerCase().replace(/^sound\s*([123])$/, 'sound $1') : x
  return isNotify(w) ? w : null
}

/** What a bad notify value is told. */
export const NOTIFY_MUST = 'notify must be voice, sound 1, sound 2, sound 3 or off'

/** Does this machine play `n`? off always "plays" (nothing); every sound set needs the sound player. */
export const canPlay = (n: Notify, can: Pick<Playable, 'sound' | 'voice'>) => n === 'off' || !!can[notifyKind(n) === 'voice' ? 'voice' : 'sound']

/** The notify choices this machine can play, in order: voice and the 3 sounds when found, off always. */
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
  return `${n} isn't available here: ${missingText(notifyKind(n) === 'voice' ? 'voice' : 'sound', can.system)}`
}

/** The one-time note when the saved choice can't play on this machine, or '' when it can. */
export function unplayableNote(n: Notify, can: Playable): string {
  if (n === 'off' || canPlay(n, can)) return ''
  return `notify is '${n}' but no ${n === 'voice' ? 'speech program' : 'sound player'} was found here; nothing will play`
}

/** Is the plugin on for this project? Yes unless /<name>-disable disabled it (a board without `enabled`, or no board: on). */
export const symccOn = (b: Partial<Pick<Board, 'enabled'>>) => b.enabled !== false

/** The board with the plugin enabled or disabled; nothing else changes (tasks, mode and scouts are kept). */
export const setEnabled = (b: Board, on: boolean): Board => ({ ...b, enabled: on })

/** What every lead tool answers while the plugin is disabled. */
export const offAnswer = (name: string = DEFAULT_NAME) => `${name} is disabled. The owner can turn it back on with /${name}-enable.`

/** A piece of the "disabled" line; `command` marks the part a view draws in its own color (the /<name>-enable command). */
export type OffPart = { text: string; command?: boolean }

/**
 * The "disabled" line in pieces, so every view says the same and can color the command:
 * "symcc is disabled · /symcc-enable to turn it back on". `withName` false leaves the name out ("disabled · /symcc-enable to turn it back on"),
 * for the line under the prompt, where Claude Code already puts "⚠ symcc: " in front.
 */
export type OffHere = 'off' | 'other' | 'gone' | 'new'

/** T-952: `here` 'other' (another window drives): the notice that names it (core/driver-notice.ts otherDrivesForms), from
 *  `driver` (what lead.json says of it) at `nowMs`, the longest form no wider than `width`. */
export const offStatusParts = (name: string = DEFAULT_NAME, withName = true, here: OffHere | false | undefined = false, driver?: DriverFacts, nowMs: number = Date.now(), width = Infinity): OffPart[] =>
  here === 'new'
    ? [{ text: 'no board here · ' }, { text: `/${name}-init`, command: true }]
    : here === 'gone'
    ? [{ text: `the ${name} window closed · ` }, { text: `/${name}-enable`, command: true }, { text: ' to take over' }]
    : here === 'other'
      ? fitForm(otherDrivesForms(name, driver, nowMs), width)
      : here
        ? [{ text: `${name} is off in this window · ` }, { text: `/${name}-enable`, command: true }]
        : [
        { text: withName ? `${name} is disabled · ` : 'disabled · ' },
        { text: `/${name}-enable`, command: true },
        { text: ' to turn it back on' },
      ]

/** What every lead tool answers in a window turned off with /<name>-disable here (T-793). */
export const offHereAnswer = (name: string = DEFAULT_NAME, here: OffHere = 'off', driver?: DriverFacts, nowMs: number = Date.now()) =>
  here === 'other' ? `${name} is off in this window: ${noticeText(otherDrivesForms(name, driver, nowMs)[0]!)}.`
  : here === 'gone' ? `${name} is off in this window: ${offStatusLine(name, false, 'gone')}.` : `${name} is off in this window. /${name}-enable turns it back on.`

/** What every lead tool answers in a new project, a folder with no board in it or above it, where the owner has not run /<name>-init yet (T-795, T-844). */
export const notSetUpAnswer = (name: string = DEFAULT_NAME) => `no ${name} board in this folder · /${name}-init to create one here`

/** The "disabled" line as plain text (see offStatusParts). */
export const offStatusLine = (name: string = DEFAULT_NAME, withName = true, here: OffHere | false | undefined = false, driver?: DriverFacts, nowMs: number = Date.now(), width = Infinity) => offStatusParts(name, withName, here, driver, nowMs, width).map(p => p.text).join('')

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
  // T-793: a bare mark (no id) is the reminder "needs you" when nobody took over from a closed window
  const bare = needs.includes('') && !needs.some(Boolean) ? 'needs you' : ''
  return [spokenDone(done), spokenNeedsYou(needs), bare].filter(Boolean).join('. ')
}

/** A settings value for auto_retries: a whole number from 0 to 10. */
export const clampRetries = (n: number) => Math.max(0, Math.min(10, Math.round(Number.isFinite(n) ? n : DEFAULT_AUTO_RETRIES)))

// ---------------- settings ----------------
// One list of settings, used by the lead's settings tool, /<name>-settings and the panel's Settings view.

export const SETTING_NAMES = ['test_commands', 'docs_test_commands', 'test_minutes', 'max_parallel', 'max_minutes', 'auto_retries', 'archive_days', 'open_on_start', 'notify', 'scout_findings', 'tests_with_changes', 'checker', 'mode', 'enabled'] as const
export type SettingName = (typeof SETTING_NAMES)[number]
/** commands: test_commands; number: a whole number within min-max; onoff: true/false; mode: paused/review/auto; notify: voice/sound 1/sound 2/sound 3/off; findings: auto/backlog; untested: off/ask/review */
export type SettingKind = 'commands' | 'number' | 'onoff' | 'mode' | 'notify' | 'findings' | 'untested'
export type SettingInfo = { name: SettingName; label: string; kind: SettingKind; min?: number; max?: number; default: string; range: string; meaning: string }

/** Why test_minutes value `v` is refused ('' when it is a whole number of minutes from 1 to MAX_TEST_MINUTES). */
export const testMinutesRefusal = (v: unknown): string =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_TEST_MINUTES ? '' : `test_minutes must be a whole number of minutes from 1 to ${MAX_TEST_MINUTES} (got ${JSON.stringify(v)})`

/** How many test commands a board keeps. */
export const MAX_TEST_COMMANDS = 5

/** Who answers in the chat, in the host's words (HostWords.assistant), for the enabled setting's meaning; set once by useName. */
let assistantWord = 'the assistant'
export function useAssistantWord(word: string) {
  assistantWord = word
}

export const SETTINGS: SettingInfo[] = [
  { name: 'test_commands', label: 'Test commands', kind: 'commands', default: 'none', range: 'one shell line, or a list of up to 5 lines', meaning: 'must all pass before work is merged' },
  { name: 'docs_test_commands', label: 'Docs test commands', kind: 'commands', default: 'none', range: 'one shell line, or a list of up to 5 lines', meaning: 'run instead of test_commands when a prose-only role (code: false) changed only prose, e.g. a docs link check; none: such a change runs no test' },
  { name: 'test_minutes', label: 'Time per test', kind: 'number', min: 1, max: MAX_TEST_MINUTES, default: String(DEFAULT_TEST_MINUTES), range: `1-${MAX_TEST_MINUTES}`, meaning: 'how long each test command may run before merging' },
  { name: 'max_parallel', label: 'Workers at once', kind: 'number', min: 1, max: 8, default: '3', range: '1-8', meaning: 'how many workers run at once' },
  { name: 'max_minutes', label: 'Time per worker', kind: 'number', min: 5, max: 600, default: '45', range: '5-600', meaning: 'a worker running longer makes symcc ask the owner for more time' },
  { name: 'auto_retries', label: 'Retries on failure', kind: 'number', min: 0, max: 10, default: String(DEFAULT_AUTO_RETRIES), range: '0-10', meaning: 'new tries on their own after failing tests' },
  { name: 'archive_days', label: 'Archive after', kind: 'number', min: 0, max: 3650, default: String(DEFAULT_ARCHIVE_DAYS), range: '0-3650 (0 = never)', meaning: 'done and dropped tasks older than this move to archive.json' },
  { name: 'open_on_start', label: 'Open on start', kind: 'onoff', default: 'on', range: 'on / off', meaning: 'open the board panel when a session starts' },
  { name: 'notify', label: 'Alert', kind: 'notify', default: 'voice (else sound N, N picked from the project name, else off)', range: 'voice / sound 1 / sound 2 / sound 3 / off', meaning: 'when a task is merged or a worker asks you something: "symcc: T-3 done" / "symcc: T-5 needs you" out loud, the project name first (voice), or a chime from sound set N, so you can tell which project chimed (on macOS sound 1: Glass and Ping, sound 2: Hero and Pop, sound 3: Submarine and Funk; the second one when a question waits); picking a sound plays its chime' },
  { name: 'scout_findings', label: 'Scout findings', kind: 'findings', default: 'auto', range: 'auto / backlog', meaning: 'the default for scouts without their own findings choice. auto: the lead decides, a scout finding it adds goes to todo and runs; backlog: every task added from a scout finding goes to the backlog and waits for you' },
  { name: 'tests_with_changes', label: 'Code without tests', kind: 'untested', default: 'ask', range: 'off / ask / review', meaning: 'a change task that edits code but no test file: ask: it merges and the lead is told "T-3 changed code but no test"; review: it waits for your review instead; off: nothing (test files are in test/, tests/, __tests__/, spec/, e2e/ or cypress/ folders or have a test name like a.test.ts, a-test.ts, a.cy.ts, login.e2e.ts, FooTest.java; docs-only changes such as .md files, images and non-code files under docs/ are never flagged)' },
  { name: 'checker', label: 'Checker', kind: 'onoff', default: 'off', range: 'off / on', meaning: 'on: after the prep step and before a change joins the merge queue (where its tests run), a fresh checker tries to break it; OK goes on, a list of problems sends it back to its worker (counts as a retry); investigations and docs-only changes skip it' },
  { name: 'mode', label: 'Mode', kind: 'mode', default: 'auto merge', range: 'paused / approve merge / auto merge', meaning: 'paused: nothing runs; approve merge: finished work waits for your approval; auto merge: it merges on its own' },
  { name: 'enabled', label: 'Symcc on', kind: 'onoff', default: 'on', range: 'on / off', get meaning() {
    return `off: the whole plugin rests and ${assistantWord} works as normal`
  } },
]

/** Rows on the Settings page that open a page of their own instead of holding a value. */
export const SETTING_PAGES = ['roles', 'kinds'] as const
export type SettingPage = (typeof SETTING_PAGES)[number]
export type SettingGroup = { title: string; items: readonly (SettingName | SettingPage)[] }

/**
 * The settings in categories, in the order the Settings page, /<name>-settings and the lead's
 * settings tool show them. Every setting is in exactly one category (a test checks it).
 */
export const SETTING_GROUPS: readonly SettingGroup[] = [
  { title: 'Work', items: ['mode', 'max_parallel', 'max_minutes', 'auto_retries', 'enabled'] },
  { title: 'Checks before merging', items: ['test_commands', 'docs_test_commands', 'test_minutes', 'tests_with_changes', 'checker'] },
  { title: 'Workers', items: ['roles', 'kinds'] },
  { title: 'Scouts', items: ['scout_findings'] },
  { title: 'Board and alerts', items: ['notify', 'open_on_start', 'archive_days'] },
]

/** One line for a focused group heading on the Settings page (T-1042). */
export const groupHint = (title: string): string =>
  ({ Work: 'How work runs: the mode, how many workers, how long and how often they retry.', 'Checks before merging': 'The tests and checks a change passes before it is merged.', Workers: 'The worker roles and the task types.', Scouts: 'What scouts do with what they find.', 'Board and alerts': 'The board panel and how symcc tells you things.' })[title] ?? ''

export const isSettingPage = (x: string): x is SettingPage => (SETTING_PAGES as readonly string[]).includes(x)

/** A category's settings (not the page rows), in its order. */
export const groupSettings = (g: SettingGroup): SettingInfo[] => g.items.flatMap(x => (isSettingPage(x) ? [] : [settingInfo(x)!]))

/** The value as a settings row shows it (T-1042): units where they help ("45 min"), the mode as the owner reads it. */
export function settingRowValue(name: string, value: string): string {
  if (name === 'max_minutes' || name === 'test_minutes') return `${value} min`
  if (name === 'archive_days') return value === '0' ? 'never' : `${value} day${value === '1' ? '' : 's'}`
  if (name === 'mode') return settingShown(name, value)
  return value
}

/** The help line under the Settings list for a focused setting: its meaning, then the name to use in /<name>-settings and the default and range. */
export const settingHelp = (name: string): { meaning: string; facts: string } => {
  const s = settingInfo(name)
  return s ? { meaning: s.meaning, facts: `${s.name} · default ${s.default} · ${s.range}` } : { meaning: '', facts: '' }
}

export const settingInfo = (name: string): SettingInfo | undefined => SETTINGS.find(s => s.name === name)

/** T-800: a setting's value as the owner reads it: the mode "review" / "auto" shows as "approve merge" / "auto merge"; the stored value is unchanged. */
export const settingShown = (name: string, value: string): string => (name === 'mode' && isMode(value) ? MODE_NAME[value] : value)

/** The values setting `name` is picked from: mode, scout_findings, tests_with_changes, and notify (only what this
 *  machine can play, `notifyChoices`; off always). [] for a setting that flips as on/off or is typed in a box. */
export function settingChoices(name: string, notifyChoices?: readonly string[]): string[] {
  const kind = settingInfo(name)?.kind
  if (kind === 'mode') return [...MODES]
  if (kind === 'findings') return [...SCOUT_FINDINGS_CHOICES]
  if (kind === 'untested') return [...TESTS_WITH_CHANGES_CHOICES]
  if (kind === 'notify') return notifyChoices?.length ? [...notifyChoices] : ['off']
  return []
}

/** True when notify is set to something this machine can't play (nothing plays then). */
export const cantPlayNotify = (v: { notify_now?: string; notify_choices?: readonly string[] }): boolean =>
  !!v.notify_choices && !!v.notify_now && !v.notify_choices.includes(v.notify_now)

/**
 * T-808: the published view as the board-shaped object the settings helpers read: the view's `on_here` is the value of
 * the "enabled" setting there (the board is on and this window is not turned off) and its `notify_now` the notify one.
 */
export const viewAsBoard = <V extends { on_here?: boolean; notify_now?: string }>(v: V): Omit<V, 'enabled' | 'notify'> & Partial<Pick<Board, 'enabled' | 'notify'>> =>
  ({ ...v, ...(v.on_here !== undefined ? { enabled: v.on_here } : {}), ...(v.notify_now !== undefined ? { notify: v.notify_now as Board['notify'] } : {}) }) as never

/** One setting's value in a few words, for a closed group's summary line ("3 at once", "45 min"); '' leaves it out. */
function shortValue(b: Partial<Board>, name: SettingName): string {
  const v = settingValue(b, name)
  switch (name) {
    case 'max_parallel':
      return `${v} at once`
    case 'max_minutes':
      return `${v} min`
    case 'test_minutes':
      return `tests ${v} min`
    case 'auto_retries':
      return `${v} ${v === '1' ? 'retry' : 'retries'}`
    case 'enabled':
      return v === 'on' ? '' : 'disabled'
    case 'test_commands': {
      const cmds = b.test_commands ?? []
      return !cmds.length ? 'no tests' : cmds.length === 1 ? ellipsis(cmds[0]!, 24) : `${cmds.length} test commands`
    }
    case 'docs_test_commands': {
      const cmds = b.docs_test_commands ?? []
      return !cmds.length ? '' : cmds.length === 1 ? `docs: ${ellipsis(cmds[0]!, 24)}` : `${cmds.length} docs commands`
    }
    case 'tests_with_changes':
      return `untested: ${v}`
    case 'checker':
      return `checker ${v}`
    case 'scout_findings':
      return `findings: ${v}`
    case 'notify':
      return `notify ${v}`
    case 'open_on_start':
      return `open on start ${v}`
    case 'archive_days':
      return v === '0' ? 'never archive' : `archive after ${v} day${v === '1' ? '' : 's'}`
    case 'mode':
      return settingShown('mode', v)
    default:
      return v
  }
}

/**
 * A closed group's line on the Settings page in two parts: its whole title (never cut) and its values in
 * short after it, cut so both fit in `width` (" · auto · 3 at once · 45 min · 2 retries"); the panel draws
 * the title bold and the values dim. `pages` gives the text of its page rows (roles, kinds), which are not on the board.
 */
export function groupSummaryParts(g: SettingGroup, b: Partial<Board>, width: number, pages: Partial<Record<SettingPage, string>> = {}): { title: string; values: string } {
  const parts = g.items.map(x => (isSettingPage(x) ? (pages[x] ?? '') : shortValue(b, x))).filter(Boolean)
  const room = width - g.title.length
  // too little room for even a word of the values: leave them out rather than show only " ·…"
  const values = !parts.length || room < 5 ? '' : ellipsis(` · ${parts.join(' · ')}`, room)
  return { title: g.title, values }
}

/** A closed group's line as one text: its title and its values in short ("Work · auto · 3 at once · 45 min"); see groupSummaryParts. */
export function groupSummary(g: SettingGroup, b: Partial<Board>, width: number, pages: Partial<Record<SettingPage, string>> = {}): string {
  const p = groupSummaryParts(g, b, width, pages)
  return p.title + p.values
}

/**
 * Test commands as text: one command as it is ("cd web && npm test" is one shell line),
 * several as a list in brackets (["npm test", "npm run lint"]), none as "none".
 * parseSettingValue reads the same text back.
 */
export const testCommandsText = (cmds: readonly string[]): string => (!cmds.length ? 'none' : cmds.length === 1 && !cmds[0]!.trim().startsWith('[') ? cmds[0]! : JSON.stringify(cmds))

/** The longest the short tests text in a header may be (T-607); longer, it says how many commands there are. */
export const TESTS_SHORT_MAX = 24

/** Words that only run another program ("sh scripts/typecheck.sh", "npx tsc"): the short name is the next word. */
const RUNNERS = new Set(['sh', 'bash', 'zsh', 'npx', 'bunx', 'pnpx', 'node', 'deno', 'python', 'python3', 'env', 'exec'])

/**
 * A test command's short name: its program, without "VAR=value" in front, "cd dir &&", or a runner like sh or npx;
 * a script path gives its file name without the ending. "sh scripts/typecheck.sh" → "typecheck",
 * "claude plugin test ." → "claude", "npx tsc --noEmit" → "tsc".
 */
export function testName(cmd: string): string {
  let words = cmd.trim().split(/\s+/)
  if (words[0] === 'cd' && words.includes('&&')) words = words.slice(words.indexOf('&&') + 1)
  words = words.filter((w, i) => !(/^[A-Za-z_]\w*=/.test(w) && words.slice(0, i).every(x => /^[A-Za-z_]\w*=/.test(x))))
  const first = words[0] ?? ''
  const name = (w: string) => w.replace(/\/+$/, '').split('/').pop()!.replace(/\.[A-Za-z]+$/, '')
  const next = words[1]
  if (RUNNERS.has(first) && next && /^[\w@.\/:-]+$/.test(next) && !next.startsWith('-')) return name(next) || first
  return name(first) || first
}

/**
 * The test commands for a header line, short (T-607): "none set"; one short command whole ("npm test");
 * else their short names ("claude, typecheck") when they fit in TESTS_SHORT_MAX; else "5 commands".
 * Never the JSON list: the Settings page and the settings tool show that (testCommandsText).
 */
export function testsShort(cmds: readonly string[]): string {
  const list = cmds.map(c => c.trim()).filter(Boolean)
  if (!list.length) return 'none set'
  if (list.length === 1 && list[0]!.length <= TESTS_SHORT_MAX && !/[\["']/.test(list[0]!)) return list[0]!
  const parts = list.map(testName)
  const names = parts.join(', ')
  if (parts.every(Boolean) && names.length <= TESTS_SHORT_MAX && !/[\["']/.test(names)) return names
  return `${list.length} ${list.length === 1 ? 'command' : 'commands'}`
}

/** A setting's current value as text: "npm test", '["npm test", "npm run lint"]', "on", "5", "none". */
export function settingValue(b: Partial<Board>, name: SettingName, root = ''): string {
  const d = emptyBoard()
  switch (name) {
    case 'test_commands':
      return testCommandsText(b.test_commands ?? [])
    case 'docs_test_commands':
      return testCommandsText(b.docs_test_commands ?? [])
    case 'open_on_start':
      return openOnStart(b) ? 'on' : 'off'
    case 'notify':
      return notifyOf(b, undefined, root)
    case 'enabled':
      return symccOn(b) ? 'on' : 'off'
    case 'mode':
      return modeOf(b)
    case 'scout_findings':
      return scoutFindingsOf(b)
    case 'tests_with_changes':
      return testsWithChangesOf(b)
    case 'checker':
      return b.checker === true ? 'on' : 'off'
    case 'test_minutes':
      return String(testMinutesOf(b))
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
 * max_parallel 1-8, max_minutes 5-600, auto_retries 0-10, test_minutes 1-120, up to 5 test commands. A value
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
  if (Array.isArray(a.docs_test_commands)) {
    const all = a.docs_test_commands.map(x => String(x).trim()).filter(Boolean)
    y.docs_test_commands = all.slice(0, MAX_TEST_COMMANDS)
    add('docs_test_commands', `docs checks for prose-only changes: ${testCommandsText(y.docs_test_commands)}`, all.length > MAX_TEST_COMMANDS ? ` (only the first ${MAX_TEST_COMMANDS} kept: docs_test_commands holds up to ${MAX_TEST_COMMANDS})` : '')
  }
  for (const name of ['max_parallel', 'max_minutes', 'auto_retries', 'archive_days', 'test_minutes'] as const) {
    const n = a[name]
    if (typeof n !== 'number' || !Number.isFinite(n)) continue
    const s = settingInfo(name)!
    const v = Math.max(s.min!, Math.min(s.max!, Math.round(n)))
    y[name] = v
    const cut = v !== Math.round(n) ? ` (cut from ${n} to the limit: ${name} must be ${s.range})` : ''
    const said =
      name === 'max_parallel' ? `up to ${v} at once`
      : name === 'max_minutes' ? `a worker may run ${v} min`
      : name === 'test_minutes' ? `each test command may run ${v} min before merging`
      : name === 'archive_days' ? (v ? `done and dropped tasks older than ${v} ${v === 1 ? 'day' : 'days'} are archived` : 'old tasks are never archived')
      : `${v} automatic ${v === 1 ? 'retry' : 'retries'} after failing tests`
    add(name, said, cut)
  }
  if (typeof a.open_on_start === 'boolean') ((y.open_on_start = a.open_on_start), add('open_on_start', a.open_on_start ? 'the board opens when a session starts' : 'the board no longer opens when a session starts'))
  const n = readNotify(a.notify)
  if (n) ((y.notify = n), add('notify', n === 'voice' ? 'merged tasks and questions are said out loud' : n === 'off' ? 'nothing plays when a task is merged or a question waits' : `a chime from sound set ${n.slice(6)} plays when a task is merged or a question waits`))
  if (isScoutFindings(a.scout_findings)) ((y.scout_findings = a.scout_findings), add('scout_findings', a.scout_findings === 'backlog' ? 'tasks from scout findings go to the backlog' : 'tasks from scout findings go where the lead decides (todo unless it says backlog)'))
  if (isTestsWithChanges(a.tests_with_changes)) ((y.tests_with_changes = a.tests_with_changes), add('tests_with_changes', a.tests_with_changes === 'review' ? 'a code change with no test file waits for review' : a.tests_with_changes === 'ask' ? 'a code change with no test file merges and the lead is told' : 'code changes with no test file are not flagged'))
  const checker = typeof a.checker === 'boolean' ? a.checker : a.checker === 'on' ? true : a.checker === 'off' ? false : undefined
  if (checker !== undefined) ((y.checker = checker), add('checker', checker ? 'a checker tries to break each change before it merges' : 'changes merge without a checker'))
  return { board: y, changes }
}

/** With findings backlog, a task added from a scout finding (origin_by scout) always goes to the backlog. The scout's own choice (`own`) decides; without one, the board's scout_findings. */
export const findingToBacklog = (b: Partial<Pick<Board, 'scout_findings'>>, originBy: unknown, own?: 'auto' | 'backlog'): boolean => originBy === 'scout' && (own ?? scoutFindingsOf(b)) === 'backlog'

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
      const n = readNotify(v)
      return n ? { ok: true, input: { notify: n } } : bad(NOTIFY_MUST)
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
      const stored = w === MODE_NAME.review ? 'review' : w === MODE_NAME.auto ? 'auto' : w
      return isMode(stored) ? { ok: true, input: { mode: stored } } : bad('mode must be paused, review or auto')
    }
    case 'commands': {
      const list = v.toLowerCase() === 'none' ? [] : commandList(v)
      return list ? { ok: true, input: { [name]: list } } : bad(BAD_LIST_MESSAGE)
    }
  }
}

/**
 * /<name>-settings: no words opens the Settings view; "NAME VALUE" sets one setting
 * (e.g. "max_parallel 5", "notify sound 2", 'test_commands "npm test"').
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
export function settingsText(b: Partial<Board>, name: string = DEFAULT_NAME, root = ''): string {
  const w = Math.max(...SETTING_NAMES.map(n => n.length))
  return [
    ...SETTING_GROUPS.flatMap(g => {
      const rows = groupSettings(g)
      const pages = g.items.some(isSettingPage) ? ['  roles and task types: open them from the Settings view, or tell the lead', `  org-mem (organizational memory): its notes are in .${name}/org-mem.md; the Organizational memory section at the bottom of the board's Live tab shows the newest notes and topics and opens the page that lists and deletes them (/${name}-settings orgmem delete N)`] : []
      return [`${g.title}:`, ...rows.map(s => `  ${s.name.padEnd(w)}  ${settingShown(s.name, settingValue(b, s.name, root))}  (default ${s.default} · ${s.range}) ${s.meaning}`), ...pages]
    }),
    `Change one: /${name}-settings NAME VALUE, e.g. /${name}-settings max_parallel 5`,
  ].join('\n')
}

/**
 * The lead's settings tool called with nothing to change: every setting, one per line, with its
 * current value and default in plain words; notify also says which choices this machine can play.
 */
export function leadSettingsText(b: Partial<Board>, can: Pick<Playable, 'sound' | 'voice'>, root = ''): string {
  return [
    'Settings now, by category (name: value, default, what it does):',
    ...SETTING_GROUPS.flatMap(g => [
      `## ${g.title}`,
      ...groupSettings(g).map(s => {
        const value = s.name === 'notify' ? notifyOf(b, can, root) : settingValue(b, s.name, root)
        const extra = s.name === 'notify' ? `; this machine can play: ${notifyChoices(can).join(', ')}` : s.name === 'enabled' ? '; only the owner can change it' : ''
        const stored = s.name === 'mode' ? { default: 'auto', range: 'paused / review / auto', meaning: s.meaning + ' (the owner reads review as "approve merge" and auto as "auto merge")' } : s
        return `${s.name}: ${value} (default ${stored.default}, can be ${stored.range}) ${stored.meaning}${extra}`
      }),
      ...(g.items.some(isSettingPage) ? ['roles and task types: use the roles and kinds tools (the owner sees roles and task types as pages in the Settings view)', 'org-mem (organizational memory): change it with the orgmem tool (the owner sees its notes on the Organizational memory page, opened from the Organizational memory section (newest notes and topics) at the bottom of the board\'s Live tab, and may delete them there)'] : []),
    ]),
  ].join('\n')
}

/** For showing the board: newest task first (by when it was made, then by its number). */
export function newestFirst(x: SymccTask, y: SymccTask): number {
  return (y.created_at || '').localeCompare(x.created_at || '') || num(y.id) - num(x.id)
}
