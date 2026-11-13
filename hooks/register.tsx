// symcc (the name comes from plugin.json, see name.ts): a shared task board, the main chat as its lead, workers that build tasks in
// parallel in their own Git worktrees and merge what passes the tests, and scouts you
// define in .<name>/scouts/*.md that do what their file asks on a timer.
//
// How work flows:
//   you ⇄ lead (the main chat)  ──board tools──▶  .<name>/board.json
//   a task is ready  ──▶  worktree + background worker subagent
//   worker done      ──▶  commit · scope check · tests · merge into main  ──▶  the lead is told
//   scout on a timer ──▶  report    ──▶  the lead is told and decides what goes on the board
//
// This file only wires up the hooks. The code lives in plugin/: state.ts (what the plugin holds
// while loaded), store.ts (board.json), lead.ts, tell.ts, voice.ts, git.ts, review.ts, workers.ts,
// roles.ts, scouts.ts, tools.ts (the lead's tools), and ui/ (the board panel and the band above the prompt).
import type { Register } from 'claude-code'
import { LEAD_BEAT_MS, openOnStart, symccOn, offAnswer, usageTokens, commandNames, parseCommand, modeOf, settingsText, find, STATUS_WORD, statText, cutDiff, everyText } from './board'
import { dataDir } from './name'
import { gitReady } from './plugin/git'
import { claimLead, publish, handOver, releaseLead } from './plugin/lead'
import { changedFiles, changesText } from './plugin/review'
import { loadRoles } from './plugin/roles'
import { scheduleScouts, scoutFinished, runScoutNow, setScoutPaused, cancelScoutEdit } from './plugin/scouts'
import { type $, S, useName, timers, heard, stopped, workers, scoutRuns, scoutState, readTab, readOpened, readScoutOpen, updateScoutOpen, openDays, changesCache, updateTab } from './plugin/state'
import { path, load, isOn, now } from './plugin/store'
import { tellLead } from './plugin/tell'
import { TOOLS, leadGuide, runTool, type In, manual, ownerSettings, taskText, latestReport } from './plugin/tools'
import { renderAbovePrompt } from './plugin/ui/above-prompt'
import { openPane } from './plugin/ui/open'
import { renderPane } from './plugin/ui/pane'
import { cleanLeftoverTmp, check, pump, workerFinished, setSymcc, setBoardMode } from './plugin/workers'

// ---------------- registration ----------------

