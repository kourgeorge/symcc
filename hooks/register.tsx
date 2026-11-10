// symcc: a shared task board, the main chat as its lead, workers that build tasks in
// parallel in their own Git worktrees and merge what passes the tests, and scouts you
// define in .symcc/scouts/*.md that look for issues on a timer.
//
// How work flows:
//   you ⇄ lead (the main chat)  ──board tools──▶  .symcc/board.json
//   a task is ready  ──▶  worktree + background worker subagent
//   worker done      ──▶  commit · scope check · tests · merge into main  ──▶  the lead is told
//   scout on a timer ──▶  findings  ──▶  the lead is told and decides what goes on the board
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SymccScout, SymccTask, SymccView } from '../types'
import {
  BOARD_FILE,
  addTask,
  boardText,
  newestFirst,
  emptyBoard,
  find,
  outOfScope,
  parseBoard,
  parseScout,
  patchTask,
  ready,
  type Board,
  type ScoutDef,
} from './board'

type $ = EngineInterface

const PANE = 'symcc-board'
/** which task the board panel has open; '' = the list */
const opened = atom({ plugin: 'symcc', key: 'opened' } as const, '')
const view = atom({ plugin: 'symcc', key: 'view' } as const, { tasks: [], working: [], scouts: [], paused: false, test_commands: [] } as SymccView, { shape: 'view-1' })

// ---------------- what this module holds while it is loaded ----------------
// A hot reload starts these over: the board itself is always on disk, and a task
// whose worker was lost to a reload goes back to "todo" at session.start.
let root = ''
const workers = new Map<string, { task: string; worktree: string; branch: string; since: number }>() // agentId → work
const scoutRuns = new Map<string, string>() // agentId → scout name
/** agents symcc has stopped: every tool they try is refused, so they can't change anything and end soon */
const stopped = new Set<string>()
/** failed tasks the lead has already been reminded about (task id → its updated_at then) */
const reminded = new Map<string, string>()
let watchdog: { cancel(): void } | null = null
const scoutState = new Map<string, SymccScout>()
const timers: { cancel(): void }[] = []
const leadQueue: string[] = []
let leadTimer: { cancel(): void } | null = null
let writing: Promise<unknown> = Promise.resolve()

// ---------------- the board on disk ----------------

const now = () => new Date().toISOString()
const path = (rel: string) => `${root}/${rel}`

async function load($: $): Promise<Board> {
  const exists = await $.fs.exists(path(BOARD_FILE))
  return exists ? parseBoard(await $.fs.read(path(BOARD_FILE))) : emptyBoard()
}

/** Every change goes through here, one at a time, so two workers finishing together never lose an update. */
function change<T>($: $, fn: (b: Board) => [Board, T] | Board): Promise<T> {
  const run = writing.then(async () => {
    const before = await load($)
    const out = fn(before)
    const [after, value] = Array.isArray(out) ? out : [out, undefined as T]
    await $.fs.write(path(BOARD_FILE), JSON.stringify(after, null, 2) + '\n')
    await publish($, after)
    return value
  })
  writing = run.catch(() => undefined)
  return run
}

async function publish($: $, b: Board) {
  const working = [...workers.values()].map(w => ({ task: w.task, since: w.since }))
  const v: SymccView = { tasks: b.tasks, working, scouts: [...scoutState.values()], paused: b.paused, test_commands: b.test_commands }
  await update($, view, () => v)
  const count = (s: string) => b.tasks.filter(t => t.status === s).length
  const parts = [count('doing') && `${count('doing')} doing`, count('todo') && `${count('todo')} to do`, count('paused') && `${count('paused')} paused`, count('waiting') && `${count('waiting')} waiting for you`, count('failed') && `${count('failed')} failed`].filter(Boolean)
  $.ui.status(b.tasks.length ? `board: ${parts.join(' · ') || 'all done'}${b.paused ? ' · paused' : ''}` : undefined)
}

// ---------------- telling the lead ----------------
// Workers and scouts report to the main chat as a prompt from this plugin. Several
// reports close together go in one message, sent when the chat is idle.

function tellLead($: $, text: string) {
  leadQueue.push(text)
  if (leadTimer) return
  leadTimer = $.clock.after(1500, () => {
    leadTimer = null
    const body = leadQueue.splice(0).join('\n\n')
    if (!body) return
    void $.prompt.submit({ text: `[symcc] Update from the team:\n\n${body}\n\nDecide what happens next on the board (use the symcc tools), then tell me briefly.` }).catch(() => undefined)
  })
}

// ---------------- git ----------------

async function git($: $, args: string[], cwd = root, timeoutMs = 120_000) {
  return $.process.run(['git', ...args], { cwd, timeoutMs })
}
async function gitOk($: $, args: string[], cwd = root, timeoutMs = 120_000) {
  const r = await git($, args, cwd, timeoutMs)
  if (r.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || r.stdout).trim().slice(0, 300)}`)
  return r.stdout.trim()
}

const worktreeDir = (id: string) => `${root}/.symcc/worktrees/${id}`

async function prepareWorktree($: $, t: SymccTask, target: string) {
  const dir = worktreeDir(t.id)
  const branch = t.branch ?? `symcc/${t.id}`
  if (await $.fs.exists(`${dir}/.git`)) return { dir, branch }
  await git($, ['worktree', 'prune'])
  const has = (await git($, ['rev-parse', '--verify', '-q', `refs/heads/${branch}`])).exitCode === 0
  if (has) await gitOk($, ['worktree', 'add', dir, branch])
  else await gitOk($, ['worktree', 'add', '-b', branch, dir, target])
  return { dir, branch }
}

async function removeWorktree($: $, dir: string) {
  await git($, ['worktree', 'remove', '--force', dir])
  await git($, ['worktree', 'prune'])
}

/** Commit the worker's changes, check scope, bring in the latest main, test, then move main forward. */
async function checkAndMerge($: $, t: SymccTask, dir: string, branch: string, b: Board): Promise<{ ok: boolean; detail: string }> {
  const target = b.target_branch
  await git($, ['add', '-A', '--', '.'], dir)
  await git($, ['-c', 'user.name=symcc', '-c', 'user.email=symcc@localhost', 'commit', '-q', '--no-verify', '-m', `${t.id}: ${t.title}`], dir)
  const main = await gitOk($, ['rev-parse', `refs/heads/${target}`])
  const head = await gitOk($, ['rev-parse', 'HEAD'], dir)
  const base = (await git($, ['merge-base', main, head])).stdout.trim() || main
  const changed = (await gitOk($, ['diff', '--name-only', '--no-renames', `${base}..${head}`])).split('\n').filter(Boolean)
  if (!changed.length) return { ok: false, detail: 'the worker made no change' }
  const bad = outOfScope(changed, t.files)
  if (bad.length) return { ok: false, detail: `changed files outside the task (${bad.slice(0, 5).join(', ')}); allowed: ${t.files.join(', ') || '-'}` }
  let candidate = head
  if ((await git($, ['merge-base', '--is-ancestor', main, head])).exitCode !== 0) {
    const m = await git($, ['-c', 'user.name=symcc', '-c', 'user.email=symcc@localhost', 'merge', '--no-edit', '-m', `${t.id}: bring up to date with ${target}`, main], dir)
    if (m.exitCode !== 0) {
      await git($, ['merge', '--abort'], dir)
      return { ok: false, detail: `conflicts with the latest ${target}` }
    }
    candidate = await gitOk($, ['rev-parse', 'HEAD'], dir)
  }
  for (const cmd of b.test_commands) {
    const r = await $.process.run(['/bin/sh', '-c', cmd], { cwd: dir, timeoutMs: 600_000 }).catch((e: Error) => ({ exitCode: 1, stdout: '', stderr: e.message }))
    if (r.exitCode !== 0) {
      const tail = `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-8).join(' | ').slice(0, 700)
      return { ok: false, detail: `tests failed: \`${cmd}\` (exit ${r.exitCode}). ${tail}` }
    }
  }
  // Move main forward (compare-and-swap). If the person has main checked out, update
  // their files too, but never over uncommitted changes.
  const current = (await git($, ['symbolic-ref', '--short', '-q', 'HEAD'])).stdout.trim()
  if (current === target) {
    const st = (await git($, ['status', '--porcelain', '--untracked-files=no'])).stdout.split('\n').filter(l => l && !l.slice(3).startsWith('.symcc/'))
    if (st.length) return { ok: false, detail: `you have uncommitted changes on ${target}; commit or stash them, then say "retry ${t.id}"` }
  }
  const cas = await git($, ['update-ref', '-m', `symcc ${t.id}`, `refs/heads/${target}`, candidate, main])
  if (cas.exitCode !== 0) return { ok: false, detail: `${target} moved during the merge; try again` }
  if (current === target) await git($, ['read-tree', '-m', '-u', main, candidate])
  return { ok: true, detail: `merged into ${target} (${candidate.slice(0, 8)})${b.test_commands.length ? `; tests passed` : '; no test command set'}` }
}

