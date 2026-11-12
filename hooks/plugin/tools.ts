import type { SymccTask } from '../../types'
import { STATUS_WORD, fromText, fmtRun, fmtTotal, sumRuns, taskCommits, commitText, rolesLeadText, BUILT_IN_ROLES, find, boardText, shortHome, checkRole, makeOrigin, addTask, evidenceText, stashTask, patchTask, promoteTask, rejectTask, type SettingsInput, type SettingChange, isMode, noBranchText, applySettings, type Board, settingSetText } from '../board'
import { removeWorktree, worktreeDir, setupGit, branchExists, branchList } from './git'
import { publish } from './lead'
import { loadRoles } from './roles'
import { S, type $, heard } from './state'
import { load, change, now } from './store'
import { tellLead } from './tell'
import { pump, stopWorker, approve, setBoardMode, setSymcc } from './workers'

// ---------------- the lead's tools ----------------

/** A short date and time, like "Nov 11, 09:30"; "?" when there is none. */
export const when = (iso: string) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '?')

export function taskText(t: SymccTask, running: boolean, all: SymccTask[] = []): string {
  const word = STATUS_WORD
  const L = [`${t.id}  [${word[t.status]}]  ${t.title}`, `added ${when(t.created_at)} · changed ${when(t.updated_at)} · tries ${t.attempts}`]
  L.push(fromText(t, 120))
  if (t.origin?.why) L.push(`why: ${t.origin.why}`)
  if (t.origin?.evidence) L.push(`seen by ${S.N.name}: ${t.origin.evidence}`)
  if (t.note) L.push(`now: ${t.note}`)
  if (t.status === 'waiting' && t.question) L.push('', `ASKS: ${t.question}`)
  L.push('', 'What to do:', ...(t.details.trim() ? t.details.split('\n').map(l => (l.trim() ? `  ${l}` : '')) : ['  (no details)']))
  L.push('', 'May change:', ...(t.files.length ? t.files.map(f => `  ${f}`) : ['  anywhere in the project']))
  if (t.after.length) {
    L.push('', 'Waits for:')
    for (const id of t.after) {
      const dep = all.find(x => x.id === id)
      L.push(`  ${id} ${dep ? `[${word[dep.status]}] ${dep.title}` : '[missing]'}`)
    }
  }
  if (t.history.length) L.push('', `What happened (${t.history.length}, newest first):`, ...[...t.history].reverse().map(line => `  • ${line}`))
  if (t.runs?.length) L.push('', 'Time and cost:', ...t.runs.map((r, i) => `  ${fmtRun(r, i, Date.now())}`), `  total: ${fmtTotal(sumRuns(t.runs, Date.now()))}`)
  const commits = taskCommits(t)
  if (commits.length) L.push('', 'Commits (newest first):', ...commits.map(c => `  ${commitText(c)}`))
  if (t.branch) L.push('', `branch: ${t.branch}`)
  if (running) L.push('', 'A worker is on it now: open it from the agents list to watch.')
  return L.join('\n')
}

