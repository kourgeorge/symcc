// Scout files, and scouts in the board panel.
import type { SymccMode, SymccScout, SymccTask, SymccTokens } from '../../types'
import { DEFAULT_NAME, namesFor } from '../name'
import { originOf } from './origin'
import { fmtDuration } from './runs'
import { offAnswer } from './settings'
import { planScoutText } from './plan'
import { frontMatterLine, splitFrontMatter } from './text'

/**
 * The symcc tools a scout (and a checker, which runs as the scout type) may call, in symcc's own words: both only read
 * the board. Every other symcc tool changes something and is refused for them (see scoutToolRefusal).
 */
export const SCOUT_BOARD_TOOLS: readonly string[] = ['board', 'stats']

/** Why a scout's or checker's call of symcc tool `tool` is refused, or null when it may run (board and stats). */
export function scoutToolRefusal(tool: string, name: string = DEFAULT_NAME): string | null {
  return SCOUT_BOARD_TOOLS.includes(tool) ? null : `Refused: ${name} scouts can only read the board (board and stats); "${tool}" is only for the lead. Put what you would change in your report instead.`
}

/** A scout file: `.<plugin name>/scouts/<name>.md`, front matter + instructions. */
/** `every_minutes` 0 means "only on demand" (never on the timer). A bad value in the file also gives 0, with
 *  `warning` saying so and `bad_every` holding the value as written. */
/** `summary` is the optional one-line subheader shown on the scout's page (front matter `summary:`). */
export type ScoutDef = { name: string; every_minutes: number; model?: string; summary?: string; prompt: string; warning?: string; bad_every?: string }

/** The warning for a scout file whose every_minutes can't be used. */
export const badEveryWarning = (value: string): string => `every_minutes "${value}" is not valid: runs only on demand until fixed`

/** True when a scout runs only on demand ("run now" or /<name>-scout), never on its timer. */
export const onDemand = (s: { every_minutes: number }): boolean => !(Number.isFinite(s.every_minutes) && s.every_minutes >= 1)

export function parseScout(name: string, text: string): ScoutDef | null {
  const fm = splitFrontMatter(text)
  const meta: Record<string, string> = {}
  for (const line of fm.lines ?? []) {
    const kv = frontMatterLine(line)
    if (kv) meta[kv.key] = kv.value.replace(/^["']|["']$/g, '')
  }
  const prompt = fm.body.trim()
  if (!prompt) return null
  const raw = (meta.every_minutes ?? '').trim()
  const base: Pick<ScoutDef, 'name' | 'model' | 'summary' | 'prompt'> = { name: meta.name || name, model: meta.model || undefined, prompt }
  if (meta.summary?.trim()) base.summary = meta.summary.trim()
  // missing: every hour; a whole number (0 = only on demand); anything else: only on demand, with a warning
  if (!raw) return { ...base, every_minutes: 60 }
  const every = everyMinutesOf(raw)
  if (every !== null) return { ...base, every_minutes: every }
  return { ...base, every_minutes: 0, warning: badEveryWarning(raw), bad_every: raw }
}

/**
 * A scout file's text from its front matter and body, as the panel's edit mode saves it.
 * `old` is the file as it was (or null for a new scout): every front matter line it has is kept
 * as it was, except every_minutes, model and summary (dropped when empty). A `summary` left out of `set`
 * (undefined) keeps the file's summary line as it was.
 */
export function scoutText(old: string | null, set: { every_minutes: number; model?: string; summary?: string }, body: string): string {
  const lines: string[] = []
  let everyDone = false
  let modelDone = false
  let summaryDone = set.summary === undefined
  const model = (set.model ?? '').trim()
  const summary = (set.summary ?? '').replace(/\s+/g, ' ').trim()
  for (const line of (old ? splitFrontMatter(old).lines : null) ?? []) {
    const key = frontMatterLine(line)?.key
    if (key === 'every_minutes') {
      if (!everyDone) lines.push(`every_minutes: ${set.every_minutes}`)
      everyDone = true
    } else if (key === 'model') {
      if (!modelDone && model) lines.push(`model: ${model}`)
      modelDone = true
    } else if (key === 'summary' && set.summary !== undefined) {
      if (!summaryDone && summary) lines.push(`summary: ${summary}`)
      summaryDone = true
    } else lines.push(line)
  }
  if (!everyDone) lines.push(`every_minutes: ${set.every_minutes}`)
  if (!modelDone && model) lines.push(`model: ${model}`)
  if (!summaryDone && summary) lines.push(`summary: ${summary}`)
  return `---\n${lines.join('\n')}\n---\n\n${body.trim()}\n`
}

/** Why a new scout's name can't be used ('' when it can): letters, digits, - and _ only, and not one that exists. */
export function scoutNameError(name: string, existing: string[]): string {
  const s = name.trim()
  if (!s) return 'give the scout a name'
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(s)) return 'use only letters, digits, - and _'
  if (existing.some(x => x.toLowerCase() === s.toLowerCase())) return `a scout named ${s} already exists`
  return ''
}

/** every_minutes as typed: a whole number, 0 (only on demand) or more, or null. */
export function everyMinutesOf(text: string): number | null {
  const s = text.trim()
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  return Number.isSafeInteger(n) ? n : null
}

/** Why a scout's edit can't be saved ('' when it can). */
export function scoutDraftError(d: { every: string; body: string }): string {
  if (everyMinutesOf(d.every) === null) return 'Runs every must be a whole number of minutes: 0 for only on demand, or 1 or more'
  if (!d.body.trim()) return 'write what the scout looks for'
  return ''
}

// ---------------- the lead's scouts tool ----------------

/** Why the lead's scouts tool can't add a scout with this name ('' when it can): lowercase letters, digits and
 *  dashes. Only for add: list, run, edit and remove take any scout that is there (see safeScoutFile). */
export function leadScoutNameError(name: string): string {
  const s = name.trim()
  if (!s) return 'give the scout a name'
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) || s.length > 64) return `"${s}" is not a valid scout name: use only lowercase letters, digits and dashes (like docs-check)`
  return ''
}

