// symcc (the name comes from plugin.json, see hooks/name.ts): a shared task board, the main chat as its lead, workers that build tasks in
// parallel in their own Git worktrees and merge what passes the tests, and scouts you
// define in .<name>/scouts/*.md that do what their file asks on a timer.
//
// How work flows:
//   you ⇄ lead (the main chat)  ──board tools──▶  .<name>/board.json
//   a task is ready  ──▶  worktree + background worker subagent
//   worker done      ──▶  commit · scope check · tests · merge into main  ──▶  the lead is told
//   scout on a timer ──▶  report    ──▶  the lead is told and decides what goes on the board
//
// This file holds symcc's entry points: what a host calls when something happens (the session starts or ends, the owner types a
// prompt, a tool is called or checked, an agent's run ends, a slash command runs, a timer goes off). Each takes a
// Host (hooks/host.ts) and plain values in symcc's words, and answers plain values, so Claude Code's wiring
// (hooks/register.tsx) and another host (an OpenCode plugin, a standalone app) call the same code. Nothing here
// imports 'claude-code'; what is only Claude Code's (its event shapes, agent types, plan mode events, the panel's
// render hooks) stays in register.tsx and hooks/claude/.
//
// Before calling an entry point, the host calls useName (plugin/state.ts) with its plugin name, so S.N is right.
import { LEAD_BEAT_MS, openOnStart, symccOn, offAnswer, commandNames, parseCommand, modeOf, settingsText, notifyOf, find, STATUS_WORD, statText, cutDiff, everyText, intoOf, ASK_TOOL, guardReason } from '../board'
import type { Host } from '../host'
import type { SymccTokens } from '../../types'
import { findArchived, saveArchiveMigrated } from '../plugin/archive'
import { askCall, checkEdit, guardFailed } from '../plugin/ask'
import { gitReady } from '../plugin/git'
import { claimLead, publish, handOver, releaseLead } from '../plugin/lead'
import { changedFiles, changesText } from '../plugin/review'
import { loadRoles } from '../plugin/roles'
import { loadKinds } from '../plugin/kinds'
import { checkerFinished } from '../plugin/checker'
import { fileToolHits, saveScoutsMigrated, scheduleScouts, seedExampleScouts, scoutFinished, runScoutNow, setScoutPaused, unreadableScoutsText } from '../plugin/scouts'
import { S, timers, heard, stopped, workers, scoutRuns, checkerRuns, scoutState } from '../plugin/state'
import { path, load, isOn, now, saveMigrated, startWait, findRoot, startingText } from '../plugin/store'
import { noteForLead, brief } from '../plugin/tell'
import { playable } from '../plugin/voice'
import { TOOLS, leadGuide, runTool, type In, manual, ownerSettings, taskText, latestReport, statsText } from '../plugin/tools'
import { openPane } from '../plugin/ui/open'
import { cleanLeftoverTmp, check, pump, workerFinished, lateHandBack, stoppedHandBack, setSymcc, setBoardMode, type TurnEnd } from '../plugin/workers'

/** What /symcc and /symcc-tasks answer after opening the board. No Esc hint: Esc doesn't reach the panel (T-158). */
export const BOARD_OPENED = 'Board opened: ↑↓ to move, Enter to open, f to search, t tasks, s scouts, c settings. (ctrl+x tab goes back to it.)'

