import type { SymccScout, SymccTask, SymccTokens } from '../../types'
import { type ScoutFindings } from '../board'
import { type ScoutDef, scoutFindingsChoice, nextFindings, parseScout, modeOf, symccOn, OPEN, scoutPrompt, recentClosed, scoutAgentName, scoutDescription, parseScoutMemory, lastRunOf, scoutMemoryText, scoutPausedText, everyText, SCOUT_REPORT_CHARS, scoutLeadMessage, scoutWhyNot, scoutFile, scoutNameError, scoutDraftError, scoutText, everyMinutesOf, onDemand, onNotReady, SCOUT_RETRY_MS, inPlan, addScoutRun, keepScoutUsage, leadScoutNameError, leadScoutText, leadScoutsText, safeScoutFile, SCOUT_FILE_NAME, SCOUT_FILE_NAME_RULE, scoutFileNameError, type ScoutRunRecord, parseScoutRuns, scoutRunsText, addScoutRunRecord, scoutRunsFile, scoutRunReportFile, isScoutRunReport, scoutRunOutcome, scoutRunTasks, linkScoutRunTask, countFindings, reportText, parseScoutUsage, scoutResultsLine, renameScoutOrigins, linkScoutRunTaskAt, type Board } from '../board'
import { publish, refreshStatus, drivesHere } from './lead'
import { S, onHere, scoutState, scoutRuns, heard, timers, updateScoutOpen, stopped, movedAgents, movedRefused, DRIVING_MOVED } from './state'
import { type FileTouch, type Host, type HostAgentStarted, notReadyYet } from '../host'
import { startAgent, startCancelled } from './starts'
import type { TurnEnd } from './workers'
import { path, load, change, now, oneAtATime, safeWrite } from './store'
import { tellLead } from './tell'
import { readArchiveFile, renameArchivedScoutOrigins } from './archive'
import { orgMemText } from './org-mem'
import { addTokens } from '../core/runs'

// ---------------- scouts ----------------

/** The scout files (names like "b.md") the last loadScouts could not read and skipped; /symcc-scout (with no name) names them. */
export let unreadableScouts: string[] = []

/** The warning /symcc-scout (with no name) shows for the skipped files, or '' when every scout file could be read. */
export const unreadableScoutsText = () => unreadableScouts.map(f => `${f}: can't be read, skipped (fix or remove ${S.N.scouts}/${f})`).join('\n')

/** The scouts in <dir>/scouts/*.md. A file that can't be read is skipped (and kept in unreadableScouts), so one
 *  broken file never stops the other scouts or the session start. */
export async function loadScouts(host: Host): Promise<ScoutDef[]> {
  const dir = path(S.N.scouts)
  if (!(await host.fs.exists(dir))) return (unreadableScouts = [], [])
  const out: ScoutDef[] = []
  const bad: string[] = []
  for (const f of await host.fs.list(dir)) {
    if (f.kind !== 'file' || !f.name.endsWith('.md')) continue
    const text = await host.fs.read(`${dir}/${f.name}`).then(
      t => t,
      () => null,
    )
    if (text === null) {
      bad.push(f.name)
      continue
    }
    const s = parseScout(f.name.replace(/\.md$/, ''), text)
    if (s) out.push(s)
  }
  unreadableScouts = bad
  return out
}

/** The scouts a task may come from: the ones loaded, every scout file in <dir>/scouts/ and every scout with a run
 *  history there (a scout removed after it reported). A folder that can't be listed adds nothing. */
export async function knownScouts(host: Host): Promise<string[]> {
  const names = new Set(scoutState.keys())
  const files = await host.fs.list(path(S.N.scouts)).catch(() => [])
  for (const f of files) {
    if (f.kind !== 'file') continue
    const m = /^(.+?)(\.runs\.json|\.md)$/.exec(f.name)
    if (m) names.add(m[1]!)
  }
  return [...names]
}

/** Whether a task may come from scout `name` (see knownScouts): it is loaded, or has a scout file or a run history. */
export async function isKnownScout(host: Host, name: string): Promise<boolean> {
  if (scoutState.has(name)) return true
  if (safeScoutFile(name, S.N.name) === null) return false
  for (const f of [scoutFile(name, S.N.name), scoutRunsFile(name, S.N.name)]) if (await host.fs.exists(path(f)).catch(() => false)) return true
  return false
}

/**
 * The first time symcc sets up a project (no <dir>/scouts/ folder yet), copies the plugin's example scouts
 * (examples/scouts/*.md) into it, each marked paused in scouts.json first, so they show in the Scouts view but
 * never run on their timer until the owner resumes one (run now still runs one once). A scouts folder that is there (even empty) gets nothing. Never throws:
 * when the examples can't be read or a copy fails, the owner is told once in a toast and symcc starts as usual.
 * Returns the names copied.
 */
export async function seedExampleScouts(host: Host): Promise<string[]> {
  try {
    const dir = path(S.N.scouts)
    if (await host.fs.exists(dir)) return []
    const from = `${host.plugin.root}/examples/scouts`
    const examples: { name: string; text: string }[] = []
    for (const f of await host.fs.list(from)) {
      if (f.kind !== 'file' || !f.name.endsWith('.md')) continue
      const name = f.name.replace(/\.md$/, '')
      if (!SCOUT_FILE_NAME.test(name)) continue
      examples.push({ name, text: await host.fs.read(`${from}/${f.name}`) })
    }
    if (!examples.length) return []
    // Paused first: a scout file never lands without its pause, so no timer runs one before the owner resumes it.
    await changeScoutMemory(host, old => {
      let text = old ?? ''
      for (const e of examples) text = scoutPausedText(parseScoutMemory(text), e.name, true)
      return text
    })
    const r = await host.run(['mkdir', '-p', dir])
    if (r.exitCode !== 0) throw new Error(r.stderr || r.stdout || `mkdir exit ${r.exitCode}`)
    for (const e of examples) await host.fs.write(`${dir}/${e.name}.md`, e.text)
    host.ui.toast(S.N.toast(`added ${examples.length} example scouts, all paused: try one with Run now (r on its page) or /${S.N.name}-scout <name>, or resume its timer with p or /${S.N.name}-scout <name> resume`))
    return examples.map(e => e.name)
  } catch (e) {
    host.ui.toast(S.N.toast(`couldn't add the example scouts: ${String((e as Error)?.message ?? e).slice(0, 200)}`))
    return []
  }
}