/** How many lines of a scout's last report the lead's scouts list shows. */
export const SCOUT_LIST_REPORT_LINES = 3

/** When: "in 38m", "now", or "8m ago". */
const fromNow = (iso: string | null | undefined, nowMs: number): string => {
  const at = Date.parse(iso ?? '')
  if (!Number.isFinite(at)) return ''
  if (at > nowMs) return `in ${fmtDuration(at - nowMs)}`
  return nowMs - at < 1000 ? 'now' : `${fmtDuration(nowMs - at)} ago`
}

/** A scout for the lead's scouts tool: name, how often, paused, running, next run, last run, and its last report
 *  (the first SCOUT_LIST_REPORT_LINES lines, or all of it with `full`, which also shows its model and prompt).
 *  With `full`, `runs` (newest first, each with the tasks made from it) adds its recent runs, one line each. */
export function leadScoutText(s: SymccScout, nowMs: number, full = false, runs: { run: ScoutRunRecord; tasks: string[] }[] = []): string {
  const parts = [everyText(s.every_minutes), s.paused ? 'paused' : 'not paused', s.running ? 'running now' : 'not running']
  const next = onDemand(s) ? 'only when run' : s.paused ? 'none while paused' : fromNow(s.next_run, nowMs) || 'not planned'
  parts.push(`next run: ${next}`, `last run: ${fromNow(s.last_run, nowMs) || 'never'}`)
  if (s.model) parts.push(`model: ${s.model}`)
  const lines = [`${s.name}: ${parts.join(' · ')}`]
  if (s.warning) lines.push(`  warning: ${s.warning}`)
  const report = String(s.last_report ?? '').trim()
  if (full) {
    lines.push('prompt:', s.prompt?.trim() || '(none)', 'last report:', report || '(none yet)')
    lines.push('recent runs (newest first: when · outcome · findings · tasks made · report file):')
    if (!runs.length) lines.push('  (none yet)')
    for (const r of runs.slice(0, SCOUT_LEAD_RUNS)) lines.push(`  ${scoutRunLine(r.run, r.tasks, nowMs)}${r.run.why ? ` (${r.run.why})` : ''}${r.run.report ? ` · ${r.run.report}` : ''}`)
    return lines.join('\n')
  }
  if (report) {
    const all = report.split('\n').filter(l => l.trim())
    for (const l of all.slice(0, SCOUT_LIST_REPORT_LINES)) lines.push(`  | ${l}`)
    if (all.length > SCOUT_LIST_REPORT_LINES) lines.push('  | …')
  }
  return lines.join('\n')
}

/** The lead's scouts list: every scout (see leadScoutText), by name. */
export function leadScoutsText(scouts: SymccScout[], nowMs: number, scoutsDir: string): string {
  if (!scouts.length) return `no scouts yet (add one with action "add"; they live in ${scoutsDir}/)`
  return [...scouts].sort((a, b) => a.name.localeCompare(b.name)).map(s => leadScoutText(s, nowMs)).join('\n')
}

// ---------------- scouts in the board panel ----------------

/** How much of a scout's last answer is kept (SymccScout.last_report). */
export const SCOUT_REPORT_CHARS = 2000

/** What is kept about one scout between restarts (in <dir>/scouts.json): only that the owner paused it. Its last run and report are read from its runs file (T-808). */
export type ScoutMemory = { paused?: boolean }

/**
 * Reads scouts.json. A missing, empty or broken file means "no scout is paused" ({}), never an error;
 * entries with a bad shape are skipped one by one.
 */
export function parseScoutMemory(text: string | null | undefined): Record<string, ScoutMemory> {
  const out: Record<string, ScoutMemory> = {}
  if (!text || !text.trim()) return out
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return out
  }
  const scouts = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { scouts?: unknown }).scouts : undefined
  if (!scouts || typeof scouts !== 'object' || Array.isArray(scouts)) return out
  for (const [name, v] of Object.entries(scouts as Record<string, unknown>)) {
    if (!name || !v || typeof v !== 'object' || Array.isArray(v)) continue
    if ((v as { paused?: unknown }).paused === true) out[name] = { paused: true }
  }
  return out
}

