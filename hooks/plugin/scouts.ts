import type { SymccScout, SymccTokens } from '../../types'
import { type ScoutDef, parseScout, modeOf, symccOn, OPEN, scoutPrompt, recentClosed, scoutAgentName, scoutDescription, parseScoutMemory, scoutMemoryText, scoutPausedText, everyText, SCOUT_REPORT_CHARS, scoutLeadMessage, scoutWhyNot, scoutFile, scoutNameError, scoutDraftError, scoutText, everyMinutesOf, onDemand, scoutNotReady, onNotReady, SCOUT_RETRY_MS, inPlan, addScoutRun, keepScoutUsage, migrateScoutUsage, leadScoutNameError, leadScoutText, leadScoutsText, safeScoutFile, SCOUT_FILE_NAME, SCOUT_FILE_NAME_RULE, scoutFileNameError } from '../board'
import { publish, refreshStatus } from './lead'
import { type $, S, scoutState, scoutRuns, heard, timers, updateScoutOpen } from './state'
import { path, load, now, oneAtATime, safeWrite } from './store'
import { tellLead } from './tell'

// ---------------- scouts ----------------

export async function loadScouts($: $): Promise<ScoutDef[]> {
  const dir = path(S.N.scouts)
  if (!(await $.fs.exists(dir))) return []
  const out: ScoutDef[] = []
  for (const f of await $.fs.list(dir)) {
    if (f.kind !== 'file' || !f.name.endsWith('.md')) continue
    const s = parseScout(f.name.replace(/\.md$/, ''), await $.fs.read(`${dir}/${f.name}`))
    if (s) out.push(s)
  }
  return out
}

/**
 * The first time symcc sets up a project (no <dir>/scouts/ folder yet), copies the plugin's example scouts
 * (examples/scouts/*.md) into it, each marked paused in scouts.json first, so they show in the Scouts view but
 * never run on their timer until the owner resumes one (run now still runs one once). A scouts folder that is there (even empty) gets nothing. Never throws:
 * when the examples can't be read or a copy fails, the owner is told once in a toast and symcc starts as usual.
 * Returns the names copied.
 */
