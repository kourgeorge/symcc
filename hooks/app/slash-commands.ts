// symcc's slash commands, split out of symcc.ts (T-877): the list a host registers (COMMANDS) and what each one does
// (runCommand). symcc.ts re-exports them; this file imports session-start.ts, never symcc.ts.
import { type Command, hasMergedChanges, boardText, shortHome, notSetUpAnswer, commandNames, parseCommand, modeOf, settingsText, notifyOf, find, STATUS_WORD, statText, cutDiff, everyText, intoOf, NEW_ROLE_TEMPLATE, NEW_KIND_TEMPLATE, NEW_SCOUT_EVERY } from '../board'
import { type Host, type HostFeatures, ALL_FEATURES } from '../host'
import { findArchived } from './archive'
import { deleteOrgMem, orgMemNow } from './org-mem'
import { setupGit, recheckGit } from './git'
import { publish, driveHere, disableHere, enableHere } from './lead'
import { changedFiles, changesText, DIFF_GONE, mergedChanges, mergedDiff } from './changes'
import { changeRole } from './roles'
import { changeKind } from './kinds'
import { scheduleScouts, runScoutNow, setScoutPaused, unreadableScoutsText, leadScouts } from './scouts'
import { S, scoutState, hasWorker } from './state'
import { load, findRoot, startingText } from './store'
import { noteForLead, tellLead, brief } from './tell'
import { playable } from './voice'
import { chatTaskText } from '../core/chat-text'
import { runTool, viewText, boardHtmlText, type In, manual, ownerSettings, taskText, chatArchivedTaskText, latestReport, statsText } from './tools'
import { openPane } from './open'
import { setSymcc, setBoardMode } from './board-mode'
import { doctor } from './doctor'
import { guardOnlyText, refreshFresh, initProject } from './session-start'

/** What /symcc and /symcc-board answer after opening the board. No Esc hint: Esc doesn't reach the panel (T-158). */
export const BOARD_OPENED = 'Board opened: ↑↓ to move, Enter to open, f to search, t tasks, s scouts, c settings.'
/** BOARD_OPENED with the host's keys that go back to the board panel (HostWords.backToBoard), when it has them. */
export const boardOpened = (): string => (S.W.backToBoard ? `${BOARD_OPENED} (${S.W.backToBoard} goes back to it.)` : BOARD_OPENED)

/** What /<name>-board answers where the client has no board panel. */
export const noPanelText = (): string => `There is no board panel here. /${S.N.name}-tasks lists the tasks; /${S.N.name} shows the whole board as text.`

/** symcc's slash commands, for the host to register: name, description and the hint for its arguments. `features`: the
 * host's (every one on unless given); without a panel, /symcc shows the board as text (OpenCode's panel is /symcc-board). */