/** The text of scouts.json for these scouts; only the names in `keep` (if given) are written. */
export function scoutMemoryText(scouts: Iterable<{ name: string; paused?: boolean }>, keep?: string[]): string {
  const out: Record<string, ScoutMemory> = {}
  for (const s of scouts) {
    if (keep && !keep.includes(s.name)) continue
    if (s.paused) out[s.name] = { paused: true }
  }
  return JSON.stringify({ scouts: out }, null, 2) + '\n'
}

/** The text of scouts.json once scout `name` is paused (or resumed), everything else in `saved` kept as it is. */
export function scoutPausedText(saved: Record<string, ScoutMemory>, name: string, paused: boolean): string {
  const all = { ...saved, [name]: { paused } }
  return scoutMemoryText(Object.entries(all).map(([n, m]) => ({ name: n, ...m })))
}

/** A scout's last real run read from its runs (oldest first): when it started (else ended) and the file of its report; null when none reported. */
export function lastRunOf(runs: readonly ScoutRunRecord[]): { last_run: string; report?: string } | null {
  const r = [...runs].reverse().find(x => x.outcome === 'found' || x.outcome === 'nothing')
  return r ? { last_run: r.started ?? r.ended, ...(r.report ? { report: r.report } : {}) } : null
}

/** How often a scout runs: "every 30 min", "every hour", "every 2 hours", "every 90 min", or "on demand" for 0. */
export function everyText(minutes: number): string {
  if (onDemand({ every_minutes: minutes })) return 'on demand'
  const m = Math.max(1, Math.round(minutes))
  if (m === 1440) return 'every day'
  if (m % 1440 === 0) return `every ${m / 1440} days`
  if (m === 60) return 'every hour'
  if (m % 60 === 0) return `every ${m / 60} hours`
  return `every ${m} min`
}

/** What a scout is doing: "running now…", "paused" (its timer is stopped; run now still runs it), "next in 12m", "due now", or '' when no run is planned (as
 *  for a scout that runs only on demand). A scout paused while it runs finishes that run, so it still says
 *  "running now…". */
export function scoutStateText(s: Pick<SymccScout, 'running' | 'next_run' | 'paused'> & { every_minutes?: number }, nowMs: number): string {
  if (s.running) return 'running now…'
  if (s.paused) return 'paused'
  if (s.every_minutes !== undefined && onDemand({ every_minutes: s.every_minutes })) return ''
  const at = Date.parse(s.next_run ?? '')
  if (!Number.isFinite(at)) return ''
  return at <= nowMs ? 'due now' : `next in ${fmtDuration(at - nowMs)}`
}

/** When a scout last ran: "ran 8m ago", or "never ran". */
export function scoutRanText(s: Pick<SymccScout, 'last_run'>, nowMs: number): string {
  const at = Date.parse(s.last_run ?? '')
  return Number.isFinite(at) ? `ran ${fmtDuration(Math.max(0, nowMs - at))} ago` : 'never ran'
}

/** The pieces of a scout's row in the panel; `model` and `state` are '' when there is none. */
export function scoutRow(s: SymccScout, nowMs: number): { name: string; every: string; model: string; state: string; ran: string } {
  return { name: s.name, every: everyText(s.every_minutes), model: s.model ?? '', state: scoutStateText(s, nowMs), ran: scoutRanText(s, nowMs) }
}

/** The order of scouts in the panel: running ones first, then the soonest next run (none planned last), paused
 *  ones after those, then by name. */
export function scoutOrder(a: Pick<SymccScout, 'name' | 'running' | 'next_run' | 'paused'>, b: Pick<SymccScout, 'name' | 'running' | 'next_run' | 'paused'>): number {
  if (a.running !== b.running) return a.running ? -1 : 1
  if (!!a.paused !== !!b.paused) return a.paused ? 1 : -1
  const at = (s: { next_run?: string }) => {
    const t = Date.parse(s.next_run ?? '')
    return Number.isFinite(t) ? t : Infinity
  }
  const d = at(a) - at(b)
  if (d) return d
  return a.name.localeCompare(b.name)
}

/** True when scout `s` may start a run now: not running already, in the session that drives the board, with a
 *  usable git repo, the board on and not paused. A pause doesn't matter here: it only stops the timer (the
 *  timer checks it itself), so "run now" still runs a paused scout. */
export function scoutMayRun(s: Pick<SymccScout, 'running' | 'paused'>, o: { driving: boolean; gitOk: boolean; mode: SymccMode; on: boolean }): boolean {
  return scoutWhyNot({ name: '', ...s }, o) === ''
}

/** Why scout `s` can't start a run now ('' when it can): one clear message for each thing scoutMayRun checks. */
export function scoutWhyNot(s: Pick<SymccScout, 'name' | 'running' | 'paused'>, o: { driving: boolean; gitOk: boolean; mode: SymccMode; on: boolean; plan?: boolean }, name: string = DEFAULT_NAME): string {
  if (s.running) return `${s.name} is already running`
  if (!o.driving) return `scouts run in the session that drives the board; run /${name}-scout ${s.name} there`
  if (!o.gitOk) return "git isn't set up in this folder yet (no repo or no commit); nothing runs until it is"
  if (!o.on) return offAnswer(name)
  if (o.mode === 'paused') return `the board is paused, so no scout runs; start work again with /${name}-mode review or /${name}-mode auto`
  if (o.plan) return planScoutText(s.name)
  return ''
}