/** symcc's slash commands, for the host to register: name, description and the hint for its arguments. */
export function COMMANDS(): { name: string; description: string; argumentHint?: string }[] {
  return [
    { name: S.N.name, description: `Open the ${S.N.name} board panel: tasks and scouts` },
    { name: `${S.N.name}-tasks`, description: `Open the ${S.N.name} board panel on the tasks view` },
    { name: `${S.N.name}-scouts`, description: `Open the ${S.N.name} board panel on the scouts view and reload the scout files` },
    { name: `${S.N.name}-task`, description: `Open one ${S.N.name} task: /${S.N.name}-task T-3`, argumentHint: '<T-id>' },
    { name: `${S.N.name}-approve`, description: `Approve a ${S.N.name} task that is ready for review (merge it): /${S.N.name}-approve T-5`, argumentHint: '<T-id>' },
    { name: `${S.N.name}-reject`, description: `Reject a ${S.N.name} task in review, with the reason: /${S.N.name}-reject T-5 <reason>`, argumentHint: '<T-id> <reason>' },
    { name: `${S.N.name}-diff`, description: `Show what a ${S.N.name} task in review changed, or one file's diff: /${S.N.name}-diff T-5 [file]`, argumentHint: '<T-id> [file]' },
    { name: `${S.N.name}-scout`, description: `Run a ${S.N.name} scout now (/${S.N.name}-scout <name>), or pause or resume it (/${S.N.name}-scout <name> pause|resume)`, argumentHint: '<name> [pause|resume]' },
    { name: `${S.N.name}-mode`, description: `Set the ${S.N.name} board mode: off (nothing runs), review (finished work waits for you) or auto (it merges on its own); no word switches review and auto`, argumentHint: '[off|review|auto]' },
    { name: `${S.N.name}-settings`, description: `See and change the ${S.N.name} settings: /${S.N.name}-settings opens them; /${S.N.name}-settings max_parallel 5 sets one`, argumentHint: '[name value]' },
    { name: `${S.N.name}-stats`, description: `Show ${S.N.name} time and token stats: the whole team (lead, workers, scouts), totals, averages per task and per try, outcomes, by role, origin and day, with bar charts: /${S.N.name}-stats [full] [7d|T-100..T-130]`, argumentHint: '[full] [7d|T-1..T-9]' },
    { name: `${S.N.name}-off`, description: `Turn ${S.N.name} off for this project: Claude works as normal, nothing runs; the board is kept` },
    { name: `${S.N.name}-on`, description: `Turn ${S.N.name} back on for this project, in the mode the board had` },
    { name: S.N.help, description: `Show the ${S.N.name} manual: how the board, lead, workers and scouts work, and every command`, argumentHint: '[topic]' },
  ]
}

// ---------------- session ----------------

/** Counts sessionStart runs, so a late claimLead of an earlier start doesn't end a newer one's wait. */
let starts = 0

/**
 * The session is starting: no work starts until sessionStart has finished. Call it first, then register the host's
 * agent types, tools and commands (a pump started meanwhile, e.g. by a lead tool call, must find the worker type),
 * then call sessionStart.
 */
export function sessionStarting() {
  S.startupDone = false
}

/** The watchdog's timer went off (every 2 minutes): look for stuck workers and tasks. */
export function watchdogTick(host: Host) {
  void check(host).catch(() => undefined)
}

/** The lead heartbeat's timer went off: the driver refreshes its heartbeat; the others look whether it went stale and take over. */
export function leadBeat(host: Host) {
  void claimLead(host)
    .then(async d => (d ? pump(host) : undefined))
    .catch(() => undefined)
}

/**
 * The session started (after sessionStarting and the host's registration): learns the project, migrates old files,
 * claims the lead, loads scouts, roles and kinds, starts the timers and opens the board panel.
 */