export async function seedExampleScouts($: $): Promise<string[]> {
  try {
    const dir = path(S.N.scouts)
    if (await $.fs.exists(dir)) return []
    const from = `${$.plugin.root}/examples/scouts`
    const examples: { name: string; text: string }[] = []
    for (const f of await $.fs.list(from)) {
      if (f.kind !== 'file' || !f.name.endsWith('.md')) continue
      const name = f.name.replace(/\.md$/, '')
      if (!SCOUT_FILE_NAME.test(name)) continue
      examples.push({ name, text: await $.fs.read(`${from}/${f.name}`) })
    }
    if (!examples.length) return []
    // Paused first: a scout file never lands without its pause, so no timer runs one before the owner resumes it.
    await changeScoutMemory($, old => {
      let text = old ?? ''
      for (const e of examples) text = scoutPausedText(parseScoutMemory(text), e.name, true)
      return text
    })
    const r = await $.process.run(['mkdir', '-p', dir])
    if (r.exitCode !== 0) throw new Error(r.stderr || r.stdout || `mkdir exit ${r.exitCode}`)
    for (const e of examples) await $.fs.write(`${dir}/${e.name}.md`, e.text)
    $.ui.toast(S.N.toast(`added ${examples.length} example scouts, all paused: try one with Run now (r on its page) or /${S.N.name}-scout <name>, or resume its timer with p or /${S.N.name}-scout <name> resume`))
    return examples.map(e => e.name)
  } catch (e) {
    $.ui.toast(S.N.toast(`couldn't add the example scouts: ${String((e as Error)?.message ?? e).slice(0, 200)}`))
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
 * Starts a run of scout `s`. Returns '' when it started, else why not. last_run is only set once the spawn
 * worked, so a failed try doesn't hide the commits since the last real run. When the scout type isn't ready yet
 * (just after a reload) it tries again shortly (`misses` such tries so far); other failures are told to the owner.
 */
export async function runScout($: $, s: ScoutDef, misses = 0): Promise<string> {
  const st = scoutState.get(s.name)
  if (!st) return `no scout named ${s.name}`
  // A pause only stops the timer (armScout checks it), so a paused scout still runs here when asked to run now;
  // st.paused is brought up to date from scouts.json so the board and the lead's note show it.
  if (!st.running) await pausedNow($, st)
  const b = await load($)
  const why = scoutWhyNot(st, { driving: S.driving, gitOk: S.gitState === 'ok', mode: modeOf(b), on: symccOn(b), plan: inPlan(S.plan) }, S.N.name)
  if (why) return why
  const lastRun = st.last_run
  const lastReport = st.last_report
  st.running = true
  await publish($, b)
  const open = b.tasks.filter(t => OPEN.includes(t.status) || t.status === 'backlog').map(t => `${t.id} ${t.title}${t.status === 'backlog' ? ' (backlog)' : ''}`)
  const prompt = scoutPrompt({ scout: s.name, root: S.root, instructions: s.prompt, open, closed: recentClosed(b.tasks), lastReport, lastRun, name: S.N.name })
  let agentId: string
  try {
    const spawned = await $.agent.spawn({ prompt, name: scoutAgentName(S.N.name, s.name), description: scoutDescription(s.name, s.prompt), subagentType: S.N.scout, ...(s.model ? { model: s.model } : {}) })
    if ('deny' in spawned && spawned.deny) throw new Error(spawned.deny)
    if (!('agentId' in spawned) || !spawned.agentId) throw new Error('the scout did not start')
    agentId = spawned.agentId
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err)
    st.running = false
    st.last_run = lastRun
    await publish($, await load($)).catch(() => undefined)
    if (scoutNotReady(msg, S.N.name) && onNotReady(misses) === 'retry') {
      timers.push($.clock.after(SCOUT_RETRY_MS, () => void runScout($, s, misses + 1)))
      return `scout ${s.name} can't start yet (${msg}); trying again in a few seconds`
    }
    const text = `scout ${s.name} didn't start: ${msg}`
    if (!startWarned.has(s.name)) {
      startWarned.add(s.name)
      $.ui.toast(S.N.toast(text))
    }
    return text
  }
  startWarned.delete(s.name)
  st.last_run = now()
  // the next timed run counts from this one (run by hand too); the timer, when it goes off early, waits the rest
  if (!onDemand(s)) st.next_run = new Date(Date.parse(st.last_run) + s.every_minutes * 60_000).toISOString()
  runBefore.set(agentId, lastRun)
  runStarted.set(agentId, Date.now())
  scoutRuns.set(agentId, s.name)
  await publish($, await load($)).catch(() => undefined)
  return ''
}

/** <dir>/scouts.json: each scout's last run time and last report, so a restart doesn't make it "first run" again. */
export const scoutMemoryFile = () => path(`${S.N.dir}/scouts.json`)

/** The saved scout memory; a missing or broken file counts as "no scout has run yet". */
export async function loadScoutMemory($: $) {
  const text = await $.fs.read(scoutMemoryFile()).catch(() => null)
  return parseScoutMemory(text)
}

/** Saves scouts.json once with old one-number token totals marked unsplit (see migrateScoutUsage); nothing when already current. */
export async function saveScoutsMigrated($: $) {
  await changeScoutMemory($, old => migrateScoutUsage(old))
}

/**
 * Changes scouts.json: reads it, makes the new text with `fn` (null = leave the file as it is) and saves it through
 * a temp file of its own and a rename (like board.json). The scouts' token and time totals ("usage") already in
 * the file are kept when the new text carries none. Changes in this session go one at a time, each reading what
 * the one before saved, so a run's totals and a timer or pause change at the same time are both kept.
 */
export function changeScoutMemory($: $, fn: (old: string | null) => string | null): Promise<void> {
  const file = scoutMemoryFile()
  return oneAtATime(file, async () => {
    const old = await $.fs.read(file).catch(() => null)
    const next = fn(typeof old === 'string' ? old : null)
    if (next === null) return
    await $.process.run(['mkdir', '-p', path(S.N.dir)])
    await safeWrite($, file, keepScoutUsage(next, old), `${S.N.dir}/scouts.json`)
  })
}

/** Saves the scouts in scoutState; scouts no longer in scouts/ are dropped. Whether each is paused is taken from
 *  the file first, since the owner may have paused or resumed one from another session. */
export async function saveScoutMemory($: $) {
  await changeScoutMemory($, old => {
    const saved = parseScoutMemory(old)
    for (const st of scoutState.values()) st.paused = saved[st.name]?.paused === true
    return scoutMemoryText(scoutState.values())
  })
}

/** True when scout `st` is paused, as scouts.json says now (st.paused is brought up to date). */
export async function pausedNow($: $, st: SymccScout): Promise<boolean> {
  const saved = await loadScoutMemory($)
  st.paused = saved[st.name]?.paused === true
  return st.paused
}

/**
 * Pauses (or resumes) scout `name` for the owner (p on its page, /<name>-scout <scout> pause|resume); says what
 * happened. Only the pause flag in scouts.json changes, never the scout's file. A run going on now is not
 * stopped: it finishes and reports, and its timer doesn't start another. Run now still runs a paused scout.
 */
export async function setScoutPaused($: $, name: string, paused: boolean): Promise<string> {
  if (!SCOUT_FILE_NAME.test(name)) return scoutFileNameError(name)
  const defs = await scheduleScouts($)
  const st = scoutState.get(name)
  if (!st || !defs.some(d => d.name === name)) return `no scout named ${name} (have: ${defs.map(d => d.name).join(', ') || 'none'})`
  let already = false
  await changeScoutMemory($, old => {
    const saved = parseScoutMemory(old)
    already = (saved[name]?.paused === true) === paused
    return already ? null : scoutPausedText(saved, name, paused)
  })
  if (already) {
    st.paused = paused
    return paused ? `${name} is already paused; resume its timer with p on its page or /${S.N.name}-scout ${name} resume` : `${name} is not paused`
  }
  st.paused = paused
  await publish($, await load($))
  $.ui.invalidate('ui.render')
  if (!paused) return onDemand(st) ? `${name} resumed: it runs only on demand (run now, or /${S.N.name}-scout ${name})` : `${name} resumed: it runs ${everyText(st.every_minutes)} again`
  return `${name} paused: it doesn't run on its timer until you resume it (run now still runs it)${st.running ? '; the run going now finishes first' : ''}`
}

/** Adds one run of scout `name` (its tokens and time) to the running totals in scouts.json, for /<name>-stats. */
export async function recordScoutRun($: $, name: string, run: { endMs: number; ms: number; tokens?: SymccTokens }) {
  await changeScoutMemory($, old => addScoutRun(old, name, run))
}

export async function scoutFinished($: $, agentId: string, answer: string, isAborted = false, tokens?: SymccTokens) {
  const name = scoutRuns.get(agentId)!
  scoutRuns.delete(agentId)
  const started = runStarted.get(agentId)
  runStarted.delete(agentId)
  // A stopped run still used tokens: count it too.
  const endMs = Date.now()
  await recordScoutRun($, name, { endMs, ms: started === undefined ? 0 : endMs - started, ...(tokens !== undefined ? { tokens } : {}) }).catch(() => undefined)
  const before = runBefore.get(agentId) ?? null
  runBefore.delete(agentId)
  const st = scoutState.get(name)
  if (isAborted) {
    // Stopped from the agent controls: what it said so far is not a report. Keep the last real run and report.
    if (st) {
      st.running = false
      st.last_run = before
    }
    await publish($, await load($))
    $.ui.toast(S.N.toast(`scout ${name} was stopped; nothing reported`))
    return
  }
  if (st) {
    st.running = false
    st.last_report = answer.trim().slice(0, SCOUT_REPORT_CHARS)
    await saveScoutMemory($).catch((e: Error) => tellLead($, `Note: scout ${name}'s last run was not saved (${e.message}); after a restart it will start as a first run.`))
  }
  await publish($, await load($))
  const msg = scoutLeadMessage(name, answer, st?.paused === true)
  if (msg) {
    const at = now()
    heard.scouts[name] = at
    heard.last = { what: `scout ${name} report`, at }
    tellLead($, msg)
  }
}

/** How soon after start a scout that is overdue (or never ran) runs: the first one after SOON_MS, each next one
 *  SPREAD_MS later, so several scouts don't all start at once. */
export const SCOUT_SOON_MS = 60_000
export const SCOUT_SPREAD_MS = 30_000
/** How often a paused scout whose time has come checks again whether it was resumed. */
const PAUSED_RECHECK_MS = 60_000

/** When a scout runs next (ms): its last run + its interval, or `soon` when that is already past or it never ran. */
export function nextRunFrom(lastRun: string | null, everyMinutes: number, soon: () => number): number {
  const last = Date.parse(lastRun ?? '')
  const at = Number.isFinite(last) ? last + everyMinutes * 60_000 : NaN
  return Number.isFinite(at) && at > Date.now() ? at : soon()
}

/** Sets the timer for scout `st` to its next_run. When next_run moved since (the scout ran by hand, so it counts
 *  from that run) it waits the rest; a paused scout keeps its time and checks again shortly. */
function armScout($: $, s: ScoutDef, st: SymccScout) {
  const armedFor = st.next_run
  const at = Date.parse(armedFor ?? '')
  const wait = Number.isFinite(at) ? Math.max(0, at - Date.now()) : s.every_minutes * 60_000
  timers.push(
    $.clock.after(wait, () => {
      if (scoutState.get(s.name) !== st) return
      if (st.next_run !== armedFor) return armScout($, s, st)
      void (async () => {
        if (!st.running && (await pausedNow($, st).catch(() => false))) {
          timers.push($.clock.after(PAUSED_RECHECK_MS, () => scoutState.get(s.name) === st && armScout($, s, st)))
          return
        }
        // if it didn't start (another session drives the board, the board is off, …) try again an interval later
        st.next_run = new Date(Date.now() + s.every_minutes * 60_000).toISOString()
        await runScout($, s).catch(() => undefined)
        if (scoutState.get(s.name) === st) armScout($, s, st)
      })()
    }),
  )
}

/**
 * Reads the scouts folder and sets every timed scout's timer. A scout's next run counts from its last run
 * (kept in scouts.json): last_run + every_minutes, or soon after start when that is past or it never ran. A scout
 * already known with the same every_minutes keeps its next run, so editing one scout doesn't move the others.
 */
export async function scheduleScouts($: $) {
  for (const t of timers.splice(0)) t.cancel()
  const defs = await loadScouts($)
  for (const k of [...scoutState.keys()]) if (!defs.some(d => d.name === k)) scoutState.delete(k)
  // after a restart the map is empty: take each scout's last run and report from scouts.json
  const saved = defs.some(d => !scoutState.has(d.name)) ? await loadScoutMemory($) : {}
  let soonCount = 0
  // one start time for all of them, so the spacing between scouts is exactly SPREAD_MS
  const startedAt = Date.now()
  const soon = () => startedAt + SCOUT_SOON_MS + SCOUT_SPREAD_MS * soonCount++
  for (const s of [...defs].sort((a, b) => a.name.localeCompare(b.name))) {
    const known = scoutState.get(s.name)
    const old: Pick<SymccScout, 'last_run' | 'running' | 'last_report' | 'paused'> | undefined = known ?? (saved[s.name] ? { ...saved[s.name]!, running: false } : undefined)
    const timed = !onDemand(s)
    const st: SymccScout = { name: s.name, every_minutes: s.every_minutes, last_run: old?.last_run ?? null, running: old?.running ?? false, prompt: s.prompt }
    if (timed) {
      const keep = known && known.every_minutes === s.every_minutes && Number.isFinite(Date.parse(known.next_run ?? '')) ? known.next_run : undefined
      st.next_run = keep ?? new Date(nextRunFrom(st.last_run, s.every_minutes, soon)).toISOString()
    }
    if (s.model) st.model = s.model
    if (s.summary) st.summary = s.summary
    if (s.warning) st.warning = s.warning
    if (old?.last_report !== undefined) st.last_report = old.last_report
    if (old?.paused) st.paused = true
    scoutState.set(s.name, st)
    // every_minutes 0 (or a bad value): only on demand, so no timer
    if (timed) armScout($, s, st)
  }
  // the line above the prompt says when the next scout runs ("in 38m"): draw it again every minute so it counts down
  if (defs.some(d => !onDemand(d))) timers.push($.clock.every(60_000, () => refreshStatus($)))
  return defs
}

/** Runs scout `name` now (/<name>-scout <scout>, "run now" in the panel, or the lead's scouts run); says what
 *  happened. A paused scout runs too, once, and stays paused (its timer stays stopped). */
export async function runScoutNow($: $, name: string): Promise<string> {
  if (!SCOUT_FILE_NAME.test(name)) return scoutFileNameError(name)
  const defs = await scheduleScouts($)
  const s = defs.find(d => d.name === name)
  if (!s) return `no scout named ${name} (have: ${defs.map(d => d.name).join(', ') || 'none'})`
  const st = scoutState.get(s.name)
  if (st) await pausedNow($, st)
  const cur = await load($)
  const why = scoutWhyNot(st ?? { name: s.name, running: false }, { driving: S.driving, gitOk: S.gitState === 'ok', mode: modeOf(cur), on: symccOn(cur), plan: inPlan(S.plan) }, S.N.name)
  if (why) return why
  return (await runScout($, s)) || `scout ${s.name} started`
}

/** A scout file's text, or null when there is none (or it can't be read). */
export async function readScoutFile($: $, scout: string): Promise<string | null> {
  const rel = safeScoutFile(scout, S.N.name)
  if (rel === null) return null
  const file = path(rel)
  return (await $.fs.exists(file).catch(() => false)) ? await $.fs.read(file).catch(() => null) : null
}

/** Opens the panel's edit mode for scout `sc`, filled from its file (or from what the panel knows). */
export async function editScout($: $, sc: SymccScout) {
  const text = await readScoutFile($, sc.name)
  const def = text === null ? null : parseScout(sc.name, text)
  S.draft = { scout: sc.name, isNew: false, every: def?.bad_every ?? String(def?.every_minutes ?? sc.every_minutes), model: def?.model ?? sc.model ?? '', summary: def?.summary ?? sc.summary ?? '', body: def?.prompt ?? sc.prompt ?? '', error: '' }
  $.ui.invalidate('ui.render')
}

/** Starts a new scout named as typed: refused when the name is bad or taken; else opens the edit mode. */
export async function newScout($: $, name: string, shown: string[] = []) {
  const s = name.trim()
  const have = [...shown, ...scoutState.keys(), ...(await loadScouts($).catch(() => [] as ScoutDef[])).map(d => d.name)]
  let err = scoutNameError(s, have)
  if (!err && (await readScoutFile($, s)) !== null) err = `a scout named ${s} already exists`
  if (err) {
    S.naming = { name: s, error: err }
  } else {
    S.naming = null
    S.draft = { scout: s, isNew: true, every: '60', model: '', summary: '', body: '', error: '' }
  }
  $.ui.invalidate('ui.render')
}

/** Saves the edit mode to .<name>/scouts/<scout>.md, keeping the other front matter keys, and reloads the scouts. */
export async function saveScout($: $) {
  const d = S.draft
  if (!d) return
  const err = scoutDraftError(d)
  if (err) {
    d.error = err
    $.ui.invalidate('ui.render')
    return
  }
  const rel = safeScoutFile(d.scout, S.N.name)
  if (rel === null) {
    d.error = scoutFileNameError(d.scout)
    $.ui.invalidate('ui.render')
    return
  }
  const old = await readScoutFile($, d.scout)
  if (d.isNew && old !== null) {
    d.error = `a scout named ${d.scout} already exists`
    $.ui.invalidate('ui.render')
    return
  }
  const text = scoutText(old, { every_minutes: everyMinutesOf(d.every)!, model: d.model, summary: d.summary }, d.body)
  await $.process.run(['mkdir', '-p', path(S.N.scouts)])
  await $.fs.write(path(rel), text)
  S.draft = null
  // The same path as a Write to a scout file: reschedule, so the new timing applies now.
  await scheduleScouts($)
  await publish($, await load($))
  await updateScoutOpen($, () => d.scout)
  $.ui.toast(S.N.toast(`saved ${scoutFile(d.scout, S.N.name)}`))
  $.ui.invalidate('ui.render')
}

/** What the lead's scouts tool gets: action (list by default), name, every_minutes, model, prompt. */
export type LeadScoutInput = { action?: unknown; name?: unknown; every_minutes?: unknown; model?: unknown; prompt?: unknown }

/** every_minutes as the lead gave it (a whole number, 0 or more), or null. */
const leadEvery = (v: unknown): number | null => (typeof v === 'number' ? (Number.isSafeInteger(v) && v >= 0 ? v : null) : typeof v === 'string' ? everyMinutesOf(v) : null)

/**
 * The lead's scouts tool: list (default; with name, one scout in full), add, edit, remove, run.
 * add and edit write .<name>/scouts/<scout>.md like the panel's editor; add, edit and remove reschedule the
 * scouts so the board shows the change at once. run is the owner's "run now". Pause and resume are refused:
 * only the owner does those.
 */
export async function leadScouts($: $, a: LeadScoutInput): Promise<string> {
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
  const defs = await scheduleScouts($)
  const have = () => `have: ${defs.map(d => d.name).join(', ') || 'none'}`
  const known = defs.some(d => d.name === name)
  if (action === 'list') {
    if (!name) return leadScoutsText([...scoutState.values()], Date.now(), S.N.scouts)
    const st = scoutState.get(name)
    if (!st || !known) return `no scout named ${name} (${have()})`
    await pausedNow($, st).catch(() => undefined)
    return leadScoutText(st, Date.now(), true)
  }
  if (action === 'run') {
    if (!name) return 'say which scout to run (name)'
    return runScoutNow($, name)
  }
  if (action !== 'add' && action !== 'edit' && action !== 'remove') return `unknown action "${action}": use list, add, edit, remove or run`
  // The name was checked above (add: leadScoutNameError, a stricter rule; edit and remove: safeScoutFile), so this is a file.
  const file = safeScoutFile(name, S.N.name)!
  const old = await readScoutFile($, name)
  if (action === 'remove') {
    if (old === null && !known) return `no scout named ${name} (${have()})`
    // An argument list (no shell), with "--" so the path can never be read as an option.
    const r = await $.process.run(['rm', '-f', '--', path(file)])
    if (r.exitCode !== 0) return `could not remove ${file}: ${r.stderr || r.stdout || `exit ${r.exitCode}`}`
    await scheduleScouts($)
    await publish($, await load($))
    $.ui.invalidate('ui.render')
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
  await $.process.run(['mkdir', '-p', path(S.N.scouts)])
  await $.fs.write(path(file), scoutText(old, { every_minutes: every, model }, prompt))
  await scheduleScouts($)
  await publish($, await load($))
  $.ui.invalidate('ui.render')
  return `${action === 'add' ? 'added' : 'saved'} scout ${name} (${file}): runs ${everyText(every)}${model ? `, model ${model}` : ''}`
}

/** Leaves the edit mode (and the new scout name box) without saving. */
export function cancelScoutEdit($: $) {
  S.draft = null
  S.naming = null
  $.ui.invalidate('ui.render')
}

/**
 * Which of the plugin's folders a tool call writes, edits or deletes in: the scouts folder
 * (`scouts`, e.g. ".symcc/scouts") and/or the roles folder (`roles`, e.g. ".symcc/roles").
 * The tool's arguments sit beside `tool` in the call (`e.file_path` for Write, Edit and MultiEdit,
 * `e.command` for Bash). For Bash only commands that can change files count (rm, mv, cp, a redirect, ...),
 * so reading a scout file with cat doesn't start the timers over.
 */
export function fileToolHits(e: Record<string, unknown>, scouts: string, roles: string): { scouts: boolean; roles: boolean } {
  const tool = String(e.tool ?? '')
  const inDir = (text: string, dir: string, needSlash: boolean) => text.replace(/\\/g, '/').includes(needSlash ? `${dir}/` : dir)
  if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit') {
    const p = String(e.file_path ?? '')
    return { scouts: inDir(p, scouts, true), roles: inDir(p, roles, true) }
  }
  if (tool === 'Bash') {
    const c = String(e.command ?? '')
    if (!/(^|[\s;&|(])(rm|mv|cp|unlink|touch|tee|sed\s+-i|git\s+(rm|mv|checkout|restore))\b|>/.test(c)) return { scouts: false, roles: false }
    return { scouts: inDir(c, scouts, false), roles: inDir(c, roles, false) }
  }
  return { scouts: false, roles: false }
}