/** agent id of a scout run going now → the scout's last_run before it started (put back if the run is stopped) */
const runBefore = new Map<string, string | null>()
/** agent id of a scout run going now → when it started (ms), for the run's time in scouts.json's usage */
const runStarted = new Map<string, number>()
/** scouts whose failed start the owner was already told about (cleared once one starts) */
const startWarned = new Set<string>()
/**
 * T-919: agent id of a scout whose turn ended while shell commands it sent to the background still ran → what that
 * turn answered (and used). The host wakes such an agent again, under the same id, when its command ends, so its run
 * is not over: it stays in scoutRuns (and its shell commands keep the scout's rules) until a turn ends with none left,
 * or SCOUT_WAKE_MS passes with no new turn (then the answer kept here is its report).
 */
const waking = new Map<string, { answer: string; tokens?: SymccTokens; timer: { cancel(): void } }>()
/** T-919: how long a scout whose turn ended with background commands still running may take to be woken again. */
export const SCOUT_WAKE_MS = 30 * 60_000

/** Empties this file's memory of scout runs (what a reload starts with); for the tests' resetPlugin() only. */
export function resetScoutRuns() {
  runBefore.clear()
  runStarted.clear()
  for (const w of waking.values()) w.timer.cancel()
  waking.clear()
  startWarned.clear()
  historyWarned = false
}

// ---------------- each scout's run history ----------------

/** whether a run history that could not be saved was already told (once per session) */
let historyWarned = false

/**
 * Where the Scouts view is, as the board panel keeps it in its saved scout value (next to its tab): the open scout
 * ('' = the list) and, on its page, the run whose full report is open (when that run ended; '' = none). Both are
 * in the one value, so whatever leaves the scout's page (its Back button, resetPane, Esc, the panel closing) also
 * closes the run.
 */
export function scoutPlace(value: string) {
  const [scout = '', run = ''] = value.split('\n')
  return { scout, run }
}
/** The saved scout value for scout `scout`'s page, with the run that ended at `run` open ('' = none). */
export const scoutPlaceValue = (scout: string, run = '') => (run ? `${scout}\n${run}` : scout)

/** A scout's runs file, in the project. */
export const runsPath = (scout: string) => path(scoutRunsFile(scout, S.N.name))

/** Saves a scout run's full report to `rel` (<dir>/reports/scouts/…), through a temp file and a rename. */
export async function writeRunReport(host: Host, rel: string, text: string) {
  await host.run(['mkdir', '-p', path(`${S.N.dir}/reports/scouts`)])
  await safeWrite(host, path(rel), reportText(text), 'the scout report')
}

/** Scout `scout`'s runs, oldest first ([] when it has none, or its name can't be a file's). */
export async function loadScoutRunHistory(host: Host, scout: string): Promise<ScoutRunRecord[]> {
  if (safeScoutFile(scout, S.N.name) === null) return []
  return parseScoutRuns(await host.fs.read(runsPath(scout)).catch(() => null))
}

/**
 * Each named scout's "Results" line for its page (T-622): what its findings became in the last 7 days and in all,
 * from the board's `tasks` plus the archived ones and its tokens in scouts.json. A file that can't be read counts as empty.
 */
export async function loadScoutResults(host: Pick<Host, 'fs'>, scouts: string[], tasks: SymccTask[], nowMs: number): Promise<Record<string, string>> {
  const usage = parseScoutUsage(await host.fs.read(scoutMemoryFile()).catch(() => null))
  const r = await readArchiveFile(host as Host).catch(() => ({ broken: 'unreadable', archive: { tasks: [] as SymccTask[] } }))
  const onBoard = new Set(tasks.map(t => t.id))
  const all = [...tasks, ...(r.broken ? [] : r.archive.tasks.filter(t => !onBoard.has(t.id)))]
  return Object.fromEntries(scouts.map(s => [s, scoutResultsLine(all, s, Object.hasOwn(usage, s) ? usage[s] : undefined, nowMs)]))
}

/** The full report of a run (its file's text), or null when it has none or it can't be read. */
export async function readScoutRunReport(host: Host, run: Pick<ScoutRunRecord, 'report'>): Promise<string | null> {
  if (!isScoutRunReport(run.report)) return null
  return host.fs.read(path(run.report)).catch(() => null)
}

/**
 * Changes scout `scout`'s runs file: `fn` gets its runs (oldest first) and gives the new ones and those dropped (null:
 * leave it). Report files of dropped runs are removed.
 */
function changeScoutRuns(host: Host, scout: string, fn: (runs: ScoutRunRecord[]) => { runs: ScoutRunRecord[]; dropped: ScoutRunRecord[] } | null): Promise<void> {
  const file = runsPath(scout)
  return oneAtATime(file, async () => {
    const text = await host.fs.read(file).catch(() => null)
    const runs = typeof text === 'string' ? parseScoutRuns(text) : []
    const next = fn(runs)
    if (!next) return
    await host.run(['mkdir', '-p', path(S.N.scouts)])
    await safeWrite(host, file, scoutRunsText(next.runs), `${scoutRunsFile(scout, S.N.name)}`)
    const gone = next.dropped.map(r => r.report).filter(isScoutRunReport).map(r => path(r))
    if (gone.length) await host.run(['rm', '-f', '--', ...gone]).catch(() => undefined)
  })
}

/** Adds a run that ended to scout `scout`'s history: its full report (`answer`, when it said anything) goes to a
 *  file of its own. A failure is told once a session and never stops the scout. */