export async function sessionStart(host: Host) {
  // claimLead may wait on the clock: for the board lock (up to 5 s), for old workers it stopped
  // to end (up to ORPHAN_WAIT_MS, 20 s) and for the reload settle (2 s). A hook has 10 s and
  // clock waits count against it, so session start doesn't wait for those: once claimLead is
  // about to wait (startWait.mark), the rest of the start goes on and claimLead finishes on its
  // own. S.startupDone stays false until claimLead has finished, so pump starts no work before
  // old tasks went back to "todo". When nothing waits, all of it runs in order as before.
  const run = ++starts
  let leadDone = true
  let lead: Promise<unknown> = Promise.resolve()
  // Even if a later step throws, pump must not stay blocked for the whole session.
  try {
    S.root = (await host.session.repo())?.root ?? (await host.session.root())
    S.home = (await host.env.get('HOME').catch(() => undefined)) ?? ''
    S.me = await host.session.id().catch(() => `session-${Math.random().toString(36).slice(2, 10)}`)
    // An older board is saved once in the current shape (before anything else saves it), with a copy as it was;
    // so are archive.json and scouts.json (tokens saved as one number become "unsplit").
    await saveMigrated(host).catch(() => undefined)
    await saveArchiveMigrated(host).catch(() => undefined)
    await saveScoutsMigrated(host).catch(() => undefined)
    // Become the driver if nobody drives the board. As the driver, old workers still running
    // from before a reload are stopped first and their tasks go back to "todo".
    const waits = new Promise<void>(r => (startWait.mark = r))
    leadDone = false
    lead = claimLead(host, true)
      .catch(() => (S.driving = false))
      .finally(() => (leadDone = true))
    await Promise.race([lead, waits])
    startWait.mark = null
    if (!(await host.fs.exists(path(S.N.boardFile)))) await publish(host, await load(host))
    // A new project (no scouts folder yet) gets the plugin's example scouts, all paused (no timer runs them; run now still does); never stops the start.
    await seedExampleScouts(host).catch(() => undefined)
    await scheduleScouts(host).catch(() => undefined)
    await loadRoles(host).catch(() => undefined)
    await loadKinds(host).catch(() => undefined)
    await cleanLeftoverTmp(host).catch(() => undefined)
    S.watchdog?.cancel()
    S.watchdog = host.clock.every(2 * 60_000, () => watchdogTick(host))
    S.beat?.cancel()
    S.beat = host.clock.every(LEAD_BEAT_MS, () => leadBeat(host))
    // A board.json that can't be read: load already kept a copy and told the owner (once); nothing
    // more happens now and board.json is left as it is. The heartbeat's pump starts work once it is fixed.
    const b = await load(host).catch(() => null)
    if (b) {
      // Look at git once now: with no git, no repo or no commit, the lead is told (once) and nothing starts.
      await gitReady(host, b).catch(() => undefined)
      await publish(host, b)
      // Open the board panel by itself (every session, driver or not), without taking the cursor
      // from the prompt. On a narrow terminal Claude Code may not place it (isPlaced: false);
      // that is fine: the band above the prompt and /<name> still work.
      if (openOnStart(b) && symccOn(b)) await openPane(host, { focus: false, quiet: true })
    }
  } finally {
    startWait.mark = null
    const done = () => {
      if (run !== starts) return
      S.startupDone = true
      void pump(host).catch(() => undefined)
    }
    if (leadDone) done()
    else void lead.then(done)
  }
}

/**
 * The chat was cleared (Claude Code's /clear): the session ends but the process goes on under a new session id, and
 * no session start follows: the timers, workers and scouts are kept, and the lead is handed over to the new id.
 */
export async function sessionCleared(host: Host) {
  await handOver(host).catch(() => undefined)
}

/** The session ends: the timers stop and the lead is let go. */
export async function sessionEnd(host: Host) {
  for (const t of timers.splice(0)) t.cancel()
  S.watchdog?.cancel()
  S.watchdog = null
  S.beat?.cancel()
  S.beat = null
  await releaseLead(host)
}

// ---------------- the lead's prompt ----------------

/** The lead's guide, for the host to add to the lead's system prompt; undefined: add nothing (symcc is off, or the project is not known yet). */
export async function leadGuideText(host: Host): Promise<string | undefined> {
  // Before session start set the project folder (a plugin reload): learn it first; unknown, add nothing.
  if (!(await findRoot(host))) return undefined
  // Read on every call, so /<name>-off and /<name>-on count from the next message.
  if (!(await isOn(host))) return undefined
  return leadGuide()
}

/**
 * The owner typed a prompt (at the terminal or from the phone/web bridge; not a slash command, a hidden prompt or
 * symcc's own board update). It is kept, so a task added after it can point back to the request.
 */
export function ownerTyped(text: string) {
  if (text.trim()) heard.owner = { text: text.trim().slice(0, 2000), at: now() }
}

// ---------------- tools ----------------

let names: string[] | null = null
/** The names of the lead's tools (without the host's prefix, see S.N.tool). */
const toolNames = () => (names ??= TOOLS().map(t => t.name))

/** Whether `tool` (the name the host calls it by) is one of symcc's own: the lead's tools or the workers' question tool. */
export function isSymccTool(tool: string): boolean {
  return tool === S.N.tool(ASK_TOOL) || toolNames().some(t => tool === S.N.tool(t))
}

