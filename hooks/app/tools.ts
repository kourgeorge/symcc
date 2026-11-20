import type { SymccTask } from '../../types'
import { allowFiles, refuseFiles, waitsForFiles, filesRefusedText, type BoardTask, STATUS_WORD, fromText, fmtRun, fmtTotal, sumRuns, taskCommits, commitText, rolesLeadText, BUILT_IN_ROLES, ROLE_TOOL_WORDS, DEFAULT_ROLE, find, boardText, shortHome, checkRole, makeOrigin, addTask, evidenceText, stashTask, patchTask, promoteTask, rejectTask, changeLines, stoppedEntry, withHistory, historyLineText, type SettingsInput, type SettingChange, testMinutesRefusal, isMode, isNotify, notifyRefusal, applySettings, intoOf, crossBranchNotes, parseGoneBranch, saysMergeInstead, type Board, settingSetText, taskReports, reportPreview, statsReport, parseStatsRange, parseStatsArgs, readArchive, archivedCount, localOffset, endedBy, stopEnd, changeRestartWhy, changedFields, addDetailsText, noteAddedLine, detailsBothRefusal, dayOf, inPlan, planBacklog, planAdded, planAddText, parseScoutUsage, parseStatusFilter, BOARD_STATUSES, type TeamInput, SETTING_NAMES, leadSettingsText, readSoundSet, findingToBacklog, isScoutFindings, isTestsWithChanges, kindFor, isAnswered, askMoreTask, isInvestigation, checkKind, kindsLeadText, kindNames, BUILT_IN_KINDS, originOf, stateLabelLower, modeOf, when } from '../board'
import { scoutMemoryFile, leadScouts, linkTaskToScoutRun } from './scouts'
import { archivedText, bringBackArchived, findArchived } from './archive'
import { removeWorktree, worktreeDir, setupGit, branchExists, branchList, homeBranch, taskWork, resetScratch } from './git'
import { loadRoles, leadRoles } from './roles'
import { loadKinds, leadKinds } from './kinds'
import { S, heard, workers, toolName } from './state'
import { type Host, type HostFeatures, ALL_FEATURES } from '../host'
import { load, change, now, path } from './store'
import { noteForLead, brief, tellLead } from './tell'
import { playable, playSample } from './voice'
import { pump, approve, mergeWaiting, checkingNow, stopAsked, CHECKING_TEXT, mergingNow, MERGING_TEXT, fullAnswer } from './workers'
import { stopWorker, setBoardMode, setSymcc } from './board-mode'
import { answerOvertime } from './cleanup'
import { haltChecker } from './checker'
import { questionTool } from './questions'
import { markMerged } from './merged'
import { publish } from './lead'
import { orgMemTool } from './org-mem'
import { ORG_MEM_MAX_LINES } from '../core/org-mem'

// ---------------- the lead's tools ----------------

/** The latest saved report of task `t` (see taskReports): its file and text; text null when the file can't be read. Null when there is none. */
export async function latestReport($: Host, t: SymccTask): Promise<{ file: string; try: number; text: string | null } | null> {
  const r = taskReports(t).at(-1)
  if (!r) return null
  return { ...r, text: await $.fs.read(path(r.file)).then(x => String(x), () => null) }
}

/** Task `t` as text for /<name>-task; `report` is its latest saved report (latestReport), shown last. */
export function taskText(t: SymccTask, running: boolean, all: SymccTask[] = [], report?: { file: string; try: number; text: string | null } | null, archivedDone: string[] = []): string {
  const word = STATUS_WORD
  const L = [`${t.id}  [${word[t.status]}]  ${t.title}`, `added ${when(t.created_at)} · changed ${when(t.updated_at)} · tries ${t.attempts}`]
  L.push(fromText(t, 120))
  if (t.origin?.why) L.push(`why: ${t.origin.why}`)
  if (t.origin?.evidence) L.push(`seen by ${S.N.name}: ${t.origin.evidence}`)
  if (t.note) L.push(`${stateLabelLower()}: ${t.note}`)
  if (t.status === 'waiting' && t.question) L.push('', `ASKS: ${t.question}`)
  const bt = t as BoardTask
  if (t.status === 'waiting' && bt.options?.length) L.push(`OPTIONS: ${bt.options.join(' | ')}`)
  L.push('', 'What to do:', ...(t.details.trim() ? t.details.split('\n').map(l => (l.trim() ? `  ${l}` : '')) : ['  (no details)']))
  L.push('', 'May change:', ...(t.files.length ? t.files.map(f => `  ${f}`) : ['  anywhere in the project']))
  L.push('', `merges into: ${intoOf(t)}`)
  if (t.after.length) {
    L.push('', 'Waits for:')
    for (const id of t.after) {
      const dep = all.find(x => x.id === id)
      L.push(`  ${id} ${dep ? `[${word[dep.status]}] ${dep.title}` : archivedDone.includes(id) ? `[${word.done}] (archived)` : '[missing]'}`)
    }
    for (const n of crossBranchNotes(t, all)) L.push(`  note: ${n}`)
  }
  if (t.history.length) L.push('', `What happened (${t.history.length}, newest first):`, ...[...t.history].reverse().map(h => `  • ${historyLineText(h)}`))
  if (t.runs?.length) L.push('', 'Time and cost:', ...t.runs.map((r, i) => `  ${fmtRun(r, i, Date.now())}`), `  total: ${fmtTotal(sumRuns(t.runs, Date.now()))}`)
  const commits = taskCommits(t)
  if (commits.length) L.push('', 'Commits (newest first):', ...commits.map(c => `  ${commitText(c)}`))
  if (t.branch) L.push('', `branch: ${t.branch}`)
  if (t.research_notes?.length) L.push('', ...t.research_notes.map(f => `Research: ${f}`))
  if (report === null && t.attempts > 0) L.push('', 'Report: no saved report')
  if (report) L.push('', `Report (try ${report.try}, ${report.file}):`, ...(report.text === null ? ['  (could not read the file)'] : reportPreview(report.text, report.file).map(l => (l ? `  ${l}` : ''))))
  const older = taskReports(t).filter(r => r.try !== report?.try)
  if (report && older.length) L.push('', 'Older tries\' reports:', ...older.map(r => `  try ${r.try}: ${r.file}`))
  if (running) L.push('', 'A worker is on it now: open it from the agents list to watch.')
  return L.join('\n')
}