async function addRunToHistory(host: Host, scout: string, run: ScoutRunRecord, answer: string) {
  try {
    if (answer.trim()) {
      // two runs that end in the same millisecond never share a file
      const base = scoutRunReportFile(scout, run.ended, S.N.name)
      let rel = base
      for (let n = 2; n < 100 && (await host.fs.exists(path(rel)).catch(() => false)); n++) rel = base.replace(/\.md$/, `-${n}.md`)
      await writeRunReport(host, rel, answer)
      run.report = rel
    }
    await changeScoutRuns(host, scout, runs => addScoutRunRecord(runs, run))
  } catch (e) {
    if (historyWarned) return
    historyWarned = true
    host.ui.toast(S.N.toast(`scout ${scout}: could not save this run in its history (${String((e as Error)?.message ?? e).slice(0, 200)}); later failures are not told again`))
  }
}

/** Saves task `id` (just added by the lead, from scout `scout`'s finding) in that scout's latest run that reported
 *  something, so the run still lists it once the task is archived. `boardTasks`: the board's tasks now, for a run
 *  recorded before tasks were saved. A failure never stops the add. */
export async function linkTaskToScoutRun(host: Host, scout: string, id: string, boardTasks: Pick<SymccTask, 'id' | 'created_at' | 'origin'>[]): Promise<void> {
  if (safeScoutFile(scout, S.N.name) === null) return
  await changeScoutRuns(host, scout, runs => {
    const next = linkScoutRunTask(runs, id, scout, boardTasks)
    return next ? { runs: next, dropped: [] } : null
  }).catch(() => undefined)
}

/** Scout `scout`'s runs, newest first, each with the ids of the tasks made from it. */
export async function scoutRunsWithTasks(host: Host, scout: string): Promise<{ run: ScoutRunRecord; tasks: string[] }[]> {
  const runs = await loadScoutRunHistory(host, scout)
  const tasks = runs.length ? await load(host).then(b => b.tasks).catch(() => []) : []
  const made = scoutRunTasks(runs, tasks, scout)
  return runs.map((run, i) => ({ run, tasks: made[i]! })).reverse()
}

/**
 * Starts a run of scout `s` and waits until it started. Returns '' when it started, else why not. last_run is only
 * set once the spawn worked, so a failed try doesn't hide the commits since the last real run. When the scout type
 * isn't ready yet (just after a reload) it tries again shortly (`misses` such tries so far); other failures are told
 * to the owner.
 */
export async function runScout(host: Host, s: ScoutDef, misses = 0): Promise<string> {
  const q = await queueScout(host, s, misses)
  return typeof q === 'string' ? q : q.started
}

/**
 * runScout up to the start queue (see starts.ts): the scout's run is queued, to start at the next turn's start or
 * end. Answers why not (a string), or `started`, which settles as runScout's answer once it started or didn't.
 * `byHand`: run now by the owner or the lead, so a failed start is always told (not only the first time).
 */
async function queueScout(host: Host, s: ScoutDef, misses = 0, byHand = false): Promise<string | { started: Promise<string> }> {
  const st = scoutState.get(s.name)
  if (!st) return `no scout named ${s.name}`
  // A pause only stops the timer (armScout checks it), so a paused scout still runs here when asked to run now;
  // st.paused is brought up to date from scouts.json so the board and the lead's note show it.
  if (!st.running) await pausedNow(host, st)
  const b = await load(host)
  const why = scoutWhyNot(st, { driving: S.driving, gitOk: S.gitState === 'ok', mode: modeOf(b), on: onHere(b), plan: inPlan(S.plan) }, S.N.name)
  if (why) return why
  const lastRun = st.last_run
  const lastReport = st.last_report
  st.running = true
  await publish(host, b)
  const open = b.tasks.filter(t => OPEN.includes(t.status) || t.status === 'backlog').map(t => `${t.id} ${t.title}${t.status === 'backlog' ? ' (backlog)' : ''}`)
  const prompt = scoutPrompt({ scout: s.name, root: S.root, instructions: s.prompt, open, closed: recentClosed(b.tasks), lastReport, lastRun, name: S.N.name, guide: await orgMemText(host), projects: S.projects })
  // T-759: driving may have moved to another session while the prompt was made (a hand-over stops the scouts first,
  // and a start queued after that would never be stopped): a session that no longer drives starts no scout run
  if (!(await drivesHere(host))) {
    st.running = false
    await load(host).then(x => publish(host, x)).catch(() => undefined)
    return scoutWhyNot(st, { driving: false, gitOk: true, mode: modeOf(b), on: true }, S.N.name)
  }
  // and asked again right before it starts (it waits in the start queue until a turn starts or ends)
  const spawn = startAgent(host, { kind: 'scout', prompt, name: scoutAgentName(S.N.name, s.name), description: scoutDescription(s.name, s.prompt), ...(s.model ? { model: s.model } : {}) }, () => drivesHere(host))
  return { started: scoutStarted(host, s, st, spawn, lastRun, misses, byHand) }
}