/**
 * A tool is called (by the lead or by one of symcc's agents). Answers a refusal (`deny`) or symcc's tool's answer
 * (`result`); null: not symcc's call, the host runs it as usual and then calls otherToolDone.
 * A worker or scout symcc stopped can't do anything more, so every tool it tries is refused; the lead's own tools
 * and the workers' question tool (it knows the calling worker from `agentId`) run here.
 */
export async function toolCall(host: Host, tool: string, agentId: string | undefined, input: Record<string, unknown>): Promise<{ deny: string } | { result: string } | null> {
  if (agentId && stopped.has(agentId)) return { deny: `${S.N.name} stopped this agent. Do nothing more; answer "stopped" and end.` }
  if (tool === S.N.tool(ASK_TOOL)) {
    if (!(await findRoot(host))) return { result: startingText() }
    return { result: await askCall(host, agentId, input).catch((err: Error) => `error: ${err.message}`) }
  }
  const name = toolNames().find(t => tool === S.N.tool(t))
  if (!name) return null
  // Before session start set the project folder (e.g. right after a plugin reload), learn it from the
  // session; if it still isn't known, answer and write nothing (never a board or lock path from "/").
  if (!(await findRoot(host))) return { result: startingText() }
  if (!(await isOn(host))) return { result: offAnswer(S.N.name) }
  try {
    return { result: await runTool(host, name, input as In) }
  } catch (err) {
    return { result: `error: ${(err as Error).message}` }
  }
}

/**
 * A tool that is not symcc's ran (`call`: the tool's name as `tool`, and its input fields). Writing, editing or
 * deleting a scout file reschedules the scouts, a role file reloads the roles, and the board is published again.
 * Runs in the background.
 */
export function otherToolDone(host: Host, call: Record<string, unknown>) {
  const hit = fileToolHits(call, S.N.scouts, `${S.N.dir}/roles`)
  if (!hit.scouts && !hit.roles) return
  void (async () => {
    // before session start (a plugin reload): learn the project folder first; unknown, change nothing
    if (!(await findRoot(host))) return
    if (hit.scouts) await scheduleScouts(host)
    if (hit.roles) await loadRoles(host).catch(() => undefined)
    await publish(host, await load(host))
  })().catch(() => undefined)
}

/**
 * symcc's tool call handling threw or ran out of time, before the call was passed on. One of symcc's own agents is
 * refused (never let through unchecked); the lead's call of a symcc tool gets the error; null: any other call of the
 * lead goes on as if symcc were not there (see guardFailed).
 */
export function toolCallFailed(host: Host, tool: string, agentId: string | undefined, error: { kind?: string; message?: string } | undefined): { deny: string } | { result: string } | null {
  const deny = guardFailed(host, 'tool.call', agentId, error)
  if (deny) return { deny }
  return isSymccTool(tool) ? { result: `error: ${S.N.name} couldn't run this tool: ${guardReason(error?.kind, error?.message)}` } : null
}

/**
 * A tool is about to run: answers why it is refused, or undefined to decide as usual. A worker's edit outside its
 * change task's files is refused, and the path is recorded as a request to the owner; an edit or shell command
 * reaching the owner's copy outside the worker's folder is refused (see checkEdit). `cwd` is the calling agent's
 * own folder, when the host knows it. An error is not swallowed: the host then calls toolCheckFailed.
 */
export async function toolCheck(host: Host, agentId: string | undefined, tool: string, input: unknown, cwd?: string): Promise<string | undefined> {
  return agentId ? await checkEdit(host, agentId, tool, input, cwd) : undefined
}

/** toolCheck threw or ran out of time: a worker's, checker's or scout's call is refused (the reason), the lead's goes on (undefined). */
export function toolCheckFailed(host: Host, agentId: string | undefined, error: { kind?: string; message?: string } | undefined): string | undefined {
  return guardFailed(host, 'tool.check', agentId, error)
}

// ---------------- agents ----------------