/** How long to wait before trying a scout again whose type wasn't ready yet (see scoutNotReady in claude/agents.ts). */
export const SCOUT_RETRY_MS = 5_000

/** A scout's state icon (one column wide): ◉ running, ○ paused, ◎ waiting for its next run or for "run now" (a
 *  scout that runs only on demand). */
export const scoutIcon = (s: Pick<SymccScout, 'running' | 'paused'>): string => (s.running ? '◉' : s.paused ? '○' : '◎')

/** The theme color of a scout's icon and state: running blue (ide), paused inactive (readable, less bright), waiting plain text. */
export const scoutTone = (s: Pick<SymccScout, 'running' | 'paused'>): string => (s.running ? 'ide' : s.paused ? 'inactive' : 'text')

/** How many findings a report numbers ("1. …", "**2. …**", "## 3) …" at the start of a line, each number counted
 *  once); 0 when it numbers none. */
export function countFindings(report: string | undefined): number {
  const seen = new Set<string>()
  for (const line of String(report ?? '').split('\n')) {
    const m = /^(?:#{1,6}\s*)?(?:\*\*|__)?(?:finding\s*)?(\d{1,2})[.):]\s/i.exec(line)
    if (m) seen.add(m[1]!)
  }
  return seen.size
}

/** The "last:" column of a scout row: "found 2" (or "found something" when the report numbers nothing) in the
 *  warning color, "nothing" (inactive) for a NOTHING report, "never ran" when it has no last run. */
export function scoutLastText(s: Pick<SymccScout, 'last_run' | 'last_report'>): { text: string; tone: string } {
  if (!s.last_run && s.last_report === undefined) return { text: 'never ran', tone: 'inactive' }
  if (isNothing(s.last_report)) return { text: 'last: nothing', tone: 'inactive' }
  const n = countFindings(s.last_report)
  return { text: n ? `last: found ${n}` : 'last: found something', tone: 'warning' }
}

/** One row of the Scouts list, its cells already padded so the columns line up. `stateTone` is the state's color
 *  (the warning color for a scout whose every_minutes is not valid). */
export type ScoutListRow = { icon: string; tone: string; name: string; every: string; state: string; stateTone: string; last: string; lastTone: string; model: string }

/** The short state shown in the Scouts list for a scout whose every_minutes is not valid. */
export const BAD_EVERY_STATE = 'bad every_minutes'

/** The cells of the Scouts list at `width` columns (`indent` columns before each row): icon, name, how often, state,
 *  "last:" and model, two spaces between columns. When a row would not fit, the model column goes first, then
 *  "last:", then the state, then how often; the name is never cut. A running scout shows no "last:" (it is
 *  making a new one). */
export function scoutListRows(scouts: SymccScout[], nowMs: number, width: number, indent = 2): ScoutListRow[] {
  const raw = scouts.map(s => ({
    s,
    every: everyText(s.every_minutes),
    state: s.warning && !s.running && !s.paused ? BAD_EVERY_STATE : scoutStateText(s, nowMs),
    last: s.running ? { text: '', tone: 'inactive' } : scoutLastText(s),
    model: s.model ?? '',
  }))
  const w = (f: (r: (typeof raw)[number]) => string) => Math.max(0, ...raw.map(r => f(r).length))
  const cols = { name: w(r => r.s.name), every: w(r => r.every), state: w(r => r.state), last: w(r => r.last.text), model: w(r => r.model) }
  const shown = { every: cols.every > 0, state: cols.state > 0, last: cols.last > 0, model: cols.model > 0 }
  const total = () => indent + 2 + cols.name + (['every', 'state', 'last', 'model'] as const).reduce((n, k) => n + (shown[k] ? 2 + cols[k] : 0), 0)
  for (const k of ['model', 'last', 'state', 'every'] as const) if (total() > width) shown[k] = false
  // the last shown column is not padded, so a row has no spaces at its end
  const lastCol = (['model', 'last', 'state', 'every'] as const).find(k => shown[k])
  const cell = (k: 'every' | 'state' | 'last' | 'model', text: string) => (!shown[k] ? '' : `  ${k === lastCol ? text : text.padEnd(cols[k])}`)
  return raw.map(r => ({
    icon: scoutIcon(r.s),
    tone: scoutTone(r.s),
    name: lastCol ? r.s.name.padEnd(cols.name) : r.s.name,
    every: cell('every', r.every),
    state: cell('state', r.state),
    stateTone: r.s.warning && !r.s.running && !r.s.paused ? 'warning' : scoutTone(r.s),
    last: cell('last', r.last.text),
    lastTone: r.last.tone,
    model: cell('model', r.model),
  }))
}

/** A Scouts list row as plain text (what the panel draws). */
export const scoutListText = (r: ScoutListRow, indent = 2): string => `${' '.repeat(indent)}${r.icon} ${r.name}${r.every}${r.state}${r.last}${r.model}`.trimEnd()

/** Sorted for the panel; see scoutOrder. */
export const sortScouts = <S extends SymccScout>(scouts: S[]): S[] => [...scouts].sort(scoutOrder)

/** A scout's file in the project: ".<plugin name>/scouts/<scout>.md". */
export const scoutFile = (scout: string, name: string = DEFAULT_NAME) => `${namesFor(name).scouts}/${scout}.md`

/** A scout name that is safe to put in a file path: letters, digits, ., - and _ only (no slashes or spaces, and not
 *  "." or ".."), 1 to 64 long. Any scout file the scouts folder can hold under such a name (e.g. "deps.v2.md") loads,
 *  runs, pauses and edits the same way everywhere. */
export const SCOUT_FILE_NAME = /^(?!\.\.?$)[A-Za-z0-9._-]{1,64}$/

/** What is said when a scout name can't be a scout file's name. */
export const SCOUT_FILE_NAME_RULE = 'use only letters, digits, ., - and _'

/** What /<name>-scout and the panel's editor say when `name` can't be a scout file's name (see SCOUT_FILE_NAME). */
export const scoutFileNameError = (name: string): string => `"${name}" is not a scout name: ${SCOUT_FILE_NAME_RULE}`

/** `rel` with "." and ".." parts worked out and doubled or backward slashes made single forward ones. ".." above the start stays as "..". */
export function resolveRel(rel: string): string {
  const out: string[] = []
  for (const part of rel.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..' && out.length && out[out.length - 1] !== '..') out.pop()
    else out.push(part)
  }
  return `${rel.startsWith('/') ? '/' : ''}${out.join('/')}`
}

/**
 * The scout's file (as scoutFile), or null when it would not be a file directly inside the scouts folder:
 * a bad name ("..", "a/b", "../../README", ...) or a path that, once resolved, lands anywhere else.
 * Use this, not scoutFile, before reading, writing or deleting a scout file.
 */
export function safeScoutFile(scout: string, name: string = DEFAULT_NAME): string | null {
  if (typeof scout !== 'string' || !SCOUT_FILE_NAME.test(scout)) return null
  const dir = resolveRel(namesFor(name).scouts)
  const file = resolveRel(scoutFile(scout, name))
  if (!file.startsWith(`${dir}/`) || file.slice(dir.length + 1).includes('/')) return null
  return file
}

/** A scout's last report for the panel: "nothing found" when empty (or NOTHING), else its text cut to `n` characters. */
export function scoutReport(text: string | undefined, n = 800): string {
  const s = String(text ?? '').trim()
  if (!s || /^NOTHING[.:]?$/i.test(s)) return 'nothing found'
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s
}

/**
 * True when a scout's answer means "nothing to report": empty, or its first non-empty line
 * is just NOTHING (any case, with an optional "." or ":"), whatever follows (e.g. what it checked).
 */
export const isNothing = (answer: string | undefined): boolean => {
  const first = String(answer ?? '').split('\n').map(l => l.trim()).find(l => l) ?? ''
  return !first || /^NOTHING[.:]?$/i.test(first)
}

/** How many recently finished or dropped tasks a scout is shown. */
export const SCOUT_CLOSED_SHOWN = 20

/**
 * The most recently finished and dropped tasks, newest first, as "T-5 title (done)" lines,
 * so a scout doesn't report what was just fixed or turned down. Tasks with no readable time go last.
 */
export function recentClosed(tasks: Pick<SymccTask, 'id' | 'title' | 'status' | 'updated_at' | 'created_at'>[], n = SCOUT_CLOSED_SHOWN): string[] {
  const at = (t: Pick<SymccTask, 'updated_at' | 'created_at'>) => {
    const v = Date.parse(t.updated_at ?? t.created_at ?? '')
    return Number.isFinite(v) ? v : -Infinity
  }
  return tasks
    .filter(t => t.status === 'done' || t.status === 'dropped')
    .sort((a, b) => at(b) - at(a))
    .slice(0, Math.max(0, Math.floor(Number.isFinite(n) ? n : SCOUT_CLOSED_SHOWN)))
    .map(t => `${t.id} ${t.title} (${t.status})`)
}

/**
 * The two lines of scoutPrompt's rules that depend on the scout's tools: what it may use (`may`: the web only when
 * `o.web`, default true) and how it looks at the board (`board`: symcc's board and stats tools, or, with `o.symccTools`
 * false, e.g. a `claude -p` process with only Read, Glob, Grep and Bash (T-474), the board file itself).
 */
export function scoutToolLines(name: string, o: { symccTools?: boolean; web?: boolean } = {}): { may: string; board: string } {
  const may = o.web === false ? '- You may read files and run shell commands that only look.' : '- You may read files, run shell commands that only look, and search or fetch pages on the web.'
  const board =
    o.symccTools === false
      ? `- To look at the board, read ${namesFor(name).dir}/board.json yourself (only read it, never change it): its tasks list has each task's id, title and status, and a try's report file is named in its runs. A done or dropped task there is short: its history, runs and details are in the file its parts field names (e.g. ${namesFor(name).dir}/tasks/T-600.json, under its id).`
      : `- To look at the board, use the ${name} tools board and stats rather than reading ${namesFor(name).dir}/board.json: board with no arguments lists the open tasks; status (e.g. ["done"]) and search (words) narrow it; task (e.g. "T-12") shows one task in full with its latest report. stats shows time and token use. They only read: every ${name} tool that changes the board (add, change, drop, approve, ...) is refused for you.`
  return { may, board }
}

/**
 * Scout prompt `prompt` (from scoutPrompt with symcc's tools and the web) for a scout started with only the host's own
 * tools (T-474): its tool lines (see scoutToolLines) become the ones for no symcc tools, and the web only when `web`.
 * A prompt without those lines (a checker's, say) comes back as it was.
 */
export function scoutWithoutSymccTools(prompt: string, web: boolean): string {
  return prompt.replace(/^- To look at the board, use the (\S+) tools board and stats .*$/m, (_l, name: string) => scoutToolLines(name, { symccTools: false }).board).replace(scoutToolLines(DEFAULT_NAME).may, scoutToolLines(DEFAULT_NAME, { web }).may)
}

/**
 * The prompt a scout run gets: its file's instructions as its job, the project folder,
 * the open tasks on the board (`open`: "T-3 title" lines), the recently closed ones (`closed`),
 * its own last report and last run time (both optional), and the rules for a good finding.
 */
export function scoutPrompt(o: {
  scout: string
  root: string
  instructions: string
  open: string[]
  name?: string
  closed?: string[]
  lastReport?: string | null
  lastRun?: string | null
  /** the scout can call symcc's board and stats tools (default true); false: it reads the board file itself */
  symccTools?: boolean
  /** the scout has web tools (default true, as a scout agent type has); false: the web is not named */
  web?: boolean
  /** T-600: organizational memory (org-mem) as a prompt shows it (orgMemSection), '' or left out for none */
  guide?: string
}): string {
  const name = o.name ?? DEFAULT_NAME
  const lines = scoutToolLines(name, o)
  const closed = Array.isArray(o.closed) ? o.closed : []
  const report = typeof o.lastReport === 'string' && !isNothing(o.lastReport) ? o.lastReport.trim() : ''
  const runAt = typeof o.lastRun === 'string' && Number.isFinite(Date.parse(o.lastRun)) ? o.lastRun : ''
  const since = runAt
    ? `You last ran at ${runAt}. Start with what changed since then, since new code is where new bugs are:\n  git log --since=${runAt} --stat`
    : 'This is your first run (or the time of your last run is not known). Look at the whole project, starting with the most recent changes (git log --stat -n 20).'
  return `You are the ${name} scout "${o.scout}". The project is in ${o.root}. Your job, from your scout file:

${o.instructions.trim()}

Tasks already open on the board (don't suggest these again):
${o.open.length ? o.open.join('\n') : '(none)'}

Tasks recently finished or dropped (don't report these again: they were just fixed or turned down):
${closed.length ? closed.join('\n') : '(none)'}

Your last report (don't repeat it unless it is still true and still not on the board):
${report || '(none)'}

Since when to look:
${since}
${o.guide ? o.guide : ''}
What makes a good finding:
- Check before you report. Read the code around it. Reproduce it if you can: run the tests, run a command that only looks, or try the input. Check that it isn't already handled somewhere else or already on the board.
- For each finding give: where (file:line); the proof (the command and its output, or the exact lines); what goes wrong for a user, and when; how sure you are (sure or likely); and a suggested task (a title and the files to change).
- Report at most 3 findings, the most important first. Real bugs, broken promises (the docs say one thing, the code does another), missing error handling and missing tests for risky code matter more than style, naming or typos.
- Leave out anything you can't show proof for.
- If nothing passes this bar, answer exactly: NOTHING. That is a good result, not a failure.

Rules:
- Don't change, create or delete files in the project: no edits, no installs, no git commands that change anything (commit, checkout, reset, stash, ...). Changes are made through board tasks, not by you.
${lines.may}
- Don't run long commands in the background. If you do, wait for them to finish before you answer: ending your turn ends your work, so never answer that you will continue later.
${lines.board}
- End with a short plain report of your findings. If there is nothing worth reporting, answer exactly: NOTHING`
}

/**
 * What the lead is told when a scout finishes, or null for a NOTHING report. Only the outcome: the
 * report itself already reached the lead as the scout's hand-back, so it is not repeated here.
 */
export function scoutLeadMessage(scout: string, answer: string | undefined, paused = false): string | null {
  if (isNothing(answer)) return null
  const n = countFindings(answer)
  const found = n ? `found ${n} thing${n > 1 ? 's' : ''}` : 'found something'
  const note = paused ? `\nThe owner has paused "${scout}": it doesn't run on its timer until the owner resumes it (run now still runs it once).` : ''
  return `Scout "${scout}" ${found} (its report is the scout's own message to you). Add tasks for anything worth doing, tell the owner what matters, or ignore it.${note}`
}

/** The how-to shown when there are no scouts. */
export function scoutHowTo(name: string = DEFAULT_NAME): string[] {
  return [
    'No scouts yet. A scout runs on a timer, does what its file asks and reports to the lead.',
    `Add one as ${namesFor(name).scouts}/<name>.md:`,
    '  ---',
    '  every_minutes: 30   (0 = only on demand)',
    '  model: sonnet        (optional)',
    '  ---',
    '  What to do, in plain words.',
    `examples/scouts/ in the plugin has examples to copy. Then run /${name}-scouts.`,
    'Or press "New scout" (n) to write one right here.',
  ]
}

// ---------------- a scout's run history ----------------

/** How a scout run ended: it reported findings, reported NOTHING, was stopped, ended on an API error or a refusal
 *  (both: nothing reported), or could not start at all. */
export type ScoutRunOutcome = 'found' | 'nothing' | 'stopped' | 'error' | 'refusal' | 'not started'

const OUTCOMES: readonly ScoutRunOutcome[] = ['found', 'nothing', 'stopped', 'error', 'refusal', 'not started']

/**
 * One run of a scout, kept in <dir>/scouts/<scout>.runs.json: when it started (null when not known) and ended, how it
 * ended, how many findings its report numbers, its tokens, the file its full report is in (<dir>/reports/scouts/…;
 * none when it said nothing), why it could not start (`why`, only for "not started"), and the ids of the tasks made
 * from it (`tasks`, saved when the lead adds them, so archived tasks still count). A run recorded before `tasks` was
 * saved (the one moved from scouts.json) has none: its tasks are worked out from the board (see scoutRunTasks).
 */
export type ScoutRunRecord = { started: string | null; ended: string; outcome: ScoutRunOutcome; findings: number; tokens?: SymccTokens; report?: string; why?: string; tasks?: string[] }

/** How many runs each scout keeps; older ones (and their report files) are removed. */
export const SCOUT_RUNS_KEPT = 50

/** How many recent runs the lead's scouts list with a name shows. */
export const SCOUT_LEAD_RUNS = 5

/** Where scout `scout` keeps its runs, relative to the project: "<dir>/scouts/<scout>.runs.json". */
export const scoutRunsFile = (scout: string, name: string = DEFAULT_NAME) => `${namesFor(name).scouts}/${scout}.runs.json`

/** Where the full report of scout `scout`'s run that ended at `ended` (ISO time) goes: "<dir>/reports/scouts/<scout>-<time>.md". */
export const scoutRunReportFile = (scout: string, ended: string, name: string = DEFAULT_NAME) => `${namesFor(name).dir}/reports/scouts/${scout}-${ended.replace(/[:.]/g, '-')}.md`

/** True when `rel` is a scout report file (as scoutRunReportFile makes), so a hand-edited runs file can't point elsewhere. */
export const isScoutRunReport = (rel: unknown): rel is string => typeof rel === 'string' && /^\.?[\w-]+\/reports\/scouts\/[\w.-]+\.md$/.test(rel) && !rel.includes('..')

/** How a run ended, from why its turn ended (`reason`) and what it answered. */
export function scoutRunOutcome(reason: 'answer' | 'aborted' | 'refusal' | 'error', answer: string | undefined): ScoutRunOutcome {
  if (reason === 'aborted') return 'stopped'
  if (reason === 'error' || reason === 'refusal') return reason
  return isNothing(answer) ? 'nothing' : 'found'
}

/** A scout's runs from its runs file, oldest first; a missing or broken file (or entry) is skipped, never an error. */
export function parseScoutRuns(text: string | null | undefined): ScoutRunRecord[] {
  if (!text || !text.trim()) return []
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return []
  }
  const list = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { runs?: unknown }).runs : undefined
  if (!Array.isArray(list)) return []
  const out: ScoutRunRecord[] = []
  for (const v of list) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue
    const e = v as Record<string, unknown>
    if (typeof e.ended !== 'string' || !Number.isFinite(Date.parse(e.ended)) || !OUTCOMES.includes(e.outcome as ScoutRunOutcome)) continue
    const r: ScoutRunRecord = {
      started: typeof e.started === 'string' && Number.isFinite(Date.parse(e.started)) ? e.started : null,
      ended: e.ended,
      outcome: e.outcome as ScoutRunOutcome,
      findings: typeof e.findings === 'number' && Number.isSafeInteger(e.findings) && e.findings >= 0 ? e.findings : 0,
    }
    if (e.tokens && typeof e.tokens === 'object' && !Array.isArray(e.tokens)) r.tokens = e.tokens as SymccTokens
    if (isScoutRunReport(e.report)) r.report = e.report
    if (typeof e.why === 'string' && e.why) r.why = e.why
    if (Array.isArray(e.tasks)) r.tasks = [...new Set(e.tasks.filter((x): x is string => typeof x === 'string' && /^[\w-]{1,40}$/.test(x)))]
    out.push(r)
  }
  return out.slice(-SCOUT_RUNS_KEPT)
}