// ---------------- workers ----------------

const WORKER_PROMPT = (t: SymccTask, b: Board, dir: string) => `You are a symcc worker. Do exactly this one task, then stop.

Work ONLY inside this folder, your own copy of the project on branch ${t.branch ?? `symcc/${t.id}`}:
  ${dir}
Use absolute paths under that folder for every Read, Edit and Write. Never touch the main project folder.

Task ${t.id}: ${t.title}
${t.details}

Files you may change: ${t.files.length ? t.files.join(', ') : 'whatever the task needs'}. Changes anywhere else are thrown away.
${b.test_commands.length ? `After you finish, these must pass (run them in that folder to check): ${b.test_commands.join(' && ')}` : 'There is no test command; keep the change small and correct.'}
Do not run git commit, push or merge: symcc commits, tests and merges your work.
${t.history.length ? `\nEarlier tries:\n${t.history.slice(-5).map(line => `- ${line}`).join('\n')}\nDon't repeat those mistakes.\n` : ''}
When you are done, answer in one or two plain sentences: what you changed. If you truly cannot continue without the owner deciding something, answer with one line starting "QUESTION:" and the question.`

async function pump($: $) {
  const b = await load($)
  if (b.paused) return
  for (const t of ready(b)) {
    if (workers.size >= b.max_parallel) break
    if ([...workers.values()].some(w => w.task === t.id)) continue
    await startWorker($, t.id).catch(async (err: Error) => {
      await change($, x => patchTask(x, t.id, { status: 'failed', note: `couldn't start: ${err.message.slice(0, 200)}` }, now()))
      tellLead($, `${t.id} couldn't start: ${err.message.slice(0, 300)}`)
    })
  }
}

async function startWorker($: $, id: string) {
  const b = await load($)
  const t0 = find(b, id)
  if (!t0) return
  const { dir, branch } = await prepareWorktree($, t0, b.target_branch)
  const t = await change($, x => {
    const cur = find(x, id)!
    const y = patchTask(x, id, { status: 'doing', attempts: cur.attempts + 1, branch, note: 'worker on it' }, now())
    return [y, find(y, id)!]
  })
  const spawned = await $.agent.spawn({ prompt: WORKER_PROMPT(t, b, dir), description: `${t.id} ${t.title}`.slice(0, 60), subagentType: 'symcc:worker', cwd: dir })
  if ('deny' in spawned && spawned.deny) throw new Error(spawned.deny)
  if (!('agentId' in spawned) || !spawned.agentId) throw new Error('the worker did not start')
  workers.set(spawned.agentId, { task: id, worktree: dir, branch, since: Date.now() })
  await publish($, await load($))
}

async function workerFinished($: $, agentId: string, answer: string, aborted: boolean) {
  const w = workers.get(agentId)
  if (!w) return
  workers.delete(agentId)
  const b = await load($)
  const t = find(b, w.task)
  if (!t || t.status !== 'doing') return void pump($) // changed or dropped meanwhile
  const summary = answer.trim().slice(0, 600) || '(no summary)'
  const q = /^\s*QUESTION:\s*(.+)$/im.exec(answer)
  if (aborted) {
    await change($, x => patchTask(x, t.id, { status: 'failed', note: 'the worker was stopped', history: [...t.history, `try ${t.attempts}: stopped before finishing`] }, now()))
    tellLead($, `${t.id} "${t.title}": the worker was stopped before finishing.`)
  } else if (q) {
    await change($, x => patchTask(x, t.id, { status: 'failed', note: `worker asks: ${q[1]!.slice(0, 200)}`, history: [...t.history, `try ${t.attempts}: worker asked: ${q[1]}`] }, now()))
    tellLead($, `${t.id} "${t.title}": the worker stopped with a question: ${q[1]}\nAnswer it yourself and change the task, or ask the owner with symcc ask.`)
  } else {
    await change($, x => patchTask(x, t.id, { note: 'checking and merging' }, now()))
    const r = await checkAndMerge($, t, w.worktree, w.branch, b).catch((e: Error) => ({ ok: false, detail: `checking failed: ${e.message.slice(0, 300)}` }))
    const line = `try ${t.attempts}: ${summary.slice(0, 300)} → ${r.detail}`
    await change($, x => patchTask(x, t.id, { status: r.ok ? 'done' : 'failed', note: r.detail.slice(0, 300), history: [...t.history, line] }, now()))
    if (r.ok) await removeWorktree($, w.worktree)
    tellLead($, r.ok ? `✓ ${t.id} "${t.title}" is merged. Worker: ${summary.slice(0, 300)}` : `✗ ${t.id} "${t.title}" was not merged: ${r.detail}\nWorker said: ${summary.slice(0, 300)}`)
  }
  await pump($)
}