/** How an agent's run ended: its final answer, why (`end`), whether it was cut off, and the tokens it used. */
export type AgentRunEnd = { answer: string; end: TurnEnd; isAborted: boolean; tokens: SymccTokens | undefined }

/** An agent's run ended (a worker, scout or checker of symcc's, or one this copy lost track of in a reload); other agents are left alone. */
export function agentFinished(host: Host, agentId: string | undefined, run: AgentRunEnd) {
  const { answer, end, isAborted, tokens } = run
  if (agentId && workers.has(agentId)) void workerFinished(host, agentId, answer, end, tokens)
  else if (agentId && scoutRuns.has(agentId)) void scoutFinished(host, agentId, answer, isAborted, tokens)
  // a checker's verdict (the checker setting) goes to the finish step waiting for it
  else if (agentId && checkerRuns.has(agentId)) checkerFinished(agentId, answer, isAborted || end.reason === 'aborted', tokens)
  // a report from a worker this copy lost track of in a reload: still taken when its task waits for it
  // (a worker this copy stopped, e.g. an orphan after a reload: its task is put back to "todo" at once instead)
  else if (agentId) void lateHandBack(host, agentId).then(ok => (ok ? workerFinished(host, agentId, answer, end, tokens) : stoppedHandBack(host, agentId))).catch(() => undefined)
}

// ---------------- commands ----------------

/** What a slash command answers: its text, and whether it is only shown to the owner (not given to the lead). */
export type CommandAnswer = { text: string; isTextDisplayOnly?: true }

/**
 * A slash command runs (`command` without the slash, and its arguments). Every one of symcc's starts with its name
 * (see parseCommand): /<name> opens the panel, /<name>-<word> does one thing. null: not symcc's, the host runs it.
 */