export function COMMANDS(features: HostFeatures = ALL_FEATURES): { name: string; description: string; argumentHint?: string }[] {
  return [
    { name: S.N.name, description: features.panel ? `Open the ${S.N.name} board panel: tasks and scouts` : `Show the ${S.N.name} board as text (the panel: /${S.N.name}-board)` },
    { name: `${S.N.name}-tasks`, description: `List the open ${S.N.name} tasks in the chat, grouped as on the board (what needs you, running, in review, failed, to do), with the backlog and today's counts` },
    { name: `${S.N.name}-status`, description: `Show the ${S.N.name} Live tab as text in the chat: what needs you, the running tasks and what waits for them, the branches, today's numbers and the newest notes` },
    // OpenCode's TUI part has its own /<name>-board (opencode/tui.ts), so a host with no panel doesn't list it here
    ...(features.panel ? [{ name: `${S.N.name}-board`, description: `Open the ${S.N.name} board panel (on Live); html writes the board as a web page and opens it`, argumentHint: '[html]' }] : []),
    { name: `${S.N.name}-task`, description: `Open one ${S.N.name} task (/${S.N.name}-task T-3), or do one of its page's actions: /${S.N.name}-task T-3 pause, resume, retry, drop [reason], merged (already merged by hand), review on|off, stash (to the backlog), todo (out of the backlog), role <name>, note (an answered investigation: keep it as a note), or run [anyway] (start it now, even over the agent limit or on a paused board; anyway when it waits on unfinished tasks)`, argumentHint: '<T-id> [pause|resume|retry|drop [reason]|merged|review on|off|stash|todo|role <name>|note|run [anyway]]' },
    { name: `${S.N.name}-approve`, description: `Approve a ${S.N.name} task that is ready for review (merge it): /${S.N.name}-approve T-5`, argumentHint: '<T-id>' },
    { name: `${S.N.name}-reject`, description: `Reject a ${S.N.name} task in review, with the reason: /${S.N.name}-reject T-5 <reason>`, argumentHint: '<T-id> <reason>' },
    { name: `${S.N.name}-diff`, description: `Show what a ${S.N.name} task in review changed, or one file's diff: /${S.N.name}-diff T-5 [file]`, argumentHint: '<T-id> [file]' },
    { name: `${S.N.name}-scout`, description: `With no name, open the ${S.N.name} board panel on the scouts view and reload the scout files; run a scout now (/${S.N.name}-scout <name>), pause or resume it (/${S.N.name}-scout <name> pause|resume), or change it (/${S.N.name}-scout <name> every 30, model <model|none>, findings auto|backlog|default, prompt <instructions>); a new one: /${S.N.name}-scout <name> new <instructions>`, argumentHint: '[<name> [pause|resume|every N|model M|findings auto|backlog|default|prompt TEXT|new TEXT]]' },
    { name: `${S.N.name}-mode`, description: `Set the ${S.N.name} board mode: paused (nothing runs), review = approve merge (finished work waits for you) or auto = auto merge (it merges on its own); no word switches review and auto`, argumentHint: '[paused|review|auto]' },
    { name: `${S.N.name}-settings`, description: `See and change the ${S.N.name} settings: /${S.N.name}-settings opens them; /${S.N.name}-settings max_parallel 5 sets one; /${S.N.name}-settings role tester off (or type, with on, off, reset or remove) changes a role or task type, role <name> add makes one, role <name> edit <field> <value> changes one part of it (save {"field":"value",...} several at once); /${S.N.name}-settings git setup sets up git (as the lead's setup_git)`, argumentHint: '[name value | role|type <name> on|off|reset|remove | role|type <name> add | role|type <name> edit <field> <value> | role|type <name> save {json} | git setup]' },
    { name: `${S.N.name}-stats`, description: `Show ${S.N.name} time and token stats: the whole team (lead, workers, scouts), totals, averages per task and per try, time per stage, outcomes, by role, origin and day, with bar charts; inside (with a day range) counts only the work inside it; html writes them as a web page with charts and opens it: /${S.N.name}-stats [full|html] [7d [inside]|T-100..T-130]`, argumentHint: '[full|html] [7d [inside]|T-1..T-9]' },
    { name: `${S.N.name}-doctor`, description: `Check ${S.N.dir}/ and git: old migration backups, task branches already merged, leftover task folders, files near the 4 MB limit, a stuck board; lists them with sizes and cleans up only with /${S.N.name}-doctor fix (all) or fix b-T-5 m-1101-1000 (the items with those ids); for a dropped task, fix also deletes its folder with unsaved changes and its unmerged branch (they can't be got back); for other tasks such work is only listed`, argumentHint: '[fix [all|id ...]]' },
    { name: `${S.N.name}-disable`, description: `Disable ${S.N.name} for this project: ${S.W.assistant} works as normal, nothing runs; the board is kept; "here" turns it off in this window only`, argumentHint: '[here]' },
    { name: `${S.N.name}-enable`, description: `Turn ${S.N.name} on in this window: the project too if it was disabled, in the mode the board had` },
    { name: `${S.N.name}-init`, description: `Set up ${S.N.name} in this folder, like git init: makes ${S.N.dir}/ here, turns it on and opens the board; with no .git of its own the board shows a "No git repo here" notice with a set-up step, and "git" sets up git here first; where a board exists it changes nothing`, argumentHint: '[git]' },
    { name: `${S.N.name}-drive`, description: `Make this session drive the ${S.N.name} board (start workers, merge, run scouts); another driving session hands over first` },
    { name: S.N.help, description: `Show the ${S.N.name} manual: how the board, lead, workers and scouts work, and every command`, argumentHint: '[topic]' },
  ]
}