/** Ends an agent's work: from now on every tool it tries is refused, and it is told to stop. */
async function halt($: $, agentId: string, why: string) {
  stopped.add(agentId)
  await $.session.send({ to: { agentId }, text: `Stop now: ${why}. Don't change anything else; answer "stopped" and end.` }).catch(() => undefined)
}

async function stopWorker($: $, taskId: string, why: string) {
  for (const [agentId, w] of [...workers]) {
    if (w.task !== taskId) continue
    workers.delete(agentId)
    await halt($, agentId, why)
  }
  await publish($, await load($))
}

/** Stops every worker and scout and pauses the board. Stopped tasks go back to "todo" and continue after resume. */
async function stopAll($: $, who: string): Promise<string> {
  await change($, b => ({ ...b, paused: true }))
  const ids: string[] = []
  for (const [agentId, w] of [...workers]) {
    workers.delete(agentId)
    ids.push(w.task)
    await halt($, agentId, `${who} stopped all work`)
    await change($, x => patchTask(x, w.task, { status: 'todo', note: `stopped by ${who}; continues after resume` }, now()))
  }
  for (const agentId of [...scoutRuns.keys()]) await halt($, agentId, `${who} stopped all work`)
  scoutRuns.clear()
  for (const s of scoutState.values()) s.running = false
  await publish($, await load($))
  return `${ids.length ? `Stopped ${ids.join(', ')}` : 'No workers were running'}. Nothing new starts until resume.`
}

async function resumeAll($: $): Promise<string> {
  await change($, b => ({ ...b, paused: false }))
  void pump($)
  return 'Resumed: workers start on ready tasks again.'
}

const ENDED = new Set(['completed', 'failed', 'killed'])
const LIVE = new Set(['pending', 'running', 'waiting'])

/**
 * Stops symcc workers and scouts this copy of the plugin doesn't know about. A reload of the
 * plugin forgets which worker belongs to which task while the old workers keep running in the
 * same folders; without this, every reload adds one more worker per running task.
 * Only live agents are messaged: a message to an ended agent would wake it up again.
 */
async function stopOrphans($: $): Promise<number> {
  const agents = await $.agent.list().catch(() => [])
  let n = 0
  for (const a of agents) {
    if (a.type !== 'symcc:worker' && a.type !== 'symcc:scout') continue
    if (workers.has(a.id) || scoutRuns.has(a.id)) continue
    if (ENDED.has(a.status)) continue
    stopped.add(a.id)
    if (LIVE.has(a.status)) await halt($, a.id, 'symcc was reloaded and a new worker took over this task')
    n++
  }
  return n
}

/** The regular check, every two minutes: keeps work moving and makes sure nothing is stuck or forgotten. */
async function check($: $) {
  await stopOrphans($)
  const b = await load($)
  const agents = await $.agent.list().catch(() => undefined)
  const nowMs = Date.now()
  for (const [agentId, w] of [...workers]) {
    const minutes = (nowMs - w.since) / 60_000
    const info = agents?.find(a => a.id === agentId)
    const t = find(b, w.task)
    // Running too long: stop it and let the lead decide.
    if (minutes > b.max_minutes) {
      workers.delete(agentId)
      await halt($, agentId, `it ran longer than ${b.max_minutes} minutes`)
      await change($, x => patchTask(x, w.task, { status: 'failed', note: `stopped: ran over ${b.max_minutes} min`, history: [...(t?.history ?? []), `try ${t?.attempts ?? '?'}: stopped after ${Math.round(minutes)} min (over the limit)`] }, now()))
      tellLead($, `${w.task} "${t?.title ?? ''}": the worker ran over ${b.max_minutes} minutes, so I stopped it. Retry it (symcc start), split it, or drop it. The limit can be changed with symcc settings max_minutes.`)
      continue
    }
    // The worker is gone without saying it finished (crashed, or lost): send the task back to the lead.
    const lost = minutes > 3 && info !== undefined && ENDED.has(info.status)
    if (lost) {
      workers.delete(agentId)
      await change($, x => patchTask(x, w.task, { status: 'failed', note: 'the worker ended without a result', history: [...(t?.history ?? []), `try ${t?.attempts ?? '?'}: the worker ended without a result`] }, now()))
      tellLead($, `${w.task} "${t?.title ?? ''}": the worker ended without a result. Retry it (symcc start), change it, or drop it.`)
    }
  }
  // Failed tasks nobody acted on for 10 minutes: remind the lead once per failure.
  const late = (await load($)).tasks.filter(t => t.status === 'failed' && nowMs - Date.parse(t.updated_at || '') > 10 * 60_000 && reminded.get(t.id) !== t.updated_at)
  for (const t of late) reminded.set(t.id, t.updated_at)
  if (late.length) tellLead($, `Reminder: ${late.map(t => `${t.id} "${t.title}"`).join(', ')} ${late.length > 1 ? 'have' : 'has'} failed and nothing was done about ${late.length > 1 ? 'them' : 'it'}. Retry, change, ask the owner or drop each one.`)
  await pump($)
}

// ---------------- scouts ----------------

async function loadScouts($: $): Promise<ScoutDef[]> {
  const dir = path('.symcc/scouts')
  if (!(await $.fs.exists(dir))) return []
  const out: ScoutDef[] = []
  for (const f of await $.fs.list(dir)) {
    if (f.kind !== 'file' || !f.name.endsWith('.md')) continue
    const s = parseScout(f.name.replace(/\.md$/, ''), await $.fs.read(`${dir}/${f.name}`))
    if (s) out.push(s)
  }
  return out
}

async function runScout($: $, s: ScoutDef) {
  const st = scoutState.get(s.name)
  if (!st || st.running) return
  const b = await load($)
  if (b.paused) return
  st.running = true
  st.last_run = now()
  await publish($, b)
  const open = b.tasks.filter(t => t.status !== 'done' && t.status !== 'dropped').map(t => `${t.id} ${t.title}`).join('\n') || '(none)'
  const prompt = `You are the symcc scout "${s.name}". Read the project in ${root} (read only: never change a file) and look for what your instructions ask.

${s.prompt}

Don't report anything already on the board:
${open}

Answer with at most 3 findings, one per line, as:  - <short title> | <why it matters, with file:line> | <files a fix would touch>
If you find nothing worth doing, answer exactly: NOTHING`
  const spawned = await $.agent.spawn({ prompt, description: `scout: ${s.name}`, subagentType: 'symcc:scout', ...(s.model ? { model: s.model } : {}) }).catch((e: Error) => ({ deny: e.message }))
  const agentId = 'agentId' in spawned ? spawned.agentId : undefined
  if (!agentId) {
    st.running = false
    await publish($, await load($))
    return
  }
  scoutRuns.set(agentId, s.name)
}