export const MANUAL = (): Record<string, string> => ({
  overview: `${S.N.name} turns this session into a small team.
  • The board (${S.N.dir}/board.json) holds the tasks. You and the lead manage it by talking.
  • The lead is this chat. It turns what you want into tasks and decides what happens next.
  • Workers are background agents. Each builds one task in its own copy of the code
    (${S.N.dir}/worktrees/T-n). When it finishes, ${S.N.name} checks the files it changed, runs the
    tests and merges into the target branch (target_branch) only if they pass. In mode
    review (or for a task with needs_review) it waits for your approve or reject first.
  • The board has one mode: off (nothing runs), review (work runs; finished work waits for
    you) or auto (work runs; finished work that passes merges on its own; the default).
  • Scouts are background agents on a timer (every_minutes: 0 means only on demand). Each
    does what its file asks (reading the project, running shell commands, searching the
    web) and reports to the lead, which decides what goes on the board.
  Topics: /${S.N.help} commands · tasks · lead · workers · scouts · safety`,
  commands: `Commands
  /${S.N.name} opens everything; /${S.N.name}-WORD does one thing: a plural noun opens a view
  (tasks, scouts), a singular noun acts on one named item (task, scout), a verb acts
  (approve, reject, diff), and mode and settings change how the board works. The "board" is
  the whole panel: tasks, scouts and settings.
  /${S.N.name}                     open the board panel (↑↓ move, Enter opens, t / s / c switch views, Esc closes)
  /${S.N.name}-tasks               open the panel on the tasks view
  /${S.N.name}-scouts              open the panel on the scouts view and reload the scout files
  /${S.N.name}-task T-3            open one task
  /${S.N.name}-approve T-5         merge a task that is ready for review
  /${S.N.name}-reject T-5 REASON   send it back to "todo" with the reason
  /${S.N.name}-diff T-5 [FILE]     the files it changed (+/- lines), or one file's diff
  /${S.N.name}-scout NAME          run a scout now
  /${S.N.name}-scout NAME pause    pause a scout: it doesn't run until you resume it
  /${S.N.name}-scout NAME resume   resume a paused scout (p on its page does both)
  /${S.N.name}-mode [off|review|auto]  set the board mode; no word switches review and auto
                       (from off, no word goes to review)
                       off: stop every worker and scout now, start nothing new
                       review: work runs; finished tasks wait for your approve or reject
                       auto: work runs; finished tasks that pass merge on their own
  /${S.N.name}-settings [NAME VALUE]  open the settings view, or set one setting, e.g.
                       /${S.N.name}-settings max_parallel 5 · /${S.N.name}-settings voice off
                       /${S.N.name}-settings mode review · /${S.N.name}-settings test_commands "npm test"
                       (several test commands: join them with " && "; "none" clears them)
                       a value over its limit is cut to it, and the answer says so
  /${S.N.name}-off                 turn ${S.N.name} off for this project: Claude works as normal (no lead
                       guide, no workers, scouts, updates or voice); the board is kept
  /${S.N.name}-on                  turn it back on, in the mode the board had
  /${S.N.help} [TOPIC]           this manual
On the board: t tasks · s scouts · c settings · m switch review / auto.
In the settings view: Enter on a row changes it: on/off flips, mode and target_branch
  open a pick list, numbers and test_commands an edit box · Esc cancels.
In an open task: b back · p pause · u resume · r retry · x drop · w watch the worker · n needs review on/off
  · k stash to the backlog (a task to do, paused or failed)
  · l pick the worker role (a task to do, paused, failed or in the backlog).
In a backlog task: o move to todo · x drop · l role.
On the board list a task's role shows after its status ("T-12 doing · tester"); general shows nothing.
On the board list, the "▸ Backlog · N" section comes first, above the open tasks, folded; Enter on it opens it (5 items, then "… N more").
Backlog tasks are ideas and unclear work; they start only when you move them to todo (o).
In a task ready for review: a approve · x reject (asks for a reason) · d show changes.
On the board list: m switches the mode between review and auto (never to off).
Everything else, just say to the lead: "pause T-5", "drop T-2", "do T-4 first",
"set the test command to npm test", "give workers 90 minutes".`,
  tasks: `Tasks
  Fields: title, details (what to do and how we know it works), files (what the worker
  may change; empty = anywhere), after (tasks that must be done first), order (lower
  runs first), role (the worker role: ${BUILT_IN_ROLES.join(', ')},
  or one in .${S.N.name}/roles/; old tasks with role tests start as tester, backend or frontend as general; it brings a checklist, skills and maybe a model), plus status, note, question, tries, history, branch, when added/changed.
  Statuses:
    to do            waiting for a free worker (and for its "after" tasks)
    doing            a worker is on it
    paused           stopped on purpose; resume to continue
    waiting for you  the lead asked you a question; answer it in the board panel
                     (also when a worker answered NEED FILES: it needs files outside its list)
    ready for review the worker is done and the checks passed; nothing is merged until you
                     approve it (or reject it with a reason, which sends it back to "todo")
    failed           tests failed, files outside its list changed, or the worker stopped
    done             merged into the target branch
    dropped          given up
    backlog          an idea or work that is not clear yet; it never starts until you
                     move it to todo ("stash this idea", "show the backlog", "move T-5 to todo")
  The board lists the newest task at the top.`,
  lead: `The lead (this chat) has these tools:
  board · add · change · retry · ask · drop · pause · resume · settings
  approve · reject (only for a task ready for review)
  settings: target_branch (the branch work is merged into; a new board starts on the branch
  you have checked out, and it must be an existing branch), test_commands (must pass before
  a merge), max_parallel (workers at once, 1-8),
  max_minutes (a worker running longer is stopped), auto_retries (new tries on their own
  after failing tests, 2 by default), open_on_start (open the board panel when a
  session starts, on by default), voice (say "T-3 done" out loud when a task is merged;
  only the session driving the board speaks; on by default), mode (off stops every
  worker and scout and starts nothing new; review makes every finished task wait for
  your approve or reject; auto, the default, merges a finished task that passes at once).
  You can also change every setting yourself with /${S.N.name}-settings (or the c tab in the
  board). A value over its limit is cut to it, and the answer says so.
  add and change also take needs_review: that one task waits for review even in mode auto.
  Going from review to auto does not merge tasks already in review; approve or reject them.
  Tasks in review can be approved or rejected in every mode, also off.
  After each worker finishes, the lead gets a "[${S.N.name}] Board update" message and decides what
  to do next: retry, change, split, ask you, or drop.`,
  workers: `Workers
  • Up to max_parallel run at once (3 by default), one per task.
  • A worker gets only its task, its folder, its allowed files and the test commands.
    It can't see the board or this chat, and must not commit, push or merge.
  • A resumed or retried task starts over with a fresh worker.
  • A worker that must change a file outside its list doesn't; it stops and answers
    "NEED FILES: a, b — reason". The task then waits for you: allow the files (change)
    or drop it. A worker that changes such files anyway fails its try.
  • Every two minutes ${S.N.name} checks by itself: starts ready tasks, stops a worker running
    longer than max_minutes (45 by default), notices a worker that ended without a result,
    reminds the lead about failed tasks nobody handled, and stops old workers left over
    from a plugin reload.
  • A stopped worker can't do anything more: ${S.N.name} refuses every tool it tries.`,
  scouts: `Scouts
  A scout is a file ${S.N.dir}/scouts/NAME.md in the project:
      ---
      every_minutes: 60
      model: sonnet
      ---
      What to do, in plain words.
  It does what the file says. It can read files, run shell commands and search or fetch
  web pages, but must not change the project (no edits, installs or git changes). It sends
  its whole report to the lead, or nothing when it answers NOTHING. The lead adds tasks,
  tells you, or ignores it. Run /${S.N.name}-scouts after adding or deleting a file.
  every_minutes: 0 means only on demand: it never runs on the timer, only with run now
  or /${S.N.name}-scout NAME. A value that is not a whole number (like -5) also means only
  on demand, and the scout shows a warning until the file is fixed.
  Pause one with p on its page or /${S.N.name}-scout NAME pause: it doesn't run (not on its
  timer, not with run now) until you resume it. A run going on finishes first. The pause
  is kept in ${S.N.dir}/scouts.json, so its file is not changed.
  Examples: examples/scouts/ in the plugin.`,
  safety: `Safety
  • Changes outside a task's files, or that fail the tests, are never merged.
  • Review step (optional): in mode review (/${S.N.name}-mode review) or for a task with needs_review,
    finished work that passes waits as "ready for review" (its branch and folder are kept).
    approve runs the same checked merge (brought up to date, scope checked, tests again if it
    had to merge); reject with a reason sends it back to "todo" for a fresh worker.
  • The target branch only moves by a checked merge; with uncommitted changes on it, ${S.N.name} waits.
  • A new board merges into the branch you had checked out when it was made. If you are on
    another branch, the banner and status line say so ("merging into main · you're on x").
    Change it with ${S.N.name} settings target_branch. If that branch doesn't exist, no work
    starts (nothing is marked failed) until you set an existing one.
  • Workers can edit files in their own folder without asking. Their shell commands follow
    your normal permission rules (your settings' allow list applies to them too).
  • Scouts can't edit or write files. They can run shell commands (these follow your normal
    permission rules, like workers) and search and fetch web pages. They are told not to
    change the project; changes only go through board tasks.
  • Test commands are run by ${S.N.name} itself, without a permission prompt.
  • Add ${S.N.dir}/ to the project's .gitignore.
  • A folder with no git repo (or no commits yet): nothing starts. ${S.N.name} asks first, then
    (press g in the board, or the lead's setup_git) runs git init on main, writes a .gitignore
    and makes a first commit of your files, leaving out secrets (.env, *.pem, id_rsa) and files
    over 50 MB. It never pushes or adds a remote. With git not installed nothing starts at all.`,
})