export async function runCommand(host: Host, command: string, args: string): Promise<CommandAnswer | null> {
  const isStats = command === `${S.N.name}-stats`
  if (!isStats && !commandNames(S.N.name).includes(command)) return null
  // Before session start set the project folder (a plugin reload): learn it from the session first;
  // if it still isn't known, answer and write nothing (never a board or lock path from "/").
  if (!(await findRoot(host))) return { text: startingText(), isTextDisplayOnly: true }
  // /<name>-stats: a read-only text report (see statsText); it changes nothing on the board.
  if (isStats) return { text: await statsText(host, args ?? '').catch((err: Error) => `Could not build the stats: ${err.message}`), isTextDisplayOnly: true }
  // A broken board.json makes load throw (it is never written over): the commands that don't need the
  // board (help, opening the panel, a usage line) still work; the others answer with the reason.
  const loaded = await load(host).then(
    board => ({ board, broken: '' }),
    (err: Error) => ({ board: null, broken: err.message }),
  )
  const cmd = parseCommand(command, args, loaded.board ? modeOf(loaded.board) : undefined, S.N.name)
  if (!cmd) return null
  const say = (text: string) => ({ text, isTextDisplayOnly: true as const })
  if (!loaded.board && !['bad', 'help', 'open', 'tasks'].includes(cmd.kind)) return say(`${loaded.broken} Then try again.`)
  const b = loaded.board!
  switch (cmd.kind) {
    case 'bad':
      return say(cmd.message)
    case 'help':
      return say(manual(cmd.topic))
    case 'open':
    case 'tasks':
      await openPane(host, cmd.kind === 'tasks' ? { tab: 'tasks' } : {})
      return say(BOARD_OPENED)
    case 'scouts': {
      const defs = await scheduleScouts(host)
      await publish(host, await load(host))
      // Open the panel on the Scouts view; the text list below is the fallback when it can't be placed.
      const placed = await openPane(host, { tab: 'scouts' }).then(r => r?.isPlaced ?? false).catch(() => false)
      const skipped = unreadableScoutsText()
      const withSkipped = (text: string) => (skipped ? `${text}\n${skipped}` : text)
      if (placed) return say(withSkipped(`Scouts opened: Enter opens a scout, t tasks, b goes back to the tasks.`))
      if (!defs.length && skipped) return { text: skipped }
      if (!defs.length) return { text: `No scouts yet. Add one as ${S.N.scouts}/<name>.md:\n---\nevery_minutes: 30\n---\nLook for missing tests around risky code.` }
      return { text: defs.map(d => `${d.name}: ${everyText(d.every_minutes)}${d.warning ? ` (${d.warning})` : ''}${scoutState.get(d.name)?.last_run ? `, last ran ${scoutState.get(d.name)!.last_run!.slice(11, 16)}` : ''}${scoutState.get(d.name)?.running ? ' (running now)' : ''}${scoutState.get(d.name)?.paused ? ' (paused)' : ''}`).join('\n') + (skipped ? `\n${skipped}` : '') }
    }
    case 'scout':
      return { text: await runScoutNow(host, cmd.name) }
    case 'scout-pause':
      return say(await setScoutPaused(host, cmd.name, cmd.paused))
    case 'settings': {
      S.settingEdit = null
      S.settingPick = null
      const placed = await openPane(host, { tab: 'settings' }).then(r => r?.isPlaced ?? false).catch(() => false)
      if (placed) return say(`Settings opened: Enter on a row changes it, t tasks, s scouts, b goes back to the tasks.`)
      return say(settingsText({ ...b, notify: notifyOf(b, await playable(host)) }, S.N.name))
    }
    case 'set':
      return say(await ownerSettings(host, cmd.input, `with /${S.N.name}-settings`))
    case 'off':
    case 'on':
      return say(await setSymcc(host, cmd.kind === 'on'))
    case 'mode': {
      const r = await setBoardMode(host, cmd.mode, 'you')
      noteForLead(`The owner set the board mode to ${cmd.mode}: ${brief(r)}`)
      return say(r)
    }
    case 'show': {
      const t = find(b, cmd.id)
      if (!t) {
        // not on the board: it may have been moved to archive.json (read-only, shown as text)
        const old = await findArchived(host, cmd.id)
        if (!old) return say(`${cmd.id} is not on the board.`)
        return say(`${old.id} is archived (in ${S.N.archiveFile}; read-only).\n${taskText(old, false, b.tasks, undefined, b.archived_done)}`)
      }
      await openPane(host, { tab: 'tasks', task: t.id })
      return say(taskText(t, [...workers.values()].some(w => w.task === t.id), b.tasks, await latestReport(host, t), b.archived_done))
    }
    case 'approve':
    case 'reject': {
      const t = find(b, cmd.id)
      if (!t) return say((await findArchived(host, cmd.id)) ? `${cmd.id} is archived.` : `${cmd.id} is not on the board.`)
      if (t.status !== 'review') return say(`${t.id} is not ready for review (it is ${STATUS_WORD[t.status]}).`)
      const r = await runTool(host, cmd.kind, cmd.kind === 'reject' ? { task: t.id, reason: cmd.reason } : { task: t.id }).catch((err: Error) => `error: ${err.message}`)
      noteForLead(cmd.kind === 'approve' ? `The owner approved ${t.id}: ${brief(r)}` : `The owner rejected ${t.id} ("${brief(cmd.reason)}"): ${brief(r)}`)
      return say(r)
    }
    case 'diff': {
      const t = find(b, cmd.id)
      if (!t) return say((await findArchived(host, cmd.id)) ? `${cmd.id} is archived.` : `${cmd.id} is not on the board.`)
      if (t.status !== 'review') return say(`${t.id} is not ready for review (it is ${STATUS_WORD[t.status]}); /${S.N.name}-diff shows the changes of a task in review.`)
      try {
        const files = await changedFiles(host, intoOf(t), t)
        if (!cmd.file) return say(statText(t.id, files, S.N.name))
        const f = cmd.file.replace(/^\.\//, '')
        if (!files.some(x => x.file === f)) return say(`${t.id} did not change ${f}. Changed: ${files.map(x => x.file).join(', ') || 'nothing'}`)
        const text = await changesText(host, intoOf(t), t, f)
        return say(cutDiff(text, t.id, 5000, f, S.N.name).join('\n') || `${f}: no text changes (binary?)`)
      } catch (err) {
        return say(`Could not read the changes of ${t.id}: ${(err as Error).message}`)
      }
    }
  }
  return null
}