/** Scout `s`'s queued run (`spawn`) started, or didn't (see runScout): '' or why not. */
async function scoutStarted(host: Host, s: ScoutDef, st: SymccScout, spawn: Promise<HostAgentStarted>, lastRun: string | null, misses: number, byHand: boolean): Promise<string> {
  let agentId: string
  try {
    const spawned = await spawn
    if (!spawned.agentId) throw new Error('the scout did not start')
    agentId = spawned.agentId
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err)
    // T-938: on the record shown now too (see below)
    for (const x of new Set([st, scoutState.get(s.name) ?? st])) {
      x.running = false
      x.last_run = lastRun
    }
    await load(host).then(b => publish(host, b)).catch(() => undefined)
    // taken back out of the start queue (everything was stopped before it started): nothing to warn about
    if (startCancelled(err)) return `scout ${s.name} didn't start: ${msg}`
    if (notReadyYet(err) && onNotReady(misses) === 'retry') {
      timers.push(host.clock.after(SCOUT_RETRY_MS, () => void runScout(host, s, misses + 1)))
      return `scout ${s.name} can't start yet (${msg}); trying again in a few seconds`
    }
    const text = `scout ${s.name} didn't start: ${msg}`
    await addRunToHistory(host, s.name, { started: null, ended: now(), outcome: 'not started', findings: 0, why: msg.slice(0, 300) }, '')
    if (byHand || !startWarned.has(s.name)) {
      startWarned.add(s.name)
      host.ui.toast(S.N.toast(text))
    }
    return text
  }
  startWarned.delete(s.name)
  // T-938: the scout's state may have been made anew while its start waited in the queue (scheduleScouts, after a
  // scouts folder change or a reload, replaces each scout's record); this run's start goes on the record shown now,
  // else the board counts the running time from the run before ("org-mem-review 24h 02m")
  const cur = scoutState.get(s.name)
  for (const x of cur && cur !== st ? [st, cur] : [st]) {
    x.last_run = now()
    // the next timed run counts from this one (run by hand too); the timer, when it goes off early, waits the rest
    if (!onDemand(s)) x.next_run = new Date(Date.parse(x.last_run) + s.every_minutes * 60_000).toISOString()
  }
  runBefore.set(agentId, lastRun)
  runStarted.set(agentId, Date.now())
  scoutRuns.set(agentId, s.name)
  await load(host).then(b => publish(host, b)).catch(() => undefined)
  return ''
}

/** <dir>/scouts.json: which scouts are paused, and the scouts' usage totals (the last run and report are in each scout's runs file). */
export const scoutMemoryFile = () => path(`${S.N.dir}/scouts.json`)

/** The saved scout memory; a missing or broken file counts as "no scout has run yet". */
export async function loadScoutMemory(host: Host) {
  const text = await host.fs.read(scoutMemoryFile()).catch(() => null)
  return parseScoutMemory(text)
}

/** Runs the one-time scout origin fix (T-712, see migrateScoutOrigins) at session start; nothing when already current. */
export async function scoutOriginsFixed(host: Host) {
  await migrateScoutOrigins(host)
}

/**
 * The one-time fix of tasks added with a scout's agent name ("symcc-scout-bugs") as their scout (before T-712): the
 * board (board.json and its <dir>/tasks/ parts files) and the archive get the scout's own name ("bugs"), and each such task is saved
 * in the run whose report it came from (the latest run of that scout that ended before the task was made). A board
 * already current changes nothing. Returns the ids renamed.
 */
export async function migrateScoutOrigins(host: Host): Promise<string[]> {
  const b = await load(host)
  const known = await knownScouts(host)
  const archived = await renameArchivedScoutOrigins(host, known).catch(() => [])
  const renamed = !renameScoutOrigins(b.tasks, S.N.name, known).renamed.length ? [] : await change(host, y => {
    const r = renameScoutOrigins(y.tasks, S.N.name, known)
    return [{ ...y, tasks: r.tasks }, r.renamed] as [Board, typeof r.renamed]
  })
  renamed.push(...archived)
  if (!renamed.length) return []
  for (const scout of new Set(renamed.map(r => r.scout))) {
    if (safeScoutFile(scout, S.N.name) === null) continue
    const mine = renamed.filter(r => r.scout === scout)
    await changeScoutRuns(host, scout, runs => {
      let next = runs
      for (const r of mine) next = linkScoutRunTaskAt(next, r.id, r.at) ?? next
      return next === runs ? null : { runs: next, dropped: [] }
    }).catch(() => undefined)
  }
  return renamed.map(r => r.id)
}

/**
 * Changes scouts.json: reads it, makes the new text with `fn` (null = leave the file as it is) and saves it through
 * a temp file of its own and a rename (like board.json). The scouts' token and time totals ("usage") already in
 * the file are kept when the new text carries none. Changes in this session go one at a time, each reading what
 * the one before saved, so a run's totals and a timer or pause change at the same time are both kept.
 */
export function changeScoutMemory(host: Host, fn: (old: string | null) => string | null): Promise<void> {
  const file = scoutMemoryFile()
  return oneAtATime(file, async () => {
    const old = await host.fs.read(file).catch(() => null)
    const next = fn(typeof old === 'string' ? old : null)
    if (next === null) return
    await host.run(['mkdir', '-p', path(S.N.dir)])
    await safeWrite(host, file, keepScoutUsage(next, old), `${S.N.dir}/scouts.json`)
  })
}

/** Saves the scouts in scoutState; scouts no longer in scouts/ are dropped. Whether each is paused is taken from
 *  the file first, since the owner may have paused or resumed one from another session. A scout whose file is
 *  there but can't be read now (unreadableScouts) keeps its saved entry as it is, so its pause is not lost. */
export async function saveScoutMemory(host: Host) {
  await changeScoutMemory(host, old => {
    const saved = parseScoutMemory(old)
    for (const st of scoutState.values()) st.paused = saved[st.name]?.paused === true
    const kept = unreadableScouts
      .map(f => f.replace(/\.md$/, ''))
      .filter(n => !scoutState.has(n) && saved[n])
      .map(n => ({ name: n, ...saved[n]! }))
    return scoutMemoryText([...scoutState.values(), ...kept])
  })
}

/** Scout `name`'s last run (when it started) and last report, read from its newest reported run and that run's report file (cut to SCOUT_REPORT_CHARS). */
async function lastFromRuns(host: Host, name: string): Promise<{ last_run: string | null; last_report?: string }> {
  const last = lastRunOf(await loadScoutRunHistory(host, name))
  if (!last) return { last_run: null }
  const text = last.report ? await readScoutRunReport(host, { report: last.report }) : null
  return { last_run: last.last_run, ...(text !== null ? { last_report: text.trim().slice(0, SCOUT_REPORT_CHARS) } : {}) }
}

/** True when scout `st` is paused, as scouts.json says now (st.paused is brought up to date). */
export async function pausedNow(host: Host, st: SymccScout): Promise<boolean> {
  const saved = await loadScoutMemory(host)
  st.paused = saved[st.name]?.paused === true
  return st.paused
}