/** The text of a scout's runs file. */
export const scoutRunsText = (runs: ScoutRunRecord[]): string => JSON.stringify({ runs }, null, 2) + '\n'

/** `runs` with `run` added at the end, only the last `keep` kept; `dropped` are the ones that fell out (their report files go too). */
export function addScoutRunRecord(runs: ScoutRunRecord[], run: ScoutRunRecord, keep = SCOUT_RUNS_KEPT): { runs: ScoutRunRecord[]; dropped: ScoutRunRecord[] } {
  const all = [...runs, run]
  const cut = Math.max(0, all.length - Math.max(1, keep))
  return { runs: all.slice(cut), dropped: all.slice(0, cut) }
}

const reported = (r: ScoutRunRecord) => r.outcome === 'found' || r.outcome === 'nothing'
const byNumber = (ids: string[]) => {
  const num = (id: string) => Number(/\d+/.exec(id)?.[0] ?? 0)
  return [...new Set(ids)].sort((a, b) => num(a) - num(b))
}

/**
 * The ids of the tasks made from each run of scout `scout` (same order as `runs`). A run's saved `tasks` when it has
 * them (they stay even once the tasks are archived). Only a run recorded before those were saved (no `tasks`) gets
 * them worked out from the board: the tasks whose origin names this scout, each linked to the last run that
 * reported (found or nothing) and ended before the task was made.
 */