export function manual(arg: string): string {
  const MAN = MANUAL()
  const key = arg.trim().toLowerCase()
  if (!key) return Object.values(MAN).join('\n\n')
  const hit = Object.keys(MAN).find(k => k.startsWith(key))
  return hit ? MAN[hit]! : `No topic "${arg.trim()}". Topics: ${Object.keys(MAN).join(', ')}`
}

export const leadGuide = () => `## ${S.N.name}: you are the lead (main conversation only)
This section is for the main conversation only. If you are a subagent (a ${S.N.name} worker or scout, or any other), ignore it and do the job you were given.

The project has a shared task board (${S.N.dir}/board.json) that you and the owner manage together by talking. You decide how the work runs:
- Turn what the owner wants into tasks with ${S.N.name} add (title, details = what to build and how we know it works, files = the narrowest files/folders the worker may change incl. tests, after = tasks that must be done first). Keep tasks small; split big wishes.
- Every ${S.N.name} add must say where the task came from, so it can be traced back: why (one line, required), origin_by, and: for an owner request, request = the owner's words quoted exactly; for a scout finding, scout = the scout's name; for a split or follow-up, from_task = that task's id (and how: split or follow-up); for something a worker reported, origin_by worker with from_task; for your own idea, origin_by lead. ${S.N.name} also notes what it saw itself (the last owner prompt, the last scout or worker report).
- When two tasks may change the same files, make the later one wait for the earlier one (after), so they don't clash when merging. Tasks with different files can run in parallel. Decide this yourself; don't ask the owner.
- A task waits until every task in its after list is done; if one of those is dropped or failed, change the waiting task's after (or drop it), or it waits forever.
- Workers start by themselves on ready tasks, each in its own copy of the code. When one finishes, its change is tested and, if it passes, merged into main. You then get a "[${S.N.name}] Board update" message: decide what's next (retry with ${S.N.name} change / ${S.N.name} retry, split, ${S.N.name} ask the owner, or ${S.N.name} drop).
- The board has one mode (${S.N.name} settings mode): "off" stops every worker and scout and starts nothing new, "review" runs work but every finished task that passes waits for the owner, "auto" (the default) merges finished work that passes on its own. Tasks in review can be approved or rejected in every mode.
- Review before merge (optional): in mode review, or with needs_review on one task (${S.N.name} add / change), a finished task that passes stays "ready for review" instead of merging. You get "T-5 is ready for review": show the owner the change (its branch), then ${S.N.name} approve T-5 (merge it) or ${S.N.name} reject T-5 with the owner's reason (a fresh worker redoes it). Only approve when the owner says so. Going from review to auto does not merge tasks already in review.
- A worker that needs files outside its task's files stops and answers "NEED FILES: ..."; the task then waits for the owner. If they allow it, ${S.N.name} change the task with the wider files (it goes back to work); otherwise ${S.N.name} drop it or change it to a narrower plan. A worker that changes such files without asking fails its try.
- When the owner answers a waiting task, put the answer into the task with ${S.N.name} change (that sends it back to work).
- If you are told the folder has no git repo (or no commits), ask the owner whether to set one up; only when they say yes, run ${S.N.name} setup_git. Never do it without asking.
- Set the test command with ${S.N.name} settings (e.g. ["npm test"]); for a new project pick the stack and test command when you plan the first tasks.
- A scout with every_minutes: 0 runs only on demand: never on its timer, only when the owner presses "run now" or types /${S.N.name}-scout <name>. A scout whose every_minutes is not valid also runs only on demand, with a warning.
- The owner can pause one scout (p on its page, or /${S.N.name}-scout <name> pause): a paused scout doesn't run, not on its timer and not with "run now", until the owner resumes it. Only the owner pauses or resumes scouts; you can't.
- To stop work: ${S.N.name} pause pauses one task (its worker is stopped; ${S.N.name} resume continues it later, with a fresh worker). ${S.N.name} settings mode "off" stops every worker and scout; mode "review" or "auto" starts work again.
- Ideas or work that is not clear yet go to the backlog (${S.N.name} add with backlog: true); they never start until moved to todo (${S.N.name} change backlog: false). Say 'stash this' / 'move T-5 to todo'. A scout's "maybe later" finding can go to the backlog too. ${S.N.name} change backlog: true stashes a to do, paused or failed task (a running one is stopped first). The mode (off, review, auto) does not touch backlog items.
- ${S.N.name} checks every two minutes on its own: it starts ready tasks, stops a worker that runs longer than max_minutes (${S.N.name} settings), and reminds you about failed tasks nobody handled.
${rolesLeadText(S.roles, S.N.name)}
- Don't do the tasks' work yourself in the main conversation; let the workers do it. Talk about tasks by ID (T-3). Use ${S.N.name} board to see the board.`