/** The /symcc-help manual, for the host's `features` (every one on unless given): without a panel /symcc shows the board as text. */
export const MANUAL = (features: HostFeatures = ALL_FEATURES): Record<string, string> => ({
  overview: `${S.N.name} turns this session into a small team.
  • The board (${S.N.dir}/board.json) holds the tasks. You and the lead manage it by talking.
  • The lead is this chat. It turns what you want into tasks and decides what happens next.
  • Workers are background agents. Each builds one task in its own copy of the code
    (${S.N.dir}/worktrees/T-n). When it finishes, ${S.N.name} checks the files it changed, runs the
    tests and merges only if they pass. Each task merges into the branch you were on when it
    was made (its copy starts from that branch too). In mode
    review (or for a task with needs_review) it waits for your approve or reject first.
  • The board has one mode: paused (nothing runs), review (work runs; finished work waits for
    you) or auto (work runs; finished work that passes merges on its own; the default).
  • Scouts are background agents on a timer (every_minutes: 0 means only on demand). Each
    does what its file asks (reading the project, running shell commands, searching the
    web) and reports to the lead, which decides what goes on the board.
  Topics: /${S.N.help} commands · tasks · lead · workers · scouts · safety`,
  commands: `Commands
${features.panel ? `  /${S.N.name} opens everything; /${S.N.name}-WORD does one thing: a plural noun opens a view
  (tasks, scouts), a singular noun acts on one named item (task, scout), a verb acts
  (approve, reject, diff), and mode and settings change how the board works. The "board" is
  the whole panel: tasks, scouts and settings.` : `  /${S.N.name} shows the board as text; /${S.N.name}-WORD does one thing: a plural noun shows a list
  (tasks, scouts), a singular noun acts on one named item (task, scout), a verb acts
  (approve, reject, diff), and mode and settings change how the board works.`}
${features.panel ? `  /${S.N.name}                     open the board panel (↑↓ move, Enter opens, f searches the tasks, t / s / c switch views)
  /${S.N.name}-tasks               open the panel on the tasks view
  /${S.N.name}-scouts              open the panel on the scouts view and reload the scout files` : `  /${S.N.name}                     show the board
  /${S.N.name}-tasks               show the tasks
  /${S.N.name}-scouts              show the scouts and reload the scout files`}
  /${S.N.name}-task T-3            ${features.panel ? 'open' : 'show'} one task
  /${S.N.name}-task T-3 WORD       do one of its page's actions: pause, resume, retry,
                       drop [REASON], merged (already merged by hand), review on|off,
                       stash (to the backlog), todo (out of the backlog), role NAME,
                       note (an answered investigation: keep it as a note)
  /${S.N.name}-approve T-5         merge a task that is ready for review
  /${S.N.name}-reject T-5 REASON   send it back to "todo" with the reason
  /${S.N.name}-diff T-5 [FILE]     the files it changed (+/- lines), or one file's diff
  /${S.N.name}-scout NAME          run a scout now
  /${S.N.name}-scout NAME pause    pause a scout's timer (run now still runs it)
  /${S.N.name}-scout NAME resume   resume a paused scout${features.panel ? ' (p on its page does both)' : ''}
  /${S.N.name}-mode [paused|review|auto]  set the board mode; no word switches review and auto
                       (from paused, no word goes to review)
                       paused: stop every worker and scout now, start nothing new
                       review: work runs; finished tasks wait for your approve or reject
                       auto: work runs; finished tasks that pass merge on their own
  /${S.N.name}-settings [NAME VALUE]  ${features.panel ? 'open the settings view' : 'show the settings'}, or set one setting, e.g.
                       /${S.N.name}-settings max_parallel 5 · /${S.N.name}-settings notify sound
                       /${S.N.name}-settings mode review · /${S.N.name}-settings test_commands "npm test"
                       (a typed line is one whole shell command; several go in a list like ["npm test", "npm run lint"];
                       "none" clears them)
                       a value over its limit is cut to it, and the answer says so
  /${S.N.name}-stats [full] [7d|T-1..T-9]  time and token stats, with bar charts:
                       tasks, worker time, tokens, the whole team (lead, workers, scouts),
                       per task and per try, the biggest tasks, how tasks ended, by role,
                       origin and day (all tasks, the last N days, or an id range);
                       "full" adds the long explanations
  /${S.N.name}-disable             disable ${S.N.name} for this project: ${S.W.assistant} works as normal (no lead
                       guide, no workers, scouts, updates, sounds or voice); the board is kept
  /${S.N.name}-enable              turn it back on, in the mode the board had
  /${S.N.name}-drive               make this session drive the board (start workers, merge, run scouts);
                       a session that drives now hands over within 30 s, its running workers
                       restart here without using up a try
  /${S.N.help} [TOPIC]           this manual
${features.panel ? `On the board: t tasks · s scouts · c settings · m switch review / auto.
In the settings view: Enter on a row changes it: on/off flips, mode, notify, scout_findings and
  tests_with_changes open a pick list (notify shows only what this machine can play), numbers and test_commands an edit box
  · Cancel (x) or Enter on an empty box leaves it · b back to the tasks.
In the panel nothing needs Esc: Enter on an empty text box cancels it (on the search it clears the
  search), and pick lists and pages have a Cancel or Back button. On the board list x clears a search.
In an open task: b back · p pause · u resume · r retry · x drop · w watch the worker · n needs review on/off
  · y copy the task's content · z stash to the backlog (a task to do, paused or failed)
  · l pick the worker role (a task to do, paused, failed or in the backlog).
  · h already merged: marks a failed, waiting, paused or dropped task done whose work was merged by hand (checked with git first; nothing is merged or tested).
In a backlog task: o move to todo · x drop · l role.
On the board list a task's role shows at the right end of its row ("tester"); general shows nothing. The list rows show no try number; the band above the prompt shows a later try as "(n)" right after the row's time ("T-5 ⧗ 3m (3)"), and the task page shows "try 3/4". A task to do that waits on others shows "after T-x"; a task in review shows "Enter to review"; a task that merges into another branch than the one you are on shows "→ that-branch".
The board list goes top to bottom: NEEDS YOU (with its title); then the tasks doing and to do in one list without a title (running first, then to do, then paused); a blank line; then the folded rows "▸ Backlog  N", "▸ Done  N" and "▸ Dropped  N". Enter on a folded row opens it (the backlog shows 5 items, then "… N more").
Backlog tasks are ideas and unclear work; they start only when you move them to todo (o).
In a task ready for review: a approve · x reject (asks for a reason) · d show changes.
In an answered investigation: a done · v keep as a note (adds a docs task) · x ask more (asks for a follow-up question).
On the board list: m switches the mode between review and auto (never to paused).` : `There is no board panel here: the commands above answer as text, and the lead
  can show the board too ("show the board", "show T-3").`}
Everything else, just say to the lead: "pause T-5", "drop T-2", "do T-4 first",
"set the test command to npm test", "give workers 90 minutes".`,
  tasks: `Tasks
  Fields: title, details (what to do and how we know it works), files (what the worker
  may change; empty = anywhere), after (tasks that must be done first), order (lower
  runs first), role (the worker role: ${BUILT_IN_ROLES.join(', ')},
  or one in .${S.N.name}/roles/; it brings a checklist, skills and maybe a model), plus status, note, question, tries, history, branch, when added/changed, and merge_into:
  the branch it merges into, which is the branch you were on when it was made.
  Statuses:
    to do            waiting for a free worker (and for its "after" tasks)
    doing            a worker is on it
    paused           stopped on purpose; resume to continue
    waiting for you  a question for you; ${features.panel ? 'answer it in the board panel or tell the lead' : 'tell the lead your answer'}
                     (asked by the lead, or by a worker: a question, or files outside its
                     list); with notify on you hear "symcc: T-5 needs you" (or a chime)
    ready for review the worker is done and the checks passed; nothing is merged until you
                     approve it (or reject it with a reason, which sends it back to "todo")
    failed           tests failed, files outside its list changed, or the worker stopped
    done             merged into its branch (merge_into)
    dropped          given up
    backlog          an idea or work that is not clear yet; it never starts until you
                     move it to todo ("stash this idea", "show the backlog", "move T-5 to todo")
  The board lists the newest task at the top.
  Done and dropped tasks older than archive_days (14 by default; 0 = never) move to
  ${S.N.archiveFile}. They still count ("▸ Done  12 (+96 archived)"), /${S.N.name}-task T-n still
  shows one, and they are read-only (retry brings back an archived dropped task).`,
  lead: `The lead (this chat) has these tools:
  ${TOOLS().map(t => t.name).filter(n => n !== 'approve' && n !== 'reject').join(' · ')}
  approve · reject (only for a task ready for review)
  scouts lists, adds, changes, removes or runs scouts; roles lists, adds, edits, resets,
  removes or turns off / on worker roles; kinds does the same for the task kinds (roles are how you shape what a worker
  does: a role fills the {{role}} slot of the fixed, built-in worker prompt); stats shows time and token use;
  orgmem lists and changes the org-mem notes (agents only suggest notes; the lead decides what goes in);
  setup_git sets up git in a folder without it (only after you say yes).
  question puts a question for you that is not about one task on the board${features.panel ? ` ("Questions for you" at the
  top of the task list${features.band ? ', and "1 question for you" in the band' : ''}); answer it there with a button or your own
  words, or in the chat (the lead closes it then).` : `, where it waits until it is
  answered${features.band ? ' ("1 question for you" in the band)' : ''}; the lead lists the open ones; answer it in the chat (the lead closes it then).`}
  board lists the open tasks and the backlog (done / dropped only as counts); it takes status
  and search to narrow the list, and task to see one task with its latest report.
  Each task merges into the branch you were on when it was made (there is no branch
  setting); change merge_into moves one task to another existing branch.
  settings: test_commands (must pass before a merge), test_minutes (how many minutes each test
  command may run before merging, 1-120, 10 by default), max_parallel (workers at once, 1-8),
  max_minutes (a worker running longer makes symcc ask you for more time), auto_retries (new tries on their own
  after failing tests, 2 by default), archive_days (done and dropped tasks older than this
  many days move to the archive, 14 by default, 0 = never), ${features.panel ? `open_on_start (open the board panel when a
  session starts, on by default), ` : ''}notify (off, sound or voice: when a task is merged or a worker
  asks you something, play a chime, or say "symcc: T-3 done" / "symcc: T-5 needs you" out loud (the project's name first); only the
  session driving the board plays; voice by default where this machine can speak, else sound,
  else off; a choice this machine can't play is refused), sound_set (1, 2 or 3: which chimes
  sound plays, so you can tell projects apart; picked from the project's folder name unless set,
  and picking one plays its chime), scout_findings (auto, the default:
  the lead decides and a scout finding it adds goes to todo and runs; backlog: every task
  added from a scout finding goes to the backlog and waits for you), tests_with_changes (a change
  task whose commit edits code but no test file: ask, the default, merges it and tells the lead
  "T-3 changed code but no test"; review makes it wait for your review; off does nothing; docs-only
  changes are never flagged), checker (off by default; on: before a change joins the merge queue,
  where its tests run, a fresh checker tries to break it; OK goes on, a list of problems
  sends it back to its worker with the report, counting as a retry; investigations and docs-only
  changes skip it), mode (paused stops every
  worker and scout and starts nothing new; review makes every finished task wait for
  your approve or reject; auto, the default, merges a finished task that passes at once),
  enabled (off disables the whole plugin; only you can change it, with /${S.N.name}-disable and /${S.N.name}-enable).
  You can also change every setting yourself with /${S.N.name}-settings${features.panel ? ` (or the c tab in the
  board)` : ''}. A value over its limit is cut to it, and the answer says so.
  add and change also take needs_review: that one task waits for review even in mode auto.
  Going from review to auto does not merge tasks already in review; approve or reject them.
  Tasks in review can be approved or rejected in every mode, also paused.
  After each worker finishes, the lead gets a "[${S.N.name}] Board update" message and decides what
  to do next: retry, change, split, ask you, or drop.`,
  workers: `Workers
  • Up to max_parallel run at once (3 by default), one per task.
  • A worker gets only its task, its folder, its allowed files and the test commands.
    It can't see the board or this chat, and must not commit, push or merge.
  • A resumed or retried task starts over with a fresh worker.
  • A worker's edit of a file outside its list is refused and recorded as a request;
    the worker then stops. The task waits for you: ${features.panel ? `on its page press Allow (the files
    are added and it goes back to work) or Don't allow (the lead drops or narrows it).` : `tell the lead to allow them (the
    files are added and it goes back to work) or not (the lead drops or narrows it).`}
    A worker that changes such files another way (e.g. a shell command) fails its try.
  • A worker that needs you to decide something asks with its ask_owner tool (maybe
    with choices) and stops; the task waits for your answer.
  • A worker whose run ended on an error or a refusal fails its try, with the reason.
  • Every two minutes ${S.N.name} checks by itself: starts ready tasks, asks you for more time
    for a worker running longer than max_minutes (45 by default; +30 min, +60 min or Stop it;
    stopping first lets it write down and hand back what it has, kept for a retry), notices a worker that ended without a result,
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
  You can also ask the lead to list, add, change, remove or run a scout for you.
  every_minutes: 0 means only on demand: it never runs on the timer, only with run now
  or /${S.N.name}-scout NAME. A value that is not a whole number (like -5) also means only
  on demand, and the scout shows a warning until the file is fixed.
  Pause one with ${features.panel ? 'p on its page or ' : ''}/${S.N.name}-scout NAME pause: it doesn't run on its timer
  until you resume it, but run now still runs it once (it stays paused). A run going on finishes first. The pause
  is kept in ${S.N.dir}/scouts.json, so its file is not changed.
  Examples: examples/scouts/ in the plugin.`,
  safety: `Safety
  • Changes outside a task's files, or that fail the tests, are never merged.
  • Review step (optional): in mode review (/${S.N.name}-mode review) or for a task with needs_review,
    finished work that passes waits as "ready for review" (its branch and folder are kept).
    approve runs the same checked merge (brought up to date, scope checked, tests again if it
    had to merge); reject with a reason sends it back to "todo" for a fresh worker.
  • Files whose names look like secrets (.env, .env.*, *.pem, *.key, id_rsa, ...) are left out of a
    worker's commit and merge (after a merge they are kept in ${S.N.dir}/left-out/<task>/); deleting
    one merges normally. Templates (a lower-case .example, .sample, .template, .dist or .defaults
    ending, like .env.example or .env.local.example) are not secrets and merge like any file. A task that changed only such files waits with a question: answer to
    retry without them (say what to do instead), or drop it.
  • A task's branch only moves by a checked merge. Your uncommitted edits on it are kept; only
    edits (or untracked files) in files the task changes make it wait, and it merges by itself
    once they are committed, stashed or undone ("retry T-x" merges it at once; no new worker).
  • Each task merges into the branch you were on when it was made (on a detached checkout,
    main or master). The board list shows "→ x" for a task that merges into another branch
    than the one you are on now. If that branch is gone when the task starts or merges, it
    waits for you ("branch x is gone: merge into main instead?"); nothing is marked failed.
  • A task that waits for a task on another branch won't get that task's change: the task
    page says so ("T-6 is on x but waits for T-5, which merges into main").
  • Workers can edit files in their own folder without asking. Their shell commands follow
    your normal permission rules (your settings' allow list applies to them too).
  • Scouts can't edit or write files. They can run shell commands (these follow your normal
    permission rules, like workers) and search and fetch web pages. They are told not to
    change the project; changes only go through board tasks.
  • Test commands are run by ${S.N.name} itself, without a permission prompt.
  • Add ${S.N.dir}/ to the project's .gitignore.
  • A folder with no git repo (or no commits yet): nothing starts. ${S.N.name} asks first, then
    (${features.panel ? 'press g in the board, or ' : ''}the lead's setup_git) runs git init on main, writes a .gitignore
    and makes a first commit of your files, leaving out secrets (.env, *.pem, id_rsa; templates like .env.example are kept) and files
    over 50 MB. It never pushes or adds a remote. With git not installed nothing starts at all.`,
})