export function scoutRunTasks(runs: ScoutRunRecord[], tasks: Pick<SymccTask, 'id' | 'created_at' | 'origin'>[], scout: string): string[][] {
  const out = runs.map(r => [...(r.tasks ?? [])])
  const ends = runs.map(r => (reported(r) ? Date.parse(r.ended) : NaN))
  for (const t of tasks) {
    const o = originOf(t)
    if (o?.by !== 'scout' || o.scout !== scout) continue
    const made = Date.parse(t.created_at || o.at || '')
    if (!Number.isFinite(made)) continue
    let best = -1
    for (let i = 0; i < runs.length; i++) if (Number.isFinite(ends[i]!) && ends[i]! <= made && (best < 0 || ends[i]! >= ends[best]!)) best = i
    if (best >= 0 && !runs[best]!.tasks) out[best]!.push(t.id)
  }
  return out.map(byNumber)
}

/**
 * `runs` with task `id` saved in the scout's latest run that reported something (found or nothing): the report the
 * lead made it from. A run recorded before tasks were saved first takes the ones worked out from the board
 * (`boardTasks`), so none are lost. Null when no run reported anything, or it is already there.
 */
export function linkScoutRunTask(runs: ScoutRunRecord[], id: string, scout: string, boardTasks: Pick<SymccTask, 'id' | 'created_at' | 'origin'>[]): ScoutRunRecord[] | null {
  let i = runs.length - 1
  while (i >= 0 && !reported(runs[i]!)) i--
  if (i < 0) return null
  const had = runs[i]!.tasks ?? scoutRunTasks(runs, boardTasks.filter(t => t.id !== id), scout)[i]!
  if (had.includes(id)) return runs[i]!.tasks ? null : runs.map((r, j) => (j === i ? { ...r, tasks: had } : r))
  return runs.map((r, j) => (j === i ? { ...r, tasks: byNumber([...had, id]) } : r))
}