/** Registers the worker and scout agent types, the lead's tools and the slash commands. Each one on its own: one failing doesn't stop the rest. */
export async function registerAll($: $) {
  const ok = (p: Promise<unknown>) => p.catch(() => undefined)
  await ok($.agent.register({
    name: 'worker',
    description: `${S.N.name} worker: builds one task from the ${S.N.name} board in its own worktree. Started by ${S.N.name} only.`,
    prompt: `You are a ${S.N.name} worker. You get exactly one task and the folder (your own copy of the project) to do it in. Do it there, keep the change small and inside the task's files, run the tests you were given, and finish with a one or two sentence summary.`,
    tools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'],
    background: true,
    permissionMode: 'acceptEdits',
  }))
  await ok($.agent.register({
    name: 'scout',
    description: `${S.N.name} scout: does what its scout file asks (reading the project, shell commands, the web) and reports to the lead. Started by ${S.N.name} only.`,
    prompt: `You are a ${S.N.name} scout. You do the job your scout file gives you, using the project, the shell and the web, and end with a short plain report (or exactly NOTHING). You never change, create or delete files in the project.`,
    tools: ['Read', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch'],
    background: true,
  }))
  for (const t of TOOLS()) await ok($.tool.register({ ...t, isDeferred: false }))
  for (const c of [
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
    { name: `${S.N.name}-off`, description: `Turn ${S.N.name} off for this project: Claude works as normal, nothing runs; the board is kept` },
    { name: `${S.N.name}-on`, description: `Turn ${S.N.name} back on for this project, in the mode the board had` },
    { name: S.N.help, description: `Show the ${S.N.name} manual: how the board, lead, workers and scouts work, and every command`, argumentHint: '[topic]' },
  ])
    await ok($.command.register(c))
}

export const register: Register = on => {
  // Every hook starts with useName($), so S.N (the plugin's name) is right everywhere.
  on('session.start', async ($, e, next) => {
    useName($)
    S.startupDone = false
    // Register the agent types, tools and commands first, before anything that can wait
    // (claimLead may wait for old workers to stop) or throw: a pump started meanwhile, e.g.
    // by a lead tool call, must find the worker type.
    await registerAll($)
    const result = await next(e)
    // Even if a later step throws, pump must not stay blocked for the whole session.
    try {
      S.root = (await $.session.repo())?.root ?? (await $.session.root())
      // After a rename the old board stays in the old folder: say so once, never move it.
      if (S.N.dir !== dataDir() && !(await $.fs.exists(path(S.N.dir))) && (await $.fs.exists(path(dataDir()))))
        $.ui.toast(S.N.toast(`the old board is in ${dataDir()}/; move it to ${S.N.dir}/ to keep it`))
      S.home = (await $.env.get('HOME').catch(() => undefined)) ?? ''
      S.me = await $.session.id().catch(() => `session-${Math.random().toString(36).slice(2, 10)}`)
      // Become the driver if nobody drives the board. As the driver, old workers still running
      // from before a reload are stopped first and their tasks go back to "todo".
      await claimLead($, true).catch(() => (S.driving = false))
      if (!(await $.fs.exists(path(S.N.boardFile)))) await publish($, await load($))
      await scheduleScouts($)
      await loadRoles($).catch(() => undefined)
      await cleanLeftoverTmp($).catch(() => undefined)
      S.watchdog?.cancel()
      S.watchdog = $.clock.every(2 * 60_000, () => void check($).catch(() => undefined))
      // The driver refreshes its heartbeat; the others look whether it went stale and take over.
      S.beat?.cancel()
      S.beat = $.clock.every(LEAD_BEAT_MS, () =>
        void claimLead($)
          .then(async d => (d ? pump($) : undefined))
          .catch(() => undefined),
      )
      const b = await load($)
      // Look at git once now: with no git, no repo or no commit, the lead is told (once) and nothing starts.
      await gitReady($, b).catch(() => undefined)
      await publish($, b)
      // Open the board panel by itself (every session, driver or not), without taking the cursor
      // from the prompt. On a narrow terminal Claude Code may not place it (isPlaced: false);
      // that is fine: the band above the prompt and /<name> still work.
      if (openOnStart(b) && symccOn(b)) await openPane($, { focus: false, quiet: true })
    } finally {
      S.startupDone = true
    }
    void pump($)
    return result
  })

  on('session.end', async ($, e, next) => {
    useName($)
    // /clear ends the session but the process goes on under a new session id, and no
    // session.start follows: keep the timers, workers and scouts, and hand over to the new id.
    if ((e as { reason?: string }).reason === 'clear') {
      const result = await next(e)
      await handOver($).catch(() => undefined)
      return result
    }
    for (const t of timers.splice(0)) t.cancel()
    S.watchdog?.cancel()
    S.watchdog = null
    S.beat?.cancel()
    S.beat = null
    await releaseLead($)
    return next(e)
  })

  // The lead's guide, appended to the system prompt.
  on('prompt.compose', async ($, e, next) => {
    useName($)
    const r = await next(e)
    // Read on every render (prompt.compose is not cached), so /<name>-off and /<name>-on count from the next message.
    if (!(await isOn($))) return r
    return { sections: [...r.sections, { id: `${S.N.name}:lead`, text: leadGuide(), scope: 'session' as const }] }
  })

  // Keep the owner's last typed prompt (at the terminal or from the phone/web bridge), so a task
  // added after it can point back to the request. Slash commands, hidden prompts and the plugin's
  // own "[name] Board update" messages are not the owner's request and are left out.
  on('prompt.submit', async ($, e, next) => {
    useName($)
    const r = await next(e)
    const kind = e.origin?.kind
    if ((kind === 'composer' || kind === 'bridge') && !e.command && !e.isMeta && 'text' in r && typeof r.text === 'string' && r.text.trim()) heard.owner = { text: r.text.trim().slice(0, 2000), at: now() }
    return r
  })

  // Workers and scouts only reach the agents through the plugin itself.
  // (The name is only known once a hook runs, so these match inside rather than by a filter.)
  on('agent.offer', ($, e, next) => {
    useName($)
    return e.agent === S.N.worker || e.agent === S.N.scout ? { isOffered: false } : next(e)
  })

  // One tool.call hook for every tool (the name is only known once a hook runs):
  // a worker or scout the plugin stopped can't do anything more, so every tool it tries is
  // refused; and the lead's own tools, mcp__<name>__<tool>, run here.
  const toolNames = TOOLS().map(t => t.name)
  on('tool.call', async ($, e, next) => {
    useName($)
    if (e.agentId && stopped.has(e.agentId)) return { deny: `${S.N.name} stopped this agent. Do nothing more; answer "stopped" and end.` }
    const name = toolNames.find(t => e.tool === S.N.tool(t))
    if (!name) return next(e)
    if (!(await isOn($))) return { result: offAnswer(S.N.name) }
    try {
      return { result: await runTool($, name, e as unknown as In) }
    } catch (err) {
      return { result: `error: ${(err as Error).message}` }
    }
  })

  // A worker's or scout's run ended: its final answer arrives here.
  on('turn.complete', async ($, e, next) => {
    useName($)
    const r = await next(e)
    if (e.agentId && workers.has(e.agentId)) void workerFinished($, e.agentId, e.answer, e.isAborted, usageTokens(e.usage))
    else if (e.agentId && scoutRuns.has(e.agentId)) void scoutFinished($, e.agentId, e.answer, e.isAborted)
    return r
  })

  // Editing a scout file reschedules the scouts.
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    useName($)
    const r = await next(e)
    if (String((e as { file_path?: string }).file_path ?? '').includes(`${S.N.scouts}/`)) void scheduleScouts($)
    if (String((e as { file_path?: string }).file_path ?? '').includes(`${S.N.dir}/roles/`)) void loadRoles($).catch(() => undefined)
    return r
  })

  // Every slash command starts with the plugin's name (see parseCommand): /<name> opens the
  // panel, /<name>-<word> does one thing. Registered under the plugin's name, so matched here.
  on('command.run', async ($, e, next) => {
    useName($)
    if (!commandNames(S.N.name).includes(e.command)) return next(e)
    const b = await load($)
    const cmd = parseCommand(e.command, e.args, modeOf(b), S.N.name)
    if (!cmd) return next(e)
    const say = (text: string) => ({ text, isTextDisplayOnly: true })
    switch (cmd.kind) {
      case 'bad':
        return say(cmd.message)
      case 'help':
        return say(manual(cmd.topic))
      case 'open':
      case 'tasks':
        await openPane($, cmd.kind === 'tasks' ? { tab: 'tasks' } : {})
        return say(`Board opened: ↑↓ to move, Enter to open, t tasks, s scouts, c settings, Esc to close. (ctrl+x tab goes back to it.)`)
      case 'scouts': {
        const defs = await scheduleScouts($)
        await publish($, await load($))
        // Open the panel on the Scouts view; the text list below is the fallback when it can't be placed.
        const placed = await openPane($, { tab: 'scouts' }).then(r => r.isPlaced).catch(() => false)
        if (placed) return say(`Scouts opened: Enter opens a scout, t tasks, Esc closes.`)
        if (!defs.length) return { text: `No scouts yet. Add one as ${S.N.scouts}/<name>.md:\n---\nevery_minutes: 30\n---\nLook for missing tests around risky code.` }
        return { text: defs.map(d => `${d.name}: ${everyText(d.every_minutes)}${d.warning ? ` (${d.warning})` : ''}${scoutState.get(d.name)?.last_run ? `, last ran ${scoutState.get(d.name)!.last_run!.slice(11, 16)}` : ''}${scoutState.get(d.name)?.running ? ' (running now)' : ''}${scoutState.get(d.name)?.paused ? ' (paused)' : ''}`).join('\n') }
      }
      case 'scout':
        return { text: await runScoutNow($, cmd.name) }
      case 'scout-pause':
        return say(await setScoutPaused($, cmd.name, cmd.paused))
      case 'settings': {
        S.settingEdit = null
        S.settingPick = null
        const placed = await openPane($, { tab: 'settings' }).then(r => r.isPlaced).catch(() => false)
        if (placed) return say(`Settings opened: Enter on a row changes it, t tasks, s scouts, Esc closes.`)
        return say(settingsText(b, S.N.name))
      }
      case 'set':
        return say(await ownerSettings($, cmd.input, `with /${S.N.name}-settings`))
      case 'off':
      case 'on':
        return say(await setSymcc($, cmd.kind === 'on'))
      case 'mode': {
        const r = await setBoardMode($, cmd.mode, 'you')
        tellLead($, `The owner set the board mode to ${cmd.mode} with /${S.N.name}-mode: ${r}`)
        return say(r)
      }
      case 'show': {
        const t = find(b, cmd.id)
        if (!t) return say(`${cmd.id} is not on the board.`)
        await openPane($, { tab: 'tasks', task: t.id })
        return say(taskText(t, [...workers.values()].some(w => w.task === t.id), b.tasks, await latestReport($, t)))
      }
      case 'approve':
      case 'reject': {
        const t = find(b, cmd.id)
        if (!t) return say(`${cmd.id} is not on the board.`)
        if (t.status !== 'review') return say(`${t.id} is not ready for review (it is ${STATUS_WORD[t.status]}).`)
        const r = await runTool($, cmd.kind, cmd.kind === 'reject' ? { task: t.id, reason: cmd.reason } : { task: t.id }).catch((err: Error) => `error: ${err.message}`)
        tellLead($, cmd.kind === 'approve' ? `The owner approved ${t.id} with /${S.N.name}-approve: ${r}` : `The owner rejected ${t.id} with /${S.N.name}-reject ("${cmd.reason}"): ${r}`)
        return say(r)
      }
      case 'diff': {
        const t = find(b, cmd.id)
        if (!t) return say(`${cmd.id} is not on the board.`)
        if (t.status !== 'review') return say(`${t.id} is not ready for review (it is ${STATUS_WORD[t.status]}); /${S.N.name}-diff shows the changes of a task in review.`)
        try {
          const files = await changedFiles($, b.target_branch, t)
          if (!cmd.file) return say(statText(t.id, files, S.N.name))
          const f = cmd.file.replace(/^\.\//, '')
          if (!files.some(x => x.file === f)) return say(`${t.id} did not change ${f}. Changed: ${files.map(x => x.file).join(', ') || 'nothing'}`)
          const text = await changesText($, b.target_branch, t, f)
          return say(cutDiff(text, t.id, 5000, f, S.N.name).join('\n') || `${f}: no text changes (binary?)`)
        } catch (err) {
          return say(`Could not read the changes of ${t.id}: ${(err as Error).message}`)
        }
      }
    }
    return next(e)
  })

  // The band above the prompt: the board, always in view inside Claude Code's own screen.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    useName($)
    return renderAbovePrompt($, e, next)
  })

  // Esc in an opened scout goes back to the Scouts list (the panel stays open).
  // Opened days and the active view are forgotten when the board panel closes.
  on('ui.close', async ($, e, next) => {
    useName($)
    if (e.id !== S.N.pane) return next(e)
    // Esc in the reject box or the role pick list cancels it; Esc in a task's changes goes back to the task.
    if (e.origin.kind === 'person' && (S.rejecting || S.diffOpen || S.rolePick) && (await readTab($)) !== 'scouts' && (await readOpened($))) {
      if (S.rolePick) S.rolePick = null
      else if (S.rejecting) S.rejecting = null
      else S.diffOpen = null
      $.ui.invalidate('ui.render')
      return { value: undefined }
    }
    // Esc in a setting's edit box or pick list cancels it.
    if (e.origin.kind === 'person' && (S.settingEdit || S.settingPick) && (await readTab($)) === 'settings') {
      S.settingEdit = null
      S.settingPick = null
      $.ui.invalidate('ui.render')
      return { value: undefined }
    }
    // Esc in a scout's edit mode (or the new scout name box) cancels it.
    if (e.origin.kind === 'person' && (S.draft || S.naming) && (await readTab($)) === 'scouts') {
      cancelScoutEdit($)
      return { value: undefined }
    }
    if (e.origin.kind === 'person' && (await readTab($)) === 'scouts' && (await readScoutOpen($))) {
      await updateScoutOpen($, () => '')
      return { value: undefined }
    }
    openDays.clear()
    S.backlogOpen = false
    S.backlogAll = false
    S.doneOpen = false
    S.droppedOpen = false
    S.draft = null
    S.naming = null
    S.diffOpen = null
    S.rejecting = null
    S.rolePick = null
    S.settingEdit = null
    S.settingPick = null
    changesCache.clear()
    await updateTab($, () => '').catch(() => undefined)
    await updateScoutOpen($, () => '').catch(() => undefined)
    return next(e)
  })

  // The board panel: the list (each task a button), or one task with its actions.
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    useName($)
    return renderPane($, e, next)
  })
}