export function manual(arg: string, features: HostFeatures = ALL_FEATURES): string {
  const MAN = MANUAL(features)
  const key = arg.trim().toLowerCase()
  if (!key) return Object.values(MAN).join('\n\n')
  const hit = Object.keys(MAN).find(k => k.startsWith(key))
  return hit ? MAN[hit]! : `No topic "${arg.trim()}". Topics: ${Object.keys(MAN).join(', ')}`
}

/** Added to the add tool's answer in mode review: the owner's yes comes in the chat, which symcc can't see. */
export const REVIEW_ADD_REMINDER = '\nReview mode: did the owner say yes to this task?'

/**
 * The lead's guide, for the host's `features` (see HostFeatures; every one on unless given): without plan mode the
 * plan mode paragraph is left out. The host's words (S.W) name its plan mode.
 */
export const leadGuide = (features: HostFeatures = ALL_FEATURES) => `## ${S.N.name}: you are the lead (main conversation only)
This section is for the main conversation only. If you are a subagent (a ${S.N.name} worker or scout, or any other), ignore it and do the job you were given.

The project has a shared task board (${S.N.dir}/board.json) that you and the owner manage together by talking. You decide how the work runs:
- Turn what the owner wants into tasks with ${S.N.name} add (title, details = what to build and how we know it works, files = the narrowest files/folders the worker may change incl. tests, after = tasks that must be done first). Keep tasks small; split big wishes. Every change task's details say how the change will be tested, e.g. "Done when: tests show …" (the test that will check it). A change task whose commit edits code but no test file is flagged before merging (setting tests_with_changes: ask, the default, merges it and tells you "T-5 changed code but no test", so follow up with a test task or ask the owner; review makes it wait for the owner's review; off does nothing). Test files: in a test/, tests/, __tests__/, spec/, e2e/ or cypress/ folder (or a folder ending .Test/.Tests), or with test/spec/e2e/cy as a name part split by . _ or - (a.test.ts, a-test.ts, a.cy.ts), or a name ending in Test/Tests (FooTest.java); latest.ts and run-tests.sh are not tests. Docs: .md/.mdx, README/CHANGELOG/LICENSE names, images/video/audio/fonts, non-code files under docs/ (not docs/build.ts or Notice.tsx). A docs-only change is never flagged.
- Every ${S.N.name} add must say where the task came from, so it can be traced back: why (one line, required), origin_by, and: for an owner request, request = the owner's words quoted exactly; for a scout finding, scout = the scout's name; for a split or follow-up, from_task = that task's id (and how: split or follow-up); for something a worker reported, origin_by worker with from_task; for your own idea, origin_by lead. ${S.N.name} also notes what it saw itself (the last owner prompt, the last scout or worker report).
- When two tasks may change the same files, make the later one wait for the earlier one (after), so they don't clash when merging. If the add answer says a task waits for one on another branch, that task's change won't be in it: tell the owner if it matters. Tasks with different files can run in parallel. Decide this yourself; don't ask the owner.
- A task waits until every task in its after list is done; if one of those is dropped or failed, change the waiting task's after (or drop it), or it waits forever.
- Keeping the board in order (triage): older tasks go first unless the owner says a task is urgent; bugs and safety fixes go before features. Use order for priority (lower runs first), not only after. Chain tasks with after only when they really share files; tasks with different files should run side by side. Never leave a task waiting forever. When a new task shares files with an older task that is still waiting, the new one goes behind it (the new one gets after: the older one), not the other way round.
- ${S.N.name} runs a board health check after each change and every two minutes. When it finds something new you get one "Triage needed" board update: a task waiting on a dropped, failed or missing task, tasks waiting on each other in a loop, an older task that keeps getting pushed back, a chain of tasks that share no files, or a task waiting on the owner for over an hour. Fix it with the triage rules above (${S.N.name} change after / order, retry, drop), or ask the owner if it is their call. Each problem is told once, and again only after its tasks change.
- Workers start by themselves on ready tasks, each in its own copy of the code. When one finishes, its change is tested and, if it passes, merged. Each task merges into the branch you were on when it was made (the branch checked out in the project then; its worker's copy starts from it). If that branch is gone when it starts or merges, the task waits for the owner with a question; ${S.N.name} change merge_into moves a task to another existing branch. You then get a "[${S.N.name}] Board update" message: decide what's next (retry with ${S.N.name} change / ${S.N.name} retry, split, ${S.N.name} ask the owner, or ${S.N.name} drop). A worker's or scout's own report reaches you as its message (the agent's hand-back); the board update then gives only the outcome (merged, ready for review, failed) and doesn't repeat it.
- The owner's own actions on the board (approve, reject, drop, move to todo, stash, mode and settings changes, answers to a task) and merges they approved don't send you a message: they come as "Meanwhile the owner:" lines at the top of the next board update. They need no reply; just take them into account.
${
  S.W.askPopup
    ? `- Ask every question for the owner that isn't about one task (a settings choice, "add a scout?", "raise the version?") with ${S.W.askPopup} (2 to 4 short options). ${S.N.name} puts each such question on the board by itself as a Q-n, so don't also add a ${S.N.name} question for it. Whichever the owner answers first closes the other: a board answer comes back as the pop-up's answer, and a pop-up answer closes the Q-n (the tool result says so). If the owner closes the pop-up without answering, the Q-n stays on the board, and a later board answer wakes you with a board update saying "The owner answered your question Q-3 (…): <answer>. … Act on it." (already closed: act on it and don't ask again). Only for a question with 5 or 6 options, first add it with ${S.N.name} question (action add), then ask it with ${S.W.askPopup} with the same question text and the first 3 options plus "the rest on the board": the pop-up is tied to that Q-n. Drop a question that no longer matters (${S.N.name} question action drop). A question about one task stays ${S.N.name} ask.