export const TOOLS = () => [
  { name: 'board', description: `Show the ${S.N.name} task board.`, inputSchema: { type: 'object', properties: {} } },
  {
    name: 'add',
    description: `Add a task to the ${S.N.name} board. A worker starts on it when it is ready.`,
    inputSchema: { type: 'object', required: ['title', 'details', 'why', 'origin_by'], properties: { title: { type: 'string' }, details: { type: 'string', description: 'What to build and how we know it works.' }, files: { type: 'array', items: { type: 'string' }, description: 'Files/folders the worker may change, e.g. ["src/search.js", "test/"]. Empty = anywhere.' }, after: { type: 'array', items: { type: 'string' }, description: 'Task IDs that must be done first.' }, order: { type: 'number', description: 'Lower runs first.' }, needs_review: { type: 'boolean', description: 'Wait for the owner to approve before merging, even when the board merges on its own (mode auto).' }, backlog: { type: 'boolean', description: 'Put it straight into the backlog: an idea or not-yet-clear work that never starts until moved to todo.' }, role: { type: 'string', description: 'The worker role that fits the task (see your instructions for the list); general when unsure.' }, why: { type: 'string', description: 'Required. One line: why this task exists.' }, origin_by: { type: 'string', enum: ['owner', 'scout', 'worker', 'lead'], description: "Who it came from: the owner's request, a scout's report, a worker's report, or your own idea (lead)." }, request: { type: 'string', description: "For an owner request: the owner's words, quoted exactly." }, scout: { type: 'string', description: "For a scout finding: the scout's name." }, from_task: { type: 'string', description: 'For a split or follow-up, or a worker report: the task id it comes from, e.g. T-12.' }, how: { type: 'string', enum: ['split', 'follow-up'], description: 'With from_task: "split" (part of a bigger task) or "follow-up" (more work after it).' } } },
  },
  {
    name: 'change',
    description: 'Rewrite a task. A running task restarts on the new version; a waiting, failed or in-review one goes back to work; a backlog one stays in the backlog. Changing only needs_review (wait for the owner before merging) just sets that flag. backlog: true stashes the task in the backlog (a running one is stopped first); backlog: false moves it from the backlog to todo.',
    inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' }, title: { type: 'string' }, details: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, after: { type: 'array', items: { type: 'string' } }, order: { type: 'number' }, needs_review: { type: 'boolean' }, backlog: { type: 'boolean', description: 'true: stash in the backlog (never starts); false: move from the backlog to todo.' }, role: { type: 'string', description: 'The worker role for the task; general when unsure.' } } },
  },
  { name: 'approve', description: 'Approve a task that is ready for review: its work is merged into the target branch by the same checked merge as always (brought up to date, scope checked, tests run again if it had to merge). Only for a task in "review".', inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' } } } },
  { name: 'reject', description: 'Reject a task that is ready for review: nothing is merged, it goes back to "todo" with the reason in its history, and a fresh worker picks it up. Only for a task in "review".', inputSchema: { type: 'object', required: ['task', 'reason'], properties: { task: { type: 'string' }, reason: { type: 'string', description: 'What is wrong and what to change, for the next worker.' } } } },
  { name: 'retry', description: 'Put a task (back) to "todo" so a worker picks it up again, e.g. after it failed.', inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' } } } },
  { name: 'ask', description: 'Make a task wait for the owner with a question.', inputSchema: { type: 'object', required: ['task', 'question'], properties: { task: { type: 'string' }, question: { type: 'string' } } } },
  { name: 'drop', description: 'Stop and drop a task.', inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' }, reason: { type: 'string' } } } },
  { name: 'pause', description: `Pause one task: its worker (if running) is stopped and no new worker starts on it until ${S.N.name} resume.`, inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' }, reason: { type: 'string' } } } },
  { name: 'resume', description: 'Continue a paused task: it goes back to "todo" and a fresh worker picks it up.', inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' } } } },
  {
    name: 'setup_git',
    description: `Set up git in a project folder that has no git repo or no commits yet (${S.N.name} needs one: each worker gets its own git worktree). Only run it after the owner said yes. It runs git init on branch main (if there is no repo), writes or adds to .gitignore (${S.N.dir}/, node_modules/, .env, .env.*, .DS_Store, dist/, build/, __pycache__/, .venv/), and makes a first commit of the current files, leaving out (and ignoring) files that look like secrets or are over 50 MB. Sets target_branch to that branch. Never pushes, adds no remote.`,
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'settings',
    description: 'Change how the team works: target_branch (the existing branch finished work is merged into; a new board starts on the branch checked out then), test_commands (shell commands that must pass before merging), max_parallel (workers at once), max_minutes (a worker running longer is stopped), auto_retries (new tries a task gets on its own after failing tests, 0-10, default 2), open_on_start (open the board panel by itself when a session starts, default true), voice (say it out loud when a task is merged, e.g. "T-3 done"; only the session driving the board speaks, default true), mode ("off": stop every running worker and scout now and start nothing new, tasks in review can still be approved or rejected; "review": work runs and every finished task that passes waits for the owner to approve or reject it; "auto", the default: work runs and finished work that passes merges on its own; going from off to review or auto starts work again, and going from review to auto does not merge tasks already in review).',
    inputSchema: { type: 'object', properties: { target_branch: { type: 'string', description: 'An existing local branch to merge finished work into.' }, test_commands: { type: 'array', items: { type: 'string' } }, max_parallel: { type: 'number' }, max_minutes: { type: 'number' }, auto_retries: { type: 'number' }, open_on_start: { type: 'boolean' }, voice: { type: 'boolean' }, mode: { type: 'string', enum: ['off', 'review', 'auto'] } } },
  },
]

export type In = Record<string, unknown>
export const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
export const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined)

/** Task `id` from the board; throws "<id> is not on the board" if there is none. */
export async function taskOrThrow($: $, id: string) {
  const t = find(await load($), id)
  if (!t) throw new Error(`${id} is not on the board`)
  return t
}

export async function runTool($: $, name: string, a: In): Promise<string> {
  const id = str(a.task) ?? ''
  switch (name) {
    case 'board':
      return boardText(await load($), Date.now(), shortHome(S.root, S.home), S.N.name)
    case 'add': {
      const role = str(a.role)?.trim() ? checkRole(await loadRoles($), str(a.role)!) : undefined
      if (!str(a.why)?.trim()) throw new Error('why is missing: say in one line why this task exists (and fill origin_by, plus request, scout or from_task)')
      const said = { by: a.origin_by, scout: a.scout, task: a.from_task, how: a.how, request: a.request, why: a.why }
      const t = await change($, b => {
        // check what the lead said first, then add the plugin's own evidence next to it
        const o = makeOrigin(said, now(), b)
        return addTask(b, { title: str(a.title) ?? '', details: str(a.details), files: a.files, after: a.after, order: typeof a.order === 'number' ? a.order : undefined, needs_review: a.needs_review === true, backlog: a.backlog === true, role, origin: { ...said, evidence: evidenceText(o, heard) } }, now(), S.N.dir)
      })
      void pump($)
      return `added ${t.id} ${t.title}${t.status === 'backlog' ? ' (in the backlog; it starts only when moved to todo)' : ''}`
    }
    case 'change': {
      const t = await taskOrThrow($, id)
      if (t.status === 'done') throw new Error(`${t.id} is done; add a new task instead`)
      const role = str(a.role)?.trim() ? checkRole(await loadRoles($), str(a.role)!) : undefined
      const fields = (): Partial<SymccTask> => {
        const p: Partial<SymccTask> = {}
        if (str(a.title)) p.title = str(a.title)
        if (str(a.details)) p.details = str(a.details)
        if (list(a.files)) p.files = list(a.files)
        if (list(a.after)) p.after = list(a.after)
        if (typeof a.order === 'number') p.order = a.order
        if (typeof a.needs_review === 'boolean') p.needs_review = a.needs_review
        if (role) p.role = role
        return p
      }
      if (a.backlog === true) {
        const wasRunning = t.status === 'doing'
        if (t.status !== 'backlog' && !['todo', 'doing', 'paused', 'failed'].includes(t.status)) throw new Error(`${t.id} is ${STATUS_WORD[t.status]}; only a task that is to do, paused or failed can go to the backlog`)
        if (wasRunning) await stopWorker($, t.id, 'moved to the backlog')
        await change($, x => stashTask(patchTask(x, t.id, fields(), now(), S.N.dir), t.id, now()))
        void pump($)
        return `${t.id} is in the backlog${wasRunning ? ' (its worker was stopped)' : ''}; it starts only when moved to todo`
      }
      if (a.backlog === false) {
        if (t.status !== 'backlog') throw new Error(`${t.id} is not in the backlog (it is ${STATUS_WORD[t.status]})`)
        await change($, x => promoteTask(patchTask(x, t.id, fields(), now(), S.N.dir), t.id, now()))
        void pump($)
        return `${t.id} moved from the backlog to todo`
      }
      if (t.status === 'backlog') {
        await change($, x => patchTask(x, t.id, fields(), now(), S.N.dir))
        return `${t.id} updated (still in the backlog)`
      }
      const flagOnly = typeof a.needs_review === 'boolean' && ['title', 'details', 'files', 'after', 'order', 'role'].every(k => a[k] === undefined)
      if (flagOnly) {
        await change($, x => patchTask(x, t.id, { needs_review: a.needs_review as boolean }, now(), S.N.dir))
        return `${t.id} ${a.needs_review ? 'will wait for review before merging' : 'no longer needs its own review'}`
      }
      const wasDoing = t.status === 'doing'
      if (wasDoing) await stopWorker($, t.id, 'the task changed')
      const patch: Partial<SymccTask> = { status: t.status === 'dropped' ? 'dropped' : 'todo', note: wasDoing ? 'changed; restarting' : 'changed' }
      if (str(a.title)) patch.title = str(a.title)
      if (str(a.details)) patch.details = str(a.details)
      if (list(a.files)) patch.files = list(a.files)
      if (list(a.after)) patch.after = list(a.after)
      if (typeof a.order === 'number') patch.order = a.order
      if (typeof a.needs_review === 'boolean') patch.needs_review = a.needs_review
      if (role) patch.role = role
      await change($, x => patchTask(x, t.id, patch, now(), S.N.dir))
      void pump($)
      return `${t.id} updated${wasDoing ? ' (restarting)' : ''}`
    }
    case 'retry': {
      const t = await taskOrThrow($, id)
      if (t.status === 'doing') return `${t.id} is already running`
      if (t.status === 'done') return `${t.id} is already done`
      await change($, x => patchTask(x, t.id, { status: 'todo', note: 'queued', test_tries: 0 }, now()))
      void pump($)
      return `${t.id} queued`
    }
    case 'ask': {
      const t = await taskOrThrow($, id)
      if (t.status === 'doing') await stopWorker($, t.id, 'waiting for the owner')
      await change($, x => patchTask(x, t.id, { status: 'waiting', question: (str(a.question) ?? '').slice(0, 1000), note: 'waiting for you' }, now()))
      return `${t.id} now waits for the owner`
    }
    case 'drop': {
      const t = await taskOrThrow($, id)
      if (t.status === 'done') throw new Error(`${t.id} is already done`)
      if (t.status === 'doing') await stopWorker($, t.id, 'dropped')
      await change($, x => patchTask(x, t.id, { status: 'dropped', note: str(a.reason) ?? 'dropped' }, now()))
      await removeWorktree($, t.id, worktreeDir(t.id)).catch(() => undefined)
      void pump($)
      return `${t.id} dropped`
    }
    case 'pause': {
      const t = await taskOrThrow($, id)
      if (t.status === 'done' || t.status === 'dropped') return `${t.id} is already ${t.status}`
      const wasDoing = t.status === 'doing'
      if (wasDoing) await stopWorker($, t.id, str(a.reason) ?? 'the lead paused this task')
      await change($, x => patchTask(x, t.id, { status: 'paused', note: `paused${str(a.reason) ? `: ${str(a.reason)}` : ''}` }, now()))
      void pump($)
      return `${t.id} paused${wasDoing ? ' (its worker was stopped)' : ''}; ${S.N.name} resume ${t.id} continues it`
    }
    case 'resume': {
      const t = await taskOrThrow($, id)
      if (t.status !== 'paused') return `${t.id} is not paused (it is ${t.status})`
      await change($, x => patchTask(x, t.id, { status: 'todo', note: 'resumed' }, now()))
      void pump($)
      return `${t.id} resumed`
    }
    case 'approve':
      return approve($, id)
    case 'reject': {
      const reason = str(a.reason) ?? ''
      await change($, x => rejectTask(x, id, reason, now()))
      void pump($)
      return `${find(await load($), id)?.id ?? id} rejected: back to "todo"; a fresh worker picks it up with the reason`
    }
    case 'setup_git':
      return setupGit($, 'the lead')
    case 'settings': {
      const r = await saveSettings($, a, 'the lead')
      if (r.error) return r.error
      const parts = r.changes.map(c => c.said + c.cut)
      if (r.mode) parts.push(r.mode)
      return parts.join('; ') || 'nothing changed'
    }
  }
  throw new Error(`unknown tool ${name}`)
}

/**
 * Saves settings for the lead's settings tool and for the owner (/<name>-settings, the Settings
 * view): the same checks and limits (see applySettings). `error` when nothing changed because
 * mode or target_branch is wrong; `mode` is setBoardMode's answer when the mode was set.
 */
export async function saveSettings($: $, a: SettingsInput, who: string): Promise<{ error?: string; changes: SettingChange[]; mode?: string }> {
  const target = str(a.target_branch)?.trim()
  if (a.mode !== undefined && !isMode(a.mode)) return { error: `mode must be "off", "review" or "auto" (got ${JSON.stringify(a.mode)})`, changes: [] }
  if (a.target_branch !== undefined && !(target && (await branchExists($, target)))) {
    return { error: noBranchText(target ?? String(a.target_branch), await branchList($)), changes: [] }
  }
  const changes = await change($, b => {
    const r = applySettings(b, a)
    return [r.board, r.changes] as [Board, SettingChange[]]
  })
  if (target && S.missingBranch) {
    S.missingBranch = ''
    S.toldMissing = ''
    await publish($, await load($))
  }
  const mode = isMode(a.mode) ? await setBoardMode($, a.mode, who) : undefined
  void pump($)
  return { changes, mode }
}

/** The owner changes settings (/<name>-settings or the Settings view): the answer to show, e.g. "max_parallel set to 5"; the lead is told too. */
export async function ownerSettings($: $, a: SettingsInput, where: string): Promise<string> {
  // the on/off switch is the owner's alone and works like /<name>-off and /<name>-on
  if (typeof a.enabled === 'boolean') {
    const { enabled, ...rest } = a
    const said = await setSymcc($, enabled)
    return Object.keys(rest).length ? `${said}; ${await ownerSettings($, rest, where)}` : said
  }
  const r = await saveSettings($, a, 'you')
  if (r.error) return r.error
  const parts = r.changes.map(settingSetText)
  if (r.mode) parts.push(`mode set to ${a.mode}: ${r.mode}`)
  const text = parts.join('; ') || 'nothing changed'
  if (parts.length) tellLead($, `The owner changed the ${S.N.name} settings ${where}: ${text}`)
  return text
}