/**
 * `runs` with task `id` (made at `made`, an ISO time) saved in the run whose report it came from: the latest run that
 * reported and ended before it was made. null when there is no such run, that run already lists it, or the run keeps
 * no task list (its tasks are worked out from the board, see scoutRunTasks).
 */
export function linkScoutRunTaskAt(runs: ScoutRunRecord[], id: string, made: string): ScoutRunRecord[] | null {
  const at = Date.parse(made)
  if (!Number.isFinite(at)) return null
  let best = -1
  for (let i = 0; i < runs.length; i++) {
    const end = Date.parse(runs[i]!.ended)
    if (reported(runs[i]!) && Number.isFinite(end) && end <= at && (best < 0 || end >= Date.parse(runs[best]!.ended))) best = i
  }
  const tasks = best < 0 ? undefined : runs[best]!.tasks
  if (!tasks || tasks.includes(id)) return null
  return runs.map((r, j) => (j === best ? { ...r, tasks: byNumber([...tasks, id]) } : r))
}

/** A run's outcome in words: "found", "nothing", "stopped", "API error", "refusal", "couldn't start". */
export const scoutOutcomeText = (o: ScoutRunOutcome): string => ({ found: 'found', nothing: 'nothing', stopped: 'stopped', error: 'API error', refusal: 'refusal', 'not started': "couldn't start" })[o]