- Questions the owner can also answer on the board (a review, an answered investigation, a worker's question or file request, more time) you ask in the chat with ${S.W.askPopup}, with the same options (where a line here says numbered plain chat text, use ${S.W.askPopup} with those options), with the question's header set to exactly the task id (T-5; an id only mentioned in the question text doesn't tie it). ${S.N.name} ties that pop-up to the task's own board question (no Q-n is added): whichever the owner answers first closes the other. A board answer comes back as the pop-up's answer; a pop-up answer is put into the task for you (an answer, more time, Allow or Don't allow, Approve, Done, Keep as a note), and the tool result says what was done and what is left for you (e.g. a reject's reason: then ${S.N.name} reject yourself). ${S.W.askPopup} takes at most 4 options per question: when a question has more, show the first 3 plus "the rest on the board" (or the owner types one under Other); when the owner picks "the rest on the board", the board question stays open and a board update brings their answer. Don't stack two questions under the same numbers: ask one at a time.`
    : `- Put every question for the owner that isn't about one task (a settings choice, "add a scout?", "raise the version?") on the board with ${S.N.name} question (action add, with 2 to 6 short options), and ask it briefly in the chat too, with the options as numbered plain chat text, plus "or answer on the board". Never leave a question only in the chat: chat questions scroll away and get forgotten. If the owner answers in the chat, close it with ${S.N.name} question action answer (id and their words); a board answer wakes you at once with a board update saying "The owner answered your question Q-3 (…): <answer>. … Act on it.", already closed: act on it and don't ask again. Drop a question that no longer matters (action drop). A question about one task stays ${S.N.name} ask.
- Questions the owner can also answer on the board (a review, an answered investigation, a worker's question or file request, more time) you ask as plain chat text with numbered options, plus "or answer on the board". Don't stack two questions under the same numbers: ask one at a time.`
}
- The board has one mode (${S.N.name} settings mode): "paused" stops every worker and scout and starts nothing new, "review" runs work but every finished task that passes waits for the owner, "auto" (the default) merges finished work that passes on its own. Tasks in review can be approved or rejected in every mode.
- In mode "review", ask the owner before every ${S.N.name} add, whatever the task comes from (the owner's words, a scout finding, a worker's report, your own idea): say in one or two lines what the task would be, and add it only after a yes. In mode "auto" you add tasks as usual. Plain answers, notes (add_details) and board actions (approve, pause, settings) need no asking.
- Review before merge (optional): in mode review, or with needs_review on one task (${S.N.name} add / change), a finished task that passes stays "ready for review" instead of merging. You get "T-5 is ready for review": show the owner the change (its branch), then ${S.N.name} approve T-5 (merge it) or ${S.N.name} reject T-5 with the owner's reason (a fresh worker redoes it). Only approve when the owner says so. Going from review to auto does not merge tasks already in review.
- Work merged by hand: when a task's branch was merged outside the board (by the owner, or by you on the owner's word, e.g. its only failure was the merge tests timing out), don't drop it and don't let a new worker redo it: ${S.N.name} merged T-5 marks it done. ${S.N.name} checks with git that all its commits are in the branch it merges into and refuses with the reason if not; nothing is merged or tested, its folder and branch are cleaned up, and tasks waiting on it start. It works for a task that is to do, running, failed, waiting, paused, in review or dropped. Use it only after the owner's word or a rule the owner set.
- Investigation or change (kind in ${S.N.name} add / change): add an investigation when the owner wants an answer, or input for a decision they will make: "is it possible ...", "should we ...", "how does X work", "why is Y slow". Add a change when a lasting result is needed: code, or a document that stays in the project because later tasks or people will read it. A researcher task is an investigation unless you give kind: change. An investigation always waits for the owner to read its answer, even in mode auto; never mark it done yourself.
- An answered investigation ("T-5 is answered") waits in review for the owner to read its answer; it has nothing to merge. Tell the owner the answer in the chat, short and plain (read it with ${S.N.name} board task T-5), and offer the three choices as numbered plain chat text (1 Done, 2 Keep as a note, 3 Ask more), plus "or answer on the board". On the owner's word: ${S.N.name} approve T-5 is Done (it ends done; its folder is removed, and its branch too unless it has commits from earlier tries, which are kept; the reply says so), ${S.N.name} approve T-5 with keep_note: true is Keep as a note (Done, plus a new docs task that writes docs/research/<topic>.md from the answer and merges as usual), and ${S.N.name} reject T-5 with their follow-up question is Ask more (a fresh try gets the question and the earlier answer).
- A worker that tries to edit a file outside its task's files is refused (${S.N.name} records the path as a request) and stops; the task then waits for the owner, asking to allow those files. The owner can allow the files from the board (Allow on the task's page: the files are added and it goes back to work; you only hear of it in a "Meanwhile" line) or not allow them (you are told: then drop it or narrow the plan). If they allow it here in the chat, ${S.N.name} change the task with the wider files (it goes back to work); otherwise ${S.N.name} drop it or change it to a narrower plan. A worker that changes such files another way (e.g. a shell command) fails its try at the merge's scope check.
- A worker that needs the owner to decide something calls its own question tool, ${toolName('ask_owner')} (maybe with options, which the board shows as buttons), and stops; that tool is for workers only: you never call it (to make a task wait with your own question, use ${S.N.name} ask). The task then waits for the owner (NEEDS YOU) with that question, and with notify on the owner hears "symcc: T-5 needs you" (the project's name first) (or a chime). You are told too. Answer it yourself only if the owner already clearly said the answer: then ${S.N.name} change the task with answer: that answer, and tell the owner what you answered. Otherwise always ask the owner in the chat, plain and short; if there are options, offer them as numbered plain chat text, plus "or answer on the board". Put their chat answer into the task with ${S.N.name} change and answer: their words. If they answer on the board first (a "Meanwhile" line), don't ask again. If ${S.N.name} change says the task was already answered, tell the owner their board answer was used.
- A worker whose run ended on an API error (retries used up, the context limit) or a refusal fails its try with that reason, and nothing is checked or merged; its work stays in its folder and branch, so ${S.N.name} retry continues from there. What a worker writes in its hand-back is only its report: symcc never reads a question or a file request out of it.
- A worker that runs past its time limit (max_minutes, plus any time the owner added) is not stopped: it keeps working, its task stays doing with the note "over time; asked the owner", and you are told "T-5 has run 45 min. Give it more time?" with the options +30 min | +60 min | Stop it (the owner hears "needs you" too, and the board shows them as buttons). Ask the owner in the chat, offering those choices as numbered plain chat text, plus "or answer on the board"; put their pick into the task with ${S.N.name} change and answer: "+30 min", "+60 min" (any "+N min" works) or "Stop it". More time moves that task's limit later and the worker goes on. Stop it (or no answer by the limit plus max_minutes again) tells the worker to write down what it has and hand back; a few minutes later it is stopped and the task fails, with its work kept in its folder, branch and report, so a retry continues from there.
- To add a note or one more line to a task's details, use ${S.N.name} change add_details: the note (added at the end as "Note (lead, <date>): ...", the rest kept, written in its history; a running task restarts). details rewrites the whole text, so use it only for a full rewrite, never both at once.
- When the owner answers a waiting task, put the answer into the task with ${S.N.name} change and answer: their words (that sends it back to work; what the worker already changed is kept).
- If you are told the folder has no git repo (or no commits), ask the owner whether to set one up; only when they say yes, run ${S.N.name} setup_git. Never do it without asking.
- Set the test command with ${S.N.name} settings (e.g. ["npm test"]); for a new project pick the stack and test command when you plan the first tasks.
- A scout with every_minutes: 0 runs only on demand: never on its timer, only when the owner presses "run now" or types /${S.N.name}-scout <name>. A scout whose every_minutes is not valid also runs only on demand, with a warning.
- Manage scouts with ${S.N.name} scouts, never by writing ${S.N.dir}/scouts/ files by hand: action list (the default) shows each scout (how often, paused, running, next and last run, the start of its last report), list with name shows one in full (with its last few runs: when, outcome, findings, tasks made from it and its report file); add / edit with name (lowercase letters, digits, dashes), every_minutes (0 = only on demand), optional model and prompt; remove deletes one (ask the owner first); run runs one now, like the owner's "run now".
- The owner can pause one scout (p on its page, or /${S.N.name}-scout <name> pause): a paused scout doesn't run on its timer until the owner resumes it, but "run now" (the owner's, or your scouts run) still runs it once and it stays paused. Only the owner pauses or resumes scouts; you can't.
- When ${S.N.name} stats (or a scout's "Results" line) shows a scout whose findings rarely merge for the tokens it uses, mention it to the owner once, as a suggestion, e.g. "secrets: 6M tokens, 1 task this week — pause it or run it weekly?". Never pause or slow a scout yourself.
- To stop work: ${S.N.name} pause pauses one task (its worker is stopped; ${S.N.name} resume continues it later, with a fresh worker). ${S.N.name} settings mode "paused" stops every worker and scout; mode "review" or "auto" starts work again.
- Ideas or work that is not clear yet go to the backlog (${S.N.name} add with backlog: true); they never start until moved to todo (${S.N.name} change backlog: false). Say 'stash this' / 'move T-5 to todo'. A scout's "maybe later" finding can go to the backlog too. The scout_findings setting (${S.N.name} settings): "auto" (the default) lets you decide where a scout finding goes; "backlog" puts every task you add with origin_by scout in the backlog, whatever you ask (the answer says "scout_findings is backlog: added to the backlog"); it starts only when the owner moves it to todo (or you do, on the owner's word). With backlog, still tell the owner what the scout found, so they can decide. ${S.N.name} change backlog: true stashes a to do, paused or failed task (a running one is stopped first). The mode (paused, review, auto) does not touch backlog items.
${features.planMode ? `- Plan mode (${S.W.planMode}): only plan. Nothing starts: every task you add goes to the backlog (the answer says "plan mode: ... added to the backlog"), and no new worker or scout starts; workers already running keep going. When plan mode ends you are told once which tasks were added to the backlog during it: ask the owner which to move to todo; don't move them yourself.
` : ''}- ${S.N.name} checks every two minutes on its own: it starts ready tasks, asks the owner for more time for a worker that runs longer than max_minutes (${S.N.name} settings), and reminds you about failed tasks nobody handled.
${rolesLeadText(S.roles, S.N.name)}
${kindsLeadText(S.kinds, S.N.name)}
- Manage worker roles with ${S.N.name} roles, never by writing ${S.N.dir}/roles/ files by hand: action list (the default) shows each role and where it comes from (built-in, replaced, added, off), list with name shows one in full; add (name, description, optional model, skills, tools, checklist); edit changes what you give (a built-in role is copied to ${S.N.dir}/roles/ first); reset brings a built-in back; remove deletes an added role (ask the owner first); off / on turns a role off or on (${DEFAULT_ROLE} can't be turned off; checker can't be turned on or off and is never a task's role: the checker setting runs it). An off role is never picked for a new task.
- Organizational memory (org-mem, ${S.N.dir}/org-mem.md) is short notes every new worker, checker and scout reads in its prompt. Agents only suggest notes; you decide what goes in, with ${toolName('orgmem')} (action list, add, replace, remove). When a board update lists "Suggested for org-mem" for a task, decide briefly, on your own (don't ask the owner about each): add only what is useful to agents on other tasks in this project, true beyond that task, short (one plain sentence, at most about 100 characters, without a task id) and not already there (not even in other words); org-mem goes into every prompt, so prefer replacing an old note with a better one over adding, and replace it with the better one when a note there says nearly the same; most suggestions are skipped. Mention in one line what you added (or nothing). At ${ORG_MEM_MAX_LINES} lines add is refused: remove or replace an old note first.
- Manage task kinds with ${S.N.name} kinds, never by writing ${S.N.dir}/kinds/ files by hand: action list (the default) shows each kind and where it comes from (built-in, replaced, added, off), list with name shows one in full; add (name, description, optional body); edit changes what you give (a built-in kind is copied to ${S.N.dir}/kinds/ first); reset brings a built-in back; remove deletes an added kind (ask the owner first); off / on turns a kind off or on (change and investigation can't be turned off). An off kind is never picked for a new task, and ${S.N.name} add refuses it. Only change kinds when the owner asks.
- Don't do the tasks' work yourself in the main conversation; let the workers do it. Talk about tasks by ID (T-3). Use ${S.N.name} board to see the board: with nothing it lists the open tasks and the backlog, and done / dropped only as counts; status (todo, doing, review, waiting, failed, paused, done, dropped, backlog, or open) and search (words, matched like the panel's search, plus filter words last:N, top:N, since:2d, status:, kind:, role:) narrow it, e.g. status: ["done"], search: "notify", or search: "last:5 status:done" for the 5 latest done tasks (not the whole list); with task it shows that task in full with its latest worker report (no need to read ${S.N.dir}/reports by hand).`

/** The kind parameter of add and change. */
const KIND_PARAM = () => ({ type: 'string', description: `The kind of task: ${[...new Set([...BUILT_IN_KINDS.filter(n => !S.kinds.some(k => k.name === n && k.off)), ...kindNames(S.kinds)])].join(', ')}, or the owner's own (see your instructions for what each is for); change when unsure. Every kind but investigation runs like change (the default): the worker changes files, which are committed, tested and merged. investigation: the worker finds an answer and hands it back; nothing is committed, tested or merged, and it always waits for the owner to read it (even in mode auto). A researcher task is an investigation unless you give kind; use change (or docs) for a researcher when the owner wants a lasting document that later tasks will read.` })

export const TOOLS = () => [
  {
    name: 'board',
    description: `Show the ${S.N.name} task board. With nothing: the open tasks and the backlog in full, done and dropped ones only as counts. With status and/or search: only the tasks that match (search takes filter words like last:5, top:3, since:2d, kind:bug); limit / sort keep the newest or next-to-run ones. With task: that one task in full (also an archived one), with its latest worker report and the files of older tries' reports.`,
    inputSchema: { type: 'object', properties: { task: { type: 'string', description: 'A task id, e.g. T-12, to see in full with its latest report.' }, status: { type: 'array', items: { type: 'string', enum: [...BOARD_STATUSES, 'open'] }, description: 'Only tasks with one of these statuses; "open" = everything not done, dropped or backlog. E.g. ["done"] to see the done tasks.' }, search: { type: 'string', description: 'Words; only tasks matching every word (id, title, details, role, status, origin), the same way as the board panel\'s search. Filter words too: last:N (the N changed most recently, newest first), top:N (the next N to run), since:30m / 2h / 2d / 2026-11-18 (changed since), status:done (or open), kind:bug, role:tester. E.g. "last:5 status:done".' }, limit: { type: 'number', description: 'Show at most this many (the same as last:N, or top:N with sort "order").' }, sort: { type: 'string', enum: ['newest', 'order'], description: 'newest: most recently changed first (as last:); order: what runs next first (as top:).' } } },
  },
  {
    name: 'add',
    description: `Add a task to the ${S.N.name} board. A worker starts on it when it is ready.`,
    inputSchema: { type: 'object', required: ['title', 'details', 'why', 'origin_by'], properties: { title: { type: 'string' }, details: { type: 'string', description: 'What to build and how we know it works.' }, files: { type: 'array', items: { type: 'string' }, description: 'Files/folders the worker may change, e.g. ["src/search.js", "test/"]. Empty = anywhere.' }, after: { type: 'array', items: { type: 'string' }, description: 'Task IDs that must be done first.' }, order: { type: 'number', description: 'Lower runs first.' }, needs_review: { type: 'boolean', description: 'Wait for the owner to approve before merging, even when the board merges on its own (mode auto).' }, backlog: { type: 'boolean', description: 'Put it straight into the backlog: an idea or not-yet-clear work that never starts until moved to todo.' }, role: { type: 'string', description: 'The worker role that fits the task (see your instructions for the list): researcher for "find out whether / how ..." tasks whose result is a note, not code; general when unsure.' }, kind: KIND_PARAM(), why: { type: 'string', description: 'Required. One line: why this task exists.' }, origin_by: { type: 'string', enum: ['owner', 'scout', 'worker', 'lead'], description: "Who it came from: the owner's request, a scout's report, a worker's report, or your own idea (lead)." }, request: { type: 'string', description: "For an owner request: the owner's words, quoted exactly." }, scout: { type: 'string', description: "For a scout finding: the scout's name." }, from_task: { type: 'string', description: 'For a split or follow-up, or a worker report: the task id it comes from, e.g. T-12.' }, how: { type: 'string', enum: ['split', 'follow-up'], description: 'With from_task: "split" (part of a bigger task) or "follow-up" (more work after it).' } } },
  },
  {
    name: 'change',
    description: 'Rewrite a task. details replaces the whole text; add_details adds a note to the end and keeps the rest (not both at once). A running task restarts on the new version; a waiting, failed or in-review one goes back to work; a paused one stays paused with the change saved (only resume or retry starts it again); a backlog one stays in the backlog. Changing only needs_review (wait for the owner before merging) just sets that flag. backlog: true stashes the task in the backlog (a running one is stopped first); backlog: false moves it from the backlog to todo.',
    inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' }, title: { type: 'string' }, details: { type: 'string', description: 'The new details: replaces the whole text. To add a line, use add_details instead.' }, add_details: { type: 'string', description: 'A note added to the end of the details as a new paragraph ("Note (lead, <date>): ..."), keeping the old text; it is written in the task\'s history too. Not together with details.' }, files: { type: 'array', items: { type: 'string' } }, after: { type: 'array', items: { type: 'string' } }, order: { type: 'number' }, needs_review: { type: 'boolean' }, backlog: { type: 'boolean', description: 'true: stash in the backlog (never starts); false: move from the backlog to todo.' }, role: { type: 'string', description: `The worker role for the task (${BUILT_IN_ROLES.join(', ')} or a project role): researcher for "find out whether / how ..." tasks whose result is a note, not code; general when unsure.` }, kind: KIND_PARAM(), answer: { type: 'string', description: "The owner's answer to a waiting task's question, in their words: it is added to the details and the task's history." }, merge_into: { type: 'string', description: 'Move the task to another existing local branch: it merges into that one (a task merges into the branch the owner was on when it was made).' } } },
  },
  { name: 'approve', description: 'Approve a task that is ready for review: its work is merged into its branch (the one the owner was on when it was made) by the same checked merge as always (brought up to date, scope checked, tests run again if it had to merge). Only for a task in "review". For an answered investigation it is Done: the task ends done, nothing is merged, its folder is removed, and its branch too unless it has commits from earlier tries, which are kept (the reply says so); with keep_note: true (Keep as a note) a new small docs task is added too that writes docs/research/<topic>.md from the saved answer and merges as usual.', inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' }, keep_note: { type: 'boolean', description: 'Only for an answered investigation: also add a docs task that keeps its answer as docs/research/<topic>.md.' } } } },
  { name: 'reject', description: 'Reject a task that is ready for review: nothing is merged, it goes back to "todo" with the reason in its history, and a fresh worker picks it up. Only for a task in "review". For an answered investigation it is Ask more: the reason is the follow-up question; it goes back to "todo" and the fresh try gets the question and the earlier answer in its details.', inputSchema: { type: 'object', required: ['task', 'reason'], properties: { task: { type: 'string' }, reason: { type: 'string', description: 'What is wrong and what to change, for the next worker (for an answered investigation: the follow-up question).' } } } },
  { name: 'retry', description: 'Put a task (back) to "todo" so a worker picks it up again, e.g. after it failed, or to bring back a dropped task on purpose. For a task whose finished work only waits for the owner\'s files on its branch ("waiting for your files on ..."), it only tries the merge again, with no worker. Not for a done task.', inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' } } } },
  { name: 'ask', description: 'Make a task wait for the owner with a question. Not for a done or dropped task (retry it first).', inputSchema: { type: 'object', required: ['task', 'question'], properties: { task: { type: 'string' }, question: { type: 'string' } } } },
  {
    name: 'question',
    description: `Put a question for the owner that is not about one task (a settings choice, "add a scout?", "raise the version?") on the board, so it can't scroll away in the chat. action "add": text (the question, plain and short) and options (2 to 6 short choices; the owner can always type their own answer too); it gets an id like Q-3, shows in the board panel under "Questions for you", in the band and the status line ("1 question for you"), and the owner hears "needs you" once. "list" (the default): the open questions and the last closed ones. "answer": id and answer: the owner answered in the chat; closes it with their words (says so when it was already answered on the board). "drop": id: takes a question back that no longer matters. When the owner answers on the board you get a board update at once: "The owner answered your question Q-3 (…): <answer>. … Act on it.", and the question is already closed. For a question about one task use ${S.N.name} ask instead.`,
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['add', 'list', 'answer', 'drop'], description: 'What to do; list when left out.' }, text: { type: 'string', description: 'For add: the question, plain and short.' }, options: { type: 'array', items: { type: 'string' }, description: 'For add: 2 to 6 short choices (buttons on the board).' }, id: { type: 'string', description: 'For answer / drop: the question, e.g. Q-3.' }, answer: { type: 'string', description: "For answer: the owner's answer from the chat, their words or the option they picked." } } },
  },
  { name: 'drop', description: 'Stop and drop a task.', inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' }, reason: { type: 'string' } } } },
  { name: 'merged', description: `Mark a task done whose work is already merged outside the board (by hand), e.g. after its only failure was the merge tests timing out. ${S.N.name} checks it with git first: every commit on the task's branch must be in the branch it merges into (merged, fast-forwarded, or rebased as equal changes); if not, it is refused with the reason ("T-5's branch has 2 commits that aren't in main yet"). Works for a task that is to do, running (its worker is stopped first), failed, waiting, paused, in review or dropped. The task becomes done with the history line "merged outside the board (<commit>); marked done by the lead", its commits are recorded, its folder and branch are cleaned up like after a merge, and tasks waiting on it can start. Nothing is merged and no test runs. Only on the owner's word or a rule the owner set.`, inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' } } } },
  { name: 'pause', description: `Pause one task: its worker (if running) is stopped and no new worker starts on it until ${S.N.name} resume.`, inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' }, reason: { type: 'string' } } } },
  { name: 'resume', description: 'Continue a paused task: it goes back to "todo" and a fresh worker picks it up.', inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' } } } },
  {
    name: 'scouts',
    description: `List, add, edit, remove or run the ${S.N.name} scouts (files in ${S.N.dir}/scouts/). action "list" (the default): every scout with how often it runs (e.g. "every 2 days", "on demand"), paused or not, running or not, its next and last run and the first lines of its last report; with name, that one scout in full (its prompt, whole last report and its last few runs: when, outcome, findings, tasks made from it and its report file). "add" / "edit": writes ${S.N.dir}/scouts/<name>.md (name: lowercase letters, digits and dashes; every_minutes: 0 = only on demand; optional model; prompt = what it looks for); edit keeps what you leave out. "remove" deletes the scout's file (confirm with the owner first). "run": runs it now, like the owner's "run now" (a paused scout runs too, once, and stays paused; refused with the reason when it is already running, or git isn't set up). The board shows every change at once. Pause and resume are for the owner only.`,
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'add', 'edit', 'remove', 'run'], description: 'What to do; list when left out.' }, name: { type: 'string', description: 'The scout, e.g. docs-check (lowercase letters, digits and dashes).' }, every_minutes: { type: 'number', description: 'For add / edit: how often it runs, in minutes (60 = every hour, 2880 = every 2 days); 0 = only on demand.' }, model: { type: 'string', description: 'For add / edit: optional model, e.g. sonnet; an empty text removes it.' }, prompt: { type: 'string', description: 'For add / edit: what the scout looks for, in plain words.' } } },
  },
  {
    name: 'roles',
    description: `List, add, edit, reset, remove, turn off or turn on the worker roles (built-in ones in the plugin's roles/ folder, the owner's own in ${S.N.dir}/roles/<name>.md). action "list" (the default): every role with its description and where it comes from (built-in, replaced = the owner's file over a built-in, added = the owner's own, off); with name, that role in full (front matter and checklist, and the {{placeholders}} the checklist may use: {{task_id}}, {{title}}, {{files}}, {{test_command}}, {{folder}}, {{branch}}, {{kind}}, filled in for each task; the checklist fills the {{role}} slot of the built-in worker prompt). "add": writes ${S.N.dir}/roles/<name>.md (name: letters, digits, - and _; description needed; optional model, skills, tools (only ${ROLE_TOOL_WORDS.join(', ')}: web searches and reads the web) and checklist); refused when the name exists (use edit). "edit": changes what you give and keeps the rest; a built-in role is first copied to ${S.N.dir}/roles/<name>.md. "reset": removes the owner's file for a built-in name, so the built-in comes back. "remove": deletes an added role's file (confirm with the owner first). "off": the role is never picked and not offered on the task page (${DEFAULT_ROLE} can't be turned off; checker can't be turned on or off, the checker setting runs it; tasks that already have it keep it); "on" turns it back on. A change counts from the next worker on. Only change roles when the owner asks.`,
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'add', 'edit', 'reset', 'remove', 'off', 'on'], description: 'What to do; list when left out.' }, name: { type: 'string', description: 'The role, e.g. tester (letters, digits, - and _).' }, description: { type: 'string', description: 'For add / edit: what the role is for, in a few words (the lead reads it to choose).' }, model: { type: 'string', description: 'For add / edit: optional model, e.g. sonnet; an empty text removes it.' }, skills: { type: 'array', items: { type: 'string' }, description: 'For add / edit: optional skills the worker should use.' }, tools: { type: 'array', items: { type: 'string' }, description: `For add / edit: optional extra tools (only ${ROLE_TOOL_WORDS.join(', ')}: web searches and reads the web); an empty list removes them.` }, checklist: { type: 'string', description: 'For add / edit: the checklist the worker follows (the file\'s body).' } } },
  },
  {
    name: 'kinds',
    description: `List, add, edit, reset, remove, turn off or turn on the task kinds (built-in ones in the plugin's kinds/ folder, the owner's own in ${S.N.dir}/kinds/<name>.md). action "list" (the default): every kind with its description and where it comes from (built-in, replaced = the owner's file over a built-in, added = the owner's own, off); with name, that kind in full (front matter and body). "add": writes ${S.N.dir}/kinds/<name>.md (name: letters, digits, - and _; description needed; optional body); refused when the name exists (use edit). "edit": changes what you give and keeps the rest; a built-in kind is first copied to ${S.N.dir}/kinds/<name>.md. "reset": removes the owner's file for a built-in name, so the built-in comes back. "remove": deletes an added kind's file (confirm with the owner first). "off": the kind is never picked for a new task and add refuses it (change and investigation can't be turned off; tasks that already have it keep it); "on" turns it back on. Only change kinds when the owner asks.`,
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'add', 'edit', 'reset', 'remove', 'off', 'on'], description: 'What to do; list when left out.' }, name: { type: 'string', description: 'The kind, e.g. chore (letters, digits, - and _).' }, description: { type: 'string', description: 'For add / edit: what this kind of task is, in a few words (the lead reads it to choose).' }, body: { type: 'string', description: 'For add / edit: free text about the kind (the file\'s body).' } } },
  },
  {
    name: 'orgmem',
    description: `Read or change organizational memory (org-mem, ${S.N.dir}/org-mem.md): short notes every new worker, checker and scout gets in its prompt, one line each ("- 2026-11-20: the note"), at most ${ORG_MEM_MAX_LINES}. Only you change it (agents only suggest notes; see "Suggested for org-mem" in board updates). action "list" (the default): every note with its number, oldest first. "add": notes (one or more short plain sentences, no task ids) go at the end with today's date; one that repeats a note there, even in other words, is refused (use replace to improve that note), and an add that would go past ${ORG_MEM_MAX_LINES} lines adds nothing (remove or replace first). "remove": takes out the note which names (its number from list, or its text). "replace": puts by in the place of the note which names (refused if by repeats another note).`,
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'add', 'remove', 'replace'], description: 'What to do; list when left out.' }, notes: { type: 'array', items: { type: 'string' }, description: 'For add: the new notes, each one short plain sentence.' }, which: { type: 'string', description: 'For remove / replace: the note, by its number from list (e.g. "3") or its text.' }, by: { type: 'string', description: 'For replace: the new note.' } } },
  },
  { name: 'stats', description: `Read-only: time and token stats of the ${S.N.name} board (incl. archived tasks): the whole team's tokens (lead, workers, scouts) and per merged task, totals, averages and medians per task and per try, outcomes, by role, origin and day. Use it when the owner asks e.g. "how much did we spend this week?" (range "7d"). Gives the full text with every detail; short: true gives the owner's shorter summary.`, inputSchema: { type: 'object', properties: { range: { type: 'string', description: 'Optional: "7d" (the last 7 days) or "T-100..T-130" (an id range); empty = all tasks.' }, short: { type: 'boolean', description: 'Optional: true for the shorter summary the owner sees with /stats (the same figures, fewer explanations).' } } } },
  {
    name: 'setup_git',
    description: `Set up git in a project folder that has no git repo or no commits yet (${S.N.name} needs one: each worker gets its own git worktree). Only run it after the owner said yes. It runs git init on branch main (if there is no repo), writes or adds to .gitignore (${S.N.dir}/, node_modules/, .env, .env.* but not templates like .env.example (!.env*.example etc.), .DS_Store, dist/, build/, __pycache__/, .venv/), and makes a first commit of the current files, leaving out (and ignoring) files that look like secrets or are over 50 MB. Open tasks then merge into that branch. Never pushes, adds no remote.`,
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'settings',
    description: 'Read or change how the team works. Called with no params it lists every setting with its current value and default, one per line, under the same category headings as the Settings view (Work, Checks before merging, Workers, Scouts, Board and alerts; notify also lists the choices this machine can play). Give one or more of these to change them (there is no branch setting: each task merges into the branch you were on when it was made): test_commands (shell commands that must pass before merging), test_minutes (how many minutes each test command may run before merging, a whole number 1-120, default 10; a test command past it fails like a failing test: a new worker try starts with the output, using one of the auto_retries; anything else is refused), max_parallel (workers at once), max_minutes (a worker running longer makes symcc ask the owner for more time: +N min or Stop it), auto_retries (new tries a task gets on its own after failing tests, 0-10, default 2), archive_days (done and dropped tasks older than this many days move to archive.json, 0 = never), open_on_start (open the board panel by itself when a session starts, default true), notify ("off", "sound" or "voice": what plays when a task is merged or a question from a worker waits for the owner: "sound" a short chime, "voice" says "symcc: T-3 done" / "symcc: T-5 needs you" out loud (the project name first); only the session driving the board plays; default voice where this machine can speak, else sound, else off; a choice this machine cannot play is refused with the reason), sound_set (1, 2 or 3: which of 3 sets of chimes "sound" plays, each with its own "done" and "needs you" chime, so the owner can tell which project chimed; absent: picked from the folder name of the project; the settings list shows the one in use), scout_findings ("auto", the default: you decide, and a scout finding you add goes to todo and runs; "backlog": every task added with origin_by scout goes to the backlog, whatever you ask, and starts only when the owner moves it to todo), tests_with_changes ("ask", the default: a change task whose commit edits code but no test file still merges and you are told "T-3 changed code but no test"; "review": such a task waits for the owner to review it instead of merging; "off": not checked; docs-only changes are never flagged), checker ("off", the default, or "on": after the prep step and before a change task joins the merge queue (its tests run once in the queue, after the checker), a fresh checker agent tries to break it; OK goes on as usual, a list of problems sends the task back to its worker with the report, counting as one of its auto_retries, and fails it once those are used up (no test run for that try); investigations and docs-only changes skip it), mode ("paused": stop every running worker and scout now and start nothing new, tasks in review can still be approved or rejected; "review": work runs and every finished task that passes waits for the owner to approve or reject it; "auto", the default: work runs and finished work that passes merges on its own; going from paused to review or auto starts work again, and going from review to auto does not merge tasks already in review).',
    inputSchema: { type: 'object', properties: { test_commands: { type: 'array', items: { type: 'string' } }, test_minutes: { type: 'number', description: 'Minutes each test command may run before merging: a whole number 1-120 (default 10).' }, max_parallel: { type: 'number' }, max_minutes: { type: 'number' }, auto_retries: { type: 'number' }, archive_days: { type: 'number', description: 'Done and dropped tasks older than this many days move to archive.json; 0 = never.' }, open_on_start: { type: 'boolean' }, notify: { type: 'string', enum: ['off', 'sound', 'voice'] }, sound_set: { type: 'number', enum: [1, 2, 3], description: 'Which of the 3 sound sets notify sound plays; absent: picked from the project name.' }, scout_findings: { type: 'string', enum: ['auto', 'backlog'], description: 'auto (default): you decide where a scout finding goes; backlog: every task added with origin_by scout goes to the backlog.' }, tests_with_changes: { type: 'string', enum: ['off', 'ask', 'review'], description: 'A change task that edits code but no test file: ask (default) merges and tells you; review waits for the owner; off does nothing.' }, checker: { type: 'string', enum: ['off', 'on'], description: 'on: a fresh checker tries to break each change before it joins the merge queue, where its tests run; off (default): no checker.' }, mode: { type: 'string', enum: ['paused', 'review', 'auto'] } } },
  },
]