async function scoutFinished($: $, agentId: string, answer: string) {
  const name = scoutRuns.get(agentId)!
  scoutRuns.delete(agentId)
  const st = scoutState.get(name)
  if (st) st.running = false
  await publish($, await load($))
  const found = answer.split('\n').filter(l => /^\s*-\s+\S/.test(l)).slice(0, 3)
  if (!found.length || /^\s*NOTHING\s*$/m.test(answer)) return
  tellLead($, `Scout "${name}" found:\n${found.join('\n')}\nAdd the worthwhile ones as tasks (symcc add), or ignore them.`)
}

async function scheduleScouts($: $) {
  for (const t of timers.splice(0)) t.cancel()
  const defs = await loadScouts($)
  for (const k of [...scoutState.keys()]) if (!defs.some(d => d.name === k)) scoutState.delete(k)
  for (const s of defs) {
    scoutState.set(s.name, { name: s.name, every_minutes: s.every_minutes, last_run: scoutState.get(s.name)?.last_run ?? null, running: scoutState.get(s.name)?.running ?? false })
    timers.push($.clock.every(s.every_minutes * 60_000, () => void runScout($, s)))
  }
  return defs
}

// ---------------- the lead's tools ----------------

function taskText(t: SymccTask, running: boolean, all: SymccTask[] = []): string {
  const word: Record<string, string> = { waiting: 'waiting for you', failed: 'failed', doing: 'doing', paused: 'paused', todo: 'to do', done: 'done', dropped: 'dropped' }
  const when = (iso: string) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '?')
  const L = [`${t.id}  [${word[t.status]}]  ${t.title}`, `added ${when(t.created_at)} · changed ${when(t.updated_at)} · tries ${t.attempts}`]
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
  if (t.branch) L.push('', `branch: ${t.branch}`)
  if (running) L.push('', 'A worker is on it now: open it from the agents list to watch.')
  return L.join('\n')
}

const MANUAL: Record<string, string> = {
  overview: `symcc turns this session into a small team.
  • The board (.symcc/board.json) holds the tasks. You and the lead manage it by talking.
  • The lead is this chat. It turns what you want into tasks and decides what happens next.
  • Workers are background agents. Each builds one task in its own copy of the code
    (.symcc/worktrees/T-n). When it finishes, symcc checks the files it changed, runs the
    tests and merges into main only if they pass.
  • Scouts are background agents on a timer. They read the project and suggest work;
    the lead decides whether to add it.
  Topics: /symcc-man commands · tasks · lead · workers · scouts · safety`,
  commands: `Commands
  /board            open the board panel (↑↓ move, Enter opens a task, Esc closes)
  /board T-3        open one task
  /scouts           list scouts and reload their files
  /scouts run NAME  run a scout now
  /stop-all         stop every worker and scout, pause the board
  /resume-all       start work again
  /symcc-man [TOPIC] this manual
In an open task: b back · p pause · u resume · r retry · x drop · w watch the worker.
Everything else, just say to the lead: "pause T-5", "drop T-2", "do T-4 first",
"set the test command to npm test", "give workers 90 minutes".`,
  tasks: `Tasks
  Fields: title, details (what to do and how we know it works), files (what the worker
  may change; empty = anywhere), after (tasks that must be done first), order (lower
  runs first), plus status, note, question, tries, history, branch, when added/changed.
  Statuses:
    to do            waiting for a free worker (and for its "after" tasks)
    doing            a worker is on it
    paused           stopped on purpose; resume to continue
    waiting for you  the lead asked you a question; answer it in the board panel
    failed           tests failed, files outside its list changed, or the worker stopped
    done             merged into main
    dropped          given up
  The board lists the newest task at the top.`,
  lead: `The lead (this chat) has these tools:
  board · add · change · start · ask · drop · stop · resume · stop_all · resume_all · settings
  settings: test_commands (must pass before a merge), max_parallel (workers at once, 1-8),
  max_minutes (a worker running longer is stopped), paused.
  After each worker finishes, the lead gets a "[symcc] Update" message and decides what
  to do next: retry, change, split, ask you, or drop.`,
  workers: `Workers
  • Up to max_parallel run at once (3 by default), one per task.
  • A worker gets only its task, its folder, its allowed files and the test commands.
    It can't see the board or this chat, and must not commit, push or merge.
  • A resumed or retried task starts over with a fresh worker.
  • Every two minutes symcc checks by itself: starts ready tasks, stops a worker running
    longer than max_minutes (45 by default), notices a worker that ended without a result,
    reminds the lead about failed tasks nobody handled, and stops old workers left over
    from a plugin reload.
  • A stopped worker can't do anything more: symcc refuses every tool it tries.`,
  scouts: `Scouts
  A scout is a file .symcc/scouts/NAME.md in the project:
      ---
      every_minutes: 60
      model: sonnet
      ---
      What to look for, in plain words.
  It can only read files. It reports up to 3 findings to the lead, or nothing. Run
  /scouts after adding or deleting a file. Examples: examples/scouts/ in the plugin.`,
  safety: `Safety
  • Changes outside a task's files, or that fail the tests, are never merged.
  • Main only moves by a checked merge; with uncommitted changes on it, symcc waits.
  • Workers can edit files in their own folder without asking. Their shell commands follow
    your normal permission rules (your settings' allow list applies to them too).
  • Test commands are run by symcc itself, without a permission prompt.
  • Add .symcc/ to the project's .gitignore.`,
}

function manual(arg: string): string {
  const key = arg.trim().toLowerCase()
  if (!key) return Object.values(MANUAL).join('\n\n')
  const hit = Object.keys(MANUAL).find(k => k.startsWith(key))
  return hit ? MANUAL[hit]! : `No topic "${arg.trim()}". Topics: ${Object.keys(MANUAL).join(', ')}`
}

const LEAD_GUIDE = `## symcc: you are the lead (main conversation only)
This section is for the main conversation only. If you are a subagent (a symcc worker or scout, or any other), ignore it and do the job you were given.

The project has a shared task board (.symcc/board.json) that you and the owner manage together by talking. You decide how the work runs:
- Turn what the owner wants into tasks with symcc add (title, details = what to build and how we know it works, files = the narrowest files/folders the worker may change incl. tests, after = tasks that must be done first). Keep tasks small; split big wishes.
- Workers start by themselves on ready tasks, each in its own copy of the code. When one finishes, its change is tested and, if it passes, merged into main. You then get a "[symcc] Update" message: decide what's next (retry with symcc change / symcc start, split, symcc ask the owner, or symcc drop).
- When the owner answers a waiting task, put the answer into the task with symcc change (that sends it back to work).
- Set the test command with symcc settings (e.g. ["npm test"]); for a new project pick the stack and test command when you plan the first tasks.
- To stop work: symcc stop pauses one task (its worker is stopped; symcc resume continues it later, with a fresh worker). symcc stop_all stops every worker and scout and pauses the board; symcc resume_all starts work again.
- symcc checks every two minutes on its own: it starts ready tasks, stops a worker that runs longer than max_minutes (symcc settings), and reminds you about failed tasks nobody handled.
- Don't do the tasks' work yourself in the main conversation; let the workers do it. Talk about tasks by ID (T-3). Use symcc board to see the board.`

