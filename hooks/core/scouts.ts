// Scout files, and scouts in the board panel.
import type { SymccMode, SymccScout, SymccTask } from '../../types'
import { DEFAULT_NAME, namesFor } from '../name'
import { fmtDuration } from './runs'
import { frontMatterLine, splitFrontMatter } from './text'

/** A scout file: `.<plugin name>/scouts/<name>.md`, front matter + instructions. */
/** `every_minutes` 0 means "only on demand" (never on the timer). A bad value in the file also gives 0, with
 *  `warning` saying so and `bad_every` holding the value as written. */
export type ScoutDef = { name: string; every_minutes: number; model?: string; prompt: string; warning?: string; bad_every?: string }

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
  const raw = (meta.every_minutes ?? meta.every ?? '').trim()
  const base = { name: meta.name || name, model: meta.model || undefined, prompt }
  // missing: every hour; a whole number (0 = only on demand); anything else: only on demand, with a warning
  if (!raw) return { ...base, every_minutes: 60 }
  const every = everyMinutesOf(raw)
  if (every !== null) return { ...base, every_minutes: every }
  return { ...base, every_minutes: 0, warning: badEveryWarning(raw), bad_every: raw }
}

/**
 * A scout file's text from its front matter and body, as the panel's edit mode saves it.
 * `old` is the file as it was (or null for a new scout): every front matter line it has is kept
 * as it was, except every_minutes (an old "every" is replaced by it) and model (dropped when empty).
 */
export function scoutText(old: string | null, set: { every_minutes: number; model?: string }, body: string): string {
  const lines: string[] = []
  let everyDone = false
  let modelDone = false
  const model = (set.model ?? '').trim()
  for (const line of (old ? splitFrontMatter(old).lines : null) ?? []) {
    const key = frontMatterLine(line)?.key
    if (key === 'every_minutes' || key === 'every') {
      if (!everyDone) lines.push(`every_minutes: ${set.every_minutes}`)
      everyDone = true
    } else if (key === 'model') {
      if (!modelDone && model) lines.push(`model: ${model}`)
      modelDone = true
    } else lines.push(line)
  }
  if (!everyDone) lines.push(`every_minutes: ${set.every_minutes}`)
  if (!modelDone && model) lines.push(`model: ${model}`)
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
  if (everyMinutesOf(d.every) === null) return 'every (minutes) must be a whole number: 0 for only on demand, or 1 or more'
  if (!d.body.trim()) return 'write what the scout looks for'
  return ''
}

// ---------------- scouts in the board panel ----------------

/** How much of a scout's last answer is kept (SymccScout.last_report). */
export const SCOUT_REPORT_CHARS = 2000

/** What is kept about one scout between restarts (in <dir>/scouts.json); `paused` only when the owner paused it. */
export type ScoutMemory = { last_run: string | null; last_report?: string; paused?: boolean }

/**
 * Reads scouts.json. A missing, empty or broken file means "no scout has run" ({}), never an error;
 * entries with a bad shape are skipped one by one, and reports are cut to SCOUT_REPORT_CHARS.
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
    const e = v as { last_run?: unknown; last_report?: unknown; paused?: unknown }
    const last_run = typeof e.last_run === 'string' && !Number.isNaN(Date.parse(e.last_run)) ? e.last_run : null
    const m: ScoutMemory = { last_run }
    if (typeof e.last_report === 'string') m.last_report = e.last_report.slice(0, SCOUT_REPORT_CHARS)
    if (e.paused === true) m.paused = true
    if (m.last_run === null && m.last_report === undefined && !m.paused) continue
    out[name] = m
  }
  return out
}

/** The text of scouts.json for these scouts; only the names in `keep` (if given) are written. */
export function scoutMemoryText(scouts: Iterable<{ name: string; last_run: string | null; last_report?: string; paused?: boolean }>, keep?: string[]): string {
  const out: Record<string, ScoutMemory> = {}
  for (const s of scouts) {
    if (keep && !keep.includes(s.name)) continue
    if (s.last_run === null && s.last_report === undefined && !s.paused) continue
    const m: ScoutMemory = { last_run: s.last_run }
    if (s.last_report !== undefined) m.last_report = s.last_report.slice(0, SCOUT_REPORT_CHARS)
    if (s.paused) m.paused = true
    out[s.name] = m
  }
  return JSON.stringify({ scouts: out }, null, 2) + '\n'
}

/** The text of scouts.json once scout `name` is paused (or resumed), everything else in `saved` kept as it is. */
export function scoutPausedText(saved: Record<string, ScoutMemory>, name: string, paused: boolean): string {
  const all = { ...saved, [name]: { ...(saved[name] ?? { last_run: null }), paused } }
  return scoutMemoryText(Object.entries(all).map(([n, m]) => ({ name: n, ...m })))
}