/**
 * Pauses (or resumes) scout `name` for the owner (p on its page, /<name>-scout <scout> pause|resume); says what
 * happened. Only the pause flag in scouts.json changes, never the scout's file. A run going on now is not
 * stopped: it finishes and reports, and its timer doesn't start another. Run now still runs a paused scout.
 */
export async function setScoutPaused(host: Host, name: string, paused: boolean): Promise<string> {
  if (!SCOUT_FILE_NAME.test(name)) return scoutFileNameError(name)
  const defs = await scheduleScouts(host)
  const st = scoutState.get(name)
  if (!st || !defs.some(d => d.name === name)) return `no scout named ${name} (have: ${defs.map(d => d.name).join(', ') || 'none'})`
  let already = false
  await changeScoutMemory(host, old => {
    const saved = parseScoutMemory(old)
    already = (saved[name]?.paused === true) === paused
    return already ? null : scoutPausedText(saved, name, paused)
  })
  if (already) {
    st.paused = paused
    return paused ? `${name} is already paused; resume its timer with p on its page or /${S.N.name}-scout ${name} resume` : `${name} is not paused`
  }
  st.paused = paused
  await publish(host, await load(host))
  host.ui.refresh()
  if (!paused) return onDemand(st) ? `${name} resumed: it runs only on demand (run now, or /${S.N.name}-scout ${name})` : `${name} resumed: it runs ${everyText(st.every_minutes)} again`
  return `${name} paused: it doesn't run on its timer until you resume it (run now still runs it)${st.running ? '; the run going now finishes first' : ''}`
}

/** Adds one run of scout `name` (its tokens and time) to the running totals in scouts.json, for /<name>-stats. */
export async function recordScoutRun(host: Host, name: string, run: { endMs: number; ms: number; tokens?: SymccTokens }) {
  await changeScoutMemory(host, old => addScoutRun(old, name, run))
}

/**
 * T-919: a scout's turn ended (turn.complete) on an answer while the host saw shell commands it sent to the background
 * still running (`background`): the host wakes it again when they end, so the run goes on and the scout stays known
 * (scoutRuns) to the guards. Answers whether the run was kept going this way; false: it ended, call scoutFinished.
 */
export function scoutTurnEnded(host: Host, agentId: string, answer: string, background: readonly string[] | undefined, tokens?: SymccTokens): boolean {
  if (!background?.length || !scoutRuns.has(agentId) || stopped.has(agentId)) return false
  const before = waking.get(agentId)
  before?.timer.cancel()
  const all = before?.tokens ? addTokens(before.tokens, tokens) : tokens
  const said = answer.trim() ? answer : (before?.answer ?? answer)
  const timer = host.clock.after(SCOUT_WAKE_MS, () => {
    if (waking.get(agentId)?.timer !== timer) return
    waking.delete(agentId)
    // never woken again: this run ends on what it said last (a stopped scout, gone from scoutRuns, ends no run here)
    if (scoutRuns.has(agentId)) void scoutFinished(host, agentId, said, false, all).catch(() => undefined)
  })
  waking.set(agentId, { answer: said, ...(all ? { tokens: all } : {}), timer })
  return true
}

/**
 * A scout's turn ended (turn.complete). `end`: why it ended (true: it was stopped). A stopped run, or one that ended
 * on an API error or a refusal, reports nothing: its last text is only half an answer, so the last real run and
 * report are kept.
 */
export async function scoutFinished(host: Host, agentId: string, answer: string, end: boolean | TurnEnd = false, tokens?: SymccTokens) {
  // T-919: an earlier turn of this run that ended while its background commands still ran: its tokens count too, and
  // its answer stands in when this last turn says nothing
  const held = waking.get(agentId)
  if (held) {
    held.timer.cancel()
    waking.delete(agentId)
    if (held.tokens) tokens = addTokens(held.tokens, tokens)
    if (!answer.trim()) answer = held.answer
  }
  // T-759: a run symcc stopped, or one any copy of symcc refused with the "driving moved" note (movedRefused, shared
  // by every copy in this process), is a stopped run whatever it answered, as is one whose last words are only
  // "stopped": never a finding
  const refusedMoved = movedRefused().has(agentId)
  movedRefused().delete(agentId)
  const stoppedRun = stopped.has(agentId) || refusedMoved || stopAnswer(answer)
  const moved = movedAgents.has(agentId) || refusedMoved || /driving moved/i.test(answer)
  const reason = stoppedRun || end === true ? 'aborted' : end === false ? 'answer' : end.reason
  const name = scoutRuns.get(agentId)!
  scoutRuns.delete(agentId)
  const started = runStarted.get(agentId)
  runStarted.delete(agentId)
  // A stopped run still used tokens: count it too.
  const endMs = Date.now()
  await recordScoutRun(host, name, { endMs, ms: started === undefined ? 0 : endMs - started, ...(tokens !== undefined ? { tokens } : {}) }).catch(() => undefined)
  const before = runBefore.get(agentId) ?? null
  runBefore.delete(agentId)
  const st = scoutState.get(name)
  // Its run history first: when it has none yet, the last report still in scouts.json moves in before this run's.
  const outcome = scoutRunOutcome(reason, answer)
  await addRunToHistory(
    host,
    name,
    { started: started === undefined ? null : new Date(started).toISOString(), ended: new Date(endMs).toISOString(), outcome, findings: outcome === 'found' ? countFindings(answer) : 0, ...(tokens !== undefined ? { tokens } : {}), ...(outcome === 'found' || outcome === 'nothing' ? { tasks: [] } : {}), ...(stoppedRun && moved ? { why: DRIVING_MOVED } : {}) },
    answer,
  )
  if (reason !== 'answer') {
    // Stopped from the agent controls, or ended on an error or a refusal: what it said so far is not a report. Keep the last real run and report.
    if (st) {
      st.running = false
      st.last_run = before
    }
    await load(host).then(b => publish(host, b)).catch(() => undefined)
    const how = reason === 'aborted' ? (stoppedRun && moved ? ` ${DRIVING_MOVED}` : ' was stopped') : reason === 'error' ? "'s run ended on an error" : "'s run ended on a refusal"
    host.ui.toast(S.N.toast(`scout ${name}${how}; nothing reported`))
    return
  }
  if (st) {
    st.running = false
    st.last_report = answer.trim().slice(0, SCOUT_REPORT_CHARS)
    // scouts.json (the owner's pauses, usage) is brought up to date here: a pause set meanwhile is read, a removed scout's entry goes
    await saveScoutMemory(host).catch(() => undefined)
  }
  // a broken board.json must not lose the report: telling the lead still happens
  await load(host).then(b => publish(host, b)).catch(() => undefined)
  const msg = scoutLeadMessage(name, answer, st?.paused === true)
  if (msg) {
    const at = now()
    heard.scouts[name] = at
    heard.last = { what: `scout ${name} report`, at }
    tellLead(host, msg)
  }
}