/** The theme color of a run's outcome: found warning; an API error, a refusal or a failed start error; else inactive. */
export const scoutOutcomeTone = (o: ScoutRunOutcome): string => (o === 'found' ? 'warning' : o === 'error' || o === 'refusal' || o === 'not started' ? 'error' : 'inactive')

/** One run as a line: "8m ago · found · 2 findings · tasks T-3, T-4" (time · outcome · findings · tasks made). */
export function scoutRunLine(r: ScoutRunRecord, tasks: string[], nowMs: number): string {
  const when = fromNow(r.ended, nowMs) || r.ended
  const n = `${r.findings} finding${r.findings === 1 ? '' : 's'}`
  const made = tasks.length ? `task${tasks.length > 1 ? 's' : ''} ${tasks.join(', ')}` : 'no tasks'
  return `${when} · ${scoutOutcomeText(r.outcome)} · ${n} · ${made}`
}

/** What the scout's page says when its last run reported nothing because it ended on an API error or a refusal
 *  (or could not start); '' otherwise. `runs` oldest first. */
export function scoutLastRunProblem(runs: ScoutRunRecord[]): string {
  const last = runs[runs.length - 1]
  if (!last) return ''
  if (last.outcome === 'error') return 'Its last run ended on an API error, so nothing was reported.'
  if (last.outcome === 'refusal') return 'Its last run ended on a refusal, so nothing was reported.'
  if (last.outcome === 'not started') return `Its last run couldn't start${last.why ? ` (${last.why})` : ''}, so nothing was reported.`
  return ''
}