type TaskDo = Extract<Command, { kind: 'task-do' }>

/** The lead's tool (and its input) that does /<name>-task T-5 <verb>: the same calls as the task page's buttons. */
export function taskDoTool(id: string, c: TaskDo): [string, In] {
  switch (c.verb) {
    case 'pause':
      return ['pause', { task: id, reason: 'paused by the owner' }]
    case 'resume':
    case 'retry':
      return [c.verb, { task: id }]
    case 'drop':
      return ['drop', { task: id, reason: c.reason || 'dropped by the owner' }]
    case 'merged':
      return ['merged', { task: id, by: 'the owner' }]
    case 'review':
      return ['change', { task: id, needs_review: !!c.on }]
    case 'stash':
    case 'todo':
      return ['change', { task: id, backlog: c.verb === 'stash' }]
    case 'role':
      return ['change', { task: id, role: c.role ?? '' }]
    case 'note':
      return ['approve', { task: id, keep_note: true }]
    case 'run':
      return ['run', { task: id, ...(c.anyway ? { anyway: true } : {}) }]
  }
}

/** What the lead is told the owner did with /<name>-task T-5 <verb> (the tool's answer follows). */
function taskDoLine(id: string, c: TaskDo): string {
  switch (c.verb) {
    case 'pause': return `The owner paused ${id}`
    case 'resume': return `The owner resumed ${id}`
    case 'retry': return `The owner retried ${id}`
    case 'drop': return `The owner dropped ${id}${c.reason ? ` ("${brief(c.reason)}")` : ''}`
    case 'merged': return `The owner marked ${id} done: its work was already merged outside the board`
    case 'review': return `The owner turned needs_review ${c.on ? 'on' : 'off'} for ${id}`
    case 'stash': return `The owner moved ${id} to the backlog`
    case 'todo': return `The owner moved ${id} from the backlog to todo`
    case 'role': return `The owner set the role of ${id} to ${c.role}`
    case 'note': return `The owner chose Keep as a note for ${id}`
    case 'run': return `The owner ran ${id} now${c.anyway ? ' (start anyway)' : ''}`
  }
}

/** What a slash command answers: its text, and whether it is only shown to the owner (not given to the lead). */
export type CommandAnswer = { text: string; isTextDisplayOnly?: true }

/**
 * A slash command runs (`command` without the slash, and its arguments). Every one of symcc's starts with its name
 * (see parseCommand): /<name> opens the panel, /<name>-<word> does one thing. null: not symcc's, the host runs it.
 */