/** Why the stats leave the lead out on a host that can't tell its model calls (features.leadUsage off). */
export const LEAD_USAGE_UNREAD = "the lead's calls can't be read here"

/**
 * The stats report (see statsReport) for range words like "7d" or "T-100..T-130": the board's
 * tasks and the archived ones. Read-only. A bad range gives the usage line. The word "full" in
 * `args` (or `full`) gives the full view with every explanation; else the summary view.
 */
export async function statsText($: Host, args: string, full?: boolean): Promise<string> {
  const words = parseStatsArgs(args)
  const range = parseStatsRange(words.range, S.N.name)
  if (range.kind === 'bad') return range.message
  const b = await load($)
  const file = path(S.N.archiveFile)
  const text = (await $.fs.exists(file).catch(() => false)) ? await $.fs.read(file).catch(() => null) : null
  const r = readArchive(text)
  const archiveProblem = r.broken ? `${S.N.archiveFile} can't be read (${r.broken})` : !r.archive.tasks.length && archivedCount(b) ? `${archivedCount(b)} archived tasks, but ${S.N.archiveFile} holds none` : undefined
  const nowMs = Date.now()
  const team: TeamInput = { ...($.features.leadUsage ? await $.lead.usage(S.root, range, nowMs) : { leadProblem: LEAD_USAGE_UNREAD }), scouts: parseScoutUsage(await $.fs.read(scoutMemoryFile()).catch(() => null)) }
  const usd = (await $.session.usage().catch(() => null))?.cost?.usd
  if (typeof usd === 'number' && Number.isFinite(usd)) team.sessionUsd = usd
  return statsReport({ tasks: b.tasks, archived: r.broken ? [] : r.archive.tasks, archiveProblem, range, nowMs, offsetMin: localOffset(), name: S.N.name, team, full: full ?? words.full })
}

