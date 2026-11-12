import type { SymccScout } from '../../types'
import { type ScoutDef, parseScout, scoutMayRun, modeOf, symccOn, OPEN, scoutPrompt, recentClosed, scoutAgentName, scoutDescription, parseScoutMemory, scoutMemoryText, scoutPausedText, everyText, SCOUT_REPORT_CHARS, scoutLeadMessage, scoutPausedAnswer, offAnswer, scoutFile, scoutNameError, scoutDraftError, scoutText, everyMinutesOf, onDemand } from '../board'
import { publish } from './lead'
import { type $, S, scoutState, scoutRuns, heard, timers, updateScoutOpen } from './state'
import { path, load, now } from './store'
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

export async function runScout($: $, s: ScoutDef) {
  const st = scoutState.get(s.name)
  if (!st) return
  // scouts.json is where a pause is kept (any session may pause one): a paused scout doesn't run
  if (!st.running) await pausedNow($, st)
  const b = await load($)
  if (!scoutMayRun(st, { driving: S.driving, gitOk: S.gitState === 'ok', mode: modeOf(b), on: symccOn(b) })) return
  const lastRun = st.last_run
  const lastReport = st.last_report
  st.running = true
  st.last_run = now()
  await publish($, b)
  const open = b.tasks.filter(t => OPEN.includes(t.status) || t.status === 'backlog').map(t => `${t.id} ${t.title}${t.status === 'backlog' ? ' (backlog)' : ''}`)
  const prompt = scoutPrompt({ scout: s.name, root: S.root, instructions: s.prompt, open, closed: recentClosed(b.tasks), lastReport, lastRun, name: S.N.name })
  const spawned = await $.agent.spawn({ prompt, name: scoutAgentName(S.N.name, s.name), description: scoutDescription(s.name, s.prompt), subagentType: S.N.scout, ...(s.model ? { model: s.model } : {}) }).catch((e: Error) => ({ deny: e.message }))
  const agentId = 'agentId' in spawned ? spawned.agentId : undefined
  if (!agentId) {
    st.running = false
    await publish($, await load($))
    return
  }
  scoutRuns.set(agentId, s.name)
}

/** <dir>/scouts.json: each scout's last run time and last report, so a restart doesn't make it "first run" again. */
export const scoutMemoryFile = () => path(`${S.N.dir}/scouts.json`)

/** The saved scout memory; a missing or broken file counts as "no scout has run yet". */
export async function loadScoutMemory($: $) {
  const text = await $.fs.read(scoutMemoryFile()).catch(() => null)
  return parseScoutMemory(text)
}

/** Writes scouts.json (temp file + rename, like board.json). */
export async function writeScoutMemory($: $, text: string) {
  const file = scoutMemoryFile()
  const tmp = `${file}.tmp`
  await $.process.run(['mkdir', '-p', path(S.N.dir)])
  await $.fs.write(tmp, text)
  const r = await $.process.run(['mv', '-f', tmp, file])
  if (r.exitCode !== 0) throw new Error(`couldn't save ${S.N.dir}/scouts.json: ${(r.stderr || r.stdout).trim().slice(0, 200)}`)
}

/** Saves the scouts in scoutState; scouts no longer in scouts/ are dropped. Whether each is paused is taken from
 *  the file first, since the owner may have paused or resumed one from another session. */