const TOOLS = [
  { name: 'board', description: 'Show the symcc task board.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'add',
    description: 'Add a task to the symcc board. A worker starts on it when it is ready.',
    inputSchema: { type: 'object', required: ['title', 'details'], properties: { title: { type: 'string' }, details: { type: 'string', description: 'What to build and how we know it works.' }, files: { type: 'array', items: { type: 'string' }, description: 'Files/folders the worker may change, e.g. ["src/search.js", "test/"]. Empty = anywhere.' }, after: { type: 'array', items: { type: 'string' }, description: 'Task IDs that must be done first.' }, order: { type: 'number', description: 'Lower runs first.' } } },
  },
  {
    name: 'change',
    description: 'Rewrite a task. A running task restarts on the new version; a waiting or failed one goes back to work.',
    inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' }, title: { type: 'string' }, details: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, after: { type: 'array', items: { type: 'string' } }, order: { type: 'number' } } },
  },
  { name: 'start', description: 'Put a task (back) to "todo" so a worker picks it up, e.g. to retry.', inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' } } } },
  { name: 'ask', description: 'Make a task wait for the owner with a question.', inputSchema: { type: 'object', required: ['task', 'question'], properties: { task: { type: 'string' }, question: { type: 'string' } } } },
  { name: 'drop', description: 'Stop and drop a task.', inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' }, reason: { type: 'string' } } } },
  { name: 'stop', description: 'Pause one task: its worker (if running) is stopped and no new worker starts on it until symcc resume.', inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' }, reason: { type: 'string' } } } },
  { name: 'resume', description: 'Continue a paused task: it goes back to "todo" and a fresh worker picks it up.', inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' } } } },
  { name: 'stop_all', description: 'Stop every running worker and scout now and pause the board; nothing new starts until symcc resume_all. Stopped tasks go back to "todo".', inputSchema: { type: 'object', properties: {} } },
  { name: 'resume_all', description: 'Unpause the board: workers start on ready tasks again.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'settings',
    description: 'Change how the team works: test_commands (shell commands that must pass before merging), max_parallel (workers at once), max_minutes (a worker running longer is stopped), paused (stop starting new work; running workers go on, use stop_all to stop them too).',
    inputSchema: { type: 'object', properties: { test_commands: { type: 'array', items: { type: 'string' } }, max_parallel: { type: 'number' }, max_minutes: { type: 'number' }, paused: { type: 'boolean' } } },
  },
]

type In = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined)

async function runTool($: $, name: string, a: In): Promise<string> {
  const id = str(a.task) ?? ''
  switch (name) {
    case 'board':
      return boardText(await load($))
    case 'add': {
      const t = await change($, b => addTask(b, { title: str(a.title) ?? '', details: str(a.details), files: a.files, after: a.after, order: typeof a.order === 'number' ? a.order : undefined }, now()))
      void pump($)
      return `added ${t.id} ${t.title}`
    }
    case 'change': {
      const b = await load($)
      const t = find(b, id)
      if (!t) throw new Error(`${id} is not on the board`)
      if (t.status === 'done') throw new Error(`${t.id} is done; add a new task instead`)
      const wasDoing = t.status === 'doing'
      if (wasDoing) await stopWorker($, t.id, 'the task changed')
      const patch: Partial<SymccTask> = { status: t.status === 'dropped' ? 'dropped' : 'todo', note: wasDoing ? 'changed; restarting' : 'changed' }
      if (str(a.title)) patch.title = str(a.title)
      if (str(a.details)) patch.details = str(a.details)
      if (list(a.files)) patch.files = list(a.files)
      if (list(a.after)) patch.after = list(a.after)
      if (typeof a.order === 'number') patch.order = a.order
      await change($, x => patchTask(x, t.id, patch, now()))
      void pump($)
      return `${t.id} updated${wasDoing ? ' (restarting)' : ''}`
    }
    case 'start': {
      const t = find(await load($), id)
      if (!t) throw new Error(`${id} is not on the board`)
      if (t.status === 'doing') return `${t.id} is already running`
      if (t.status === 'done') return `${t.id} is already done`
      await change($, x => patchTask(x, t.id, { status: 'todo', note: 'queued' }, now()))
      void pump($)
      return `${t.id} queued`
    }
    case 'ask': {
      const t = find(await load($), id)
      if (!t) throw new Error(`${id} is not on the board`)
      if (t.status === 'doing') await stopWorker($, t.id, 'waiting for the owner')
      await change($, x => patchTask(x, t.id, { status: 'waiting', question: (str(a.question) ?? '').slice(0, 1000), note: 'waiting for you' }, now()))
      return `${t.id} now waits for the owner`
    }
    case 'drop': {
      const t = find(await load($), id)
      if (!t) throw new Error(`${id} is not on the board`)
      if (t.status === 'done') throw new Error(`${t.id} is already done`)
      if (t.status === 'doing') await stopWorker($, t.id, 'dropped')
      await change($, x => patchTask(x, t.id, { status: 'dropped', note: str(a.reason) ?? 'dropped' }, now()))
      await removeWorktree($, worktreeDir(t.id)).catch(() => undefined)
      void pump($)
      return `${t.id} dropped`
    }
    case 'stop': {
      const t = find(await load($), id)
      if (!t) throw new Error(`${id} is not on the board`)
      if (t.status === 'done' || t.status === 'dropped') return `${t.id} is already ${t.status}`
      const wasDoing = t.status === 'doing'
      if (wasDoing) await stopWorker($, t.id, str(a.reason) ?? 'the lead paused this task')
      await change($, x => patchTask(x, t.id, { status: 'paused', note: `paused${str(a.reason) ? `: ${str(a.reason)}` : ''}` }, now()))
      void pump($)
      return `${t.id} paused${wasDoing ? ' (its worker was stopped)' : ''}; symcc resume ${t.id} continues it`
    }
    case 'resume': {
      const t = find(await load($), id)
      if (!t) throw new Error(`${id} is not on the board`)
      if (t.status !== 'paused') return `${t.id} is not paused (it is ${t.status})`
      await change($, x => patchTask(x, t.id, { status: 'todo', note: 'resumed' }, now()))
      void pump($)
      return `${t.id} resumed`
    }
    case 'stop_all':
      return stopAll($, 'the lead')
    case 'resume_all':
      return resumeAll($)
    case 'settings': {
      const parts: string[] = []
      await change($, b => {
        const y = { ...b }
        if (list(a.test_commands)) ((y.test_commands = list(a.test_commands)!.map(x => x.trim()).filter(Boolean).slice(0, 5)), parts.push(`tests: ${y.test_commands.join(' && ') || 'none'}`))
        if (typeof a.max_parallel === 'number') ((y.max_parallel = Math.max(1, Math.min(8, Math.round(a.max_parallel)))), parts.push(`up to ${y.max_parallel} at once`))
        if (typeof a.max_minutes === 'number') ((y.max_minutes = Math.max(5, Math.min(600, Math.round(a.max_minutes)))), parts.push(`a worker may run ${y.max_minutes} min`))
        if (typeof a.paused === 'boolean') ((y.paused = a.paused), parts.push(a.paused ? 'paused' : 'resumed'))
        return y
      })
      void pump($)
      return parts.join('; ') || 'nothing changed'
    }
  }
  throw new Error(`unknown tool ${name}`)
}

// ---------------- registration ----------------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    root = (await $.session.repo())?.root ?? (await $.session.root())
    // Old workers still running from before a reload are stopped first, so a task never has two.
    const orphans = await stopOrphans($)
    if (orphans) $.ui.toast(`symcc: stopped ${orphans} old worker${orphans > 1 ? 's' : ''} left from a reload`)
    // Workers lost to a restart or reload go back to "todo".
    if (await $.fs.exists(path(BOARD_FILE))) {
      await change($, b => ({ ...b, tasks: b.tasks.map(t => (t.status === 'doing' ? { ...t, status: 'todo' as const, note: 'restarted after Claude Code was reopened' } : t)) }))
    } else await publish($, emptyBoard())
    await $.agent.register({
      name: 'worker',
      description: 'symcc worker: builds one task from the symcc board in its own worktree. Started by symcc only.',
      prompt: 'You are a symcc worker. You get exactly one task and the folder (your own copy of the project) to do it in. Do it there, keep the change small and inside the task\'s files, run the tests you were given, and finish with a one or two sentence summary.',
      tools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'],
      background: true,
      permissionMode: 'acceptEdits',
    })
    await $.agent.register({
      name: 'scout',
      description: 'symcc scout: reads the project and reports problems or improvements. Started by symcc only.',
      prompt: 'You are a symcc scout. You read a project and report a few concrete, evidence-backed problems or improvements, in the format you are given. You never change a file.',
      tools: ['Read', 'Glob', 'Grep'],
      background: true,
    })
    for (const t of TOOLS) await $.tool.register({ ...t, isDeferred: false })
    for (const c of [
      { name: 'board', description: 'Show the symcc task board, or one task in full: /board T-3', argumentHint: '[T-id]' },
      { name: 'scouts', description: 'List symcc scouts, or run one now: /scouts run <name>', argumentHint: '[run <name>]' },
      { name: 'stop-all', description: 'Stop every symcc worker and scout now; nothing new starts until /resume-all' },
      { name: 'resume-all', description: 'Let symcc start work again' },
      { name: 'symcc-man', description: 'Show the symcc manual: how the board, lead, workers and scouts work, and every command', argumentHint: '[topic]' },
    ])
      await $.command.register(c)
    await scheduleScouts($)
    watchdog?.cancel()
    watchdog = $.clock.every(2 * 60_000, () => void check($).catch(() => undefined))
    const b = await load($)
    await publish($, b)
    void pump($)
    return started
  })

  on('session.end', async ($, e, next) => {
    for (const t of timers.splice(0)) t.cancel()
    watchdog?.cancel()
    watchdog = null
    return next(e)
  })

  // The lead's guide, appended to the system prompt.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    return { sections: [...r.sections, { id: 'symcc:lead', text: LEAD_GUIDE, scope: 'session' as const }] }
  })

  // Workers and scouts only reach the agents through symcc itself.
  on('agent.offer', { agent: 'symcc:worker' }, () => ({ isOffered: false }))
  on('agent.offer', { agent: 'symcc:scout' }, () => ({ isOffered: false }))

  for (const t of TOOLS)
    on('tool.call', { tool: `mcp__symcc__${t.name}` }, async ($, e) => {
      try {
        return { result: await runTool($, t.name, e as unknown as In) }
      } catch (err) {
        return { result: `error: ${(err as Error).message}` }
      }
    })

  // A worker or scout symcc stopped can't do anything more: every tool it tries is refused.
  on('tool.call', ($, e, next) => (e.agentId && stopped.has(e.agentId) ? { deny: 'symcc stopped this agent. Do nothing more; answer "stopped" and end.' } : next(e)))

  // A worker's or scout's run ended: its final answer arrives here.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId && workers.has(e.agentId)) void workerFinished($, e.agentId, e.answer, e.isAborted)
    else if (e.agentId && scoutRuns.has(e.agentId)) void scoutFinished($, e.agentId, e.answer)
    return r
  })

  // Editing a scout file reschedules the scouts.
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const r = await next(e)
    if (String((e as { file_path?: string }).file_path ?? '').includes('.symcc/scouts/')) void scheduleScouts($)
    return r
  })

  // /board prints the board; in fullscreen it also opens it as a sidebar beside the chat.
  on('command.run', { command: 'board' }, async ($, e) => {
    const b = await load($)
    const arg = e.args.trim()
    if (arg) {
      const t = find(b, arg)
      if (!t) return { text: `${arg} is not on the board` }
      await update($, opened, () => t.id)
      await $.ui.open({ id: PANE, title: 'Board', focus: true, closeOnEscape: true })
      return { text: taskText(t, [...workers.values()].some(w => w.task === t.id), b.tasks), isTextDisplayOnly: true }
    }
    await update($, opened, () => '')
    await $.ui.open({ id: PANE, title: 'Board', focus: true, closeOnEscape: true })
    return { text: `Board opened: ↑↓ to move, Enter to open a task, Esc to close. (ctrl+x tab goes back to it.)`, isTextDisplayOnly: true }
  })

  // The band above the prompt: the board, always in view inside Claude Code's own screen.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.props.view.agentId) return next(e)
    const v = await read($, view)
    const tasks = v?.tasks ?? []
    if (!tasks.length) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const count = (s: string) => tasks.filter(t => t.status === s).length
    const summary = [
      count('doing') && `${count('doing')} doing`,
      count('todo') && `${count('todo')} to do`,
      count('paused') && `${count('paused')} paused`,
      count('waiting') && `${count('waiting')} waiting for you`,
      count('failed') && `${count('failed')} failed`,
      count('done') && `${count('done')} done`,
    ].filter(Boolean).join(' · ')
    const order = ['waiting', 'failed', 'doing']
    const live = tasks.filter(t => order.includes(t.status)).sort(newestFirst)
    const room = Math.max(1, Math.min(6, (e.props.maxRows ?? 8) - 1))
    const color: Record<string, string> = { waiting: 'yellow', failed: 'red', doing: 'green' }
    const word: Record<string, string> = { waiting: 'waiting for you', failed: 'failed', doing: 'doing' }
    const running = (v?.scouts ?? []).filter(s => s.running).map(s => s.name)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text wrap="truncate">
          <Text bold>Board</Text>
          <Text dimColor>
            {' '}
            {summary}
            {v?.paused ? ' · PAUSED (/resume-all)' : ''}
            {running.length ? ` · scouting: ${running.join(', ')}` : ''}{' '}
          </Text>
          </Text>
          <Button key="open-board" label="open board" dimColor onPress={() => void update($, opened, () => '').then(() => $.ui.open({ id: PANE, title: 'Board', focus: true, closeOnEscape: true }))} />
        </Box>
        {live.slice(0, room).map(t => (
          <Text wrap="truncate">
            <Text color={color[t.status] as never}>
              {t.id} {word[t.status]}
            </Text>
            <Text> {t.title}</Text>
            <Text dimColor>{t.status === 'waiting' ? ` — ${t.question ?? t.note}` : t.note ? ` — ${t.note}` : ''}</Text>
          </Text>
        ))}
        {live.length > room && <Text dimColor>+{live.length - room} more · /board</Text>}
      </Box>
    )
  })

  on('command.run', { command: 'scouts' }, async ($, e) => {
    const defs = await scheduleScouts($)
    const m = /^run\s+(\S+)/.exec(e.args.trim())
    if (m) {
      const s = defs.find(d => d.name === m[1])
      if (!s) return { text: `no scout named ${m[1]} (have: ${defs.map(d => d.name).join(', ') || 'none'})` }
      void runScout($, s)
      return { text: `scout ${s.name} started` }
    }
    if (!defs.length) return { text: 'No scouts yet. Add one as .symcc/scouts/<name>.md:\n---\nevery_minutes: 30\n---\nLook for missing tests around risky code.' }
    return { text: defs.map(d => `${d.name}: every ${d.every_minutes} min${scoutState.get(d.name)?.last_run ? `, last ran ${scoutState.get(d.name)!.last_run!.slice(11, 16)}` : ''}${scoutState.get(d.name)?.running ? ' (running now)' : ''}`).join('\n') }
  })

  on('command.run', { command: 'stop-all' }, async $ => ({ text: await stopAll($, 'you') }))

  on('command.run', { command: 'resume-all' }, async $ => ({ text: await resumeAll($) }))

  on('command.run', { command: 'symcc-man' }, async (_, e) => ({ text: manual(e.args), isTextDisplayOnly: true }))

  // The board panel: the list (each task a button), or one task with its actions.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const v = await read($, view)
    const open = await read($, opened)
    const width = Math.max(20, e.props.bodyColumns ?? 60)
    // Theme colors, so the board reads well in both light and dark themes.
    const color: Record<string, string> = { waiting: 'warning', failed: 'error', doing: 'success', paused: 'permission', todo: 'text', done: 'inactive', dropped: 'inactive' }
    const word: Record<string, string> = { waiting: 'waiting for you', failed: 'failed', doing: 'doing', paused: 'paused', todo: 'to do', done: 'done', dropped: 'dropped' }
    const mark: Record<string, string> = { waiting: '?', failed: '✗', doing: '▶', paused: '‖', todo: '○', done: '✓', dropped: '–' }
    const act = (fn: () => Promise<unknown>) => () => void fn().catch((err: Error) => $.ui.toast(`symcc: ${err.message}`))
    const t = open ? v.tasks.find(x => x.id === open) : undefined
    const C = (c: string) => c as never
    /** Text with task IDs, `code` and file paths picked out in color. */
    const rich = (text: string, base = 'text') => {
      const parts = text.split(/(\bT-\d+\b|`[^`\n]+`|(?:[\w.-]+\/)+[\w.-]+|\b[\w-]+\.(?:md|ts|tsx|js|json|py|txt|csv|yml|yaml)\b)/g)
      return parts.map((p, i) =>
        i % 2 === 0 ? (
          p
        ) : /^T-\d+$/.test(p) ? (
          <Text bold color={C('claude')}>{p}</Text>
        ) : p.startsWith('`') ? (
          <Text color={C('ide')}>{p.slice(1, -1)}</Text>
        ) : (
          <Text color={C('autoAccept')}>{p}</Text>
        ),
      ).map(x => (typeof x === 'string' ? (x ? <Text color={C(base)}>{x}</Text> : null) : x))
    }

    if (t) {
      const agentId = [...workers.entries()].find(([, w]) => w.task === t.id)?.[0]
      const when = (iso: string) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '?')
      const heading = (label: string) => (
        <Text bold color={C('suggestion')}>
          ▍{label}
        </Text>
      )
      // The details, line by line: headings, bullets and numbered steps stand out.
      const paragraphs = (text: string) =>
        text.split(/\n/).map((line, i) => {
          if (!line.trim()) return <Text key={`gap-${i}`}> </Text>
          const head = /^\s*#{1,6}\s+(.*)$/.exec(line)
          if (head) return <Text bold color={C('claude')}>{head[1]}</Text>
          const li = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/.exec(line)
          if (li)
            return (
              <Text>
                {li[1]}
                <Text color={C('claude')}>{/\d/.test(li[2]!) ? li[2] : '•'}</Text> {rich(li[3]!)}
              </Text>
            )
          const kv = /^(\s*)([A-Z][\w ]{1,30}):\s+(.*)$/.exec(line)
          if (kv)
            return (
              <Text>
                {kv[1]}
                <Text bold color={C('text')}>{kv[2]}:</Text> {rich(kv[3]!)}
              </Text>
            )
          return <Text>{rich(line)}</Text>
        })
      // History lines: the try number, then the result colored by how it went.
      const historyLine = (line: string) => {
        const m = /^(try \S+:)\s*(.*)$/.exec(line)
        const body = m ? m[2]! : line
        const [said, result] = body.includes(' → ') ? [body.slice(0, body.lastIndexOf(' → ')), body.slice(body.lastIndexOf(' → ') + 3)] : [body, '']
        const bad = /not merged|fail|stopped|refused|error|outside|without a result/i.test(result || body)
        const good = /merged into|^merged/i.test(result)
        return (
          <Text>
            <Text color={C(bad ? 'error' : good ? 'success' : 'subtle')}>{bad ? '✗' : good ? '✓' : '•'}</Text>{' '}
            {m && <Text bold color={C('subtle')}>{m[1]} </Text>}
            <Text color={C('subtle')}>{said}</Text>
            {result && (
              <Text color={C(bad ? 'error' : good ? 'success' : 'text')}>
                {' '}→ {result}
              </Text>
            )}
          </Text>
        )
      }
      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text>
              <Text bold color={C('claude')}>{t.id}</Text>{' '}
              <Text color={C(color[t.status]!)} bold>
                {mark[t.status]} {word[t.status]}
              </Text>
              <Text color={C('subtle')}>
                {' '}· added {when(t.created_at)} · changed {when(t.updated_at)} · tries{' '}
              </Text>
              <Text color={C(t.attempts > 2 ? 'warning' : 'subtle')}>{t.attempts}</Text>
            </Text>
            <Text bold color={C('text')}>
              {t.title}
            </Text>
            {t.note && (
              <Text>
                <Text color={C(color[t.status]!)}>now: </Text>
                <Text italic color={C('subtle')}>{t.note}</Text>
              </Text>
            )}
          </Box>

          <Box flexDirection="row" gap={1}>
            <Button key="back" label="Back" hotkey="b" autoFocus={t.status === 'waiting' ? undefined : true} onPress={act(() => update($, opened, () => ''))} />
            {agentId && <Button key="watch" label="Watch worker" hotkey="w" onPress={act(() => $.ui.view({ agentId }))} />}
            {(t.status === 'doing' || t.status === 'todo') && (
              <Button key="pause" label="Pause" hotkey="p" onPress={act(async () => (await runTool($, 'stop', { task: t.id, reason: 'paused by the owner' }), tellLead($, `The owner paused ${t.id} from the board.`)))} />
            )}
            {t.status === 'paused' && (
              <Button key="resume" label="Resume" hotkey="u" onPress={act(async () => (await runTool($, 'resume', { task: t.id }), tellLead($, `The owner resumed ${t.id} from the board.`)))} />
            )}
            {(t.status === 'failed' || t.status === 'dropped') && (
              <Button key="retry" label="Retry" hotkey="r" onPress={act(async () => (await runTool($, 'start', { task: t.id }), tellLead($, `The owner retried ${t.id} from the board.`)))} />
            )}
            {t.status !== 'done' && t.status !== 'dropped' && (
              <Button key="drop" label="Drop" hotkey="x" onPress={act(async () => (await runTool($, 'drop', { task: t.id, reason: 'dropped by the owner' }), tellLead($, `The owner dropped ${t.id} from the board.`)))} />
            )}
          </Box>

          {t.status === 'waiting' && (
            <Box flexDirection="column" borderStyle="round" borderColor={C('warning')} paddingX={1}>
              <Text>
                <Text bold color={C('warning')}>asks: </Text>
                <Text color={C('text')}>{t.question ?? '(no question)'}</Text>
              </Text>
              <Input
                key="answer"
                label="Your answer: "
                placeholder="type and press Enter"
                autoFocus
                onSubmit={value =>
                  act(async () => {
                    if (!value.trim()) return
                    await runTool($, 'change', { task: t.id, details: `${t.details}\n\nOwner's answer to "${t.question ?? ''}": ${value.trim()}` })
                    tellLead($, `The owner answered ${t.id} on the board: "${value.trim()}". I put it into the task and sent it back to work.`)
                  })()
                }
              />
            </Box>
          )}

          <Box flexDirection="column">
            {heading('What to do')}
            {t.details.trim() ? paragraphs(t.details) : <Text color={C('subtle')}>(no details)</Text>}
          </Box>

          <Box flexDirection="column">
            {heading('May change')}
            {t.files.length ? (
              t.files.map(f => (
                <Text>
                  {'  '}
                  <Text color={C('autoAccept')}>{f}</Text>
                </Text>
              ))
            ) : (
              <Text color={C('subtle')}>  anywhere in the project</Text>
            )}
          </Box>

          {t.after.length > 0 && (
            <Box flexDirection="column">
              {heading('Waits for')}
              {t.after.map(id => {
                const dep = v.tasks.find(x => x.id === id)
                return (
                  <Text>
                    {'  '}
                    <Text bold color={C('claude')}>{id}</Text>{' '}
                    <Text color={C(dep ? color[dep.status]! : 'error')}>{dep ? `${mark[dep.status]} ${word[dep.status]}` : 'missing'}</Text>
                    {dep ? <Text color={C('subtle')}> · {dep.title}</Text> : null}
                  </Text>
                )
              })}
            </Box>
          )}

          {t.history.length > 0 && (
            <Box flexDirection="column">
              {heading(`What happened (${t.history.length}, newest first)`)}
              {[...t.history].reverse().map(historyLine)}
            </Box>
          )}

          {t.branch && (
            <Text>
              <Text color={C('subtle')}>branch: </Text>
              <Text color={C('ide')}>{t.branch}</Text>
            </Text>
          )}
          <Text color={C('subtle')}>↑↓ scroll · b back{agentId ? ' · w watch worker' : ''}</Text>
        </Box>
      )
    }

    const rows = [...v.tasks].sort(newestFirst)
    const count = (st: string) => v.tasks.filter(x => x.status === st).length
    const tally = (['doing', 'waiting', 'failed', 'paused', 'todo', 'done'] as const).filter(st => count(st) > 0)
    const idWidth = Math.max(4, ...rows.map(x => x.id.length))
    const wordWidth = Math.max(...rows.map(x => word[x.status]!.length), 5)
    return (
      <Box flexDirection="column">
        <Text wrap="truncate">
          {v.paused && <Text bold color={C('warning')}>PAUSED · </Text>}
          {tally.map((st, i) => (
            <Text>
              {i ? <Text color={C('subtle')}> · </Text> : null}
              <Text color={C(color[st]!)}>
                {count(st)} {word[st]}
              </Text>
            </Text>
          ))}
        </Text>
        <Text wrap="truncate">
          <Text color={C('subtle')}>tests: </Text>
          <Text color={C(v.test_commands.length ? 'ide' : 'warning')}>{v.test_commands.join(' && ') || 'none set'}</Text>
          <Text color={C('subtle')}> · Enter opens a task · Esc closes</Text>
        </Text>
        {rows.length === 0 && <Text color={C('subtle')}>The board is empty. Tell the lead what you want.</Text>}
        {rows.map((x, i) => {
          const closed = x.status === 'done' || x.status === 'dropped'
          const extra = x.status === 'waiting' ? x.question ?? '' : x.note
          return (
            <Button key={x.id} autoFocus={i === 0 ? true : undefined} onPress={act(() => update($, opened, () => x.id))}>
              <Text bold={!closed} color={C(closed ? 'inactive' : 'claude')}>
                {x.id.padEnd(idWidth)}
              </Text>
              <Text color={C(color[x.status]!)}>
                {' '}
                {mark[x.status]} {word[x.status]!.padEnd(wordWidth)}
              </Text>
              <Text bold={x.status === 'waiting' || x.status === 'failed'} color={C(closed ? 'inactive' : 'text')}>
                {' '}
                {x.title.slice(0, Math.max(10, width - idWidth - wordWidth - 8))}
              </Text>
              {extra ? <Text color={C(x.status === 'waiting' ? 'warning' : x.status === 'failed' ? 'error' : 'subtle')}> — {extra}</Text> : null}
            </Button>
          )
        })}
        {v.scouts.length > 0 && (
          <Text wrap="truncate">
            <Text color={C('subtle')}>scouts: </Text>
            {v.scouts.map((sc, i) => (
              <Text>
                {i ? <Text color={C('subtle')}>, </Text> : null}
                <Text color={C(sc.running ? 'success' : 'text')}>{sc.name}</Text>
                {sc.running ? <Text color={C('success')}> (running)</Text> : null}
              </Text>
            ))}
            <Text color={C('subtle')}> · /scouts run &lt;name&gt;</Text>
          </Text>
        )}
      </Box>
    )
  })
}