export type In = Record<string, unknown>
export const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
export const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined)

/** Task `id` from the board; throws "<id> is not on the board" if there is none. */
export async function taskOrThrow($: Host, id: string) {
  const t = find(await load($), id)
  if (!t) throw new Error(`${id} is not on the board`)
  return t
}

/** The owner pressed Allow on a waiting task's file request: its files grow and it goes back to work, in one change; the lead hears of it later ("Meanwhile"). */
export async function allowAskedFiles($: Host, id: string): Promise<string> {
  const files = await change($, x => [allowFiles(x, id, now(), S.N.dir), (find(x, id) as BoardTask | undefined)?.asked_files ?? []] as [Board, string[]])
  void pump($)
  noteForLead(`The owner allowed ${files.join(', ')} for ${id}; it went back to work.`)
  return `${id}: files allowed (${files.join(', ')}); back to work`
}

/** The owner pressed Don't allow on a waiting task's file request: it keeps waiting, and the lead is told now (drop it or narrow the plan). */
export async function refuseAskedFiles($: Host, id: string): Promise<string> {
  const files = await change($, x => [refuseFiles(x, id, now()), (find(x, id) as BoardTask | undefined)?.asked_files ?? []] as [Board, string[]])
  tellLead($, filesRefusedText(id, files))
  return `${id}: files not allowed; the lead will drop it or narrow the plan`
}

/** The change tool's reply when `answer` comes for a task that is not waiting (any) more: nothing is changed. */
function alreadyAnsweredText(t: SymccTask, a: In): string {
  const earlier = [...t.history].reverse().find(l => l.text.startsWith('the owner answered: '))?.text
  const quoted = earlier ? `, ${earlier}` : ''
  const others = ['title', 'details', 'add_details', 'files', 'after', 'order', 'needs_review', 'backlog', 'role', 'kind', 'merge_into'].filter(k => a[k] !== undefined)
  const also = others.length ? ` The other changes (${others.join(', ')}) were not made either; send them again without answer.` : ''
  return `${t.id} was already answered (it is ${STATUS_WORD[t.status]} now${quoted}); nothing changed. To add something, use add_details.${also}`
}