export async function runCommand(host: Host, command: string, args: string): Promise<CommandAnswer | null> {
  const isStats = command === `${S.N.name}-stats`
  const isDoctor = command === `${S.N.name}-doctor`
  if (!isStats && !isDoctor && !commandNames(S.N.name).includes(command)) return null
  // Before session start set the project folder (a plugin reload): learn it from the session first;
  // if it still isn't known, answer and write nothing (never a board or lock path from "/").
  if (!(await findRoot(host))) return { text: startingText(), isTextDisplayOnly: true }
  if (S.guardOnly) return { text: guardOnlyText(), isTextDisplayOnly: true }
  // T-858: with no board nothing is read or written (no stats file, no git): both point to /<name>-init
  if (isStats || isDoctor) {
    await refreshFresh(host)
    if (S.fresh) return { text: notSetUpAnswer(S.N.name), isTextDisplayOnly: true }
  }
  // /<name>-stats: a read-only text report (see statsText); it changes nothing on the board.
  if (isStats) return { text: await statsText(host, args ?? '').catch((err: Error) => `Could not build the stats: ${err.message}`), isTextDisplayOnly: true }
  // /<name>-doctor (T-676): checks .<name>/ and git; cleans up only with "fix" (all) or "fix <id> ..." (those)
  if (isDoctor) return { text: await doctor(host, args ?? '').catch((err: Error) => `${S.N.name} doctor failed: ${err.message}`), isTextDisplayOnly: true }
  // A broken board.json makes load throw (it is never written over): the commands that don't need the
  // board (help, opening the panel, a usage line) still work; the others answer with the reason.
  // T-844: /<name>-init comes before anything reads the session's board: a broken board above never blocks it
  const early = parseCommand(command, args, undefined, S.N.name)
  // T-844: a window that started with no board looks again: another window may have made the board since
  if (early && early.kind !== 'bad' && early.kind !== 'help') await refreshFresh(host)
  if (early?.kind === 'init') return { text: await initProject(host, t => tellLead(host, t), !!early.git), isTextDisplayOnly: true }
  const loaded = await load(host).then(
    board => ({ board, broken: '' }),
    (err: Error) => ({ board: null, broken: err.message }),
  )
  const cmd = parseCommand(command, args, loaded.board ? modeOf(loaded.board) : undefined, S.N.name)
  if (!cmd) return null
  const say = (text: string) => ({ text, isTextDisplayOnly: true as const })
  if (!loaded.board && !['bad', 'help', 'open', 'board'].includes(cmd.kind)) return say(`${loaded.broken} Then try again.`)
  const b = loaded.board!
  // T-795: in a folder with no board only /<name>-init (and help) work; everything else points to it
  if (S.fresh && !['bad', 'help'].includes(cmd.kind)) return say(notSetUpAnswer(S.N.name))
  switch (cmd.kind) {
    case 'bad':
      return say(cmd.message)
    case 'help':
      return say(manual(cmd.topic, host.features))
    case 'tasks':
      // T-901: every client prints the open tasks as a short list in the chat; no panel opens
      return say(await viewText(host, b, 'tasks'))
    case 'status':
      // T-902: the Live tab's picture as text in the chat, in every client; no panel opens
      return say(await viewText(host, b, 'status'))
    case 'board':
      if (cmd.html) return say(!loaded.board ? `${loaded.broken} Then try again.` : await boardHtmlText(host, b, true).catch((err: Error) => `Could not build the board page: ${err.message}`))
      if (!host.features.panel) return say(noPanelText())
      await openPane(host, { tab: 'live' })
      return say(boardOpened())
    case 'open':
      // a host with no panel: the text board, as the board tool answers it (or why the board can't be read)
      if (!host.features.panel) return say(loaded.board ? boardText(b, Date.now(), shortHome(S.root, S.home), S.N.name, undefined, { driving: S.driving, chat: !!S.chat }, S.version) : `${loaded.broken} Then try again.`)
      await openPane(host, { tab: 'live' })
      return say(boardOpened())
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
      return { text: defs.map(d => `${d.name}: ${everyText(d.every_minutes)}${d.projects?.length ? ` (projects: ${d.projects.join(', ')})` : ''}${d.warning ? ` (${d.warning})` : ''}${scoutState.get(d.name)?.last_run ? `, last ran ${scoutState.get(d.name)!.last_run!.slice(11, 16)}` : ''}${scoutState.get(d.name)?.running ? ' (running now)' : ''}${scoutState.get(d.name)?.paused ? ' (paused)' : ''}`).join('\n') + (skipped ? `\n${skipped}` : '') }
    }
    case 'scout':
      return { text: await runScoutNow(host, cmd.name) }
    case 'scout-pause':
      return say(await setScoutPaused(host, cmd.name, cmd.paused))
    case 'scout-edit': {
      // the same edit as the lead's scouts tool: the other parts of the file are kept, the scouts are rescheduled
      const part = cmd.field === 'every' ? { every_minutes: cmd.value } : cmd.field === 'model' ? { model: cmd.value } : cmd.field === 'findings' ? { findings: cmd.value } : { prompt: cmd.value }
      return say(await leadScouts(host, { action: 'edit', name: cmd.name, ...part }))
    }
    case 'scout-new': {
      // the lead's scouts tool's add, with the panel's new scout's timer (NEW_SCOUT_EVERY)
      const r = await leadScouts(host, { action: 'add', name: cmd.name, every_minutes: NEW_SCOUT_EVERY, prompt: cmd.prompt })
      if (r.startsWith('added')) noteForLead(`The owner added scout ${cmd.name}: ${brief(r)}`)
      return say(r)
    }
    case 'def':
    case 'def-add':
    case 'def-edit':
    case 'def-save': {
      // the lead's roles and task types tools (changeRole, changeKind); add starts from the panel's template, edit changes
      // one field, save several in one edit (as the panel's Save: a bad value saves none)
      const input =
        cmd.kind === 'def' ? { action: cmd.action, name: cmd.name }
        : cmd.kind === 'def-add' ? { action: 'add', name: cmd.name, ...(cmd.def === 'role' ? NEW_ROLE_TEMPLATE : NEW_KIND_TEMPLATE) }
        : cmd.kind === 'def-save' ? { action: 'edit', name: cmd.name, ...cmd.fields }
        : { action: 'edit', name: cmd.name, [cmd.field]: cmd.value }
      const r = await (cmd.def === 'role' ? changeRole : changeKind)(host, input)
      if (r.ok) {
        // T-970: no Meanwhile line: the lead's instructions show the new roles and task types every turn
        // the board's view carries the roles and task types for a panel that draws from it (OpenCode's view.json)
        await publish(host, await load(host))
      }
      return say(r.text)
    }
    case 'check-git':
      return say(await recheckGit(host))
    case 'setup-git':
      // the lead's setup_git; it publishes the board and tells the lead itself
      return say(await setupGit(host, 'you'))
    case 'orgmem-delete': {
      const r = await deleteOrgMem(host, cmd.n, undefined, cmd.key)
      // the board's view carries the notes for a panel that draws from it (OpenCode's view.json)
      if (r.ok) await publish(host, await load(host))
      return say(r.text)
    }
    case 'settings': {
      S.settingEdit = null
      S.settingPick = null
      const placed = await openPane(host, { tab: 'settings' }).then(r => r?.isPlaced ?? false).catch(() => false)
      if (placed) return say(`Settings opened: Enter on a row changes it, t tasks, s scouts, b goes back to the tasks.`)
      return say(settingsText({ ...b, notify: notifyOf(b, await playable(host)) }, S.N.name, S.root))
    }
    case 'set':
      return say(await ownerSettings(host, cmd.input, `with /${S.N.name}-settings`))
    case 'disable':
    case 'enable':
      // T-875: /<name>-enable means "on, in this window"; only disable has a one-window form
      if (cmd.kind === 'enable') return say(await enableHere(host, t => tellLead(host, t)))
      return say(cmd.here ? await disableHere(host) : await setSymcc(host, false))
    case 'drive': {
      // a window turned off on purpose (/<name>-disable here) stays off
      // T-984: said plainly why /<name>-drive does not turn it on
      if (S.offHere) return say(`${S.N.name} is off in this window because you ran /${S.N.name}-disable here, so /${S.N.name}-drive leaves it off. /${S.N.name}-enable turns it on here; then /${S.N.name}-drive can make this window drive.`)
      return say(await driveHere(host))
    }
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
        if (S.chat) return say(chatArchivedTaskText(old, cmd.page))
        return say(`${old.id} is archived (in ${S.N.archiveFile}; read-only).\n${taskText(old, false, b.tasks, undefined, b.archived_done)}`)
      }
      await openPane(host, { tab: 'tasks', task: t.id })
      if (S.chat) return say(chatTaskText(t, await latestReport(host, t), Date.now(), cmd.page))
      return say(taskText(t, hasWorker(t.id), b.tasks, await latestReport(host, t), b.archived_done))
    }
    case 'task-do': {
      const t = find(b, cmd.id)
      if (!t) return say((await findArchived(host, cmd.id)) ? `${cmd.id} is archived.` : `${cmd.id} is not on the board.`)
      const r = await runTool(host, ...taskDoTool(t.id, cmd)).catch((err: Error) => `error: ${err.message}`)
      noteForLead(`${taskDoLine(t.id, cmd)}: ${brief(r)}`)
      return say(r)
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
      // T-1086: a done change task shows what its merge brought into the branch, from git
      if (hasMergedChanges(t)) {
        const got = await mergedChanges(host, t).catch(() => null)
        if (!got) return say(DIFF_GONE)
        if (!cmd.file) return say(statText(t.id, got.files, S.N.name))
        const f = cmd.file.replace(/^\.\//, '')
        if (!got.files.some(x => x.file === f)) return say(`${t.id} did not change ${f}. Changed: ${got.files.map(x => x.file).join(', ')}`)
        const text = await mergedDiff(host, t, f)
        return say(text === DIFF_GONE ? text : cutDiff(text, t.id, 5000, f, S.N.name).join('\n') || `${f}: no text changes (binary?)`)
      }
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