/** T-759: whether a run's whole answer is only one of the stop answers ("stopped", or DRIVING_MOVED), maybe in
 *  quotes, bold or with an end mark, as a refused or stopped run answers: no report. Any other text, even one that
 *  starts with "Stopped", is a real answer. */
export const stopAnswer = (answer: string) => {
  const a = answer.trim().replace(/^[\s"'`*_.]+|[\s"'`*_.!]+$/g, '').toLowerCase()
  return a === 'stopped' || a === DRIVING_MOVED
}

/** How soon after start a scout that is overdue (or never ran) runs: the first one after SOON_MS, each next one
 *  SPREAD_MS later, so several scouts don't all start at once. */
export const SCOUT_SOON_MS = 60_000
export const SCOUT_SPREAD_MS = 30_000
/** How often a paused scout whose time has come checks again whether it was resumed. */
export const PAUSED_RECHECK_MS = 60_000

/** When a scout runs next (ms): its last run + its interval, or `soon` when that is already past or it never ran. */
export function nextRunFrom(lastRun: string | null, everyMinutes: number, soon: () => number): number {
  const last = Date.parse(lastRun ?? '')
  const at = Number.isFinite(last) ? last + everyMinutes * 60_000 : NaN
  return Number.isFinite(at) && at > Date.now() ? at : soon()
}

/** Sets the timer for scout `st` to its next_run. When next_run moved since (the scout ran by hand, so it counts
 *  from that run) it waits the rest; a paused scout keeps its time and checks again shortly. */
function armScout(host: Host, s: ScoutDef, st: SymccScout) {
  const armedFor = st.next_run
  const at = Date.parse(armedFor ?? '')
  const wait = Number.isFinite(at) ? Math.max(0, at - Date.now()) : s.every_minutes * 60_000
  timers.push(
    host.clock.after(wait, () => {
      if (scoutState.get(s.name) !== st) return
      if (st.next_run !== armedFor) return armScout(host, s, st)
      void (async () => {
        if (!st.running && (await pausedNow(host, st).catch(() => false))) {
          timers.push(host.clock.after(PAUSED_RECHECK_MS, () => scoutState.get(s.name) === st && armScout(host, s, st)))
          return
        }
        // if it didn't start (another session drives the board, the board is paused, …) try again an interval later
        st.next_run = new Date(Date.now() + s.every_minutes * 60_000).toISOString()
        await runScout(host, s).catch(() => undefined)
        if (scoutState.get(s.name) === st) armScout(host, s, st)
      })()
    }),
  )
}

/**
 * Reads the scouts folder and sets every timed scout's timer. A scout's next run counts from its last run
 * (kept in scouts.json): last_run + every_minutes, or soon after start when that is past or it never ran. A scout
 * already known with the same every_minutes keeps its next run, so editing one scout doesn't move the others.
 */
export async function scheduleScouts(host: Host) {
  for (const t of timers.splice(0)) t.cancel()
  const defs = await loadScouts(host)
  for (const k of [...scoutState.keys()]) if (!defs.some(d => d.name === k)) scoutState.delete(k)
  // after a restart the map is empty: take each scout's last run and report from scouts.json
  const saved = defs.some(d => !scoutState.has(d.name)) ? await loadScoutMemory(host) : {}
  let soonCount = 0
  // one start time for all of them, so the spacing between scouts is exactly SPREAD_MS
  const startedAt = Date.now()
  const soon = () => startedAt + SCOUT_SOON_MS + SCOUT_SPREAD_MS * soonCount++
  for (const s of [...defs].sort((a, b) => a.name.localeCompare(b.name))) {
    const known = scoutState.get(s.name)
    // after a restart a scout's last run and report come from its newest run (T-808)
    const old: Pick<SymccScout, 'last_run' | 'running' | 'last_report' | 'paused'> | undefined = known ?? { ...(await lastFromRuns(host, s.name)), running: false, ...(saved[s.name]?.paused ? { paused: true } : {}) }
    const timed = !onDemand(s)
    const st: SymccScout = { name: s.name, every_minutes: s.every_minutes, last_run: old?.last_run ?? null, running: old?.running ?? false, prompt: s.prompt }
    if (timed) {
      const keep = known && known.every_minutes === s.every_minutes && Number.isFinite(Date.parse(known.next_run ?? '')) ? known.next_run : undefined
      st.next_run = keep ?? new Date(nextRunFrom(st.last_run, s.every_minutes, soon)).toISOString()
    }
    if (s.model) st.model = s.model
    if (s.summary) st.summary = s.summary
    if (s.findings) st.findings = s.findings
    if (s.warning) st.warning = s.warning
    if (old?.last_report !== undefined) st.last_report = old.last_report
    if (old?.paused) st.paused = true
    scoutState.set(s.name, st)
    // every_minutes 0 (or a bad value): only on demand, so no timer
    if (timed) armScout(host, s, st)
  }
  // the line above the prompt says when the next scout runs ("in 38m"): draw it again every minute so it counts down
  if (defs.some(d => !onDemand(d))) timers.push(host.clock.every(60_000, () => refreshStatus(host)))
  return defs
}

/** Runs scout `name` now (/<name>-scout <scout>, "run now" in the panel, or the lead's scouts run); says what
 *  happened. A paused scout runs too, once, and stays paused (its timer stays stopped). */
export async function runScoutNow(host: Host, name: string): Promise<string> {
  if (!SCOUT_FILE_NAME.test(name)) return scoutFileNameError(name)
  const defs = await scheduleScouts(host)
  const s = defs.find(d => d.name === name)
  if (!s) return `no scout named ${name} (have: ${defs.map(d => d.name).join(', ') || 'none'})`
  const st = scoutState.get(s.name)
  if (st) await pausedNow(host, st)
  const cur = await load(host)
  const why = scoutWhyNot(st ?? { name: s.name, running: false }, { driving: S.driving, gitOk: S.gitState === 'ok', mode: modeOf(cur), on: onHere(cur), plan: inPlan(S.plan) }, S.N.name)
  if (why) return why
  // not waited for: it is asked from a tool call, a slash command or the panel, and starts at the next turn's start or end (see starts.ts)
  const q = await queueScout(host, s, 0, true)
  if (typeof q === 'string') return q
  void q.started.catch(() => undefined)
  return `scout ${s.name} is starting`
}

/** A scout file's text, or null when there is none (or it can't be read). */
export async function readScoutFile(host: Host, scout: string): Promise<string | null> {
  const rel = safeScoutFile(scout, S.N.name)
  if (rel === null) return null
  const file = path(rel)
  return (await host.fs.exists(file).catch(() => false)) ? await host.fs.read(file).catch(() => null) : null
}

/** Opens the panel's edit mode for scout `sc`, filled from its file (or from what the panel knows). */
export async function editScout(host: Host, sc: SymccScout) {
  const text = await readScoutFile(host, sc.name)
  const def = text === null ? null : parseScout(sc.name, text)
  S.draft = { scout: sc.name, isNew: false, every: def?.bad_every ?? String(def?.every_minutes ?? sc.every_minutes), model: def?.model ?? sc.model ?? '', summary: def?.summary ?? sc.summary ?? '', findings: def?.findings ?? sc.findings ?? '', body: def?.prompt ?? sc.prompt ?? '', error: '' }
  host.ui.refresh()
}

/** Starts a new scout named as typed: refused when the name is bad or taken; else opens the edit mode. */
export async function newScout(host: Host, name: string, shown: string[] = []) {
  const s = name.trim()
  const have = [...shown, ...scoutState.keys(), ...(await loadScouts(host).catch(() => [] as ScoutDef[])).map(d => d.name)]
  let err = scoutNameError(s, have)
  if (!err && (await readScoutFile(host, s)) !== null) err = `a scout named ${s} already exists`
  if (err) {
    S.naming = { name: s, error: err }
  } else {
    S.naming = null
    S.draft = { scout: s, isNew: true, every: '60', model: '', summary: '', findings: '', body: '', error: '' }
  }
  host.ui.refresh()
}

/** Saves the edit mode to .<name>/scouts/<scout>.md, keeping the other front matter keys, and reloads the scouts. */
export async function saveScout(host: Host) {
  const d = S.draft
  if (!d) return
  const err = scoutDraftError(d)
  if (err) {
    d.error = err
    host.ui.refresh()
    return
  }
  const rel = safeScoutFile(d.scout, S.N.name)
  if (rel === null) {
    d.error = scoutFileNameError(d.scout)
    host.ui.refresh()
    return
  }
  const old = await readScoutFile(host, d.scout)
  if (d.isNew && old !== null) {
    d.error = `a scout named ${d.scout} already exists`
    host.ui.refresh()
    return
  }
  const text = scoutText(old, { every_minutes: everyMinutesOf(d.every)!, model: d.model, summary: d.summary, findings: findingsOf(d.findings) }, d.body)
  await host.run(['mkdir', '-p', path(S.N.scouts)])
  await host.fs.write(path(rel), text)
  S.draft = null
  // The same path as a Write to a scout file: reschedule, so the new timing applies now.
  await scheduleScouts(host)
  await publish(host, await load(host))
  await updateScoutOpen(host, () => d.scout)
  host.ui.toast(S.N.toast(`saved ${scoutFile(d.scout, S.N.name)}`))
  host.ui.refresh()
}

/** What the lead's scouts tool gets: action (list by default), name, every_minutes, model, prompt. */
export type LeadScoutInput = { action?: unknown; name?: unknown; every_minutes?: unknown; model?: unknown; findings?: unknown; prompt?: unknown }

/** A findings choice as typed: auto or backlog; empty or "default" means none (follow the board setting). */
const findingsOf = (v: string): ScoutFindings | '' => scoutFindingsChoice(v) ?? ''

/** Scout `name`'s own findings choice, read from its file now (undefined: it follows the board's scout_findings). */
export async function scoutFindingsFor(host: Host, name: string): Promise<ScoutFindings | undefined> {
  const text = await readScoutFile(host, name)
  return text === null ? undefined : parseScout(name, text)?.findings
}

/** The findings key (f) on scout `name`'s page (T-912): moves its own choice on (board default → auto → backlog →
 *  board default; nextFindings), saved in its file as /<name>-scout <name> findings auto|backlog|default does. */
export async function cycleScoutFindings(host: Host, name: string): Promise<string> {
  const now = await scoutFindingsFor(host, name)
  return leadScouts(host, { action: 'edit', name, findings: nextFindings(now) })
}

/** every_minutes as the lead gave it (a whole number, 0 or more), or null. */
const leadEvery = (v: unknown): number | null => (typeof v === 'number' ? (Number.isSafeInteger(v) && v >= 0 ? v : null) : typeof v === 'string' ? everyMinutesOf(v) : null)

/**
 * The lead's scouts tool: list (default; with name, one scout in full), add, edit, remove, run.
 * add and edit write .<name>/scouts/<scout>.md like the panel's editor; add, edit and remove reschedule the
 * scouts so the board shows the change at once. run is the owner's "run now". Pause and resume are refused:
 * only the owner does those.
 */
export async function leadScouts(host: Host, a: LeadScoutInput): Promise<string> {
  const action = typeof a.action === 'string' && a.action.trim() ? a.action.trim().toLowerCase() : 'list'
  const name = typeof a.name === 'string' ? a.name.trim() : ''
  if (action === 'pause' || action === 'resume') return 'only the owner pauses or resumes scouts'
  // Every action that takes a name checks it before any file is touched: the name goes into a file path. Only add
  // keeps the strict rule for new names; the others take any scout that is there, as long as its file is safely
  // inside the scouts folder (so "../x" never reaches a file outside it).
  if (action === 'add') {
    const bad = leadScoutNameError(name)
    if (bad) return bad
  } else if (name) {
    if (safeScoutFile(name, S.N.name) === null) return `"${name}" is not a valid scout name: ${SCOUT_FILE_NAME_RULE} (and no "." or ".." alone)`
  } else if (action !== 'list' && action !== 'run') return `say which scout to ${action} (name)`
  const defs = await scheduleScouts(host)
  const have = () => `have: ${defs.map(d => d.name).join(', ') || 'none'}`
  const known = defs.some(d => d.name === name)
  if (action === 'list') {
    if (!name) return leadScoutsText([...scoutState.values()], Date.now(), S.N.scouts)
    const st = scoutState.get(name)
    if (!st || !known) return `no scout named ${name} (${have()})`
    await pausedNow(host, st).catch(() => undefined)
    return leadScoutText(st, Date.now(), true, await scoutRunsWithTasks(host, name).catch(() => []))
  }
  if (action === 'run') {
    if (!name) return 'say which scout to run (name)'
    return runScoutNow(host, name)
  }
  if (action !== 'add' && action !== 'edit' && action !== 'remove') return `unknown action "${action}": use list, add, edit, remove or run`
  // The name was checked above (add: leadScoutNameError, a stricter rule; edit and remove: safeScoutFile), so this is a file.
  const file = safeScoutFile(name, S.N.name)!
  const old = await readScoutFile(host, name)
  if (action === 'remove') {
    if (old === null && !known) return `no scout named ${name} (${have()})`
    // An argument list (no shell), with "--" so the path can never be read as an option.
    const r = await host.run(['rm', '-f', '--', path(file)])
    if (r.exitCode !== 0) return `could not remove ${file}: ${r.stderr || r.stdout || `exit ${r.exitCode}`}`
    await scheduleScouts(host)
    await publish(host, await load(host))
    host.ui.refresh()
    return `removed scout ${name} (${file})`
  }
  if (action === 'add' && (old !== null || known)) return `a scout named ${name} already exists; use action "edit" to change it`
  if (action === 'edit' && old === null) return `no scout named ${name} (${have()})`
  const def = old === null ? null : parseScout(name, old)
  const everyGiven = a.every_minutes !== undefined && a.every_minutes !== null && a.every_minutes !== ''
  const every = everyGiven ? leadEvery(a.every_minutes) : (def && !def.bad_every ? def.every_minutes : null)
  if (every === null) return everyGiven || action === 'add' ? 'every_minutes must be a whole number: 0 for only on demand, or 1 or more' : `${name}'s every_minutes in its file is not valid; give every_minutes`
  const prompt = typeof a.prompt === 'string' && a.prompt.trim() ? a.prompt : (def?.prompt ?? '')
  if (!prompt.trim()) return 'prompt is missing: say in plain words what the scout looks for'
  const model = typeof a.model === 'string' ? a.model.trim() : (def?.model ?? '')
  if (a.findings !== undefined && a.findings !== null && !/^(auto|backlog|default|)$/i.test(String(a.findings).trim())) return 'findings must be auto, backlog or default (default: follow the board setting)'
  const findings: ScoutFindings | '' = a.findings === undefined || a.findings === null ? (def?.findings ?? '') : findingsOf(String(a.findings))
  await host.run(['mkdir', '-p', path(S.N.scouts)])
  await host.fs.write(path(file), scoutText(old, { every_minutes: every, model, findings }, prompt))
  await scheduleScouts(host)
  await publish(host, await load(host))
  host.ui.refresh()
  return `${action === 'add' ? 'added' : 'saved'} scout ${name} (${file}): runs ${everyText(every)}${model ? `, model ${model}` : ''}${findings ? `, findings → ${findings}` : ''}`
}

/** Leaves the edit mode (and the new scout name box) without saving. */
export function cancelScoutEdit(host: Host) {
  S.draft = null
  S.naming = null
  host.ui.refresh()
}

/**
 * Which of the plugin's folders a tool call writes, edits or deletes in: the scouts folder
 * (`scouts`, e.g. ".symcc/scouts") and/or the roles folder (`roles`, e.g. ".symcc/roles").
 * The host says what the call touched (FileTouch): a file it writes or edits (`path`), or a shell command
 * (`command`). For a command only those that can change files count (rm, mv, cp, a redirect, ...),
 * so reading a scout file with cat doesn't start the timers over.
 */
export function fileToolHits(touch: FileTouch, scouts: string, roles: string, kinds: string): { scouts: boolean; roles: boolean; kinds: boolean } {
  const inDir = (text: string, dir: string, needSlash: boolean) => text.replace(/\\/g, '/').includes(needSlash ? `${dir}/` : dir)
  if ('path' in touch) {
    const p = touch.path
    return { scouts: inDir(p, scouts, true), roles: inDir(p, roles, true), kinds: inDir(p, kinds, true) }
  }
  const c = touch.command
  if (!/(^|[\s;&|(])(rm|mv|cp|unlink|touch|tee|sed\s+-i|git\s+(rm|mv|checkout|restore))\b|>/.test(c)) return { scouts: false, roles: false, kinds: false }
  return { scouts: inDir(c, scouts, false), roles: inDir(c, roles, false), kinds: inDir(c, kinds, false) }
}