export async function saveScoutMemory($: $) {
  const saved = await loadScoutMemory($)
  for (const st of scoutState.values()) st.paused = saved[st.name]?.paused === true
  await writeScoutMemory($, scoutMemoryText(scoutState.values()))
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
 * stopped: it finishes and reports, and the next one doesn't start.
 */
export async function setScoutPaused($: $, name: string, paused: boolean): Promise<string> {
  const defs = await scheduleScouts($)
  const st = scoutState.get(name)
  if (!st || !defs.some(d => d.name === name)) return `no scout named ${name} (have: ${defs.map(d => d.name).join(', ') || 'none'})`
  const saved = await loadScoutMemory($)
  if ((saved[name]?.paused === true) === paused) {
    st.paused = paused
    return paused ? `${name} is already paused; resume it with p on its page or /${S.N.name}-scout ${name} resume` : `${name} is not paused`
  }
  await writeScoutMemory($, scoutPausedText(saved, name, paused))
  st.paused = paused
  await publish($, await load($))
  $.ui.invalidate('ui.render')
  if (!paused) return onDemand(st) ? `${name} resumed: it runs only on demand (run now, or /${S.N.name}-scout ${name})` : `${name} resumed: it runs ${everyText(st.every_minutes)} again`
  return `${name} paused: it doesn't run until you resume it${st.running ? ' (the run going now finishes first)' : ''}`
}

export async function scoutFinished($: $, agentId: string, answer: string) {
  const name = scoutRuns.get(agentId)!
  scoutRuns.delete(agentId)
  const st = scoutState.get(name)
  if (st) {
    st.running = false
    st.last_report = answer.trim().slice(0, SCOUT_REPORT_CHARS)
    await saveScoutMemory($).catch((e: Error) => tellLead($, `Note: scout ${name}'s last run was not saved (${e.message}); after a restart it will start as a first run.`))
  }
  await publish($, await load($))
  const msg = scoutLeadMessage(name, answer, undefined, st?.paused === true)
  if (msg) {
    const at = now()
    heard.scouts[name] = at
    heard.last = { what: `scout ${name} report`, at }
    tellLead($, msg)
  }
}

export async function scheduleScouts($: $) {
  for (const t of timers.splice(0)) t.cancel()
  const defs = await loadScouts($)
  for (const k of [...scoutState.keys()]) if (!defs.some(d => d.name === k)) scoutState.delete(k)
  // after a restart the map is empty: take each scout's last run and report from scouts.json
  const saved = defs.some(d => !scoutState.has(d.name)) ? await loadScoutMemory($) : {}
  for (const s of defs) {
    const old: Pick<SymccScout, 'last_run' | 'running' | 'last_report' | 'paused'> | undefined = scoutState.get(s.name) ?? (saved[s.name] ? { ...saved[s.name]!, running: false } : undefined)
    const ms = s.every_minutes * 60_000
    const timed = !onDemand(s)
    const st: SymccScout = { name: s.name, every_minutes: s.every_minutes, last_run: old?.last_run ?? null, running: old?.running ?? false, prompt: s.prompt }
    if (timed) st.next_run = new Date(Date.now() + ms).toISOString()
    if (s.model) st.model = s.model
    if (s.warning) st.warning = s.warning
    if (old?.last_report !== undefined) st.last_report = old.last_report
    if (old?.paused) st.paused = true
    scoutState.set(s.name, st)
    // every_minutes 0 (or a bad value): only on demand, so no timer
    if (!timed) continue
    timers.push(
      $.clock.every(ms, () => {
        st.next_run = new Date(Date.now() + ms).toISOString()
        void runScout($, s)
      }),
    )
  }
  return defs
}

/** Runs scout `name` now (/<name>-scout <scout>, or "run now" in the panel); says what happened. */
export async function runScoutNow($: $, name: string): Promise<string> {
  const defs = await scheduleScouts($)
  const s = defs.find(d => d.name === name)
  if (!s) return `no scout named ${name} (have: ${defs.map(d => d.name).join(', ') || 'none'})`
  const st = scoutState.get(s.name)
  if (st && (await pausedNow($, st))) return scoutPausedAnswer(s.name, S.N.name)
  if (!S.driving) return `scouts run in the session that drives the board; run /${S.N.name}-scout ${s.name} there`
  const cur = await load($)
  if (!symccOn(cur)) return offAnswer(S.N.name)
  if (modeOf(cur) === 'off') return `the board is off, so no scout runs; turn it on with /${S.N.name}-mode review or /${S.N.name}-mode auto`
  void runScout($, s)
  return `scout ${s.name} started`
}

/** A scout file's text, or null when there is none (or it can't be read). */
export async function readScoutFile($: $, scout: string): Promise<string | null> {
  const file = path(scoutFile(scout, S.N.name))
  return (await $.fs.exists(file).catch(() => false)) ? await $.fs.read(file).catch(() => null) : null
}

/** Opens the panel's edit mode for scout `sc`, filled from its file (or from what the panel knows). */
export async function editScout($: $, sc: SymccScout) {
  const text = await readScoutFile($, sc.name)
  const def = text === null ? null : parseScout(sc.name, text)
  S.draft = { scout: sc.name, isNew: false, every: def?.bad_every ?? String(def?.every_minutes ?? sc.every_minutes), model: def?.model ?? sc.model ?? '', body: def?.prompt ?? sc.prompt ?? '', error: '' }
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
    S.draft = { scout: s, isNew: true, every: '60', model: '', body: '', error: '' }
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
  const old = await readScoutFile($, d.scout)
  if (d.isNew && old !== null) {
    d.error = `a scout named ${d.scout} already exists`
    $.ui.invalidate('ui.render')
    return
  }
  const text = scoutText(old, { every_minutes: everyMinutesOf(d.every)!, model: d.model }, d.body)
  await $.process.run(['mkdir', '-p', path(S.N.scouts)])
  await $.fs.write(path(scoutFile(d.scout, S.N.name)), text)
  S.draft = null
  // The same path as a Write to a scout file: reschedule, so the new timing applies now.
  await scheduleScouts($)
  await publish($, await load($))
  await updateScoutOpen($, () => d.scout)
  $.ui.toast(S.N.toast(`saved ${scoutFile(d.scout, S.N.name)}`))
  $.ui.invalidate('ui.render')
}

/** Leaves the edit mode (and the new scout name box) without saving. */
export function cancelScoutEdit($: $) {
  S.draft = null
  S.naming = null
  $.ui.invalidate('ui.render')
}