/** The checked kind a tool call gives (undefined when not given), read from the kind files again; an unknown one is refused, naming the known kinds. */
async function kindIn($: Host, a: In): Promise<string | undefined> {
  if (a.kind === undefined) return undefined
  return checkKind(await loadKinds($).catch(() => S.kinds), a.kind)
}

/** The lead's tools that act on one task. */
const TASK_TOOLS = ['change', 'approve', 'reject', 'retry', 'ask', 'drop', 'merged', 'pause', 'resume']

/** The roles or kinds tool answered `said`; any action but list may have changed one, so the view is published again. */
async function defChanged($: Host, a: In, said: string): Promise<string> {
  const action = typeof a.action === 'string' ? a.action.trim().toLowerCase() : ''
  if (action && action !== 'list') await publish($, await load($))
  return said
}

export async function runTool($: Host, name: string, a: In): Promise<string> {
  const id = str(a.task) ?? ''
  // A task moved to archive.json is read-only; only retry brings back a dropped one.
  if (id && TASK_TOOLS.includes(name) && !find(await load($), id)) {
    const old = await findArchived($, id)
    if (old) {
      if (name === 'retry' && old.status === 'dropped') {
        const said = await bringBackArchived($, old.id)
        void pump($)
        return said
      }
      throw new Error(name === 'retry' ? `${old.id} is archived and already done` : archivedText(old.id))
    }
  }
  switch (name) {
    case 'question':
      return questionTool($, a)
    case 'board': {
      const b = await load($)
      if (!id) return boardText(b, Date.now(), shortHome(S.root, S.home), S.N.name, undefined, { status: parseStatusFilter(a.status), search: str(a.search), limit: typeof a.limit === 'number' ? a.limit : undefined, sort: a.sort === 'order' || a.sort === 'newest' ? a.sort : undefined, kinds: [...BUILT_IN_KINDS, ...kindNames(S.kinds)] }, S.version)
      const t = find(b, id) ?? (await findArchived($, id))
      if (!t) throw new Error(`${id} is not on the board or in the archive`)
      const archived = !find(b, id)
      return `${archived ? `${t.id} is archived (in ${S.N.archiveFile}; read-only)\n` : ''}${taskText(t, [...workers.values()].some(w => w.task === t.id), b.tasks, await latestReport($, t), b.archived_done)}`
    }
    case 'add': {
      const role = str(a.role)?.trim() ? checkRole(await loadRoles($), str(a.role)!) : undefined
      const kind = await kindIn($, a)
      if (!str(a.why)?.trim()) throw new Error('why is missing: say in one line why this task exists (and fill origin_by, plus request, scout or from_task)')
      const said = { by: a.origin_by, scout: a.scout, task: a.from_task, how: a.how, request: a.request, why: a.why }
      // it merges into the branch checked out now (on a detached checkout, the repo's main branch)
      const merge_into = await homeBranch($)
      let forced = false
      let reviewMode = false
      const [t, all] = await change($, b => {
        reviewMode = modeOf(b) === 'review'
        // check what the lead said first, then add the plugin's own evidence next to it
        const o = makeOrigin(said, now(), b)
        // scout_findings backlog: a scout's finding goes to the backlog, whatever the lead asked
        forced = findingToBacklog(b, a.origin_by) && a.backlog !== true
        const [y, added] = addTask(b, { title: str(a.title) ?? '', details: str(a.details), files: a.files, after: a.after, order: typeof a.order === 'number' ? a.order : undefined, needs_review: a.needs_review === true, backlog: planBacklog(a.backlog === true || forced, S.plan), role, kind, origin: { ...said, evidence: evidenceText(o, heard) }, merge_into }, now(), S.N.dir)
        return [y, [added, y.tasks]] as [Board, [SymccTask, SymccTask[]]]
      })
      // a scout's finding: saved in that scout's latest run that reported, so the run lists it even once archived
      const og = originOf(t)
      if (og?.by === 'scout' && og.scout) await linkTaskToScoutRun($, og.scout, t.id, all)
      // told once, here: a task it waits for on another branch won't have its change in this one
      const notes = crossBranchNotes(t, all).map(n => `\nNote: ${n}.`).join('') + (reviewMode ? REVIEW_ADD_REMINDER : '')
      // plan mode: it went to the backlog; noted, so the lead hears the list when plan mode ends
      if (inPlan(S.plan) && t.status === 'backlog') {
        S.plan = planAdded(S.plan, t.id)
        return planAddText(t.id, t.title) + notes
      }
      void pump($)
      if (forced && t.status === 'backlog') return `scout_findings is backlog: added to the backlog: ${t.id} ${t.title} (it starts only when the owner moves it to todo; still tell the owner what the scout found)${notes}`
      return `added ${t.id} ${t.title}${t.status === 'backlog' ? ' (in the backlog; it starts only when moved to todo)' : ''}${notes}`
    }
    case 'change': {
      const t = await taskOrThrow($, id)
      if (t.status === 'done') throw new Error(`${t.id} is done; add a new task instead`)
      if (mergingNow(t.id)) throw new Error(MERGING_TEXT(t.id))
      // Refused, not saved for later: the lead sees the result of the check first, then changes it.
      if (checkingNow(t.id)) throw new Error(`${CHECKING_TEXT(t.id)}; try again in a moment`)
      // An answer to a running worker's "give it more time?" question: only that, nothing else changes.
      const overtime = str(a.answer)?.trim() && (t as BoardTask).time_ask ? await answerOvertime($, t.id, str(a.answer)!) : undefined
      if (overtime) return overtime
      // An answer to a task that no longer waits (the owner answered on the board first): change nothing at all.
      if (str(a.answer)?.trim() && t.status !== 'waiting') return alreadyAnsweredText(t, a)
      const role = str(a.role)?.trim() ? checkRole(await loadRoles($), str(a.role)!) : undefined
      // A task given the researcher role becomes an investigation, unless kind is given too.
      const kind = (await kindIn($, a)) ?? (role && role !== t.role && isInvestigation(kindFor(undefined, role)) ? kindFor(undefined, role) : undefined)
      // Another branch to merge into: given, or the owner said yes to "branch x is gone: merge into main instead?".
      let into = str(a.merge_into)?.trim()
      if (a.merge_into !== undefined && !(into && (await branchExists($, into)))) {
        const some = (await branchList($)).slice(0, 8)
        throw new Error(`Nothing changed: '${into ?? String(a.merge_into)}' is not a branch in this project. merge_into must be an existing branch${some.length ? `, e.g. ${some.join(', ')}` : ''}.`)
      }
      const both = detailsBothRefusal(a)
      if (both) throw new Error(both)
      // Switching kind never deletes or sneaks in work. To an investigation: refused while its branch or folder
      // holds work from earlier tries (Done would delete it). To a change: an investigation's scratch edits are
      // thrown away (below, once every refusal check has passed and its worker is stopped), so they are never committed.
      // A refused call must leave the folder alone.
      // Only a switch between an investigation and any other kind changes how the task runs.
      const switching = kind !== undefined && isInvestigation(kind) !== isInvestigation(t)
      if (switching && isInvestigation(kind)) {
        const work = await taskWork($, t)
        if (work.commits !== 0 || work.dirty) throw new Error(`Nothing changed: ${t.id} has work from earlier tries on its branch${work.dirty ? ' or in its folder' : ''}; drop it or make a new task for the investigation`)
      }
      const scratchGone = switching && !isInvestigation(kind) ? () => resetScratch($, t.id) : async () => undefined
      // A note from the lead added to the details; the old text stays.
      const note = str(a.add_details)?.trim()
      const noted = note ? addDetailsText(t.details, note, dayOf(Date.now(), localOffset())) : undefined
      const noteHistory = (x: Board): Partial<SymccTask> => (note ? { history: withHistory((find(x, t.id) ?? t).history, now(), ['note', noteAddedLine(note)]) } : {})
      const gone = parseGoneBranch(t.status === 'waiting' ? t.question : null)
      if (!into && gone && saysMergeInstead(str(a.answer) ?? '', gone.instead)) into = gone.instead
      const fields = (): Partial<BoardTask> => {
        const p: Partial<BoardTask> = {}
        if (str(a.title)) p.title = str(a.title)
        if (str(a.details)) p.details = str(a.details)
        if (noted) p.details = noted
        if (list(a.files)) p.files = list(a.files)
        if (list(a.after)) p.after = list(a.after)
        if (typeof a.order === 'number') p.order = a.order
        if (typeof a.needs_review === 'boolean') p.needs_review = a.needs_review
        if (role) p.role = role
        if (kind) p.kind = kind
        if (into) p.merge_into = into
        return p
      }
      if (a.backlog === true) {
        const wasRunning = t.status === 'doing'
        if (t.status !== 'backlog' && !['todo', 'doing', 'paused', 'failed'].includes(t.status)) throw new Error(`${t.id} is ${STATUS_WORD[t.status]}; only a task that is to do, paused or failed can go to the backlog`)
        if (wasRunning) await stopWorker($, t.id, 'moved to the backlog')
        await scratchGone()
        await change($, x => stashTask(patchTask(x, t.id, { ...fields(), ...noteHistory(x), ...endedBy(find(x, t.id), now(), 'stopped', 'moved to the backlog') }, now(), S.N.dir), t.id, now()))
        void pump($)
        return `${t.id} is in the backlog${wasRunning ? ' (its worker was stopped)' : ''}; it starts only when moved to todo`
      }
      if (a.backlog === false) {
        if (t.status !== 'backlog') throw new Error(`${t.id} is not in the backlog (it is ${STATUS_WORD[t.status]})`)
        await scratchGone()
        await change($, x => promoteTask(patchTask(x, t.id, { ...fields(), ...noteHistory(x) }, now(), S.N.dir), t.id, now()))
        void pump($)
        return `${t.id} moved from the backlog to todo`
      }
      if (t.status === 'backlog') {
        await scratchGone()
        await change($, x => patchTask(x, t.id, { ...fields(), ...noteHistory(x) }, now(), S.N.dir))
        return `${t.id} ${note ? 'note added' : 'updated'} (still in the backlog)`
      }
      const flagOnly = typeof a.needs_review === 'boolean' && ['title', 'details', 'add_details', 'files', 'after', 'order', 'role', 'kind', 'answer', 'merge_into'].every(k => a[k] === undefined)
      if (flagOnly) {
        await change($, x => patchTask(x, t.id, { needs_review: a.needs_review as boolean }, now(), S.N.dir))
        return `${t.id} ${a.needs_review ? 'will wait for review before merging' : 'no longer needs its own review'}`
      }
      const wasDoing = t.status === 'doing'
      if (wasDoing) await stopWorker($, t.id, 'the task changed')
      await scratchGone()
      // A paused task stays paused (only resume or retry starts it again); a dropped one stays dropped.
      const keep = t.status === 'dropped' || t.status === 'paused'
      const patch: Partial<BoardTask> = { status: keep ? t.status : 'todo', note: t.status === 'paused' ? t.note : wasDoing ? 'changed; restarting' : 'changed', ...fields() }
      // The owner's answer to a waiting task goes into its details (for the next worker) and its history.
      const answer = str(a.answer)?.trim()
      if (answer) patch.details = `${(patch.details ?? t.details).trimEnd()}\n\nOwner's answer${t.question ? ` to "${t.question}"` : ''}: ${answer}`
      await change($, x => {
        const cur = find(x, t.id) ?? t
        const lines = changeLines(t, patch, wasDoing, answer, note)
        const end = wasDoing ? endedBy(cur, now(), ...stopEnd(changeRestartWhy(changedFields(t, patch)))) : {}
        return patchTask(x, t.id, { ...patch, ...end, ...(lines.length ? { history: withHistory(cur.history, now(), ...lines) } : {}) }, now(), S.N.dir)
      })
      void pump($)
      return `${t.id} ${note ? 'note added' : 'updated'}${wasDoing ? ` (restarting${note ? ' with the note' : ''})` : ''}${t.status === 'paused' ? ` (still paused; ${S.N.name} resume ${t.id} continues it)` : ''}${into ? `; it now merges into ${into}` : ''}`
    }
    case 'retry': {
      const t = await taskOrThrow($, id)
      if (t.status === 'doing') return `${t.id} is already running`
      if (t.status === 'done') return `${t.id} is already done`
      if (mergingNow(t.id)) return MERGING_TEXT(t.id)
      if (checkingNow(t.id)) return `${CHECKING_TEXT(t.id)}; retry it again when that ends`
      // Finished work that waited only for the owner's files: just the merge runs again, no worker.
      if (waitsForFiles(t)) return mergeWaiting($, t.id)
      // Its automatic retries start over; if it last failed on a clash, the new worker merges main first.
      const clashed = t.status === 'failed' && /^conflicts with the latest /.test(t.note ?? '')
      const fromDropped = t.status === 'dropped'
      await change($, x => {
        const cur = find(x, t.id)
        const history = fromDropped && cur ? withHistory(cur.history, now(), ['retried', 'brought back from dropped']) : undefined
        return patchTask(x, t.id, { status: 'todo', note: fromDropped ? 'brought back from dropped; queued' : 'queued', test_tries: 0, merge_main: clashed, ...(history ? { history } : {}) }, now())
      })
      void pump($)
      return fromDropped ? `${t.id} brought back from dropped and queued` : `${t.id} queued${clashed ? '; its new worker merges the latest main first' : ''}`
    }
    case 'ask': {
      const t = await taskOrThrow($, id)
      if (t.status === 'done' || t.status === 'dropped') throw new Error(`${t.id} is ${t.status}; retry it first if it needs more work`)
      if (mergingNow(t.id)) throw new Error(MERGING_TEXT(t.id))
      if (checkingNow(t.id)) stopAsked.set(t.id, 'sent to the owner')
      else if (t.status === 'doing') await stopWorker($, t.id, 'waiting for the owner')
      const asked = t.status === 'doing' && !checkingNow(t.id)
      await change($, x => patchTask(x, t.id, { status: 'waiting', question: (str(a.question) ?? '').slice(0, 1000), note: 'waiting for you', ...(asked ? { history: withHistory((find(x, t.id) ?? t).history, now(), stoppedEntry(t, 'the lead asked the owner a question')) } : {}), ...endedBy(find(x, t.id), now(), 'stopped', 'the lead asked the owner a question') }, now()))
      await haltChecker($, t.id, 'the task was sent to the owner')
      return `${t.id} now waits for the owner`
    }
    case 'drop': {
      const t = await taskOrThrow($, id)
      if (t.status === 'done') throw new Error(`${t.id} is already done`)
      if (mergingNow(t.id)) throw new Error(MERGING_TEXT(t.id))
      // While its work is checked, the check stops before the merge and removes the folder when it ends.
      const checking = checkingNow(t.id)
      if (checking) stopAsked.set(t.id, 'dropped')
      else if (t.status === 'doing') await stopWorker($, t.id, 'dropped')
      await change($, x => patchTask(x, t.id, { status: 'dropped', note: str(a.reason) ?? 'dropped', ...endedBy(find(x, t.id), now(), 'stopped', 'dropped') }, now()))
      if (checking) await haltChecker($, t.id, 'the task was dropped')
      if (!checking) await removeWorktree($, t.id, worktreeDir(t.id)).catch(() => undefined)
      void pump($)
      return checking ? `${t.id} dropped; ${CHECKING_TEXT(t.id)}, so that stops before the merge (if the merge already happened, it stays done)` : `${t.id} dropped`
    }
    case 'merged':
      // the board's button says it is the owner; the lead's tool call is the lead
      return markMerged($, id, a.by === 'the owner' ? 'the owner' : 'the lead')
    case 'pause': {
      const t = await taskOrThrow($, id)
      if (t.status === 'done' || t.status === 'dropped') return `${t.id} is already ${t.status}`
      const reason = str(a.reason)
      const paused = `paused${reason ? `: ${reason}` : ''}`
      const checking = checkingNow(t.id)
      if (checking) {
        stopAsked.set(t.id, 'paused')
        await change($, x => patchTask(x, t.id, { status: 'paused', note: paused, ...endedBy(find(x, t.id), now(), 'stopped', paused) }, now()))
        await haltChecker($, t.id, 'the task was paused')
        return `${t.id} paused; ${CHECKING_TEXT(t.id)}, so that stops before the merge (if the merge already happened, it is done); ${S.N.name} resume ${t.id} continues it`
      }
      const wasDoing = t.status === 'doing'
      if (wasDoing) await stopWorker($, t.id, reason ?? 'the lead paused this task')
      await change($, x => patchTask(x, t.id, { status: 'paused', note: paused, ...(wasDoing ? { history: withHistory((find(x, t.id) ?? t).history, now(), stoppedEntry(t, paused)) } : {}), ...endedBy(find(x, t.id), now(), 'stopped', paused) }, now()))
      void pump($)
      return `${t.id} paused${wasDoing ? ' (its worker was stopped)' : ''}; ${S.N.name} resume ${t.id} continues it`
    }
    case 'resume': {
      const t = await taskOrThrow($, id)
      if (t.status !== 'paused') return `${t.id} is not paused (it is ${t.status})`
      await change($, x => patchTask(x, t.id, { status: 'todo', note: 'resumed', history: withHistory((find(x, t.id) ?? t).history, now(), ['resumed', 'resumed after a pause']) }, now()))
      void pump($)
      return `${t.id} resumed`
    }
    case 'approve':
      return approve($, id, a.keep_note === true)
    case 'reject': {
      const reason = str(a.reason) ?? ''
      const t = await taskOrThrow($, id)
      if (mergingNow(t.id)) throw new Error(MERGING_TEXT(t.id))
      // An answered investigation: Ask more. The reason is the follow-up question; a fresh try gets it and the earlier answer.
      if (isAnswered(t)) {
        const full = await fullAnswer($, t)
        await change($, x => askMoreTask(x, id, reason, full.text, full.file, now()))
        void pump($)
        return `${t.id} asked more: back to "todo"; a fresh try gets the follow-up question and the earlier answer`
      }
      await change($, x => rejectTask(x, id, reason, now()))
      void pump($)
      return `${find(await load($), id)?.id ?? id} rejected: back to "todo"; a fresh worker picks it up with the reason`
    }
    case 'scouts':
      return leadScouts($, a)
    // A change (any action but list) is published, so a board that draws roles and kinds from the view (OpenCode's) shows it.
    case 'roles':
      return defChanged($, a, await leadRoles($, a))
    case 'kinds':
      return defChanged($, a, await leadKinds($, a))
    case 'orgmem':
      return orgMemTool($, a)
    case 'stats':
      return statsText($, str(a.range) ?? '', a.short !== true)
    case 'setup_git':
      return setupGit($, 'the lead')
    case 'settings': {
      if (!SETTING_NAMES.some(k => a[k] !== undefined)) return leadSettingsText(await load($), await playable($), S.root)
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
 * mode or notify is wrong; `mode` is setBoardMode's answer when the mode was set.
 */
export async function saveSettings($: Host, a: SettingsInput, who: string): Promise<{ error?: string; changes: SettingChange[]; mode?: string }> {
  if (a.mode !== undefined && !isMode(a.mode)) return { error: `mode must be "paused", "review" or "auto" (got ${JSON.stringify(a.mode)})`, changes: [] }
  if (a.scout_findings !== undefined && !isScoutFindings(a.scout_findings)) return { error: `scout_findings must be "auto" or "backlog" (got ${JSON.stringify(a.scout_findings)})`, changes: [] }
  if (a.tests_with_changes !== undefined && !isTestsWithChanges(a.tests_with_changes)) return { error: `tests_with_changes must be "off", "ask" or "review" (got ${JSON.stringify(a.tests_with_changes)})`, changes: [] }
  if (a.checker !== undefined && typeof a.checker !== 'boolean' && a.checker !== 'on' && a.checker !== 'off') return { error: `checker must be "off" or "on" (got ${JSON.stringify(a.checker)})`, changes: [] }
  if (a.sound_set !== undefined && !readSoundSet(a.sound_set)) return { error: `sound_set must be 1, 2 or 3 (got ${JSON.stringify(a.sound_set)})`, changes: [] }
  if (a.test_minutes !== undefined && testMinutesRefusal(a.test_minutes)) return { error: testMinutesRefusal(a.test_minutes), changes: [] }
  if (a.notify !== undefined) {
    if (!isNotify(a.notify)) return { error: `notify must be "off", "sound" or "voice" (got ${JSON.stringify(a.notify)})`, changes: [] }
    const refused = notifyRefusal(a.notify, await playable($))
    if (refused) return { error: refused, changes: [] }
  }
  const changes = await change($, b => {
    const r = applySettings(b, a)
    return [r.board, r.changes] as [Board, SettingChange[]]
  })
  const mode = isMode(a.mode) ? await setBoardMode($, a.mode, who) : undefined
  void pump($)
  return { changes, mode }
}

/** The owner changes settings (/<name>-settings or the Settings view): the answer to show, e.g. "max_parallel set to 5"; the lead is told too. */
export async function ownerSettings($: Host, a: SettingsInput, where: string): Promise<string> {
  // the on/off switch is the owner's alone and works like /<name>-disable and /<name>-enable
  if (typeof a.enabled === 'boolean') {
    const { enabled, ...rest } = a
    const said = await setSymcc($, enabled)
    return Object.keys(rest).length ? `${said}; ${await ownerSettings($, rest, where)}` : said
  }
  const r = await saveSettings($, a, 'you')
  if (r.error) return r.error
  // the owner just picked a sound set: play its chime once so they hear it
  const set = r.changes.some(c => c.name === 'sound_set') ? readSoundSet(a.sound_set) : null
  if (set) void playSample($, set)
  const parts = r.changes.map(settingSetText)
  if (r.mode) parts.push(`mode set to ${a.mode}: ${r.mode}`)
  const text = parts.join('; ') || 'nothing changed'
  if (parts.length) noteForLead(`The owner changed the settings: ${brief(text)}`)
  return text
}