/** How often a scout runs: "every 30 min", "every hour", "every 2 hours", "every 90 min", or "on demand" for 0. */
export function everyText(minutes: number): string {
  if (onDemand({ every_minutes: minutes })) return 'on demand'
  const m = Math.max(1, Math.round(minutes))
  if (m === 60) return 'every hour'
  if (m % 60 === 0) return `every ${m / 60} hours`
  return `every ${m} min`
}

/** What a scout is doing: "running now…", "paused", "next in 12m", "due now", or '' when no run is planned (as
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

/** True when scout `s` may start a run now (on its timer, or run now): not running already, not paused, in the
 *  session that drives the board, with a usable git repo, the board on and not in mode off. */
export function scoutMayRun(s: Pick<SymccScout, 'running' | 'paused'>, o: { driving: boolean; gitOk: boolean; mode: SymccMode; on: boolean }): boolean {
  return !s.running && !s.paused && o.driving && o.gitOk && o.on && o.mode !== 'off'
}

/** What "run now" says for a paused scout. */
export const scoutPausedAnswer = (scout: string, name: string = DEFAULT_NAME): string =>
  `${scout} is paused; resume it first (p on its page, or /${name}-scout ${scout} resume)`

/** A scout's state icon (one column wide): ◉ running, ○ paused, ◎ waiting for its next run or for "run now" (a
 *  scout that runs only on demand). */
export const scoutIcon = (s: Pick<SymccScout, 'running' | 'paused'>): string => (s.running ? '◉' : s.paused ? '○' : '◎')

/** The theme color of a scout's icon and state: running blue (ide), paused subtle, waiting plain text. */
export const scoutTone = (s: Pick<SymccScout, 'running' | 'paused'>): string => (s.running ? 'ide' : s.paused ? 'subtle' : 'text')

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
 *  warning color, "nothing" (subtle) for a NOTHING report, "never ran" when it has no last run. */
export function scoutLastText(s: Pick<SymccScout, 'last_run' | 'last_report'>): { text: string; tone: string } {
  if (!s.last_run && s.last_report === undefined) return { text: 'never ran', tone: 'subtle' }
  if (isNothing(s.last_report)) return { text: 'last: nothing', tone: 'subtle' }
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
    last: s.running ? { text: '', tone: 'subtle' } : scoutLastText(s),
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

/** A scout's last report for the panel: "nothing found" when empty (or NOTHING), else its text cut to `n` characters. */
export function scoutReport(text: string | undefined, n = 800): string {
  const s = String(text ?? '').trim()
  if (isNothing(s)) return 'nothing found'
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s
}

/** True when a scout's answer means "nothing to report": empty, or exactly NOTHING. */
export const isNothing = (answer: string | undefined): boolean => {
  const s = String(answer ?? '').trim()
  return !s || /^NOTHING\.?$/i.test(s)
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
 * The prompt a scout run gets: its file's instructions as its job, the project folder,
 * the open tasks on the board (`open`: "T-3 title" lines), the recently closed ones (`closed`),
 * its own last report and last run time (both optional), and the rules for a good finding.
 */
export function scoutPrompt(o: { scout: string; root: string; instructions: string; open: string[]; name?: string; closed?: string[]; lastReport?: string | null; lastRun?: string | null }): string {
  const name = o.name ?? DEFAULT_NAME
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

What makes a good finding:
- Check before you report. Read the code around it. Reproduce it if you can: run the tests, run a command that only looks, or try the input. Check that it isn't already handled somewhere else or already on the board.
- For each finding give: where (file:line); the proof (the command and its output, or the exact lines); what goes wrong for a user, and when; how sure you are (sure or likely); and a suggested task (a title and the files to change).
- Report at most 3 findings, the most important first. Real bugs, broken promises (the docs say one thing, the code does another), missing error handling and missing tests for risky code matter more than style, naming or typos.
- Leave out anything you can't show proof for.
- If nothing passes this bar, answer exactly: NOTHING. That is a good result, not a failure.

Rules:
- Don't change, create or delete files in the project: no edits, no installs, no git commands that change anything (commit, checkout, reset, stash, ...). Changes are made through board tasks, not by you.
- You may read files, run shell commands that only look, and search or fetch pages on the web.
- End with a short plain report of your findings. If there is nothing worth reporting, answer exactly: NOTHING`
}

/** What the lead is told when a scout finishes: its whole report cut to `n` characters, or null for NOTHING. */
export function scoutLeadMessage(scout: string, answer: string | undefined, n = SCOUT_REPORT_CHARS, paused = false): string | null {
  if (isNothing(answer)) return null
  const report = String(answer).trim().slice(0, n).trimEnd()
  const note = paused ? `\nThe owner has paused "${scout}": it doesn't run again until the owner resumes it.` : ''
  return `Scout "${scout}" reports:\n${report}\nAdd tasks for anything worth doing, tell the owner what matters, or ignore it.${note}`
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
